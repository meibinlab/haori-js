/* @vitest-environment jsdom */
/**
 * @fileoverview リセットと `data-derive` の配下の再評価の関係を検証します。
 *
 * `data-derive` は、配下へ公開するバインドデータが前回の評価時と同じなら配下の
 * 再評価を省きます。リセットは入力欄の DOM を直接空へ揃えるため、この記録を残した
 * ままだと、入れ直しの再評価が配下へ届かず欄が空のまま残ります（課題 49）。
 *
 * 期待値の根拠は仕様「`data-{event}-reset`」の「再評価して `data-each` の行と宣言
 * バインドの現在の評価結果を入力欄へ入れ直す」。`data-if` の内側での再評価は仕様
 * 「data-if の動作」。
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {waitForDomSettled} from './helpers/async';

describe('リセットと data-derive の配下の再評価', () => {
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
    container.remove();
  });

  /**
   * 指定した要素を押し、手続きと反映が落ち着くまで待ちます。
   *
   * @param selector 押す要素のセレクタ
   * @returns 待ち合わせの Promise
   */
  const click = async (selector: string): Promise<void> => {
    (container.querySelector(selector) as HTMLElement).click();
    await waitForDomSettled();
    await new Promise(resolve => setTimeout(resolve, 30));
    await waitForDomSettled();
  };

  /**
   * 指定した HTML を走査して待ち合わせます。
   *
   * @param html 走査する HTML
   * @returns 走査の完了 Promise
   */
  const mount = async (html: string): Promise<void> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
  };

  /**
   * 編集欄を `data-if` で開く構成を組み立てます。
   *
   * @param withDerive `data-if` の内側でフォームを `data-derive` が包むかどうか
   * @returns 走査の完了 Promise
   */
  const mountDialog = (withDerive: boolean): Promise<void> =>
    mount(`
      <div id="state" data-bind='{"editingIndex": -1, "editing": null}'>
        <button id="open" type="button"
          data-click-reset-before="#rule-form"
          data-click-data='{"editingIndex": 0, "editing": {"name": "A", "kind": "k2"}}'
          data-click-bind="#state" data-click-bind-merge>開く</button>
        <button id="openPlain" type="button"
          data-click-data='{"editingIndex": 0, "editing": {"name": "A", "kind": "k2"}}'
          data-click-bind="#state" data-click-bind-merge>リセットせずに開く</button>
        <button id="close" type="button"
          data-click-data='{"editingIndex": -1}'
          data-click-bind="#state" data-click-bind-merge>閉じる</button>

        <div id="panel" data-if="editingIndex >= 0">
          ${
            withDerive
              ? `<div data-derive="({locked: editing?.kind === 'k1'})" data-derive-name="lock">`
              : ''
          }
            <form id="rule-form">
              <!-- 表示条件のキーを参照する欄。非表示のあいだは空に評価される -->
              <input id="name" name="name"
                data-attr-value="{{editingIndex>=0&&editing?(editing.name||''):''}}">
              <!-- 対照。表示条件のキーを参照しない -->
              <input id="nameCopy" name="nameCopy"
                data-attr-value="{{editing?.name||''}}">
            </form>
          ${withDerive ? '</div>' : ''}
        </div>
      </div>`);

  /**
   * 同じ値で開き直します。
   *
   * @param openSelector 開くボタンのセレクタ
   * @returns 待ち合わせの Promise
   */
  const reopen = async (openSelector: string): Promise<void> => {
    await click(openSelector);
    await click('#close');
    await click(openSelector);
  };

  it('data-if の内側の data-derive があっても、開き直した欄が評価結果で埋まる', async () => {
    await mountDialog(true);

    await reopen('#open');

    const name = container.querySelector('#name') as HTMLInputElement;
    const copy = container.querySelector('#nameCopy') as HTMLInputElement;
    expect(name.value).toBe('A');
    expect(copy.value).toBe('A');
  });

  it('data-derive を使わない構成でも結果は同じ（対照）', async () => {
    await mountDialog(false);

    await reopen('#open');

    const name = container.querySelector('#name') as HTMLInputElement;
    const copy = container.querySelector('#nameCopy') as HTMLInputElement;
    expect(name.value).toBe('A');
    expect(copy.value).toBe('A');
  });

  it('リセットせずに開き直した場合の値は変わらない', async () => {
    await mountDialog(true);

    await reopen('#openPlain');

    const name = container.querySelector('#name') as HTMLInputElement;
    const copy = container.querySelector('#nameCopy') as HTMLInputElement;
    expect(name.value).toBe('A');
    expect(copy.value).toBe('A');
  });

  it('data-if を使わない構成でも、リセットした欄が評価結果で埋まる', async () => {
    await mount(`
      <div id="state" data-bind='{"editing": {"name": "A"}}'>
        <button id="reset" type="button"
          data-click-reset="#rule-form"
          data-click-data='{"tick": 1}'
          data-click-bind="#state" data-click-bind-merge>リセット</button>
        <form id="rule-form">
          <div data-derive="({locked: editing?.name === 'X'})" data-derive-name="lock">
            <input id="name" name="name" data-attr-value="{{editing?.name || ''}}">
          </div>
        </form>
      </div>`);
    const name = container.querySelector('#name') as HTMLInputElement;
    expect(name.value).toBe('A');

    await click('#reset');

    expect(name.value).toBe('A');
  });
});
