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
interface QueueItem<T> {
  /** 実行する処理 */
  task: () => Promise<T>;

  /** 作成時刻 */
  timestamp: number;

  /** 完了Promise */
  promise: Promise<T>;

  /** Promise解決用の関数 */
  resolve: (value: T | PromiseLike<T>) => void;

  /** Promise拒否用の関数 */
  reject: (reason?: unknown) => void;
}

/**
 * 非同期キュークラス。
 * キュー内の処理を管理し、順次実行します。
 */
class AsyncQueue<T> {
  /** キュー内の処理 */
  private readonly queue: QueueItem<T>[] = [];

  /** 処理中フラグ */
  private processing = false;

  /** キューのバッチサイズ */
  private batchSize: number = 10;

  /**
   * 処理をキューに追加します
   *
   * @param task 実行する処理
   * @returns 処理完了Promise
   */
  public enqueue(task: () => Promise<T>): Promise<T> {
    let resolve: (value: T | PromiseLike<T>) => void;
    let reject: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const item: QueueItem<T> = {
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
   * キューのバッチサイズを設定します。
   *
   * @param size 新しいバッチサイズ
   */
  setBatchSize(size: number): void {
    if (size <= 0) {
      Log.error('[Haori]', 'Batch size must be greater than 0');
      return;
    }
    this.batchSize = size;
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
      const batch = this.queue.splice(0, this.batchSize);
      const results = await Promise.allSettled(
        batch.map(item => this.executeTask(item))
      );

      // 失敗したタスクをログ出力
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          Log.error(
            '[Haori]',
            `Batch processing error for task ${batch[index].timestamp}:`,
            result.reason
          );
        }
      });

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
      requestAnimationFrame(() => this.processQueue());
    } else {
      setTimeout(() => this.processQueue(), 16); // 60fps
    }
  }

  /**
   * タスクを実行します。
   *
   * @param item 実行するキューアイテム
   * @returns 処理完了Promise
   */
  private async executeTask(item: QueueItem<T>): Promise<void> {
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
  private static asyncQueue = new AsyncQueue<unknown>();

  /**
   * タスクをキューに追加します。
   *
   * @param task 実行する処理
   * @returns 処理完了Promise
   */
  public static enqueue<T>(task: () => Promise<T>): Promise<T> {
    return this.asyncQueue.enqueue(
      task as () => Promise<unknown>
    ) as Promise<T>;
  }

  /**
   * キューのバッチサイズを設定します。
   *
   * @param size 新しいバッチサイズ
   */
  public static setBatchSize(size: number): void {
    this.asyncQueue.setBatchSize(size);
  }
}
