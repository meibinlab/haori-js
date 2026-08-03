/* @vitest-environment jsdom */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Fragment, {ElementFragment} from '../src/fragment';
import IntersectObserver from '../src/intersect';
import Log from '../src/log';
import {waitForCondition} from './helpers/async';

type ObserverCallback = IntersectionObserverCallback;

class MockIntersectionObserver {
  public static instances: MockIntersectionObserver[] = [];

  public readonly callback: ObserverCallback;
  public readonly root: Element | Document | null;
  public readonly rootMargin: string;
  public readonly thresholds: readonly number[];
  public observed = new Set<Element>();

  constructor(
    callback: ObserverCallback,
    options: IntersectionObserverInit = {},
  ) {
    this.callback = callback;
    this.root = options.root ?? null;
    this.rootMargin = options.rootMargin ?? '0px';
    this.thresholds = Array.isArray(options.threshold)
      ? options.threshold
      : [options.threshold ?? 0];
    MockIntersectionObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.add(target);
  }

  unobserve(target: Element): void {
    this.observed.delete(target);
  }

  disconnect(): void {
    this.observed.clear();
  }

  trigger(target: Element, isIntersecting: boolean): void {
    if (!this.observed.has(target)) {
      return;
    }
    this.callback(
      [
        {
          target,
          isIntersecting,
          intersectionRatio: isIntersecting ? 1 : 0,
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

describe('data-intersect-*', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    vi.stubGlobal(
      'IntersectionObserver',
      MockIntersectionObserver as unknown as typeof IntersectionObserver,
    );
  });

  afterEach(() => {
    IntersectObserver.disconnectAll();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('registers observer with root, root-margin, and threshold options', async () => {
    const root = document.createElement('div');
    root.className = 'panel';
    const sentinel = document.createElement('div');
    sentinel.setAttribute('data-intersect-fetch', '/api/posts');
    sentinel.setAttribute('data-intersect-root', '.panel');
    sentinel.setAttribute('data-intersect-root-margin', '0px 0px 300px 0px');
    sentinel.setAttribute('data-intersect-threshold', '0.5');
    root.appendChild(sentinel);
    document.body.appendChild(root);

    await Core.scan(root);
    IntersectObserver.syncTree(root);

    expect(MockIntersectionObserver.instances).toHaveLength(1);
    const instance = MockIntersectionObserver.instances[0];
    expect(instance.root).toBe(root);
    expect(instance.rootMargin).toBe('0px 0px 300px 0px');
    expect(instance.thresholds).toEqual([0.5]);
    expect(instance.observed.has(sentinel)).toBe(true);
  });

  it('runs intersect procedure and appends configured arrays when intersecting', async () => {
    const feed = document.createElement('div');
    feed.id = 'feed';
    feed.setAttribute(
      'data-bind',
      JSON.stringify({
        items: [{id: 1, title: 'old'}],
        cursor: 'a',
        hasMore: true,
      }),
    );

    const sentinel = document.createElement('div');
    sentinel.setAttribute('data-intersect-fetch', 'https://example.com/posts');
    sentinel.setAttribute('data-intersect-bind', '#feed');
    sentinel.setAttribute('data-intersect-bind-params', 'items&cursor&hasMore');
    sentinel.setAttribute('data-intersect-bind-append', 'items');

    document.body.append(feed, sentinel);

    await Core.scan(feed);
    await Core.scan(sentinel);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{id: 2, title: 'new'}],
          cursor: 'b',
          hasMore: false,
        }),
        {headers: {'Content-Type': 'application/json'}},
      ),
    );

    IntersectObserver.syncElement(sentinel);

    expect(MockIntersectionObserver.instances).toHaveLength(1);
    const instance = MockIntersectionObserver.instances[0];
    instance.trigger(sentinel, true);

    const feedFragment = Fragment.get(feed) as ElementFragment;
    await waitForCondition(
      () => feedFragment.getRawBindingData()?.cursor === 'b',
      {description: 'intersect binding update'},
    );
    expect(feedFragment.getRawBindingData()).toEqual({
      items: [
        {id: 1, title: 'old'},
        {id: 2, title: 'new'},
      ],
      cursor: 'b',
      hasMore: false,
    });
  });

