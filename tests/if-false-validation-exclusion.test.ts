/* @vitest-environment jsdom */
/**
 * @fileoverview `data-if` が偽の分岐をバリデーション対象から外すことのテスト。
 *
 * 非表示分岐（`data-if-false`）配下の入力は値収集（`Form.getValues`）では除外
 * されるのに、制約検証では対象に残っていた。そのため非表示分岐に `required` の
 * 入力があると `data-{event}-validate` もネイティブの `checkValidity()` も通らず、
 * **表示中の分岐だけを入力しても送信できない**状態だった。`reportValidity()` は
 * `display: none` の要素をフォーカスできないため、画面には何も表示されない。
 *
 * 非表示のあいだ配下の入力へ `disabled` を付けて検証対象から外し、表示へ戻すとき
 * に印が付いた要素だけを復帰させる。利用者が指定した `disabled` は維持する。
 *
 * 期待値の根拠は仕様「`data-if-false` 分岐とフォーム送信」と仕様「`data-{event}-validate`」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import EventDispatcher from '../src/event_dispatcher';
import {waitForDomSettled} from './helpers/async';

const getFrag = (element: HTMLElement): ElementFragment =>
  Fragment.get(element) as ElementFragment;

/** 検証通過を記録するグローバル関数の型。 */
type ProbeWindow = Record<string, unknown>;

