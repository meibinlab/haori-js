/* @vitest-environment jsdom */
/**
 * @fileoverview リセット後に `data-each` の描画が復元されることの回帰テスト。
 *
 * リセットは「値の初期化」であり、`data-each` が描画した行（選択肢など）は
 * 現在のデータから描き直されなければならない。行を削除したあとに描画済み判定の
 * 記録が残っていると、続く再評価が差分更新を省略して行が復元されず、フォーム内に
 * API 取得の選択肢を持つ画面で `data-{event}-reset-before` が使えなくなる。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import Procedure from '../src/procedure';
import EventDispatcher from '../src/event_dispatcher';
import {waitForDomSettled} from './helpers/async';

const getFrag = (element: HTMLElement): ElementFragment =>
  Fragment.get(element) as ElementFragment;

describe('リセットと data-each の再描画', () => {
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
   * 指定したボタンの手続きを完了まで実行します。
   *
   * @param selector ボタンのセレクター
   * @returns 手続き完了を待つ Promise
   */
  const run = async (selector: string): Promise<void> => {
    const button = container.querySelector(selector) as HTMLElement;
    await new Procedure(getFrag(button), 'click').run();
  };

  /** フォームの外側で取得した選択肢の要素データ */
  const PLANS = {
    content: [
      {id: 'a', planName: 'A'},
      {id: 'b', planName: 'B'},
      {id: 'c', planName: 'C'},
    ],
  };

  /** フォームの外側で取得した選択肢をフォーム内の `<select>` へ描く構成 */
  const OPTIONS_OUTSIDE_FORM = `
    <div id="opts" data-bind='${JSON.stringify({plans: PLANS})}'>
      <form id="edit-form" novalidate>
        <select name="planIds" multiple data-each="plans.content"
                data-each-key="id" data-each-arg="p">
          <option value="{{p.id}}">{{p.planName}}</option>
        </select>
        <input name="memo">
      </form>
    </div>
    <button id="new" data-click-reset-before="#edit-form"
            data-click-data='{"memo":"新規"}' data-click-bind="#edit-form"></button>
    <button id="clear" data-click-reset="#edit-form"></button>`;

  /**
   * `<select>` の選択肢の値を取得します。
   *
   * @returns 選択肢の value 配列
   */
  const optionValues = (): string[] => {
    const select = container.querySelector('select') as HTMLSelectElement;
    return Array.from(select.options).map(option => option.value);
  };

  /**
   * 利用者の選択と同じ順序で `<select>` を操作します。
   *
   * @param value 選択する値
   * @returns DOM 反映の完了を待つ Promise
   */
  const select = async (value: string): Promise<void> => {
    const element = container.querySelector('select') as HTMLSelectElement;
    const option = Array.from(element.options).find(o => o.value === value)!;
    option.selected = true;
    element.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();
  };

  it('reset-before の後もフォーム外から供給された選択肢が残る', async () => {
    await mount(OPTIONS_OUTSIDE_FORM);
    expect(optionValues()).toEqual(['a', 'b', 'c']);

    await run('#new');

    expect(optionValues()).toEqual(['a', 'b', 'c']);
    // 選択肢の表示テキストも再評価済み（テンプレート式が残らない）
    const texts = Array.from(
      (container.querySelector('select') as HTMLSelectElement).options,
    ).map(option => option.textContent);
    expect(texts).toEqual(['A', 'B', 'C']);
  });

  it('リセットで前回の選択状態は解除される', async () => {
    await mount(OPTIONS_OUTSIDE_FORM);
    await select('b');
    const form = container.querySelector('#edit-form') as HTMLFormElement;
    expect(Form.getValues(getFrag(form))).toMatchObject({planIds: ['b']});

    await run('#new');

    const element = container.querySelector('select') as HTMLSelectElement;
    // 選択肢は残したうえで、選択だけが解除されている
    expect(optionValues()).toEqual(['a', 'b', 'c']);
    expect(Array.from(element.selectedOptions)).toEqual([]);
    expect(Form.getValues(getFrag(form))).toMatchObject({planIds: []});
  });

  it('reset 単体でも選択肢が復元される', async () => {
    await mount(OPTIONS_OUTSIDE_FORM);
    await select('c');

    await run('#clear');

    expect(optionValues()).toEqual(['a', 'b', 'c']);
    const element = container.querySelector('select') as HTMLSelectElement;
    expect(Array.from(element.selectedOptions)).toEqual([]);
  });

  it('リセット後に同じ要素データを供給し直しても選択肢が残る', async () => {
    // 再取得（`data-{event}-refetch`）が同じ内容を返した場合と同じ供給。
    // 修正前は削除済みの行が「同じ要素データで描画済み」と判定されるため、
    // 供給し直しても復元しなかった。
    await mount(OPTIONS_OUTSIDE_FORM);
    await run('#clear');

    const opts = container.querySelector('#opts') as HTMLElement;
    await Core.setBindingData(opts, {plans: JSON.parse(JSON.stringify(PLANS))});
    await waitForDomSettled();

    expect(optionValues()).toEqual(['a', 'b', 'c']);
  });

  it('選択肢データが空になっていれば復元しない', async () => {
    await mount(OPTIONS_OUTSIDE_FORM);
    const opts = container.querySelector('#opts') as HTMLElement;
    await Core.setBindingData(opts, {plans: {content: []}});
    await waitForDomSettled();
    expect(optionValues()).toEqual([]);

    await run('#clear');

    expect(optionValues()).toEqual([]);
  });

  it('data-form-list の複製行はリセットで初期件数へ戻る', async () => {
    await mount(`
      <form id="list-form" data-bind='{"rows":[{"name":"one"}]}'>
        <div data-form-list="rows" data-each="rows" data-each-arg="r">
          <div class="row">
            <input name="name">
            <button type="button" class="add" data-click-row-add></button>
          </div>
        </div>
      </form>
      <button id="reset-list" data-click-reset="#list-form"></button>`);
    expect(container.querySelectorAll('.row').length).toBe(1);

    await run('.add');
    expect(container.querySelectorAll('.row').length).toBe(2);

    await run('#reset-list');

    expect(container.querySelectorAll('.row').length).toBe(1);
    const form = container.querySelector('#list-form') as HTMLFormElement;
    expect(Form.getValues(getFrag(form))).toEqual({rows: [{name: 'one'}]});
  });
});
