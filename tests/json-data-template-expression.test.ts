/* @vitest-environment jsdom */
/**
 * @fileoverview JSON 形式の送信データ属性に書いたテンプレート式のテスト。
 *
 * 式が **JSON の値の位置**にあるか**文字列リテラルの中**にあるかで埋め込み方が変わる
 * ことを確かめます。値の位置の経路はこれまでテストが無く、型がそのまま送られること
 * （数値が文字列にならないこと）を保証していませんでした。
 *
 * 期待値は仕様書から取っています。
 *
 * - 仕様「`data-{event}-data`」「値の位置（`{"n": {{count}}}`）: 評価結果を JSON の値
 *   として埋め込みます。数値・真偽値・配列・オブジェクトはその型のまま送られ、文字列は
 *   引用符付きの JSON 文字列になります … `null` は `null` のままです。数値にならない
 *   計算（`NaN`）は `null` になります」
 * - 同節「文字列リテラルの中（`{"s": "id-{{count}}"}`）: 評価結果を文字列にしたうえで、
 *   JSON 文字列として安全な形（`"` や改行のエスケープ）へ変換して埋め込みます。配列や
 *   オブジェクトは JSON 表記の文字列になります。`null` と `NaN` は空文字になります」
 * - 同節「パラメータ形式（`page={{page + 1}}&q={{q}}`）: 評価結果を文字列にして値へ
 *   入れます」「属性値の全体が 1 つの式 …: 評価結果のオブジェクトをそのまま送信データに
 *   します」「式に未解決参照が含まれる場合は、送信そのものを行いません」
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import Core from '../src/core';
import Env from '../src/env';
import IntersectObserver from '../src/intersect';

import {waitForCondition, waitForDomSettled} from './helpers/async';

describe('JSON 形式の送信データ属性のテンプレート式', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    Env.setRuntime('embedded');
    await import('../src/observer');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  /**
   * `data-fetch-data` を POST して送信本文を返します。
   *
   * @param bind `data-bind` に与えるバインディングデータ
   * @param data `data-fetch-data` の属性値
   * @returns 送信された本文（JSON 文字列）
   */
  const sentBody = async (bind: string, data: string): Promise<string> => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        () =>
          Promise.resolve(
            new Response('{}', {headers: {'Content-Type': 'application/json'}}),
          ) as unknown as Promise<Response>,
      );
    const source = document.createElement('div');
    source.setAttribute('data-bind', bind);
    source.setAttribute('data-fetch', 'http://api.test/post');
    source.setAttribute('data-fetch-method', 'POST');
    source.setAttribute('data-fetch-data', data);
    document.body.appendChild(source);
    await waitForCondition(() => fetchSpy.mock.calls.length > 0, {
      description: 'fetch が呼ばれる',
      maxAttempts: 30,
    });
    const options = fetchSpy.mock.calls.slice(-1)[0][1] as
      | RequestInit
      | undefined;
    return String(options?.body ?? '');
  };

  describe('値の位置', () => {
    it('数値・真偽値はその型のまま送る', async () => {
      const body = await sentBody(
        '{"count":3,"flag":true}',
        '{"n": {{count}}, "b": {{flag}}}',
      );
      expect(JSON.parse(body)).toEqual({n: 3, b: true});
    });

    it('配列・オブジェクトはその構造のまま送る', async () => {
      const body = await sentBody(
        '{"tags":["a","b"],"detail":{"k":1}}',
        '{"list": {{tags}}, "o": {{detail}}}',
      );
      expect(JSON.parse(body)).toEqual({list: ['a', 'b'], o: {k: 1}});
    });

    it('文字列は引用符付きの JSON 文字列になる（属性側に引用符は不要）', async () => {
      const body = await sentBody('{"name":"Ta\\"ro"}', '{"s": {{name}}}');
      expect(JSON.parse(body)).toEqual({s: 'Ta"ro'});
    });

    it('null は null のまま送る', async () => {
      const body = await sentBody('{"nothing":null}', '{"n": {{nothing}}}');
      expect(JSON.parse(body)).toEqual({n: null});
    });

    it('数値にならない計算は null になる', async () => {
      const body = await sentBody('{"count":3}', '{"n": {{count / "x"}}}');
      expect(JSON.parse(body)).toEqual({n: null});
    });
  });

  describe('文字列リテラルの中', () => {
    it('評価結果を文字列にして埋め込む', async () => {
      const body = await sentBody('{"count":3}', '{"s": "id-{{count}}"}');
      expect(JSON.parse(body)).toEqual({s: 'id-3'});
    });

    it('引用符と改行をエスケープする', async () => {
      const body = await sentBody(
        '{"name":"a\\"b","text":"1\\n2"}',
        '{"s": "x-{{name}}", "t": "y-{{text}}"}',
      );
      expect(JSON.parse(body)).toEqual({s: 'x-a"b', t: 'y-1\n2'});
    });

    it('配列やオブジェクトは JSON 表記の文字列になる', async () => {
      const body = await sentBody('{"tags":[1,2]}', '{"s": "v-{{tags}}"}');
      expect(JSON.parse(body)).toEqual({s: 'v-[1,2]'});
    });

    it('null と数値にならない計算は空文字になる', async () => {
      const body = await sentBody(
        '{"nothing":null,"count":3}',
        '{"a": "v-{{nothing}}", "b": "v-{{count / \\"x\\"}}"}',
      );
      expect(JSON.parse(body)).toEqual({a: 'v-', b: 'v-'});
    });
  });

  it('パラメータ形式では評価結果を文字列にして値へ入れる', async () => {
    const body = await sentBody(
      '{"page":2,"q":"term"}',
      'page={{page + 1}}&q={{q}}',
    );
    // 値の位置（`{"page": {{page + 1}}}` なら数値の 3）との違いに注意。
    expect(JSON.parse(body)).toEqual({page: '3', q: 'term'});
  });

  it('属性値の全体が 1 つの式なら評価結果のオブジェクトをそのまま送る', async () => {
    const body = await sentBody('{"payload":{"a":1,"b":"x"}}', '{{payload}}');
    expect(JSON.parse(body)).toEqual({a: 1, b: 'x'});
  });

  it('未解決参照を含む場合は送信しない', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        () =>
          Promise.resolve(
            new Response('{}', {headers: {'Content-Type': 'application/json'}}),
          ) as unknown as Promise<Response>,
      );
    const source = document.createElement('div');
    source.setAttribute('data-bind', '{"detail":{"k":1}}');
    source.setAttribute('data-fetch', 'http://api.test/post');
    source.setAttribute('data-fetch-method', 'POST');
    source.setAttribute('data-fetch-data', '{"n": {{detail.missing}}}');
    document.body.appendChild(source);
    await waitForDomSettled();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('交差監視でも同じ規則が適用される（送信データ属性は data-intersect-data）', async () => {
    // 仕様の属性一覧は `data-intersect-fetch-data` と書いていたが、実装が読むのは
    // `data-intersect-data` である（`data-{event}-data` と同じ命名）。誤った名前で
    // 書くと本文が付かないまま送信されるため、名前ごと固定する。
    const observers: MockIntersectionObserver[] = [];
    class MockIntersectionObserver {
      public readonly callback: IntersectionObserverCallback;
      public readonly observed = new Set<Element>();

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
        observers.push(this);
      }

      /**
       * 監視を開始します。
       *
       * @param target 監視対象
       * @returns 戻り値はありません。
       */
      observe(target: Element): void {
        this.observed.add(target);
      }

      /**
       * 監視を解除します。
       *
       * @param target 監視対象
       * @returns 戻り値はありません。
       */
      unobserve(target: Element): void {
        this.observed.delete(target);
      }

      /** 監視をすべて解除します。 */
      disconnect(): void {
        this.observed.clear();
      }

      /**
       * 交差を発生させます。
       *
       * @param target 交差した要素
       * @returns 戻り値はありません。
       */
      trigger(target: Element): void {
        this.callback(
          [
            {
              target,
              isIntersecting: true,
              intersectionRatio: 1,
              boundingClientRect: target.getBoundingClientRect(),
              intersectionRect: target.getBoundingClientRect(),
              rootBounds: null,
              time: 0,
            } as IntersectionObserverEntry,
          ],
          this as unknown as IntersectionObserver,
        );
      }
    }
    vi.stubGlobal(
      'IntersectionObserver',
      MockIntersectionObserver as unknown as typeof IntersectionObserver,
    );
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        () =>
          Promise.resolve(
            new Response('{}', {headers: {'Content-Type': 'application/json'}}),
          ) as unknown as Promise<Response>,
      );
    const host = document.createElement('div');
    host.setAttribute('data-bind', '{"count":3}');
    host.innerHTML =
      '<div id="sentinel" data-intersect-fetch="http://api.test/post"' +
      ' data-intersect-fetch-method="POST"' +
      ' data-intersect-data=\'{"n": {{count}}}\'></div>';
    document.body.appendChild(host);
    await Core.scan(host);
    const sentinel = host.querySelector('#sentinel') as HTMLElement;
    IntersectObserver.syncElement(sentinel);
    observers.forEach(observer => observer.trigger(sentinel));
    await waitForCondition(() => fetchSpy.mock.calls.length > 0, {
      description: 'fetch が呼ばれる',
      maxAttempts: 30,
    });

    const options = fetchSpy.mock.calls.slice(-1)[0][1] as
      | RequestInit
      | undefined;
    expect(JSON.parse(String(options?.body ?? ''))).toEqual({n: 3});

    IntersectObserver.disconnectAll();
    vi.unstubAllGlobals();
  });
});
