/* @vitest-environment jsdom */
/**
 * @fileoverview demo ランタイムでの通信の正規化に関するテスト。
 *
 * 報告された症状の回帰ガードです。
 * `data-runtime="demo"` は非 GET をクエリ付き GET へ正規化するが、
 * `data-{event}-before-run` が返す `fetchOptions` の上書きが正規化より後に
 * 適用されるため、実 POST が送信されて静的ファイルサーバから 405 になる。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import EventDispatcher from '../src/event_dispatcher';
import {waitForCondition, waitForDomSettled} from './helpers/async';

/** 記録した fetch の呼び出し内容 */
interface RecordedCall {
  url: string;
  options: RequestInit;
}

describe('demo ランタイムでの通信の正規化', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let calls: RecordedCall[];

  beforeEach(() => {
    vi.restoreAllMocks();
    Dev.set(false);
    Env.setRuntime('demo');
    calls = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({url: String(input), options: init || {}});
        return Promise.resolve(
          new Response('{}', {headers: {'Content-Type': 'application/json'}}),
        );
      },
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
  });

  afterEach(() => {
    dispatcher.stop();
    Env.setRuntime('embedded');
    Dev.set(false);
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  /**
   * HTML を配置してから初期スキャンの完了まで待ちます。
   *
   * @param html container へ設定する HTML
   */
  const mount = async (html: string): Promise<void> => {
    container.innerHTML = html;
    await Core.scan(container);
    await waitForDomSettled();
  };

  /**
   * ボタンをクリックし、fetch が呼ばれるまで待ちます。
   *
   * @param selector クリック対象のセレクタ
   */
  const clickAndWait = async (selector: string): Promise<void> => {
    container.querySelector<HTMLElement>(selector)!.click();
    await waitForCondition(() => calls.length > 0, {
      description: 'fetch が呼ばれる',
      maxAttempts: 30,
    });
  };

  /**
   * 記録した呼び出しのヘッダーを取得します。
   *
   * @param call 対象の呼び出し
   * @returns Headers
   */
  const headersOf = (call: RecordedCall): Headers =>
    new Headers((call.options.headers as HeadersInit) || undefined);

  describe('before-run による上書き', () => {
    it('POST への上書きもクエリ付き GET へ正規化される', async () => {
      await mount(
        `<button id="go"
           data-click-fetch="http://api.test/save"
           data-click-fetch-method="POST"
           data-click-data='{"a":1}'
           data-click-before-run='return {fetchOptions:{method:"POST",
             body:JSON.stringify({b:2}),
             headers:{"Content-Type":"application/json"}}};'
         >送信</button>`,
      );

      await clickAndWait('#go');

      expect(calls).toHaveLength(1);
      // 正規化を打ち消して実 POST が飛ぶと静的ファイルサーバでは 405 になる。
      expect(String(calls[0].options.method).toUpperCase()).toBe('GET');
      expect(calls[0].options.body).toBeUndefined();
      // 収集済みの送信データと、上書きで与えられた body の両方がクエリへ載る。
      expect(calls[0].url).toContain('a=1');
      expect(calls[0].url).toContain('b=2');
      expect(headersOf(calls[0]).get('Content-Type')).toBeNull();
    });

    it('URLSearchParams の body もクエリへ移す', async () => {
      await mount(
        `<button id="go"
           data-click-fetch="http://api.test/save"
           data-click-before-run='return {fetchOptions:{method:"PUT",
             body:new URLSearchParams({c:"3",d:"4"})}};'
         >送信</button>`,
      );

      await clickAndWait('#go');

      expect(String(calls[0].options.method).toUpperCase()).toBe('GET');
      expect(calls[0].url).toContain('c=3');
      expect(calls[0].url).toContain('d=4');
    });

    it('クエリ化できない body は破棄して警告する', async () => {
      Dev.set(true);
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      await mount(
        `<button id="go"
           data-click-fetch="http://api.test/save"
           data-click-before-run='return {fetchOptions:{method:"POST",
             body:new Blob(["x"])}};'
         >送信</button>`,
      );

      await clickAndWait('#go');

      expect(String(calls[0].options.method).toUpperCase()).toBe('GET');
      expect(calls[0].options.body).toBeUndefined();
      expect(warn).toHaveBeenCalled();
    });

    it('上書きしたメソッドを fetchstart の requestedMethod として報告する', async () => {
      const handler = vi.fn();
      document.addEventListener('haori:fetchstart', handler);
      await mount(
        `<button id="go"
           data-click-fetch="http://api.test/save"
           data-click-before-run='return {fetchOptions:{method:"DELETE"}};'
         >送信</button>`,
      );

      await clickAndWait('#go');

      expect(handler).toHaveBeenCalled();
      const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
      expect(detail.requestedMethod).toBe('DELETE');
      expect(detail.effectiveMethod).toBe('GET');
      expect(detail.transportMode).toBe('query-get');
      document.removeEventListener('haori:fetchstart', handler);
    });
  });

  describe('embedded ランタイム', () => {
    it('上書きしたメソッドと body をそのまま送る', async () => {
      Env.setRuntime('embedded');
      await mount(
        `<button id="go"
           data-click-fetch="http://api.test/save"
           data-click-fetch-method="POST"
           data-click-before-run='return {fetchOptions:{method:"POST",
             body:JSON.stringify({b:2})}};'
         >送信</button>`,
      );

      await clickAndWait('#go');

      expect(String(calls[0].options.method).toUpperCase()).toBe('POST');
      expect(calls[0].options.body).toBe(JSON.stringify({b: 2}));
    });
  });

  describe('before-run が無い場合', () => {
    it('従来どおりクエリ付き GET へ正規化される', async () => {
      await mount(
        `<button id="go"
           data-click-fetch="http://api.test/save"
           data-click-fetch-method="POST"
           data-click-data='{"a":1}'
         >送信</button>`,
      );

      await clickAndWait('#go');

      expect(String(calls[0].options.method).toUpperCase()).toBe('GET');
      expect(calls[0].options.body).toBeUndefined();
      expect(calls[0].url).toContain('a=1');
    });
  });
});
