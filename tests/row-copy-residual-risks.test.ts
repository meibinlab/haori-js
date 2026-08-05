/* @vitest-environment jsdom */
/**
 * @fileoverview
 * 行への `data-{event}-copy` の修正に対して、レビューで挙がった残存リスクを
 * 実測で確かめるテストです。
 *
 * 1. 同一コンテナの複数行が 1 回の書き戻しに含まれ、「要素データが変わる行」と
 *    「変わらない行」が混在する場合に、どちらの行も正しい状態になること。
 *    （同じ行が 1 手続きで 2 回対象になる経路はセレクタの解決が重複を作らない
 *    ため存在せず、到達しうる形はこの混在である）
 * 2. 宣言バインドが値を決める入力（`data-attr-value`）を利用者が編集した後に
 *    コピーが走ったとき、画面と要素データが食い違ったまま残らないこと。
 *
 * 期待値の根拠は仕様「編集可能な行への書き込み」。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Fragment, {ElementFragment} from '../src/fragment';
import Procedure from '../src/procedure';
import {waitForCondition, waitForDomSettled} from './helpers/async';

const getFrag = (element: HTMLElement): ElementFragment =>
  Fragment.get(element) as ElementFragment;

describe('行への copy の残存リスク', () => {
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
    document.body.innerHTML = '';
  });

  /**
   * 行データの配列を返します。
   *
   * @param owner 配列の所有者
   * @param key 配列のキー
   * @returns 行データの配列
   */
  function rows(owner: HTMLElement, key: string): Record<string, unknown>[] {
    const data = Core.getBindingData(owner) as Record<string, unknown>;
    return data[key] as Record<string, unknown>[];
  }

  /**
   * 入力の値を変えて change を通知します。
   *
   * @param input 対象の入力
   * @param value 入力する値
   */
  async function edit(input: HTMLInputElement, value: string): Promise<void> {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();
    input.blur();
    await waitForDomSettled();
  }

  it('1 回の書き戻しに「変わる行」と「変わらない行」が混在しても両方が整う', async () => {
    // 行 0 は要素データが既にコピー後の値（変わらない行）。ただし画面の
    // チェックだけが利用者の操作で ON になっており、要素データと食い違う。
    // 行 1 は要素データが変わる行。1 回の copy で両方が対象になる。
    container.innerHTML = `
      <div id="copy-off" hidden data-bind='{"flag":false}'></div>
      <div id="owner" data-bind='{"rows":[
        {"flag":false,"note":"n0"},
        {"flag":true,"note":"n1"}
      ]}'>
        <div data-form-list="rows" data-each="rows"
             data-each-arg="r" data-each-index="i">
          <div class="addr-row" id="addr-row-{{i}}">
            <input type="checkbox" name="flag" value="true">
            <input name="note">
          </div>
        </div>
      </div>
      <button type="button" id="apply"
        data-click-copy=".addr-row"
        data-click-copy-source="#copy-off"
        data-click-copy-params="flag"></button>`;
    await Core.scan(container);
    await waitForCondition(
      () => container.querySelectorAll('.addr-row').length === 2,
      {description: '2 行描画'},
    );

    const owner = container.querySelector<HTMLElement>('#owner')!;
    const checkboxes = container.querySelectorAll<HTMLInputElement>(
      'input[name="flag"]',
    );
    const notes = container.querySelectorAll<HTMLInputElement>(
      'input[name="note"]',
    );
    expect(checkboxes[0].checked).toBe(false);
    expect(checkboxes[1].checked).toBe(true);

    // 行 0 のチェックだけを利用者が ON にする（要素データへは確定しない）。
    checkboxes[0].checked = true;
    checkboxes[0].dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();

    // 1 回の copy で 2 行とも flag=false を供給する。
    const button = container.querySelector<HTMLElement>('#apply')!;
    await new Procedure(getFrag(button), 'click').run();
    await waitForDomSettled();

    // 変わらない行（行 0）も、変わる行（行 1）も画面が揃うこと。
    expect(checkboxes[0].checked, '変わらない行のチェックが残っている').toBe(
      false,
    );
    expect(checkboxes[1].checked, '変わる行のチェックが残っている').toBe(false);
    // 他のキーは失われないこと。
    expect(notes[0].value).toBe('n0');
    expect(notes[1].value).toBe('n1');
    expect(rows(owner, 'rows')).toEqual([
      {flag: false, note: 'n0'},
      {flag: false, note: 'n1'},
    ]);
  });

  it('宣言バインドが値を決める入力を編集しても、画面と要素データが食い違わない', async () => {
    // `data-attr-value` で値が決まる入力は、行データの反映（syncRowValues）の
    // 対象外になる。その入力を利用者が編集した状態でコピーが走ったとき、
    // 画面と要素データがずれたまま残らないことを確かめる。
    container.innerHTML = `
      <div id="copy-off" hidden data-bind='{"flag":false}'></div>
      <div id="owner" data-bind='{"rows":[
        {"flag":true,"label":"L1","note":""}
      ]}'>
        <div data-form-list="rows" data-each="rows"
             data-each-arg="r" data-each-index="i">
          <div id="decl-row-{{i}}">
            <input type="checkbox" name="flag" value="true">
            <input name="label" data-attr-value="{{r.label}}">
            <input name="note"
              data-change-copy="#decl-row-{{i}}"
              data-change-copy-source="#copy-off"
              data-change-copy-params="flag">
          </div>
        </div>
      </div>`;
    await Core.scan(container);
    await waitForCondition(
      () =>
        container.querySelector<HTMLInputElement>('input[name="label"]')
          ?.value === 'L1',
      {description: '宣言バインドの反映'},
    );

    const owner = container.querySelector<HTMLElement>('#owner')!;
    const label = container.querySelector<HTMLInputElement>(
      'input[name="label"]',
    )!;
    const note = container.querySelector<HTMLInputElement>(
      'input[name="note"]',
    )!;

    // 宣言バインドが値を決める入力を利用者が編集する。
    await edit(label, 'EDITED');
    // 別の入力を編集してコピーを起こす。
    await edit(note, 'memo');

    const item = rows(owner, 'rows')[0];
    // コピーしたキーは供給どおりになる。
    expect(item.flag).toBe(false);
    expect(item.note).toBe('memo');
    // 画面・要素データとも利用者の編集値で揃うこと（収集した場合と同じ結果に
    // なる）。宣言バインドの評価結果へ戻ることも、両者が食い違ったまま残ることも
    // ない。
    expect(label.value, '画面の編集が巻き戻っている').toBe('EDITED');
    expect(
      item.label,
      '画面の label と要素データの label が食い違っている',
    ).toBe('EDITED');
  });
});
