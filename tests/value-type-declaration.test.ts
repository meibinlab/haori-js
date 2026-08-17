/* @vitest-environment jsdom */
/**
 * @fileoverview `data-value-type` による収集値の型宣言の検証。
 *
 * 期待値の根拠は仕様「`data-value-type`」です。
 * - 「`boolean` は `"true"` / `"false"` を大文字小文字の区別なく判定します。**空文字と
 *   値なしは `null`** です（未入力を `false` として送らないため）。それ以外の文字列
 *   （`"1"` / `"on"` / `"はい"` など）も `null` です」
 * - 「`number` の規則は `type="number"` と同じです」
 * - 「正規化するのは読み取った後で、DOM の値を読むすべての経路（`change` での取り込み、
 *   収集、バインドから内部値への反映、`value="{{式}}"` / `data-attr-value` の評価）で
 *   同じ規則が適用されます」
 * - 「対象は値を持つ入力です。…それ以外（`checkbox` / `radio` / `file` /
 *   `<select multiple>`）へ宣言した場合は**無視し**、開発モードで警告します」
 * - 「`type` より宣言が優先されます」「宣言しない限り従来どおりです」
 * - 上記以外の値を書いた場合は「宣言が無いものとして扱い、開発モードで警告します」
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import Core from '../src/core';
import Dev from '../src/dev';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import Log from '../src/log';
import {waitForDomSettled} from './helpers/async';

const getFrag = (element: HTMLElement): ElementFragment =>
  Fragment.get(element) as ElementFragment;

describe('data-value-type', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    const dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    Dev.disable();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    sessionStorage.clear();
  });

  /**
   * HTML を配置してスキャンし、最初のフォームを返します。
   *
   * @param html 配置する HTML
   * @returns 配置したフォーム
   */
  const mount = async (html: string): Promise<HTMLFormElement> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
    return container.querySelector('form')!;
  };

  describe('boolean', () => {
    it('hidden へ宣言すると真偽値で収集される', async () => {
      const form = await mount(
        `<div data-bind='{"agree":true,"reject":false}'>
           <form>
             <input type="hidden" name="agree" data-value-type="boolean"
                    data-attr-value="{{agree}}">
             <input type="hidden" name="reject" data-value-type="boolean"
                    data-attr-value="{{reject}}">
           </form>
         </div>`,
      );

      expect(Form.getValues(getFrag(form))).toEqual({
        agree: true,
        reject: false,
      });
    });

    it('value="{{式}}" でも false が値として書かれる', async () => {
      const form = await mount(
        `<div data-bind='{"reject":false}'>
           <form>
             <input type="hidden" name="reject" data-value-type="boolean"
                    value="{{reject}}">
           </form>
         </div>`,
      );

      const hidden = form.querySelector<HTMLInputElement>('input')!;
      expect(hidden.value).toBe('false');
      expect(Form.getValues(getFrag(form))).toEqual({reject: false});
    });

    it('大文字小文字は区別しない', async () => {
      const form = await mount(
        `<form>
           <input type="hidden" name="a" data-value-type="boolean" value="TRUE">
           <input type="hidden" name="b" data-value-type="boolean" value="False">
         </form>`,
      );

      expect(Form.getValues(getFrag(form))).toEqual({a: true, b: false});
    });

    it('空文字と判定できない文字列は null になる', async () => {
      const form = await mount(
        `<form>
           <input type="hidden" name="empty" data-value-type="boolean" value="">
           <input type="hidden" name="one" data-value-type="boolean" value="1">
           <input type="hidden" name="on" data-value-type="boolean" value="on">
         </form>`,
      );

      expect(Form.getValues(getFrag(form))).toEqual({
        empty: null,
        one: null,
        on: null,
      });
    });

    it('送信ボディで型が保たれる', async () => {
      const bodies: string[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(((
        _url: string,
        options: RequestInit,
      ) => {
        bodies.push(String(options.body));
        return Promise.resolve(
          new Response('{}', {headers: {'Content-Type': 'application/json'}}),
        );
      }) as unknown as typeof fetch);

      await mount(
        `<div data-bind='{"agree":true,"count":12}'>
           <form id="f">
             <input type="hidden" name="agree" data-value-type="boolean"
                    data-attr-value="{{agree}}">
             <input type="hidden" name="count" data-value-type="number"
                    data-attr-value="{{count}}">
             <input name="memo" value="控え">
           </form>
           <button type="button" id="send" data-click-form="#f"
                   data-click-fetch="http://api.test/save"
                   data-click-fetch-method="POST">送信</button>
         </div>`,
      );
      container.querySelector<HTMLButtonElement>('#send')!.click();
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 30));
      await waitForDomSettled();

      expect(bodies).toHaveLength(1);
      expect(JSON.parse(bodies[0])).toEqual({
        agree: true,
        count: 12,
        memo: '控え',
      });
    });

    it('change の双方向コミットでバインドデータへ真偽値で載る', async () => {
      const form = await mount(
        `<form data-bind='{}'>
           <input type="hidden" name="agree" data-value-type="boolean"
                  value="false">
         </form>`,
      );

      const hidden = form.querySelector<HTMLInputElement>('input')!;
      hidden.value = 'true';
      hidden.dispatchEvent(new Event('change', {bubbles: true}));
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 30));
      await waitForDomSettled();

      expect(getFrag(form).getRawBindingData()).toEqual({agree: true});
    });

    it.each([true, false])(
      'バインドされた真偽値（%s）は DOM へ文字列で載り、収集値は真偽値のまま往復する',
      async (bound: boolean) => {
        const form = await mount(
          `<form>
             <input type="hidden" name="agree" data-value-type="boolean">
           </form>`,
        );

        await Form.setValues(getFrag(form), {agree: bound});
        await waitForDomSettled();

        const hidden = form.querySelector<HTMLInputElement>('input')!;
        expect(hidden.value).toBe(String(bound));
        expect(getFrag(hidden).getValue()).toBe(bound);
        expect(Form.getValues(getFrag(form))).toEqual({agree: bound});
      },
    );

    it('data-store の保存値でも型が保たれる', async () => {
      // 仕様「`data-store`」は宣言したキーの値をそのまま JSON レコードへ書き出す。
      // 収集値が真偽値になるため、保存値も真偽値になる。
      const form = await mount(
        `<form data-bind='{}' data-store="apply" data-store-params="agree">
           <input type="hidden" name="agree" data-value-type="boolean"
                  value="true">
         </form>`,
      );

      const hidden = form.querySelector<HTMLInputElement>('input')!;
      hidden.dispatchEvent(new Event('change', {bubbles: true}));
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 30));
      await waitForDomSettled();

      expect(JSON.parse(sessionStorage.getItem('apply')!)).toEqual({
        agree: true,
      });
    });
  });

  describe('number', () => {
    it('hidden へ宣言すると数値で収集され、受け付けない形は null になる', async () => {
      const form = await mount(
        `<form>
           <input type="hidden" name="count" data-value-type="number" value="12">
           <input type="hidden" name="rate" data-value-type="number" value="2.5">
           <input type="hidden" name="hex" data-value-type="number" value="0x10">
           <input type="hidden" name="empty" data-value-type="number" value="">
         </form>`,
      );

      expect(Form.getValues(getFrag(form))).toEqual({
        count: 12,
        rate: 2.5,
        hex: null,
        empty: null,
      });
    });

    it('単一選択の select とテキストエリアでも数値で収集される', async () => {
      const form = await mount(
        `<form>
           <select name="planId" data-value-type="number">
             <option value="1">A</option>
             <option value="2" selected>B</option>
           </select>
           <textarea name="note" data-value-type="number">7</textarea>
         </form>`,
      );

      expect(Form.getValues(getFrag(form))).toEqual({planId: 2, note: 7});
    });
  });

  describe('string', () => {
    it('type="number" よりも宣言が優先され、文字列で収集される', async () => {
      const form = await mount(
        `<form>
           <input type="number" name="code" data-value-type="string" value="012">
         </form>`,
      );

      expect(Form.getValues(getFrag(form))).toEqual({code: '012'});
    });

    it('数値をバインドしても文字列へそろえる', async () => {
      const form = await mount(
        `<form>
           <input name="code" data-value-type="string">
         </form>`,
      );

      await Form.setValues(getFrag(form), {code: 12});
      await waitForDomSettled();

      const input = form.querySelector<HTMLInputElement>('input')!;
      expect(getFrag(input).getValue()).toBe('12');
      expect(Form.getValues(getFrag(form))).toEqual({code: '12'});
    });
  });

  describe('後方互換', () => {
    it('宣言しない hidden は従来どおり文字列で収集される', async () => {
      const form = await mount(
        `<div data-bind='{"agree":true,"count":12}'>
           <form>
             <input type="hidden" name="agree" data-attr-value="{{agree}}">
             <input type="hidden" name="count" data-attr-value="{{count}}">
           </form>
         </div>`,
      );

      expect(Form.getValues(getFrag(form))).toEqual({
        agree: 'true',
        count: '12',
      });
    });
  });

  describe('data-each の行', () => {
    it('宣言があっても行スコープだけを参照する行と判定される', async () => {
      // 仕様「`data-value-type`」の宣言は静的な値（式ではない）なので、行の中に
      // 書いても「行の外を参照し得る属性」にはならない。行スコープだけを参照する
      // 行は、要素データが同値なら再評価を省略する（仕様「data-each の差分更新
      // アルゴリズム」）。
      container.innerHTML = `
        <div id="root">
          <p id="status">{{status}}</p>
          <ul data-each="items" data-each-key="id" data-each-arg="item">
            <li>
              <span>{{item.render(item)}}</span>
              <input name="n" data-value-type="number"
                     data-attr-value="{{item.n}}">
            </li>
          </ul>
        </div>`;

      const root = container.querySelector<HTMLElement>('#root')!;
      const renderSpy = vi.fn((item: {label: string}) => item.label);
      const items = [
        {id: 'a', label: 'alpha', n: 1, render: renderSpy},
        {id: 'b', label: 'beta', n: 2, render: renderSpy},
      ];

      await Core.scan(root);
      await Core.setBindingData(root, {items, status: 'before'});
      await waitForDomSettled();
      await new Promise(resolve => setTimeout(resolve, 150));
      await waitForDomSettled();

      const baselineCalls = renderSpy.mock.calls.length;
      expect(baselineCalls).toBeGreaterThanOrEqual(2);

      await Core.setBindingData(root, {items, status: 'after'});
      await waitForDomSettled();

      expect(renderSpy).toHaveBeenCalledTimes(baselineCalls);
      expect(container.querySelector('#status')?.textContent).toBe('after');
    });
  });

  describe('宣言を無視する場合', () => {
    it('checkbox への宣言は無視し、開発モードで警告する', async () => {
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      Dev.enable();

      const form = await mount(
        `<form>
           <input type="checkbox" name="agree" value="true"
                  data-value-type="boolean" checked>
         </form>`,
      );

      // boolean モードのチェックボックスとして真偽値で収集される（従来どおり）。
      expect(Form.getValues(getFrag(form))).toEqual({agree: true});
      expect(
        warn.mock.calls.some(args =>
          args.some(
            argument =>
              typeof argument === 'string' &&
              argument.includes('data-value-type="boolean"'),
          ),
        ),
      ).toBe(true);
    });

    it('複数選択の select への宣言は無視し、配列のまま収集する', async () => {
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      Dev.enable();

      const form = await mount(
        `<form>
           <select name="ids" multiple data-value-type="number">
             <option value="1" selected>A</option>
             <option value="2" selected>B</option>
           </select>
         </form>`,
      );

      expect(Form.getValues(getFrag(form))).toEqual({ids: ['1', '2']});
      expect(
        warn.mock.calls.some(args =>
          args.some(
            argument =>
              typeof argument === 'string' &&
              argument.includes('data-value-type="number"'),
          ),
        ),
      ).toBe(true);
    });

    it('未知の型は宣言が無いものとして扱い、開発モードで警告する', async () => {
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      Dev.enable();

      const form = await mount(
        `<form>
           <input type="hidden" name="agree" data-value-type="bool" value="true">
         </form>`,
      );

      expect(Form.getValues(getFrag(form))).toEqual({agree: 'true'});
      expect(
        warn.mock.calls.some(args =>
          args.some(
            argument =>
              typeof argument === 'string' &&
              argument.includes('data-value-type="bool"'),
          ),
        ),
      ).toBe(true);
    });

    it('開発モードでなければ警告しない', async () => {
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      Dev.disable();

      await mount(
        `<form>
           <input type="radio" name="pick" value="a"
                  data-value-type="boolean" checked>
         </form>`,
      );

      expect(
        warn.mock.calls.some(args =>
          args.some(
            argument =>
              typeof argument === 'string' &&
              argument.includes('data-value-type'),
          ),
        ),
      ).toBe(false);
    });
  });
});
