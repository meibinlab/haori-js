/* @vitest-environment jsdom */
/**
 * @fileoverview `data-each` の取得元と `data-form-list` の収集先が別の配列である
 * 構成のテスト。
 *
 * 候補一覧を繰り返して、選択結果を別のキーへ集める構成です（申込画面のオプション行）。
 * 行のリストキーは `data-each` の**取得元**の要素から作られるため、収集先の配列の
 * 要素は識別できません。この前提が崩れた状態でリストキーを使うと、どの行も
 * 「配列に無い行」「対応する要素なし」と判定され、値がまるごと失われます。
 *
 * 期待値は仕様書から取っています。
 *
 * - 仕様「行の対応付けと `data-each-key`」「取得元と収集先が別の配列のとき: … `data-each-key` を宣言しても
 *   **出現順**で対応します」
 * - 同行「この構成では、行の生成・更新時に**要素データを行の入力欄へ反映することも
 *   しません**（… 反映すると取得元に無い `name` の欄が空になります）」
 * - 仕様「行の対応付けと `data-each-key`」「`data-each-key` あり: 行はキーの値で対応します」（取得元＝収集先の
 *   対照。こちらの振る舞いは変わらない）
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';

import {waitForIdle} from './helpers/async';

/** 取得元（候補一覧）と収集先（選択結果）が別のキーになる行リスト */
const DIFFERENT_ARRAYS =
  '<form id="f" data-bind=\'{"candidates":{"content":' +
  '[{"id":11,"name":"X"},{"id":12,"name":"Y"}]},"options":[]}\'>' +
  '<div data-form-list="options" data-each="candidates.content"' +
  ' data-each-arg="o" data-each-key="id">' +
  '<div class="line">' +
  '<input type="checkbox" name="selected" value="true"' +
  ' data-attr-id="chk-{{o.id}}">' +
  '<input type="hidden" name="optionId" data-attr-value="{{o.id}}">' +
  '<input type="text" name="staffName" data-attr-id="staff-{{o.id}}">' +
  '</div></div></form>';

describe('data-each の取得元と data-form-list の収集先が別の配列', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher();
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    container.remove();
    document.body.innerHTML = '';
  });

  /**
   * 収集先の配列を取り出します。
   *
   * @param form 対象のフォーム
   * @returns 収集先の配列
   */
  const options = (form: HTMLFormElement): unknown =>
    (Core.getBindingData(form) ?? {}).options;

  it('data-each-key を宣言しても、行の収集値が失われない（回帰）', async () => {
    container.innerHTML = DIFFERENT_ARRAYS;
    const form = container.querySelector('#f') as HTMLFormElement;
    await Core.scan(form);
    await waitForIdle();

    expect(container.querySelectorAll('.line').length).toBe(2);

    const checkbox = document.getElementById('chk-11') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForIdle();

    // 出現順で対応するため、収集した 2 行がそのまま載る。リストキーで対応させると
    // どの行のキーも収集先（`options`）に無いため、空配列になる。
    expect(options(form)).toEqual([
      {selected: true, optionId: '11', staffName: ''},
      {selected: false, optionId: '12', staffName: ''},
    ]);
    expect(checkbox.checked).toBe(true);
  });

  it('取得元を供給し直しても、行の入力欄を空にしない（回帰）', async () => {
    container.innerHTML = DIFFERENT_ARRAYS;
    const form = container.querySelector('#f') as HTMLFormElement;
    await Core.scan(form);
    await waitForIdle();

    const checkbox = document.getElementById('chk-11') as HTMLInputElement;
    const staff = document.getElementById('staff-11') as HTMLInputElement;
    checkbox.checked = true;
    staff.value = '担当';
    checkbox.dispatchEvent(new Event('change', {bubbles: true}));
    staff.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForIdle();

    // 候補一覧の再取得。行の要素データ（候補）が変わるため行を描き直すが、
    // 要素データは入力欄を表していないので入力欄へ反映してはいけない。
    await Core.setBindingData(form, {
      candidates: {
        content: [
          {id: 11, name: 'X2'},
          {id: 12, name: 'Y'},
        ],
      },
      options: options(form),
    });
    await waitForIdle();

    expect(
      (document.getElementById('chk-11') as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (document.getElementById('staff-11') as HTMLInputElement).value,
    ).toBe('担当');
  });

  it('既定値を添えた式（|| []）でも取得元の経路を読み取る（回帰）', async () => {
    // 判定は `data-each` の式の先頭の経路で行う。`rows || []` のように既定値を
    // 添えただけの式を「経路として読めない」と扱うと、判定できない側（リストキーを
    // 使う）へ倒れ、取得元と収集先が別の配列でも収集値が失われる。
    container.innerHTML = DIFFERENT_ARRAYS.replace(
      'data-each="candidates.content"',
      'data-each="candidates.content || []"',
    );
    const form = container.querySelector('#f') as HTMLFormElement;
    await Core.scan(form);
    await waitForIdle();

    expect(container.querySelectorAll('.line').length).toBe(2);

    const checkbox = document.getElementById('chk-11') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForIdle();

    expect(options(form)).toEqual([
      {selected: true, optionId: '11', staffName: ''},
      {selected: false, optionId: '12', staffName: ''},
    ]);
  });

  it('取得元と収集先が同じ配列なら、リストキーで対応付ける（対照）', async () => {
    container.innerHTML =
      '<form id="f" data-bind=\'{"rows":[{"id":11,"name":"X"},{"id":12,"name":"Y"}]}\'>' +
      '<div data-form-list="rows" data-each="rows"' +
      ' data-each-arg="o" data-each-key="id">' +
      '<div class="line">' +
      '<input type="checkbox" name="selected" value="true"' +
      ' data-attr-id="chk-{{o.id}}">' +
      '<input type="text" name="staffName">' +
      '</div></div></form>';
    const form = container.querySelector('#f') as HTMLFormElement;
    await Core.scan(form);
    await waitForIdle();

    const checkbox = document.getElementById('chk-11') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForIdle();

    // 収集値を要素データへ重ねるため、入力欄に無い `name` も残る（仕様「双方向バインディングの自動更新」）。
    expect((Core.getBindingData(form) ?? {}).rows).toEqual([
      {id: 11, name: 'X', selected: true, staffName: ''},
      {id: 12, name: 'Y', selected: false, staffName: ''},
    ]);
  });
});
