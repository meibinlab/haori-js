/* @vitest-environment jsdom */
/**
 * @fileoverview data-each + data-form-list による編集可能な繰り返し行のテスト
 *
 * 報告された 3 症状の回帰ガードです。
 * 1. 行内の `<select>` / チェックボックスが初期 `data-bind` から復元されない
 * 2. `row-add` / `row-remove` がバインディングデータに追従しない
 * 3. `data-each-arg` と併用した `data-each-index` が解決できない
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import Procedure from '../src/procedure';
import {waitForCondition, waitForDomSettled} from './helpers/async';

const getFrag = (element: HTMLElement): ElementFragment =>
  Fragment.get(element) as ElementFragment;

describe('data-each + data-form-list（編集可能な繰り返し行）', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  /** 行内に text / select / checkbox を持つ編集可能な行の構成 */
  const EDITABLE_ROWS = (initial: string, extra = ''): string => `
    <form data-bind='${initial}'>
      <div id="list" data-form-list="contracts" data-each="contracts"
           data-each-arg="c" data-each-index="i">
        <div>
          <span class="idx">{{i}}</span>
          <input name="name">
          <select name="kind">
            <option value="">未選択</option>
            <option value="power">電力</option>
            <option value="gas">ガス</option>
          </select>
          <input type="checkbox" name="active" value="true">
          <button type="button" class="add" data-click-row-add></button>
          <button type="button" class="del" data-click-row-remove></button>
          <button type="button" class="del0" data-click-row-remove
                  data-click-row-remove-empty></button>
          <button type="button" class="up" data-click-row-prev></button>
          <button type="button" class="down" data-click-row-next></button>
        </div>
      </div>
      ${extra}
    </form>`;

  const mount = async (html: string): Promise<HTMLFormElement> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
    return container.querySelector('form')!;
  };

  const clickNth = async (
    form: HTMLElement,
    selector: string,
    nth = 0,
  ): Promise<void> => {
    const buttons = form.querySelectorAll<HTMLElement>(selector);
    await new Procedure(getFrag(buttons[nth]), 'click').run();
    await waitForDomSettled();
  };

  const selectValues = (form: HTMLElement): string[] =>
    Array.from(form.querySelectorAll('select')).map(select => select.value);

  const checkedStates = (form: HTMLElement): boolean[] =>
    Array.from(
      form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ).map(checkbox => checkbox.checked);

  const textValues = (form: HTMLElement): string[] =>
    Array.from(
      form.querySelectorAll<HTMLInputElement>('input[name="name"]'),
    ).map(input => input.value);

  const indexTexts = (form: HTMLElement): (string | null)[] =>
    Array.from(form.querySelectorAll('.idx')).map(span => span.textContent);

  const rowCount = (form: HTMLElement): number =>
    form.querySelectorAll('[data-row]').length;

  describe('初期 data-bind からの入力欄復元', () => {
    it('行内の select・チェックボックス・テキストが復元される', async () => {
      const form = await mount(
        EDITABLE_ROWS(
          '{"contracts":[' +
            '{"kind":"power","name":"A","active":true},' +
            '{"kind":"gas","name":"B","active":false}]}',
        ),
      );

      expect(selectValues(form)).toEqual(['power', 'gas']);
      expect(checkedStates(form)).toEqual([true, false]);
      expect(textValues(form)).toEqual(['A', 'B']);
      expect(Form.getValues(getFrag(form))).toEqual({
        contracts: [
          {name: 'A', kind: 'power', active: true},
          {name: 'B', kind: 'gas', active: false},
        ],
      });
    });

    it('data-each を伴わない単純なフォームでも復元される', async () => {
      const form = await mount(
        `<form data-bind='{"kind":"gas","active":true,"name":"X"}'>
           <input name="name">
           <select name="kind">
             <option value="">未選択</option>
             <option value="power">電力</option>
             <option value="gas">ガス</option>
           </select>
           <input type="checkbox" name="active" value="true">
         </form>`,
      );

      expect(selectValues(form)).toEqual(['gas']);
      expect(checkedStates(form)).toEqual([true]);
      expect(textValues(form)).toEqual(['X']);
      expect(Form.getValues(getFrag(form))).toEqual({
        name: 'X',
        kind: 'gas',
        active: true,
      });
    });

    it('data-bind に無いキーの入力欄は value 属性の初期値を保つ', async () => {
      const form = await mount(
        `<form data-bind='{"kind":"gas"}'>
           <input name="memo" value="既定値">
           <select name="kind">
             <option value="">未選択</option>
             <option value="gas">ガス</option>
           </select>
         </form>`,
      );

      const memo = form.querySelector<HTMLInputElement>('input[name="memo"]')!;
      expect(memo.value).toBe('既定値');
      expect(selectValues(form)).toEqual(['gas']);
    });

    it('復元されるため、1 項目の change で他項目の値が失われない', async () => {
      const form = await mount(
        EDITABLE_ROWS(
          '{"contracts":[' +
            '{"kind":"power","name":"A","active":true},' +
            '{"kind":"gas","name":"B","active":false}]}',
        ),
      );

      const name = form.querySelector<HTMLInputElement>('input[name="name"]')!;
      name.value = '編集済み';
      getFrag(name).syncValue();
      await new Procedure(getFrag(name), 'change').run();
      await waitForDomSettled();

      expect(getFrag(form).getRawBindingData()).toEqual({
        contracts: [
          {name: '編集済み', kind: 'power', active: true},
          {name: 'B', kind: 'gas', active: false},
        ],
      });
    });
  });

  describe('バインド更新で新規生成された行への値反映', () => {
    it('setBindingData で生成された行に値が入る（data-fetch 相当）', async () => {
      const form = await mount(EDITABLE_ROWS('{"contracts":[]}'));
      expect(rowCount(form)).toBe(0);

      await Core.setBindingData(form, {
        contracts: [
          {kind: 'power', name: 'A', active: true},
          {kind: 'gas', name: 'B', active: false},
        ],
      });
      await waitForDomSettled();

      expect(selectValues(form)).toEqual(['power', 'gas']);
      expect(checkedStates(form)).toEqual([true, false]);
      expect(textValues(form)).toEqual(['A', 'B']);
    });

    it('行の途中へ挿入しても以降の行の入力値が前の行のまま残らない', async () => {
      const form = await mount(
        EDITABLE_ROWS('{"contracts":[{"name":"A"},{"name":"B"}]}'),
      );

      await clickNth(form, '.add', 0);

      expect(textValues(form)).toEqual(['A', '', 'B']);
      expect(getFrag(form).getRawBindingData()).toEqual({
        contracts: [{name: 'A'}, {}, {name: 'B'}],
      });
    });
  });

  describe('data-each-index', () => {
    it('data-each-arg と併用しても行スコープで解決できる', async () => {
      const form = await mount(
        EDITABLE_ROWS('{"contracts":[{"name":"A"},{"name":"B"}]}'),
      );
      expect(indexTexts(form)).toEqual(['0', '1']);
    });

    it('要素データがインデックスキーで汚染されない', async () => {
      const form = await mount(
        EDITABLE_ROWS('{"contracts":[{"name":"A"},{"name":"B"}]}'),
      );

      const rows = Array.from(form.querySelectorAll<HTMLElement>('[data-row]'));
      expect(rows.map(row => getFrag(row).getRawBindingData())).toEqual([
        {c: {name: 'A'}, i: 0},
        {c: {name: 'B'}, i: 1},
      ]);
    });
  });

  describe('行の増減がバインディングデータへ追従する', () => {
    it('row-add は配列へ空の要素を挿入する', async () => {
      const form = await mount(
        EDITABLE_ROWS('{"contracts":[{"name":"A"},{"name":"B"}]}'),
      );

      await clickNth(form, '.add', 0);

      expect(rowCount(form)).toBe(3);
      expect(indexTexts(form)).toEqual(['0', '1', '2']);
      expect(getFrag(form).getRawBindingData()).toEqual({
        contracts: [{name: 'A'}, {}, {name: 'B'}],
      });
    });

    it('row-remove は配列から要素を削除する', async () => {
      const form = await mount(
        EDITABLE_ROWS('{"contracts":[{"name":"A"},{"name":"B"}]}'),
      );

      await clickNth(form, '.del', 0);

      expect(rowCount(form)).toBe(1);
      expect(getFrag(form).getRawBindingData()).toEqual({
        contracts: [{name: 'B'}],
      });
    });

    it('既定では最後の 1 行を削除しない', async () => {
      const form = await mount(EDITABLE_ROWS('{"contracts":[{"name":"A"}]}'));

      await clickNth(form, '.del', 0);

      expect(rowCount(form)).toBe(1);
      expect(getFrag(form).getRawBindingData()).toEqual({
        contracts: [{name: 'A'}],
      });
    });

    it('row-remove-empty を指定すると 0 件まで削除できる', async () => {
      const form = await mount(EDITABLE_ROWS('{"contracts":[{"name":"A"}]}'));

      await clickNth(form, '.del0', 0);

      expect(rowCount(form)).toBe(0);
      expect(getFrag(form).getRawBindingData()).toEqual({contracts: []});
      expect(Form.getValues(getFrag(form))).toEqual({contracts: []});
    });

    it('行の外のボタンから、0 件の状態でも行を追加できる', async () => {
      const form = await mount(
        EDITABLE_ROWS(
          '{"contracts":[]}',
          '<button type="button" id="globalAdd" data-click-row-add="#list">' +
            '</button>',
        ),
      );
      expect(rowCount(form)).toBe(0);

      await clickNth(form, '#globalAdd');
      expect(rowCount(form)).toBe(1);

      await clickNth(form, '#globalAdd');
      expect(rowCount(form)).toBe(2);
      expect(getFrag(form).getRawBindingData()).toEqual({
        contracts: [{}, {}],
      });
    });

    it('row-prev / row-next は配列を並べ替える', async () => {
      const form = await mount(
        EDITABLE_ROWS('{"contracts":[{"name":"A"},{"name":"B"},{"name":"C"}]}'),
      );

      await clickNth(form, '.down', 0);
      expect(textValues(form)).toEqual(['B', 'A', 'C']);
      expect(getFrag(form).getRawBindingData()).toEqual({
        contracts: [{name: 'B'}, {name: 'A'}, {name: 'C'}],
      });

      await clickNth(form, '.up', 2);
      expect(textValues(form)).toEqual(['B', 'C', 'A']);
      expect(getFrag(form).getRawBindingData()).toEqual({
        contracts: [{name: 'B'}, {name: 'C'}, {name: 'A'}],
      });
    });

    it('追加した行は後続のバインド更新で取り消されない', async () => {
      const form = await mount(EDITABLE_ROWS('{"contracts":[{"name":"A"}]}'));

      await clickNth(form, '.add', 0);
      expect(rowCount(form)).toBe(2);

      // 追加後に別の入力で change を起こす（双方向バインドの全収集が走る）
      const name = form.querySelector<HTMLInputElement>('input[name="name"]')!;
      name.value = 'A2';
      getFrag(name).syncValue();
      await new Procedure(getFrag(name), 'change').run();
      await waitForCondition(() => textValues(form)[0] === 'A2', {
        description: 'two-way binding applied',
      });

      expect(rowCount(form)).toBe(2);
    });
  });

  describe('data-form-list の 0 件収集', () => {
    it('行が 0 件でもキーを空配列として出す', async () => {
      const form = await mount(EDITABLE_ROWS('{"contracts":[]}'));
      expect(Form.getValues(getFrag(form))).toEqual({contracts: []});
    });
  });

  describe('data-each-key 指定時の並べ替え', () => {
    it('配列を並べ替えると DOM の行順も追従する', async () => {
      const form = await mount(
        `<form id="root" data-bind='{"items":[
           {"name":"A"},{"name":"B"},{"name":"C"}]}'>
           <ul data-each="items" data-each-key="name">
             <li><span>{{name}}</span></li>
           </ul>
         </form>`,
      );
      const texts = (): (string | null)[] =>
        Array.from(form.querySelectorAll('li span')).map(
          span => span.textContent,
        );
      expect(texts()).toEqual(['A', 'B', 'C']);

      await Core.setBindingData(form, {
        items: [{name: 'B'}, {name: 'A'}, {name: 'C'}],
      });
      await waitForDomSettled();

      expect(texts()).toEqual(['B', 'A', 'C']);
    });
  });
});
