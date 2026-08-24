/* @vitest-environment jsdom */
/**
 * @fileoverview `data-{event}-fetch-method` / `-fetch-content-type` に
 * テンプレート式を書いた場合のテスト。
 *
 * どちらの属性値も `{{...}}` を書けるため、評価結果は文字列に限りません。素の
 * 評価値をそのまま `RequestInit` へ入れると、メソッドは送信直前の正規化
 * （`String.prototype.toUpperCase`）で例外になって**手続き全体が止まり**、
 * Content-Type は `Content-Type: null` のような不正なヘッダになって既定値も
 * 失われます。
 *
 * 期待値は仕様書から取っています。
 *
 * - 仕様「`data-{event}-fetch-method`」「**評価結果が falsy（`null` /
 *   `undefined` / `false` / 空文字 / `0`）のときは、属性が無いものとして扱います**
 *   （デフォルトの `GET` になります）」
 * - 同節「それ以外の評価結果は**文字列にしてメソッドにします**」
 * - 同節「**送信経路の判定（body を持つか、クエリへ載せるか）と Content-Type の
 *   既定値の判定は、大文字へ揃えてから行います**」
 * - 仕様「`data-{event}-fetch-content-type`」「**評価結果が falsy（`null` /
 *   `undefined` / `false` / 空文字 / `0`）のときは、属性が無いものとして扱います**
 *   （上記のデフォルト値になります）」
 * - 同節「デフォルト値: GET/HEAD/OPTIONS: `application/x-www-form-urlencoded` /
 *   その他: `application/json`」
 * - 同節「デフォルト値を決めるのは `data-{event}-fetch-method` の宣言があるとき
 *   だけです。メソッドを宣言しない場合、`Content-Type` は付けません」
 * - 仕様「プレースホルダ解決規則」の「未解決参照、`false`、`null`、`undefined`、
 *   空文字は未実行として扱います」（未解決参照でフェッチを実行しない）
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';
import EventDispatcher from '../src/event_dispatcher';

import {waitForIdle} from './helpers/async';

/** 送信されたリクエストの観測結果 */
interface SentRequest {
  /** 送信先 URL */
  url: string;

  /** 送信オプション */
  options: RequestInit;
}