describe('data-if が偽の分岐のバリデーション除外', () => {
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
    delete (window as unknown as ProbeWindow).__validatePassed;
  });

  /**
   * HTML をマウントして初期評価を終えます。
   *
   * @param html マウントする HTML
   * @returns 戻り値はありません。
   */
  const mount = async (html: string): Promise<void> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
  };

  /**
   * 検証ボタンを押し、`data-click-run` が実行されたかを返します。
   *
   * @param selector ボタンのセレクタ
   * @returns 検証を通過して手続きが進んだ場合は true
   */
  const runValidate = async (selector: string): Promise<boolean> => {
    delete (window as unknown as ProbeWindow).__validatePassed;
    (container.querySelector(selector) as HTMLElement).click();
    await waitForDomSettled(6);
    return (window as unknown as ProbeWindow).__validatePassed === true;
  };

  const BRANCH_FORM = `
    <form id="f" data-bind='{"kind":"individual"}'>
      <select id="kind" name="kind">
        <option value="individual">individual</option>
        <option value="company">company</option>
      </select>
      <div id="branch" data-if="kind === 'company'">
        <input id="req" name="companyName" required>
      </div>
    </form>
    <button id="btn" data-click-validate data-click-form="#f"
      data-click-run="window.__validatePassed = true">検証</button>`;

  it('非表示分岐の required は検証対象外になる', async () => {
    await mount(BRANCH_FORM);
    const form = container.querySelector('#f') as HTMLFormElement;
    const branch = container.querySelector('#branch') as HTMLElement;
    const req = container.querySelector('#req') as HTMLInputElement;

    expect(branch.hasAttribute('data-if-false')).toBe(true);
    expect(req.willValidate).toBe(false);
    expect(form.checkValidity()).toBe(true);
    expect(await runValidate('#btn')).toBe(true);
  });

  it('値収集の対象は変わらない', async () => {
    await mount(BRANCH_FORM);
    const form = container.querySelector('#f') as HTMLFormElement;
    expect(Form.getValues(getFrag(form))).toEqual({kind: 'individual'});
  });

  it('表示中の分岐が未入力なら従来どおり検証で止まる', async () => {
    await mount(BRANCH_FORM);
    const form = container.querySelector('#f') as HTMLFormElement;
    const kind = container.querySelector('#kind') as HTMLSelectElement;
    const req = container.querySelector('#req') as HTMLInputElement;

    kind.value = 'company';
    kind.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled(6);
    expect(req.willValidate).toBe(true);
    expect(form.checkValidity()).toBe(false);
    expect(await runValidate('#btn')).toBe(false);

    req.focus();
    req.value = 'ACME';
    req.dispatchEvent(new Event('input', {bubbles: true}));
    req.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();
    req.blur();
    expect(form.checkValidity()).toBe(true);
    expect(await runValidate('#btn')).toBe(true);
    expect(Form.getValues(getFrag(form))).toEqual({
      kind: 'company',
      companyName: 'ACME',
    });
  });

  it('表示と非表示を往復しても検証対象が追随する', async () => {
    await mount(BRANCH_FORM);
    const form = container.querySelector('#f') as HTMLFormElement;
    const kind = container.querySelector('#kind') as HTMLSelectElement;
    const req = container.querySelector('#req') as HTMLInputElement;

    const select = async (value: string): Promise<void> => {
      kind.value = value;
      kind.dispatchEvent(new Event('change', {bubbles: true}));
      await waitForDomSettled(6);
    };

    await select('company');
    expect(req.disabled).toBe(false);
    await select('individual');
    expect(req.disabled).toBe(true);
    expect(form.checkValidity()).toBe(true);
    await select('company');
    expect(req.disabled).toBe(false);
    expect(form.checkValidity()).toBe(false);
  });

  it('利用者が指定した disabled は表示へ戻しても維持される', async () => {
    await mount(`
      <div id="state" data-bind='{"show":false,"lock":true}'>
        <form id="f">
          <div id="branch" data-if="show">
            <input id="locked" name="a" data-attr-disabled="{{lock}}">
            <input id="plain" name="b">
          </div>
        </form>
      </div>`);
    const state = container.querySelector('#state') as HTMLElement;
    const locked = container.querySelector('#locked') as HTMLInputElement;
    const plain = container.querySelector('#plain') as HTMLInputElement;

    expect([locked.disabled, plain.disabled]).toEqual([true, true]);
    await Core.setBindingData(state, {show: true, lock: true});
    await waitForDomSettled(8);
    // 宣言バインドで無効化されている欄は表示後も無効、印を付けた欄だけ復帰する。
    expect([locked.disabled, plain.disabled]).toEqual([true, false]);
    await Core.setBindingData(state, {show: true, lock: false});
    await waitForDomSettled(8);
    expect([locked.disabled, plain.disabled]).toEqual([false, false]);
  });

  it('入れ子の data-if では内側の分岐が独立して追随する', async () => {
    await mount(`
      <div id="state" data-bind='{"outer":false,"inner":false}'>
        <form id="f">
          <div id="outerBranch" data-if="outer">
            <input id="o" name="o">
            <div id="innerBranch" data-if="inner">
              <input id="i" name="i" required>
            </div>
          </div>
        </form>
      </div>`);
    const state = container.querySelector('#state') as HTMLElement;
    const form = container.querySelector('#f') as HTMLFormElement;
    const outer = container.querySelector('#o') as HTMLInputElement;
    const inner = container.querySelector('#i') as HTMLInputElement;

    expect([outer.disabled, inner.disabled]).toEqual([true, true]);
    // 外側だけ表示: 内側は偽のままなので無効を維持する（一括復帰させない）。
    await Core.setBindingData(state, {outer: true, inner: false});
    await waitForDomSettled(8);
    expect([outer.disabled, inner.disabled]).toEqual([false, true]);
    expect(form.checkValidity()).toBe(true);
    // 内側も表示: required が有効になる。
    await Core.setBindingData(state, {outer: true, inner: true});
    await waitForDomSettled(8);
    expect(inner.disabled).toBe(false);
    expect(form.checkValidity()).toBe(false);
  });

  it('入力要素自身に data-if を付けた場合も検証対象外になる', async () => {
    await mount(`
      <div id="state" data-bind='{"show":false}'>
        <form id="f">
          <input id="only" name="a" required data-if="show">
        </form>
      </div>`);
    const state = container.querySelector('#state') as HTMLElement;
    const form = container.querySelector('#f') as HTMLFormElement;
    const only = container.querySelector('#only') as HTMLInputElement;

    expect(only.disabled).toBe(true);
    expect(form.checkValidity()).toBe(true);
    await Core.setBindingData(state, {show: true});
    await waitForDomSettled(8);
    expect(only.disabled).toBe(false);
    expect(form.checkValidity()).toBe(false);
  });

  it('非表示分岐は data-each の行を含んでいても検証対象外になる', async () => {
    await mount(`
      <div id="state" data-bind='{"show":false,"rows":[{"id":1},{"id":2}]}'>
        <form id="f">
          <div id="branch" data-if="show">
            <div data-each="rows" data-each-arg="row">
              <input name="value" required data-attr-value="{{row.id}}">
            </div>
          </div>
        </form>
      </div>`);
    const state = container.querySelector('#state') as HTMLElement;
    const form = container.querySelector('#f') as HTMLFormElement;
    expect(form.checkValidity()).toBe(true);
    await Core.setBindingData(state, {show: true, rows: [{id: 1}, {id: 2}]});
    await waitForDomSettled(8);
    // 表示へ戻せば行の入力は通常どおり検証対象（値が入っているので有効）。
    expect(form.checkValidity()).toBe(true);
    expect(
      Array.from(form.querySelectorAll<HTMLInputElement>('input')).map(
        input => input.disabled,
      ),
    ).not.toContain(true);
  });
});
