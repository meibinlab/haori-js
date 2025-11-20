/* @vitest-environment jsdom */
/**
 * @fileoverview HaoriEvent（イベント発火ユーティリティ）のテスト
 */
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import HaoriEvent from '../src/event';

describe('HaoriEvent', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('dispatch', () => {
    it('カスタムイベントをhaori:プレフィックス付きで発火する', () => {
      const handler = vi.fn();
      container.addEventListener('haori:test', handler);

      HaoriEvent.dispatch(container, 'test');

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('イベントにdetailデータを含める', () => {
      const handler = vi.fn();
      container.addEventListener('haori:test', handler);

      HaoriEvent.dispatch(container, 'test', {foo: 'bar'});

      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail).toEqual({foo: 'bar'});
    });

    it('デフォルトでbubblesがtrueになる', () => {
      const handler = vi.fn();
      container.addEventListener('haori:test', handler);

      HaoriEvent.dispatch(container, 'test');

      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.bubbles).toBe(true);
    });

    it('デフォルトでcomposedがtrueになる', () => {
      const handler = vi.fn();
      container.addEventListener('haori:test', handler);

      HaoriEvent.dispatch(container, 'test');

      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.composed).toBe(true);
    });

    it('オプションでbubblesを変更できる', () => {
      const handler = vi.fn();
      container.addEventListener('haori:test', handler);

      HaoriEvent.dispatch(container, 'test', undefined, {bubbles: false});

      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.bubbles).toBe(false);
    });

    it('オプションでcancelableを変更できる', () => {
      const handler = vi.fn();
      container.addEventListener('haori:test', handler);

      HaoriEvent.dispatch(container, 'test', undefined, {cancelable: true});

      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.cancelable).toBe(true);
    });
  });

  describe('ready', () => {
    it('haori:readyイベントをdocumentに発火する', () => {
      const handler = vi.fn();
      document.addEventListener('haori:ready', handler);

      HaoriEvent.ready('0.1.0');

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail).toEqual({version: '0.1.0'});

      document.removeEventListener('haori:ready', handler);
    });
  });

  describe('render', () => {
    it('haori:renderイベントを発火する', () => {
      const handler = vi.fn();
      container.addEventListener('haori:render', handler);

      HaoriEvent.render(container);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail).toEqual({target: container});
    });
  });

  describe('importStart', () => {
    it('haori:importstartイベントを発火する', () => {
      const handler = vi.fn();
      container.addEventListener('haori:importstart', handler);

      HaoriEvent.importStart(container, 'https://example.com/test.html');

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.url).toBe('https://example.com/test.html');
      expect(event.detail.startedAt).toBeDefined();
      expect(typeof event.detail.startedAt).toBe('number');
    });
  });

  describe('importEnd', () => {
    it('haori:importendイベントを発火する', () => {
      const handler = vi.fn();
      container.addEventListener('haori:importend', handler);
      const startedAt = performance.now();

      HaoriEvent.importEnd(
        container,
        'https://example.com/test.html',
        1024,
        startedAt,
      );

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.url).toBe('https://example.com/test.html');
      expect(event.detail.bytes).toBe(1024);
      expect(event.detail.durationMs).toBeDefined();
      expect(typeof event.detail.durationMs).toBe('number');
    });
  });

  describe('importError', () => {
    it('haori:importerrorイベントを発火する', () => {
      const handler = vi.fn();
      container.addEventListener('haori:importerror', handler);
      const error = new Error('Failed to import');

      HaoriEvent.importError(
        container,
        'https://example.com/test.html',
        error,
      );

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.url).toBe('https://example.com/test.html');
      expect(event.detail.error).toBe(error);
    });
  });

  describe('bindChange', () => {
    it('haori:bindchangeイベントを発火する', () => {
      const handler = vi.fn();
      container.addEventListener('haori:bindchange', handler);

      HaoriEvent.bindChange(
        container,
        {x: 1},
        {x: 2, y: 3},
        'manual',
      );

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.previous).toEqual({x: 1});
      expect(event.detail.next).toEqual({x: 2, y: 3});
      expect(event.detail.reason).toBe('manual');
    });

    it('変更されたキーを検出する', () => {
      const handler = vi.fn();
      container.addEventListener('haori:bindchange', handler);

      HaoriEvent.bindChange(
        container,
        {a: 1, b: 2},
        {a: 1, b: 3, c: 4},
        'fetch',
      );

      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.changedKeys).toContain('b');
      expect(event.detail.changedKeys).toContain('c');
      expect(event.detail.changedKeys).not.toContain('a');
    });

    it('previousがnullでも処理できる', () => {
      const handler = vi.fn();
      container.addEventListener('haori:bindchange', handler);

      HaoriEvent.bindChange(container, null, {x: 1}, 'other');

      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.previous).toEqual({});
      expect(event.detail.changedKeys).toContain('x');
    });
  });

  describe('eachUpdate', () => {
    it('haori:eachupdateイベントを発火する', () => {
      const handler = vi.fn();
      container.addEventListener('haori:eachupdate', handler);

      HaoriEvent.eachUpdate(
        container,
        ['key1', 'key2'],
        ['key3'],
        ['key1', 'key2'],
      );

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.added).toEqual(['key1', 'key2']);
      expect(event.detail.removed).toEqual(['key3']);
      expect(event.detail.order).toEqual(['key1', 'key2']);
      expect(event.detail.total).toBe(2);
    });
  });

  describe('rowAdd', () => {
    it('haori:rowaddイベントを発火する', () => {
      const handler = vi.fn();
      container.addEventListener('haori:rowadd', handler);
      const item = {id: 1, name: 'Test'};

      HaoriEvent.rowAdd(container, 'row-1', 0, item);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.key).toBe('row-1');
      expect(event.detail.index).toBe(0);
      expect(event.detail.item).toBe(item);
    });
  });

  describe('rowRemove', () => {
    it('haori:rowremoveイベントを発火する', () => {
      const handler = vi.fn();
      container.addEventListener('haori:rowremove', handler);

      HaoriEvent.rowRemove(container, 'row-1', 2);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.key).toBe('row-1');
      expect(event.detail.index).toBe(2);
    });
  });

  describe('rowMove', () => {
    it('haori:rowmoveイベントを発火する', () => {
      const handler = vi.fn();
      container.addEventListener('haori:rowmove', handler);

      HaoriEvent.rowMove(container, 'row-1', 0, 2);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.key).toBe('row-1');
      expect(event.detail.from).toBe(0);
      expect(event.detail.to).toBe(2);
    });
  });

  describe('show', () => {
    it('haori:showイベントを発火する', () => {
      const handler = vi.fn();
      container.addEventListener('haori:show', handler);

      HaoriEvent.show(container);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail).toEqual({visible: true});
    });
  });

  describe('hide', () => {
    it('haori:hideイベントを発火する', () => {
      const handler = vi.fn();
      container.addEventListener('haori:hide', handler);

      HaoriEvent.hide(container);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail).toEqual({visible: false});
    });
  });

  describe('fetchStart', () => {
    it('haori:fetchstartイベントを発火する', () => {
      const handler = vi.fn();
      container.addEventListener('haori:fetchstart', handler);
      const options = {method: 'POST'};
      const payload = {data: 'test'};

      HaoriEvent.fetchStart(
        container,
        'https://example.com/api',
        options,
        payload,
      );

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.url).toBe('https://example.com/api');
      expect(event.detail.options).toEqual(options);
      expect(event.detail.payload).toEqual(payload);
      expect(event.detail.startedAt).toBeDefined();
    });

    it('オプションなしでも動作する', () => {
      const handler = vi.fn();
      container.addEventListener('haori:fetchstart', handler);

      HaoriEvent.fetchStart(container, 'https://example.com/api');

      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.options).toEqual({});
      expect(event.detail.payload).toBeUndefined();
    });
  });

  describe('fetchEnd', () => {
    it('haori:fetchendイベントを発火する', () => {
      const handler = vi.fn();
      container.addEventListener('haori:fetchend', handler);
      const startedAt = performance.now();

      HaoriEvent.fetchEnd(
        container,
        'https://example.com/api',
        200,
        startedAt,
      );

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.url).toBe('https://example.com/api');
      expect(event.detail.status).toBe(200);
      expect(event.detail.durationMs).toBeDefined();
      expect(typeof event.detail.durationMs).toBe('number');
    });
  });

  describe('fetchError', () => {
    it('haori:fetcherrorイベントを発火する', () => {
      const handler = vi.fn();
      container.addEventListener('haori:fetcherror', handler);
      const error = new Error('Network error');
      const startedAt = performance.now();

      HaoriEvent.fetchError(
        container,
        'https://example.com/api',
        error,
        500,
        startedAt,
      );

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.url).toBe('https://example.com/api');
      expect(event.detail.error).toBe(error);
      expect(event.detail.status).toBe(500);
      expect(event.detail.durationMs).toBeDefined();
    });

    it('startedAtなしでも動作する', () => {
      const handler = vi.fn();
      container.addEventListener('haori:fetcherror', handler);
      const error = new Error('Network error');

      HaoriEvent.fetchError(container, 'https://example.com/api', error);

      const event = handler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.durationMs).toBeUndefined();
    });
  });

  describe('イベントバブリング', () => {
    it('イベントが親要素にバブルする', () => {
      const child = document.createElement('span');
      container.appendChild(child);

      const handler = vi.fn();
      container.addEventListener('haori:test', handler);

      HaoriEvent.dispatch(child, 'test');

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
