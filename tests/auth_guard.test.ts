/* @vitest-environment jsdom */
/**
 * @fileoverview 認証ガード（data-unauthorized-redirect / data-forbidden-redirect）の
 * 回帰テスト。改修依頼第2回 #3 に対応する。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {checkAuthRedirect} from '../src/auth_guard';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('認証ガード checkAuthRedirect', () => {
  let assignedHref: string | null;
  let originalLocation: Location;

  beforeEach(() => {
    assignedHref = null;
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        get href() {
          return 'http://localhost/app/page.html';
        },
        set href(value: string) {
          assignedHref = value;
        },
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    document.body.removeAttribute('data-unauthorized-redirect');
    document.body.removeAttribute('data-forbidden-redirect');
  });

  it('401 で data-unauthorized-redirect の URL へ遷移する', () => {
    document.body.setAttribute('data-unauthorized-redirect', '/login.html');
    expect(checkAuthRedirect(401)).toBe(true);
    expect(assignedHref).toBe('/login.html');
  });

  it('403 で data-forbidden-redirect の URL へ遷移する', () => {
    document.body.setAttribute('data-forbidden-redirect', '/forbidden.html');
    expect(checkAuthRedirect(403)).toBe(true);
    expect(assignedHref).toBe('/forbidden.html');
  });

  it('対象ステータス以外（200/500）では何もしない', () => {
    document.body.setAttribute('data-unauthorized-redirect', '/login.html');
    expect(checkAuthRedirect(200)).toBe(false);
    expect(checkAuthRedirect(500)).toBe(false);
    expect(assignedHref).toBeNull();
  });

  it('属性が無いステータスでは遷移しない（ステータス別オプトイン）', () => {
    // 401 属性のみ → 403 では遷移しない
    document.body.setAttribute('data-unauthorized-redirect', '/login.html');
    expect(checkAuthRedirect(403)).toBe(false);
    expect(assignedHref).toBeNull();
  });

  it('現在ページ自身への遷移はループ防止で行わない', () => {
    document.body.setAttribute(
      'data-unauthorized-redirect',
      'http://localhost/app/page.html',
    );
    expect(checkAuthRedirect(401)).toBe(false);
    expect(assignedHref).toBeNull();
  });

  it('属性値の {{式}} を評価して遷移する', async () => {
    document.body.setAttribute('data-bind', '{"loginUrl":"/auth/login.html"}');
    document.body.setAttribute(
      'data-unauthorized-redirect',
      '{{loginUrl}}',
    );
    await Core.scan(document.body);
    await waitForDomSettled();

    expect(checkAuthRedirect(401)).toBe(true);
    expect(assignedHref).toBe('/auth/login.html');

    document.body.removeAttribute('data-bind');
  });
});

describe('認証ガード: 戻り先クエリ自動付与 (return-param)', () => {
  let assignedHref: string | null;
  let originalLocation: Location;

  beforeEach(() => {
    assignedHref = null;
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        pathname: '/app/page.html',
        search: '?a=1&b=2',
        hash: '#sec',
        get href() {
          return 'http://localhost/app/page.html?a=1&b=2#sec';
        },
        set href(value: string) {
          assignedHref = value;
        },
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    document.body.removeAttribute('data-unauthorized-redirect');
    document.body.removeAttribute('data-unauthorized-redirect-return-param');
    document.body.removeAttribute('data-forbidden-redirect');
    document.body.removeAttribute('data-forbidden-redirect-return-param');
    document.documentElement.removeAttribute('data-unauthorized-redirect');
    document.documentElement.removeAttribute(
      'data-unauthorized-redirect-return-param',
    );
  });

  it('現在の pathname+search+hash を指定クエリ名でエンコード付与する', () => {
    document.body.setAttribute('data-unauthorized-redirect', '/login.html');
    document.body.setAttribute(
      'data-unauthorized-redirect-return-param',
      'href',
    );
    expect(checkAuthRedirect(401)).toBe(true);
    const url = new URL(assignedHref as string, 'http://localhost');
    expect(url.pathname).toBe('/login.html');
    // 戻り先は生の pathname+search+hash 全体が 1 つのクエリ値として格納される。
    expect(url.searchParams.get('href')).toBe('/app/page.html?a=1&b=2#sec');
    // encodeURIComponent により ? や # は生のまま残らずエンコードされること。
    expect(assignedHref).toContain('href=%2Fapp%2Fpage.html');
  });

  it('空白を含む URL は encodeURIComponent 準拠で %20 にエンコードする', () => {
    // form-urlencoded（+）ではなく encodeURIComponent（%20）であることを固定する。
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        pathname: '/a b/x.html',
        search: '',
        hash: '',
        get href() {
          return 'http://localhost/a b/x.html';
        },
        set href(value: string) {
          assignedHref = value;
        },
      },
    });
    document.body.setAttribute('data-unauthorized-redirect', '/login.html');
    document.body.setAttribute(
      'data-unauthorized-redirect-return-param',
      'href',
    );
    expect(checkAuthRedirect(401)).toBe(true);
    expect(assignedHref).toContain('href=%2Fa%20b%2Fx.html');
    expect(assignedHref).not.toContain('+');
  });

  it('遷移先に同名クエリがある場合は宣言 URL 側を優先し付与しない', () => {
    document.body.setAttribute(
      'data-unauthorized-redirect',
      '/login.html?href=/fixed',
    );
    document.body.setAttribute(
      'data-unauthorized-redirect-return-param',
      'href',
    );
    expect(checkAuthRedirect(401)).toBe(true);
    const url = new URL(assignedHref as string, 'http://localhost');
    expect(url.searchParams.get('href')).toBe('/fixed');
  });

  it('遷移先の既存クエリは保持し戻り先クエリを追加マージする', () => {
    document.body.setAttribute(
      'data-unauthorized-redirect',
      '/login.html?foo=1',
    );
    document.body.setAttribute(
      'data-unauthorized-redirect-return-param',
      'back',
    );
    expect(checkAuthRedirect(401)).toBe(true);
    const url = new URL(assignedHref as string, 'http://localhost');
    expect(url.searchParams.get('foo')).toBe('1');
    expect(url.searchParams.get('back')).toBe('/app/page.html?a=1&b=2#sec');
  });

  it('遷移先 URL にフラグメントがある場合はその手前へクエリを挿入する', () => {
    document.body.setAttribute(
      'data-unauthorized-redirect',
      '/login.html?foo=1#top',
    );
    document.body.setAttribute(
      'data-unauthorized-redirect-return-param',
      'href',
    );
    expect(checkAuthRedirect(401)).toBe(true);
    // クエリはフラグメント(#top)の手前に追加され、フラグメントは末尾に残る。
    expect(assignedHref).toBe(
      '/login.html?foo=1&href=%2Fapp%2Fpage.html%3Fa%3D1%26b%3D2%23sec#top',
    );
    const url = new URL(assignedHref as string, 'http://localhost');
    expect(url.hash).toBe('#top');
    expect(url.searchParams.get('foo')).toBe('1');
    expect(url.searchParams.get('href')).toBe('/app/page.html?a=1&b=2#sec');
  });

  it('属性はステータス別に独立して動作する（403 側）', () => {
    document.body.setAttribute('data-forbidden-redirect', '/forbidden.html');
    document.body.setAttribute(
      'data-forbidden-redirect-return-param',
      'from',
    );
    expect(checkAuthRedirect(403)).toBe(true);
    const url = new URL(assignedHref as string, 'http://localhost');
    expect(url.pathname).toBe('/forbidden.html');
    expect(url.searchParams.get('from')).toBe('/app/page.html?a=1&b=2#sec');
  });

  it('戻り先付与後の URL でループ防止判定を行う', () => {
    // 戻り先を付与すると現在 URL と異なるため、自ページ起点でも遷移する。
    document.body.setAttribute(
      'data-unauthorized-redirect',
      'http://localhost/app/page.html',
    );
    document.body.setAttribute(
      'data-unauthorized-redirect-return-param',
      'href',
    );
    expect(checkAuthRedirect(401)).toBe(true);
    expect(assignedHref).not.toBeNull();
  });

  it('body 優先で戻り先属性も同要素から読み取る', () => {
    document.documentElement.setAttribute(
      'data-unauthorized-redirect',
      '/html-login.html',
    );
    document.documentElement.setAttribute(
      'data-unauthorized-redirect-return-param',
      'r',
    );
    document.body.setAttribute('data-unauthorized-redirect', '/body-login.html');
    document.body.setAttribute(
      'data-unauthorized-redirect-return-param',
      'href',
    );
    expect(checkAuthRedirect(401)).toBe(true);
    const url = new URL(assignedHref as string, 'http://localhost');
    expect(url.pathname).toBe('/body-login.html');
    // body の戻り先クエリ名（href）が使われ、html 側（r）は無視される。
    expect(url.searchParams.has('href')).toBe(true);
    expect(url.searchParams.has('r')).toBe(false);
  });
});

describe('認証ガード: fetch 経路統合', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let assignedHref: string | null;
  let originalLocation: Location;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
    assignedHref = null;
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        get href() {
          return 'http://localhost/app/page.html';
        },
        set href(value: string) {
          assignedHref = value;
        },
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    dispatcher.stop();
    vi.restoreAllMocks();
    document.body.removeAttribute('data-unauthorized-redirect');
    container.remove();
  });

  it('data-click-fetch が 401 を返すと遷移し、bind は行わない', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        Promise.resolve(
          new Response(JSON.stringify({secret: 'x'}), {
            status: 401,
            statusText: 'Unauthorized',
            headers: {'Content-Type': 'application/json'},
          }),
        ) as unknown as Promise<Response>,
    );
    document.body.setAttribute('data-unauthorized-redirect', '/login.html');

    container.innerHTML = `
      <button id="b" type="button"
        data-click-fetch="/api/secret.json" data-click-bind="#target"></button>
      <div id="target" data-bind='{}'></div>
    `;
    const button = container.querySelector('#b') as HTMLElement;
    const target = container.querySelector('#target') as HTMLElement;
    await Core.scan(container);
    await waitForDomSettled();

    button.click();
    await waitForCondition(() => assignedHref !== null, {
      description: '401 で遷移する',
    });

    expect(assignedHref).toBe('/login.html');
    // bind は実行されない（target は空のまま）
    expect(JSON.parse(target.getAttribute('data-bind') as string)).toEqual({});
  });
});
