/* @vitest-environment jsdom */
/**
 * @fileoverview 宣言バインドで設定した value の収集に関するテスト
 *
 * 報告された症状の回帰ガードです。
 * 1. `data-attr-value` で設定した値がフォーム収集に載らない
 * 2. `type="hidden"` へ `value="{{式}}"` を書くとテンプレート文字列が収集される
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import Procedure from '../src/procedure';
import {waitForDomSettled} from './helpers/async';

const getFrag = (element: HTMLElement): ElementFragment =>
  Fragment.get(element) as ElementFragment;

describe('宣言バインドで設定した value の収集', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  const mount = async (html: string): Promise<HTMLFormElement> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
    return container.querySelector('form')!;
  };

  describe('data-attr-value', () => {
    it('hidden 入力の値が収集される', async () => {
      const form = await mount(
        `<div data-bind='{"q":{"h":"abc123"}}'>
           <form>
             <input type="hidden" name="approvalHash"
                    data-attr-value="{{q.h ?? ''}}">
           </form>
         </div>`,
      );

      const hidden = form.querySelector<HTMLInputElement>('input')!;
      expect(hidden.value).toBe('abc123');
      expect(getFrag(hidden).getValue()).toBe('abc123');
      expect(Form.getValues(getFrag(form))).toEqual({approvalHash: 'abc123'});
    });

    it('テキスト入力の値が収集される', async () => {
      const form = await mount(
        `<div data-bind='{"q":{"h":"abc123"}}'>
           <form>
             <input type="text" name="approvalHash" data-attr-value="{{q.h}}">
           </form>
         </div>`,
      );

      expect(Form.getValues(getFrag(form))).toEqual({approvalHash: 'abc123'});
    });

    it('textarea と select にも反映され収集される', async () => {
      const form = await mount(
        `<div data-bind='{"q":{"h":"abc123","k":"gas"}}'>
           <form>
             <textarea name="memo" data-attr-value="{{q.h}}"></textarea>
             <select name="kind" data-attr-value="{{q.k}}">
               <option value="">未選択</option>
               <option value="power">電力</option>
               <option value="gas">ガス</option>
             </select>
           </form>
         </div>`,
      );

      expect(form.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe(
        'abc123',
      );
      expect(form.querySelector<HTMLSelectElement>('select')!.value).toBe(
        'gas',
      );
      expect(Form.getValues(getFrag(form))).toEqual({
        memo: 'abc123',
        kind: 'gas',
      });
    });

    it('他項目の change でも値が失われない', async () => {
      const form = await mount(
        `<div data-bind='{"q":{"h":"abc123"}}'>
           <form data-bind='{"confirmed":false}'>
             <input type="hidden" name="approvalHash"
                    data-attr-value="{{q.h ?? ''}}">
             <input type="checkbox" name="confirmed" value="true">
           </form>
         </div>`,
      );

      const check = form.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      )!;
      check.checked = true;
      getFrag(check).syncValue();
      await new Procedure(getFrag(check), 'change').run();
      await waitForDomSettled();

      expect(Form.getValues(getFrag(form))).toEqual({
        approvalHash: 'abc123',
        confirmed: true,
      });
    });
  });

  describe('hidden 入力へのテンプレート式', () => {
    it('評価結果が収集される（テンプレート文字列ではない）', async () => {
      const form = await mount(
        `<div data-bind='{"q":{"h":"abc123"}}'>
           <form>
             <input type="hidden" name="approvalHash" value="{{q.h ?? ''}}">
           </form>
         </div>`,
      );

      expect(Form.getValues(getFrag(form))).toEqual({approvalHash: 'abc123'});
    });

    it('バインド更新で収集値も追従する', async () => {
      const form = await mount(
        `<div id="scope" data-bind='{"q":{"h":"abc123"}}'>
           <form>
             <input type="hidden" name="approvalHash" value="{{q.h ?? ''}}">
           </form>
         </div>`,
      );

      const scope = container.querySelector<HTMLElement>('#scope')!;
      await Core.setBindingData(scope, {q: {h: 'xyz789'}});
      await waitForDomSettled();

      expect(Form.getValues(getFrag(form))).toEqual({approvalHash: 'xyz789'});
    });
  });

  describe('data-form-list の行内', () => {
    it('行データにキーが無くても宣言バインドの値が消えない', async () => {
      const form = await mount(
        `<div data-bind='{"q":{"h":"abc123"}}'>
           <form data-bind='{"rows":[{"name":"A"},{"name":"B"}]}'>
             <div data-form-list="rows" data-each="rows" data-each-arg="r">
               <div>
                 <input name="name">
                 <input type="hidden" name="token" data-attr-value="{{q.h}}">
               </div>
             </div>
           </form>
         </div>`,
      );

      expect(Form.getValues(getFrag(form))).toEqual({
        rows: [
          {name: 'A', token: 'abc123'},
          {name: 'B', token: 'abc123'},
        ],
      });
    });

    /**
     * 行内の入力を差し替えたうえで行データを更新し、更新後の収集値を返します。
     *
     * 行単位の反映は「新規生成した行」と「要素データが変化した再利用行」だけを
     * 対象とするため、`nextRows` で 1 行目を据え置き 2 行目だけを変えると、
     * 「変化していない行は維持され、変化した行だけ判定される」ことを確認できます。
     *
     * @param inner 行テンプレートへ差し込む入力の HTML
     * @param rows 初期の行データ
     * @param nextRows 更新後の行データ
     * @returns 更新後の収集値
     */
    const syncChangedRow = async (
      inner: string,
      rows: unknown[],
      nextRows: unknown[],
    ): Promise<Record<string, unknown>> => {
      const form = await mount(
        `<div data-bind='{"flag":true,"kind":"gas"}'>
           <form data-bind='${JSON.stringify({rows})}'>
             <div data-form-list="rows" data-each="rows" data-each-arg="r">
               <div>
                 <input name="name">
                 ${inner}
               </div>
             </div>
           </form>
         </div>`,
      );
      await Core.setBindingData(form, {rows: nextRows});
      await waitForDomSettled();
      await waitForDomSettled();
      return Form.getValues(getFrag(form)) as Record<string, unknown>;
    };

    it('リテラル value のチェックボックスは行データに無ければ解除される', async () => {
      // 0.27.0 の「行データに無いキーは空にする」規則が生きていることの対照。
      const values = await syncChangedRow(
        '<input type="checkbox" name="tags" value="t1">',
        [
          {name: 'A', tags: ['t1']},
          {name: 'B', tags: ['t1']},
        ],
        [{name: 'A', tags: ['t1']}, {name: 'C'}],
      );

      expect(values).toEqual({
        rows: [
          {name: 'A', tags: 't1'},
          {name: 'C', tags: null},
        ],
      });
    });

    it('value にテンプレート式を書いたチェックボックスも解除される', async () => {
      // チェック系の `value` は送信値であってチェック状態ではないため、宣言バインドの
      // 例外対象にしてはいけない（前の行のチェックが残る）。
      const values = await syncChangedRow(
        '<input type="checkbox" name="tags" value="{{\'t1\'}}">',
        [
          {name: 'A', tags: ['t1']},
          {name: 'B', tags: ['t1']},
        ],
        [{name: 'A', tags: ['t1']}, {name: 'C'}],
      );

      expect(values).toEqual({
        rows: [
          {name: 'A', tags: 't1'},
          {name: 'C', tags: null},
        ],
      });
    });

    it('checked にテンプレート式を書いたチェック状態は維持される', async () => {
      const values = await syncChangedRow(
        '<input type="checkbox" name="agreed" value="true" checked="{{flag}}">',
        [{name: 'A'}, {name: 'B'}],
        [{name: 'A'}, {name: 'C'}],
      );

      expect(values).toEqual({
        rows: [
          {name: 'A', agreed: true},
          {name: 'C', agreed: true},
        ],
      });
    });

    it('data-attr-checked のチェック状態は維持される', async () => {
      const values = await syncChangedRow(
        '<input type="checkbox" name="agreed" value="true"' +
          ' data-attr-checked="{{flag}}">',
        [{name: 'A'}, {name: 'B'}],
        [{name: 'A'}, {name: 'C'}],
      );

      expect(values).toEqual({
        rows: [
          {name: 'A', agreed: true},
          {name: 'C', agreed: true},
        ],
      });
    });

    it('option の data-attr-selected による選択は維持される', async () => {
      const values = await syncChangedRow(
        `<select name="kind">
           <option value=""></option>
           <option value="power"
                   data-attr-selected="{{kind === 'power'}}">電力</option>
           <option value="gas"
                   data-attr-selected="{{kind === 'gas'}}">ガス</option>
         </select>`,
        [{name: 'A'}, {name: 'B'}],
        [{name: 'A'}, {name: 'C'}],
      );

      expect(values).toEqual({
        rows: [
          {name: 'A', kind: 'gas'},
          {name: 'C', kind: 'gas'},
        ],
      });
    });
  });

  describe('評価結果が値を持たない場合', () => {
    it('data-attr-value が null になると収集値も空になる', async () => {
      const form = await mount(
        `<div id="scope" data-bind='{"q":{"h":"abc123"}}'>
           <form>
             <input type="text" name="approvalHash" data-attr-value="{{q.h}}">
           </form>
         </div>`,
      );
      const input = form.querySelector<HTMLInputElement>('input')!;
      const scope = container.querySelector<HTMLElement>('#scope')!;
      expect(Form.getValues(getFrag(form))).toEqual({approvalHash: 'abc123'});

      await Core.setBindingData(scope, {q: {h: null}});
      await waitForDomSettled();

      // 属性は削除され、値（DOM・内部値とも）は空へ揃うこと。属性だけを削除して
      // 内部値が旧値のまま残ると、画面と送信内容が食い違う。
      expect(input.hasAttribute('value')).toBe(false);
      expect(input.value).toBe('');
      expect(Form.getValues(getFrag(form))).toEqual({approvalHash: ''});
    });

    it('未解決参照になった場合も収集値が空になる', async () => {
      const form = await mount(
        `<div id="scope" data-bind='{"q":{"h":"abc123"}}'>
           <form>
             <input type="text" name="approvalHash" data-attr-value="{{q.h}}">
           </form>
         </div>`,
      );
      expect(Form.getValues(getFrag(form))).toEqual({approvalHash: 'abc123'});

      // 参照先そのものを失わせる（未解決参照）。仕様では属性削除の扱いが
      // null と同じため、値の扱いも揃える。
      const scope = container.querySelector<HTMLElement>('#scope')!;
      await Core.setBindingData(scope, {q: null});
      await waitForDomSettled();

      expect(Form.getValues(getFrag(form))).toEqual({approvalHash: ''});
    });

    it('hidden では value プロパティの代入が属性へ反映される', async () => {
      const form = await mount(
        `<div id="scope" data-bind='{"q":{"h":"abc123"}}'>
           <form>
             <input type="hidden" name="approvalHash" data-attr-value="{{q.h}}">
           </form>
         </div>`,
      );
      const hidden = form.querySelector<HTMLInputElement>('input')!;
      const scope = container.querySelector<HTMLElement>('#scope')!;

      await Core.setBindingData(scope, {q: {h: null}});
      await waitForDomSettled();

      // `type="hidden"` の `value` プロパティは HTML 仕様で content attribute へ
      // 反映されるため、値を空へ揃えると属性は削除ではなく空文字として残る。
      // 送信される値は空で、収集値と一致する。
      expect(hidden.getAttribute('value')).toBe('');
      expect(Form.getValues(getFrag(form))).toEqual({approvalHash: ''});
    });

    it('直接書いた value のテンプレート式でも収集値が空になる', async () => {
      const form = await mount(
        `<div id="scope" data-bind='{"q":{"h":"abc123"}}'>
           <form>
             <input type="text" name="approvalHash" value="{{q.h}}">
           </form>
         </div>`,
      );
      expect(Form.getValues(getFrag(form))).toEqual({approvalHash: 'abc123'});

      const scope = container.querySelector<HTMLElement>('#scope')!;
      await Core.setBindingData(scope, {q: {h: null}});
      await waitForDomSettled();

      expect(Form.getValues(getFrag(form))).toEqual({approvalHash: ''});
    });
  });

  describe('name 付き入力との併用', () => {
    it('再評価では宣言バインドの評価結果が優先される', async () => {
      const form = await mount(
        `<div id="scope" data-bind='{"src":"fromAttr","tick":1}'>
           <form data-bind='{"code":"fromForm"}'>
             <input name="code" data-attr-value="{{src}}">
             <span>{{tick}}</span>
           </form>
         </div>`,
      );
      const input = form.querySelector<HTMLInputElement>('input')!;

      // 初期表示はフォームの `data-bind` からの復元が後に走るため、そちらが残る。
      expect(Form.getValues(getFrag(form))).toEqual({code: 'fromForm'});

      // 利用者の編集をコミットしたあと、無関係な再評価を起こす。
      input.value = 'typed';
      getFrag(input).syncValue();
      input.dispatchEvent(new Event('change', {bubbles: true}));
      await waitForDomSettled();
      expect(Form.getValues(getFrag(form))).toEqual({code: 'typed'});

      const scope = container.querySelector<HTMLElement>('#scope')!;
      await Core.setBindingData(scope, {src: 'fromAttr', tick: 2});
      await waitForDomSettled();

      // 宣言バインドが値の権威となるため、コミット済みの編集は巻き戻る。
      // `name` を持つ編集可能な入力へ `data-attr-value` を併用すると真実源が
      // 二つになるため、ガイドの「参照スコープを書込スコープに揃える」を参照。
      expect(input.value).toBe('fromAttr');
      expect(Form.getValues(getFrag(form))).toEqual({code: 'fromAttr'});
    });
  });
});
