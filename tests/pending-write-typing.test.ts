/* @vitest-environment jsdom */
/**
 * @fileoverview 反映待ちの書き込みと打鍵中の編集のテスト。
 *
 * 期待値は仕様「反映待ちの間に起きた変化」の「保護の対象は**打鍵 1 文字ごと**です。
 * `change` の発火（フォーカスを外す・選択の確定）を待ちません」から取っている。
 *
 * 修正前は、打鍵を編集として記録するのが「`change`、または `data-input-*` を宣言した
 * 要素の `input`」に限られていた。宣言の無い入力欄では打鍵で通し番号が発番されず、
 * 反映待ちの書き込みが着弾して打った文字を消していた（外部ライブラリが値を入れた欄を
 * クリックし、その 25 ミリ秒以内に打つと再現する）。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Form from '../src/form';
import Fragment, {ElementFragment} from '../src/fragment';
import {waitForDomSettled} from './helpers/async';

describe('反映待ちの書き込みと打鍵中の編集', () => {
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
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  /**
   * 祖先のバインド更新が入力欄へ流し込まれる構成を組み立てます。
   *
   * @returns 祖先の要素と入力欄
   */
  async function mount(): Promise<{
    state: HTMLElement;
    form: HTMLFormElement;
    zip: HTMLInputElement;
    addr: HTMLInputElement;
  }> {
    container.innerHTML = `
      <div id="state" data-bind='{"record":{"zip":"","addr":""}}'>
        <form id="f" data-form-arg="record">
          <input id="zip" name="zip">
          <input id="addr" name="addr">
        </form>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled();
    return {
      state: container.querySelector('#state') as HTMLElement,
      form: container.querySelector('#f') as HTMLFormElement,
      zip: container.querySelector('#zip') as HTMLInputElement,
      addr: container.querySelector('#addr') as HTMLInputElement,
    };
  }

  /**
   * 入力欄へ打鍵します。`change` は発火させません（打鍵中の状態）。
   *
   * @param input 対象の入力欄
   * @param value 打鍵後の値
   * @param withChange `change` も発火させるかどうか
   */
  function type(
    input: HTMLInputElement,
    value: string,
    withChange = false,
  ): void {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    if (withChange) {
      input.dispatchEvent(new Event('change', {bubbles: true}));
    }
  }

  it('反映を要求した直後の打鍵は、着弾した書き込みに消されない（回帰）', async () => {
    const {state, form, addr} = await mount();
    // 外部ライブラリ（郵便番号からの住所補完）がスクリプトから代入した値。
    // イベントを伴わないため、バインドデータへは次の収集で載る。
    addr.value = '千代田';

    // 収集・コミットの結果が入力欄へ書き戻される（反映の要求）。
    void Core.setBindingData(state, {record: {zip: '1000001', addr: '千代田'}});
    // 要求から着弾までの間に打鍵する。`change` はまだ発火していない。
    type(addr, '千代田1-1');

    await waitForDomSettled(6);
    expect(addr.value).toBe('千代田1-1');
    // 仕様「ユーザー編集と宣言バインドの権威」の「DOM の値・チェック状態と内部値
    // （収集値）は編集値のまま保たれます」。保存値は収集値から作られるため、画面だけ
    // 直っても収集値が供給値のままなら、保存すると打った文字が失われる。
    expect(
      (
        Form.getValues(Fragment.get(form) as ElementFragment) as Record<
          string,
          unknown
        >
      ).addr,
    ).toBe('千代田1-1');
  });

  it('打鍵で change まで発火した場合も保護される', async () => {
    const {state, addr} = await mount();
    addr.value = '千代田';

    void Core.setBindingData(state, {record: {zip: '1000001', addr: '千代田'}});
    type(addr, '千代田1-1', true);

    await waitForDomSettled(6);
    expect(addr.value).toBe('千代田1-1');
  });

  it('要求より前の打鍵は、明示的な供給が上書きする', async () => {
    // 仕様「反映待ちの間に起きた変化」の「要求より前の編集は、明示的な供給が権威なので
    // 上書きします」。打鍵を編集として記録したことで供給が届かなくなっていないかを見る。
    const {state, addr} = await mount();
    type(addr, '手入力');
    await waitForDomSettled();

    void Core.setBindingData(state, {record: {zip: '', addr: '供給'}});
    await waitForDomSettled(6);
    expect(addr.value).toBe('供給');
  });

  it('`data-input-*` が無い入力欄の打鍵では手続きを起動しない', async () => {
    // 仕様「イベント属性」の「このオプトインが決めるのは手続きを起動するかどうかだけ」。
    // 打鍵を記録するようになっても、双方向コミット（収集してバインドへ書き戻す手続き）は
    // 走らせない。
    const {state, addr} = await mount();
    type(addr, '打鍵のみ');
    await waitForDomSettled(6);

    const record = (
      Core.getBindingData(state, {resolved: true}) as Record<string, unknown>
    ).record as Record<string, unknown>;
    expect(record.addr).toBe('');
  });

  it('`data-input-*` を宣言した入力欄では従来どおり手続きが走る', async () => {
    container.innerHTML = `
      <div id="state2" data-bind='{"q":""}'>
        <form id="f2">
          <input id="q" name="q" data-input-form>
        </form>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled();
    // 双方向コミットの書き込み先はフォーム自身のバインドデータ（仕様「`data-bind`」）。
    const form = container.querySelector('#f2') as HTMLElement;
    const q = container.querySelector('#q') as HTMLInputElement;

    type(q, 'あい');
    await waitForDomSettled(6);

    expect(
      (Core.getBindingData(form, {resolved: true}) as Record<string, unknown>)
        .q,
    ).toBe('あい');
  });
});
