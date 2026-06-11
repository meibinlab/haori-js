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
