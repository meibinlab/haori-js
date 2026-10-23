/* @vitest-environment jsdom */
/**
 * @fileoverview 描画のキューが、次のフレームを待たずに次のタスクで処理を始めること。
 *
 * 期待値の根拠は仕様「7. Queue (queue.ts)」の「**処理は次のフレームを待たず、次の
 * タスクで始めます。**」と、同じ節の箇条書き。次のフレームが来ない状況（背面の
 * タブ）は、`requestAnimationFrame` を呼び出しても実行しない形に差し替えて作る。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

/**
 * キューのモジュールを読み込み直します（キューの通知路はモジュールごとに作られます）。
 *
 * @returns キュー
 */
async function loadQueue(): Promise<typeof import('../src/queue').default> {
  vi.resetModules();
  return (await import('../src/queue')).default;
}

describe('描画のキューの処理の始め方', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 0),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('次のフレームが来なくても処理が進む', async () => {
    // 仕様「7. Queue (queue.ts)」の「**背面のタブでも処理は進みます。**」
    const Queue = await loadQueue();

    await expect(Queue.enqueue(() => 'done')).resolves.toBe('done');
  });

  it('積んだその場では実行せず、次のタスクで実行する', async () => {
    // 仕様「7. Queue (queue.ts)」の「**処理は次のフレームを待たず、次のタスクで始めます。**」
    const Queue = await loadQueue();
    const task = vi.fn();

    const done = Queue.enqueue(task);
    expect(task).not.toHaveBeenCalled();
    await done;
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('次のタスクへの受け渡しに MessageChannel を 1 つだけ作って使い回す', async () => {
    // 仕様「7. Queue (queue.ts)」の「`MessageChannel` は最初に処理を積んだときに 1 つだけ作り、使い回します。読み込んだだけでは作りません」
    const Real = MessageChannel;
    const created: MessageChannel[] = [];
    let posted = 0;
    vi.stubGlobal(
      'MessageChannel',
      class extends Real {
        constructor() {
          super();
          created.push(this);
          const post = this.port2.postMessage.bind(this.port2);
          this.port2.postMessage = (message: unknown) => {
            posted += 1;
            post(message);
          };
        }
      },
    );
    const Queue = await loadQueue();
    expect(created).toHaveLength(0);

    await Queue.enqueue(() => undefined);
    await Queue.enqueue(() => undefined);
    expect(created).toHaveLength(1);
    expect(posted).toBeGreaterThan(0);
  });

  it('MessageChannel の無い環境でも処理が進む', async () => {
    // 仕様「7. Queue (queue.ts)」の「`MessageChannel` の無い環境では `setTimeout(0)` を使います」
    vi.stubGlobal('MessageChannel', undefined);
    const Queue = await loadQueue();

    await expect(Queue.enqueue(() => 'done')).resolves.toBe('done');
  });
});
