/* @vitest-environment jsdom */
/**
 * @fileoverview `data-each` の行の再利用でユーザー編集の印を解除する範囲の検証。
 *
 * 行の要素データが入れ替わったときは、その行の宣言バインドが評価結果を取り戻せる
 * よう印を解除する。ただし解除の範囲は共通の規則に従い、**その要素データを変えた
 * 更新が「明示的な値の供給」のときだけ、その供給の操作時点まで**とする。双方向
 * コミットや `data-poll` の応答は値の供給ではないため解除しない。解除すると、行内
 * の入力を編集した瞬間にそのコミット自身が保護を外し、宣言バインドの評価結果
 * （型の食い違いで偽になる比較など）で確定した編集が消える。
 *
 * 期待値の根拠は仕様「ユーザー編集と宣言バインドの権威」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import PollObserver from '../src/poll';
import {waitForCondition, waitForIdle} from './helpers/async';

/** 選択肢の一覧（`id` は API 由来の数値） */
const OPTION_SOURCE =
  '{"materialList":{"content":[{"id":1,"name":"鉄"},{"id":2,"name":"銅"}]}}';

describe('data-each の行の再利用と編集の印', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    PollObserver.disconnectAll();
    dispatcher.stop();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  /**
   * HTML を組み立てて走査します。
   *
   * @param html 対象の HTML
   * @returns 走査と描画の完了を待つ Promise
   */
  const mount = async (html: string): Promise<void> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForIdle();
  };

  /**
   * 入力欄を打鍵して確定します。
   *
   * @param input 対象の入力欄
   * @param value 入力する値
   * @returns 反映の完了を待つ Promise
   */
  const edit = async (
    input: HTMLInputElement,
    value: string,
  ): Promise<void> => {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
    input.blur();
    await waitForIdle();
  };

  /**
   * フォームの収集値を返します。
   *
   * @param selector フォームのセレクタ
   * @returns 収集値
   */
  const collect = (selector = 'form'): Record<string, unknown> => {
    const form = container.querySelector(selector) as HTMLElement;
    return Form.getValues(Fragment.get(form) as ElementFragment);
  };

  /**
   * バインドデータ（in-memory）を返します。
   *
   * @param selector 対象要素のセレクタ
   * @returns 生のバインドデータ
   */
  const bound = (selector: string): Record<string, unknown> | null => {
    const element = container.querySelector(selector) as HTMLElement;
    return (Fragment.get(element) as ElementFragment).getRawBindingData();
  };

  describe('双方向コミットは印を解除しない', () => {
    it('行内の FK セレクトで確定した選択が、コミット後の再評価で解除されない', async () => {
      // 選択肢の `id` は数値、`name` の収集値は文字列なので
      // `opt.id === m.material.id` は偽になる。印が残っていれば選択は守られる。
      await mount(`
        <div data-bind='${OPTION_SOURCE}'>
          <form id="f" data-bind='{"materials":[{"material":{"id":""}}]}'>
            <div data-form-list="materials" data-each="materials"
                 data-each-arg="m">
              <div>
                <span data-form-object="material">
                  <select name="id" data-each="materialList.content"
                          data-each-arg="opt" data-each-key="id">
                    <option value="" data-each-before>選択</option>
                    <option value="{{opt.id}}"
                            data-attr-selected="{{opt.id === m.material.id}}"
                            >{{opt.name}}</option>
                  </select>
                </span>
              </div>
            </div>
          </form>
        </div>`);
      const select = container.querySelector('select') as HTMLSelectElement;

      select.value = '1';
      select.dispatchEvent(new Event('change', {bubbles: true}));
      await waitForIdle();

      // 画面・収集値・バインドデータの三者が一致する。
      expect(select.value).toBe('1');
      expect(collect()).toEqual({materials: [{material: {id: '1'}}]});
      expect(bound('#f')).toEqual({materials: [{material: {id: '1'}}]});
    });

    it('data-value-type="number" で型を揃えた FK セレクトも三者一致する', async () => {
      // ガイド「レシピ: `name` 付き入力で「参照スコープ」と「書込スコープ」が違う
      // とき」の「`data-value-type="number"` で収集値を数値にする」。文書に載せた
      // 対処がそのまま動くことを固定する。
      await mount(`
        <div data-bind='${OPTION_SOURCE}'>
          <form id="f" data-bind='{"materials":[{"material":{"id":null}}]}'>
            <div data-form-list="materials" data-each="materials"
                 data-each-arg="m">
              <div>
                <span data-form-object="material">
                  <select name="id" data-value-type="number"
                          data-each="materialList.content"
                          data-each-arg="opt" data-each-key="id">
                    <option value="" data-each-before>選択</option>
                    <option value="{{opt.id}}"
                            data-attr-selected="{{opt.id === m.material.id}}"
                            >{{opt.name}}</option>
                  </select>
                </span>
              </div>
            </div>
          </form>
        </div>`);
      const select = container.querySelector('select') as HTMLSelectElement;

      select.value = '2';
      select.dispatchEvent(new Event('change', {bubbles: true}));
      await waitForIdle();

      expect(select.value).toBe('2');
      expect(collect()).toEqual({materials: [{material: {id: 2}}]});
      expect(bound('#f')).toEqual({materials: [{material: {id: 2}}]});
    });

    it('行内のチェックボックスで確定したチェックが、コミット後の再評価で解除されない', async () => {
      // `name` が書き戻すのは送信値の文字列で、式は真偽値と比べているため
      // 再適用されると必ず外れる。
      await mount(`
        <form id="f" data-bind='{"rows":[{"flag":false}]}'>
          <div data-form-list="rows" data-each="rows" data-each-arg="r">
            <div>
              <input id="flag" type="checkbox" name="flag" value="on"
                     data-attr-checked="{{r.flag === true}}">
            </div>
          </div>
        </form>`);
      const flag = container.querySelector('#flag') as HTMLInputElement;

      flag.checked = true;
      flag.dispatchEvent(new Event('change', {bubbles: true}));
      await waitForIdle();

      expect(flag.checked).toBe(true);
      expect(collect()).toEqual({rows: [{flag: 'on'}]});
      expect(bound('#f')).toEqual({rows: [{flag: 'on'}]});
    });

    it('name を持たない欄の編集も、同じ行のコミットで消えない', async () => {
      // `name` が無い欄の値は要素データへ入らないため、要素データとの一致では
      // 保護できない。双方向コミットが印を解除しないことだけが保護になる。
      await mount(`
        <form id="f" data-bind='{"rows":[{"memo":"","note":"初期"}]}'>
          <div data-form-list="rows" data-each="rows" data-each-arg="r">
            <div>
              <input id="scratch" data-attr-value="{{r.note}}">
              <input id="memo" name="memo" data-attr-value="{{r.memo || ''}}">
            </div>
          </div>
        </form>`);
      const scratch = container.querySelector('#scratch') as HTMLInputElement;
      const memo = container.querySelector('#memo') as HTMLInputElement;

      await edit(scratch, 'メモ書き');
      await edit(memo, '備考');

      expect(scratch.value).toBe('メモ書き');
    });

    it('同じ行の別の欄を編集しても、先に確定した編集が残る', async () => {
      await mount(`
        <form id="f" data-bind='{"rows":[{"memo":"","qty":""}]}'>
          <div data-form-list="rows" data-each="rows" data-each-arg="r">
            <div>
              <input id="memo" name="memo" data-attr-value="{{r.memo || ''}}">
              <input id="qty" name="qty" data-attr-value="{{r.qty || ''}}">
            </div>
          </div>
        </form>`);
      const memo = container.querySelector('#memo') as HTMLInputElement;
      const qty = container.querySelector('#qty') as HTMLInputElement;

      await edit(memo, '備考');
      await edit(qty, '3');

      expect(memo.value).toBe('備考');
      expect(qty.value).toBe('3');
    });
  });

  describe('ポーリングの応答は印を解除しない', () => {
    it('行の要素データが変わっても、行内の確定した編集が残る', async () => {
      let count = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
        count += 1;
        return Promise.resolve(
          new Response(
            JSON.stringify({rows: [{memo: 'サーバ備考', tick: count}]}),
            {headers: {'Content-Type': 'application/json'}},
          ),
        );
      });
      await mount(`
        <form id="f" data-bind='{"rows":[]}'
              data-poll-fetch="/status.json" data-poll-bind="#f"
              data-poll-interval="100">
          <div data-form-list="rows" data-each="rows" data-each-arg="r">
            <div>
              <input class="memo" name="memo"
                     data-attr-value="{{r.memo || ''}}">
              <span class="tick">{{r.tick}}</span>
            </div>
          </div>
        </form>`);
      PollObserver.syncTree(container);
      await waitForCondition(
        () =>
          (container.querySelector('.memo') as HTMLInputElement | null)
            ?.value === 'サーバ備考',
        {description: '初回ポーリングの反映', maxAttempts: 20, delayMs: 40},
      );
      const memo = container.querySelector('.memo') as HTMLInputElement;

      await edit(memo, '入力中');

      // `tick` が増えるため行の要素データは取得ごとに入れ替わる。
      await new Promise(resolve => setTimeout(resolve, 260));
      await waitForIdle();

      expect(memo.value).toBe('入力中');
    });
  });

  describe('明示的な供給は従来どおり印を解除する', () => {
    it('別のレコードが入った再利用行では宣言バインドが反映される', async () => {
      await mount(`
        <div id="state" data-bind='{"rows":[{"id":1,"memo":"m1"}]}'>
          <div data-each="rows" data-each-arg="row">
            <div>
              <input class="memo" name="memo"
                     data-attr-value="{{row.memo || ''}}">
            </div>
          </div>
        </div>`);
      const memo = container.querySelector('.memo') as HTMLInputElement;
      await edit(memo, '編集');
      expect(memo.value).toBe('編集');

      await Core.setBindingData(
        container.querySelector('#state') as HTMLElement,
        {rows: [{id: 2, memo: 'm2'}]},
      );
      await waitForIdle();

      expect((container.querySelector('.memo') as HTMLInputElement).value).toBe(
        'm2',
      );
    });

    it('data-each-key の無い行の削除では、繰り上がった行が新しいレコードを表示する', async () => {
      // 仕様「行操作の共通仕様（`data-{event}-row-*`）」の「DOM の行は差分更新で
      // 再描画されるため、DOM とバインディングデータが常に一致します」。
      // キー指定が無い場合は行と要素データをインデックスで対応させるため、行を
      // 削除すると各行が別のレコードを受け取る。編集の印が残っていると、宣言
      // バインドで値が決まる欄が消したレコードの値を表示したままになる。
      await mount(`
        <div id="owner" data-bind='{"rows":[{"memo":"m1"},{"memo":"m2"}]}'>
          <div data-form-list="rows" data-each="rows" data-each-arg="r"
               data-each-index="i">
            <div id="row-{{i}}">
              <input class="memo" name="memo"
                     data-attr-value="{{r.memo || ''}}">
              <button type="button" class="del" data-click-row-remove></button>
            </div>
          </div>
        </div>`);
      const first = container.querySelector('.memo') as HTMLInputElement;
      await edit(first, '編集');

      (container.querySelector('.del') as HTMLButtonElement).click();
      await waitForIdle();

      const rows = container.querySelectorAll('.memo');
      expect(rows.length).toBe(1);
      expect((rows[0] as HTMLInputElement).value).toBe('m2');
    });

    it('data-each-key があれば、行の削除で残った行の編集が保たれる', async () => {
      // 仕様「行操作の共通仕様（`data-{event}-row-*`）」の「`data-each-key` を指定
      // している場合は、キーと一緒にレコードが移動するのでどの行も別のレコードを
      // 受け取らず、解除しません」。
      await mount(`
        <div id="owner"
             data-bind='{"rows":[{"id":1,"memo":"m1"},{"id":2,"memo":"m2"}]}'>
          <div data-form-list="rows" data-each="rows" data-each-arg="r"
               data-each-key="id" data-each-index="i">
            <div id="row-{{i}}">
              <input class="memo" name="memo"
                     data-attr-value="{{r.memo || ''}}">
              <button type="button" class="del" data-click-row-remove></button>
            </div>
          </div>
        </div>`);
      const second = container.querySelectorAll('.memo')[1] as HTMLInputElement;
      await edit(second, '編集');

      (container.querySelector('.del') as HTMLButtonElement).click();
      await waitForIdle();

      const rows = container.querySelectorAll('.memo');
      expect(rows.length).toBe(1);
      expect((rows[0] as HTMLInputElement).value).toBe('編集');
    });

    it('行への data-{event}-copy は、コピーしていないキーの編集を巻き戻さない', async () => {
      // 仕様「編集可能な行への書き込み」の「`data-{event}-copy` は**コピーした
      // キーについては**利用者の編集より優先し、行の入力欄へ必ず反映する」。
      // 行の印を丸ごと解除すると、コピーしていないキー（ここでは FK）の編集まで
      // 宣言バインドの評価結果へ明け渡してしまう。
      await mount(`
        <div data-bind='${OPTION_SOURCE}'>
          <div id="src" hidden data-bind='{"flag":"on"}'></div>
          <div id="owner"
               data-bind='{"rows":[{"material":{"id":""},"flag":"","memo":""}]}'>
            <div data-form-list="rows" data-each="rows" data-each-arg="r"
                 data-each-index="i">
              <div id="row-{{i}}">
                <span data-form-object="material">
                  <select name="id" data-each="materialList.content"
                          data-each-arg="opt" data-each-key="id">
                    <option value="" data-each-before>選択</option>
                    <option value="{{opt.id}}"
                            data-attr-selected="{{opt.id === r.material.id}}"
                            >{{opt.name}}</option>
                  </select>
                </span>
                <input id="memo" name="memo"
                       data-change-copy="#row-{{i}}"
                       data-change-copy-source="#src"
                       data-change-copy-params="flag">
              </div>
            </div>
          </div>
        </div>`);
      const select = container.querySelector('select') as HTMLSelectElement;
      const memo = container.querySelector('#memo') as HTMLInputElement;

      select.value = '1';
      select.dispatchEvent(new Event('change', {bubbles: true}));
      await waitForIdle();
      expect(select.value).toBe('1');

      // 備考の確定でコピーが走る。コピーするのは `flag` だけ。
      await edit(memo, '備考');

      expect(select.value).toBe('1');
      expect(
        (bound('#owner') as {rows: {flag: string}[]}).rows[0].flag,
      ).toBe('on');
    });

    it('行への data-{event}-copy は、宣言バインドで値が決まる欄の編集にも届く', async () => {
      // 仕様「編集可能な行への書き込み」の「`data-{event}-copy` はコピーした
      // キーについては利用者の編集より優先し、行の入力欄へ必ず反映する」。
      // 宣言バインドで値が決まる欄は行データ由来の書き戻しの対象外なので、
      // 印の解除と再評価だけが反映の経路になる。
      await mount(`
        <div id="src" hidden data-bind='{"kind":"A"}'></div>
        <div id="owner" data-bind='{"rows":[{"kind":"A","memo":""}]}'>
          <div data-form-list="rows" data-each="rows" data-each-arg="r"
               data-each-index="i">
            <div id="row-{{i}}">
              <input id="kind" name="kind" data-attr-value="{{r.kind}}">
              <input id="memo" name="memo"
                     data-change-copy="#row-{{i}}"
                     data-change-copy-source="#src"
                     data-change-copy-params="kind">
            </div>
          </div>
        </div>`);
      const kind = container.querySelector('#kind') as HTMLInputElement;
      const memo = container.querySelector('#memo') as HTMLInputElement;

      // 利用者が宣言バインドの欄を編集して印を付ける。
      await edit(kind, 'B');
      expect(kind.value).toBe('B');

      // 備考の確定でコピーが走り、`kind` を 'A' へ戻す。
      await edit(memo, '備考');

      expect(kind.value).toBe('A');
    });
  });
});
