/* @vitest-environment jsdom */
/**
 * @fileoverview ユーザー編集を宣言バインドの再適用より優先することの回帰テスト。
 *
 * 宣言バインド（`value="{{式}}"` / `data-attr-value` / `data-attr-checked` /
 * `data-attr-selected`）は評価結果を入力欄へ書き戻す。評価結果が変わっていない
 * 再評価でも書き戻していたため、利用者が確定した入力が「別の欄を触った瞬間に
 * 元へ戻る」現象が起きていた。画面表示だけでなく収集値も古くなるため、保存すると
 * 編集が失われる。
 *
 * ここでは「確定した編集は明示的な値の供給まで守る」「明示的な供給では従来どおり
 * 反映する」の両側を固定する。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import EventDispatcher from '../src/event_dispatcher';
import PollObserver from '../src/poll';
import {waitForCondition, waitForDomSettled} from './helpers/async';

const getFrag = (element: HTMLElement): ElementFragment =>
  Fragment.get(element) as ElementFragment;

describe('ユーザー編集の優先', () => {
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
   * 利用者の編集と同じ順序で入力欄を操作します。
   *
   * `focus` してから値を変え、`change` を委譲経路へ流したあとフォーカスを外します。
   * フォーカス中は従来から再適用が抑止されるため、外すところまで行って初めて
   * 「確定した編集が守られるか」を検証できます。
   *
   * @param input 対象の入力欄
   * @param value 入力する値
   * @returns DOM 反映の完了を待つ Promise
   */
  const edit = async (
    input: HTMLInputElement,
    value: string,
  ): Promise<void> => {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();
    input.blur();
    await waitForDomSettled();
  };

  /**
   * HTML をマウントして初期評価を終えます。
   *
   * @param html マウントする HTML
   * @returns 戻り値はありません。
   */
  const mount = async (html: string): Promise<void> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
  };

  const RECORD_FORM = `
    <div id="state" data-bind='{"detail":{"name":"原名","kana":"ゲンカナ","tel":"03-0000-0000"}}'>
      <form id="f">
        <input id="name" name="name" data-attr-value="{{detail?.name || ''}}">
        <input id="kana" name="kana" data-attr-value="{{detail?.kana || ''}}">
        <input id="tel" name="tel" data-attr-value="{{detail?.tel || ''}}">
      </form>
    </div>`;

  describe('宣言バインドの再適用', () => {
    it('次の項目を編集しても前の項目の編集が保持される', async () => {
      await mount(RECORD_FORM);
      const form = container.querySelector('#f') as HTMLFormElement;
      const name = container.querySelector('#name') as HTMLInputElement;
      const kana = container.querySelector('#kana') as HTMLInputElement;
      const tel = container.querySelector('#tel') as HTMLInputElement;
      expect(name.value).toBe('原名');

      await edit(name, '編集A');
      await edit(kana, 'ヘンシュウビー');
      await edit(tel, '03-9999-9999');

      // 画面表示（3 項目とも編集値のまま）
      expect([name.value, kana.value, tel.value]).toEqual([
        '編集A',
        'ヘンシュウビー',
        '03-9999-9999',
      ]);
      // 収集値（送信内容）も編集値
      expect(Form.getValues(getFrag(form))).toEqual({
        name: '編集A',
        kana: 'ヘンシュウビー',
        tel: '03-9999-9999',
      });
    });

    it('編集していない項目は依存値の変化で更新される', async () => {
      await mount(`
        <div id="state" data-bind='{"detail":{"name":"原名"},"unit":"円"}'>
          <form id="f">
            <input id="name" name="name" data-attr-value="{{detail?.name || ''}}">
            <input id="label" name="label" readonly
                   data-attr-value="{{detail?.name || ''}}:{{unit}}">
          </form>
        </div>`);
      const state = container.querySelector('#state') as HTMLElement;
      const name = container.querySelector('#name') as HTMLInputElement;
      const label = container.querySelector('#label') as HTMLInputElement;

      await edit(name, '編集A');
      await Core.setBindingData(state, {detail: {name: '原名'}, unit: 'ドル'});
      await waitForDomSettled();

      // 未編集の欄は評価結果へ追従する。
      expect(label.value).toBe('原名:ドル');
    });

    it('選択とチェック状態も再評価で巻き戻らない', async () => {
      await mount(`
        <div id="state" data-bind='{"detail":{"id":"a","agreed":false},"tick":1}'>
          <form id="f">
            <select id="sel" name="id">
              <option value="a" data-attr-selected="{{detail?.id === 'a'}}">A</option>
              <option value="b" data-attr-selected="{{detail?.id === 'b'}}">B</option>
            </select>
            <input id="chk" type="checkbox" name="agreed" value="true"
                   data-attr-checked="{{detail?.agreed}}">
          </form>
        </div>`);
      const form = container.querySelector('#f') as HTMLFormElement;
      const sel = container.querySelector('#sel') as HTMLSelectElement;
      const chk = container.querySelector('#chk') as HTMLInputElement;
      expect(sel.value).toBe('a');
      expect(chk.checked).toBe(false);

      sel.focus();
      sel.value = 'b';
      sel.dispatchEvent(new Event('change', {bubbles: true}));
      await waitForDomSettled();
      sel.blur();
      chk.focus();
      chk.checked = true;
      chk.dispatchEvent(new Event('change', {bubbles: true}));
      await waitForDomSettled();
      chk.blur();
      await waitForDomSettled();

      // どちらの操作も、もう一方の change による再評価で巻き戻らない。
      expect(sel.value).toBe('b');
      expect(chk.checked).toBe(true);
      expect(Form.getValues(getFrag(form))).toEqual({id: 'b', agreed: true});
    });
  });

  describe('明示的な値の供給', () => {
    it('バインドデータを直接設定すると評価結果が反映される', async () => {
      await mount(RECORD_FORM);
      const state = container.querySelector('#state') as HTMLElement;
      const name = container.querySelector('#name') as HTMLInputElement;

      await edit(name, '編集A');
      expect(name.value).toBe('編集A');

      // 明示的な供給は権威を持つため、編集値ではなく評価結果になる。
      await Core.setBindingData(state, {detail: {name: 'サーバ値'}});
      await waitForDomSettled();
      expect(name.value).toBe('サーバ値');
    });

    it('data-{event}-reset で宣言バインド由来の値も空になる', async () => {
      await mount(`
        <div id="state" data-bind='{"detail":{"name":"原名"}}'>
          <form id="f">
            <input id="name" name="name" data-attr-value="{{detail?.name || ''}}">
          </form>
        </div>`);
      const state = container.querySelector('#state') as HTMLElement;
      const form = container.querySelector('#f') as HTMLFormElement;
      const name = container.querySelector('#name') as HTMLInputElement;

      await edit(name, '編集A');
      // 新規追加相当（レコードを空にしてから初期化する）。
      await Core.setBindingData(state, {detail: {}});
      await Form.reset(getFrag(form));
      await waitForDomSettled();

      expect(name.value).toBe('');
      // 既定値（value 属性）も空へ揃うため、次回の form.reset() でも空に戻る。
      expect(name.getAttribute('value')).toBe('');
      expect(Form.getValues(getFrag(form))).toEqual({name: ''});
    });

    it('フェッチ応答は送信前の編集を更新し、送信後の編集を残す', async () => {
      let release: (() => void) | null = null;
      const gate = new Promise<void>(resolve => {
        release = resolve;
      });
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        await gate;
        return new Response(
          JSON.stringify({name: 'サーバ名', memo: 'サーバ備考'}),
          {
            headers: {'Content-Type': 'application/json'},
          },
        );
      });
      await mount(`
        <form id="f" data-bind='{"name":"","memo":""}'>
          <input id="name" name="name">
          <input id="memo" name="memo">
          <button id="go" data-click-fetch="/detail.json" data-click-bind="#f">
            取得
          </button>
        </form>`);
      const form = container.querySelector('#f') as HTMLFormElement;
      const name = container.querySelector('#name') as HTMLInputElement;
      const memo = container.querySelector('#memo') as HTMLInputElement;
      const go = container.querySelector('#go') as HTMLElement;

      // 送信より前の編集
      await edit(name, '送信前');
      go.dispatchEvent(new Event('click', {bubbles: true}));
      await waitForDomSettled();
      // 送信より後の編集
      await edit(memo, '送信後');
      release!();
      await waitForCondition(() => name.value === 'サーバ名', {
        description: 'フェッチ応答の反映',
      });
      await waitForDomSettled();

      expect(name.value).toBe('サーバ名');
      expect(memo.value).toBe('送信後');
      expect(Form.getValues(getFrag(form))).toEqual({
        name: 'サーバ名',
        memo: '送信後',
      });
    });

    it('ポーリングの応答では編集が保持される', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({name: 'サーバ名', memo: 'サーバ備考'}), {
            headers: {'Content-Type': 'application/json'},
          }),
        ),
      );
      await mount(`
        <form id="f" data-bind='{"name":"","memo":""}'
              data-poll-fetch="/status.json" data-poll-bind="#f"
              data-poll-interval="100">
          <input id="name" name="name">
          <input id="memo" name="memo">
        </form>`);
      PollObserver.syncTree(container);
      const name = container.querySelector('#name') as HTMLInputElement;
      const memo = container.querySelector('#memo') as HTMLInputElement;
      await waitForCondition(() => memo.value === 'サーバ備考', {
        description: '初回ポーリングの反映',
        maxAttempts: 20,
        delayMs: 40,
      });

      await edit(name, '入力中');
      // 以降のポーリング（利用者が要求していない自動取得）では編集を消さない。
      await new Promise(resolve => setTimeout(resolve, 260));
      await waitForDomSettled();

      expect(name.value).toBe('入力中');
      expect(memo.value).toBe('サーバ備考');
    });
  });

  describe('双方向コミットの書き込み先', () => {
    it('祖先のバインドデータをフォームへ焼き付けない', async () => {
      await mount(RECORD_FORM);
      const state = container.querySelector('#state') as HTMLElement;
      const form = container.querySelector('#f') as HTMLFormElement;
      const kana = container.querySelector('#kana') as HTMLInputElement;
      const name = container.querySelector('#name') as HTMLInputElement;

      await edit(kana, 'ヘンシュウビー');
      // コミットで書かれるのはフォーム自身の値だけで、祖先の detail は入らない。
      expect(getFrag(form).getRawBindingData()).toEqual({
        name: '原名',
        kana: 'ヘンシュウビー',
        tel: '03-0000-0000',
      });

      // 祖先の更新がフォーム自身の古いコピーにシャドーされず届く。
      await Core.setBindingData(state, {detail: {name: '新名'}});
      await waitForDomSettled();
      expect(name.value).toBe('新名');
    });

    it('data-form-arg 指定時はそのキー配下へ書き込む', async () => {
      await mount(`
        <div id="state" data-bind='{"detail":{"a":"A1","b":"B1"}}'>
          <form id="f" data-form-arg="detail">
            <input id="a" name="a" data-attr-value="{{detail?.a || ''}}">
            <input id="b" name="b" data-attr-value="{{detail?.b || ''}}">
          </form>
        </div>`);
      const form = container.querySelector('#f') as HTMLFormElement;
      const a = container.querySelector('#a') as HTMLInputElement;
      const b = container.querySelector('#b') as HTMLInputElement;

      await edit(a, 'A2');
      // 参照キー（detail）と書込キーが一致する。
      expect(getFrag(form).getRawBindingData()).toEqual({
        detail: {a: 'A2', b: 'B1'},
      });
      expect(a.value).toBe('A2');

      await edit(b, 'B2');
      expect([a.value, b.value]).toEqual(['A2', 'B2']);
    });
  });

  describe('data-each の行の再利用', () => {
    it('別のレコードが入った再利用行では宣言バインドが反映される', async () => {
      await mount(`
        <div id="scope" data-bind='{"rows":[{"id":1,"memo":"m1"}]}'>
          <form id="f">
            <div data-each="rows" data-each-arg="row">
              <input class="memo" name="memo"
                     data-attr-value="{{row.memo || ''}}">
            </div>
          </form>
        </div>`);
      const scope = container.querySelector('#scope') as HTMLElement;
      const memo = container.querySelector('.memo') as HTMLInputElement;
      expect(memo.value).toBe('m1');

      await edit(memo, '編集');
      expect(memo.value).toBe('編集');

      // 行に別のレコードが入る更新では、行内の編集の印を解除して反映する。
      await Core.setBindingData(scope, {rows: [{id: 2, memo: 'm2'}]});
      await waitForDomSettled();
      const reused = container.querySelector('.memo') as HTMLInputElement;
      expect(reused.value).toBe('m2');
    });
  });
});
