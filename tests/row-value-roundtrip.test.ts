/* @vitest-environment jsdom */
/**
 * @fileoverview `data-each` の行の中に置いた入力欄について、値の往復の不変条件を
 * 検証します。
 *
 * 行の中の入力欄は、行の生成・再利用・削除と値の書き戻しが同じフレームで交錯する
 * ため、フォーム直下の入力欄より壊れやすい箇所です。過去の回帰も「行ごとに送信値を
 * 与えるチェックボックス群のチェックが落ちる」「行を増やすと前の行の値が混ざる」
 * という形で現れました。行の追加・削除・並べ替えを挟んでも、画面・収集値・
 * バインドデータの三者が一致し続けることを固定します。
 *
 * 期待値の根拠は仕様「`data-each` で生成された行への値反映」と仕様「収集は DOM を真とする」。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import Procedure from '../src/procedure';
import {waitForDomSettled} from './helpers/async';

const getFrag = (element: Element): ElementFragment =>
  Fragment.get(element) as ElementFragment;

/** 行データ 1 件の形 */
interface Row {
  title: string;
  flag: boolean;
  sel: string;
  plan: string;
  opt: string | null;
  optValue: string;
  label: string;
}

/**
 * 行データを作ります。
 *
 * @param index 行番号（0 起点）
 * @param overrides 上書きする項目
 * @returns 行データ
 */
const row = (index: number, overrides: Partial<Row> = {}): Row => ({
  title: `題名${index}`,
  flag: index % 2 === 0,
  sel: index % 2 === 0 ? 'a' : 'b',
  plan: index % 2 === 0 ? 'p1' : 'p2',
  // 行ごとに異なる送信値を持つチェックボックス（チェック済みなら送信値そのもの）
  opt: `o${index}`,
  optValue: `o${index}`,
  // 入力欄と対応しない表示専用のフィールド（コミットで失われてはいけない）
  label: `ラベル${index}`,
  ...overrides,
});

const EDITABLE_ROWS = `
  <form id="f">
    <div data-form-list="rows" data-each="rows" data-each-arg="r">
      <div class="row">
        <input name="title" type="text">
        <input name="flag" type="checkbox" value="true">
        <select name="sel">
          <option value="a">A</option>
          <option value="b">B</option>
        </select>
        <input type="radio" data-form-name="plan" value="p1">
        <input type="radio" data-form-name="plan" value="p2">
        <input name="opt" type="checkbox" data-attr-value="{{r.optValue}}">
        <span class="label">{{r.label}}</span>
        <button type="button" class="add" data-click-row-add></button>
        <button type="button" class="remove" data-click-row-remove></button>
      </div>
    </div>
  </form>`;

