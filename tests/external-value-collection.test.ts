/* @vitest-environment jsdom */
/**
 * @fileoverview イベントを伴わない値の代入が収集されることの検証。
 *
 * 外部ライブラリ（郵便番号からの住所補完など）やブラウザの自動入力は
 * `element.value` へ直接代入するため `change` / `input` が発火しない。内部値だけを
 * 見て収集していると、画面には表示されているのに送信・保存されない欄ができる
 * （必須検証も通るため気づけない）。収集の直前に DOM の値を取り込むことで、
 * 画面の見たままが収集されることを確かめる。
 *
 * あわせて、DOM を取り込んではいけない 2 つの状態（Haori 自身の書き戻しが描画
 * キュー待ちの間、および `<option>` が未描画で `<select>` が値を受け付けられなかった
 * 場合）で、供給された値を失わないことを確かめる。
 *
 * 期待値の根拠は仕様「外部ライブラリが書き込んだ入力値」。
 */
import {describe, it, beforeEach, afterEach, expect} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

describe('イベントを伴わない代入の収集', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    // change イベントを内部値の同期と双方向コミットへ委譲するために起動する。
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

  it('外部ライブラリが代入した住所を収集する', async () => {
    // 報告の再現構成（申込画面の住所ブロック）。
    const form = await mount(`
      <form data-form-object="customer" data-bind='{"customer":{}}'>
        <div class="h-adr">
          <input name="postalCode">
          <select name="prefecture">
            <option value=""></option>
            <option value="東京都">東京都</option>
            <option value="大阪府">大阪府</option>
          </select>
          <input name="municipality">
          <input name="town">
        </div>
      </form>`);

    // 外部ライブラリ相当の代入（イベントは発火しない）。
    (form.querySelector('[name=prefecture]') as HTMLSelectElement).value =
      '東京都';
    (form.querySelector('[name=municipality]') as HTMLInputElement).value =
      '千代田区';
    (form.querySelector('[name=town]') as HTMLInputElement).value = '千代田';

    expect(Form.getValues(getFrag(form))).toEqual({
      customer: {
        postalCode: '',
        prefecture: '東京都',
        municipality: '千代田区',
        town: '千代田',
      },
    });
  });

  it('代入された値が双方向バインディングでバインドデータへ載る', async () => {
    const form = await mount(`
      <form data-form-object="customer" data-bind='{"customer":{}}'>
        <input name="postalCode">
        <input name="town">
      </form>`);

    (form.querySelector('[name=town]') as HTMLInputElement).value = '千代田';

    // 利用者が別の欄を確定すると収集が走る（報告の「他の欄を編集した後」）。
    const postal = form.querySelector('[name=postalCode]') as HTMLInputElement;
    postal.value = '1000001';
    postal.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();
    await waitForDomSettled();

    expect(getFrag(form).getRawBindingData()).toEqual({
      customer: {postalCode: '1000001', town: '千代田'},
    });
  });

  it('textarea と hidden への代入も収集する', async () => {
    const form = await mount(`
      <form>
        <textarea name="note"></textarea>
        <input type="hidden" name="token">
      </form>`);

    (form.querySelector('[name=note]') as HTMLTextAreaElement).value = '備考';
    (form.querySelector('[name=token]') as HTMLInputElement).value = 'abc';

    expect(Form.getValues(getFrag(form))).toEqual({
      note: '備考',
      token: 'abc',
    });
  });

  it('外部ライブラリが値を空へ戻した場合も収集へ反映する', async () => {
    const form = await mount(`
      <form>
        <input name="town" value="千代田">
      </form>`);
    expect(Form.getValues(getFrag(form))).toEqual({town: '千代田'});

    (form.querySelector('[name=town]') as HTMLInputElement).value = '';

    expect(Form.getValues(getFrag(form))).toEqual({town: ''});
  });

  it('data-form-list の行の中でも収集する', async () => {
    // 報告の 04（利用場所住所）の構成。行の中の入力も同じ経路で収集される。
    const form = await mount(`
      <form data-bind='{"places":[{"id":1},{"id":2}]}'>
        <div data-form-list="places" data-each="places" data-each-arg="p"
             data-each-key="id">
          <div>
            <input name="prefecture">
            <input name="town">
          </div>
        </div>
      </form>`);
    await waitForDomSettled();

    const towns = form.querySelectorAll<HTMLInputElement>('[name=town]');
    expect(towns).toHaveLength(2);
    (form.querySelectorAll('[name=prefecture]')[0] as HTMLInputElement).value =
      '東京都';
    towns[0].value = '千代田';
    towns[1].value = '丸の内';

    expect(Form.getValues(getFrag(form))).toEqual({
      places: [
        {prefecture: '東京都', town: '千代田'},
        {prefecture: '', town: '丸の内'},
      ],
    });
  });

  it('type="number" への代入は数値へ正規化して収集する', async () => {
    const form = await mount(`
      <form>
        <input type="number" name="count">
      </form>`);

    (form.querySelector('[name=count]') as HTMLInputElement).value = '12';

    expect(Form.getValues(getFrag(form))).toEqual({count: 12});
  });

  it('multiple select への外部からの選択も配列で収集する', async () => {
    const form = await mount(`
      <form>
        <select name="plans" multiple>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
      </form>`);

    const select = form.querySelector('select') as HTMLSelectElement;
    select.options[1].selected = true;
    select.options[2].selected = true;

    expect(Form.getValues(getFrag(form))).toEqual({plans: ['B', 'C']});
  });

  it('書き戻しが描画キュー待ちの間は DOM の古い値を取り込まない', async () => {
    const form = await mount(`
      <form>
        <input name="town" value="旧">
      </form>`);

    const input = form.querySelector('[name=town]') as HTMLInputElement;
    // 完了を待たずに収集する。DOM への反映はキュー（rAF バッチ）待ちのため、
    // この時点では element.value は「旧」のまま。
    const applied = getFrag(input).setValue('新');
    expect(input.value).toBe('旧');
    expect(Form.getValues(getFrag(form))).toEqual({town: '新'});

    await applied;
    await waitForDomSettled();
    expect(input.value).toBe('新');
    expect(Form.getValues(getFrag(form))).toEqual({town: '新'});
  });

  it('option が未描画の select へ供給された値を失わない', async () => {
    // 候補を data-each で流し込む select は、入力欄への書き戻しが行生成より前に
    // 走るため、代入した時点では該当する option が無く DOM に値が載らない。
    // この状態で DOM を取り込むと、ブラウザが自動選択した先頭 option の値へ
    // 化けてしまう（保存済みの値が黙って別の値になる）。
    const form = await mount(`
      <form data-bind='{"pref":null,"opts":[]}'>
        <select name="pref" data-each="opts" data-each-arg="o">
          <option value="{{o.v}}">{{o.v}}</option>
        </select>
      </form>`);

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
    expect(Form.getValues(getFrag(form))).toEqual({pref: '東京都'});

    // 利用者が選び直せば、以降はその選択が収集される。
    select.value = '大阪府';
    select.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();
    expect(Form.getValues(getFrag(form))).toEqual({pref: '大阪府'});
  });

  it('チェック状態は従来どおり DOM を真として収集する（回帰）', async () => {
    const form = await mount(`
      <form>
        <input type="checkbox" name="agreed" value="true">
        <input type="radio" name="plan" value="A">
        <input type="radio" name="plan" value="B">
      </form>`);

    (form.querySelector('[name=agreed]') as HTMLInputElement).checked = true;
    (form.querySelectorAll('[name=plan]')[1] as HTMLInputElement).checked =
      true;

    expect(Form.getValues(getFrag(form))).toEqual({agreed: true, plan: 'B'});
  });
});
