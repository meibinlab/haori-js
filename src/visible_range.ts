/**
 * @fileoverview スクロール追従の可視行範囲をバインドスコープへ公開する監視機能。
 *
 * `data-each` コンテナに `data-each-visible="<変数名>"` を付与すると、その一覧の
 * 「いまビューポートに見えている行」の範囲を、指定名の変数として最近接の上位
 * `data-bind` スコープへ公開します。無限スクロールのフッタ「x - y / z 件」などを
 * JavaScript なしで宣言的に表示するための仕組みです。
 *
 * 各行を 1 つの `IntersectionObserver`（しきい値 0＝1px でも見えたら可視）で監視し、
 * 交差状態の変化を `requestAnimationFrame` で 1 回にまとめて集計します。公開は前回値
 * と異なるときだけ行い、再評価では一覧本体フラグメントを `skipFragments` で枝刈りする
 * ため、行数に依存せずフッタのみを再評価します（性能上の要）。
 */

import Core from './core';
import Env from './env';
import Fragment, {ElementFragment} from './fragment';
import Log from './log';

/**
 * 公開する可視範囲のスナップショットです。
 */
interface VisibleRangeSnapshot {
  /** 可視先頭行の 0 始まり論理インデックス（可視 0 件のときは -1） */
  first: number;

  /** 可視末尾行の 0 始まり論理インデックス（可視 0 件のときは -1） */
  last: number;

  /** 表示用の先頭番号（`first + 1`。可視 0 件のときは 0） */
  firstLabel: number;

  /** 表示用の末尾番号（`last + 1`。可視 0 件のときは 0） */
  lastLabel: number;

  /** 可視行数 */
  count: number;

  /** 読込済（描画済み）の行数 */
  total: number;

  /** 可視行が 0 件のとき true */
  empty: boolean;
}

/**
 * 1 つの `data-each` コンテナに対する監視登録です。
 */
interface VisibleRangeRegistration {
  /** 監視対象の `data-each` コンテナフラグメント */
  fragment: ElementFragment;

  /** 行を監視している IntersectionObserver */
  observer: IntersectionObserver;

  /** 公開する変数名 */
  varName: string;

  /** スクロール枠（root） */
  root: HTMLElement | null;

  /** rootMargin */
  rootMargin: string;

  /** 現在監視している行要素の集合 */
  observedRows: Set<HTMLElement>;

  /** 現在交差中（可視）の行要素の集合 */
  visibleRows: Set<HTMLElement>;

  /** 集計が rAF へ予約済みかどうか */
  scheduled: boolean;

  /** 直近に公開したスナップショットの直列化文字列（同値再公開の抑止用） */
  lastSnapshot: string | null;
}

/**
 * 次フレームでコールバックを実行します。`requestAnimationFrame` が無い環境では
 * マイクロタスクへフォールバックします。
 *
 * @param callback 実行するコールバック
 */
function scheduleFrame(callback: () => void): void {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => callback());
  } else {
    void Promise.resolve().then(callback);
  }
}

/**
 * `data-each-visible-*` を監視し、可視行範囲をバインドスコープへ公開します。
 */
export default class VisibleRangeObserver {
  /** しきい値（1px でも見えたら可視とする厳密判定） */
  private static readonly THRESHOLD = 0;

  /** rootMargin の既定値 */
  private static readonly DEFAULT_ROOT_MARGIN = '0px';

  private static readonly registrations = new Map<
    HTMLElement,
    VisibleRangeRegistration
  >();

  /**
   * ノードが現在の Window に属する HTMLElement かどうかを判定します。
   *
   * @param node 判定対象ノード
   * @returns HTMLElement の場合は true
   */
  private static isHtmlElement(node: unknown): node is HTMLElement {
    if (!(node instanceof Element)) {
      return false;
    }
    const ctor = node.ownerDocument?.defaultView?.HTMLElement;
    return typeof ctor !== 'undefined' && node instanceof ctor;
  }

