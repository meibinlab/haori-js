/* @vitest-environment jsdom */
/**
 * @fileoverview 宣言バインド（`data-attr-value` / `data-attr-checked` /
 * `data-attr-selected`）の反映待ちの書き込みと、その間に確定した入力のテスト。
 *
 * 期待値は仕様「反映待ちの間に起きた変化」の「**利用者が入力を確定したら、待っていた
 * 書き込みは行いません**。反映を要求した時点より後の編集は、上記の「編集済みの印」と
 * 同じ理由で保護します（要求より前の編集は、明示的な供給が権威なので上書きします）」
 * から取っている。
 *
 * 修正前は、宣言バインドの評価では上書きしてよいかを評価の時点でだけ判定していた。
 * 評価の後・描画キューで書き込むまでの間に確定した入力は、書き込みで評価結果へ戻って
 * いた（画面を開いた直後に入力すると、入力した値が既定値へ戻る）。
 *
 * 編集済みの `<select>` で選択肢の `selected` 属性を書くと選択が戻る件は、反映待ちに
 * 限らず起きていたため、仕様「ユーザー編集と宣言バインドの権威」から期待値を取る。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

describe('宣言バインドの反映待ちの書き込みと、その間に確定した入力', () => {
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
   * 指定した要素の指定した属性を評価した直後（書き込みを描画キューへ積んだ直後で、まだ
   * 書き込んでいない時点）に、1 回だけ操作を行うよう仕掛けます。
   *
   * 評価が描画キューの処理より先に走ることを、時間ではなく評価の呼び出しで
   * 捉えるためです。
   *
   * @param element 属性を評価する要素
   * @param name 評価する属性の名前
   * @param action 評価の直後に行う操作
   */
  function afterEvaluating(
    element: Element,
    name: string,
    action: () => void,
  ): void {
    type Internal = {
      getTarget(): Element;
      getSelfWritingAttribute(names: string[]): Promise<void> | null;
    };
    const prototype = ElementFragment.prototype as unknown as Record<
      string,
      (...args: unknown[]) => Promise<void>
    >;
    const original = prototype.setAttributeInternal;
    let done = false;
    vi.spyOn(prototype, 'setAttributeInternal').mockImplementation(
      function evaluate(this: Internal, ...args: unknown[]) {
        const [rawName, targetName] = args as [string, string];
        // 先の書き込みを待ってから評価し直す呼び出しは、この時点ではまだ評価していない。
        const evaluatesNow =
          this.getSelfWritingAttribute([rawName, targetName]) === null;
        const result = original.apply(this, args);
        if (
          !done &&
          evaluatesNow &&
          rawName === name &&
          this.getTarget() === element
        ) {
          done = true;
          action();
        }
        return result;
      },
    );
  }

  /**
   * HTML を走査し、描画の完了を待ちます。
   *
   * @param html 根要素の中の HTML
   * @returns 根要素
   */
  async function mount(html: string): Promise<HTMLElement> {
    container.innerHTML = html;
    const root = container.firstElementChild as HTMLElement;
    await Core.scan(root);
    await waitForDomSettled();
    return root;
  }

  /**
   * 入力欄へ入力して確定します（`input` と `change` を発火し、フォーカスを外す）。
   *
   * @param input 対象の入力欄
   * @param value 入力後の値
   */
  function commit(
    input: HTMLInputElement | HTMLSelectElement,
    value: string,
  ): void {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
    input.blur();
  }

  /**
   * フォームの収集値を返します。
   *
   * @param form 対象のフォーム
   * @returns 収集値
   */
  function valuesOf(form: HTMLElement): Record<string, unknown> {
    return Form.getValues(Fragment.get(form) as ElementFragment) as Record<
      string,
      unknown
    >;
  }

  it('値の供給の後・書き込みの前に確定した入力を、data-attr-value の書き込みで戻さない（回帰）', async () => {
    const root = await mount(
      '<form id="s" data-bind=\'{"d":"2026-10-06"}\'>' +
        '<input id="i" name="x" type="date" data-attr-value="{{d}}"></form>',
    );
    const input = container.querySelector('#i') as HTMLInputElement;

    afterEvaluating(input, 'data-attr-value', () =>
      commit(input, '2025-01-01'),
    );
    void Core.setBindingData(root, {d: '2026-10-07'});

    await waitForDomSettled(6);
    expect(input.value).toBe('2025-01-01');
    // 仕様「ユーザー編集と宣言バインドの権威」の「DOM の値・チェック状態と内部値
    // （収集値）は編集値のまま保たれます」。
    expect(valuesOf(root).x).toBe('2025-01-01');
  });

  it('初回の評価の後・書き込みの前に確定した入力を、data-attr-value の書き込みで戻さない（回帰）', async () => {
    container.innerHTML =
      '<div id="s" data-bind=\'{"d":"2026-10-06"}\'>' +
      '<input id="i" name="x" type="date" data-attr-value="{{d}}"></div>';
    const root = container.firstElementChild as HTMLElement;
    const input = container.querySelector('#i') as HTMLInputElement;

    afterEvaluating(input, 'data-attr-value', () =>
      commit(input, '2025-01-01'),
    );
    await Core.scan(root);

    await waitForDomSettled(6);
    expect(input.value).toBe('2025-01-01');
  });

  it('値の供給より前に確定した入力は、供給した値で上書きする（対照）', async () => {
    const root = await mount(
      '<form id="s" data-bind=\'{"d":"2026-10-06"}\'>' +
        '<input id="i" name="x" type="date" data-attr-value="{{d}}"></form>',
    );
    const input = container.querySelector('#i') as HTMLInputElement;

    commit(input, '2025-01-01');
    await waitForDomSettled(6);
    await Core.setBindingData(root, {d: '2026-10-07'});

    await waitForDomSettled(6);
    expect(input.value).toBe('2026-10-07');
    expect(valuesOf(root).x).toBe('2026-10-07');
  });

  it('値の供給の後・書き込みの前に操作したチェックを、data-attr-checked の書き込みで戻さない（回帰）', async () => {
    const root = await mount(
      '<form id="s" data-bind=\'{"on":false}\'>' +
        '<input id="c" name="c" type="checkbox" value="1"' +
        ' data-attr-checked="{{on}}"></form>',
    );
    const checkbox = container.querySelector('#c') as HTMLInputElement;

    afterEvaluating(checkbox, 'data-attr-checked', () => {
      checkbox.focus();
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('input', {bubbles: true}));
      checkbox.dispatchEvent(new Event('change', {bubbles: true}));
      checkbox.blur();
    });
    void Core.setBindingData(root, {on: true});

    await waitForDomSettled(6);
    expect(checkbox.checked).toBe(false);
  });

  it('値の供給の後・書き込みの前に選び直した選択肢を、data-attr-selected の書き込みで戻さない（回帰）', async () => {
    const root = await mount(
      '<form id="s" data-bind=\'{"v":"a"}\'>' +
        '<select id="sel" name="sel">' +
        '<option value="a" data-attr-selected="{{v === \'a\'}}">A</option>' +
        '<option value="b" data-attr-selected="{{v === \'b\'}}">B</option>' +
        '<option value="c" data-attr-selected="{{v === \'c\'}}">C</option>' +
        '</select></form>',
    );
    const select = container.querySelector('#sel') as HTMLSelectElement;

    const optionB = select.options[1];
    afterEvaluating(optionB, 'data-attr-selected', () => commit(select, 'c'));
    void Core.setBindingData(root, {v: 'b'});

    await waitForDomSettled(6);
    expect(select.value).toBe('c');
  });

  it('評価の後に readonly になった欄では、書き込みの前に打った入力より評価結果を反映する（readonly は保護の対象外）', async () => {
    // 仕様「`data-attr-*`」の「`readonly` の欄はここでも例外で、編集できたうちに
    // 付いた印が残っていても評価結果を反映します」。
    const root = await mount(
      '<form id="s" data-bind=\'{"d":"2026-10-06"}\'>' +
        '<input id="i" name="x" type="date" data-attr-value="{{d}}"></form>',
    );
    const input = container.querySelector('#i') as HTMLInputElement;

    afterEvaluating(input, 'data-attr-value', () => {
      // 打鍵だけで `change` は発火させない（`change` のコミットが起こす再評価で
      // 評価結果が入り直すのではなく、待っていた書き込みで入ることを確かめる）。
      input.focus();
      input.value = '2025-01-01';
      input.dispatchEvent(new Event('input', {bubbles: true}));
      input.readOnly = true;
      input.blur();
    });
    void Core.setBindingData(root, {d: '2026-10-07'});

    await waitForDomSettled(6);
    expect(input.value).toBe('2026-10-07');
  });

  it('編集済みの select では、選択肢の再評価が selected 属性を書いても選択を戻さない（回帰）', async () => {
    // 仕様「ユーザー編集と宣言バインドの権威」の「印がある間も属性の反映は
    // 行われますが、DOM の値・チェック状態と内部値（収集値）は編集値のまま
    // 保たれます」。利用者が選んでいない option へ selected 属性を付けると、
    // その option が選ばれてしまう。
    const root = await mount(
      '<form id="s" data-bind=\'{"v":"a"}\'>' +
        '<select id="sel" name="sel">' +
        '<option value="a" data-attr-selected="{{v === \'a\'}}">A</option>' +
        '<option value="b" data-attr-selected="{{v === \'b\'}}">B</option>' +
        '<option value="c" data-attr-selected="{{v === \'c\'}}">C</option>' +
        '</select></form>',
    );
    const select = container.querySelector('#sel') as HTMLSelectElement;
    commit(select, 'c');
    await waitForDomSettled(6);

    await Core.setBindingData(root, {v: 'b'}, {kind: 'nonSupply'});
    await waitForDomSettled(6);

    expect(select.options[1].hasAttribute('selected')).toBe(true);
    expect(select.value).toBe('c');
    expect(valuesOf(root).sel).toBe('c');
  });
});
