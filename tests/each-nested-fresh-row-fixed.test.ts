/* @vitest-environment jsdom */
/**
 * @fileoverview 差分更新で新しく作った行の中にある `data-each` コンテナの、固定要素と
 * コンテナ直下のテキストノードの評価のテスト。
 *
 * 背景: 新しく作った行の初期化は `data-each` を持つ要素で子へ降りないため、その
 * コンテナの固定要素（`data-each-before` / `data-each-after`）とコンテナ直下の
 * テキストノードが、テンプレートを複製したときの式のまま残っていた。初期表示（走査）
 * では正しく描かれ、差分更新で新しく作った行だけで起きていた。
 *
 * 期待値の根拠は仕様「`data-each`」の「固定要素とコンテナ直下のテキストノードは
 * 行ではないため、**コンテナのスコープで、バインドデータの更新のたびに再評価します**」と、
 * 仕様「data-if の動作」の「非表示時: `data-if-false` 属性を付与」。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import Core from '../src/core';
import Env from '../src/env';

import {waitForIdle} from './helpers/async';

/**
 * 外側の行のデータを作ります。
 *
 * @param prefix 行の鍵の接頭辞
 * @returns 行の一覧
 */
const rowsOf = (prefix: string) => [
  {
    key: `${prefix}1`,
    label: `${prefix}1`,
    cells: [{key: 'a', value: 1, subs: [{key: 'x', v: 'x'}]}],
  },
  {
    key: `${prefix}2`,
    label: `${prefix}2`,
    cells: [{key: 'a', value: 2, subs: [{key: 'x', v: 'y'}]}],
  },
];

