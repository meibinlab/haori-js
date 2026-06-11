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

  const createDeferredResponse = (): {
    promise: Promise<Response>;
    resolve: (response: Response) => void;
  } => {
    let resolveResponse: (response: Response) => void = () => undefined;
    const promise = new Promise<Response>(resolve => {
      resolveResponse = resolve;
    });
    return {promise, resolve: resolveResponse};
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

  it('click 実行中は disabled 属性を付与し、重複実行を抑止する', async () => {
    // click 手続きの実行中だけ disabled 属性が付き、同一要素の再実行が止まること。
    const frag = createFragmentWith({
      'data-click-fetch': 'https://example.com/original',
    });
    const deferredResponse = createDeferredResponse();
    const fetchMock = (global.fetch = vi.fn().mockImplementation(() => {
      return deferredResponse.promise;
    }) as unknown as typeof fetch);

    const proc1 = new Procedure(frag, 'click');
    const proc2 = new Procedure(frag, 'click');
    const target = frag.getTarget();

    const firstRun = proc1.runWithResult();

    expect(target.hasAttribute('disabled')).toBe(true);

    await expect(proc2.runWithResult()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    deferredResponse.resolve(
      new Response('{}', {
        headers: {'Content-Type': 'application/json'},
      }),
    );

    await expect(firstRun).resolves.toBe(true);
    expect(target.hasAttribute('disabled')).toBe(false);
  });

  it('button 以外の click 要素でも disabled 属性で実行中を表現できる', async () => {
    // 非 form control 要素でも disabled 属性が付き、完了後に解除されること。
    const element = document.createElement('div');
    element.setAttribute('data-click-fetch', 'https://example.com/original');
    container.appendChild(element);

    const frag = Fragment.get(element) as ElementFragment;
    const deferredResponse = createDeferredResponse();
    global.fetch = vi.fn().mockImplementation(() => {
      return deferredResponse.promise;
    }) as unknown as typeof fetch;

    const proc = new Procedure(frag, 'click');
    const running = proc.runWithResult();

    expect(element.hasAttribute('disabled')).toBe(true);

    deferredResponse.resolve(
      new Response('{}', {
        headers: {'Content-Type': 'application/json'},
      }),
    );

    await expect(running).resolves.toBe(true);
    expect(element.hasAttribute('disabled')).toBe(false);
  });

  it('既に disabled 属性を持つ click 要素は処理を開始しない', async () => {
    // 事前に disabled の要素は再入防止対象として即停止すること。
    const frag = createFragmentWith({
      'data-click-fetch': 'https://example.com/original',
      disabled: '',
    });
    const fetchMock = (global.fetch = vi.fn() as unknown as typeof fetch);

    const proc = new Procedure(frag, 'click');

    await expect(proc.runWithResult()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(frag.getTarget().hasAttribute('disabled')).toBe(true);
  });

  it('非 form control の click 要素でも disabled 属性があれば処理を開始しない', async () => {
    const element = document.createElement('div');
    element.setAttribute('disabled', '');
    element.setAttribute('data-click-fetch', 'https://example.com/original');
    container.appendChild(element);

    const frag = Fragment.get(element) as ElementFragment;
    const fetchMock = (global.fetch = vi.fn() as unknown as typeof fetch);

    const proc = new Procedure(frag, 'click');

    await expect(proc.runWithResult()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(frag.getTarget().hasAttribute('disabled')).toBe(true);
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

  it('data-click-reset-before で初期化した後のフォーム値を payload に使う', async () => {
    const form = document.createElement('form');
    form.id = 'reset-before-form';
    const input = document.createElement('input');
    input.name = 'username';
    input.setAttribute('value', 'default');
    input.value = 'dirty';
    form.appendChild(input);
    container.appendChild(form);

    const button = document.createElement('button');
    button.setAttribute('data-click-fetch', 'https://example.com/update');
    button.setAttribute('data-click-fetch-method', 'POST');
    button.setAttribute('data-click-form', '#reset-before-form');
    button.setAttribute('data-click-reset-before', '#reset-before-form');
    form.appendChild(button);

    const fetchMock = (global.fetch = vi.fn().mockResolvedValue(
      new Response('{}', {
        headers: {'Content-Type': 'application/json'},
      }),
    ) as unknown as typeof fetch);

    const frag = Fragment.get(button) as ElementFragment;
    const proc = new Procedure(frag, 'click');
    await expect(proc.run()).resolves.toBeUndefined();

    const calls = (fetchMock as unknown as {mock: {calls: unknown[][]}}).mock
      .calls;
    expect(calls.length).toBe(1);

    const options = calls[0][1] as RequestInit;
    // リセット後の値 = HTML の value 属性で宣言された既定値が payload に使われる
    expect(options.body).toBe(JSON.stringify({username: 'default'}));
    expect(input.value).toBe('default');
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
