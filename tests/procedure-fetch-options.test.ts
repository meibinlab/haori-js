/* @vitest-environment jsdom */
/**
 * Procedure の fetch オプションと前後フックに関するテスト
 */
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import Core from '../src/core';
import Dev from '../src/dev';
import Env from '../src/env';

describe('Procedure fetch options and hooks', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    Dev.set(false);
    Env.setRuntime('embedded');
    await import('../src/observer');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('sends JSON body for POST when method is POST', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    // 非イベント fetch 属性を使って POST を要求
    const src = document.createElement('div');
    src.setAttribute('data-fetch', 'http://api.test/post');
    src.setAttribute('data-fetch-method', 'POST');
    src.setAttribute('data-fetch-data', 'x=1');
    container.appendChild(src);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(fetchSpy).toHaveBeenCalled();
    const called = (fetchSpy as unknown as {mock: {calls: unknown[][]}}).mock.calls.slice(-1)[0];
    const options = called[1] as RequestInit | undefined;
    if (options) {
      expect(String(options.method).toUpperCase()).toBe('POST');
    }
    container.remove();
  });

  it('reports http transport mode for regular GET requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });

    const handler = vi.fn();
    document.addEventListener('haori:fetchstart', handler);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const src = document.createElement('div');
    src.setAttribute('data-fetch', 'http://api.test/get');
    container.appendChild(src);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(fetchSpy).toHaveBeenCalled();
    expect(handler).toHaveBeenCalled();
    for (const call of handler.mock.calls) {
      const event = call[0] as CustomEvent;
      expect(event.detail.requestedMethod).toBe('GET');
      expect(event.detail.effectiveMethod).toBe('GET');
      expect(event.detail.transportMode).toBe('http');
      expect(event.detail.queryString).toBeUndefined();
    }

    document.removeEventListener('haori:fetchstart', handler);
    container.remove();
  });

  it('normalizes non-GET requests to query GET in demo runtime', async () => {
    Dev.set(true);
    Env.setRuntime('demo');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const src = document.createElement('div');
    src.setAttribute('data-fetch', 'http://api.test/post');
    src.setAttribute('data-fetch-method', 'POST');
    src.setAttribute('data-fetch-data', 'x=1&y=two');
    container.appendChild(src);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(fetchSpy).toHaveBeenCalled();
    const called = (fetchSpy as unknown as {mock: {calls: unknown[][]}}).mock.calls.slice(-1)[0];
    expect(String(called[0] as RequestInfo)).toContain('http://api.test/post?');
    expect(String(called[0] as RequestInfo)).toContain('x=1');
    expect(String(called[0] as RequestInfo)).toContain('y=two');

    const options = called[1] as RequestInit | undefined;
    if (options) {
      expect(String(options.method).toUpperCase()).toBe('GET');
      expect(options.body).toBeUndefined();
      const headers = new Headers((options.headers as HeadersInit) || undefined);
      expect(headers.get('Content-Type')).toBeNull();
    }

    expect(logSpy).toHaveBeenCalled();

    container.remove();
  });

  it('handles multipart headers and FormData', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const src = document.createElement('div');
    src.setAttribute('data-fetch', 'http://api.test/upload');
    src.setAttribute('data-fetch-method', 'POST');
    const headersObj = {'Content-Type': 'multipart/form-data', 'X-Test': '1'};
    src.setAttribute('data-fetch-headers', JSON.stringify(headersObj));
    src.setAttribute('data-fetch-data', JSON.stringify({a: 'b'}));
    container.appendChild(src);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(fetchSpy).toHaveBeenCalled();
    const called = (fetchSpy as unknown as {mock: {calls: unknown[][]}}).mock.calls.slice(-1)[0];
    const options = called[1] as RequestInit | undefined;
    if (options) {
      const headers = new Headers((options.headers as HeadersInit) || undefined);
      // multipart の場合ライブラリは Content-Type を削除し FormData を body に設定する
      expect(headers.get('Content-Type')).toBeNull();
      expect(options.body).toBeInstanceOf(FormData);
    }
    container.remove();
  });

  it('evaluates template expressions in data-fetch-data', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });

    const container = document.createElement('div');
    container.setAttribute('data-bind', '{"page":2,"q":"term"}');
    document.body.appendChild(container);

    const src = document.createElement('div');
    src.setAttribute('data-fetch', 'http://api.test/list');
    src.setAttribute('data-fetch-method', 'POST');
    src.setAttribute('data-fetch-data', 'page={{page + 1}}&q={{q}}');
    container.appendChild(src);

    await Core.scan(container);
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(fetchSpy).toHaveBeenCalled();
    const called = (fetchSpy as unknown as {mock: {calls: unknown[][]}}).mock.calls.slice(-1)[0];
    const options = called[1] as RequestInit | undefined;
    expect(options?.body).toBe(JSON.stringify({page: '3', q: 'term'}));

    container.remove();
  });

  it('preserves special characters in parameter-style data-fetch-data templates', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });

    const container = document.createElement('div');
    container.setAttribute('data-bind', '{"page":2,"q":"A&B=C"}');
    document.body.appendChild(container);

    const src = document.createElement('div');
    src.setAttribute('data-fetch', 'http://api.test/list');
    src.setAttribute('data-fetch-method', 'POST');
    src.setAttribute('data-fetch-data', 'page={{page + 1}}&q={{q}}');
    container.appendChild(src);

    await Core.scan(container);
    await new Promise(resolve => setTimeout(resolve, 50));

    const called = (fetchSpy as unknown as {mock: {calls: unknown[][]}}).mock.calls.slice(-1)[0];
    const options = called[1] as RequestInit | undefined;
    expect(options?.body).toBe(JSON.stringify({page: '3', q: 'A&B=C'}));

    container.remove();
  });

  it('preserves false in parameter-style data-fetch-data templates', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });

    const container = document.createElement('div');
    container.setAttribute('data-bind', '{"enabled":false}');
    document.body.appendChild(container);

    const src = document.createElement('div');
    src.setAttribute('data-fetch', 'http://api.test/list');
    src.setAttribute('data-fetch-method', 'POST');
    src.setAttribute('data-fetch-data', 'flag={{enabled}}');
    container.appendChild(src);

    await Core.scan(container);
    await new Promise(resolve => setTimeout(resolve, 50));

    const called = (fetchSpy as unknown as {mock: {calls: unknown[][]}}).mock.calls.slice(-1)[0];
    const options = called[1] as RequestInit | undefined;
    expect(options?.body).toBe(JSON.stringify({flag: 'false'}));

    container.remove();
  });

  it('bindArg binds response under key', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response(JSON.stringify({got: true}), {
          headers: {'Content-Type': 'application/json'},
        }),
      ) as unknown as Promise<Response>;
    });
    const sbd = vi.spyOn(Core, 'setBindingData').mockResolvedValue(undefined as void);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const target = document.createElement('div');
    target.id = 'bind-target';
    const src = document.createElement('div');
    src.setAttribute('data-fetch', 'http://api.test/resp');
    src.setAttribute('data-fetch-bind', '#bind-target');
    src.setAttribute('data-fetch-bind-arg', 'result');
    container.appendChild(target);
    container.appendChild(src);

    await Core.scan(container);
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(sbd).toHaveBeenCalled();
    const calls = (sbd as unknown as {mock: {calls: unknown[][]}}).mock.calls;
    const last = calls[calls.length - 1];
    const binding = last[1] as Record<string, unknown>;
    expect(binding).toHaveProperty('result');
    container.remove();
  });

  it('beforeCallback can stop or modify options', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response('{}', {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });

    // Case: beforeCallback returns false -> use data-click-before-run to return false
    const container = document.createElement('div');
    document.body.appendChild(container);
    const btnStop = document.createElement('button');
    btnStop.setAttribute('data-click-before-run', 'return false;');
    btnStop.setAttribute('data-click-fetch', 'http://api.test/stop');
    container.appendChild(btnStop);
    await Core.scan(container);
    await new Promise(resolve => setTimeout(resolve, 50));
    btnStop.click();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(fetchSpy).not.toHaveBeenCalled();

    // Case: beforeCallback modifies fetchOptions
    const btnModify = document.createElement('button');
    const modifyScript = 'return {fetchOptions:{headers:{"X-From-Before":"yes"}}};';
    btnModify.setAttribute('data-click-before-run', modifyScript);
    btnModify.setAttribute('data-click-fetch', 'http://api.test/modify');
    container.appendChild(btnModify);
    await Core.scan(btnModify);
    await new Promise(resolve => setTimeout(resolve, 50));
    btnModify.click();
    await new Promise(resolve => setTimeout(resolve, 50));
    const called = (fetchSpy as unknown as {mock: {calls: unknown[][]}}).mock.calls.slice(-1)[0];
    const headers = new Headers(((called[1] as RequestInit).headers as HeadersInit) || undefined);
    expect(headers.get('X-From-Before')).toBe('yes');
    container.remove();
  });

  it('afterCallback can stop further processing', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(
        new Response(JSON.stringify({a: 1}), {headers: {'Content-Type': 'application/json'}}),
      ) as unknown as Promise<Response>;
    });
    const sbd = vi.spyOn(Core, 'setBindingData').mockResolvedValue(undefined as void);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const btn = document.createElement('button');
    btn.setAttribute('data-click-fetch', 'http://api.test/stop');
    btn.setAttribute('data-click-after-run', 'return {stop:true};');
    container.appendChild(btn);

    await Core.scan(container);
    await new Promise(resolve => setTimeout(resolve, 50));
    btn.click();
    await new Promise(resolve => setTimeout(resolve, 50));

    // setBindingData should not be called because afterCallback returned stop
    expect(sbd).not.toHaveBeenCalled();
    container.remove();
  });
});