  it('does not run while disabled is truthy', async () => {
    const sentinel = document.createElement('div');
    sentinel.setAttribute('data-intersect-fetch', 'https://example.com/posts');
    sentinel.setAttribute('data-intersect-disabled', 'true');
    document.body.appendChild(sentinel);

    await Core.scan(sentinel);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('{}', {
          headers: {'Content-Type': 'application/json'},
        }),
      );

    IntersectObserver.syncElement(sentinel);

    expect(MockIntersectionObserver.instances).toHaveLength(1);
    MockIntersectionObserver.instances[0].trigger(sentinel, true);

    await Promise.resolve();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('disconnects after the first successful run when once is set', async () => {
    const sentinel = document.createElement('div');
    sentinel.setAttribute('data-intersect-fetch', 'https://example.com/posts');
    sentinel.setAttribute('data-intersect-once', '');
    document.body.appendChild(sentinel);

    await Core.scan(sentinel);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('{}', {
          headers: {'Content-Type': 'application/json'},
        }),
      );

    IntersectObserver.syncElement(sentinel);

    expect(MockIntersectionObserver.instances).toHaveLength(1);
    const instance = MockIntersectionObserver.instances[0];

    instance.trigger(sentinel, true);
    await waitForCondition(() => fetchSpy.mock.calls.length === 1, {
      description: 'first intersect fetch',
    });
    await waitForCondition(() => !instance.observed.has(sentinel), {
      description: 'observer disconnect after once',
    });

    instance.trigger(sentinel, true);
    await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps observing when once is set but the intersect run is stopped before fetch', async () => {
    const sentinel = document.createElement('div');
    sentinel.setAttribute('data-intersect-fetch', 'https://example.com/posts');
    sentinel.setAttribute('data-intersect-before-run', 'return false;');
    sentinel.setAttribute('data-intersect-once', '');
    document.body.appendChild(sentinel);

    await Core.scan(sentinel);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', {
        headers: {'Content-Type': 'application/json'},
      }),
    );

    IntersectObserver.syncElement(sentinel);

    expect(MockIntersectionObserver.instances).toHaveLength(1);
    const instance = MockIntersectionObserver.instances[0];

    instance.trigger(sentinel, true);
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(instance.observed.has(sentinel)).toBe(true);
  });

  describe('登録の判定と解除', () => {
    /**
     * 属性を指定した監視対象を作り、監視を同期します。
     *
     * @param attributes 属性を並べた HTML 断片
     * @returns 生成した要素
     */
    const setup = async (attributes: string): Promise<HTMLElement> => {
      const host = document.createElement('div');
      host.innerHTML = `<div id="sentinel" ${attributes}></div>`;
      document.body.appendChild(host);
      await Core.scan(host);
      IntersectObserver.syncTree(host);
      return document.getElementById('sentinel') as HTMLElement;
    };

    it('設定属性しか無い要素は監視しない', async () => {
      // `data-intersect-root` などの設定だけでは、実行する手続きが無い。
      await setup(
        'data-intersect-root=".panel" data-intersect-threshold="0.5"',
      );

      expect(MockIntersectionObserver.instances).toHaveLength(0);
    });

    it('root セレクタが見つからない場合はビューポートを使い、記録する', async () => {
      const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);

      await setup(
        'data-intersect-fetch="/api/posts" data-intersect-root="#none"',
      );

      expect(MockIntersectionObserver.instances).toHaveLength(1);
      expect(MockIntersectionObserver.instances[0].root).toBeNull();
      expect(error).toHaveBeenCalled();
    });

    it('threshold は 0〜1 に丸め、数値でない指定は 0 にする', async () => {
      await setup(
        'data-intersect-fetch="/api/a" data-intersect-threshold="5"',
      );
      expect(MockIntersectionObserver.instances[0].thresholds).toEqual([1]);

      document.body.innerHTML = '';
      await setup(
        'data-intersect-fetch="/api/b" data-intersect-threshold="-1"',
      );
      expect(MockIntersectionObserver.instances[1].thresholds).toEqual([0]);

      document.body.innerHTML = '';
      await setup(
        'data-intersect-fetch="/api/c" data-intersect-threshold="abc"',
      );
      expect(MockIntersectionObserver.instances[2].thresholds).toEqual([0]);
    });

    it('設定が変わらない再同期では監視を作り直さない', async () => {
      const sentinel = await setup('data-intersect-fetch="/api/posts"');
      const instance = MockIntersectionObserver.instances[0];

      IntersectObserver.syncElement(sentinel);

      expect(MockIntersectionObserver.instances).toHaveLength(1);
      expect(instance.observed.has(sentinel)).toBe(true);
    });

    it('設定が変わると監視を作り直す', async () => {
      const sentinel = await setup('data-intersect-fetch="/api/posts"');
      const first = MockIntersectionObserver.instances[0];

      await (Fragment.get(sentinel) as ElementFragment).setAttribute(
        'data-intersect-threshold',
        '0.75',
      );
      IntersectObserver.syncElement(sentinel);

      expect(MockIntersectionObserver.instances).toHaveLength(2);
      expect(first.observed.size).toBe(0);
      expect(MockIntersectionObserver.instances[1].thresholds).toEqual([0.75]);
    });

    it('手続きの属性を外すと監視を解除する', async () => {
      const sentinel = await setup('data-intersect-fetch="/api/posts"');
      const instance = MockIntersectionObserver.instances[0];

      await (Fragment.get(sentinel) as ElementFragment).removeAttribute(
        'data-intersect-fetch',
      );
      IntersectObserver.syncElement(sentinel);

      expect(instance.observed.size).toBe(0);
      IntersectObserver.syncElement(sentinel);
      expect(MockIntersectionObserver.instances).toHaveLength(1);
    });

    it('cleanupTree で配下の監視を解除する', async () => {
      await setup('data-intersect-fetch="/api/posts"');
      const instance = MockIntersectionObserver.instances[0];

      IntersectObserver.cleanupTree(document.body);

      expect(instance.observed.size).toBe(0);
      IntersectObserver.syncTree(document.body);
      expect(MockIntersectionObserver.instances).toHaveLength(2);
    });

    it('IntersectionObserver が無い環境では登録しない', async () => {
      vi.stubGlobal('IntersectionObserver', undefined);

      await expect(
        setup('data-intersect-fetch="/api/posts"'),
      ).resolves.toBeTruthy();
      expect(MockIntersectionObserver.instances).toHaveLength(0);
    });
  });
});
