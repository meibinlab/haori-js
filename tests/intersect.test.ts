/* @vitest-environment jsdom */
/**
 * @fileoverview 交差監視トリガー（`data-intersect-*`）のテスト。
 *
 * 期待値の根拠は仕様「交差監視トリガー (`data-intersect-*`)」。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Fragment, {ElementFragment} from '../src/fragment';
import IntersectObserver from '../src/intersect';
import Log from '../src/log';
import {nextTask, waitForCondition, waitForIdle} from './helpers/async';

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
    this.rootMargin = MockIntersectionObserver.normalizeRootMargin(
      options.rootMargin ?? '0px',
    );
    this.thresholds = Array.isArray(options.threshold)
      ? options.threshold
      : [options.threshold ?? 0];
    MockIntersectionObserver.instances.push(this);
  }

  /**
   * `rootMargin` を実装と同じく 4 要素へ正規化します。
   *
   * 実際の `IntersectionObserver` は `0px` を `0px 0px 0px 0px` のように広げて
   * 返します。読み戻した値をそのまま設定と比べると常に食い違うため、模擬でも
   * 同じ形にします。
   *
   * @param value 指定された値
   * @returns 4 要素へ広げた値
   */
  static normalizeRootMargin(value: string): string {
    const parts = value.trim().split(/\s+/);
    const top = parts[0] ?? '0px';
    const right = parts[1] ?? top;
    const bottom = parts[2] ?? top;
    const left = parts[3] ?? right;
    return `${top} ${right} ${bottom} ${left}`;
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
  describe('抑止の間に来た交差', () => {
    /**
     * 応答を保留できる `fetch` を差し込みます。
     *
     * 実行中（`running`）の状態を保ったまま交差を起こすために使います。
     *
     * @returns 差し込んだスパイと、保留を解放する関数
     */
    const stubGatedFetch = () => {
      let resolveGate: () => void = () => undefined;
      const gate = new Promise<void>(resolve => {
        resolveGate = resolve;
      });
      const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        await gate;
        return new Response('{}', {
          headers: {'Content-Type': 'application/json'},
        });
      });
      return {spy, release: () => resolveGate()};
    };

    /**
     * 監視対象を作り、監視を同期します。
     *
     * @param attributes 属性を並べた HTML 断片
     * @returns 生成した要素と、対応する監視インスタンス
     */
    const setup = async (
      attributes: string,
    ): Promise<{
      sentinel: HTMLElement;
      instance: MockIntersectionObserver;
    }> => {
      const host = document.createElement('div');
      host.innerHTML = `<div id="sentinel" ${attributes}></div>`;
      document.body.appendChild(host);
      await Core.scan(host);
      IntersectObserver.syncTree(host);
      const sentinel = document.getElementById('sentinel') as HTMLElement;
      return {sentinel, instance: MockIntersectionObserver.instances[0]};
    };

    it('実行中に来た交差を、実行の完了時に拾い直す', async () => {
      // 仕様「抑止の間に来た交差」の「実行中に起きた交差は、その実行が
      // 完了した時点で拾い直します」。
      const {sentinel, instance} = await setup(
        'data-intersect-fetch="https://example.com/posts"',
      );
      const {spy, release} = stubGatedFetch();

      instance.trigger(sentinel, true);
      await nextTask();
      expect(spy).toHaveBeenCalledTimes(1);

      instance.trigger(sentinel, false);
      instance.trigger(sentinel, true);
      await nextTask();
      expect(spy).toHaveBeenCalledTimes(1);

      release();
      await waitForIdle();
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('交差していない通知では実行しない', async () => {
      // 仕様「`data-intersect-fetch`」の「監視対象の要素が `root` と交差し、かつ
      // `threshold` を満たした時点で通信処理を開始します」。
      const {sentinel, instance} = await setup(
        'data-intersect-fetch="https://example.com/posts"',
      );
      const {spy} = stubGatedFetch();

      instance.trigger(sentinel, false);
      await nextTask();

      expect(spy).not.toHaveBeenCalled();
    });

    it('完了した時点で交差していなければ拾い直さない', async () => {
      // 仕様「抑止の間に来た交差」の「抑止が解けた時点で交差していない
      // 場合は開始しません」。
      const {sentinel, instance} = await setup(
        'data-intersect-fetch="https://example.com/posts"',
      );
      const {spy, release} = stubGatedFetch();

      instance.trigger(sentinel, true);
      await nextTask();
      instance.trigger(sentinel, false);
      instance.trigger(sentinel, true);
      instance.trigger(sentinel, false);
      await nextTask();

      release();
      await waitForIdle();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('data-intersect-disabled が偽へ変わった時点で拾い直す', async () => {
      // 仕様「抑止の間に来た交差」の「`data-intersect-disabled` が真の間に
      // 起きた交差は、偽へ変わった時点で拾い直します」。
      const {sentinel, instance} = await setup(
        'data-intersect-fetch="https://example.com/posts" ' +
          'data-intersect-disabled="true"',
      );
      const {spy, release} = stubGatedFetch();
      release();

      instance.trigger(sentinel, true);
      await nextTask();
      expect(spy).not.toHaveBeenCalled();

      await (Fragment.get(sentinel) as ElementFragment).setAttribute(
        'data-intersect-disabled',
        'false',
      );
      IntersectObserver.syncElement(sentinel);
      await waitForIdle();

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('data-intersect-disabled が真のままの再同期では拾い直さない', async () => {
      // 仕様「`data-intersect-disabled`」の「真と評価された間は、交差しても
      // Procedure を開始しません」。
      const {sentinel, instance} = await setup(
        'data-intersect-fetch="https://example.com/posts" ' +
          'data-intersect-disabled="true"',
      );
      const {spy, release} = stubGatedFetch();
      release();

      instance.trigger(sentinel, true);
      await nextTask();

      IntersectObserver.syncElement(sentinel);
      await waitForIdle();

      expect(spy).not.toHaveBeenCalled();
    });

    it('取りこぼしが無ければ、完了しても再実行しない', async () => {
      // 仕様「抑止の間に来た交差」の「拾い直すのは、覚えている交差 1 回に
      // つき 1 回だけです」。
      const {sentinel, instance} = await setup(
        'data-intersect-fetch="https://example.com/posts"',
      );
      const {spy, release} = stubGatedFetch();
      release();

      instance.trigger(sentinel, true);
      await waitForIdle();

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('実行中の再同期では拾い直さない', async () => {
      // 仕様「抑止の間に来た交差」の「同じ要素の Procedure は多重に実行
      // しません」。
      const {sentinel, instance} = await setup(
        'data-intersect-fetch="https://example.com/posts"',
      );
      const {spy, release} = stubGatedFetch();

      instance.trigger(sentinel, true);
      await nextTask();
      instance.trigger(sentinel, false);
      instance.trigger(sentinel, true);
      await nextTask();

      IntersectObserver.syncElement(sentinel);
      await nextTask();
      expect(spy).toHaveBeenCalledTimes(1);

      release();
      await waitForIdle();
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('実行中に監視を作り直しても、手続きは重ならない', async () => {
      // 仕様「抑止の間に来た交差」の「同じ要素の Procedure は多重に実行しません」
      // と、「実行中かどうかは引き継ぐため、作り直しても手続きは重なりません」。
      const {sentinel, instance} = await setup(
        'data-intersect-fetch="https://example.com/posts"',
      );
      const {spy, release} = stubGatedFetch();

      instance.trigger(sentinel, true);
      await nextTask();
      expect(spy).toHaveBeenCalledTimes(1);

      // 実行中に設定が変わり、監視を作り直す。
      await (Fragment.get(sentinel) as ElementFragment).setAttribute(
        'data-intersect-threshold',
        '0.75',
      );
      IntersectObserver.syncElement(sentinel);
      expect(MockIntersectionObserver.instances).toHaveLength(2);

      MockIntersectionObserver.instances[1].trigger(sentinel, true);
      await nextTask();
      expect(spy).toHaveBeenCalledTimes(1);

      release();
      await waitForIdle();
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('実行中に監視を作り直したときも、data-intersect-once は作り直した監視を解除する', async () => {
      // 仕様「`data-intersect-once`」の「初回の成功後に監視を解除します」。
      const {sentinel, instance} = await setup(
        'data-intersect-fetch="https://example.com/posts" data-intersect-once',
      );
      const {spy, release} = stubGatedFetch();

      instance.trigger(sentinel, true);
      await nextTask();

      await (Fragment.get(sentinel) as ElementFragment).setAttribute(
        'data-intersect-threshold',
        '0.75',
      );
      IntersectObserver.syncElement(sentinel);
      expect(MockIntersectionObserver.instances).toHaveLength(2);

      release();
      await waitForIdle();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(MockIntersectionObserver.instances[1].observed.size).toBe(0);
    });

    it('data-intersect-once で監視を解除した後は拾い直さない', async () => {
      // 仕様「抑止の間に来た交差」の「監視を解除した後は拾い直しません」。
      const {sentinel, instance} = await setup(
        'data-intersect-fetch="https://example.com/posts" data-intersect-once',
      );
      const {spy, release} = stubGatedFetch();

      instance.trigger(sentinel, true);
      await nextTask();
      instance.trigger(sentinel, false);
      instance.trigger(sentinel, true);
      await nextTask();

      release();
      await waitForIdle();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(instance.observed.size).toBe(0);
    });
  });
});
