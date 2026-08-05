/* @vitest-environment jsdom */
/**
 * @fileoverview 条件式の評価スコープが収集値と対応することの検証。
 *
 * `data-validity` / `data-{event}-if` は「バインディングデータを土台に、フォーム内で
 * 宣言されている収集キーを収集値で置き換えた」スコープで評価する。宣言キーの列挙が
 * フォームコンテナ自身の `data-form-object` / `data-form-list` を見落とすと、宣言キーは
 * 配下の `name`、収集値は入れ子という食い違いが起き、条件がバインドデータ（コミット
 * 済みの 1 手前の値）で評価される。最後の欄を直してすぐ押した操作を誤判定するため、
 * 宣言の位置を変えても同じスコープになることを確かめる。
 *
 * 期待値の根拠は仕様「条件の評価スコープ」。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

describe('条件式の評価スコープと収集キーの対応', () => {
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
    container.remove();
  });

  const getFrag = (element: Element): ElementFragment =>
    Fragment.get(element) as ElementFragment;

  /**
   * マークアップを組み立て、`b` だけ画面の値をバインドデータからずらします。
   *
   * バインドデータは `a === b`（条件を満たす）、画面は `a !== b`（満たさない）。
   * 条件が収集値を見ていれば「不一致」と判定されます。
   *
   * @param html コンテナへ入れる HTML
   * @returns 生成した form 要素
   */
  const mountDiverged = async (html: string): Promise<HTMLFormElement> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
    const form = container.querySelector('form') as HTMLFormElement;
    (form.querySelector('[name=a]') as HTMLInputElement).value = 'x';
    (form.querySelector('[name=b]') as HTMLInputElement).value = 'y';
    return form;
  };

  /**
   * 条件を評価し、`b` の欄に設定された検証メッセージを返します。
   *
   * @param form 対象のフォーム
   * @returns 検証メッセージ（条件を満たす場合は空文字）
   */
  const evaluate = (form: HTMLFormElement): string => {
    Form.applyCustomValidity(getFrag(form));
    return (form.querySelector('[name=b]') as HTMLInputElement)
      .validationMessage;
  };

  /** `b` に付ける条件の宣言（`a` と一致していれば有効）。 */
  const VALIDITY = (expression: string): string =>
    `data-validity="{{${expression}}}" data-validity-message="不一致"`;

  it('フォーム自身の data-form-object でも収集値で評価される', async () => {
    const form = await mountDiverged(`
      <form data-form-object="customer" data-bind='{"customer":{"a":"x","b":"x"}}'>
        <input name="a">
        <input name="b" ${VALIDITY('customer.a === customer.b')}>
      </form>`);

    expect(
      Array.from(Form.collectDeclaredFieldKeys(getFrag(form))),
    ).toEqual(['customer']);
    expect(evaluate(form)).toBe('不一致');
  });

  it('フォーム自身の data-form-list でも収集値で評価される', async () => {
    const form = await mountDiverged(`
      <form data-form-list="items" data-bind='{"items":[{"a":"x","b":"x"}]}'>
        <div>
          <input name="a">
          <input name="b" ${VALIDITY('items[0].a === items[0].b')}>
        </div>
      </form>`);

    expect(Array.from(Form.collectDeclaredFieldKeys(getFrag(form)))).toEqual([
      'items',
    ]);
    expect(evaluate(form)).toBe('不一致');
  });

  it('入れ子の data-form-object は従来どおり収集値で評価される', async () => {
    const form = await mountDiverged(`
      <form data-bind='{"customer":{"a":"x","b":"x"}}'>
        <div data-form-object="customer">
          <input name="a">
          <input name="b" ${VALIDITY('customer.a === customer.b')}>
        </div>
      </form>`);

    expect(evaluate(form)).toBe('不一致');
  });

  it('data-form-arg は従来どおり収集値で評価される', async () => {
    container.innerHTML = `
      <div data-bind='{"customer":{"a":"x","b":"x"}}'>
        <form data-form-arg="customer">
          <input name="a">
          <input name="b" ${VALIDITY('customer.a === customer.b')}>
        </form>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled();
    const form = container.querySelector('form') as HTMLFormElement;
    (form.querySelector('[name=a]') as HTMLInputElement).value = 'x';
    (form.querySelector('[name=b]') as HTMLInputElement).value = 'y';

    expect(evaluate(form)).toBe('不一致');
  });

  it('入れ子の宣言が無いフォームは従来どおり収集値で評価される', async () => {
    const form = await mountDiverged(`
      <form data-bind='{"a":"x","b":"x"}'>
        <input name="a">
        <input name="b" ${VALIDITY('a === b')}>
      </form>`);

    expect(evaluate(form)).toBe('不一致');
  });

  it('入れ子の入力名が同名のバインドキーを未定義で隠さない', async () => {
    // 収集値は customer 配下に入るため、最上位の `mode` は収集キーではない。
    // 配下の `name` を宣言キーとして扱うと、同名のバインドキーが未定義になる。
    const form = await mountDiverged(`
      <form data-form-object="customer"
        data-bind='{"customer":{"a":"x","b":"x"},"mode":"edit"}'>
        <input name="a">
        <input name="b" ${VALIDITY("mode === 'edit'")}>
        <input name="mode" value="ignored" data-form-detach>
      </form>`);

    expect(evaluate(form)).toBe('');
  });
});
