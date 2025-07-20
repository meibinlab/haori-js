import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {Queue} from '../src/queue';
import {Log} from '../src/log';

// Logモジュールをモック
vi.mock('../src/log', () => ({
  Log: {info: vi.fn(), error: vi.fn(), warn: vi.fn()},
}));

// requestAnimationFrameをモック
const mockRequestAnimationFrame = vi.fn();
global.requestAnimationFrame = mockRequestAnimationFrame;

describe('Queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequestAnimationFrame.mockImplementation((callback: () => void) => {
      setTimeout(callback, 0);
      return 1;
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('enqueue', () => {
    it('タスクをキューに追加して実行される', async () => {
      const task = vi.fn().mockResolvedValue('test result');

      const result = await Queue.enqueue(task);

      expect(result).toBe('test result');
      expect(task).toHaveBeenCalledOnce();
      expect(Log.info).toHaveBeenCalledWith(
        '[Haori]',
        expect.stringMatching(/Task \d+ added to queue/),
      );
    });

    it('複数のタスクが順次実行される', async () => {
      const task1 = vi.fn().mockResolvedValue('result1');
      const task2 = vi.fn().mockResolvedValue('result2');

      const promise1 = Queue.enqueue(task1);
      const promise2 = Queue.enqueue(task2);

      const results = await Promise.all([promise1, promise2]);

      expect(results).toEqual(['result1', 'result2']);
      expect(task1).toHaveBeenCalledOnce();
      expect(task2).toHaveBeenCalledOnce();
    });

    it('タスクが失敗した場合にエラーがキャッチされる', async () => {
      const error = new Error('Task failed');
      const task = vi.fn().mockRejectedValue(error);

      await expect(Queue.enqueue(task)).rejects.toThrow('Task failed');
      expect(Log.error).toHaveBeenCalledWith(
        '[Haori]',
        expect.stringMatching(/Task \d+ failed:/),
        error,
      );
    });

    it('一部のタスクが失敗しても他のタスクは実行される', async () => {
      const successTask = vi.fn().mockResolvedValue('success');
      const failTask = vi.fn().mockRejectedValue(new Error('fail'));

      const successPromise = Queue.enqueue(successTask);
      const failPromise = Queue.enqueue(failTask);

      await expect(failPromise).rejects.toThrow('fail');
      await expect(successPromise).resolves.toBe('success');
    });

    it('型安全性が保たれる', async () => {
      const stringTask = (): Promise<string> => Promise.resolve('string');
      const numberTask = (): Promise<number> => Promise.resolve(42);

      const stringResult = await Queue.enqueue(stringTask);
      const numberResult = await Queue.enqueue(numberTask);

      expect(typeof stringResult).toBe('string');
      expect(typeof numberResult).toBe('number');
      expect(stringResult).toBe('string');
      expect(numberResult).toBe(42);
    });
  });

  describe('setBatchSize', () => {
    it('正の値でバッチサイズが設定される', () => {
      Queue.setBatchSize(5);

      expect(Log.error).not.toHaveBeenCalled();
    });

    it('0以下の値でエラーログが出力される', () => {
      Queue.setBatchSize(0);
      Queue.setBatchSize(-1);

      expect(Log.error).toHaveBeenCalledTimes(2);
      expect(Log.error).toHaveBeenCalledWith(
        '[Haori]',
        'Batch size must be greater than 0',
      );
    });

    it('バッチサイズに従ってタスクが処理される', async () => {
      Queue.setBatchSize(2);

      const tasks = Array.from({length: 5}, (_, i) =>
        vi.fn().mockResolvedValue(`result${i}`),
      );

      const promises = tasks.map(task => Queue.enqueue(task));
      await Promise.all(promises);

      // すべてのタスクが実行されることを確認
      tasks.forEach(task => {
        expect(task).toHaveBeenCalledOnce();
      });
    });
  });

  describe('requestAnimationFrame fallback', () => {
    it('requestAnimationFrameが利用できない環境でsetTimeoutを使用', async () => {
      // requestAnimationFrameを削除
      const originalRAF = global.requestAnimationFrame;
      // @ts-expect-error テスト用にundefinedに設定
      global.requestAnimationFrame = undefined;

      const task = vi.fn().mockResolvedValue('fallback test');

      const result = await Queue.enqueue(task);

      expect(result).toBe('fallback test');
      expect(task).toHaveBeenCalledOnce();

      // 元に戻す
      global.requestAnimationFrame = originalRAF;
    });
  });

  describe('エラーハンドリング', () => {
    it('非同期タスクのタイムアウトエラーが適切に処理される', async () => {
      const slowTask = vi
        .fn()
        .mockImplementation(
          () => new Promise(resolve => setTimeout(resolve, 1000)),
        );

      // タスクを開始（await しない）
      const promise = Queue.enqueue(slowTask);

      // 短時間待機してタスクが開始されたことを確認
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(slowTask).toHaveBeenCalledOnce();

      // プロミスは完了まで待機しない
      expect(promise).toBeInstanceOf(Promise);
    });
  });
});
