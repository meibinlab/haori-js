/* @vitest-environment jsdom */
/**
 * @fileoverview `data-each` コンテナの固定要素の再評価のテスト。
 *
 * 行と行テンプレートは `data-each` が管理するため、コンテナの子へは通常の再評価が
 * 降りません。しかし固定要素（`data-each-before` / `data-each-after`）とコンテナ
 * 直下のテキストノードは行ではないため、コンテナのスコープで再評価する必要が
 * あります。再評価しないと、ガイドが案内している「該当なし」のメッセージが配列が
 * 変わっても初期の判定のまま残ります。
 *
 * 期待値は仕様書から取っています。
 *
 * - 仕様「`data-each`」の「固定要素とコンテナ直下のテキストノードは行ではないため、
 *   **コンテナのスコープで、バインドデータの更新のたびに再評価します**」
 * - 同節の「`data-each-after` へ `data-if="items.length === 0"` を書いて「該当なし」を
 *   出す形がこれにあたります」
 * - 仕様「data-if の動作」の「非表示時: `data-if-false` 属性を付与」
 * - 行の再評価を巻き込まないことの根拠はガイド「重要な属性」の「並べ替えや一部の行だけの
 *   更新で**変わっていない行の再評価を省略**できます」。評価回数の観測は仕様
 *   「パフォーマンス測定」の集計 API を使う
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';

import {waitForIdle} from './helpers/async';

/** 仕様「パフォーマンス測定」が `globalThis` へ公開する集計 API */
type EvaluationProfileAccessor = {
  start: () => void;
  stop: () => void;
  reset: () => void;
  snapshot: () => Array<{
    texts: Array<{template: string; calls: number}>;
  }>;
};

/**
 * 集計 API を取り出します。
 *
 * @returns 集計 API
 */
const profile = (): EvaluationProfileAccessor =>
  (globalThis as Record<string, unknown>)
    .__HAORI_EVALUATION_PROFILE__ as EvaluationProfileAccessor;

