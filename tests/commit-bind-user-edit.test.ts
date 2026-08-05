/* @vitest-environment jsdom */
/**
 * @fileoverview 入力要素自身の `data-{event}-bind` とユーザー編集の権威のテスト。
 *
 * `change` / `input` でフェッチを伴わないバインドは、入力欄から収集した編集値を
 * そのままバインドデータへ写す双方向コミットである。これを「外部からの値の供給」
 * として扱い編集済みの印を解除していたため、参照キーと書込キーが別の構成
 * （`data-attr-value="{{record.a}}"` の欄を `bind-arg="draft"` へ書き込む等）で、
 * 次の項目を編集した瞬間に前の項目が未更新の参照キーの評価結果（空）で
 * 上書きされていた。画面表示だけでなく収集値も空になるため、保存すると
 * 利用者が入力したはずの値が空で登録される。
 *
 * ここでは「双方向コミットのバインドでは印を解除しない」ことと、フェッチ応答や
 * リセットのような明示的な供給では従来どおり解除されることの両側を固定する。
 *
 * 期待値の根拠は仕様「ユーザー編集と宣言バインドの権威」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import EventDispatcher from '../src/event_dispatcher';
import {waitForDomSettled} from './helpers/async';

const getFrag = (element: HTMLElement): ElementFragment =>
  Fragment.get(element) as ElementFragment;

describe('双方向コミットのバインドとユーザー編集の優先', () => {
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

  const edit = async (
    input: HTMLInputElement | HTMLSelectElement,
    value: string,
  ): Promise<void> => {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();
    input.blur();
    await waitForDomSettled();
  };

  const mount = async (html: string): Promise<void> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
  };

  it('参照キーと書込キーが別でも順に編集した 3 項目が保持される', async () => {
    await mount(`
      <div id="state" data-bind='{"record":{"a":"","b":"","c":""}}'>
        <form id="f">
          <input id="ia" name="a" data-attr-value="{{record.a}}"
            data-change-bind="#state" data-change-bind-arg="draft">
          <input id="ib" name="b" data-attr-value="{{record.b}}"
            data-change-bind="#state" data-change-bind-arg="draft">
          <input id="ic" name="c" data-attr-value="{{record.c}}"
            data-change-bind="#state" data-change-bind-arg="draft">
        </form>
      </div>`);
    const state = container.querySelector('#state') as HTMLElement;
    const form = container.querySelector('#f') as HTMLFormElement;
    const ia = container.querySelector('#ia') as HTMLInputElement;
    const ib = container.querySelector('#ib') as HTMLInputElement;
    const ic = container.querySelector('#ic') as HTMLInputElement;
    await edit(ia, 'AAA');
    await edit(ib, 'BBB');
    await edit(ic, 'CCC');
    expect([ia.value, ib.value, ic.value]).toEqual(['AAA', 'BBB', 'CCC']);
    expect(Form.getValues(getFrag(form))).toEqual({
      a: 'AAA',
      b: 'BBB',
      c: 'CCC',
    });
    expect(
      (Core.getBindingData(state, {resolved: true}) as Record<string, unknown>)
        .draft,
    ).toEqual({a: 'AAA', b: 'BBB', c: 'CCC'});
  });

  it('同一 name ラジオの bind では data-if の依存欄が従来どおり切り替わる', async () => {
    await mount(`
      <div id="payment-state" data-bind='{"payment":{"method":"cash"}}'>
        <form id="payment-form">
          <label><input type="radio" name="method" value="cash" checked
            data-change-bind="#payment-state" data-change-bind-arg="payment"></label>
          <label><input id="credit" type="radio" name="method" value="credit"
            data-change-bind="#payment-state" data-change-bind-arg="payment"></label>
          <div id="credit-panel" data-if="payment.method === 'credit'">
            <label>カード番号<input type="text" name="cardNumber"></label>
          </div>
        </form>
        <span id="label">{{payment.method}}</span>
      </div>`);
    const credit = container.querySelector('#credit') as HTMLInputElement;
    const panel = container.querySelector('#credit-panel') as HTMLElement;
    const label = container.querySelector('#label') as HTMLElement;
    expect(panel.hasAttribute('data-if-false')).toBe(true);
    credit.checked = true;
    credit.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();
    expect(panel.hasAttribute('data-if-false')).toBe(false);
    expect(label.textContent).toBe('credit');
  });

  it('手編集していない派生欄は従来どおり更新される', async () => {
    await mount(`
      <div id="state" data-bind='{"draft":{"plan":"A"}}'>
        <form id="f">
          <select id="sel" name="plan" data-change-bind="#state"
            data-change-bind-arg="draft">
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
          <input id="price" name="price"
            data-attr-value="{{draft.plan === 'A' ? '100' : '200'}}">
        </form>
      </div>`);
    const sel = container.querySelector('#sel') as HTMLSelectElement;
    const price = container.querySelector('#price') as HTMLInputElement;
    expect(price.value).toBe('100');
    await edit(sel, 'B');
    expect(price.value).toBe('200');
  });

  it('手編集済みの派生欄は編集値が維持される', async () => {
    await mount(`
      <div id="state" data-bind='{"draft":{"plan":"A"}}'>
        <form id="f">
          <select id="sel" name="plan" data-change-bind="#state"
            data-change-bind-arg="draft">
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
          <input id="price" name="price"
            data-attr-value="{{draft.plan === 'A' ? '100' : '200'}}">
        </form>
      </div>`);
    const sel = container.querySelector('#sel') as HTMLSelectElement;
    const price = container.querySelector('#price') as HTMLInputElement;
    await edit(price, '999');
    await edit(sel, 'B');
    expect(price.value).toBe('999');
  });

  it('readonly の派生欄は編集の印が付かないため常に追従する', async () => {
    await mount(`
      <div id="state" data-bind='{"draft":{"plan":"A"}}'>
        <form id="f">
          <select id="sel" name="plan" data-change-bind="#state"
            data-change-bind-arg="draft">
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
          <input id="price" name="price" readonly
            data-attr-value="{{draft.plan === 'A' ? '100' : '200'}}">
        </form>
      </div>`);
    const sel = container.querySelector('#sel') as HTMLSelectElement;
    const price = container.querySelector('#price') as HTMLInputElement;
    await edit(sel, 'B');
    expect(price.value).toBe('200');
    await edit(sel, 'A');
    expect(price.value).toBe('100');
  });

  it('リセットは従来どおり編集の印を解除する', async () => {
    await mount(`
      <div id="state" data-bind='{"record":{"a":"X"}}'>
        <form id="f">
          <input id="ia" name="a" data-attr-value="{{record.a}}"
            data-change-bind="#state" data-change-bind-arg="draft">
        </form>
        <button id="clear" data-click-reset="#f"></button>
      </div>`);
    const ia = container.querySelector('#ia') as HTMLInputElement;
    const clear = container.querySelector('#clear') as HTMLElement;
    await edit(ia, 'AAA');
    expect(ia.value).toBe('AAA');
    clear.click();
    await waitForDomSettled(6);
    expect(ia.value).toBe('X');
  });
});
