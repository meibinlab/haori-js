/* @vitest-environment jsdom */
/**
 * @fileoverview 収集した行を配列要素へ対応付ける規則（行識別）の検証。
 *
 * 収集値の重ね合わせは既定で**出現順**の対応を使いますが、これは「配列と画面の
 * 行数・並びが一致している」ことを前提にします。行の削除は配列を先に更新して画面を
 * 描き直すため、描き直しの前に収集が走ると前提が崩れます。
 *
 * `data-each-key` を宣言すると、`data-each` が行へ付けたリストキーで対応付けるため、
 * この崩れを避けられます。ここでは、割り込みが起きても残った行の値と非入力フィールド
 * （`id` / 表示専用ラベル）が正しく保たれることを固定します。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {waitForDomSettled} from './helpers/async';

/**
 * 行リストの HTML を組み立てます。
 *
 * @param keyed `data-each-key` を宣言するか
 * @returns 組み立てた HTML
 */
const markup = (keyed: boolean): string => `
  <form id="f">
    <div data-form-list="rows" data-each="rows" data-each-arg="r"${
      keyed ? ' data-each-key="id"' : ''
    }>
      <div class="row">
        <input name="title" type="text">
        <span class="label">{{r.label}}</span>
        <button type="button" class="remove" data-click-row-remove></button>
        <button type="button" class="add" data-click-row-add></button>
      </div>
    </div>
  </form>`;

/** 検証に使う初期の行データ */
const INITIAL_ROWS = [
  {id: 1, label: 'A', title: 'a'},
  {id: 2, label: 'B', title: 'b'},
  {id: 3, label: 'C', title: 'c'},
];

