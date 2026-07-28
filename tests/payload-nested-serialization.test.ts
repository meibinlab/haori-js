/* @vitest-environment jsdom */
/**
 * @fileoverview テキストで送る経路での入れ子データの直列化の回帰テスト。
 *
 * クエリ・`application/x-www-form-urlencoded`・`multipart/form-data` は 1 つの値が
 * 1 つの文字列になるため、オブジェクトは JSON 文字列にする。配列の要素だけ
 * `String()` に任せていたため、`data-form-list` の行データが `[object Object]` に
 * なってサーバ側で復元できなかった。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import EventDispatcher from '../src/event_dispatcher';
import {waitForDomSettled} from './helpers/async';

describe('入れ子データの直列化', () => {
  let container: HTMLElement;
  let dispatcher: EventDispatcher;
  let originalFetch: typeof fetch;
  let requests: {url: string; body: unknown}[];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    dispatcher = new EventDispatcher(document);
    dispatcher.start();
    originalFetch = globalThis.fetch;
    requests = [];
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({url: String(url), body: init?.body});
      return new Response('{}', {
        headers: {'Content-Type': 'application/json'},
      });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    dispatcher.stop();
    document.body.innerHTML = '';
  });

  const ROWS = `
    <div data-form-list="materials">
      <div class="row">
        <span data-form-object="material">
          <input name="id" value="a">
        </span>
        <input type="number" name="amount" value="1">
      </div>
      <div class="row">
        <span data-form-object="material">
          <input name="id" value="b">
        </span>
        <input type="number" name="amount" value="2">
      </div>
    </div>`;

  it('GET のクエリでは行データを要素ごとの JSON 文字列にする', async () => {
    container.innerHTML = `
      <form id="f">
        <input id="name" name="name" value="foo"
               data-change-fetch="/recalc.json">
        ${ROWS}
      </form>`;
    await Core.scan(container);
    await waitForDomSettled();

    const name = container.querySelector('#name') as HTMLInputElement;
    name.value = 'foo';
    name.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled(6);

    expect(requests).toHaveLength(1);
    const params = new URL(requests[0].url, 'http://localhost/').searchParams;
    expect(params.get('name')).toBe('foo');
    expect(params.getAll('materials')).toEqual([
      JSON.stringify({material: {id: 'a'}, amount: 1}),
      JSON.stringify({material: {id: 'b'}, amount: 2}),
    ]);
    expect(requests[0].url).not.toContain('object+Object');
  });

  it('urlencoded の body でも行データを要素ごとの JSON 文字列にする', async () => {
    container.innerHTML = `
      <form id="f">
        <input id="name" name="name" value="foo"
               data-change-fetch="/recalc.json"
               data-change-fetch-method="POST"
               data-change-fetch-content-type="application/x-www-form-urlencoded">
        ${ROWS}
      </form>`;
    await Core.scan(container);
    await waitForDomSettled();

    const name = container.querySelector('#name') as HTMLInputElement;
    name.value = 'foo';
    name.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled(6);

    expect(requests).toHaveLength(1);
    const body = requests[0].body as URLSearchParams;
    expect(body).toBeInstanceOf(URLSearchParams);
    expect(body.getAll('materials')).toEqual([
      JSON.stringify({material: {id: 'a'}, amount: 1}),
      JSON.stringify({material: {id: 'b'}, amount: 2}),
    ]);
  });

  it('スカラー配列は従来どおり同名キーの繰り返しで送る', async () => {
    container.innerHTML = `
      <form id="f">
        <input id="name" name="name" value="foo"
               data-change-fetch="/recalc.json">
        <input name="tags" value="js" data-form-list>
        <input name="tags" value="ts" data-form-list>
      </form>`;
    await Core.scan(container);
    await waitForDomSettled();

    const name = container.querySelector('#name') as HTMLInputElement;
    name.value = 'foo';
    name.dispatchEvent(new Event('change', {bubbles: true}));
    await waitForDomSettled(6);

    const params = new URL(requests[0].url, 'http://localhost/').searchParams;
    expect(params.getAll('tags')).toEqual(['js', 'ts']);
  });
});