describe('data-{event}-fetch-method / -fetch-content-type の式評価', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let errors: string[];
  let sent: SentRequest[];

  beforeEach(() => {
    Dev.set(false);
    Env.setRuntime('embedded');
    errors = [];
    sent = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        sent.push({url: String(input), options: init ?? {}});
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
    container.remove();
    vi.restoreAllMocks();
  });

  /**
   * 宣言を足したボタンを押し、送信されたリクエストを返します。
   *
   * @param declaration ボタンへ足す宣言
   * @returns 送信されたリクエスト。送信しなかった場合は null
   */
  const clickWith = async (
    declaration: string,
  ): Promise<SentRequest | null> => {
    container.innerHTML = `
      <div data-bind='{"num":5,"nothing":null,"no":false,"blank":""}'>
        <button id="btn" data-click-fetch="/api/x" ${declaration}>実行</button>
      </div>`;
    await Core.scan(container);
    await waitForIdle();
    (container.querySelector('#btn') as HTMLButtonElement).click();
    await waitForIdle();
    return sent.length > 0 ? sent[sent.length - 1] : null;
  };

  /**
   * 送信オプションの `Content-Type` を取り出します。
   *
   * @param request 送信されたリクエスト
   * @returns ヘッダーの値。無い場合は null
   */
  const contentType = (request: SentRequest): string | null =>
    new Headers((request.options.headers as HeadersInit) ?? undefined).get(
      'Content-Type',
    );

  /**
   * 非イベントの `data-fetch` を持つ要素を走査し、送信されたリクエストを返します。
   *
   * @param declaration 要素へ足す宣言
   * @returns 送信されたリクエスト。送信しなかった場合は null
   */
  const scanWith = async (declaration: string): Promise<SentRequest | null> => {
    container.innerHTML = `
      <div data-bind='{"num":5,"nothing":null,"no":false,"blank":""}'>
        <div data-fetch="/api/y" ${declaration}></div>
      </div>`;
    await Core.scan(container);
    await waitForIdle();
    return sent.length > 0 ? sent[sent.length - 1] : null;
  };

  it('メソッドが数値に評価されても例外にならず、文字列にして送る（回帰）', async () => {
    const request = await clickWith('data-click-fetch-method="{{num}}"');

    // 素の数値を `RequestInit` へ入れると、送信直前の正規化が
    // `(finalOptions.method || "GET").toUpperCase is not a function` で落ち、
    // fetch も後続のアクションも走らない。
    expect(errors).toEqual([]);
    expect(request).not.toBeNull();
    expect((request as SentRequest).options.method).toBe('5');
  });

  it('メソッドが null に評価されたら既定の GET で送る', async () => {
    const request = await clickWith('data-click-fetch-method="{{nothing}}"');

    expect(errors).toEqual([]);
    expect((request as SentRequest).options.method).toBe('GET');
    // メソッドの宣言が無いものとして扱うため、Content-Type の既定値も決めない。
    expect(contentType(request as SentRequest)).toBeNull();
  });

  it('メソッドが空文字に評価されたら既定の GET で送る', async () => {
    const request = await clickWith('data-click-fetch-method="{{blank}}"');

    expect(errors).toEqual([]);
    expect((request as SentRequest).options.method).toBe('GET');
  });

  it('メソッドが未解決参照ならフェッチを実行しない', async () => {
    const request = await clickWith('data-click-fetch-method="{{missing}}"');

    expect(errors).toEqual([]);
    expect(request).toBeNull();
  });

  it('Content-Type が null に評価されたら既定値へ落とす（回帰）', async () => {
    const request = await clickWith(
      'data-click-fetch-method="POST" data-click-fetch-content-type="{{nothing}}"',
    );

    // 素の評価値を入れると `Content-Type: null` を送り、POST の既定値
    // （application/json）が失われる。
    expect(errors).toEqual([]);
    expect(contentType(request as SentRequest)).toBe('application/json');
  });

  it('Content-Type が空文字に評価されたら既定値へ落とす（回帰）', async () => {
    const request = await clickWith(
      'data-click-fetch-method="POST" data-click-fetch-content-type="{{blank}}"',
    );

    expect(errors).toEqual([]);
    expect(contentType(request as SentRequest)).toBe('application/json');
  });

  it('Content-Type が false に評価されたら既定値へ落とす（回帰）', async () => {
    const request = await clickWith(
      'data-click-fetch-method="GET" data-click-fetch-content-type="{{no}}"',
    );

    expect(errors).toEqual([]);
    expect(contentType(request as SentRequest)).toBe(
      'application/x-www-form-urlencoded',
    );
  });

  it('小文字で宣言したメソッドでも Content-Type の既定値を決める（回帰）', async () => {
    const request = await clickWith('data-click-fetch-method="get"');

    // 綴りのまま比較すると `get` が「GET 以外」に倒れ、application/json になる。
    expect(errors).toEqual([]);
    expect(contentType(request as SentRequest)).toBe(
      'application/x-www-form-urlencoded',
    );
  });

  it('Content-Type を宣言したらその値を送る', async () => {
    const request = await clickWith(
      'data-click-fetch-method="POST"' +
        ' data-click-fetch-content-type="multipart/form-data"',
    );

    expect(errors).toEqual([]);
    expect(contentType(request as SentRequest)).toContain(
      'multipart/form-data',
    );
  });

  it('非イベントの data-fetch-method が数値に評価されても例外にならない（回帰）', async () => {
    const request = await scanWith('data-fetch-method="{{num}}"');

    expect(errors).toEqual([]);
    expect((request as SentRequest).options.method).toBe('5');
  });

  it('非イベントの data-fetch-content-type が null に評価されたら既定値へ落とす（回帰）', async () => {
    const request = await scanWith(
      'data-fetch-method="POST" data-fetch-content-type="{{nothing}}"',
    );

    expect(errors).toEqual([]);
    expect(contentType(request as SentRequest)).toBe('application/json');
  });
});
