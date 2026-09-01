/* @vitest-environment jsdom */
/**
 * @fileoverview `data-if` と `data-each` を同一要素へ宣言したときの、行の中の
 * 表示条件のテスト。
 *
 * `data-if` の表示分岐は子を再評価しますが、`data-each` を宣言した要素の子は行
 * テンプレートです。コンテナのスコープで評価すると、行スコープの名前が解決できず
 * 表示条件が全行で偽のまま固定され、テンプレートの中の取得まで余分に走ります。
 *
 * 期待値は仕様書から取っています。
 *
 * - 仕様「`data-if` と `data-each` の同一要素への宣言」の「**コンテナの子は
 *   `data-each` が管理します。**」「`data-each` を宣言した要素では**行わず**、
 *   続けて走る `data-each` の描画に任せます」
 * - 同節の「行の中の `data-if` や `data-attr-*` は、同一要素へ `data-if` を宣言
 *   してもしなくても**同じ行スコープで評価します**」
 * - 同節の「行テンプレートの中の `data-fetch` などの取得も、行の数だけ走ります
 *   （テンプレートのぶんが余分に走ることはありません）」
 * - 仕様「data-if の動作」の「非表示時: `style.display = 'none'` を設定 /
 *   `data-if-false` 属性を付与」
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import Core from '../src/core';
import Env from '../src/env';
import EventDispatcher from '../src/event_dispatcher';

import {waitForIdle} from './helpers/async';

/** 1 件目だけが `pinned` な行データ */
const ITEMS =
  '[{"id":1,"title":"T1","pinned":true},{"id":2,"title":"T2","pinned":false}]';

/** 一覧そのものの表示条件と行データ */
const DATA = `{"show":true,"items":${ITEMS}}`;

