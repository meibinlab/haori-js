/* @vitest-environment jsdom */
/**
 * @fileoverview 初期表示の取得が、フォームの初期値の反映を待つことを検証します。
 *
 * `data-url-param` が取り込んだ値は、走査の最後の初期値の反映で入力欄へ載ります。
 * `data-fetch-form` の取得はフォームの DOM を収集するため、反映より前に走ると
 * 空の条件で 1 回目の取得が飛んでいました（課題 52）。
 *
 * 期待値の根拠は仕様「`data-{event}-form`」の「初期表示では、フォームの初期値の
 * 反映が終わってから取得します」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import {waitForDomSettled} from './helpers/async';

describe('初期表示の取得とフォームの初期値', () => {
  let container: HTMLElement;
  let requests: string[];
  const originalLocation = window.location;

  beforeEach(() => {
    vi.restoreAllMocks();
    requests = [];
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
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it('data-url-param で取り込んだ条件が、最初の取得から送られる', async () => {
    container.innerHTML = `
      <form id="f" data-url-param>
        <input name="q">
      </form>
      <section data-fetch="/api/list.json" data-fetch-form="#f" data-fetch-arg="view"></section>`;
    await Core.scan(container);
    await waitForDomSettled();

    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every(url => url.includes('q=v0'))).toBe(true);
  });

  it('data-fetch-form を持たない取得は、初期値の反映を待たずに走る（対照）', async () => {
    const seen: string[] = [];
    vi.mocked(globalThis.fetch).mockImplementation(
      (input: RequestInfo | URL) => {
        requests.push(String(input));
        // 取得の時点で、初期値がまだ入力欄へ載っていないこと。
        seen.push(
          (container.querySelector('#q') as HTMLInputElement | null)?.value ??
            '(なし)',
        );
        return Promise.resolve(
          new Response('{"total":1}', {
            headers: {'Content-Type': 'application/json'},
          }),
        ) as unknown as Promise<Response>;
      },
    );

    container.innerHTML = `
      <form data-bind='{"q":"v"}'><input id="q" name="q"></form>
      <section data-fetch="/api/plain.json" data-fetch-arg="view"></section>`;
    await Core.scan(container);
    await waitForDomSettled();

    expect(requests).toEqual(['/api/plain.json']);
    expect(seen).toEqual(['']);
    expect((container.querySelector('#q') as HTMLInputElement).value).toBe('v');
  });

  it('走査の後に追加した data-fetch-form の取得も走る', async () => {
    container.innerHTML = `
      <form id="f2"><input name="q" value="later"></form>
      <div id="host"></div>`;
    await Core.scan(container);
    await waitForDomSettled();
    requests.length = 0;

    const section = document.createElement('section');
    section.setAttribute('data-fetch', '/api/late.json');
    section.setAttribute('data-fetch-form', '#f2');
    section.setAttribute('data-fetch-arg', 'view');
    (container.querySelector('#host') as HTMLElement).appendChild(section);
    await Core.scan(section);
    await waitForDomSettled();

    expect(requests.length).toBe(1);
    expect(requests[0]).toContain('q=later');
  });
});
