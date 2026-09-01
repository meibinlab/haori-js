/* @vitest-environment jsdom */
/**
 * @fileoverview `data-if` の追随結果を持った markup を走査したときのテスト。
 *
 * `data-if-false` と非表示中の `style` は判定の結果（追随結果）であって宣言では
 * ありません。内部状態を持たない要素に残っていた場合に宣言として取り込むと、内部状態
 * は「表示」なのに DOM は非表示という食い違いが残り、判定の基準は内部状態なので表示へ
 * 戻す処理が働かず、その要素は二度と表示されません。
 *
 * Haori が出力した HTML を保存して再配信する構成、`innerHTML` でコピーした断片、
 * `data-import` で取り込む断片で実際に混入します。
 *
 * 期待値は仕様書から取っています。
 *
 * - 仕様「data-if の動作」の「判定の基準は内部状態であり、`style.display` や
 *   `data-if-false` は追随結果として扱う」
 * - 同節の「追随結果を取り込まない範囲は、DOM の監視だけでなく**要素の内部状態を作る
 *   時点**（走査・複製）にも及びます」「宣言として取り込まずに**落とします**」
 * - 同節の「非表示時: `style.display = 'none'` を設定 / `data-if-false` 属性を付与」
 * - 仕様「`data-if`」の「`data-haori-if-disabled`: 非表示分岐で `disabled` を付与した
 *   入力への印 (手動変更禁止)」
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import Core from '../src/core';
import Env from '../src/env';
import {IF_DISABLED_MARKER} from '../src/fragment';

import {waitForIdle} from './helpers/async';

describe('data-if の追随結果を持った markup の走査', () => {
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
   * 要素が表示されているかどうかを返します。
   *
   * @param id 対象の id
   * @returns 表示されていれば true
   */
  const shown = (id: string): boolean => {
    const element = document.getElementById(id) as HTMLElement;
    return (
      !element.hasAttribute(`${Env.prefix}if-false`) &&
      element.style.display !== 'none'
    );
  };

  it('条件が真なら表示へ戻る（回帰）', async () => {
    container.innerHTML =
      `<div id="root" data-bind='{"show":true}'>` +
      '<p id="target" data-if="show" data-if-false=""' +
      ' style="display: none;">見えるべき</p>' +
      '</div>';
    await Core.scan(container.querySelector('#root') as HTMLElement);
    await waitForIdle();

    expect(shown('target')).toBe(true);
  });

  it('利用者が書いた style の宣言は残す（回帰）', async () => {
    container.innerHTML =
      `<div id="root" data-bind='{"show":true}'>` +
      '<p id="target" data-if="show" data-if-false=""' +
      ' style="color: red; display: none;">見えるべき</p>' +
      '</div>';
    await Core.scan(container.querySelector('#root') as HTMLElement);
    await waitForIdle();

    expect(shown('target')).toBe(true);
    const target = document.getElementById('target') as HTMLElement;
    expect(target.style.color).toBe('red');
  });

  it('利用者が書いた display: none は剥がさない（回帰）', async () => {
    // 「初期状態で隠しておく」ために書いた `style="display: none"` は宣言であって
    // 追随結果ではない。判定を `display: none` の有無で行うと取り違えて剥がしてしまい、
    // 隠しておいた要素が見えてしまう。`hide()` は `data-if-false` も必ず書くので、
    // 印の有無で足りる。
    container.innerHTML =
      `<div id="root" data-bind='{"x":1}'>` +
      '<div id="plain" style="display: none;">隠しておく要素</div>' +
      '<div id="mixed" style="display: none; color: red;">隠しておく要素 2</div>' +
      '</div>';
    await Core.scan(container.querySelector('#root') as HTMLElement);
    await waitForIdle();

    const plain = document.getElementById('plain') as HTMLElement;
    const mixed = document.getElementById('mixed') as HTMLElement;
    expect(plain.style.display).toBe('none');
    expect(mixed.style.display).toBe('none');
    expect(mixed.style.color).toBe('red');
  });

  it('行テンプレートに書いた display: none は複製後も残る（回帰）', async () => {
    // 仕様「`data-each`」の行は行テンプレートの複製。複製のたびに追随結果を落とすので、
    // 判定を取り違えると全行で `display: none` の宣言が消える。
    container.innerHTML =
      `<div id="root" data-bind='{"items":[{"id":1},{"id":2}]}'>` +
      '<ul id="list" data-each="items" data-each-arg="r" data-each-key="id">' +
      '<li style="display: none;">行 {{r.id}}</li>' +
      '</ul></div>';
    await Core.scan(container.querySelector('#root') as HTMLElement);
    await waitForIdle();

    const rows = Array.from(
      document.querySelectorAll('#list > li'),
    ) as HTMLElement[];
    expect(rows.length).toBe(2);
    expect(rows.map(row => row.style.display)).toEqual(['none', 'none']);
  });

  it('追随結果が無い要素の display の宣言は触らない（回帰）', async () => {
    // 落とすのは追随結果が残っている要素だけ。すべての要素で `display` を外すと、
    // 利用者が書いた `style="display: flex"` のような宣言を壊す。
    container.innerHTML =
      `<div id="root" data-bind='{"show":true}'>` +
      '<div id="flex" style="display: flex; gap: 4px;">A</div>' +
      '</div>';
    await Core.scan(container.querySelector('#root') as HTMLElement);
    await waitForIdle();

    const flex = document.getElementById('flex') as HTMLElement;
    expect(flex.style.display).toBe('flex');
    expect(flex.style.gap).toBe('4px');
  });

  it('条件が偽なら非表示のまま（対照）', async () => {
    container.innerHTML =
      `<div id="root" data-bind='{"show":false}'>` +
      '<p id="target" data-if="show" data-if-false=""' +
      ' style="display: none;">隠れるべき</p>' +
      '</div>';
    await Core.scan(container.querySelector('#root') as HTMLElement);
    await waitForIdle();

    expect(shown('target')).toBe(false);
  });

  it('非表示分岐の印が付いた入力を検証対象へ戻す（回帰）', async () => {
    container.innerHTML =
      `<div id="root" data-bind='{"show":true}'>` +
      '<div id="branch" data-if="show" data-if-false="" style="display: none;">' +
      `<input id="field" name="a" ${IF_DISABLED_MARKER}="" disabled>` +
      '</div></div>';
    await Core.scan(container.querySelector('#root') as HTMLElement);
    await waitForIdle();

    expect(shown('branch')).toBe(true);
    const field = document.getElementById('field') as HTMLInputElement;
    expect(field.hasAttribute('disabled')).toBe(false);
    expect(field.hasAttribute(IF_DISABLED_MARKER)).toBe(false);
  });

  it('条件が偽のまま走査したとき非表示の指定が消えない（回帰）', async () => {
    // 追随結果を落とすとき、`style` が空になったら属性そのものを外す。空の `style` を
    // 残すと宣言として取り込まれ、属性の再適用が `hide()` の書いた `display: none` を
    // 消してしまう（`data-if-false` だけ付いた状態で見えてしまう）。
    container.innerHTML =
      `<div id="root" data-bind='{"show":false}'>` +
      '<p id="target" data-if="show" data-if-false=""' +
      ' style="display: none;">隠れるべき</p>' +
      '</div>';
    await Core.scan(container.querySelector('#root') as HTMLElement);
    await waitForIdle();

    const target = document.getElementById('target') as HTMLElement;
    expect(target.hasAttribute(`${Env.prefix}if-false`)).toBe(true);
    expect(target.style.display).toBe('none');
  });

  it('条件が偽から真へ変わっても表示へ戻る（回帰）', async () => {
    container.innerHTML =
      `<div id="root" data-bind='{"show":false}'>` +
      '<p id="target" data-if="show" data-if-false=""' +
      ' style="display: none;">見えるべき</p>' +
      '</div>';
    const root = container.querySelector('#root') as HTMLElement;
    await Core.scan(root);
    await waitForIdle();
    expect(shown('target')).toBe(false);

    await Core.setBindingData(root, {show: true});
    await waitForIdle();

    expect(shown('target')).toBe(true);
  });
});
