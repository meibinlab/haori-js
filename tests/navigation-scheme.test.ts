/* @vitest-environment jsdom */
/**
 * @fileoverview 遷移先のスキームの検査（`data-{event}-redirect` /
 * `data-{event}-redirect-replace` / 認証ガード）のテスト。
 *
 * 遷移先には応答や URL パラメータの値を書けるため、値が `javascript:` などだと遷移の
 * 代わりにそのページの権限でコードが動きます。`http:`・`https:`・現在ページと同じ
 * スキームのときだけ遷移することを確かめます。
 *
 * 期待値の根拠は仕様「`data-{event}-redirect`」の「遷移できるスキーム」と、
 * 仕様「認証ガード（`data-unauthorized-redirect` / `data-forbidden-redirect`）」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {checkAuthRedirect} from '../src/auth_guard';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {waitForDomSettled} from './helpers/async';

describe('遷移先のスキーム', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let navigations: string[];
  let pageHref: string;
  let responseBody: Record<string, unknown>;
  let originalLocation: Location;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
    navigations = [];
    pageHref = 'http://localhost/apply.html';
    responseBody = {};
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        get origin() {
          return new URL(pageHref).origin;
        },
        get href() {
          return pageHref;
        },
        set href(value: string) {
          navigations.push(`href:${value}`);
        },
        replace(value: string) {
          navigations.push(`replace:${value}`);
        },
        get pathname() {
          return new URL(pageHref).pathname;
        },
        get search() {
          return '';
        },
        get hash() {
          return '';
        },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(responseBody), {
            headers: {'Content-Type': 'application/json'},
          }),
      ),
    );
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    dispatcher.stop();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    document.body.removeAttribute('data-unauthorized-redirect');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    container.remove();
  });

  /** 遷移を拒否したことの報告だけを抜き出します。 */
  const blockedReports = (): string[] =>
    (errorSpy.mock.calls as unknown[][])
      .map(args => args.map(arg => String(arg)).join(' '))
      .filter(message => message.includes('遷移しません'));

  /**
   * 応答の `next` を遷移先にする手続きを実行します。
   *
   * @param next 応答の `next`
   * @param attribute 遷移先の属性（`redirect` / `redirect-replace`）
   */
  const runRedirect = async (
    next: string,
    attribute = 'redirect',
  ): Promise<void> => {
    responseBody = {next};
    container.innerHTML = `
      <div id="state">
        <button data-click-fetch="/api/apply" data-click-bind="#state"
                data-click-${attribute}="{{next}}">申込</button>
      </div>`;
    await Core.scan(container);
    await waitForDomSettled();
    container
      .querySelector('button')!
      .dispatchEvent(new Event('click', {bubbles: true}));
    await waitForDomSettled();
    await new Promise(resolve => setTimeout(resolve, 50));
    await waitForDomSettled();
  };

  describe('data-{event}-redirect / -redirect-replace', () => {
    // 仕様「`data-{event}-redirect`」の「それ以外のスキーム（`javascript:`、`data:`、
    // `vbscript:`、`blob:`、`mailto:` など）と、URL として解析できない値では遷移しません。
    // `Log.error('Haori', ...)` で報告し」。
    it('応答の値が javascript: なら遷移せず報告する（回帰）', async () => {
      await runRedirect('javascript:alert(document.domain)');

      expect(navigations).toEqual([]);
      expect(blockedReports().length).toBe(1);
    });

    it('redirect-replace でも javascript: へは遷移しない（回帰）', async () => {
      await runRedirect('javascript:alert(1)', 'redirect-replace');

      expect(navigations).toEqual([]);
      expect(blockedReports().length).toBe(1);
    });

    // 仕様「`data-{event}-redirect`」の「先頭と末尾の空白・制御文字を除き、途中のタブと
    // 改行を除いて読みます（先頭に空白を付けた ` javascript:` や、途中にタブを挟んだ値も
    // 遮断します）」。
    it('大文字・先頭の空白・途中のタブを混ぜても遷移しない（回帰）', async () => {
      await runRedirect(' \u0001JaVa\tScRiPt:alert(1)');

      expect(navigations).toEqual([]);
      expect(blockedReports().length).toBe(1);
    });

    it.each([
      ['data:', 'data:text/html,<script>alert(1)</script>'],
      ['vbscript:', 'vbscript:msgbox(1)'],
      ['mailto:', 'mailto:someone@example.com'],
    ])('%s へは遷移しない（回帰）', async (_label, next) => {
      await runRedirect(next);

      expect(navigations).toEqual([]);
      expect(blockedReports().length).toBe(1);
    });

    it('URL として解析できない値では遷移しない（回帰）', async () => {
      await runRedirect('http://[');

      expect(navigations).toEqual([]);
      expect(blockedReports().length).toBe(1);
    });

    // 仕様「`data-{event}-redirect`」の「相対 URL（`/complete.html`、`next.html`、
    // `?step=2`）は現在ページのスキームになるので遷移します。外部の `https:` の URL
    // （決済画面など）へも遷移します」。
    it.each([
      ['/complete.html'],
      ['next.html'],
      ['?step=2'],
      ['https://pay.example/start'],
      ['http://localhost/done.html'],
    ])('%s へは遷移する', async next => {
      await runRedirect(next);

      expect(navigations).toEqual([`href:${next}`]);
      expect(blockedReports()).toEqual([]);
    });

    it('redirect-replace でも https: へは遷移する', async () => {
      await runRedirect('https://pay.example/start', 'redirect-replace');

      expect(navigations).toEqual(['replace:https://pay.example/start']);
    });

    // 仕様「`data-{event}-redirect`」の「現在ページと同じスキームのときだけ遷移します」。
    it('現在ページと同じスキーム（file:）なら遷移する', async () => {
      pageHref = 'file:///C:/app/apply.html';
      await runRedirect('done.html');

      expect(navigations).toEqual(['href:done.html']);
      expect(blockedReports()).toEqual([]);
    });

    it('現在ページが file: でも http: へは遷移する', async () => {
      pageHref = 'file:///C:/app/apply.html';
      await runRedirect('http://localhost/done.html');

      expect(navigations).toEqual(['href:http://localhost/done.html']);
    });
  });

  describe('認証ガード', () => {
    // 仕様「認証ガード（`data-unauthorized-redirect` / `data-forbidden-redirect`）」の
    // 「`http:`・`https:`・現在ページと同じスキームのときだけ遷移し、
    // それ以外（`javascript:` など）と解析できない値では `Log.error('Haori', ...)` で
    // 報告して遷移しません。遷移しなかった場合は、遷移しなかった応答として扱います」。
    it('遷移先の値が javascript: なら遷移せず false を返す（回帰）', async () => {
      document.body.setAttribute(
        'data-unauthorized-redirect',
        'javascript:alert(1)',
      );

      expect(checkAuthRedirect(401)).toBe(false);
      expect(navigations).toEqual([]);
      expect(blockedReports().length).toBe(1);
    });

    it('通常の遷移先へは遷移する', () => {
      document.body.setAttribute('data-unauthorized-redirect', '/login.html');

      expect(checkAuthRedirect(401)).toBe(true);
      expect(navigations).toEqual(['href:/login.html']);
    });
  });
});
