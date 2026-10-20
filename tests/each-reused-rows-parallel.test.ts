/* @vitest-environment jsdom */
/**
 * @fileoverview 差分更新で、そのまま使う既存の行の再評価を 1 行ずつ待たずに行うこと。
 *
 * 期待値は仕様「data-each の差分更新アルゴリズム」の次の記述から取っている。
 *
 * - 「そのまま使う既存の行の再評価（`data-form-list` の入力欄への反映を含む）は、
 *   行ごとに完結しているため、ほかの行の処理を待たずに始めます」
 * - 「`haori:eachupdate` は、既存の行の再評価も含めてすべて終えてから発火します」
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Queue from '../src/queue';
import {waitForIdle} from './helpers/async';

describe('差分更新での既存の行の再評価', () => {
  let container: HTMLElement;

  beforeEach(async () => {
    vi.restoreAllMocks();
    await import('../src/observer');
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    container.remove();
  });

  /** 行の外（`title`）を参照する一覧。既存の行も再評価の対象になる。 */
  const LIST =
    '<div id="root"><div id="list" data-each="nodes" data-each-arg="n" data-each-key="id">' +
    '<p class="row">{{n.label}}:{{title}}</p></div></div>';

  /**
   * ノードの一覧を作ります。
   *
   * @param count ノードの数
   * @returns ノードの配列
   */
  function nodes(count: number): Array<{id: string; label: string}> {
    return Array.from({length: count}, (_, i) => ({
      id: `n${i}`,
      label: `ノード${i}`,
    }));
  }

  /** 描画のキューの内部（処理したフレームを数えるために使う）。 */
  interface QueueInternals {
    processing: boolean;
    queue: unknown[];
    processQueue: () => Promise<void>;
  }

  /**
   * 一覧を描き、末尾に 1 件足す更新が終わるまでに、描画のキューがフレームごとに
   * まとめて処理した回数を返します。
   *
   * @param count 既存の行の数
   * @returns 処理したフレームの数
   */
  async function countFramesForAppend(count: number): Promise<number> {
    container.innerHTML = LIST;
    await Core.scan(container);
    await waitForIdle();
    const root = container.querySelector('#root') as HTMLElement;
    const data = {nodes: nodes(count), title: '題'};
    await Core.setBindingData(root, data);
    await waitForIdle();

    const internals = (Queue as unknown as {ASYNC_QUEUE: QueueInternals})
      .ASYNC_QUEUE;
    const original = internals.processQueue;
    let frames = 0;
    internals.processQueue = function countFrames(this: QueueInternals) {
      if (!this.processing && this.queue.length > 0) {
        frames++;
      }
      return original.call(this);
    };
    try {
      await Core.setBindingData(root, {...data, nodes: nodes(count + 1)});
    } finally {
      internals.processQueue = original;
    }
    await waitForIdle();
    expect(
      Array.from(container.querySelectorAll('.row')).map(p => p.textContent),
    ).toEqual(nodes(count + 1).map(n => `${n.label}:題`));
    return frames;
  }

  it('既存の行が多くても、1 件足すのに待つフレームの数は増えない（回帰）', async () => {
    const few = await countFramesForAppend(2);
    const many = await countFramesForAppend(10);

    expect(many).toBe(few);
  });

  it('haori:eachupdate は、既存の行の再評価を終えてから発火する', async () => {
    container.innerHTML = LIST;
    await Core.scan(container);
    await waitForIdle();
    const root = container.querySelector('#root') as HTMLElement;
    const data = {nodes: nodes(3), title: '題'};
    await Core.setBindingData(root, data);
    await waitForIdle();
    let rowsAtUpdate: Array<string | null> = [];
    container
      .querySelector('#list')!
      .addEventListener('haori:eachupdate', () => {
        rowsAtUpdate = Array.from(container.querySelectorAll('.row')).map(
          p => p.textContent,
        );
      });

    // 行を足さずに要素データを 1 件だけ変え、ほかの行は既存の行の再評価だけにする。
    const next = nodes(3);
    next[0].label = '変えた名前';
    await Core.setBindingData(root, {nodes: next, title: '新しい題'});
    await waitForIdle();

    expect(rowsAtUpdate).toEqual(next.map(n => `${n.label}:新しい題`));
  });
});
