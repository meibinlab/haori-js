/* @vitest-environment jsdom */
/**
 * @fileoverview URL の変更を契機とした `data-url-param` の読み直しを検証します。
 *
 * 取り込みが要素の走査時の 1 回だけだったため、`data-{event}-history` で URL を
 * 書き換えても取り込んだ値が古いまま残っていました（課題 51）。
 *
 * 期待値の根拠は仕様「`data-url-param`」の「取り込みの契機」。戻る操作の扱いは
 * 仕様「`data-{event}-history`」の「印が付いていない履歴項目（ページを開いた最初の
 * 状態など）へ戻ったときは再読み込みせず、`data-url-param` の読み直しだけを行う」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import Fragment from '../src/fragment';
import Log from '../src/log';
import {waitForDomSettled} from './helpers/async';

describe('URL の変更と data-url-param の読み直し', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;

  beforeEach(() => {
    history.replaceState(null, '', '/page?q=v0');
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    dispatcher.stop();
    container.remove();
    history.replaceState(null, '', '/');
  });

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
   * 検索フォームと取り込み先を持つ画面を組み立てます。
   *
   * @returns 走査の完了 Promise
   */
  const mountSearchPage = (): Promise<void> =>
    mount(`
      <form id="f"><input id="q" name="q" value=""></form>
      <div id="state" data-bind='{"tick": 0}'>
        <button id="search" type="button" data-click-history-form="#f">URL を書き換える</button>
        <button id="tick" type="button"
          data-click-data='{"tick": {{tick + 1}}}'
          data-click-bind="#state" data-click-bind-merge>別のキーを更新</button>

        <div id="withArg" data-bind='{"selfTick": 0}' data-url-param data-url-arg="urlParams">
          <span id="argV">{{urlParams.q}}</span>
          <span id="argSelfTick">{{selfTick}}</span>
          <button id="tickSelf" type="button"
            data-click-data='{"selfTick": {{selfTick + 1}}}'
            data-click-bind="#withArg" data-click-bind-merge>自身のキーを更新</button>
        </div>

        <div id="noArg" data-url-param>
          <span id="noArgV">{{q}}</span>
        </div>
      </div>`);

  /**
   * 検索欄へ値を入れて URL を書き換えます。
   *
   * @param value 検索欄へ入れる値
   * @returns 待ち合わせの Promise
   */
  const search = async (value: string): Promise<void> => {
    const input = container.querySelector('#q') as HTMLInputElement;
    input.value = value;
    await click('#search');
  };

  it('data-{event}-history で URL を書き換えると、取り込んだ値が新しくなる', async () => {
    await mountSearchPage();
    expect(container.querySelector('#argV')?.textContent).toBe('v0');

    await search('v1');

    expect(window.location.search).toBe('?q=v1');
    expect(container.querySelector('#argV')?.textContent).toBe('v1');
  });

  it('読み直しても、同じ要素へ書いた他のキーは残る', async () => {
    await mountSearchPage();
    await click('#tickSelf');
    expect(container.querySelector('#argSelfTick')?.textContent).toBe('1');

    await search('v1');

    expect(container.querySelector('#argV')?.textContent).toBe('v1');
    expect(container.querySelector('#argSelfTick')?.textContent).toBe('1');
  });

  it('data-url-arg を持たない要素も新しい値になる', async () => {
    await mountSearchPage();
    expect(container.querySelector('#noArgV')?.textContent).toBe('v0');

    await search('v1');

    expect(container.querySelector('#noArgV')?.textContent).toBe('v1');
  });

  it('再評価だけでは読み直さない', async () => {
    await mountSearchPage();
    // Haori を通さずに URL だけを変える（他のスクリプトによる書き換えに相当）。
    history.replaceState(null, '', '/page?q=vX');

    await click('#tick');

    expect(container.querySelector('#argV')?.textContent).toBe('v0');
    expect(container.querySelector('#noArgV')?.textContent).toBe('v0');
  });

  it('Haori が積んでいない履歴項目への戻る操作で読み直す', async () => {
    await mountSearchPage();
    history.replaceState(null, '', '/page?q=v1');

    window.dispatchEvent(new PopStateEvent('popstate', {state: null}));
    await waitForDomSettled();
    await new Promise(resolve => setTimeout(resolve, 30));
    await waitForDomSettled();

    expect(container.querySelector('#argV')?.textContent).toBe('v1');
    expect(container.querySelector('#noArgV')?.textContent).toBe('v1');
  });

  it('読み直しに失敗しても、記録だけ残して呼び出し側を止めない', async () => {
    await mountSearchPage();
    const errors: string[] = [];
    vi.spyOn(Log, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
    vi.spyOn(Core, 'setAttribute').mockRejectedValue(
      new Error('テスト用の失敗'),
    );

    await expect(Core.refreshUrlParams()).resolves.toBeUndefined();

    expect(
      errors.some(message => message.includes('読み直せませんでした')),
    ).toBe(true);
  });

  it('走査していない要素は読み直しの対象にしない', async () => {
    await mountSearchPage();
    // 走査していない木（Haori はこの要素を知らない）。
    const detached = document.createElement('div');
    detached.setAttribute('data-url-param', '');
    document.body.appendChild(detached);

    try {
      await search('v1');

      expect(Fragment.peek(detached)).toBeNull();
    } finally {
      detached.remove();
    }
  });
});
