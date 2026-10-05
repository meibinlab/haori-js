/* @vitest-environment jsdom */
/**
 * @fileoverview 走査が並行して走るときも、初期表示の取得がフォームの初期値の反映を
 * 待つことを検証します。
 *
 * 背景: 初期化では `<head>` と `<body>` の走査が並行して走る。待ち合わせの相手を
 * 1 つの変数で持ち、走査の終わりに「走査を始める前の値」へ戻していたため、先に
 * 終わった `<head>` の走査が、まだ終わっていない `<body>` の待ち合わせを消して
 * いた。プレースホルダ式の `data-fetch` は起動が 1 フレーム遅れるため、その間に
 * 消されると待たずに走り、初期値が入る前の空の条件で取得していた（要望 BO）。
 *
 * 期待値の根拠は仕様「`data-{event}-form`」の「初期表示では、フォームの初期値の
 * 反映が終わってから取得します」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import {waitForDomSettled} from './helpers/async';

describe('並行する走査と、初期表示の取得の待ち合わせ', () => {
  let containers: HTMLElement[];
  let requests: string[];
  const originalLocation = window.location;

  beforeEach(() => {
    vi.restoreAllMocks();
    requests = [];
    containers = [];
    Object.defineProperty(window, 'location', {
      value: {...originalLocation, search: '?q=v0'},
      writable: true,
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input: RequestInfo | URL) => {
        requests.push(String(input));
        return Promise.resolve(
          new Response('{"total":1}', {
            headers: {'Content-Type': 'application/json'},
          }),
        ) as unknown as Promise<Response>;
      },
    );
  });

  afterEach(() => {
    containers.forEach(container => container.remove());
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  /**
   * 要素を作って文書へ追加します。
   *
   * @param html 中身の HTML 文字列
   * @returns 追加した要素
   */
  const append = (html: string): HTMLElement => {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    containers.push(container);
    return container;
  };

  it('先に始めた別の走査が先に終わっても、プレースホルダ式の取得は初期値の反映を待つ', async () => {
    const other = append('<span></span>');
    const page = append(`
      <form id="f" data-url-param>
        <input name="q">
        <input name="m" data-attr-value="{{m ?? '2026-10'}}">
      </form>
      <section data-bind='{"view": {}}'
        data-fetch="{{view.total == null && '/api/list.json'}}"
        data-fetch-form="#f" data-fetch-arg="view"></section>
      ${'<p>x</p>'.repeat(300)}`);

    // 初期化の <head> と <body> と同じく、2 つの走査を並行して始める。
    await Promise.all([Core.scan(other), Core.scan(page)]);
    await waitForDomSettled();

    expect(requests.length).toBeGreaterThan(0);
    expect(
      requests.every(url => url.includes('q=v0') && url.includes('m=2026-10')),
    ).toBe(true);
  });
});
