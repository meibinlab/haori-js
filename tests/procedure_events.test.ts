import {describe, it, beforeEach, expect, vi, afterEach} from 'vitest';
import Core from '../src/core';
import Procedure from '../src/procedure';
import Fragment, {ElementFragment} from '../src/fragment';
import Haori from '../src/haori';

describe('イベント属性: before-run / after-run', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    // Reset global flag if used
    // 型安全のために Window 拡張を使用
    (window as Window & typeof globalThis).__afterRan = false;
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  const createFragmentWith = (
    attrs: Record<string, string>,
  ): ElementFragment => {
    const el = document.createElement('button');
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
    container.appendChild(el);
    const frag = Fragment.get(el) as ElementFragment;
    return frag;
  };

  it('data-???-before-run が false を返すと以後の処理を停止する（dialog が呼ばれない）', async () => {
    const frag = createFragmentWith({
      'data-click-before-run': 'return false;',
      'data-click-dialog': 'OK',
    });
    const dialogSpy = vi.spyOn(Haori, 'dialog').mockResolvedValue();
    const proc = new Procedure(frag, 'click');
    await expect(proc.run()).resolves.toBeUndefined();
    expect(dialogSpy).not.toHaveBeenCalled();
  });

  it('data-???-after-run が false を返すと後続（dialog）が実行されない', async () => {
    const frag = createFragmentWith({
      'data-click-fetch': 'https://example.com/api',
      'data-click-after-run': 'return false;',
      'data-click-dialog': 'OK',
    });
    global.fetch = vi.fn().mockResolvedValue(
      new Response('{}', {
        headers: {'Content-Type': 'application/json'},
      }),
    ) as unknown as typeof fetch;
    const dialogSpy = vi.spyOn(Haori, 'dialog').mockResolvedValue();
    const proc = new Procedure(frag, 'click');
    await expect(proc.run()).resolves.toBeUndefined();
    expect(dialogSpy).not.toHaveBeenCalled();
  });

  it('フェッチエラー時は after-run が実行されない', async () => {
    const frag = createFragmentWith({
      'data-click-fetch': 'https://example.com/api',
      'data-click-after-run': 'window.__afterRan = true;',
    });
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('bad', {status: 400}),
      ) as unknown as typeof fetch;
    vi.spyOn(Haori, 'addErrorMessage').mockResolvedValue();
    const proc = new Procedure(frag, 'click');
    await expect(proc.run()).resolves.toBeUndefined();
    expect((window as Window & typeof globalThis).__afterRan).toBe(false);
  });

  it('baseline: fetch が呼ばれる（URL は元の値）', async () => {
    const frag = createFragmentWith({
      'data-click-fetch': 'https://example.com/original',
      'data-click-after-run': 'return;',
    });
    const fetchMock = (global.fetch = vi.fn().mockResolvedValue(
      new Response('{}', {
        headers: {'Content-Type': 'application/json'},
      }),
    ) as unknown as typeof fetch);
    const proc = new Procedure(frag, 'click');
    await expect(proc.run()).resolves.toBeUndefined();
    const calls = (fetchMock as unknown as {mock: {calls: unknown[][]}}).mock
      .calls;
    expect(calls.length).toBe(1);
    expect(String(calls[0][0] as RequestInfo)).toBe(
      'https://example.com/original',
    );
  });

  it('before-run で fetchUrl を上書きできる', async () => {
    const frag = createFragmentWith({
      'data-click-fetch': 'https://example.com/original',
      'data-click-before-run':
        'return { fetchUrl: \'https://example.com/override\' };',
      'data-click-after-run': 'return;',
    });
    const fetchMock = (global.fetch = vi.fn().mockResolvedValue(
      new Response('{}', {
        headers: {'Content-Type': 'application/json'},
      }),
    ) as unknown as typeof fetch);
    const proc = new Procedure(frag, 'click');
    await expect(proc.run()).resolves.toBeUndefined();
    const calls = (fetchMock as unknown as {mock: {calls: unknown[][]}}).mock
      .calls;
    expect(calls.length).toBe(1);
    expect(String(calls[0][0] as RequestInfo)).toBe(
      'https://example.com/override',
    );
  });

  it('data-click-data のテンプレート式が評価された payload を送信する', async () => {
    const host = document.createElement('div');
    host.setAttribute('data-bind', '{"status":"active","priority":3}');
    container.appendChild(host);

    const button = document.createElement('button');
    button.setAttribute('data-click-fetch', 'https://example.com/update');
    button.setAttribute('data-click-fetch-method', 'POST');
    button.setAttribute(
      'data-click-data',
      '{"status":"{{status}}","priority":"{{priority}}"}',
    );
    host.appendChild(button);

    await Core.scan(host);

    const frag = Fragment.get(button) as ElementFragment;
    const fetchMock = (global.fetch = vi.fn().mockResolvedValue(
      new Response('{}', {
        headers: {'Content-Type': 'application/json'},
      }),
    ) as unknown as typeof fetch);

    const proc = new Procedure(frag, 'click');
    await expect(proc.run()).resolves.toBeUndefined();

    const calls = (fetchMock as unknown as {mock: {calls: unknown[][]}}).mock
      .calls;
    expect(calls.length).toBe(1);

    const options = calls[0][1] as RequestInit;
    expect(options.body).toBe(
      JSON.stringify({status: 'active', priority: '3'}),
    );
  });

  it('data-click-data の JSON 形式で引用符を含む値を壊さず payload に送信する', async () => {
    const host = document.createElement('div');
    host.setAttribute('data-bind', '{"q":"a\\"b"}');
    container.appendChild(host);

    const button = document.createElement('button');
    button.setAttribute('data-click-fetch', 'https://example.com/update');
    button.setAttribute('data-click-fetch-method', 'POST');
    button.setAttribute('data-click-data', '{"q":"{{q}}"}');
    host.appendChild(button);

    await Core.scan(host);

    const frag = Fragment.get(button) as ElementFragment;
    const fetchMock = (global.fetch = vi.fn().mockResolvedValue(
      new Response('{}', {
        headers: {'Content-Type': 'application/json'},
      }),
    ) as unknown as typeof fetch);

    const proc = new Procedure(frag, 'click');
    await expect(proc.run()).resolves.toBeUndefined();

    const calls = (fetchMock as unknown as {mock: {calls: unknown[][]}}).mock
      .calls;
    const options = calls[0][1] as RequestInit;
    expect(options.body).toBe(JSON.stringify({q: 'a"b'}));
  });

  it('data-click-data で単一式が object を返すと object payload を送信する', async () => {
    const host = document.createElement('div');
    host.setAttribute('data-bind', '{"payload":{"page":4,"q":"term"}}');
    container.appendChild(host);

    const button = document.createElement('button');
    button.setAttribute('data-click-fetch', 'https://example.com/update');
    button.setAttribute('data-click-fetch-method', 'POST');
    button.setAttribute('data-click-data', '{{payload}}');
    host.appendChild(button);

    await Core.scan(host);

    const frag = Fragment.get(button) as ElementFragment;
    const fetchMock = (global.fetch = vi.fn().mockResolvedValue(
      new Response('{}', {
        headers: {'Content-Type': 'application/json'},
      }),
    ) as unknown as typeof fetch);

    const proc = new Procedure(frag, 'click');
    await expect(proc.run()).resolves.toBeUndefined();

    const calls = (fetchMock as unknown as {mock: {calls: unknown[][]}}).mock
      .calls;
    const options = calls[0][1] as RequestInit;
    expect(options.body).toBe(JSON.stringify({page: 4, q: 'term'}));
  });
});

declare global {
  interface Window {
    __afterRan: boolean;
  }
}