describe('data-if と data-each の同一要素への宣言', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let fetched: string[];

  beforeEach(() => {
    Env.setRuntime('embedded');
    fetched = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) => {
        fetched.push(String(input));
        return Promise.resolve(new Response('{}'));
      },
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    // 行操作のボタンや入力欄の `change` を実際のイベントで動かすため起動する。
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    container.remove();
    vi.restoreAllMocks();
  });

  /**
   * 一覧を組み立てて走査します。
   *
   * @param listAttributes 一覧のコンテナへ付ける宣言
   * @param row 行テンプレートの中身
   * @param bind 一覧を囲む要素のバインドデータ
   * @returns 走査した根要素
   */
  const build = async (
    listAttributes: string,
    row: string,
    bind = DATA,
  ): Promise<HTMLElement> => {
    container.innerHTML =
      `<div id="root" data-bind='${bind}'>` +
      `<ul ${listAttributes} data-each="items" data-each-key="id">` +
      `<li>${row}</li>` +
      '</ul></div>';
    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForIdle();
    return root;
  };

  /**
   * 行ごとの印の表示状態を取り出します。
   *
   * 仕様「data-if の動作」の非表示時の規則（`style.display = 'none'` と
   * `data-if-false`）で判定します。
   *
   * @returns 行ごとに、印が表示されていれば true
   */
  const badges = (): boolean[] =>
    Array.from(container.querySelectorAll('li')).map(row => {
      const badge = row.querySelector('.badge') as HTMLElement | null;
      if (badge === null) {
        return false;
      }
      return (
        !badge.hasAttribute(`${Env.prefix}if-false`) &&
        !badge.hasAttribute('hidden') &&
        badge.style.display !== 'none'
      );
    });

  it('一覧の表示条件が真のとき行の data-if を行スコープで評価する（回帰）', async () => {
    await build(
      'data-if="show"',
      '<span class="badge" data-if="pinned">!</span>',
    );

    expect(badges()).toEqual([true, false]);
  });

  it('一覧の表示条件が後から真になっても行スコープで評価する（回帰）', async () => {
    const root = await build(
      'data-if="show"',
      '<span class="badge" data-if="pinned">!</span>',
      `{"show":false,"items":${ITEMS}}`,
    );
    expect(container.querySelectorAll('li[data-row]').length).toBe(0);

    await Core.setBindingData(root, {show: true, items: JSON.parse(ITEMS)});
    await waitForIdle();

    expect(badges()).toEqual([true, false]);
  });

  it('リテラルの表示条件でも行スコープで評価する（回帰）', async () => {
    await build(
      'data-if="true"',
      '<span class="badge" data-if="pinned">!</span>',
    );

    expect(badges()).toEqual([true, false]);
  });

  it('data-each-arg を宣言した行でも行スコープで評価する（回帰）', async () => {
    await build(
      'data-if="show" data-each-arg="r"',
      '<span class="badge" data-if="r.pinned">!</span>',
    );

    expect(badges()).toEqual([true, false]);
  });

  it('行の data-attr-hidden も行スコープで評価する（回帰）', async () => {
    await build(
      'data-if="show"',
      '<span class="badge" data-attr-hidden="{{!pinned}}">!</span>',
    );

    expect(badges()).toEqual([true, false]);
  });

  it('入れ子の data-if の中でも行スコープで評価する（回帰）', async () => {
    await build(
      'data-if="show"',
      '<span data-if="true"><span class="badge" data-if="pinned">!</span></span>',
    );

    expect(badges()).toEqual([true, false]);
  });

  it('テンプレートの data-fetch は行の数だけ走る（回帰）', async () => {
    // コンテナのスコープで行テンプレートを評価すると、行が無いのに取得が 1 回
    // 余分に走り、その結果がテンプレートへ書き込まれる。
    await build(
      'data-if="show"',
      '<span data-fetch="/api/row" data-fetch-bind="loaded"></span>',
    );

    expect(fetched).toEqual(['/api/row', '/api/row']);
  });

  it('固定要素はコンテナのスコープで評価し続ける（回帰）', async () => {
    // 仕様「`data-each`」の `data-each-before` / `data-each-after`（「ループ前に表示
    // する要素をマーク」「ループ後に表示する要素をマーク」）は行ではないので、行
    // テンプレートと違いコンテナのスコープで評価する。
    //
    // これは上の回帰の修正そのものを守るテストである（行テンプレートを外すときに
    // 固定要素まで一緒に外すと、この式が初期値のまま固定される）。
    container.innerHTML =
      `<div id="root" data-bind='{"show":true,"label":"A","items":${ITEMS}}'>` +
      '<ul data-if="show" data-each="items" data-each-key="id">' +
      '<li data-each-before class="caption">{{label}}</li>' +
      '<li>{{title}}</li>' +
      '<li data-each-after class="footer">{{label}}</li>' +
      '</ul></div>';
    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForIdle();
    expect(container.querySelector('.caption')?.textContent).toBe('A');
    expect(container.querySelector('.footer')?.textContent).toBe('A');

    await Core.setBindingData(root, {
      show: true,
      label: 'B',
      items: JSON.parse(ITEMS),
    });
    await waitForIdle();

    expect(container.querySelector('.caption')?.textContent).toBe('B');
    expect(container.querySelector('.footer')?.textContent).toBe('B');
  });

  it('同一要素の構成でも行操作が配列へ書き戻る', async () => {
    // 仕様「`data-{event}-row-remove`」。行は `data-each` が管理するので、`data-if` を
    // 併記しても行操作の経路は変わらない。
    const root = await build(
      'data-if="show" data-each-arg="r"',
      '<span>{{r.title}}</span>' +
        `<button class="del" ${Env.prefix}click-row-remove>x</button>`,
    );
    expect(container.querySelectorAll('li[data-row]').length).toBe(2);

    (container.querySelector('.del') as HTMLElement).click();
    await waitForIdle();

    expect(container.querySelectorAll('li[data-row]').length).toBe(1);
    expect((Core.getBindingData(root) ?? {}).items).toEqual([
      {id: 2, title: 'T2', pinned: false},
    ]);
  });

  it('同一要素の構成でも data-form-list の収集が要素だけを上書きする', async () => {
    // 仕様「行の対応付けと `data-each-key`」の「**収集した行に対応しない配列要素**:
    // 元の位置に元の値のまま残します」。`data-if` の併記で収集の経路が変わらないこと
    // を確かめる。
    container.innerHTML =
      `<form id="f" data-bind='${DATA}'>` +
      '<div data-if="show" data-form-list="items" data-each="items"' +
      ' data-each-arg="r" data-each-key="id">' +
      '<div class="line">' +
      '<input name="title" data-attr-value="{{r.title}}"' +
      ' data-attr-id="nm-{{r.id}}">' +
      '</div></div></form>';
    const form = container.querySelector('#f') as HTMLFormElement;
    await Core.scan(form);
    await waitForIdle();
    expect(container.querySelectorAll('.line').length).toBe(2);

    const input = document.getElementById('nm-1') as HTMLInputElement;
    input.value = 'T1改';
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForIdle();

    expect((Core.getBindingData(form) ?? {}).items).toEqual([
      {id: 1, title: 'T1改', pinned: true},
      {id: 2, title: 'T2', pinned: false},
    ]);
  });

  it('隠しているあいだに配列が変わっても表示で描き直す', async () => {
    // 仕様「data-if の動作」の「配下は再評価しない（`data-attr-*` も評価されない）。
    // 表示へ戻った時点でまとめて再評価する」。
    const root = await build(
      'data-if="show" id="list" data-each-arg="r"',
      '<span>{{r.title}}</span>',
    );
    await Core.setBindingData(root, {show: false, items: []});
    await waitForIdle();
    await Core.setBindingData(root, {
      show: true,
      items: [
        {id: 3, title: 'T3', pinned: false},
        {id: 4, title: 'T4', pinned: true},
        {id: 5, title: 'T5', pinned: false},
      ],
    });
    await waitForIdle();

    expect(
      Array.from(container.querySelectorAll('li[data-row]')).map(
        row => row.textContent,
      ),
    ).toEqual(['T3', 'T4', 'T5']);
  });

  it('一覧の表示条件を data-attr-hidden で書いた場合（対照）', async () => {
    await build(
      'data-attr-hidden="{{!show}}"',
      '<span class="badge" data-if="pinned">!</span>',
    );

    expect(badges()).toEqual([true, false]);
  });

  it('一覧の表示条件を宣言しない場合（対照）', async () => {
    await build('', '<span class="badge" data-if="pinned">!</span>');

    expect(badges()).toEqual([true, false]);
  });

  it('表示条件を外側の要素へ分けた場合（対照）', async () => {
    container.innerHTML =
      `<div id="root" data-bind='${DATA}'>` +
      '<div data-if="show">' +
      '<ul data-each="items" data-each-key="id">' +
      '<li><span class="badge" data-if="pinned">!</span></li>' +
      '</ul></div></div>';
    await Core.scan(container.querySelector('#root') as HTMLElement);
    await waitForIdle();

    expect(badges()).toEqual([true, false]);
  });

  it('一覧の表示条件が偽なら行を描かず、テンプレートも評価しない', async () => {
    await build(
      'data-if="show"',
      '<span class="badge" data-if="pinned">!</span>',
      `{"show":false,"items":${ITEMS}}`,
    );

    // 仕様「data-if の動作」の「非表示時: **要素と子要素は DOM に残る**（削除しない）」
    // 「配下は再評価しない（`data-attr-*` も評価されない）」。行テンプレートは
    // 切り出されないまま残るが、行（`data-row`）は 1 つも描かれない。
    const list = container.querySelector('ul') as HTMLElement;
    expect(list.hasAttribute(`${Env.prefix}if-false`)).toBe(true);
    expect(container.querySelectorAll('li[data-row]').length).toBe(0);
  });
});
