/**
 * @fileoverview 汎用非同期キュー機能
 *
 * 任意の処理を非同期でキューイングし、requestAnimationFrameを使用して順次実行します。
 * 各処理はPromiseを返し、完了時の処理を記述できます。
 * DOM操作などの非同期処理に適しています。
 */

import {Log} from './log';

/**
 * キューアイテムの基本構造。
 */
interface QueueItem {
  /** 実行する処理 */
  task: () => void;

  /** 作成時刻 */
  timestamp: number;

  /** 完了Promise */
  promise: Promise<void>;

  /** Promise解決用の関数 */
  resolve: (value: void | PromiseLike<void>) => void;

  /** Promise拒否用の関数 */
  reject: (reason?: unknown) => void;
}

/**
 * 非同期キュークラス。
 * キュー内の処理を管理し、順次実行します。
 */
class AsyncQueue {
  /** キュー内の処理 */
  private readonly queue: QueueItem[] = [];

  /** 処理中フラグ */
  private processing = false;

  /**
   * 処理をキューに追加します
   *
   * @param task 実行する処理
   * @returns 処理完了Promise
   */
  public enqueue(task: () => void): Promise<void> {
    let resolve: (value: void | PromiseLike<void>) => void;
    let reject: (reason?: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const item: QueueItem = {
      task,
      timestamp: Date.now(),
      promise,
      resolve: resolve!,
      reject: reject!,
    };
    this.queue.push(item);
    Log.info('[Haori]', `Task ${item.timestamp} added to queue`);
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
      const item = this.queue.shift();
      await this.executeTask(item!);
      if (this.queue.length > 0) {
        this.scheduleProcessing();
      }
    } catch (error) {
      Log.error('[Haori]', 'Error processing queue:', error);
    } finally {
      this.processing = false;
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
        this.processQueue().catch(error => {
          Log.error('[Haori]', 'Error scheduling processing:', error);
        });
      });
    } else {
      setTimeout(() => {
        this.processQueue().catch(error => {
          Log.error('[Haori]', 'Error scheduling processing:', error);
        });
      }, 16); // 60fps
    }
  }

  /**
   * タスクを実行します。
   *
   * @param item 実行するキューアイテム
   * @returns 処理完了Promise
   */
  private async executeTask(item: QueueItem): Promise<void> {
    try {
      const result = await item.task();
      item.resolve(result);
      Log.info('[Haori]', `Task ${item.timestamp} completed successfully`);
    } catch (error) {
      item.reject(error);
      Log.error('[Haori]', `Task ${item.timestamp} failed:`, error);
    }
  }
}

/**
 * 非同期キューのデフォルトインスタンス。
 * このインスタンスを使用して、アプリケーション全体でタスクをキューイングできます。
 */
export class Queue {
  /** 非同期キューインスタンス */
  private static readonly ASYNC_QUEUE = new AsyncQueue();

  /**
   * タスクをキューに追加します。
   *
   * @param task 実行する処理
   * @returns 処理完了Promise
   */
  public static enqueue(task: () => void): Promise<void> {
    return this.ASYNC_QUEUE.enqueue(task);
  }
}
