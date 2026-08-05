/* @vitest-environment jsdom */
/**
 * @fileoverview 送信値を宣言バインドで与えたチェックボックス群の回帰テスト。
 *
 * `data-each` の行ごとに異なる送信値を持たせる構成では、`value` を `data-attr-value`
 * で与える。この場合フラグメントの属性マップには `value` が無いため、チェック状態を
 * 決める際に送信値を属性マップから引くと `null` になり、収集値（配列）と比較して
 * 常に不一致になる。その結果、2 つ目をチェックした直後の書き戻しでグループ全体の
 * チェックが落ちていた（1 つだけのときは収集値がスカラで内部値と一致し、書き戻し
 * 自体が起きないため表面化しない）。
 *
 * 期待値の根拠は仕様「同名チェックボックス・ラジオの収集値の形」と仕様「`data-attr-*`」。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

describe('宣言バインドで送信値を与えたチェックボックス群', () => {
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

  /**
   * 入力欄をチェックして確定させ、描画が落ち着くまで待ちます。
   *
   * @param input 対象の入力欄
   * @returns 待機完了で解決します
   */
  const check = async (input: HTMLInputElement): Promise<void> => {
    input.checked = true;
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();
    await waitForDomSettled();
  };

  it('data-each の行の同名チェックボックスを 2 つ選んでも落ちない', async () => {
    // 報告の再現（オプションのお申込み画面）。
    const form = await mount(`
      <div data-bind='{"view":{"options":[
        {"optionId":"11","optionName":"安心サポート"},
        {"optionId":"12","optionName":"広告非表示"}]}}'>
        <form>
          <div data-each="view.options" data-each-key="optionId" data-each-arg="o">
            <input type="checkbox" name="optionIds" data-attr-value="{{o.optionId}}"
              data-attr-id="opt-{{o.optionId}}">
            <label data-attr-for="opt-{{o.optionId}}">{{o.optionName}}</label>
          </div>
        </form>
      </div>`);
    const boxes = Array.from(
      form.querySelectorAll<HTMLInputElement>('input[type=checkbox]'),
    );
    expect(boxes.map(box => box.value)).toEqual(['11', '12']);

    await check(boxes[0]);
    await check(boxes[1]);

    expect(boxes.map(box => box.checked)).toEqual([true, true]);
    expect(Form.getValues(getFrag(form))).toEqual({optionIds: ['11', '12']});
  });

  it('data-each の行のラジオへバインドデータの選択が反映される', async () => {
    // 保存済みレコードの復元。書き戻しは送信値との一致で選択を決めるため、
    // 送信値を宣言バインドで与えた行でも解決できる必要がある。
    const form = await mount(`
      <div data-bind='{"view":{"plans":[{"planId":"a"},{"planId":"b"}]}}'>
        <form data-bind='{"planId":"b"}'>
          <div data-each="view.plans" data-each-key="planId" data-each-arg="p">
            <input type="radio" name="planId" data-attr-value="{{p.planId}}">
          </div>
        </form>
      </div>`);
    const radios = Array.from(
      form.querySelectorAll<HTMLInputElement>('input[type=radio]'),
    );

    expect(radios.map(radio => radio.checked)).toEqual([false, true]);
    expect(Form.getValues(getFrag(form))).toEqual({planId: 'b'});
  });

  it('value を持たないチェックボックスへバインドデータの状態が反映される', async () => {
    // value 属性が無い場合、送信値はブラウザ既定の "on"。属性マップにも無いため、
    // 宣言バインドで与えた場合と同じ経路を通る。
    const form = await mount(`
      <form data-bind='{"agreed":"on"}'>
        <input type="checkbox" name="agreed">
      </form>`);
    const box = form.querySelector('input') as HTMLInputElement;

    expect(box.checked).toBe(true);
    expect(Form.getValues(getFrag(form))).toEqual({agreed: 'on'});

    // 利用者の操作でも落ちない。
    box.checked = false;
    box.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();
    await waitForDomSettled();
    expect(box.checked).toBe(false);
    expect(Form.getValues(getFrag(form))).toEqual({agreed: null});
  });
});