  /**
   * 指定ノード配下の `data-each-visible` コンテナを同期します。
   *
   * @param root 走査の起点ノード
   */
  public static syncTree(root: Node): void {
    if (!(root instanceof Element || root instanceof DocumentFragment)) {
      return;
    }
    if (VisibleRangeObserver.isHtmlElement(root)) {
      VisibleRangeObserver.syncElement(root);
    }
    root.querySelectorAll<HTMLElement>('*').forEach(element => {
      VisibleRangeObserver.syncElement(element);
    });
  }

  /**
   * 単一要素の監視登録を同期します。`data-each` かつ `data-each-visible` を持つ
   * コンテナのみ対象とし、行の追加・削除に追従して監視対象を更新します。
   *
   * @param element 対象要素
   */
  public static syncElement(element: HTMLElement): void {
    const registration = VisibleRangeObserver.registrations.get(element);
    const fragment = Fragment.get(element);
    if (
      !(fragment instanceof ElementFragment) ||
      !VisibleRangeObserver.shouldObserve(fragment)
    ) {
      if (registration) {
        registration.observer.disconnect();
        VisibleRangeObserver.registrations.delete(element);
      }
      return;
    }

    if (typeof IntersectionObserver === 'undefined') {
      return;
    }

    const varName = VisibleRangeObserver.resolveVarName(fragment);
    if (varName === '') {
      // 変数名が無い（値なしの data-each-visible）場合は公開先が定まらないため無視する。
      if (registration) {
        registration.observer.disconnect();
        VisibleRangeObserver.registrations.delete(element);
      }
      Log.warn(
        '[Haori]',
        'data-each-visible requires a variable name ' +
          '(e.g. data-each-visible="visibleRange").',
      );
      return;
    }

    const nextRoot = VisibleRangeObserver.resolveRoot(fragment);
    const nextRootMargin = VisibleRangeObserver.resolveRootMargin(fragment);

    if (
      registration &&
      registration.observer.root === nextRoot &&
      registration.observer.rootMargin === nextRootMargin &&
      registration.varName === varName
    ) {
      // 設定は不変。フラグメント参照だけ更新し、行の差分を取り直す。
      registration.fragment = fragment;
      VisibleRangeObserver.refreshRows(registration);
      return;
    }

    if (registration) {
      registration.observer.disconnect();
      VisibleRangeObserver.registrations.delete(element);
    }

    const observer = new IntersectionObserver(
      entries => {
        const current = VisibleRangeObserver.registrations.get(element);
        if (!current) {
          return;
        }
        let changed = false;
        entries.forEach(entry => {
          const target = entry.target as HTMLElement;
          if (!current.observedRows.has(target)) {
            return;
          }
          if (entry.isIntersecting) {
            if (!current.visibleRows.has(target)) {
              current.visibleRows.add(target);
              changed = true;
            }
          } else if (current.visibleRows.delete(target)) {
            changed = true;
          }
        });
        if (changed) {
          VisibleRangeObserver.scheduleCompute(current);
        }
      },
      {
        root: nextRoot,
        rootMargin: nextRootMargin,
        threshold: VisibleRangeObserver.THRESHOLD,
      },
    );

    const newRegistration: VisibleRangeRegistration = {
      fragment,
      observer,
      varName,
      root: nextRoot,
      rootMargin: nextRootMargin,
      observedRows: new Set(),
      visibleRows: new Set(),
      scheduled: false,
      lastSnapshot: null,
    };
    VisibleRangeObserver.registrations.set(element, newRegistration);
    VisibleRangeObserver.refreshRows(newRegistration);
  }

  /**
   * 指定ノード配下の監視登録を解放します。
   *
   * @param root 走査の起点ノード
   */
  public static cleanupTree(root: Node): void {
    if (VisibleRangeObserver.isHtmlElement(root)) {
      const registration = VisibleRangeObserver.registrations.get(root);
      if (registration) {
        registration.observer.disconnect();
        VisibleRangeObserver.registrations.delete(root);
      }
    }
    if (!(root instanceof Element || root instanceof DocumentFragment)) {
      return;
    }
    root.querySelectorAll<HTMLElement>('*').forEach(element => {
      const registration = VisibleRangeObserver.registrations.get(element);
      if (registration) {
        registration.observer.disconnect();
        VisibleRangeObserver.registrations.delete(element);
      }
    });
  }

