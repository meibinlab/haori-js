/* @vitest-environment jsdom */
/**
 * @fileoverview 戻り先リダイレクト（data-{event}-redirect-return-param）の
 * 受け手側テスト。手続き成功後に URL クエリから安全なローカルパスのみへ遷移し、
 * 安全でない／値が無い場合は data-{event}-redirect へフォールバックすることを
 * 検証する。送り手（認証ガードの *-return-param）との往復も確認する。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Haori from '../src/haori';
import Log from '../src/log';
import {checkAuthRedirect} from '../src/auth_guard';
import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('Procedure redirect return-param（受け手側）', () => {
  let assignedHref: string | null;
  let originalLocation: Location;

  /**
   * window.location を、href の代入を捕捉しつつ search/origin を差し替えられる
   * モックに置き換えます。
   *
   * @param search 現在ページのクエリ文字列（例 `?href=%2Fadmin`）
   * @param pathname 現在ページのパス
   */
  function mockLocation(search: string, pathname = '/login.html'): void {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        origin: 'http://localhost',
        get href() {
          return `http://localhost${pathname}${search}`;
        },
        set href(value: string) {
          assignedHref = value;
        },
        get pathname() {
          return pathname;
        },
        get search() {
          return search;
        },
        get hash() {
          return '';
        },
      },
    });
  }

  beforeEach(async () => {
    vi.restoreAllMocks();
    assignedHref = null;
    originalLocation = window.location;
    (window as Window & typeof globalThis & {Haori?: unknown}).Haori = Haori;
    await import('../src/observer');
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    document.body.innerHTML = '';
  });

  /**
   * data-click-fetch / redirect / redirect-return-param を備えたボタンを生成し、
   * DOM へ追加して初期化を待ちます。
   *
   * @param redirect data-click-redirect の値（null なら未設定）
   * @param returnParam data-click-redirect-return-param の値（null なら未設定）
   * @returns 生成したボタン要素
   */
  async function setupButton(
    redirect: string | null,
    returnParam: string | null,
  ): Promise<HTMLButtonElement> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const btn = document.createElement('button');
    btn.setAttribute('data-click-fetch', 'http://api.test/login');
    btn.setAttribute('data-click-method', 'POST');
    if (redirect !== null) {
      btn.setAttribute('data-click-redirect', redirect);
    }
    if (returnParam !== null) {
      btn.setAttribute('data-click-redirect-return-param', returnParam);
    }
    container.appendChild(btn);
    await waitForDomSettled();
    return btn;
  }

  it('安全なローカルパスはそのクエリ先へ遷移する', async () => {
    mockLocation('?href=%2Fadmin%2Fuser.html%3Fa%3D1%23x');
    const btn = await setupButton('/dashboard.html', 'href');
    btn.click();
    await waitForCondition(() => assignedHref !== null, {
      description: 'redirect to return path',
    });
    expect(assignedHref).toBe('/admin/user.html?a=1#x');
  });

  it('外部 URL は拒否し、既定の遷移先へフォールバックして警告する', async () => {
    const warnSpy = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
    mockLocation('?href=https%3A%2F%2Fevil.com');
    const btn = await setupButton('/dashboard.html', 'href');
    btn.click();
    await waitForCondition(() => assignedHref !== null, {
      description: 'fallback redirect',
    });
    expect(assignedHref).toBe('/dashboard.html');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('プロトコル相対（//・/\\）は拒否し既定へフォールバックする', async () => {
    mockLocation('?href=%2F%2Fevil.com');
    let btn = await setupButton('/dashboard.html', 'href');
    btn.click();
    await waitForCondition(() => assignedHref !== null, {
      description: 'fallback for //',
    });
    expect(assignedHref).toBe('/dashboard.html');

    assignedHref = null;
    mockLocation('?href=%2F%5Cevil.com');
    btn = await setupButton('/dashboard.html', 'href');
    btn.click();
    await waitForCondition(() => assignedHref !== null, {
      description: 'fallback for /\\',
    });
    expect(assignedHref).toBe('/dashboard.html');
  });

  it('クエリが無ければ既定の遷移先へ遷移する', async () => {
    mockLocation('');
    const btn = await setupButton('/dashboard.html', 'href');
    btn.click();
    await waitForCondition(() => assignedHref !== null, {
      description: 'default redirect when no query',
    });
    expect(assignedHref).toBe('/dashboard.html');
  });

  it('既定の遷移先（redirect）が無ければ return-param は無視され遷移しない', async () => {
    mockLocation('?href=%2Fadmin%2Fuser.html');
    const btn = await setupButton(null, 'href');
    btn.click();
    // 遷移が起きないことを確認するため、十分なサイクル待機する。
    await waitForDomSettled(6);
    expect(assignedHref).toBeNull();
  });

  it('送り手（認証ガード）の付与値をそのまま消費できる（往復）', async () => {
    // 送り手: 保護ページ /app/page.html で 401 → /login.html?href=<元URL>
    mockLocation('', '/app/page.html');
    document.body.setAttribute('data-unauthorized-redirect', '/login.html');
    document.body.setAttribute('data-unauthorized-redirect-return-param', 'href');
    expect(checkAuthRedirect(401)).toBe(true);
    const sentUrl = assignedHref as unknown as string;
    document.body.removeAttribute('data-unauthorized-redirect');
    document.body.removeAttribute('data-unauthorized-redirect-return-param');
    const sentSearch = sentUrl.slice(sentUrl.indexOf('?'));

    // 受け手: ログインページで成功 → 付与値を消費して元 URL へ復帰
    assignedHref = null;
    mockLocation(sentSearch);
    const btn = await setupButton('/dashboard.html', 'href');
    btn.click();
    await waitForCondition(() => assignedHref !== null, {
      description: 'round-trip redirect',
    });
    expect(assignedHref).toBe('/app/page.html');
  });
});
