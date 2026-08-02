/* @vitest-environment jsdom */
/**
 * @fileoverview 値収集が内部値を書き換えないことの検証。
 *
 * 収集は DOM の値を読んで返すが、内部値は書き換えない。書き換えると「バインド
 * データには載っていないのに内部値だけが新しい」状態が生まれ、続く逆方向同期
 * （`Form.syncValues`）が古いバインドデータと不一致とみなして入力欄を上書きし、
 * 利用者が入力した値が表示からも収集値からも消える。
 *
 * バインドへ反映しない収集の代表が `data-validity` の条件評価で、これはバインド
 * 更新のたびに走る（`Core.reevaluateReactiveSpecialAttributes`）。そのため
 * `data-validity` を宣言したフォームでは、確定が続くと無関係の欄の値が消えていた。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

describe('値収集は内部値を書き換えない', () => {
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
   * マークアップを組み立ててスキャン完了まで待ちます。
   *
   * @param html コンテナへ入れる HTML
   * @returns 生成した form 要素
   */
  const mount = async (html: string): Promise<HTMLFormElement> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
    return container.querySelector('form') as HTMLFormElement;
  };

  it('収集しても内部値は変わらない', async () => {
    const form = await mount(`
      <form data-form-object="customer" data-bind='{"customer":{"email":""}}'>
        <input name="email">
      </form>`);
    const email = form.querySelector('[name=email]') as HTMLInputElement;

    // イベントを伴わない代入（外部ライブラリ・ブラウザの自動入力）。
    email.value = 'a@example.com';

    // 収集値は画面の見たまま。
    expect(Form.getValues(getFrag(form))).toEqual({
      customer: {email: 'a@example.com'},
    });
    // 内部値は収集では動かない（バインドデータへ載るのは収集結果を通じてだけ）。
    expect(getFrag(email).getValue()).toBe('');
  });

  it('収集の後に古いバインドデータで同期しても入力値が消えない', async () => {
    // 報告の再現（間隔を空けない連続確定）。確定した欄の収集値は、入力中の別の欄を
    // 含まないスナップショットとしてバインドへ渡る。その適用が、条件評価の収集より
    // 後に走る。
    const form = await mount(`
      <form data-form-object="customer" data-bind='{"customer":{"email":""}}'>
        <input name="email"
          data-validity="{{customer.email !== ''}}"
          data-validity-message="必須">
      </form>`);
    const email = form.querySelector('[name=email]') as HTMLInputElement;

    // 別の欄の確定に伴うバインド更新（この時点の email は空）。
    const stale = Core.setBindingData(form, {customer: {email: ''}});
    // その適用中に、利用者が email を入力する（確定前なのでイベントは無い）。
    email.value = 'a@example.com';
    await stale;
    await waitForDomSettled();

    // 続けて、同じ古いスナップショットが適用される（次の欄の確定など）。
    await Core.setBindingData(form, {customer: {email: ''}});
    await waitForDomSettled();

    expect(email.value).toBe('a@example.com');
    expect(Form.getValues(getFrag(form))).toEqual({
      customer: {email: 'a@example.com'},
    });
  });

  it('data-validity の条件評価は収集値（画面の値）を見る', async () => {
    const form = await mount(`
      <form data-bind='{"email":""}'>
        <input name="email"
          data-validity="{{email !== ''}}"
          data-validity-message="必須">
      </form>`);
    const email = form.querySelector('[name=email]') as HTMLInputElement;

    // 条件を満たさない状態では検証メッセージが設定される。
    Form.applyCustomValidity(getFrag(form));
    expect(email.validationMessage).toBe('必須');

    // イベントを伴わない代入でも、条件は最新の画面の値で評価される
    // （収集を読み取りにしても、条件評価が見る値は変わらない）。
    email.value = 'a@example.com';
    Form.applyCustomValidity(getFrag(form));
    expect(email.validationMessage).toBe('');
    // 条件評価は内部値を書き換えない。
    expect(getFrag(email).getValue()).toBe('');
  });
});