describe('行識別による収集値の対応付け', () => {
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
   * 行リストを組み立てて初期描画を待ちます。
   *
   * @param keyed `data-each-key` を宣言するか
   * @param rows 初期の行データ
   * @returns 生成した form 要素
   */
  const mount = async (
    keyed: boolean,
    rows: Array<Record<string, unknown>> = INITIAL_ROWS,
  ): Promise<HTMLFormElement> => {
    container.innerHTML = markup(keyed);
    const form = container.querySelector('#f') as HTMLFormElement;
    form.setAttribute('data-bind', JSON.stringify({rows}));
    await Core.scan(container);
    await waitForDomSettled();
    return form;
  };

  /**
   * バインドデータの行を取り出します。
   *
   * @param form 対象の form 要素
   * @returns 行データの配列
   */
  const boundRows = (form: HTMLFormElement): Array<Record<string, unknown>> =>
    (
      Core.getBindingData(form) as {
        rows: Array<Record<string, unknown>>;
      }
    ).rows;

  /**
   * 画面に見えている行のラベルを取り出します。
   *
   * @returns ラベルの配列
   */
  const labels = (): string[] =>
    Array.from(container.querySelectorAll('.label')).map(
      element => element.textContent ?? '',
    );

  describe('削除の反映を待たない編集', () => {
    it('data-each-key があれば残った行の値と id が保たれる', async () => {
      const form = await mount(true);
      expect(labels()).toEqual(['A', 'B', 'C']);

      // 2 行目の削除を押し、画面の描き直しを待たずに 1 行目を編集して確定する。
      // 配列は先に 2 件へ縮むが、収集の時点では画面にまだ 3 行ある。
      (
        container.querySelectorAll('.row')[1].querySelector('.remove') as
          | HTMLElement
          | null
      )?.click();
      const first = container.querySelector(
        '[name="title"]',
      ) as HTMLInputElement;
      first.value = '書き換え';
      first.dispatchEvent(new Event('change', {bubbles: true}));
      await waitForDomSettled(8);

      expect(boundRows(form)).toEqual([
        {id: 1, label: 'A', title: '書き換え'},
        {id: 3, label: 'C', title: 'c'},
      ]);
      expect(labels()).toEqual(['A', 'C']);
    });

    it('data-each-key が無い場合も行数はずれない', async () => {
      // リストキーがインデックス由来になるため、どの行が消えたかは判別できない。
      // 消えた行の値が残った行へ移る点は避けられないが、`id` を持たない行が
      // 増える（画面に空行が残る）ことは防げる。
      const form = await mount(false);

      (
        container.querySelectorAll('.row')[1].querySelector('.remove') as
          | HTMLElement
          | null
      )?.click();
      const first = container.querySelector(
        '[name="title"]',
      ) as HTMLInputElement;
      first.value = '書き換え';
      first.dispatchEvent(new Event('change', {bubbles: true}));
      await waitForDomSettled(8);

      const rows = boundRows(form);
      expect(rows.length).toBe(2);
      // すべての行が `id` と `label` を持つ（欠けた行が混じらない）。
      expect(rows.every(row => row.id !== undefined)).toBe(true);
      expect(rows.every(row => row.label !== undefined)).toBe(true);
      expect(labels().length).toBe(2);
    });
  });

  describe('通常の操作', () => {
    it('行を削除して確定すると残った行がそのまま保たれる', async () => {
      const form = await mount(true);

      (
        container.querySelectorAll('.row')[1].querySelector('.remove') as
          | HTMLElement
          | null
      )?.click();
      await waitForDomSettled(8);

      const first = container.querySelector(
        '[name="title"]',
      ) as HTMLInputElement;
      first.value = '書き換え';
      first.dispatchEvent(new Event('change', {bubbles: true}));
      await waitForDomSettled(8);

      expect(boundRows(form)).toEqual([
        {id: 1, label: 'A', title: '書き換え'},
        {id: 3, label: 'C', title: 'c'},
      ]);
    });

    it('行を追加して編集しても既存行の識別が保たれる', async () => {
      const form = await mount(true);

      (
        container.querySelectorAll('.row')[0].querySelector('.add') as
          | HTMLElement
          | null
      )?.click();
      await waitForDomSettled(8);
      expect(container.querySelectorAll('.row').length).toBe(4);

      const inputs = Array.from(
        container.querySelectorAll<HTMLInputElement>('[name="title"]'),
      );
      inputs[1].value = '新しい行';
      inputs[1].dispatchEvent(new Event('change', {bubbles: true}));
      await waitForDomSettled(8);

      // 追加行は 1 行目の直後に入り、既存行の識別（`id` と表示専用ラベル）は
      // 行の位置が変わっても取り違えられない。
      const rows = boundRows(form);
      expect(rows.length).toBe(4);
      expect(rows.map(row => row.id)).toEqual([1, undefined, 2, 3]);
      expect(rows.map(row => row.label)).toEqual(['A', undefined, 'B', 'C']);
      expect(rows[1]).toMatchObject({title: '新しい行'});
    });

    it.fails(
      '［既存不具合］行を挿入すると末尾の行の入力欄が 1 つ前の値になる',
      async () => {
        // 行識別とは別の不具合。配列・表示専用ラベル・リストキーはいずれも正しく、
        // 入力欄への書き戻しだけが崩れる。収集は DOM を真とするため、この後に編集を
        // 確定すると誤った値が配列へ載る。
        //
        // これは `it.fails` なので、**不具合が直るとこのテストは失敗に変わる**。
        // 書き戻しを修正したら、この `it.fails` を通常の `it` へ書き換えること
        // （テストが壊れたのではなく、記録の役目が終わった合図）。
        await mount(true);

        (
          container.querySelectorAll('.row')[0].querySelector('.add') as
            | HTMLElement
            | null
        )?.click();
        await waitForDomSettled(8);

        expect(
          Array.from(
            container.querySelectorAll<HTMLInputElement>('[name="title"]'),
          ).map(input => input.value),
        ).toEqual(['a', '', 'b', 'c']);
      },
    );

    it('id が未設定の行が混ざっても取り違えない', async () => {
      // 新規行は `id` を持たないため、リストキーがインデックス由来になる。
      const form = await mount(true, [
        {id: 1, label: 'A', title: 'a'},
        {label: '新規', title: 'x'},
        {id: 3, label: 'C', title: 'c'},
      ]);

      const inputs = Array.from(
        container.querySelectorAll<HTMLInputElement>('[name="title"]'),
      );
      inputs[2].value = '書き換え';
      inputs[2].dispatchEvent(new Event('change', {bubbles: true}));
      await waitForDomSettled(8);

      expect(boundRows(form)).toEqual([
        {id: 1, label: 'A', title: 'a'},
        {label: '新規', title: 'x'},
        {id: 3, label: 'C', title: '書き換え'},
      ]);
    });
  });

  describe('非オブジェクトの要素', () => {
    it('オブジェクトでない要素が混ざっても要素数が変わらない', async () => {
      // `data-form-list` に非オブジェクトの行を混ぜるのはサポートされた構成では
      // ないが（入力欄の name と対応付けられない）、黙って要素が消えてはいけない。
      container.innerHTML = markup(false);
      const form = container.querySelector('#f') as HTMLFormElement;
      form.setAttribute(
        'data-bind',
        JSON.stringify({rows: [{id: 1, title: 'a'}, true, {id: 3, title: 'c'}]}),
      );
      await Core.scan(container);
      await waitForDomSettled();
      expect(container.querySelectorAll('.row').length).toBe(3);

      const first = container.querySelector(
        '[name="title"]',
      ) as HTMLInputElement;
      first.value = '書き換え';
      first.dispatchEvent(new Event('change', {bubbles: true}));
      await waitForDomSettled(8);

      const rows = boundRows(form);
      expect(rows.length).toBe(3);
      expect(rows[0]).toMatchObject({id: 1, title: '書き換え'});
      expect(rows[2]).toMatchObject({id: 3, title: 'c'});
    });
  });

  describe('data-each で描いていない行', () => {
    it('静的に書いた行は出現順の対応で扱う', async () => {
      container.innerHTML = `
        <form id="f" data-bind='{"rows":[{"id":1,"label":"A"},{"id":2,"label":"B"}]}'>
          <div data-form-list="rows">
            <div class="row"><input name="title" type="text" value="a"></div>
            <div class="row"><input name="title" type="text" value="b"></div>
          </div>
        </form>`;
      const form = container.querySelector('#f') as HTMLFormElement;
      await Core.scan(container);
      await waitForDomSettled();

      const inputs = Array.from(
        container.querySelectorAll<HTMLInputElement>('[name="title"]'),
      );
      inputs[1].value = '書き換え';
      inputs[1].dispatchEvent(new Event('change', {bubbles: true}));
      await waitForDomSettled(8);

      expect(boundRows(form)).toEqual([
        {id: 1, label: 'A', title: 'a'},
        {id: 2, label: 'B', title: '書き換え'},
      ]);
    });
  });
});
