/* @vitest-environment jsdom */
/**
 * @fileoverview `data-fetch` が通信の例外で終わったときに、子孫の構築を続けるテスト
 *
 * 期待値の根拠は仕様「`data-fetch`」の「通信の例外で終わった場合も、HTTP の失敗と
 * 同じく子孫を構築します」です。
 */
import {afterEach, describe, expect, it, vi} from 'vitest';

import Core from '../src/core';
import Haori from '../src/haori';
import Log from '../src/log';

/**
 * 取得を通信の例外で失敗させます。
 *
 * @returns 戻り値はありません。
 */
function failFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
  );
}

describe('data-fetch が通信の例外で終わったとき', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /**
   * 取得を宣言した要素を置いて走査します。
   *
   * @param attributes 取得の要素に足す属性
   * @param inner 子孫の HTML
   * @returns 走査の結果（拒否された場合はその理由）
   */
  async function scanWith(
    attributes: Record<string, string>,
    inner: string,
  ): Promise<{rejected: unknown}> {
    const host = document.createElement('section');
    host.setAttribute('data-bind', '{"ok": null}');
    host.setAttribute('data-fetch', '/api/check.json');
    host.setAttribute('data-fetch-arg', 'ok');
    host.setAttribute('data-fetch-error-no-message', '');
    for (const [name, value] of Object.entries(attributes)) {
      host.setAttribute(name, value);
    }
    host.innerHTML = inner;
    document.body.appendChild(host);
    let rejected: unknown = null;
    await Core.scan(host).catch(error => {
      rejected = error;
    });
    await Haori.waitForRenders();
    return {rejected};
  }

  it('子孫の式を評価する（回帰）', async () => {
    // 仕様「`data-fetch`」の「通信の例外で終わった場合も、HTTP の失敗と同じく子孫を構築します」
    vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    failFetch();
    await scanWith({}, '<main><span id="v">{{1 + 1}}</span></main>');
    expect(document.getElementById('v')!.textContent).toBe('2');
  });

  it('走査は拒否で終わらない（回帰）', async () => {
    // 仕様「`data-fetch`」の「通信の例外で終わった場合も、HTTP の失敗と同じく子孫を構築します」
    vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    failFetch();
    const {rejected} = await scanWith({}, '<span>{{1 + 1}}</span>');
    expect(rejected).toBeNull();
  });

  it('data-fetch-state の注入先に失敗が入る', async () => {
    // 仕様「`data-fetch`」の「失敗は `_fetch` と失敗時のアクションで伝えます」
    vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    failFetch();
    await scanWith(
      {'data-fetch-state': '#status'},
      '<p id="status">{{_fetch.error}}:{{_fetch.statusCode}}</p>',
    );
    expect(document.getElementById('status')!.textContent).toBe('true:');
  });

  it('HTTP の失敗と同じく、子孫の構築を続ける（対照）', async () => {
    // 仕様「`data-fetch`」の「通信の例外で終わった場合も、HTTP の失敗と同じく子孫を構築します」
    vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response('{}', {
            status: 500,
            headers: {'Content-Type': 'application/json'},
          }),
        ),
      ),
    );
    await scanWith({}, '<span id="v">{{1 + 1}}</span>');
    expect(document.getElementById('v')!.textContent).toBe('2');
  });

  it('値の変化による取り直しが失敗しても、ほかの要素の再評価は止まらない（回帰）', async () => {
    // 仕様「`data-fetch`」の「通信の例外で終わった場合も、HTTP の失敗と同じく子孫を構築します」
    vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    const fetchMock = vi.fn((url: string) =>
      url.includes('/a.json')
        ? Promise.resolve(
            new Response('{"v": 1}', {
              headers: {'Content-Type': 'application/json'},
            }),
          )
        : Promise.reject(new TypeError('Failed to fetch')),
    );
    vi.stubGlobal('fetch', fetchMock);
    document.body.innerHTML = `
      <div id="root" data-bind='{"q": "a", "label": "x"}'>
        <div data-fetch="/api/{{q}}.json" data-fetch-arg="result"
          data-fetch-error-no-message></div>
        <span id="label">{{label}}</span>
      </div>`;
    await Core.scan(document.body);
    await Haori.waitForRenders();
    let rejected: unknown = null;
    await Core.setBindingData(document.getElementById('root')!, {
      q: 'b',
      label: 'y',
    }).catch(error => {
      rejected = error;
    });
    await Haori.waitForRenders();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(rejected).toBeNull();
    expect(document.getElementById('label')!.textContent).toBe('y');
  });
});