  /**
   * すべての監視登録を解放します。
   */
  public static disconnectAll(): void {
    VisibleRangeObserver.registrations.forEach(registration => {
      registration.observer.disconnect();
    });
    VisibleRangeObserver.registrations.clear();
  }

  /**
   * 監視対象（`data-each` かつ `data-each-visible`）かどうかを判定します。
   *
   * @param fragment 判定対象フラグメント
   * @returns 監視対象なら true
   */
  private static shouldObserve(fragment: ElementFragment): boolean {
    return (
      fragment.hasAttribute(`${Env.prefix}each`) &&
      fragment.hasAttribute(`${Env.prefix}each-visible`)
    );
  }

  /**
   * 公開する変数名を解決します。
   *
   * @param fragment コンテナフラグメント
   * @returns 変数名。未指定なら空文字
   */
  private static resolveVarName(fragment: ElementFragment): string {
    const raw = fragment.getRawAttribute(`${Env.prefix}each-visible`);
    return typeof raw === 'string' ? raw.trim() : '';
  }

  /**
   * スクロール枠（root）を解決します。
   *
   * @param fragment コンテナフラグメント
   * @returns root 要素。未指定・不正ならビューポート（null）
   */
  private static resolveRoot(fragment: ElementFragment): HTMLElement | null {
    const attrName = `${Env.prefix}each-visible-root`;
    if (!fragment.hasAttribute(attrName)) {
      return null;
    }
    const selector = fragment.getAttribute(attrName);
    if (typeof selector !== 'string' || selector.trim() === '') {
      return null;
    }
    const root = document.querySelector(selector);
    if (VisibleRangeObserver.isHtmlElement(root)) {
      return root;
    }
    Log.error('[Haori]', `Visible range root element not found: ${selector}`);
    return null;
  }

  /**
   * rootMargin を解決します。
   *
   * @param fragment コンテナフラグメント
   * @returns rootMargin 文字列（未指定は既定値）
   */
  private static resolveRootMargin(fragment: ElementFragment): string {
    const attrName = `${Env.prefix}each-visible-margin`;
    const value = fragment.getAttribute(attrName);
    if (value === null || value === false || value === '') {
      return VisibleRangeObserver.DEFAULT_ROOT_MARGIN;
    }
    return String(value);
  }

  /**
   * コンテナ直下の実際の行要素（`each-before`/`each-after` を除く）を描画順で返します。
   *
   * @param fragment コンテナフラグメント
   * @returns 行要素の配列（描画順）
   */
  private static realRowElements(fragment: ElementFragment): HTMLElement[] {
    return fragment
      .getChildren()
      .filter(
        (child): child is ElementFragment =>
          child instanceof ElementFragment &&
          !child.hasAttribute(`${Env.prefix}each-before`) &&
          !child.hasAttribute(`${Env.prefix}each-after`),
      )
      .map(child => child.getTarget());
  }

  /**
   * 監視対象の行を最新の DOM に合わせて更新します（新規行を observe、消えた行を
   * unobserve）。行集合が変わるため集計も予約します。
   *
   * @param registration 対象の登録
   */
  private static refreshRows(registration: VisibleRangeRegistration): void {
    const rows = VisibleRangeObserver.realRowElements(registration.fragment);
    const rowSet = new Set(rows);
    for (const element of [...registration.observedRows]) {
      if (!rowSet.has(element)) {
        registration.observer.unobserve(element);
        registration.observedRows.delete(element);
        registration.visibleRows.delete(element);
      }
    }
    for (const element of rows) {
      if (!registration.observedRows.has(element)) {
        registration.observer.observe(element);
        registration.observedRows.add(element);
      }
    }
    VisibleRangeObserver.scheduleCompute(registration);
  }

  /**
   * 次フレームでの集計・公開を予約します（多発する交差イベントを 1 回にまとめる）。
   *
   * @param registration 対象の登録
   */
  private static scheduleCompute(
    registration: VisibleRangeRegistration,
  ): void {
    if (registration.scheduled) {
      return;
    }
    registration.scheduled = true;
    scheduleFrame(() => {
      registration.scheduled = false;
      const element = registration.fragment.getTarget();
      if (VisibleRangeObserver.registrations.get(element) !== registration) {
        // 解放済み、または再生成された登録。古い予約は破棄する。
        return;
      }
      VisibleRangeObserver.computeAndPublish(registration);
    });
  }

