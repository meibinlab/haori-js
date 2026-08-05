/* @vitest-environment jsdom */
/**
 * @fileoverview bind より後で実行するアクション属性の遅延評価のテスト
 *
 * `data-{event}-redirect` などは応答のバインド（処理順 9）より後に実行されるが、
 * 従来は手続き開始時に評価した文字列を使っていたため、応答の値で遷移先やメッセージ
 * を切り替えられなかった。ここでは
 *
 * - 使用直前に評価し直すことで応答の値が反映される
 * - 手続きの途中で参照が消えた場合は開始時の値へフォールバックする
 * - 行スコープ・`-bind-arg`・`-if` との併用でも期待どおりに動く
 *
 * ことを固定する。
 *
 * 期待値の根拠は仕様「バインド後に実行するアクションの評価タイミング」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import EventDispatcher from '../src/event_dispatcher';
import Haori from '../src/haori';
import Log from '../src/log';
import Procedure from '../src/procedure';
import {waitForCondition, waitForDomSettled} from './helpers/async';

/** 応答本文（`/api/apply` 用） */
const APPLY_RESPONSE = {
  redirectUrl: '/pay/start',
  nextAction: 'pay',
  no: 'A-1',
  id: '42',
  panel: '#panel2',
  paramName: 'href',
};