describe('data-each 行の値の往復', () => {
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
   * 行付きフォームをマウントします。
   *
   * @param rows 初期の行データ
   * @returns 生成した form 要素
   */
  const mount = async (rows: Row[]): Promise<HTMLFormElement> => {
    container.innerHTML = EDITABLE_ROWS;
    const form = container.querySelector('#f') as HTMLFormElement;
    form.setAttribute('data-bind', JSON.stringify({rows}));
    await Core.scan(container);
    await waitForDomSettled();
    return form;
  };

  /**
   * 画面に見えている行の状態を、収集値と同じ形で読み取ります。
   *
   * @returns 行ごとの値
   */
  const readRows = (): Array<Record<string, unknown>> =>
    Array.from(container.querySelectorAll('.row')).map(element => {
      const title = element.querySelector(
        '[name="title"]',
      ) as HTMLInputElement;
      const flag = element.querySelector('[name="flag"]') as HTMLInputElement;
      const sel = element.querySelector('[name="sel"]') as HTMLSelectElement;
      const plan = element.querySelector<HTMLInputElement>(
        'input[type="radio"]:checked',
      );
      const opt = element.querySelector('[name="opt"]') as HTMLInputElement;
      return {
        title: title.value,
        flag: flag.checked,
        sel: sel.value,
        plan: plan ? plan.value : null,
        opt: opt.checked ? opt.value : null,
      };
    });

  /**
   * 収集値のうち、画面から読み取れる項目だけを取り出します。
   *
   * @param form 対象フォーム
   * @returns 行ごとの値
   */
  const collectedRows = (
    form: HTMLFormElement,
  ): Array<Record<string, unknown>> => {
    const values = Form.getValues(getFrag(form)) as {
      rows: Array<Record<string, unknown>>;
    };
    return values.rows.map(item => ({
      title: item.title,
      flag: item.flag,
      sel: item.sel,
      plan: item.plan,
      opt: item.opt,
    }));
  };

  /**
   * 期待する行データを、画面から読み取れる項目だけの形にします。
   *
   * @param rows 期待する行データ
   * @returns 比較用の行データ
   */
  const expectedRows = (rows: Row[]): Array<Record<string, unknown>> =>
    rows.map(item => ({
      title: item.title,
      flag: item.flag,
      sel: item.sel,
      plan: item.plan,
      opt: item.opt,
    }));

  /**
   * 画面と収集値が期待どおりで一致していることを確かめます。
   *
   * @param form 対象フォーム
   * @param rows 期待する行データ
   */
  const expectConsistent = (form: HTMLFormElement, rows: Row[]): void => {
    expect(readRows()).toEqual(expectedRows(rows));
    expect(collectedRows(form)).toEqual(expectedRows(rows));
  };

  /**
   * 指定した行のボタンの手続きを完了まで実行します。
   *
   * @param index 行番号（0 起点）
   * @param selector ボタンのセレクター
   * @returns 手続き完了を待つ Promise
   */
  const runRowButton = async (
    index: number,
    selector: string,
  ): Promise<void> => {
    const rowElement = container.querySelectorAll('.row')[index];
    const button = rowElement.querySelector(selector) as HTMLElement;
    await new Procedure(getFrag(button), 'click').run();
    await waitForDomSettled();
  };

  it('初期 data-bind の行データが画面と収集値で一致する', async () => {
    const rows = [row(0), row(1)];
    const form = await mount(rows);

    expect(container.querySelectorAll('.row').length).toBe(2);
    expectConsistent(form, rows);
  });

  it('後から供給した行データが画面と収集値で一致する', async () => {
    const form = await mount([row(0), row(1)]);

    const next = [row(2), row(3), row(4)];
    await Core.setBindingData(form, {rows: next});
    await waitForDomSettled();

    expect(container.querySelectorAll('.row').length).toBe(3);
    expectConsistent(form, next);
  });

  it('行数が減っても残った行の値が混ざらない', async () => {
    const form = await mount([row(0), row(1), row(2)]);

    const next = [row(2)];
    await Core.setBindingData(form, {rows: next});
    await waitForDomSettled();

    expect(container.querySelectorAll('.row').length).toBe(1);
    expectConsistent(form, next);
  });

  it('行内の編集が収集値へ載り、他の行に影響しない', async () => {
    const rows = [row(0), row(1)];
    const form = await mount(rows);

    const second = container.querySelectorAll('.row')[1];
    const title = second.querySelector('[name="title"]') as HTMLInputElement;
    title.value = '書き換え';
    title.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();

    expectConsistent(form, [rows[0], {...rows[1], title: '書き換え'}]);
  });

  it('行ごとに送信値が異なるチェックボックスは、複数行でチェックが残る', async () => {
    // `data-attr-value` で行ごとの送信値を与える構成。バインドからの復元は
    // 「送信値との一致」で決まるため、行ごとに値が違っても落ちてはいけない。
    const rows = [row(0), row(1), row(2)];
    const form = await mount(rows);

    const boxes = Array.from(
      container.querySelectorAll<HTMLInputElement>('[name="opt"]'),
    );
    expect(boxes.map(input => input.checked)).toEqual([true, true, true]);
    expect(boxes.map(input => input.value)).toEqual(['o0', 'o1', 'o2']);
    const values = Form.getValues(getFrag(form)) as {
      rows: Array<Record<string, unknown>>;
    };
    expect(values.rows.map(item => item.opt)).toEqual(['o0', 'o1', 'o2']);
    expectConsistent(form, rows);
  });

  it('行内の編集で、入力欄に対応しないフィールドが失われない', async () => {
    // 双方向コミットは収集値でバインドデータを置き換えるが、収集値は入力欄が表す
    // 部分だけなので、そのまま置き換えると行データの他のフィールド（表示専用の
    // ラベル、`data-attr-value` に渡す送信値、保存に要る `id` など）が消える。
    const rows = [row(0), row(1)];
    const form = await mount(rows);

    const title = container.querySelector('[name="title"]') as HTMLInputElement;
    title.value = '書き換え';
    title.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();

    // `data-attr-value` へ渡す送信値が残る（消えると送信値が既定の "on" になる）。
    expect(
      Array.from(
        container.querySelectorAll<HTMLInputElement>('[name="opt"]'),
      ).map(input => input.value),
    ).toEqual(['o0', 'o1']);
    // 表示専用のラベルも残る。
    expect(
      Array.from(container.querySelectorAll('.label')).map(
        element => element.textContent,
      ),
    ).toEqual(['ラベル0', 'ラベル1']);
    // バインドデータにも残る（保存に要るキーが送られなくなるのを防ぐ）。
    const bound = Core.getBindingData(form) as {
      rows: Array<Record<string, unknown>>;
    };
    expect(bound.rows.map(item => item.optValue)).toEqual(['o0', 'o1']);
    expect(bound.rows.map(item => item.label)).toEqual([
      'ラベル0',
      'ラベル1',
    ]);
  });

  it('行ごとのラジオは行単位で独立して選択される', async () => {
    const rows = [row(0), row(1)];
    const form = await mount(rows);

    // 行をまたいで排他になっていれば、片方の選択が外れて null になる。
    expectConsistent(form, rows);

    const second = container.querySelectorAll('.row')[1];
    const first = second.querySelector(
      'input[type="radio"][value="p1"]',
    ) as HTMLInputElement;
    first.checked = true;
    first.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();

    expectConsistent(form, [rows[0], {...rows[1], plan: 'p1'}]);
  });

  it('行を追加しても既存行の値が保たれる', async () => {
    const rows = [row(0), row(1)];
    const form = await mount(rows);

    await runRowButton(0, '.add');

    expect(container.querySelectorAll('.row').length).toBe(3);
    const collected = collectedRows(form);
    // 追加行は 1 行目の直後に入り、既存行の値はそのまま残る。
    expect(collected[0]).toEqual(expectedRows([rows[0]])[0]);
    expect(collected[2]).toEqual(expectedRows([rows[1]])[0]);
    expect(readRows()).toEqual(collected);
  });

  it('行を削除しても残った行の値が保たれる', async () => {
    const rows = [row(0), row(1), row(2)];
    const form = await mount(rows);

    await runRowButton(1, '.remove');

    expect(container.querySelectorAll('.row').length).toBe(2);
    expectConsistent(form, [rows[0], rows[2]]);
  });

  it('リセットで初期の行数と値へ戻る', async () => {
    const rows = [row(0), row(1)];
    const form = await mount(rows);

    await runRowButton(0, '.add');
    const title = container.querySelector(
      '[name="title"]',
    ) as HTMLInputElement;
    title.value = '書き換え';
    title.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();

    await Form.reset(getFrag(form));
    await waitForDomSettled();

    expect(container.querySelectorAll('.row').length).toBe(2);
    expectConsistent(form, rows);
  });
});