  /**
   * 現在の可視行範囲を集計し、前回と異なればバインドスコープへ公開します。
   *
   * @param registration 対象の登録
   */
  private static computeAndPublish(
    registration: VisibleRangeRegistration,
  ): void {
    const rows = VisibleRangeObserver.realRowElements(registration.fragment);
    const indexByElement = new Map<HTMLElement, number>();
    rows.forEach((element, index) => indexByElement.set(element, index));
    const indices: number[] = [];
    for (const element of registration.visibleRows) {
      const index = indexByElement.get(element);
      if (index !== undefined) {
        indices.push(index);
      }
    }

    let snapshot: VisibleRangeSnapshot;
    if (indices.length === 0) {
      snapshot = {
        first: -1,
        last: -1,
        firstLabel: 0,
        lastLabel: 0,
        count: 0,
        total: rows.length,
        empty: true,
      };
    } else {
      let first = indices[0];
      let last = indices[0];
      for (const index of indices) {
        if (index < first) {
          first = index;
        }
        if (index > last) {
          last = index;
        }
      }
      snapshot = {
        first,
        last,
        firstLabel: first + 1,
        lastLabel: last + 1,
        count: indices.length,
        total: rows.length,
        empty: false,
      };
    }

    const serialized = JSON.stringify(snapshot);
    if (serialized === registration.lastSnapshot) {
      return;
    }
    registration.lastSnapshot = serialized;
    VisibleRangeObserver.publish(registration, snapshot);
  }

  /**
   * 可視範囲スナップショットを最近接の上位 `data-bind` スコープへ公開します。
   *
   * @param registration 対象の登録
   * @param snapshot 公開するスナップショット
   */
  private static publish(
    registration: VisibleRangeRegistration,
    snapshot: VisibleRangeSnapshot,
  ): void {
    const owner = VisibleRangeObserver.resolveBindOwner(registration.fragment);
    if (!owner) {
      Log.warn(
        '[Haori]',
        'data-each-visible found no ancestor data-bind scope to publish into.',
      );
      return;
    }
    const ownerElement = owner.getTarget();
    const base: Record<string, unknown> = {
      ...(owner.getRawBindingData() ?? {}),
    };
    base[registration.varName] = {...snapshot};
    // 一覧本体は可視範囲変数に依存しないため、再評価から枝刈りして行数に依存しない
    // コストに抑える。公開先が一覧コンテナ自身（フォールバック）のときは枝刈り不可。
    const containerElement = registration.fragment.getTarget();
    const skipFragments =
      ownerElement === containerElement
        ? new Set<ElementFragment>()
        : new Set<ElementFragment>([registration.fragment]);
    // reflectToAttribute=false で data-bind 属性への全データ直列化を避ける。
    // 可視範囲は実行時の一時変数であり、属性ミラーは不要（in-memory が権威）。
    // これにより公開先スコープが大配列を持っていても直列化コストが発生しない。
    void Core.setBindingData(
      ownerElement,
      base,
      skipFragments,
      false,
      false,
    ).catch((error: unknown) => {
      Log.error('[Haori]', 'Failed to publish visible range:', error);
    });
  }

  /**
   * 公開先となる `data-bind` 所有フラグメントを解決します。最近接の上位（祖先）を
   * 優先し、見つからない場合のみコンテナ自身へフォールバックします。
   *
   * @param fragment コンテナフラグメント
   * @returns 公開先フラグメント。無ければ null
   */
  private static resolveBindOwner(
    fragment: ElementFragment,
  ): ElementFragment | null {
    const bindAttr = `${Env.prefix}bind`;
    let ancestor = fragment.getParent();
    while (ancestor) {
      if (ancestor.hasAttribute(bindAttr)) {
        return ancestor;
      }
      ancestor = ancestor.getParent();
    }
    if (fragment.hasAttribute(bindAttr)) {
      return fragment;
    }
    return null;
  }
}