describe('bind より後のアクション属性の遅延評価', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let assignedHref: string | null;
  let storedAtRedirect: string | null;
  let originalLocation: Location;
  let search: string;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
    assignedHref = null;
    storedAtRedirect = null;
    search = '';
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        origin: 'http://localhost',
        get href() {
          return `http://localhost/apply.html${search}`;
        },
        set href(value: string) {
          assignedHref = value;
          // 遷移時点のストレージ内容を控える（ミラーとの順序を確認するため）。
          storedAtRedirect = sessionStorage.getItem('apply');
        },
        get pathname() {
          return '/apply.html';
        },
        get search() {
          return search;
        },
        get hash() {
          return '';
        },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const path = new URL(String(url), 'http://localhost').pathname;
        let body: Record<string, unknown> = {ok: true};
        if (path === '/api/apply') {
          body = APPLY_RESPONSE;
        } else if (path === '/api/free') {
          body = {nextAction: 'complete'};
        }
        return new Response(JSON.stringify(body), {
          headers: {'Content-Type': 'application/json'},
        });
      }),
    );
  });

  afterEach(() => {
    dispatcher.stop();
    Dev.disable();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    sessionStorage.clear();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  /**
   * HTML を配置して初期スキャンを待ちます。
   *
   * @param html 配置する HTML
   * @returns 配置したコンテナ
   */
  const mount = async (html: string): Promise<HTMLElement> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
    return container;
  };

  /**
   * 遷移が起きないことを確かめるために手続きの完了を待ちます。
   */
  const settle = async (): Promise<void> => {
    await waitForDomSettled();
    await new Promise(resolve => setTimeout(resolve, 50));
  };

  describe('data-{event}-redirect', () => {
    it('応答の値で遷移先を切り替えられる', async () => {
      const root = await mount(`
        <div id="host">
          <button id="go" data-click-fetch="/api/apply" data-click-method="POST"
                  data-click-bind="#host"
                  data-click-redirect="{{redirectUrl || '/complete.html'}}">
          </button>
        </div>`);
      root.querySelector<HTMLElement>('#go')!.click();
      await waitForCondition(() => assignedHref !== null, {
        description: 'redirect',
      });
      expect(assignedHref).toBe('/pay/start');
    });

    it('応答の値で遷移先を分岐できる', async () => {
      const root = await mount(`
        <div id="host">
          <button id="pay" data-click-fetch="/api/apply" data-click-method="POST"
                  data-click-bind="#host"
                  data-click-redirect="{{nextAction === 'pay' ? redirectUrl : '/complete.html'}}">
          </button>
        </div>
        <div id="host2">
          <button id="done" data-click-fetch="/api/free" data-click-method="POST"
                  data-click-bind="#host2"
                  data-click-redirect="{{nextAction === 'pay' ? redirectUrl : '/complete.html'}}">
          </button>
        </div>`);
      root.querySelector<HTMLElement>('#pay')!.click();
      await waitForCondition(() => assignedHref !== null, {
        description: 'redirect to pay',
      });
      expect(assignedHref).toBe('/pay/start');

      assignedHref = null;
      root.querySelector<HTMLElement>('#done')!.click();
      await waitForCondition(() => assignedHref !== null, {
        description: 'redirect to complete',
      });
      expect(assignedHref).toBe('/complete.html');
    });

    it('応答をボタン自身へバインドしても切り替えられる', async () => {
      const root = await mount(`
        <button id="go" data-click-fetch="/api/apply" data-click-method="POST"
                data-click-bind="#go"
                data-click-redirect="{{redirectUrl || '/complete.html'}}">
        </button>`);
      root.querySelector<HTMLElement>('#go')!.click();
      await waitForCondition(() => assignedHref !== null, {
        description: 'redirect',
      });
      expect(assignedHref).toBe('/pay/start');
    });

    it('非祖先へバインドした応答は参照できない', async () => {
      // 評価スコープは属性を宣言した要素のバインディングデータ（継承込み）なので、
      // 兄弟要素へバインドした応答は見えない（仕様上の限界）。
      const root = await mount(`
        <div id="other"></div>
        <div id="host">
          <button id="go" data-click-fetch="/api/apply" data-click-method="POST"
                  data-click-bind="#other"
                  data-click-redirect="{{redirectUrl || '/complete.html'}}">
          </button>
        </div>`);
      root.querySelector<HTMLElement>('#go')!.click();
      await waitForCondition(() => assignedHref !== null, {
        description: 'redirect',
      });
      expect(assignedHref).toBe('/complete.html');
    });

    it('手続きの途中で参照が消えた場合は開始時の値を使う', async () => {
      Dev.enable();
      const warnSpy = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
      const root = await mount(`
        <div id="host" data-bind='{"backUrl":"/list.html"}'>
          <button id="go" data-click-fetch="/api/free" data-click-method="POST"
                  data-click-bind="#host"
                  data-click-redirect="{{backUrl}}"></button>
        </div>`);
      root.querySelector<HTMLElement>('#go')!.click();
      await waitForCondition(() => assignedHref !== null, {
        description: 'fallback redirect',
      });
      // 全置換バインドで backUrl が消えるが、開始時は解決できていたため遷移は続く。
      expect(assignedHref).toBe('/list.html');
      expect(
        warnSpy.mock.calls.some(call =>
          String(call[1]).includes('data-click-redirect'),
        ),
      ).toBe(true);
    });

    it('開始時も再評価も解決できない場合は遷移しない', async () => {
      const root = await mount(`
        <button id="go" data-click-fetch="/api/free" data-click-method="POST"
                data-click-redirect="{{missingUrl}}"></button>`);
      root.querySelector<HTMLElement>('#go')!.click();
      await settle();
      expect(assignedHref).toBeNull();
    });

    it('data-{event}-redirect-return-param も再評価される', async () => {
      search = '?href=%2Fadmin.html';
      const root = await mount(`
        <div id="host">
          <button id="go" data-click-fetch="/api/apply" data-click-method="POST"
                  data-click-bind="#host"
                  data-click-redirect="/dashboard.html"
                  data-click-redirect-return-param="{{paramName}}"></button>
        </div>`);
      root.querySelector<HTMLElement>('#go')!.click();
      await waitForCondition(() => assignedHref !== null, {
        description: 'redirect to return path',
      });
      // クエリ名を応答の値で決めたうえで、安全なローカルパスへ遷移する。
      expect(assignedHref).toBe('/admin.html');
    });

    it('data-each の行では行スコープで評価される', async () => {
      const root = await mount(`
        <div data-bind='{"rows":[{"url":"/a.html"},{"url":"/b.html"}]}'
             data-each="{{rows}}" data-each-arg="row">
          <button class="go" data-click-redirect="{{row.url}}"></button>
        </div>`);
      const buttons = root.querySelectorAll<HTMLElement>('.go');
      expect(buttons.length).toBe(2);
      buttons[1].click();
      await waitForCondition(() => assignedHref !== null, {
        description: 'row redirect',
      });
      expect(assignedHref).toBe('/b.html');
    });

    it('data-{event}-bind-arg で格納したキー配下を参照できる', async () => {
      const root = await mount(`
        <div id="host">
          <button id="go" data-click-fetch="/api/apply" data-click-method="POST"
                  data-click-bind="#host" data-click-bind-arg="res"
                  data-click-redirect="{{res.redirectUrl}}"></button>
        </div>`);
      root.querySelector<HTMLElement>('#go')!.click();
      await waitForCondition(() => assignedHref !== null, {
        description: 'redirect',
      });
      expect(assignedHref).toBe('/pay/start');
    });

    it('data-{event}-if が偽なら再評価も遷移も行わない', async () => {
      const root = await mount(`
        <div id="host" data-bind='{"agreed":false}'>
          <button id="go" data-click-fetch="/api/apply" data-click-method="POST"
                  data-click-if="{{agreed}}" data-click-bind="#host"
                  data-click-redirect="{{redirectUrl || '/complete.html'}}">
          </button>
        </div>`);
      root.querySelector<HTMLElement>('#go')!.click();
      await settle();
      expect(assignedHref).toBeNull();
    });

    it('data-store のミラーは遷移前に完了している', async () => {
      const root = await mount(`
        <div id="host" data-store="apply" data-store-params="redirectUrl&amp;no">
          <button id="go" data-click-fetch="/api/apply" data-click-method="POST"
                  data-click-bind="#host"
                  data-click-redirect="{{redirectUrl}}"></button>
        </div>`);
      root.querySelector<HTMLElement>('#go')!.click();
      await waitForCondition(() => assignedHref !== null, {
        description: 'redirect',
      });
      expect(assignedHref).toBe('/pay/start');
      expect(storedAtRedirect).not.toBeNull();
      expect(JSON.parse(storedAtRedirect as string)).toMatchObject({
        redirectUrl: '/pay/start',
      });
    });

    it('data-{event}-store-clear は遷移より前に実行される', async () => {
      const root = await mount(`
        <div id="host" data-store="apply" data-store-params="redirectUrl&amp;no">
          <button id="go" data-click-fetch="/api/apply" data-click-method="POST"
                  data-click-bind="#host"
                  data-click-store-clear="apply"
                  data-click-redirect="{{redirectUrl}}"></button>
        </div>`);
      root.querySelector<HTMLElement>('#go')!.click();
      await waitForCondition(() => assignedHref !== null, {
        description: 'redirect',
      });
      expect(assignedHref).toBe('/pay/start');
      expect(storedAtRedirect).toBeNull();
    });

    it('2 回目のクリックでも応答の値が反映される', async () => {
      // 属性の描画では DOM 上の値が評価結果へ置き換わるが、再評価は宣言
      // （テンプレート）に対して行うため、2 回目以降も応答で切り替わる。
      let count = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          count += 1;
          return new Response(JSON.stringify({redirectUrl: `/pay/${count}`}), {
            headers: {'Content-Type': 'application/json'},
          });
        }),
      );
      const root = await mount(`
        <div id="host">
          <button id="go" data-click-fetch="/api/apply" data-click-method="POST"
                  data-click-bind="#host"
                  data-click-redirect="{{redirectUrl || '/complete.html'}}">
          </button>
        </div>`);
      const button = root.querySelector<HTMLElement>('#go')!;
      button.click();
      await waitForCondition(() => assignedHref !== null, {
        description: 'first redirect',
      });
      expect(assignedHref).toBe('/pay/1');

      assignedHref = null;
      button.click();
      await waitForCondition(() => assignedHref !== null, {
        description: 'second redirect',
      });
      expect(assignedHref).toBe('/pay/2');
    });

    it('ProcedureOptions を直接指定した経路は従来どおり', async () => {
      // 属性を伴わない経路では再評価せず、渡された値をそのまま使う。
      await new Procedure({redirectUrl: '/given.html'}).run();
      expect(assignedHref).toBe('/given.html');
    });
  });

  describe('その他の後段アクション', () => {
    it('data-{event}-dialog に応答の値が入り、\\n が改行へ復元される', async () => {
      const dialogSpy = vi
        .spyOn(Haori, 'dialog')
        .mockResolvedValue(undefined as void);
      const root = await mount(`
        <div id="host">
          <button id="go" data-click-fetch="/api/apply" data-click-method="POST"
                  data-click-bind="#host"
                  data-click-dialog="受付番号 {{no}}\\n控えてください"></button>
        </div>`);
      root.querySelector<HTMLElement>('#go')!.click();
      await waitForCondition(() => dialogSpy.mock.calls.length > 0, {
        description: 'dialog',
      });
      expect(dialogSpy).toHaveBeenCalledWith('受付番号 A-1\n控えてください');
    });

    it('data-{event}-toast に応答の値が入る（レベルは生値のまま）', async () => {
      const toastSpy = vi
        .spyOn(Haori, 'toast')
        .mockResolvedValue(undefined as void);
      const root = await mount(`
        <div id="host">
          <button id="go" data-click-fetch="/api/apply" data-click-method="POST"
                  data-click-bind="#host"
                  data-click-toast="{{no}} を受け付けました"
                  data-click-toast-level="success"></button>
        </div>`);
      root.querySelector<HTMLElement>('#go')!.click();
      await waitForCondition(() => toastSpy.mock.calls.length > 0, {
        description: 'toast',
      });
      expect(toastSpy).toHaveBeenCalledWith(
        'A-1 を受け付けました',
        'success',
      );
    });

    it('data-{event}-history の URL に応答の値を使える', async () => {
      const pushSpy = vi
        .spyOn(window.history, 'pushState')
        .mockImplementation(() => undefined);
      const root = await mount(`
        <div id="host">
          <button id="go" data-click-fetch="/api/apply" data-click-method="POST"
                  data-click-bind="#host"
                  data-click-history="/orders/{{id}}"
                  data-click-history-data='{"page":1}'></button>
        </div>`);
      root.querySelector<HTMLElement>('#go')!.click();
      await waitForCondition(() => pushSpy.mock.calls.length > 0, {
        description: 'pushState',
      });
      expect(String(pushSpy.mock.calls[0][2])).toContain('/orders/42?page=1');
    });

    it('data-{event}-scroll のセレクタに応答の値を使える', async () => {
      const scrollSpy = vi.fn();
      Element.prototype.scrollIntoView = scrollSpy;
      const root = await mount(`
        <div id="host">
          <button id="go" data-click-fetch="/api/apply" data-click-method="POST"
                  data-click-bind="#host"
                  data-click-scroll="{{panel}}"></button>
        </div>
        <div id="panel1"></div>
        <div id="panel2"></div>`);
      root.querySelector<HTMLElement>('#go')!.click();
      await waitForCondition(() => scrollSpy.mock.calls.length > 0, {
        description: 'scroll',
      });
      expect(scrollSpy.mock.instances[0]).toBe(
        document.getElementById('panel2'),
      );
    });

    it('data-{event}-reset と併用してもフォームの値を参照できる', async () => {
      // reset は宣言済みのバインディングデータへ戻すため、使用直前の評価でも
      // 送信した値を参照できる（後退が無いことの回帰ガード）。
      const dialogSpy = vi
        .spyOn(Haori, 'dialog')
        .mockResolvedValue(undefined as void);
      const root = await mount(`
        <form id="f" data-form data-bind='{"name":"山田"}'>
          <input name="name">
          <button id="go" type="button" data-click-fetch="/api/free"
                  data-click-method="POST" data-click-reset="#f"
                  data-click-dialog="{{name}} を登録しました"></button>
        </form>`);
      root.querySelector<HTMLElement>('#go')!.click();
      await waitForCondition(() => dialogSpy.mock.calls.length > 0, {
        description: 'dialog',
      });
      expect(dialogSpy).toHaveBeenCalledWith('山田 を登録しました');
    });
  });
});
