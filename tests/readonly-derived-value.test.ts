/* @vitest-environment jsdom */
/**
 * @fileoverview `readonly` の入力欄への宣言バインド再適用のテスト。
 *
 * 期待値は仕様「`data-attr-*`」の「ただし `readonly` の入力欄（`<input>` /
 * `<textarea>`）は保護の対象外で、フォーカス中でも `value` を再適用します」と、
 * 同じ節の「同じ理由から、確定済みのユーザー編集の印…も `readonly` の欄では
 * 再適用を抑止しません」から取っている。編集可能な欄を守る側の期待値は、同じ節の
 * 「いずれも**操作中（フォーカス中）の要素には再適用しません**」から取っている。
 *
 * 修正前はフォーカス中の要素をすべて保護していた。`readonly` の欄は `disabled` と
 * 違いタブ移動の対象になるため、同じフォーム内の他項目から算出した値を入れた欄が
 * タブ移動の行き先になっただけで評価結果に追従せず、送信される値も古いまま残った。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {waitForIdle} from './helpers/async';

describe('readonly の欄への宣言バインドの再適用', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  /**
   * 他項目から算出した値を入れる欄を持つフォームを組み立てます。
   *
   * @param calcAttributes 算出欄へ付ける追加属性
   * @returns 入力元の欄と算出欄
   */
  async function mount(calcAttributes: string): Promise<{
    src: HTMLInputElement;
    calc: HTMLInputElement;
  }> {
    container.innerHTML = `
      <form id="f">
        <input id="src" name="src" type="text">
        <input id="calc" name="calc" type="text" ${calcAttributes}
               data-attr-value="{{(src || '') + '-算出'}}">
      </form>`;
    await Core.scan(container);
    await waitForIdle();
    return {
      src: container.querySelector('#src') as HTMLInputElement,
      calc: container.querySelector('#calc') as HTMLInputElement,
    };
  }

  /**
   * 入力元の欄へ打鍵し、フォーカスを移して確定します。
   *
   * タブ移動を再現するため、`change` の前に移動先へフォーカスを当てる。
   *
   * @param src 入力元の欄
   * @param nextFocus 移動先の要素（省略時はフォーカスを外す）
   * @returns 戻り値はありません。
   */
  function typeAndCommit(src: HTMLInputElement, nextFocus?: HTMLElement): void {
    src.focus();
    src.value = 'A';
    src.dispatchEvent(new Event('input', {bubbles: true}));
    if (nextFocus) {
      nextFocus.focus();
    } else {
      src.blur();
    }
    src.dispatchEvent(new Event('change', {bubbles: true}));
  }

  it('readonly の欄は、タブ移動でフォーカスが当たっていても算出結果へ追従する', async () => {
    const {src, calc} = await mount('readonly');
    expect(calc.value).toBe('-算出');

    typeAndCommit(src, calc);
    await waitForIdle();

    expect(document.activeElement).toBe(calc);
    expect(calc.value).toBe('A-算出');
  });

  it('readonly の textarea も、フォーカスが当たっていても追従する', async () => {
    container.innerHTML = `
      <form id="f">
        <input id="src" name="src" type="text">
        <textarea id="calc" name="calc" readonly
                  data-attr-value="{{(src || '') + '-算出'}}"></textarea>
      </form>`;
    await Core.scan(container);
    await waitForIdle();
    const src = container.querySelector('#src') as HTMLInputElement;
    const calc = container.querySelector('#calc') as HTMLTextAreaElement;
    expect(calc.value).toBe('-算出');

    typeAndCommit(src, calc);
    await waitForIdle();

    expect(document.activeElement).toBe(calc);
    expect(calc.value).toBe('A-算出');
  });

  it('readonly の欄は、確定済みの編集の印があっても追従する', async () => {
    // 編集できるうちに打鍵して印を付け、その後 `readonly` にする
    // （`data-attr-readonly` で読み取り専用へ切り替える画面と同じ状態）。
    const {src, calc} = await mount('');
    calc.focus();
    calc.value = '手入力';
    calc.dispatchEvent(new Event('input', {bubbles: true}));
    calc.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForIdle();
    calc.blur();
    calc.readOnly = true;

    typeAndCommit(src);
    await waitForIdle();

    expect(calc.value).toBe('A-算出');
  });

  it('readonly の欄は、評価結果が null になればフォーカス中でも空へ揃う', async () => {
    // 仕様「`data-attr-*`」の「**属性削除となる場合は値も空へ揃えます。**…フォーカス
    // 中の要素には適用しません（`readonly` の欄は上記の例外どおり適用します）」。
    // 属性だけ削除されて内部値に旧値が残ると、画面と送信内容が食い違う。
    container.innerHTML = `
      <form id="f">
        <input id="src" name="src" type="text">
        <input id="calc" name="calc" readonly data-attr-value="{{src ? src : null}}">
      </form>`;
    await Core.scan(container);
    await waitForIdle();
    const src = container.querySelector('#src') as HTMLInputElement;
    const calc = container.querySelector('#calc') as HTMLInputElement;

    typeAndCommit(src);
    await waitForIdle();
    expect(calc.value).toBe('A');

    // 入力元を空にして確定する。タブ移動の行き先は算出欄。
    src.focus();
    src.value = '';
    src.dispatchEvent(new Event('input', {bubbles: true}));
    calc.focus();
    src.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForIdle();

    expect(document.activeElement).toBe(calc);
    expect(calc.value).toBe('');
    expect(calc.hasAttribute('value')).toBe(false);
  });

  it('編集できる欄は、フォーカス中は従来どおり守られる', async () => {
    const {src, calc} = await mount('');
    expect(calc.value).toBe('-算出');

    typeAndCommit(src, calc);
    await waitForIdle();

    expect(document.activeElement).toBe(calc);
    expect(calc.value).toBe('-算出');
  });

  it('ガイドの算出値の例が、算出欄にフォーカスがある状態でも成り立つ', async () => {
    // ガイド「他の項目から算出した値を送る（`readonly` / `type="hidden"`）」の例。
    // 文書に載せた宣言がそのまま動くことを固定する。
    container.innerHTML = `
      <div data-bind='{"unitPrice":1200,"count":3}'>
        <form id="orderForm">
          <input name="unitPrice" type="number" data-attr-value="{{unitPrice}}">
          <input id="count" name="count" type="number" data-attr-value="{{count}}">
          <input id="total" name="total" readonly
                 data-attr-value="{{unitPrice * count}}">
          <input id="tax" name="totalTax" type="hidden" data-value-type="number"
                 data-attr-value="{{Math.floor(unitPrice * count * 0.1)}}">
        </form>
      </div>`;
    await Core.scan(container);
    await waitForIdle();
    const count = container.querySelector('#count') as HTMLInputElement;
    const total = container.querySelector('#total') as HTMLInputElement;
    const tax = container.querySelector('#tax') as HTMLInputElement;
    expect(total.value).toBe('3600');
    expect(tax.value).toBe('360');

    // 件数を変えてタブ移動の行き先を算出欄にする。
    count.focus();
    count.value = '5';
    count.dispatchEvent(new Event('input', {bubbles: true}));
    total.focus();
    count.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForIdle();

    expect(total.value).toBe('6000');
    expect(tax.value).toBe('600');
  });

  it('type="hidden" の欄は、宣言だけで算出結果を送信値に載せられる', async () => {
    // 仕様「`data-attr-*`」の「算出専用の値を送信したい場合は `type="hidden"` の
    // 入力欄を使ってください」。
    container.innerHTML = `
      <form id="f">
        <input id="src" name="src" type="text">
        <input id="calc" name="calc" type="hidden"
               data-attr-value="{{(src || '') + '-算出'}}">
      </form>`;
    await Core.scan(container);
    await waitForIdle();
    const src = container.querySelector('#src') as HTMLInputElement;
    const calc = container.querySelector('#calc') as HTMLInputElement;

    typeAndCommit(src);
    await waitForIdle();

    expect(calc.value).toBe('A-算出');
  });
});