describe('data-each の固定要素の再評価', () => {
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
   * @param listAttributes コンテナへ足す宣言
   * @returns 走査した根要素
   */
  const build = async (listAttributes = ''): Promise<HTMLElement> => {
    container.innerHTML =
      `<div id="root" data-bind='{"items":[]}'>` +
      `<ul ${listAttributes} data-each="items" data-each-key="id">` +
      '<li data-each-before class="caption">一覧（{{items.length}} 件）</li>' +
      '<li>{{name}}</li>' +
      '<li data-each-after class="empty" data-if="items.length === 0">' +
      '該当なし</li>' +
      '</ul></div>';
    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForIdle();
    return root;
  };

  /**
   * 固定要素の状態を取り出します。
   *
   * @returns 見出しの文字列と「該当なし」が表示されているかどうか
   */
  const fixedState = (): {caption: string; emptyShown: boolean} => {
    const caption = container.querySelector('.caption') as HTMLElement;
    const empty = container.querySelector('.empty') as HTMLElement;
    return {
      caption: caption.textContent ?? '',
      emptyShown: !empty.hasAttribute(`${Env.prefix}if-false`),
    };
  };

  it('固定要素の中の data-if が配列の変化で再評価される（回帰）', async () => {
    const root = await build();
    expect(fixedState()).toEqual({caption: '一覧（0 件）', emptyShown: true});

    await Core.setBindingData(root, {
      items: [
        {id: 1, name: 'A'},
        {id: 2, name: 'B'},
      ],
    });
    await waitForIdle();

    expect(fixedState()).toEqual({caption: '一覧（2 件）', emptyShown: false});
  });

  it('固定要素は 0 件へ戻したときも再評価される（回帰）', async () => {
    const root = await build();
    await Core.setBindingData(root, {items: [{id: 1, name: 'A'}]});
    await waitForIdle();
    expect(fixedState()).toEqual({caption: '一覧（1 件）', emptyShown: false});

    await Core.setBindingData(root, {items: []});
    await waitForIdle();

    expect(fixedState()).toEqual({caption: '一覧（0 件）', emptyShown: true});
  });

  it('同一要素へ data-if を宣言した一覧でも固定要素が再評価される（対照）', async () => {
    // 仕様「`data-if` と `data-each` の同一要素への宣言」の「固定要素
    // （`data-each-before` / `data-each-after`）とコンテナ直下のテキストノードは
    // 行ではないため、従来どおり**コンテナのスコープ**で評価します」。
    container.innerHTML =
      `<div id="root" data-bind='{"show":true,"items":[]}'>` +
      '<ul data-if="show" data-each="items" data-each-key="id">' +
      '<li data-each-before class="caption">一覧（{{items.length}} 件）</li>' +
      '<li>{{name}}</li>' +
      '<li data-each-after class="empty" data-if="items.length === 0">' +
      '該当なし</li>' +
      '</ul></div>';
    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForIdle();
    expect(fixedState()).toEqual({caption: '一覧（0 件）', emptyShown: true});

    await Core.setBindingData(root, {show: true, items: [{id: 1, name: 'A'}]});
    await waitForIdle();

    expect(fixedState()).toEqual({caption: '一覧（1 件）', emptyShown: false});
  });

  it('コンテナ直下のテキストノードも再評価される（回帰）', async () => {
    // `data-each-arg` を宣言した一覧（行スコープだけで描画が決まる形）でも、
    // コンテナ直下のテキストは一覧の外のデータを参照できるので再評価する。
    container.innerHTML =
      `<div id="root" data-bind='{"items":[],"label":"初期"}'>` +
      '<div id="list" data-each="items" data-each-arg="r"' +
      ' data-each-key="id">' +
      '<span>{{r.name}}</span>' +
      '</div></div>';
    const list = container.querySelector('#list') as HTMLElement;
    // 行テンプレートの後ろへテキストノードを置く（走査より前に入れる）。
    list.appendChild(document.createTextNode('［{{label}}］'));
    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForIdle();
    expect(list.textContent).toContain('［初期］');

    await Core.setBindingData(root, {items: [], label: '更新'});
    await waitForIdle();

    expect(list.textContent).toContain('［更新］');
  });

  it('固定要素の再評価が行の再評価を巻き込まない（回帰）', async () => {
    // 固定要素だけを評価対象へ戻す。行まで評価すると、行数に比例した再評価が
    // バインド更新のたびに走り、`data-each` が省略している再評価が復活する。
    Dev.enable();
    try {
      const bind = '{"label":"初期","items":[{"id":1},{"id":2},{"id":3}]}';
      container.innerHTML =
        `<div id="root" data-bind='${bind}'>` +
        '<ul data-each="items" data-each-arg="r" data-each-key="id">' +
        '<li data-each-before class="caption">{{label}}</li>' +
        '<li>{{r.id}}</li>' +
        '</ul></div>';
      const root = container.querySelector('#root') as HTMLElement;
      await Core.scan(root);
      await waitForIdle();

      profile().reset();
      profile().start();
      // 配列は同じまま、固定要素が参照する値だけを変える。
      await Core.setBindingData(root, {
        label: '更新',
        items: [{id: 1}, {id: 2}, {id: 3}],
      });
      await waitForIdle();
      profile().stop();

      /**
       * 指定したテンプレートのテキスト評価回数を合計します。
       *
       * @param template 数えるテンプレート
       * @returns 評価回数の合計
       */
      const calls = (template: string): number =>
        profile()
          .snapshot()
          .reduce(
            (total, element) =>
              total +
              element.texts
                .filter(text => text.template === template)
                .reduce((sum, text) => sum + text.calls, 0),
            0,
          );

      expect(container.querySelector('.caption')?.textContent).toBe('更新');
      expect(calls('{{label}}')).toBeGreaterThan(0);
      expect(calls('{{r.id}}')).toBe(0);
    } finally {
      profile()?.stop();
      profile()?.reset();
      Dev.disable();
    }
  });

  it('行の中の式は行スコープのまま（対照）', async () => {
    const root = await build();
    await Core.setBindingData(root, {
      items: [
        {id: 1, name: 'A'},
        {id: 2, name: 'B'},
      ],
    });
    await waitForIdle();

    expect(
      Array.from(container.querySelectorAll('li[data-row]')).map(
        row => row.textContent,
      ),
    ).toEqual(['A', 'B']);
  });
});
