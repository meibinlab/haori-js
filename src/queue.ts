/**
 * @fileoverview 汎用非同期キュー機能
 *
 * 任意の処理を非同期でキューイングし、requestAnimationFrameを使用して順次実行します。
 * 各処理はPromiseを返し、完了時の処理を記述できます。
 * DOM操作などの非同期処理に適しています。
 */

import Log from './log';

/**
 * キューアイテムの基本構造。
 */
interface QueueItem {
  /** 実行する処理 */
  task: () => unknown | Promise<unknown>;

  /** 作成時刻 */
  timestamp: number;

  /** 完了Promise */
  promise: Promise<unknown>;

  /** Promise解決用の関数 */
  resolve: (value: unknown | PromiseLike<unknown>) => void;

  /** Promise拒否用の関数 */
  reject: (reason?: unknown) => void;
}

/**
 * 非同期キュークラス。
 * キュー内の処理を管理し、順次実行します。
 */
class AsyncQueue {
  private readonly MAX_BUDGET = 8; // 1フレームあたりの最大処理時間（ms）

  /** キュー内の処理 */
  private readonly queue: QueueItem[] = [];

  /** 処理中フラグ */
  private processing = false;

  /**
   * 処理をキューに追加します
   *
   * @param task 実行する処理
   * @param prepend trueの場合はキューの先頭に追加、falseの場合は末尾に追加
   * @returns 処理完了Promise
   */
  public enqueue(
    task: () => unknown,
    prepend: boolean = false,
  ): Promise<unknown> {
    let resolve: (value: unknown | PromiseLike<unknown>) => void;
    let reject: (reason?: unknown) => void;
    const promise = new Promise<unknown>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const item: QueueItem = {
      task,
      timestamp: performance.now(),
      promise,
      resolve: resolve!,
      reject: reject!,
    };
    if (prepend) {
      this.queue.unshift(item);
    } else {
      this.queue.push(item);
    }
    this.scheduleProcessing();
    return promise;
  }

  /**
   * キューを処理します。
   *
   * @returns 処理完了Promise
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    this.processing = true;
    try {
      const start = performance.now();
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        if (!item) {
          return;
        }
        try {
          const result = await item.task();
          item.resolve(result);
        } catch (error) {
          item.reject(error);
          Log.error('[Haori]', `Task ${item.timestamp} failed:`, error);
        }
        if (performance.now() - start > this.MAX_BUDGET) {
          // 1フレームの処理時間を超えたら一旦終了
          break;
        }
      }
    } catch (error) {
      Log.error('[Haori]', 'Error processing queue:', error);
    } finally {
      this.processing = false;
      if (this.queue.length > 0) {
        this.scheduleProcessing();
      }
    }
  }

  /**
   * 処理をスケジュールします。
   */
  private scheduleProcessing(): void {
    if (this.processing) {
      return;
    }
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        this.processQueue();
      });
    } else {
      setTimeout(() => {
        this.processQueue();
      }, 16); // 60fps
    }
  }

  /**
   * キューが空になるまで待機します。
   *
   * @returns キューが空になったら解決されるPromise
   */
  public async wait(): Promise<void> {
    if (this.queue.length === 0 && !this.processing) {
      return;
    }
    const promises = this.queue.map(item => item.promise);
    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }
}

/**
 * 非同期キューのデフォルトインスタンス。
 * このインスタンスを使用して、アプリケーション全体でタスクをキューイングできます。
 */
export default class Queue {
  /** 非同期キューインスタンス */
  private static readonly ASYNC_QUEUE = new AsyncQueue();

  /**
   * タスクをキューに追加します。
   *
   * @param task 実行する処理
   * @param prepend trueの場合はキューの先頭に追加、falseの場合は末尾に追加
   * @returns 処理完了Promise
   */
  public static enqueue(
    task: () => unknown,
    prepend: boolean = false,
  ): Promise<unknown> {
    return this.ASYNC_QUEUE.enqueue(task, prepend);
  }

  /**
   * 全てのキュー処理が完了するまで待機します。
   */
  public static wait(): Promise<void> {
    return this.ASYNC_QUEUE.wait();
  }
}
