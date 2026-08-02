/* @vitest-environment jsdom */
/**
 * @fileoverview 候補が後から描画される `<select>` への値の反映を検証します。
 *
 * 入力欄への書き戻しは行生成より前に走るため、候補を `data-each` で流し込む
 * `<select>` では、値を代入した時点で該当する `<option>` がまだ存在しません。
 * `<select>` は候補に無い値の代入を無視するため、ブラウザが先頭の `<option>` を
 * 自動選択し、**画面と収集値が食い違った**まま残っていました（収集値は内部値を
 * 返すので保存値は正しい一方、利用者には別の値が選ばれて見える）。
 *
 * 行生成の後に、DOM が受け付けられなかった書き込みを再試行することで、供給された
 * 値が画面にも載ることを確かめます。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

describe('候補が後から描画される select への値の反映', () => {
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
   * 候補を `data-each` で流し込むフォームを組み立てます。
   *
   * @returns 生成した form 要素
   */
  const mount = async (): Promise<HTMLFormElement> => {
    container.innerHTML = `
      <form data-bind='{"pref":null,"opts":[]}'>
        <select name="pref" data-each="opts" data-each-arg="o">
          <option value="{{o.v}}">{{o.v}}</option>
        </select>
      </form>`;
    await Core.scan(container);
    await waitForDomSettled();
    return container.querySelector('form') as HTMLFormElement;
  };

  it('値と候補を同じ更新で渡すと、画面にも供給された値が載る', async () => {
    const form = await mount();

    await Core.setBindingData(form, {
      pref: '東京都',
      opts: [{v: '大阪府'}, {v: '東京都'}],
    });
    await waitForDomSettled();

    const select = form.querySelector('select') as HTMLSelectElement;
    expect(Array.from(select.options).map(option => option.value)).toEqual([
      '大阪府',
      '東京都',
    ]);
    expect(select.value).toBe('東京都');
    expect(Form.getValues(getFrag(form))).toEqual({pref: '東京都'});
  });

  it('候補が後の更新で届いても、画面に供給された値が載る', async () => {
    // 値の供給と候補の取得が別の経路で届く構成（`data-fetch` の応答など）。
    const form = await mount();

    await Core.setBindingData(form, {pref: '東京都', opts: []});
    await waitForDomSettled();
    const select = form.querySelector('select') as HTMLSelectElement;
    // 候補が無い間は載せようがない。収集値は供給された値を保つ。
    expect(Form.getValues(getFrag(form))).toEqual({pref: '東京都'});

    await Core.setBindingData(form, {
      pref: '東京都',
      opts: [{v: '大阪府'}, {v: '東京都'}],
    });
    await waitForDomSettled();

    expect(select.value).toBe('東京都');
    expect(Form.getValues(getFrag(form))).toEqual({pref: '東京都'});
  });

  it('利用者が選び直した後は、候補の再描画でも巻き戻さない', async () => {
    const form = await mount();

    await Core.setBindingData(form, {
      pref: '東京都',
      opts: [{v: '大阪府'}, {v: '東京都'}],
    });
    await waitForDomSettled();

    const select = form.querySelector('select') as HTMLSelectElement;
    select.value = '大阪府';
    select.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();
    await waitForDomSettled();

    expect(select.value).toBe('大阪府');
    expect(Form.getValues(getFrag(form))).toEqual({pref: '大阪府'});
  });

  it('候補に無い値は画面へ載せられないが、収集値は保つ', async () => {
    const form = await mount();

    await Core.setBindingData(form, {
      pref: '北海道',
      opts: [{v: '大阪府'}, {v: '東京都'}],
    });
    await waitForDomSettled();

    const select = form.querySelector('select') as HTMLSelectElement;
    // 候補に無いのでブラウザは先頭を選ぶ。保存済みの値を失わないよう、収集値は
    // 供給された値のままにする。
    expect(select.value).toBe('大阪府');
    expect(Form.getValues(getFrag(form))).toEqual({pref: '北海道'});
  });
});
