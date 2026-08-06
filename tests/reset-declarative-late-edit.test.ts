/* @vitest-environment jsdom */
/**
 * @fileoverview リセットを要求した後の編集が、宣言バインドを持つ欄でも残ることの
 * 回帰テスト。
 *
 * クリア（`data-{event}-reset-before`）を押した直後に別の欄へ入力すると、その欄の
 * 入力は残らなければならない。宣言バインド（`value="{{式}}"`）を持つ欄では、
 * リセット末尾の再評価が評価結果を書き戻して打った文字を消していた。宣言バインドの
 * 有無で保護の有無が変わってはならない。
 *
 * 期待値の根拠は仕様「`data-{event}-reset`」の「リセットを要求した後に行われた編集は
 * リセットを越えて残ります」と、仕様「反映待ちの間に起きた変化」の「保護の対象は
 * **打鍵 1 文字ごと**です。`change` の発火（フォーカスを外す・選択の確定）を
 * 待ちません」。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {waitForDomSettled} from './helpers/async';

describe('リセットを要求した後の編集（宣言バインドを持つ欄）', () => {
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

  /** 検索条件フォーム。両方の欄が宣言バインドで値を受ける。 */
  const DECLARATIVE_FORM = `
    <div id="state" data-bind='{"customerId":"","staffName":""}'>
      <form id="search">
        <input id="customerId" name="customerId" type="text"
               value="{{customerId}}">
        <input id="staffName" name="staffName" type="text"
               value="{{staffName}}">
      </form>
      <button id="clear" type="button"
              data-click-reset-before="#search"></button>
    </div>`;

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

  /**
   * 指定した入力欄の要素を返します。
   *
   * @param id 要素の id
   * @returns 入力欄の要素
   */
  const input = (id: string): HTMLInputElement =>
    container.querySelector(`#${id}`) as HTMLInputElement;

  it('クリアと同一タスクで打った文字は残り、他の欄はリセットされる', async () => {
    await mount(DECLARATIVE_FORM);
    // 検索条件を 1 つ確定させる（`change` まで発火させる）。
    input('customerId').value = '9999';
    input('customerId').dispatchEvent(new Event('input', {bubbles: true}));
    input('customerId').dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled();
    expect(input('customerId').value).toBe('9999');

    // クリアを押し、同じタスクのうちに別の欄へ入力する（`change` は伴わない）。
    (container.querySelector('#clear') as HTMLElement).dispatchEvent(
      new MouseEvent('click', {bubbles: true}),
    );
    input('staffName').value = '田中';
    input('staffName').dispatchEvent(new Event('input', {bubbles: true}));
    // リセットは複数の段に分かれて非同期に進む。最後の段（再評価と、リセット後の値
    // でのバインドデータ更新）まで進めてから確かめる。
    await waitForDomSettled();
    await waitForDomSettled();
    await waitForDomSettled();

    // 要求より後の編集は残り、編集していない欄はリセットされる。
    expect(input('staffName').value).toBe('田中');
    expect(input('customerId').value).toBe('');
  });
});
