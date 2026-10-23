/* @vitest-environment jsdom */
/**
 * @fileoverview 認証ガードを取得ごとに切り替えるテスト
 *
 * 期待値の根拠は仕様「取得ごとの切り替え」です。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import Core from '../src/core';
import Dev from '../src/dev';
import Fragment, {ElementFragment} from '../src/fragment';
import Haori from '../src/haori';
import Log from '../src/log';
import Procedure from '../src/procedure';
import {waitForCondition} from './helpers/async';

describe('取得ごとの認証ガードの切り替え', () => {
  let assignedHref: string | null;
  let originalLocation: Location;
  let fetchErrors: number[];

  /**
   * 失敗の表示へ進んだ取得のステータスを記録します。
   *
   * @param event 取得の失敗のイベント
   * @returns 戻り値はありません。
   */
  const recordFetchError = (event: Event): void => {
    fetchErrors.push((event as CustomEvent<{status: number}>).detail.status);
  };

  beforeEach(() => {
    assignedHref = null;
    fetchErrors = [];
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        pathname: '/app/page.html',
        search: '?a=1',
        hash: '',
        get href() {
          return 'http://localhost/app/page.html?a=1';
        },
        set href(value: string) {
          assignedHref = value;
        },
      },
    });
    document.addEventListener('haori:fetcherror', recordFetchError);
    vi.spyOn(Log, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    document.removeEventListener('haori:fetcherror', recordFetchError);
    document.body.innerHTML = '';
    for (const name of [...document.body.getAttributeNames()]) {
      document.body.removeAttribute(name);
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /**
   * 取得の応答をステータスで返すようにします。
   *
   * @param status 応答のステータス
   * @returns 戻り値はありません。
   */
  const respondWith = (status: number): void => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response('{"message": "denied"}', {
            status,
            headers: {'Content-Type': 'application/json'},
          }),
        ),
      ),
    );
  };

  /**
   * 属性を付けたボタンをクリックの手続きとして動かします。
   *
   * @param attrs 属性
   * @returns 待ち合わせの Promise
   */
  const click = async (attrs: Record<string, string>): Promise<void> => {
    const element = document.createElement('button');
    for (const [name, value] of Object.entries(attrs)) {
      element.setAttribute(name, value);
    }
    document.body.appendChild(element);
    await new Procedure(
      Fragment.get(element) as ElementFragment,
      'click',
    ).run();
  };

  /**
   * HTML を置いて走査し、宣言した取得の応答が処理されるまで待ちます。
   *
   * @param html 置く HTML
   * @param requests 待つ取得の回数（これまでの回数を含む）
   * @returns 待ち合わせの Promise
   */
  const mount = async (html: string, requests = 1): Promise<void> => {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    await Core.scan(container);
    await Haori.waitForRenders();
    await waitForCondition(
      () =>
        (fetch as unknown as {mock: {calls: unknown[]}}).mock.calls.length >=
        requests,
      {description: '取得', maxAttempts: 40, delayMs: 10},
    );
    // 応答の処理（認証ガードの判定）まで進める。
    await new Promise(resolve => setTimeout(resolve, 30));
  };

  it('空の宣言を書いた取得の 403 は遷移せず、失敗の表示へ進む（回帰）', async () => {
    // 仕様「取得ごとの切り替え」の「空（`""`、または `{{...}}` が空になる）」「遷移せず、[失敗時のアクション](#失敗時のアクション)と応答本文の表示へ進む」
    document.body.setAttribute('data-forbidden-redirect', '/forbidden.html');
    respondWith(403);
    await click({
      'data-click-fetch': '/api/op',
      'data-click-fetch-method': 'POST',
      'data-click-forbidden-redirect': '',
    });
    expect(assignedHref).toBeNull();
    expect(fetchErrors).toEqual([403]);
  });

  it('宣言の無い取得は <body> の宣言に従う（後方互換）', async () => {
    // 仕様「取得ごとの切り替え」の「無い」「従来どおり `<body>`／`<html>` の宣言に従う」
    document.body.setAttribute('data-forbidden-redirect', '/forbidden.html');
    respondWith(403);
    await click({'data-click-fetch': '/api/op'});
    expect(assignedHref).toBe('/forbidden.html');
    expect(fetchErrors).toEqual([]);
  });

  it('URL を書いた取得は、<body> に宣言が無くても遷移する（回帰）', async () => {
    // 仕様「取得ごとの切り替え」の「URL がある」「その URL へ遷移する（`<body>` に宣言が無くても遷移する）」
    respondWith(403);
    await mount(
      '<div data-fetch="/api/access-check" data-fetch-forbidden-redirect="/denied.html"></div>',
    );
    expect(assignedHref).toBe('/denied.html');
  });

  it('URL を書いた取得があっても、ほかの取得の 403 では遷移しない', async () => {
    // 仕様「取得ごとの切り替え」の「書いた取得の 401 / 403 では、`<body>`／`<html>` の宣言ではなく、取得の要素の宣言に従います」
    respondWith(403);
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div hidden data-forbidden-redirect-holder data-fetch-forbidden-redirect="/denied.html"></div>',
    );
    await click({'data-click-fetch': '/api/op'});
    expect(assignedHref).toBeNull();
    expect(fetchErrors).toEqual([403]);
  });

  it('401 も同じく取得の要素の宣言に従う（回帰）', async () => {
    // 仕様「取得ごとの切り替え」の「`data-{event}-unauthorized-redirect` / `data-{event}-forbidden-redirect`」
    document.body.setAttribute('data-unauthorized-redirect', '/login.html');
    respondWith(401);
    await click({
      'data-click-fetch': '/api/op',
      'data-click-unauthorized-redirect': '/relogin.html',
    });
    expect(assignedHref).toBe('/relogin.html');
  });

  it('値の {{...}} は取得の要素のスコープで評価し、空になれば遷移しない（回帰）', async () => {
    // 仕様「取得ごとの切り替え」の「値の `{{...}}` は、取得の要素のスコープで評価します」「空（`""`、または `{{...}}` が空になる）」
    document.body.setAttribute('data-forbidden-redirect', '/forbidden.html');
    respondWith(403);
    await mount(`
      <div data-bind='{"to": "/scoped.html", "none": ""}'>
        <div id="a" data-fetch="/api/a" data-fetch-forbidden-redirect="{{to}}"></div>
      </div>`);
    expect(assignedHref).toBe('/scoped.html');
    assignedHref = null;
    await mount(
      `
      <div data-bind='{"none": ""}'>
        <div data-fetch="/api/b" data-fetch-forbidden-redirect="{{none}}"></div>
      </div>`,
      2,
    );
    expect(assignedHref).toBeNull();
  });

  it('戻り先クエリも取得の要素の宣言を使う', async () => {
    // 仕様「取得ごとの切り替え」の「戻り先クエリ（[`*-return-param`](#戻り先クエリの自動付与-return-param)）も取得の要素に書きます」
    respondWith(403);
    await click({
      'data-click-fetch': '/api/op',
      'data-click-forbidden-redirect': '/denied.html',
      'data-click-forbidden-redirect-return-param': 'back',
    });
    expect(assignedHref).toBe('/denied.html?back=%2Fapp%2Fpage.html%3Fa%3D1');
  });

  it('遷移できないスキームは、取得の要素の宣言でも遷移しない', async () => {
    // 仕様「取得ごとの切り替え」の「遷移できるスキームと、現在ページ自身へ遷移しない点は、`<body>` の宣言と同じです」
    respondWith(403);
    await click({
      'data-click-fetch': '/api/op',
      'data-click-forbidden-redirect': 'javascript:alert(1)',
    });
    expect(assignedHref).toBeNull();
  });

  it('data-import の取得も取得の要素の宣言に従う（回帰）', async () => {
    // 仕様「取得ごとの切り替え」の「`data-import-unauthorized-redirect` / `data-import-forbidden-redirect`」
    respondWith(403);
    await mount(
      '<div data-import="/part.html" data-import-forbidden-redirect="/denied.html"></div>',
    );
    expect(assignedHref).toBe('/denied.html');
  });

  describe('取得の無い要素に書いたイベントの宣言', () => {
    it.each([
      ['data-click-forbidden-redirect'],
      ['data-click-unauthorized-redirect'],
    ])('開発モードでは %s に warn を出す', async name => {
      // 仕様「取得ごとの切り替え」の「取得の無い要素に書いた場合は、開発モードで `warn` ログを出します」
      vi.spyOn(Dev, 'isEnabled').mockReturnValue(true);
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      await click({[name]: '/denied.html'});
      expect(
        warn.mock.calls.some(call =>
          call.some(part => String(part).includes(name)),
        ),
      ).toBe(true);
    });

    it.each([
      ['取得がある', true, {'data-click-fetch': '/api/op'}],
      ['開発モードでない', false, {}],
    ])('%s場合は warn を出さない', async (_label, dev, extra) => {
      // 仕様「取得ごとの切り替え」の「取得の無い要素に書いた場合は、開発モードで `warn` ログを出します」
      vi.spyOn(Dev, 'isEnabled').mockReturnValue(dev);
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      respondWith(200);
      await click({
        'data-click-unauthorized-redirect': '/login.html',
        ...extra,
      });
      expect(
        warn.mock.calls.some(call =>
          call.some(part => String(part).includes('-redirect')),
        ),
      ).toBe(false);
    });
  });
});
