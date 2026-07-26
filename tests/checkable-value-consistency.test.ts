/* @vitest-environment jsdom */
/**
 * @fileoverview チェック状態と収集値・内部値の整合性の回帰テスト。
 *
 * 「画面はチェック済みなのに送信値は false」という見た目と送信値の不一致を防ぐ
 * 2 つの経路を検証する。
 *
 * 1. 値収集: boolean チェックボックス（`value="true"` / `value="false"`）は
 *    内部値ではなく DOM の `checked` を真として収集する。グループ扱いの
 *    チェックボックス・ラジオと扱いを揃えたもの。
 * 2. 内部値の追従: 宣言バインド（`checked="{{式}}"` / `data-attr-checked` /
 *    `data-attr-selected`）でチェック状態を書き換えたとき、内部値（値収集や式
 *    評価が参照する値）も DOM へ追従する。従来は DOM だけ書き換えていた。
 */
import {describe, it, beforeEach, afterEach, expect} from 'vitest';
import Core from '../src/core';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

describe('チェック状態と収集値・内部値の整合性', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  const getFrag = (el: HTMLElement): ElementFragment =>
    Fragment.get(el) as ElementFragment;

  const collect = (form: HTMLElement): Record<string, unknown> =>
    Form.getValues(getFrag(form));

  describe('値収集は DOM のチェック状態を真とする', () => {
    it('boolean チェックボックスは内部値が古くても DOM の checked を収集する', async () => {
      container.innerHTML = `
        <form id="f">
          <input id="cb" type="checkbox" name="flag" value="true">
        </form>
      `;
      const form = container.querySelector('#f') as HTMLElement;
      const cb = container.querySelector('#cb') as HTMLInputElement;
      await Core.scan(container);
      await waitForDomSettled();

      expect(collect(form)).toEqual({flag: false});

      // change を発火させずに DOM だけ ON にして、内部値が古い状態を作る。
      cb.checked = true;
      expect(getFrag(cb).getValue()).toBe(false);

      expect(collect(form)).toEqual({flag: true});
    });

    it('value="false" の反転指定でも DOM の checked を基準に収集する', async () => {
      container.innerHTML = `
        <form id="f">
          <input id="cb" type="checkbox" name="flag" value="false">
        </form>
      `;
      const form = container.querySelector('#f') as HTMLElement;
      const cb = container.querySelector('#cb') as HTMLInputElement;
      await Core.scan(container);
      await waitForDomSettled();

      expect(collect(form)).toEqual({flag: true});

      cb.checked = true;
      expect(collect(form)).toEqual({flag: false});
    });

    it('グループ扱いのチェックボックスは従来どおり収集される', async () => {
      container.innerHTML = `
        <form id="f">
          <input type="checkbox" name="tags" value="a" checked>
          <input type="checkbox" name="tags" value="b">
          <input type="checkbox" name="tags" value="c" checked>
        </form>
      `;
      const form = container.querySelector('#f') as HTMLElement;
      await Core.scan(container);
      await waitForDomSettled();

      expect(collect(form)).toEqual({tags: ['a', 'c']});
    });

    it('バインドからの書き戻し後も収集値と DOM が一致する', async () => {
      container.innerHTML = `
        <form id="f" data-bind='{"flag":false}'>
          <input id="cb" type="checkbox" name="flag" value="true">
        </form>
      `;
      const form = container.querySelector('#f') as HTMLElement;
      const cb = container.querySelector('#cb') as HTMLInputElement;
      await Core.scan(container);
      await waitForDomSettled();

      await Core.setBindingData(form, {flag: true});
      await waitForDomSettled();

      expect(cb.checked).toBe(true);
      expect(collect(form)).toEqual({flag: true});

      await Core.setBindingData(form, {flag: false});
      await waitForDomSettled();

      expect(cb.checked).toBe(false);
      expect(collect(form)).toEqual({flag: false});
    });
  });

  describe('宣言バインドでのチェック状態変更に内部値が追従する', () => {
    it('data-attr-checked での変更が収集値へ反映される', async () => {
      container.innerHTML = `
        <form id="f" data-bind='{"on":true}'>
          <input
            id="cb"
            type="checkbox"
            name="flag"
            value="true"
            data-attr-checked="{{on}}"
          >
        </form>
      `;
      const form = container.querySelector('#f') as HTMLElement;
      const cb = container.querySelector('#cb') as HTMLInputElement;
      await Core.scan(container);
      await waitForDomSettled();

      expect(cb.checked).toBe(true);
      expect(getFrag(cb).getValue()).toBe(true);
      expect(collect(form)).toEqual({flag: true});

      await Core.setBindingData(form, {on: false});
      await waitForDomSettled();

      expect(cb.checked).toBe(false);
      expect(getFrag(cb).getValue()).toBe(false);
      expect(collect(form)).toEqual({flag: false});
    });

    it('data-attr-selected での変更が select の内部値へ反映される', async () => {
      container.innerHTML = `
        <form id="f" data-bind='{"pick":true}'>
          <select id="sel" name="kind">
            <option value="a">A</option>
            <option value="b" data-attr-selected="{{pick}}">B</option>
          </select>
        </form>
      `;
      const form = container.querySelector('#f') as HTMLElement;
      const select = container.querySelector('#sel') as HTMLSelectElement;
      await Core.scan(container);
      await waitForDomSettled();

      expect(select.value).toBe('b');
      expect(getFrag(select).getValue()).toBe('b');
      expect(collect(form)).toEqual({kind: 'b'});
    });

    it('radio の checked 宣言バインドでも内部値が追従する', async () => {
      container.innerHTML = `
        <form id="f" data-bind='{"sel":"b"}'>
          <input type="radio" name="r" value="a" checked="{{sel === 'a'}}">
          <input id="rb" type="radio" name="r" value="b" checked="{{sel === 'b'}}">
        </form>
      `;
      const form = container.querySelector('#f') as HTMLElement;
      const radioB = container.querySelector('#rb') as HTMLInputElement;
      await Core.scan(container);
      await waitForDomSettled();

      expect(radioB.checked).toBe(true);
      expect(getFrag(radioB).getValue()).toBe('b');
      expect(collect(form)).toEqual({r: 'b'});
    });
  });
});
