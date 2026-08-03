/* @vitest-environment jsdom */
/**
 * @fileoverview data-each-visible（スクロール追従の可視行範囲公開）の統合テスト。
 *
 * jsdom には IntersectionObserver / requestAnimationFrame が無いため、いずれも
 * モックして交差イベントを手動発火し、可視範囲が最近接の上位 data-bind スコープへ
 * 公開されることを検証します。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Fragment, {ElementFragment} from '../src/fragment';
import Log from '../src/log';
import VisibleRangeObserver from '../src/visible_range';
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

/** #list 配下のレンダリング済み行要素を描画順で返す。 */
function rowElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('#list > li'));
}

/** #scope の自身のバインドデータを取得する。 */
function scopeData(): Record<string, unknown> {
  const scope = document.getElementById('scope') as HTMLElement;
  return (Fragment.get(scope) as ElementFragment).getRawBindingData() ?? {};
}

describe('data-each-visible', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    vi.stubGlobal(
      'IntersectionObserver',
      MockIntersectionObserver as unknown as typeof IntersectionObserver,
    );
    // rAF は同期実行にして集計を即時に走らせる。
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    VisibleRangeObserver.disconnectAll();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /**
   * 5 件の一覧と可視範囲フッタを持つ DOM を構築して走査する。
   *
   * @returns 走査完了 Promise
   */
  async function setup(): Promise<void> {
    const scope = document.createElement('div');
    scope.id = 'scope';
    scope.setAttribute(
      'data-bind',
      JSON.stringify({
        content: [
          {name: 'A'},
          {name: 'B'},
          {name: 'C'},
          {name: 'D'},
          {name: 'E'},
        ],
        page: {totalElements: 100},
      }),
    );
    scope.innerHTML = `
      <ul id="list" data-each="content" data-each-visible="vr"
          data-each-visible-root="#scope">
        <li>{{name}}</li>
      </ul>
      <footer id="footer">{{vr.firstLabel}} - {{vr.lastLabel}} / {{vr.total}}</footer>
    `;
    document.body.appendChild(scope);
    await Core.scan(scope);
    VisibleRangeObserver.syncTree(scope);
  }

  it('可視行範囲を最近接の上位 data-bind スコープへ公開する', async () => {
    await setup();

    expect(MockIntersectionObserver.instances).toHaveLength(1);
    const rows = rowElements();
    expect(rows).toHaveLength(5);

    const instance = MockIntersectionObserver.instances[0];
    // 行 1〜3（0 始まり）を可視にする。
    instance.trigger(rows[1], true);
    instance.trigger(rows[2], true);
    instance.trigger(rows[3], true);

    await waitForCondition(
      () => (scopeData().vr as Record<string, unknown>)?.first === 1,
      {description: 'visible range published'},
    );
    expect(scopeData().vr).toEqual({
      first: 1,
      last: 3,
      firstLabel: 2,
      lastLabel: 4,
      count: 3,
      total: 5,
      empty: false,
    });
    // フッタが再評価されている（一覧本体は skip されるが祖先スコープは再評価される）。
    expect(document.getElementById('footer')?.textContent?.trim()).toBe(
      '2 - 4 / 5',
    );
  });

  it('スクロールで可視集合が変わると範囲が更新される', async () => {
    await setup();
    const rows = rowElements();
    const instance = MockIntersectionObserver.instances[0];

    instance.trigger(rows[0], true);
    instance.trigger(rows[1], true);
    await waitForCondition(
      () => (scopeData().vr as Record<string, unknown>)?.lastLabel === 2,
      {description: 'initial range'},
    );

    // 行 0 が外れ、行 2 が入る → 可視は 1〜2。
    instance.trigger(rows[0], false);
    instance.trigger(rows[2], true);
    await waitForCondition(
      () => (scopeData().vr as Record<string, unknown>)?.first === 1,
      {description: 'updated range'},
    );
    expect(scopeData().vr).toMatchObject({
      first: 1,
      last: 2,
      firstLabel: 2,
      lastLabel: 3,
      count: 2,
    });
  });

  it('可視行が無いときは empty を公開する', async () => {
    await setup();
    const rows = rowElements();
    const instance = MockIntersectionObserver.instances[0];

    instance.trigger(rows[0], true);
    await waitForCondition(
      () => (scopeData().vr as Record<string, unknown>)?.empty === false,
      {description: 'visible'},
    );

    instance.trigger(rows[0], false);
    await waitForCondition(
      () => (scopeData().vr as Record<string, unknown>)?.empty === true,
      {description: 'empty'},
    );
    expect(scopeData().vr).toEqual({
      first: -1,
      last: -1,
      firstLabel: 0,
      lastLabel: 0,
      count: 0,
      total: 5,
      empty: true,
    });
  });

  it('threshold 0・既定 rootMargin・root セレクタで監視する', async () => {
    await setup();
    const instance = MockIntersectionObserver.instances[0];
    expect(instance.thresholds).toEqual([0]);
    expect(instance.rootMargin).toBe('0px');
    expect(instance.root).toBe(document.getElementById('scope'));
    // 全行が監視対象になっている。
    expect(instance.observed.size).toBe(5);
  });

  it('公開時に data-bind 属性へ全データを再直列化しない（in-memory のみ更新）', async () => {
    await setup();
    const rows = rowElements();
    const instance = MockIntersectionObserver.instances[0];
    const scope = document.getElementById('scope') as HTMLElement;

    instance.trigger(rows[1], true);
    await waitForCondition(
      () => (scopeData().vr as Record<string, unknown>)?.first === 1,
      {description: 'published'},
    );

    // in-memory（getRawBindingData）には vr が反映される。
    expect(scopeData().vr).toBeDefined();
    // 一方、data-bind 属性は再直列化されないため vr を含まない
    // （大配列を持つスコープでも直列化コストが発生しないことの担保）。
    expect(scope.getAttribute('data-bind')).not.toContain('vr');
    // フッタは in-memory スコープから再評価される。
    expect(document.getElementById('footer')?.textContent?.trim()).toBe(
      '2 - 2 / 5',
    );
  });

  it('公開時に owner で haori:bindchange を発火しない（通知の氾濫を避ける）', async () => {
    await setup();
    const rows = rowElements();
    const instance = MockIntersectionObserver.instances[0];
    const scope = document.getElementById('scope') as HTMLElement;

    const bindchange = vi.fn();
    scope.addEventListener('haori:bindchange', bindchange);

    instance.trigger(rows[1], true);
    await waitForCondition(
      () => (scopeData().vr as Record<string, unknown>)?.first === 1,
      {description: 'published'},
    );

    expect(bindchange).not.toHaveBeenCalled();
  });

  it('同じ可視範囲では再公開しない（無駄な再評価を避ける）', async () => {
    await setup();
    const rows = rowElements();
    const instance = MockIntersectionObserver.instances[0];

    instance.trigger(rows[1], true);
    await waitForCondition(
      () => (scopeData().vr as Record<string, unknown>)?.first === 1,
      {description: 'published'},
    );

    const setSpy = vi.spyOn(Core, 'setBindingData');
    // 既に可視の行を再度 true で発火しても可視集合は変わらない。
    instance.trigger(rows[1], true);
    await Promise.resolve();
    expect(setSpy).not.toHaveBeenCalled();
  });

  describe('登録の同期と解除', () => {
    /**
     * 属性を指定して一覧を構築し、監視を同期します。
     *
     * @param attributes `data-each-visible` 系の属性文字列
     * @returns 生成した一覧要素
     */
    const setupWith = async (attributes: string): Promise<HTMLElement> => {
      const scope = document.createElement('div');
      scope.id = 'scope';
      scope.setAttribute(
        'data-bind',
        JSON.stringify({content: [{name: 'A'}, {name: 'B'}]}),
      );
      scope.innerHTML = `
        <ul id="list" data-each="content" ${attributes}>
          <li>{{name}}</li>
        </ul>`;
      document.body.appendChild(scope);
      await Core.scan(scope);
      VisibleRangeObserver.syncTree(scope);
      return document.getElementById('list') as HTMLElement;
    };

    it('変数名の無い data-each-visible は監視せず警告する', async () => {
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);

      await setupWith('data-each-visible=""');

      expect(MockIntersectionObserver.instances).toHaveLength(0);
      expect(warn).toHaveBeenCalled();
    });

    it('root セレクタが見つからない場合はビューポートを使い、記録する', async () => {
      const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);

      await setupWith('data-each-visible="vr" data-each-visible-root="#none"');

      expect(MockIntersectionObserver.instances).toHaveLength(1);
      expect(MockIntersectionObserver.instances[0].root).toBeNull();
      expect(error).toHaveBeenCalled();
    });

    it('data-each-visible-margin を rootMargin へ渡す', async () => {
      await setupWith(
        'data-each-visible="vr" data-each-visible-margin="120px 0px"',
      );

      expect(MockIntersectionObserver.instances[0].rootMargin).toBe(
        '120px 0px',
      );
    });

    it('data-each-visible を外すと監視を解除する', async () => {
      const list = await setupWith('data-each-visible="vr"');
      const instance = MockIntersectionObserver.instances[0];
      expect(instance.observed.size).toBe(2);

      // 監視対象の判定はフラグメントの属性で行うため、フラグメント経由で外す。
      await (Fragment.get(list) as ElementFragment).removeAttribute(
        'data-each-visible',
      );
      VisibleRangeObserver.syncElement(list);

      expect(instance.observed.size).toBe(0);
      // 監視対象でなくなったので、同期し直しても新しい登録は作らない。
      VisibleRangeObserver.syncElement(list);
      expect(MockIntersectionObserver.instances).toHaveLength(1);
    });

    it('行が増減すると監視対象が追従する', async () => {
      const list = await setupWith('data-each-visible="vr"');
      const instance = MockIntersectionObserver.instances[0];
      expect(instance.observed.size).toBe(2);

      const scope = document.getElementById('scope') as HTMLElement;
      await Core.setBindingData(scope, {
        content: [{name: 'A'}, {name: 'B'}, {name: 'C'}],
      });
      await waitForCondition(() => list.querySelectorAll('li').length === 3, {
        description: 'rows rendered',
      });
      VisibleRangeObserver.syncElement(list);

      // 設定は不変なので登録は作り直さず、監視対象だけが増える。
      expect(MockIntersectionObserver.instances).toHaveLength(1);
      expect(instance.observed.size).toBe(3);
    });

    it('cleanupTree で配下の監視を解除する', async () => {
      await setupWith('data-each-visible="vr"');
      const instance = MockIntersectionObserver.instances[0];
      const scope = document.getElementById('scope') as HTMLElement;

      VisibleRangeObserver.cleanupTree(scope);

      expect(instance.observed.size).toBe(0);
      // 解除済みなので、再同期すると新しい登録が作られる。
      VisibleRangeObserver.syncTree(scope);
      expect(MockIntersectionObserver.instances).toHaveLength(2);
    });

    it('IntersectionObserver が無い環境では登録しない', async () => {
      vi.stubGlobal('IntersectionObserver', undefined);

      await expect(setupWith('data-each-visible="vr"')).resolves.toBeTruthy();
      expect(MockIntersectionObserver.instances).toHaveLength(0);
    });
  });
});
