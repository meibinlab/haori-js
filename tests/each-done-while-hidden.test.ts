/* @vitest-environment jsdom */
/**
 * @fileoverview 非表示の `data-each` コンテナの完了マーカーのテスト。
 *
 * `data-if` が偽のコンテナでは描画を保留します。マーカーを付けたままにすると、
 * 保留中に配列が変わった場合に古い行数のまま「描画完了」を示し続け、
 * `[data-each-done]` を待つ外部テストや外部ウィジェットが古い状態を完了と見なします。
 *
 * 期待値は仕様書から取っています。
 *
 * - 仕様「`data-each`」の「`data-each-done`」の「**非表示のあいだは外れます。**」
 *   「保留した時点でマーカーを外し、表示へ戻って描き終えた時点で再付与します」
 * - 同節の「**発火保証**: 初回描画・再 fetch・再バインドなど描画サイクルが走るたびに、
 *   コンテナ単位で「除去 → 再付与」が必ず一度行われます」
 * - 仕様「data-if の動作」の「配下は再評価しない（`data-attr-*` も評価されない）。
 *   表示へ戻った時点でまとめて再評価する」
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import Core from '../src/core';
import Env from '../src/env';

import {waitForIdle} from './helpers/async';

describe('非表示の data-each の完了マーカー', () => {
  let container: HTMLElement;

  beforeEach(() => {
    Env.setRuntime('embedded');
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  /**
   * 一覧を組み立てて走査します。
   *
   * @returns 走査した根要素
   */
  const build = async (): Promise<HTMLElement> => {
    container.innerHTML =
      `<div id="root" data-bind='{"show":true,"items":[{"id":1}]}'>` +
      '<ul id="list" data-if="show" data-each="items" data-each-key="id">' +
      '<li>{{id}}</li>' +
      '</ul></div>';
    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForIdle();
    return root;
  };

  /** 完了マーカーの有無 */
  const done = (): boolean =>
    (document.getElementById('list') as HTMLElement).hasAttribute(
      `${Env.prefix}each-done`,
    );

  /** 描かれている行の数 */
  const rows = (): number =>
    container.querySelectorAll(`li[${Env.prefix}row]`).length;

  it('非表示になると完了マーカーが外れる（回帰）', async () => {
    const root = await build();
    expect(done()).toBe(true);
    expect(rows()).toBe(1);

    await Core.setBindingData(root, {show: false, items: [{id: 1}]});
    await waitForIdle();

    expect(done()).toBe(false);
  });

  it('非表示中に配列が変わっても完了を示さない（回帰）', async () => {
    const root = await build();

    await Core.setBindingData(root, {
      show: false,
      items: [{id: 1}, {id: 2}, {id: 3}],
    });
    await waitForIdle();

    // 描画は保留されるので行数は配列とずれる。完了マーカーが付いていなければ、
    // 待っている側が古い状態を完了と見なすことはない。
    expect(rows()).toBe(1);
    expect(done()).toBe(false);
  });

  it('表示へ戻って描き終えると再付与される（回帰）', async () => {
    const root = await build();
    await Core.setBindingData(root, {
      show: false,
      items: [{id: 1}, {id: 2}, {id: 3}],
    });
    await waitForIdle();

    await Core.setBindingData(root, {
      show: true,
      items: [{id: 1}, {id: 2}, {id: 3}],
    });
    await waitForIdle();

    expect(done()).toBe(true);
    expect(rows()).toBe(3);
  });
});
