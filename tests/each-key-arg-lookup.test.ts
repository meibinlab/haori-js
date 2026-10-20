/* @vitest-environment jsdom */
/**
 * @fileoverview 配列の経路と `data-each-key` の宣言の照合を、経路の形ごとに 1 度だけ
 * 行うこと。
 *
 * 期待値は仕様「`Core.setBindingData(element, data, options?)`」の「宣言の照合は、
 * 1 回の呼び出しの中で配列の経路の形（`rows` の 3 番目と 7 番目の要素の `items` は、
 * どちらも `rows.items`）ごとに一度だけ行います」から取っている。照合の回数は行の数に
 * よらない。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import {waitForIdle} from './helpers/async';

describe('data-each-key の宣言の照合', () => {
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

  /**
   * 行ごとに選択肢の配列を持つ一覧を描き、状態を 1 つ変えたときの照合の回数を返します。
   *
   * 入れ子の一覧には `data-each-key` を付けない（照合の結果が「宣言なし」の形も
   * 使い回すことを確かめるため）。
   *
   * @param count ノードの数
   * @returns `data-each` の宣言を探した回数
   */
  async function countLookups(count: number): Promise<number> {
    container.innerHTML =
      '<div id="root"><div data-each="nodes" data-each-arg="n" data-each-key="id">' +
      '<section><p>{{n.label}}</p>' +
      '<ul data-each="n.choices" data-each-arg="c"><li>{{c.label}}</li></ul>' +
      '</section></div></div>';
    await Core.scan(container);
    await waitForIdle();
    const root = container.querySelector('#root') as HTMLElement;
    const nodes = Array.from({length: count}, (_, i) => ({
      id: `n${i}`,
      label: `ノード${i}`,
      choices: [0, 1].map(j => ({label: `選択肢${i}-${j}`})),
    }));
    const data = {nodes, mode: '表示'};
    await Core.setBindingData(root, data);
    await waitForIdle();

    const query = vi.spyOn(Element.prototype, 'querySelectorAll');
    await Core.setBindingData(root, {...data, mode: '編集'});
    await waitForIdle();
    const lookups = query.mock.calls.filter(
      call => call[0] === '[data-each]',
    ).length;
    query.mockRestore();
    return lookups;
  }

  it('照合の回数は行の数によらない（回帰）', async () => {
    const few = await countLookups(3);
    const many = await countLookups(12);

    expect(many).toBe(few);
  });
});