describe('新しく作った行の中の data-each コンテナの固定要素', () => {
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
   * 空の一覧で走査し、根要素を返します。
   *
   * @param body 根要素の中の HTML
   * @returns 走査した根要素
   */
  const build = async (body: string): Promise<HTMLElement> => {
    container.innerHTML = `<div id="root" data-bind='{"rows":[]}'>${body}</div>`;
    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForIdle();
    return root;
  };

  /**
   * 一覧を差し替えて描画を待ちます。
   *
   * @param root 根要素
   * @param rows 新しい一覧
   * @returns 描画の完了を待つ Promise
   */
  const setRows = async (root: HTMLElement, rows: unknown[]): Promise<void> => {
    await Core.setBindingData(root, {rows});
    await waitForIdle();
  };

  /**
   * セレクタに合う要素の文言を返します。
   *
   * @param selector セレクタ
   * @returns 文言の一覧
   */
  const texts = (selector: string): string[] =>
    Array.from(container.querySelectorAll(selector)).map(element =>
      (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );

  const ROW_IS_CONTAINER =
    '<table><tbody data-each="rows" data-each-arg="row" data-each-key="key">' +
    '<tr data-each="row.cells" data-each-arg="cell" data-each-key="key">' +
    '<th data-each-before class="head">{{row.label}}</th>' +
    '<td class="cell">{{cell.value}}</td>' +
    '<td data-each-after class="tail">後{{row.key}}</td>' +
    '</tr></tbody></table>';

  it('行そのものがコンテナのとき、新しい行の固定要素を行のスコープで評価する（回帰）', async () => {
    const root = await build(ROW_IS_CONTAINER);

    await setRows(root, rowsOf('08-'));

    expect(texts('.head')).toEqual(['08-1', '08-2']);
    expect(texts('.tail')).toEqual(['後08-1', '後08-2']);
    expect(texts('.cell')).toEqual(['1', '2']);
  });

  it('鍵がすべて変わって作り直した行でも、固定要素を新しい値で評価する（回帰）', async () => {
    const root = await build(ROW_IS_CONTAINER);
    await setRows(root, rowsOf('08-'));

    await setRows(root, rowsOf('09-'));

    expect(texts('.head')).toEqual(['09-1', '09-2']);
    expect(texts('.tail')).toEqual(['後09-1', '後09-2']);
  });

  it('行の中の要素がコンテナのときも、固定要素を評価する（回帰）', async () => {
    const root = await build(
      '<div data-each="rows" data-each-arg="row" data-each-key="key">' +
        '<section><ul data-each="row.cells" data-each-arg="cell" data-each-key="key">' +
        '<li data-each-before class="head">前{{row.key}}</li>' +
        '<li class="cell">{{cell.value}}</li>' +
        '</ul></section></div>',
    );

    await setRows(root, rowsOf('08-'));

    expect(texts('.head')).toEqual(['前08-1', '前08-2']);
    expect(texts('.cell')).toEqual(['1', '2']);
  });

  it('3 段の入れ子でも、各段の固定要素を評価する（回帰）', async () => {
    const root = await build(
      '<div data-each="rows" data-each-arg="row" data-each-key="key">' +
        '<div data-each="row.cells" data-each-arg="cell" data-each-key="key">' +
        '<span data-each-before class="second">[{{row.key}}]</span>' +
        '<p data-each="cell.subs" data-each-arg="sub" data-each-key="key">' +
        '<b data-each-before class="third">({{cell.value}}/{{row.key}})</b>' +
        '<i class="sub">{{sub.v}}</i>' +
        '</p></div></div>',
    );

    await setRows(root, rowsOf('08-'));

    expect(texts('.second')).toEqual(['[08-1]', '[08-2]']);
    expect(texts('.third')).toEqual(['(1/08-1)', '(2/08-2)']);
    expect(texts('.sub')).toEqual(['x', 'y']);
  });

  it('コンテナ直下のテキストノードを評価する（回帰）', async () => {
    const root = await build(
      '<div data-each="rows" data-each-arg="row" data-each-key="key">' +
        '<div class="inner" data-each="row.cells" data-each-arg="cell" data-each-key="key">' +
        '直下{{row.key}}<span>{{cell.value}}</span></div></div>',
    );

    await setRows(root, rowsOf('08-'));

    expect(texts('.inner')).toEqual(['直下08-11', '直下08-22']);
  });

  it('新しい行の固定要素の data-if を、内側の一覧で判定する（回帰）', async () => {
    // 仕様「`data-each`」の「`data-each-after` へ `data-if="items.length === 0"` を
    // 書いて「該当なし」を出す形がこれにあたります」。
    const root = await build(
      '<div data-each="rows" data-each-arg="row" data-each-key="key">' +
        '<ul data-each="row.cells" data-each-arg="cell" data-each-key="key">' +
        '<li class="cell">{{cell.value}}</li>' +
        '<li data-each-after class="empty" data-if="row.cells.length === 0">' +
        'なし</li>' +
        '</ul></div>',
    );

    await setRows(root, [
      {key: 'r1', cells: []},
      {key: 'r2', cells: [{key: 'a', value: 1}]},
    ]);

    const empties = container.querySelectorAll('.empty');
    expect(empties).toHaveLength(2);
    expect(empties[0].hasAttribute('data-if-false')).toBe(false);
    expect(empties[1].hasAttribute('data-if-false')).toBe(true);
  });

  it('固定要素の初期化で、描画済みの内側の行を初期化し直さない', async () => {
    // 仕様「`data-each`」の `data-each-rendered-run` の「初回の描画では 1 回だけ
    // 実行します」。内側の行を初期化し直すと、行が持つ `data-each` の描画が重なり、
    // 一番内側のコンテナごとに 2 回実行される。
    const runs = {count: 0};
    (globalThis as Record<string, unknown>).__nestedRuns = runs;
    try {
      const root = await build(
        '<div data-each="rows" data-each-arg="row" data-each-key="key">' +
          '<ul data-each="row.cells" data-each-arg="cell" data-each-key="key">' +
          '<li data-each-before>{{row.key}}</li>' +
          '<li data-each="cell.subs" data-each-arg="sub" data-each-key="key"' +
          ' data-each-rendered-run="globalThis.__nestedRuns.count++">' +
          '<b class="sub">{{sub.v}}</b></li>' +
          '</ul></div>',
      );

      await setRows(root, rowsOf('08-'));

      expect(texts('.sub')).toEqual(['x', 'y']);
      expect(runs.count).toBe(2);
    } finally {
      delete (globalThis as Record<string, unknown>).__nestedRuns;
    }
  });

  it('入れ子でない一覧の新しい行は、今までどおり評価する（対照）', async () => {
    const root = await build(
      '<div data-each="rows" data-each-arg="row" data-each-key="key">' +
        '<p><b class="label">{{row.label}}</b></p></div>',
    );

    await setRows(root, rowsOf('08-'));

    expect(texts('.label')).toEqual(['08-1', '08-2']);
  });
});
