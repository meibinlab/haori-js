/* @vitest-environment jsdom */
/**
 * @fileoverview `data-form-name`（収集キーの宣言）のテスト
 *
 * HTML のラジオグループはフォーム単位で排他になるため、`data-form-list` の行内で
 * 同じ `name` を使うと行をまたいで排他になり、1 行しか選択を保持できません。
 * `data-form-name` で収集キーを宣言すると、DOM の `name` は行ごとに自動生成され、
 * グループが行単位に分かれます。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import Procedure from '../src/procedure';
import {waitForCondition, waitForDomSettled} from './helpers/async';

const getFrag = (element: HTMLElement): ElementFragment =>
  Fragment.get(element) as ElementFragment;

/**
 * ラジオボタンを選択し、change の処理完了までを待ちます。
 *
 * @param radio 対象のラジオボタン
 * @returns 処理完了の Promise
 */
const check = async (radio: HTMLInputElement): Promise<void> => {
  radio.checked = true;
  getFrag(radio).syncValue();
  await new Procedure(getFrag(radio), 'change').run();
  await waitForDomSettled();
};

describe('data-form-name', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    Dev.disable();
    container = document.createElement('div');
    document.body.appendChild(container);
    // 行操作（data-click-row-*）のクリックを配送するために必要。
    dispatcher = new EventDispatcher();
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    Dev.disable();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  /**
   * HTML をマウントして初期化まで待ちます。
   *
   * @param html マウントする HTML
   * @returns 最初の form 要素
   */
  const mount = async (html: string): Promise<HTMLFormElement> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
    return container.querySelector('form')!;
  };

  /**
   * フォーム内のラジオボタンを取得します。
   *
   * @param form 対象のフォーム
   * @returns ラジオボタンの配列
   */
  const radiosOf = (form: HTMLFormElement): HTMLInputElement[] =>
    Array.from(form.querySelectorAll<HTMLInputElement>('input[type="radio"]'));

  const ROW_RADIO_FORM = `
    <form data-bind='{"rows":[{"title":"A"},{"title":"B"}]}'>
      <div data-form-list="rows" data-each="rows" data-each-arg="r">
        <div>
          <input name="title">
          <input type="radio" data-form-name="plan" value="p1">
          <input type="radio" data-form-name="plan" value="p2">
        </div>
      </div>
    </form>`;

  describe('data-form-list の行内', () => {
    it('行ごとに独立して選択できる', async () => {
      const form = await mount(ROW_RADIO_FORM);
      const radios = radiosOf(form);

      // 1 行目で p1、2 行目で p2 を選ぶ。
      await check(radios[0]);
      await check(radios[3]);

      expect(radios.map(radio => radio.checked)).toEqual([
        true,
        false,
        false,
        true,
      ]);
      expect(Form.getValues(getFrag(form))).toEqual({
        rows: [
          {title: 'A', plan: 'p1'},
          {title: 'B', plan: 'p2'},
        ],
      });
    });

    it('DOM の name は行ごとに異なる値へ生成される', async () => {
      const form = await mount(ROW_RADIO_FORM);
      const names = radiosOf(form).map(radio => radio.name);

      // 同じ行の中では同一（= 排他）、行をまたぐと別（= 独立）。
      expect(names[0]).toBe(names[1]);
      expect(names[2]).toBe(names[3]);
      expect(names[0]).not.toBe(names[2]);
    });

    it('初期 data-bind から行ごとに復元される', async () => {
      const form = await mount(`
        <form data-bind='{"rows":[{"title":"A","plan":"p1"},
                                  {"title":"B","plan":"p1"}]}'>
          <div data-form-list="rows" data-each="rows" data-each-arg="r">
            <div>
              <input name="title">
              <input type="radio" data-form-name="plan" value="p1">
              <input type="radio" data-form-name="plan" value="p2">
            </div>
          </div>
        </form>`);

      // 同じ値を複数行で保持できる（`name` を共有していると 1 行しか残らない）。
      expect(radiosOf(form).map(radio => radio.checked)).toEqual([
        true,
        false,
        true,
        false,
      ]);
      expect(Form.getValues(getFrag(form))).toEqual({
        rows: [
          {title: 'A', plan: 'p1'},
          {title: 'B', plan: 'p1'},
        ],
      });
    });

    it('後から追加された行も独立する', async () => {
      const form = await mount(`
        <form data-bind='{"rows":[{"title":"A"}]}'>
          <div data-form-list="rows" data-each="rows" data-each-arg="r">
            <div>
              <input name="title">
              <input type="radio" data-form-name="plan" value="p1">
              <input type="radio" data-form-name="plan" value="p2">
            </div>
          </div>
        </form>`);

      await Core.setBindingData(form, {
        rows: [{title: 'A'}, {title: 'B'}, {title: 'C'}],
      });
      await waitForDomSettled();
      await waitForDomSettled();

      const radios = radiosOf(form);
      expect(radios).toHaveLength(6);
      // 複製元の生成済み name を引き継がず、行ごとに作り直されること。
      expect(new Set(radios.map(radio => radio.name)).size).toBe(3);

      await check(radios[0]);
      await check(radios[2]);
      await check(radios[4]);

      expect(Form.getValues(getFrag(form))).toEqual({
        rows: [
          {title: 'A', plan: 'p1'},
          {title: 'B', plan: 'p1'},
          {title: 'C', plan: 'p1'},
        ],
      });
    });

    it('name を書いた場合は生成せず、行をまたぐ 1 グループになる', async () => {
      // 「複数行の中から 1 行を選ぶ」構成を表現するための挙動。
      const form = await mount(`
        <form data-bind='{"rows":[{"title":"A"},{"title":"B"}]}'>
          <div data-form-list="rows" data-each="rows" data-each-arg="r">
            <div>
              <input name="title">
              <input type="radio" name="primary" data-form-name="primary"
                     value="yes">
            </div>
          </div>
        </form>`);
      const radios = radiosOf(form);

      expect(radios.map(radio => radio.name)).toEqual(['primary', 'primary']);

      await check(radios[0]);
      await check(radios[1]);

      expect(radios.map(radio => radio.checked)).toEqual([false, true]);
      expect(Form.getValues(getFrag(form))).toEqual({
        rows: [
          {title: 'A', primary: null},
          {title: 'B', primary: 'yes'},
        ],
      });
    });

    it('行データにキーが無ければ選択が解除される', async () => {
      // 行単位の反映（未指定キーの空化）は宣言バインドの `checked` を持たない
      // ラジオには従来どおり適用される。
      const form = await mount(`
        <form data-bind='{"rows":[{"t":"A","plan":"p1"},
                                  {"t":"B","plan":"p1"}]}'>
          <div data-form-list="rows" data-each="rows" data-each-arg="r">
            <div>
              <input name="t">
              <input type="radio" data-form-name="plan" value="p1">
              <input type="radio" data-form-name="plan" value="p2">
            </div>
          </div>
        </form>`);

      await Core.setBindingData(form, {rows: [{t: 'A', plan: 'p1'}, {t: 'C'}]});
      await waitForDomSettled();
      await waitForDomSettled();

      expect(radiosOf(form).map(radio => radio.checked)).toEqual([
        true,
        false,
        false,
        false,
      ]);
      expect(Form.getValues(getFrag(form))).toEqual({
        rows: [
          {t: 'A', plan: 'p1'},
          {t: 'C', plan: null},
        ],
      });
    });

    it('同じ行の複数グループが混ざらない', async () => {
      const form = await mount(`
        <form data-bind='{"rows":[{"t":"A"}]}'>
          <div data-form-list="rows" data-each="rows" data-each-arg="r">
            <div>
              <input name="t">
              <input type="radio" data-form-name="plan" value="p1">
              <input type="radio" data-form-name="plan" value="p2">
              <input type="radio" data-form-name="size" value="s1">
              <input type="radio" data-form-name="size" value="s2">
            </div>
          </div>
        </form>`);
      const radios = radiosOf(form);

      // 収集キーごとに別グループ（同じ行なので識別番号は共通）。
      expect(radios[0].name).toBe(radios[1].name);
      expect(radios[2].name).toBe(radios[3].name);
      expect(radios[0].name).not.toBe(radios[2].name);

      await check(radios[0]);
      await check(radios[2]);

      expect(Form.getValues(getFrag(form))).toEqual({
        rows: [{t: 'A', plan: 'p1', size: 's1'}],
      });
    });

    it('data-form-object の中でも行スコープになる', async () => {
      const form = await mount(`
        <form data-bind='{"rows":[{"t":"A"},{"t":"B"}]}'>
          <div data-form-list="rows" data-each="rows" data-each-arg="r">
            <div>
              <input name="t">
              <div data-form-object="detail">
                <input type="radio" data-form-name="plan" value="p1">
                <input type="radio" data-form-name="plan" value="p2">
              </div>
            </div>
          </div>
        </form>`);
      const radios = radiosOf(form);

      await check(radios[0]);
      await check(radios[3]);

      // グループは行単位、収集はオブジェクト配下へネストされる。
      expect(radios.map(radio => radio.checked)).toEqual([
        true,
        false,
        false,
        true,
      ]);
      expect(Form.getValues(getFrag(form))).toEqual({
        rows: [
          {t: 'A', detail: {plan: 'p1'}},
          {t: 'B', detail: {plan: 'p2'}},
        ],
      });
    });
  });

  describe('行操作との組み合わせ', () => {
    const OPERABLE_FORM = (button: string): string => `
      <form data-bind='{"rows":[{"t":"A"},{"t":"B"},{"t":"C"}]}'>
        <div data-form-list="rows" data-each="rows" data-each-arg="r">
          <div>
            <input name="t">
            <input type="radio" data-form-name="plan" value="p1">
            <input type="radio" data-form-name="plan" value="p2">
            <button type="button" ${button}>op</button>
          </div>
        </div>
      </form>`;

    it('並べ替えで選択が行データに追従する', async () => {
      const form = await mount(OPERABLE_FORM('data-click-row-next'));
      const titles = () =>
        Array.from(
          form.querySelectorAll<HTMLInputElement>('input[name="t"]'),
        ).map(input => input.value);

      await check(radiosOf(form)[0]);
      await check(radiosOf(form)[3]);
      expect(Form.getValues(getFrag(form))).toEqual({
        rows: [
          {t: 'A', plan: 'p1'},
          {t: 'B', plan: 'p2'},
          {t: 'C', plan: null},
        ],
      });

      // 1 行目を下へ移動する（行操作は再描画を経るため確定を待つ）。
      form.querySelector<HTMLElement>('button')!.click();
      await waitForCondition(() => titles()[0] === 'B', {
        description: '行が入れ替わる',
        maxAttempts: 40,
      });
      await waitForDomSettled();

      expect(Form.getValues(getFrag(form))).toEqual({
        rows: [
          {t: 'B', plan: 'p2'},
          {t: 'A', plan: 'p1'},
          {t: 'C', plan: null},
        ],
      });
    });

    it('行の削除で残りの行の選択が保たれる', async () => {
      const form = await mount(OPERABLE_FORM('data-click-row-remove'));
      const rowCount = () => form.querySelectorAll('[data-row]').length;

      await check(radiosOf(form)[0]);
      await check(radiosOf(form)[3]);
      await check(radiosOf(form)[4]);

      // 1 行目（p1 を選択済み）を削除する。
      form.querySelector<HTMLElement>('button')!.click();
      await waitForCondition(() => rowCount() === 2, {
        description: '行が削除される',
        maxAttempts: 40,
      });
      await waitForDomSettled();

      expect(Form.getValues(getFrag(form))).toEqual({
        rows: [
          {t: 'B', plan: 'p2'},
          {t: 'C', plan: 'p1'},
        ],
      });
    });
  });

  describe('収集キーの解決', () => {
    it('name を持たない入力も収集される', async () => {
      const form = await mount(`
        <form>
          <input data-form-name="code" value="abc">
        </form>`);

      // DOM の name は付けない（不要なため生成対象は radio だけ）。
      expect(form.querySelector('input')!.hasAttribute('name')).toBe(false);
      expect(Form.getValues(getFrag(form))).toEqual({code: 'abc'});
    });

    it('name と併記した場合は data-form-name が収集キーになる', async () => {
      const form = await mount(`
        <form>
          <input name="codeDom" data-form-name="code" value="abc">
        </form>`);

      expect(Form.getValues(getFrag(form))).toEqual({code: 'abc'});
    });

    it('逆方向同期でも data-form-name のキーで値が入る', async () => {
      const form = await mount(`
        <form data-bind='{"code":"xyz"}'>
          <input data-form-name="code">
        </form>`);

      expect(form.querySelector<HTMLInputElement>('input')!.value).toBe('xyz');
    });

    it('評価値が空のときは開発モードで警告し、name へフォールバックする', async () => {
      Dev.enable();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const form = await mount(`
        <form data-bind='{"other":1}'>
          <input data-form-name="{{missing}}" value="abc">
          <input name="fallback" data-form-name="" value="xyz">
        </form>`);

      // 収集キーが決まらない入力は収集されず、`name` があればそちらが使われる。
      expect(Form.getValues(getFrag(form))).toEqual({fallback: 'xyz'});
      expect(warn).toHaveBeenCalled();
      expect(
        warn.mock.calls.some(call =>
          String(call[1]).includes('form-name evaluated to an empty key'),
        ),
      ).toBe(true);
    });

    it('キー検索が data-form-name のキーで一致する', async () => {
      // サーバのエラー応答をフィールドへ振り分ける経路で使われる検索。
      const form = await mount(`
        <form>
          <input data-form-name="code" value="abc">
        </form>`);

      const found = Form.findFragmentsByKey(getFrag(form), 'code');
      expect(found).toHaveLength(1);
      expect(found[0].getTarget()).toBe(form.querySelector('input'));
    });
  });

  describe('通常のフォーム', () => {
    it('行の外ではフォーム単位の排他になる', async () => {
      const form = await mount(`
        <form data-bind='{"plan":"p2"}'>
          <input type="radio" data-form-name="plan" value="p1">
          <input type="radio" data-form-name="plan" value="p2">
        </form>`);
      const radios = radiosOf(form);

      // 初期 data-bind からの復元も従来どおり効く。
      expect(radios.map(radio => radio.checked)).toEqual([false, true]);
      expect(radios[0].name).toBe(radios[1].name);

      await check(radios[0]);

      expect(radios.map(radio => radio.checked)).toEqual([true, false]);
      expect(Form.getValues(getFrag(form))).toEqual({plan: 'p1'});
    });
  });
});
