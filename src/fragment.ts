/**
 * @fileoverview 仮想DOM実装
 *
 * メモリ上にノードツリーを保持し、DOMへの反映を非同期で行います。
 * DOMからの読み込みは行わず、オブザーバーとchangeイベントで更新されます。
 */
import Queue from './queue';
import Log from './log';
import Expression from './expression';
import Env from './env';
import Dev from './dev';

interface EvaluationProfilePlaceholderSnapshot {
  expression: string;
  calls: number;
  totalDurationMs: number;
  maxDurationMs: number;
}

interface EvaluationProfileAttributeSnapshot {
  name: string;
  template: string;
  calls: number;
  totalDurationMs: number;
  maxDurationMs: number;
  placeholders: EvaluationProfilePlaceholderSnapshot[];
}

interface EvaluationProfileTextSnapshot {
  childIndex: number;
  template: string;
  calls: number;
  totalDurationMs: number;
  maxDurationMs: number;
  placeholders: EvaluationProfilePlaceholderSnapshot[];
}

interface EvaluationProfileElementSnapshot {
  elementId: string;
  tagName: string;
  attributes: EvaluationProfileAttributeSnapshot[];
  texts: EvaluationProfileTextSnapshot[];
}

type EvaluationProfileContext =
  | {
    kind: 'attribute';
    element: HTMLElement;
    rawName: string;
    template: string;
  }
  | {
    kind: 'text';
    element: HTMLElement;
    childIndex: number;
    template: string;
  };

interface EvaluationProfileCounter {
  template: string;
  calls: number;
  totalDurationMs: number;
  maxDurationMs: number;
  placeholders: Map<string, EvaluationProfilePlaceholderCounter>;
}

interface EvaluationProfilePlaceholderCounter {
  calls: number;
  totalDurationMs: number;
  maxDurationMs: number;
}

interface EvaluationProfileElementStore {
  tagName: string;
  attributes: Map<string, EvaluationProfileCounter>;
  texts: Map<string, EvaluationProfileCounter>;
}

/**
 * 開発時の属性・テキスト評価回数を集計するレジストリです。
 */
class EvaluationProfileRegistry {
  /** globalThis に公開するキー */
  private static readonly GLOBAL_KEY = '__HAORI_EVALUATION_PROFILE__';

  /** エレメントごとの集計 */
  private static readonly ELEMENT_STORES = new Map<
    string,
    EvaluationProfileElementStore
  >();

  /**
   * 集計状態を初期化します。
   */
  public static reset(): void {
    EvaluationProfileRegistry.ELEMENT_STORES.clear();
    EvaluationProfileRegistry.ensureGlobalAccess();
  }

  /**
   * 現在の集計結果スナップショットを返します。
   *
   * @returns エレメントごとの集計結果
   */
  public static snapshot(): EvaluationProfileElementSnapshot[] {
    EvaluationProfileRegistry.ensureGlobalAccess();
    return [...EvaluationProfileRegistry.ELEMENT_STORES.entries()]
      .map(([elementId, store]) => ({
        elementId,
        tagName: store.tagName,
        attributes: [...store.attributes.entries()]
          .map(([name, counter]) => ({
            name,
            template: counter.template,
            calls: counter.calls,
            totalDurationMs: counter.totalDurationMs,
            maxDurationMs: counter.maxDurationMs,
            placeholders: EvaluationProfileRegistry.sortPlaceholders(
              counter.placeholders,
            ),
          }))
          .sort((left, right) => right.calls - left.calls),
        texts: [...store.texts.entries()]
          .map(([childIndex, counter]) => ({
            childIndex: Number(childIndex),
            template: counter.template,
            calls: counter.calls,
            totalDurationMs: counter.totalDurationMs,
            maxDurationMs: counter.maxDurationMs,
            placeholders: EvaluationProfileRegistry.sortPlaceholders(
              counter.placeholders,
            ),
          }))
          .sort((left, right) => right.calls - left.calls),
      }))
      .sort((left, right) => {
        const leftCalls =
          left.attributes.reduce((sum, item) => sum + item.calls, 0) +
          left.texts.reduce((sum, item) => sum + item.calls, 0);
        const rightCalls =
          right.attributes.reduce((sum, item) => sum + item.calls, 0) +
          right.texts.reduce((sum, item) => sum + item.calls, 0);
        return rightCalls - leftCalls;
      });
  }

  /**
   * 評価呼び出しを記録します。
   *
   * @param context 評価コンテキスト
   * @param expressions 今回評価した式一覧
   */
  public static record(
    context: EvaluationProfileContext | undefined,
    expressions: Array<{expression: string; durationMs: number}>,
    totalDurationMs: number,
  ): void {
    if (!Dev.isEnabled() || !context || expressions.length === 0) {
      return;
    }
    EvaluationProfileRegistry.ensureGlobalAccess();
    const store = EvaluationProfileRegistry.getOrCreateElementStore(
      context.element,
    );
    if (context.kind === 'attribute') {
      const counter = EvaluationProfileRegistry.getOrCreateCounter(
        store.attributes,
        context.rawName,
        context.template,
      );
      EvaluationProfileRegistry.updateCounter(
        counter,
        expressions,
        totalDurationMs,
      );
      return;
    }
    const counter = EvaluationProfileRegistry.getOrCreateCounter(
      store.texts,
      String(context.childIndex),
      context.template,
    );
    EvaluationProfileRegistry.updateCounter(counter, expressions, totalDurationMs);
  }

  /**
   * globalThis から dev-only の取得窓口を参照できるようにします。
   */
  private static ensureGlobalAccess(): void {
    if (!Dev.isEnabled()) {
      return;
    }
    const globalRecord = globalThis as Record<string, unknown>;
    if (globalRecord[EvaluationProfileRegistry.GLOBAL_KEY] !== undefined) {
      return;
    }
    globalRecord[EvaluationProfileRegistry.GLOBAL_KEY] = {
      reset: () => EvaluationProfileRegistry.reset(),
      snapshot: () => EvaluationProfileRegistry.snapshot(),
    };
  }

  /**
   * エレメント単位の集計ストアを取得または初期化します。
   *
   * @param element 対象エレメント
   * @returns 集計ストア
   */
  private static getOrCreateElementStore(
    element: HTMLElement,
  ): EvaluationProfileElementStore {
    const elementId = EvaluationProfileRegistry.createElementId(element);
    const existing = EvaluationProfileRegistry.ELEMENT_STORES.get(elementId);
    if (existing) {
      return existing;
    }
    const store: EvaluationProfileElementStore = {
      tagName: element.tagName.toLowerCase(),
      attributes: new Map(),
      texts: new Map(),
    };
    EvaluationProfileRegistry.ELEMENT_STORES.set(elementId, store);
    return store;
  }

  /**
   * カウンタを取得または初期化します。
   *
   * @param counters 種別ごとのカウンタマップ
   * @param key カウンタキー
   * @param template 元テンプレート
   * @returns カウンタ
   */
  private static getOrCreateCounter(
    counters: Map<string, EvaluationProfileCounter>,
    key: string,
    template: string,
  ): EvaluationProfileCounter {
    const existing = counters.get(key);
    if (existing) {
      return existing;
    }
    const counter: EvaluationProfileCounter = {
      template,
      calls: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      placeholders: new Map(),
    };
    counters.set(key, counter);
    return counter;
  }

  /**
   * プレースホルダカウンタを取得または初期化します。
   *
   * @param placeholders プレースホルダカウンタマップ
   * @param expression 式文字列
   * @returns プレースホルダカウンタ
   */
  private static getOrCreatePlaceholder(
    placeholders: Map<string, EvaluationProfilePlaceholderCounter>,
    expression: string,
  ): EvaluationProfilePlaceholderCounter {
    const existing = placeholders.get(expression);
    if (existing) {
      return existing;
    }
    const counter: EvaluationProfilePlaceholderCounter = {
      calls: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
    };
    placeholders.set(expression, counter);
    return counter;
  }

  /**
   * カウンタへ今回の評価結果を加算します。
   *
   * @param counter 更新対象カウンタ
   * @param expressions 今回評価した式一覧
   * @param totalDurationMs 今回の総所要時間
   */
  private static updateCounter(
    counter: EvaluationProfileCounter,
    expressions: Array<{expression: string; durationMs: number}>,
    totalDurationMs: number,
  ): void {
    counter.calls += 1;
    counter.totalDurationMs += totalDurationMs;
    counter.maxDurationMs = Math.max(counter.maxDurationMs, totalDurationMs);
    expressions.forEach(expression => {
      const placeholder = EvaluationProfileRegistry.getOrCreatePlaceholder(
        counter.placeholders,
        expression.expression,
      );
      placeholder.calls += 1;
      placeholder.totalDurationMs += expression.durationMs;
      placeholder.maxDurationMs = Math.max(
        placeholder.maxDurationMs,
        expression.durationMs,
      );
    });
  }

  /**
   * プレースホルダ集計を calls 降順で返します。
   *
   * @param placeholders プレースホルダ集計
   * @returns スナップショット
   */
  private static sortPlaceholders(
    placeholders: Map<string, EvaluationProfilePlaceholderCounter>,
  ): EvaluationProfilePlaceholderSnapshot[] {
    return [...placeholders.entries()]
      .map(([expression, counter]) => ({
        expression,
        calls: counter.calls,
        totalDurationMs: counter.totalDurationMs,
        maxDurationMs: counter.maxDurationMs,
      }))
      .sort((left, right) => {
        if (right.calls !== left.calls) {
          return right.calls - left.calls;
        }
        return right.totalDurationMs - left.totalDurationMs;
      });
  }

  /**
   * 現在時刻のタイムスタンプを返します。
   *
   * @returns ミリ秒
   */
  private static now(): number {
    return globalThis.performance?.now() ?? Date.now();
  }

  /**
   * 評価処理の所要時間を計測します。
   *
   * @param callback 計測対象
   * @returns 結果と所要時間
   */
  public static measure<T>(callback: () => T): {
    value: T;
    durationMs: number;
  } {
    const startedAt = EvaluationProfileRegistry.now();
    const value = callback();
    return {
      value,
      durationMs: EvaluationProfileRegistry.now() - startedAt,
    };
  }

  /**
   * エレメント識別子を生成します。
   *
   * @param element 対象エレメント
   * @returns 識別子
   */
  private static createElementId(element: HTMLElement): string {
    const segments: string[] = [];
    let current: Element | null = element;
    while (current) {
      let segment = current.tagName.toLowerCase();
      const rawId = current.getAttribute('id') || '';
      if (rawId.trim() !== '') {
        segment += `#${rawId.trim()}`;
        segments.unshift(segment);
        break;
      }
      const deriveName = current.getAttribute(`${Env.prefix}derive-name`);
      if (deriveName && deriveName.trim() !== '') {
        segment += `[${Env.prefix}derive-name="${deriveName.trim()}"]`;
      }
      const parent: Element | null = current.parentElement;
      if (parent) {
        segment += `:nth-child(${[...parent.children].indexOf(current) + 1})`;
      }
      segments.unshift(segment);
      current = parent;
    }
    return segments.join(' > ');
  }
}

/**
 * 属性評価結果の詳細です。
 */
export interface AttributeEvaluationDetail {
  /** 評価済みの値 */
  value: string | false | unknown | null;

  /** 未解決参照が含まれていたかどうか */
  hasUnresolvedReference: boolean;
}

/**
 * 仮想DOMのフラグメントの抽象クラス。
 */
export default abstract class Fragment {
  /** フラグメントの対象ノードに対するキャッシュ */
  protected static readonly FRAGMENT_CACHE = new WeakMap<Node, Fragment>();

  /**
   * フラグメントを取得もしくは作成します。
   *
   * @param node 対象ノード
   * @returns フラグメント
   */
  public static get(node: HTMLElement): ElementFragment;
  public static get(node: Text): TextFragment;
  public static get(node: Comment): CommentFragment;
  public static get(node: Node | null): Fragment | null;
  public static get(node: Node | null): Fragment | null {
    if (node == null) {
      return null;
    }
    if (Fragment.FRAGMENT_CACHE.has(node)) {
      return Fragment.FRAGMENT_CACHE.get(node)!;
    }
    let fragment;
    switch (node.nodeType) {
      case Node.ELEMENT_NODE:
        fragment = new ElementFragment(node as HTMLElement);
        break;
      case Node.TEXT_NODE:
        fragment = new TextFragment(node as Text);
        break;
      case Node.COMMENT_NODE:
        fragment = new CommentFragment(node as Comment);
        break;
      default:
        Log.warn('[Haori]', 'Unsupported node type:', node.nodeType);
        return null;
    }
    return fragment;
  }

  /** 親フラグメント */
  protected parent: ElementFragment | null = null;

  /** 対象ノード */
  protected readonly target: Node;

  /** フラグメントがDOMにマウントされているかどうか */
  protected mounted = false;

  /** ノード更新スキップフラグ（オブザーバーによる無限ループ対応） */
  protected skipMutationNodes = false;

  /**
   * フラグメントのコンストラクタ。
   *
   * @param target 対象ノード
   */
  protected constructor(target: Node) {
    this.target = target;
    Fragment.FRAGMENT_CACHE.set(target, this);
  }

  /**
   * skipMutationNodesフラグの値を取得します。
   *
   * @returns skipMutationNodesの値
   */
  public isSkipMutationNodes(): boolean {
    return this.skipMutationNodes;
  }

  /**
   * フラグメントをDOMから除去します。
   *
   * @return 除去のPromise
   */
  public unmount(): Promise<void> {
    if (!this.mounted || this.skipMutationNodes) {
      return Promise.resolve();
    }
    if (this.parent) {
      const parent = this.parent;
      const prevSkip = parent.skipMutationNodes;
      return Queue.enqueue(() => {
        parent.skipMutationNodes = true;
        if (this.target.parentNode === parent.getTarget()) {
          parent.getTarget().removeChild(this.target);
        }
        this.mounted = false;
      }).finally(() => {
        parent.skipMutationNodes = prevSkip;
      }) as Promise<void>;
    } else {
      // 親フラグメント情報が無くても、DOM 上に親ノードが存在する場合は安全に除去する。
      const host = this.target.parentNode as HTMLElement | null;
      if (host) {
        return Queue.enqueue(() => {
          if (this.target.parentNode === host) {
            host.removeChild(this.target);
          }
          this.mounted = false;
        }) as Promise<void>;
      }
      this.mounted = false;
    }
    return Promise.resolve();
  }

  /**
   * フラグメントをDOMに追加します。
   *
   * @return 追加のPromise
   */
  public mount(): Promise<void> {
    if (this.mounted || this.skipMutationNodes) {
      return Promise.resolve();
    }
    if (this.parent) {
      const parent = this.parent;
      const prevSkip = parent.skipMutationNodes;
      return Queue.enqueue(() => {
        parent.skipMutationNodes = true;
        if (this.target.parentNode !== parent.getTarget()) {
          // 既に同じ親なら何もしない
          parent.getTarget().appendChild(this.target);
        }
        this.mounted = true;
      }).finally(() => {
        parent.skipMutationNodes = prevSkip;
      }) as Promise<void>;
    }
    return Promise.resolve();
  }

  /**
   * フラグメントのマウント状態を取得します。
   *
   * @returns マウント状態
   */
  public isMounted(): boolean {
    return this.mounted;
  }

  /**
   * フラグメントのマウント状態を設定します。
   *
   * @param mounted マウント状態
   */
  public setMounted(mounted: boolean): void {
    this.mounted = mounted;
  }

  /**
   * フラグメントをクローンします。
   *
   * @returns クローンされたフラグメント
   */
  public abstract clone(): Fragment;

  /**
   * フラグメントとノードを削除します。
   *
   * @param unmount DOMからの除去を行うかどうか（内部の子呼び出しの場合のみfalseとする）
   * @return 除去のPromise
   */
  public remove(unmount = true): Promise<void> {
    if (this.parent) {
      this.parent.removeChild(this);
    }
    Fragment.FRAGMENT_CACHE.delete(this.target);
    if (unmount) {
      return this.unmount();
    }
    return Promise.resolve();
  }

  /**
   * 対象ノードを取得します。
   *
   * @returns 対象ノード
   */
  public getTarget(): Node {
    return this.target;
  }

  /**
   * 親フラグメントを取得します。
   *
   * @returns 親フラグメント
   */
  public getParent(): ElementFragment | null {
    return this.parent;
  }

  /**
   * 親フラグメントを設定します。
   *
   * @param parent 親フラグメント
   */
  public setParent(parent: ElementFragment | null): void {
    this.parent = parent;
  }
}

/**
 * エレメントフラグメント。
 * DOM要素を表現し、子ノードを持つことができます。
 */
export class ElementFragment extends Fragment {
  /** HTML 真偽属性名のセット */
  private static readonly BOOLEAN_ATTRIBUTES = new Set([
    'allowfullscreen',
    'async',
    'autofocus',
    'autoplay',
    'checked',
    'controls',
    'default',
    'defer',
    'disabled',
    'hidden',
    'inert',
    'ismap',
    'loop',
    'multiple',
    'muted',
    'nomodule',
    'novalidate',
    'open',
    'playsinline',
    'readonly',
    'required',
    'reversed',
    'selected',
  ]);

  /** inputイベントを発生させるタイプ */
  private readonly INPUT_EVENT_TYPES = [
    'text',
    'password',
    'email',
    'url',
    'tel',
    'search',
    'number',
    'range',
    'color',
    'date',
    'datetime-local',
    'month',
    'time',
    'week',
  ];

  /** 子フラグメントのリスト */
  private readonly children: Fragment[] = [];

  /** 属性名に対する属性情報のマップ */
  private readonly attributeMap = new Map<string, AttributeContents>();

  /** バインドデータ */
  private bindingData: Record<string, unknown> | null = null;

  /** 子孫要素へ公開する派生バインドデータ */
  private derivedBindingData: Record<string, unknown> | null = null;

  /** バインドデータのキャッシュ */
  private bindingDataCache: Record<string, unknown> | null = null;

  /** 子孫要素向けバインドデータのキャッシュ */
  private descendantBindingDataCache: Record<string, unknown> | null = null;

  /** 表示状態 */
  private visible = true;

  /** 元の display 値 */
  private display: string | null = null;

  /** 元の display の優先度 */
  private displayPriority: string | null = null;

  /** each用のテンプレート */
  private template: ElementFragment | null = null;

  /** each比較用のキー */
  private listKey: string | null = null;

  /** 直近に描画した each 行の入力署名 */
  private renderSignature: string | null = null;

  /** 直近に描画した data-each 全体の入力署名 */
  private eachInputSignature: string | null = null;

  /** 直近に公開した data-derive subtree の入力署名 */
  private deriveSubtreeSignature: string | null = null;

  /** 直近に評価した data-derive の入力署名 */
  private deriveInputSignature: string | null = null;

  /** fresh clone 初期化を subtree ごと省略できるかどうか */
  private freshInitializationSkippable = false;

  /** valueプロパティの値 */
  private value: string | number | boolean | null = null;

  /** 属性更新スキップフラグ（オブザーバーによる無限ループ対応） */
  private skipMutationAttributes = false;

  /** 値変更スキップフラグ（更新イベントによる無限ループ対応） */
  private skipChangeValue = false;

  /**
   * エレメントフラグメントのコンストラクタ。
   * アトリビュートや子フラグメントの作成も行います。
   *
   * @param target 対象エレメント
   */
  public constructor(target: HTMLElement) {
    super(target);
    this.syncValue();
    target.getAttributeNames().forEach(name => {
      const value = target.getAttribute(name);
      if (value !== null && !this.attributeMap.has(name)) {
        const contents = new AttributeContents(name, value);
        this.attributeMap.set(name, contents);
      }
    });
    target.childNodes.forEach(node => {
      const childFragment = Fragment.get(node);
      childFragment!.setParent(this);
      this.children.push(childFragment!);
    });
  }

  /**
   * 子フラグメントのリストを取得します。
   *
   * @returns 子フラグメントのリスト
   */
  public getChildren(): Fragment[] {
    return this.children;
  }

  /**
   * 子エレメントフラグメントのリストを取得します。
   *
   * @returns 子エレメントフラグメントのリスト
   */
  public getChildElementFragments(): ElementFragment[] {
    return this.children.filter(
      child => child instanceof ElementFragment,
    ) as ElementFragment[];
  }

  /**
   * 子フラグメントをリストに追加します。
   * DOMの追加は行いません。
   *
   * @param child 追加する子フラグメント
   */
  public pushChild(child: Fragment) {
    this.children.push(child);
    child.setParent(this);
  }

  /**
   * 子フラグメントをリストから削除します。
   * DOMからの削除は行いません。
   *
   * @param child 削除する子フラグメント
   */
  public removeChild(child: Fragment): void {
    const index = this.children.indexOf(child);
    if (index < 0) {
      Log.warn('[Haori]', 'Child fragment not found.', child);
      return;
    }
    this.children.splice(index, 1);
    child.setParent(null);
  }

  /**
   * フラグメントをクローンします。
   *
   * @returns クローンされたフラグメント
   */
  public clone(): ElementFragment {
    const clone = new ElementFragment(
      this.target.cloneNode(false) as HTMLElement,
    );
    // DOM 属性は評価後の値になっているため、
    // クローンでは attributeMap をコピーしてテンプレート式を保持します。
    this.attributeMap.forEach((contents, name) => {
      clone.attributeMap.set(name, contents);
    });
    this.children.forEach(child => {
      const childClone = child.clone();
      clone.getTarget().appendChild(childClone.getTarget());
      clone.pushChild(childClone);
    });
    clone.mounted = false;
    clone.bindingData = this.bindingData;
    clone.derivedBindingData = this.derivedBindingData;
    clone.clearBindingDataCache();
    clone.visible = true;
    clone.display = this.display;
    clone.displayPriority = this.displayPriority;
    clone.template = this.template;
    clone.renderSignature = this.renderSignature;
    clone.eachInputSignature = this.eachInputSignature;
    clone.deriveSubtreeSignature = null;
    clone.deriveInputSignature = null;
    clone.freshInitializationSkippable = this.freshInitializationSkippable;
    clone.normalizeClonedVisibilityState();
    return clone;
  }

  /**
   * clone 時に runtime の hidden 状態だけを落とします。
   */
  private normalizeClonedVisibilityState(): void {
    if (
      this.visible === false ||
      this.getTarget().style.display === 'none' ||
      this.getTarget().hasAttribute(`${Env.prefix}if-false`)
    ) {
      this.visible = true;
      this.display = null;
      this.displayPriority = null;
      this.getTarget().style.removeProperty('display');
      this.getTarget().removeAttribute(`${Env.prefix}if-false`);
    }
    this.children.forEach(child => {
      if (child instanceof ElementFragment) {
        child.normalizeClonedVisibilityState();
      }
    });
  }

  /**
   * フラグメントとノードを削除します。
   *
   * @param unmount DOMからの除去を行うかどうか（内部の子呼び出しの場合のみfalseとする）
   * @return 除去のPromise
   */
  public remove(unmount = true): Promise<void> {
    const promises: Promise<void>[] = [];
    this.children.forEach(child => {
      promises.push(child.remove(false));
    });
    this.children.length = 0;
    this.attributeMap.clear();
    this.bindingData = null;
    this.bindingDataCache = null;
    this.derivedBindingData = null;
    this.descendantBindingDataCache = null;
    if (this.template) {
      promises.push(this.template.remove(false));
      this.template = null;
    }
    this.eachInputSignature = null;
    this.deriveSubtreeSignature = null;
    this.deriveInputSignature = null;
    promises.push(super.remove(unmount));
    return Promise.all(promises).then(() => undefined);
  }

  /**
   * フラグメントの対象エレメントを取得します。
   *
   * @returns フラグメントの対象エレメント
   */
  public getTarget(): HTMLElement {
    return this.target as HTMLElement;
  }

  /**
   * 継承を考慮したバインドデータを取得します。
   *
   * @returns バインドデータのオブジェクト
   */
  public getBindingData(): Record<string, unknown> {
    if (this.bindingDataCache) {
      return this.bindingDataCache;
    }
    this.bindingDataCache = {};
    if (this.parent) {
      Object.assign(
        this.bindingDataCache,
        this.parent.getDescendantBindingData(),
      );
    }
    if (this.bindingData) {
      Object.assign(this.bindingDataCache, this.bindingData);
    }
    return this.bindingDataCache;
  }

  /**
   * 子孫要素向けのバインドデータを取得します。
   *
   * @returns 子孫要素向けのバインドデータ
   */
  public getDescendantBindingData(): Record<string, unknown> {
    if (this.descendantBindingDataCache) {
      return this.descendantBindingDataCache;
    }
    this.descendantBindingDataCache = {...this.getBindingData()};
    if (this.derivedBindingData) {
      Object.assign(this.descendantBindingDataCache, this.derivedBindingData);
    }
    return this.descendantBindingDataCache;
  }

  /**
   * 生のバインドデータを取得します。
   *
   * @returns 生のバインドデータ
   */
  public getRawBindingData(): Record<string, unknown> | null {
    return this.bindingData;
  }

  /**
   * 生の派生バインドデータを取得します。
   *
   * @returns 生の派生バインドデータ
   */
  public getRawDerivedBindingData(): Record<string, unknown> | null {
    return this.derivedBindingData;
  }

  /**
   * バインドデータを設定します。
   *
   * @param data バインドデータ
   */
  public setBindingData(data: Record<string, unknown>): void {
    this.bindingData = data;
    this.clearBindingDataCache();
  }

  /**
   * 子孫要素向けの派生バインドデータを設定します。
   *
   * @param data 派生バインドデータ。解除する場合は null
   */
  public setDerivedBindingData(data: Record<string, unknown> | null): void {
    this.derivedBindingData = data;
    this.clearBindingDataCache();
  }

  /**
   * 親フラグメントを設定します。バインドデータキャッシュをクリアします。
   *
   * @param parent 親フラグメント
   */
  public override setParent(parent: ElementFragment | null): void {
    if (this.parent === parent) {
      return;
    }
    this.parent = parent;
    this.clearBindingDataCache();
  }

  /**
   * バインドデータのキャッシュをクリアします。
   */
  public clearBindingDataCache(): void {
    this.bindingDataCache = null;
    this.descendantBindingDataCache = null;
    this.children.forEach(child => {
      if (child instanceof ElementFragment) {
        child.clearBindingDataCache();
      }
    });
  }

  /**
   * フラグメントのテンプレートを取得します。
   *
   * @returns テンプレート
   */
  public getTemplate(): ElementFragment | null {
    return this.template;
  }

  /**
   * フラグメントのテンプレートを設定します。
   *
   * @param template フラグメントのテンプレート
   */
  public setTemplate(template: ElementFragment | null): void {
    this.template = template;
  }

  /**
   * 比較用リストキーを設定します。
   *
   * @param key 比較用リストキー
   */
  public setListKey(key: string): void {
    this.listKey = key;
  }

  /**
   * 比較用リストキーを取得します。
   *
   * @returns 比較用リストキー
   */
  public getListKey(): string | null {
    return this.listKey;
  }

  /**
   * 直近に描画した each 行の入力署名を取得します。
   *
   * @returns 入力署名
   */
  public getRenderSignature(): string | null {
    return this.renderSignature;
  }

  /**
   * 直近に描画した each 行の入力署名を設定します。
   *
   * @param signature 入力署名
   */
  public setRenderSignature(signature: string | null): void {
    this.renderSignature = signature;
  }

  /**
   * 直近に描画した data-each 全体の入力署名を取得します。
   *
   * @returns 入力署名
   */
  public getEachInputSignature(): string | null {
    return this.eachInputSignature;
  }

  /**
   * 直近に描画した data-each 全体の入力署名を設定します。
   *
   * @param signature 入力署名
   */
  public setEachInputSignature(signature: string | null): void {
    this.eachInputSignature = signature;
  }

  /**
   * 直近に公開した data-derive subtree の入力署名を取得します。
   *
   * @returns 入力署名
   */
  public getDeriveSubtreeSignature(): string | null {
    return this.deriveSubtreeSignature;
  }

  /**
   * 直近に公開した data-derive subtree の入力署名を設定します。
   *
   * @param signature 入力署名
   */
  public setDeriveSubtreeSignature(signature: string | null): void {
    this.deriveSubtreeSignature = signature;
  }

  /**
   * 直近に評価した data-derive の入力署名を取得します。
   *
   * @returns 入力署名
   */
  public getDeriveInputSignature(): string | null {
    return this.deriveInputSignature;
  }

  /**
   * 直近に評価した data-derive の入力署名を設定します。
   *
   * @param signature 入力署名
   */
  public setDeriveInputSignature(signature: string | null): void {
    this.deriveInputSignature = signature;
  }

  /**
   * fresh clone 初期化を subtree ごと省略できるかどうかを返します。
   *
   * @returns 省略可能なら true
   */
  public isFreshInitializationSkippable(): boolean {
    return this.freshInitializationSkippable;
  }

  /**
   * fresh clone 初期化を subtree ごと省略できるかどうかを設定します。
   *
   * @param skippable 省略可能なら true
   */
  public setFreshInitializationSkippable(skippable: boolean): void {
    this.freshInitializationSkippable = skippable;
  }

  /**
   * 入力エレメントに値を設定します。
   * チェックボックとラジオボタンの場合は値に一致するかどうかでチェック状態を変更します。
   *
   * @param value 値
   * @returns エレメントの更新のPromise
   */
  public setValue(value: string | number | boolean | null): Promise<void> {
    return this.applyValue(value, true);
  }

  /**
   * 入力エレメントに値をイベントなしで設定します。
   * フォームの bindingData 反映時に内部同期として利用します。
   *
   * @param value 値
   * @returns エレメントの更新のPromise
   */
  public syncBindingValue(
    value: string | number | boolean | null,
  ): Promise<void> {
    return this.applyValue(value, false);
  }

  /**
   * 入力エレメントに値を設定します。
   * 必要に応じて入力系イベントも発火します。
   *
   * @param value 値
   * @param dispatchEvents input/change イベントを発火するかどうか
   * @returns エレメントの更新のPromise
   */
  private applyValue(
    value: string | number | boolean | null,
    dispatchEvents: boolean,
  ): Promise<void> {
    if (this.skipChangeValue) {
      return Promise.resolve();
    }
    if (this.value === value) {
      return Promise.resolve();
    }
    const element = this.getTarget();
    if (
      element instanceof HTMLInputElement &&
      (element.type === 'checkbox' || element.type === 'radio')
    ) {
      const result = this.getAttribute('value');
      const isBooleanCheckbox =
        element.type === 'checkbox' && result === 'true';
      let newChecked: boolean;
      if (isBooleanCheckbox) {
        newChecked = value === true || value === 'true';
      } else if (result === 'false') {
        newChecked = value === false;
      } else {
        newChecked = result === String(value);
      }
      this.value = isBooleanCheckbox ? newChecked : newChecked ? value : null;
      if (element.checked === newChecked) {
        return Promise.resolve();
      }
      this.skipChangeValue = true;
      return Queue.enqueue(() => {
        element.checked = newChecked;
        if (dispatchEvents) {
          element.dispatchEvent(new Event('change', {bubbles: true}));
        }
      }).finally(() => {
        this.skipChangeValue = false;
      }) as Promise<void>;
    } else if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    ) {
      this.value = value;
      this.skipChangeValue = true;
      return Queue.enqueue(() => {
        element.value = value === null ? '' : String(value);
        if (dispatchEvents) {
          if (
            (element instanceof HTMLInputElement &&
              this.INPUT_EVENT_TYPES.includes(element.type)) ||
            element instanceof HTMLTextAreaElement
          ) {
            element.dispatchEvent(new Event('input', {bubbles: true}));
          }
          element.dispatchEvent(new Event('change', {bubbles: true}));
        }
      }).finally(() => {
        this.skipChangeValue = false;
      }) as Promise<void>;
    } else {
      Log.warn(
        '[Haori]',
        'setValue is not supported for this element type.',
        element,
      );
      return Promise.resolve();
    }
  }

  /**
   * 入力エレメントの値を取得します。
   * DOM要素の現在の値と同期します。
   *
   * @returns 入力エレメントの値
   */
  public getValue(): string | number | boolean | null {
    return this.value;
  }

  /**
   * 内部の値をクリアします。エレメントのvalue値は変化しません。
   */
  public clearValue() {
    this.value = null;
  }

  /**
   * 内部の値をDOMの値と同期します。
   * changeイベント時など、DOM値が変更された後に呼び出されます。
   */
  public syncValue() {
    const element = this.getTarget();
    if (element instanceof HTMLInputElement) {
      if (element.type === 'checkbox' || element.type === 'radio') {
        const isBooleanCheckbox =
          element.type === 'checkbox' && element.value === 'true';
        if (element.checked) {
          const value = element.value;
          if (isBooleanCheckbox) {
            this.value = true;
          } else if (value === 'false') {
            this.value = false;
          } else {
            this.value = value;
          }
        } else {
          // チェックボックスがOFFの場合
          const value = element.value;
          if (isBooleanCheckbox) {
            this.value = false;
          } else if (value === 'false') {
            this.value = true;
          } else {
            this.value = null;
          }
        }
      } else {
        this.value = element.value;
      }
    } else if (element instanceof HTMLTextAreaElement) {
      this.value = element.value;
    } else if (element instanceof HTMLSelectElement) {
      this.value = element.value;
    }
  }

  /**
   * 属性の値を評価して設定します。
   * 評価値がfalseの場合は属性を削除します。
   * 矯正評価属性の場合は元の値を設定します。
   *
   * @param name 属性名
   * @param value 属性値
   * @returns 属性の更新のPromise
   */
  public setAttribute(
    name: string,
    value: string | null,
    fromObserver = false,
  ): Promise<void> {
    return this.setAttributeInternal(name, name, value, true, fromObserver);
  }

  /**
   * data-attr-* の生値を保持しつつ、別名の属性へ評価結果を反映します。
   *
   * @param rawName 生の属性名
   * @param targetName 反映先の属性名
   * @param value 生の属性値
   * @returns 属性更新の Promise
   */
  public setAliasedAttribute(
    rawName: string,
    targetName: string,
    value: string | null,
    fromObserver = false,
  ): Promise<void> {
    return this.setAttributeInternal(
      rawName,
      targetName,
      value,
      false,
      fromObserver,
    );
  }

  /**
   * data-attr-* の生属性と反映先属性を同時に削除します。
   *
   * @param rawName 生の属性名
   * @param targetName 反映先の属性名
   * @returns 属性削除の Promise
   */
  public removeAliasedAttribute(
    rawName: string,
    targetName: string,
  ): Promise<void> {
    if (this.skipMutationAttributes) {
      return Promise.resolve();
    }
    this.attributeMap.delete(rawName);
    this.skipMutationAttributes = true;
    const element = this.getTarget();
    return Queue.enqueue(() => {
      element.removeAttribute(rawName);
      if (targetName !== rawName) {
        element.removeAttribute(targetName);
      }
    }).finally(() => {
      this.skipMutationAttributes = false;
    }) as Promise<void>;
  }

  /**
   * 生の属性値を保持しつつ、必要に応じて別名属性へ評価結果を反映します。
   *
   * @param rawName 生の属性名
   * @param targetName 反映先の属性名
   * @param value 生の属性値
   * @param syncValueProperty value 属性更新時に DOM property も同期するかどうか
   * @returns 属性更新の Promise
   */
  private setAttributeInternal(
    rawName: string,
    targetName: string,
    value: string | null,
    syncValueProperty: boolean,
    fromObserver = false,
  ): Promise<void> {
    if (this.skipMutationAttributes) {
      return Promise.resolve();
    }
    if (value === null) {
      if (rawName === targetName) {
        return this.removeAttribute(rawName);
      }
      return this.removeAliasedAttribute(rawName, targetName);
    }
    const contents = new AttributeContents(rawName, value);
    if (fromObserver) {
      // MutationObserver経由の書き戻し（展開済み値）でテンプレート式を含む既存エントリを上書きしない。
      // （例: href="...{{customerCode}}..." が展開された後にObserverが展開済み値を再セットするのを防ぐ）
      const existing = this.attributeMap.get(rawName);
      if (
        existing &&
        (existing.isEvaluate || existing.isForceEvaluation()) &&
        !contents.isEvaluate &&
        !contents.isForceEvaluation()
      ) {
        this.skipMutationAttributes = true;
        return Queue.enqueue(() => {}).finally(() => {
          this.skipMutationAttributes = false;
        }) as Promise<void>;
      }
    }
    this.attributeMap.set(rawName, contents);
    const element = this.getTarget();
    const detail = contents.evaluateDetailed(this.getBindingData(), {
      kind: 'attribute',
      element,
      rawName,
      template: value,
    });
    const hasTemplateExpression = contents.isEvaluate || contents.isRawEvaluate;
    const isBooleanAttribute =
      rawName === targetName &&
      ElementFragment.BOOLEAN_ATTRIBUTES.has(targetName.toLowerCase());
    const isSingleExpression = contents.isSingleExpression();
    const joinedValue = TextContents.joinEvaluateResults(detail.results);
    const evaluatedValue =
      detail.results.length === 1 ? detail.results[0] : joinedValue;
    const shouldRemoveTarget =
      !contents.isForceEvaluation() &&
      (targetName !== rawName
        ? detail.hasUnresolvedReference ||
          evaluatedValue === null ||
          evaluatedValue === undefined ||
          evaluatedValue === false
        : isBooleanAttribute
          ? detail.hasUnresolvedReference ||
            evaluatedValue === null ||
            evaluatedValue === undefined ||
            evaluatedValue === false
          : isSingleExpression
            ? detail.hasUnresolvedReference ||
              evaluatedValue === null ||
              evaluatedValue === undefined ||
              evaluatedValue === false
            : hasTemplateExpression && joinedValue === '');
    const result = contents.isForceEvaluation()
      ? value
      : isSingleExpression
        ? evaluatedValue
        : joinedValue;
    const shouldSyncValueProperty =
      syncValueProperty &&
      contents.isEvaluate &&
      targetName === 'value' &&
      ((element instanceof HTMLInputElement &&
        this.INPUT_EVENT_TYPES.includes(element.type)) ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement);
    const stringResult =
      shouldRemoveTarget || result === null || result === false
        ? null
        : String(result);
    const requiresRawAttributeWrite =
      rawName !== targetName && element.getAttribute(rawName) !== value;
    const requiresTargetAttributeWrite =
      stringResult === null
        ? element.hasAttribute(targetName)
        : element.getAttribute(targetName) !== stringResult;
    const requiresValuePropertyWrite =
      shouldSyncValueProperty &&
      stringResult !== null &&
      element.value !== stringResult;
    if (
      !requiresRawAttributeWrite &&
      !requiresTargetAttributeWrite &&
      !requiresValuePropertyWrite
    ) {
      if (shouldSyncValueProperty && stringResult !== null) {
        this.value = stringResult;
      }
      return Promise.resolve();
    }
    this.skipMutationAttributes = true;
    return Queue.enqueue(() => {
      if (requiresRawAttributeWrite) {
        element.setAttribute(rawName, value);
      }
      if (stringResult === null) {
        element.removeAttribute(targetName);
      } else {
        if (requiresTargetAttributeWrite) {
          element.setAttribute(targetName, stringResult);
        }
        // element.setAttribute('value', ...) は defaultValue のみ更新するため、
        // setValue と同じ対象には element.value も反映して DOM と内部状態を揃える。
        if (shouldSyncValueProperty) {
          this.value = stringResult;
          if (requiresValuePropertyWrite) {
            element.value = stringResult;
          }
        }
      }
    }).finally(() => {
      this.skipMutationAttributes = false;
    }) as Promise<void>;
  }

  /**
   * 属性の値を削除します。
   *
   * @param name 属性名
   * @returns 属性の削除のPromise
   */
  public removeAttribute(name: string): Promise<void> {
    if (this.skipMutationAttributes) {
      return Promise.resolve();
    }
    this.attributeMap.delete(name);
    this.skipMutationAttributes = true;
    const element = this.getTarget();
    return Queue.enqueue(() => {
      element.removeAttribute(name);
    }).finally(() => {
      this.skipMutationAttributes = false;
    }) as Promise<void>;
  }

  /**
   * 属性の評価された値を取得します。
   * 複数の評価値がある場合は結合して返します。
   *
   * @param name 属性名
   * @returns 評価された値
   */
  public getAttribute(name: string): string | false | unknown | null {
    const detail = this.getAttributeEvaluation(name);
    return detail?.value ?? null;
  }

  /**
   * 属性の評価値と未解決参照の有無を取得します。
   *
   * @param name 属性名
   * @returns 属性評価の詳細。属性が存在しない場合は null
   */
  public getAttributeEvaluation(
    name: string,
  ): AttributeEvaluationDetail | null {
    const contents = this.attributeMap.get(name);
    if (contents === undefined) {
      return null;
    }
    const detail = contents.evaluateDetailed(this.getBindingData(), {
      kind: 'attribute',
      element: this.getTarget(),
      rawName: name,
      template: contents.getValue(),
    });
    if (detail.results.length === 1) {
      return {
        value: detail.results[0],
        hasUnresolvedReference: detail.hasUnresolvedReference,
      };
    }
    return {
      value: TextContents.joinEvaluateResults(detail.results),
      hasUnresolvedReference: detail.hasUnresolvedReference,
    };
  }

  /**
   * 属性の生の値を取得します。
   *
   * @param name 属性名
   * @returns 生の属性値
   */
  public getRawAttribute(name: string): string | null {
    const contents = this.attributeMap.get(name);
    if (contents === undefined) {
      return null;
    }
    return contents.getValue();
  }

  /**
   * 属性名のリストを取得します。
   *
   * @return 属性名のリスト
   */
  public getAttributeNames(): string[] {
    return Array.from(this.attributeMap.keys());
  }

  /**
   * 属性の有無を確認します。
   *
   * @param name 属性名
   * @returns 属性の有無
   */
  public hasAttribute(name: string): boolean {
    return this.attributeMap.has(name);
  }

  /**
   * DOM上の順序から、参照フラグメントに対応する children 配列の挿入位置を推定します。
   *
   * @param referenceChild 参照フラグメント
   * @param insertAfter 参照位置の後ろに挿入するかどうか
   * @returns 挿入位置。解決できない場合はnull
   */
  private resolveInsertionPointFromDom(
    referenceChild: Fragment,
    insertAfter: boolean,
  ): {index: number; referenceNode: Node | null} | null {
    const referenceNode = referenceChild.getTarget();
    if (referenceNode.parentNode !== this.target) {
      return null;
    }

    const insertionReferenceNode = insertAfter
      ? referenceNode.nextSibling
      : referenceNode;

    let nextTrackedNode = insertAfter
      ? referenceNode.nextSibling
      : referenceNode;
    while (nextTrackedNode !== null) {
      const childFragment = Fragment.get(nextTrackedNode);
      if (childFragment !== null) {
        const childIndex = this.children.indexOf(childFragment);
        if (childIndex !== -1) {
          return {index: childIndex, referenceNode: insertionReferenceNode};
        }
      }
      nextTrackedNode = nextTrackedNode.nextSibling;
    }

    return {index: this.children.length, referenceNode: insertionReferenceNode};
  }

  /**
   * 子ノードを参照ノードの前に挿入します。
   * 参照ノードがnullの場合、親の最後に追加されます。
   *
   * @param newChild 新しい子ノード
   * @param referenceChild 参照ノード
   * @return 挿入のPromise
   */
  public insertBefore(
    newChild: Fragment,
    referenceChild: Fragment | null,
    referenceNodeOverride?: Node | null,
  ): Promise<void> {
    if (this.skipMutationNodes) {
      return Promise.resolve();
    }

    // 循環参照チェック
    if (newChild === this) {
      Log.error('[Haori]', 'Cannot insert element as child of itself');
      return Promise.reject(new Error('Self-insertion not allowed'));
    }

    // 祖先チェック
    const ancestors = new Set<Fragment>();
    let ancestor = this.parent;
    while (ancestor) {
      ancestors.add(ancestor);
      ancestor = ancestor.getParent();
    }
    if (ancestors.has(newChild)) {
      Log.error('[Haori]', 'Cannot create circular reference');
      return Promise.reject(new Error('Circular reference detected'));
    }

    // 同じ親内での移動かどうかを確認
    const isSameParent = newChild.getParent() === this;
    let newChildIndex = -1;
    let referenceIndex = -1;

    if (isSameParent) {
      newChildIndex = this.children.indexOf(newChild);
      if (referenceChild !== null) {
        referenceIndex = this.children.indexOf(referenceChild);
      }
    }

    const newChildParent = newChild.getParent();
    if (newChildParent !== null) {
      // 既存の親から削除
      newChildParent.removeChild(newChild);
    }

    let referenceNode: Node | null =
      referenceNodeOverride === undefined
        ? referenceChild?.getTarget() || null
        : referenceNodeOverride;

    if (referenceChild === null) {
      this.children.push(newChild);
    } else {
      let index: number;
      if (isSameParent) {
        // 同じ親内での移動の場合、削除後のインデックスを調整
        if (newChildIndex !== -1 && newChildIndex < referenceIndex) {
          // 削除する要素が参照要素より前にあった場合、インデックスは1つ減る
          index = referenceIndex - 1;
        } else {
          index = referenceIndex;
        }
      } else {
        index = this.children.indexOf(referenceChild);
      }

      if (index === -1) {
        const insertionPoint = this.resolveInsertionPointFromDom(
          referenceChild,
          false,
        );
        if (insertionPoint === null) {
          Log.warn(
            '[Haori]',
            'Reference child not found in children.',
            referenceChild,
          );
          this.children.push(newChild);
        } else {
          this.children.splice(insertionPoint.index, 0, newChild);
          referenceNode = insertionPoint.referenceNode;
        }
      } else {
        this.children.splice(index, 0, newChild);
      }
    }

    newChild.setParent(this);
    newChild.setMounted(this.mounted);

    const prevSkip = this.skipMutationNodes;
    this.skipMutationNodes = true;
    return Queue.enqueue(() => {
      this.target.insertBefore(newChild.getTarget(), referenceNode);
    }).finally(() => {
      this.skipMutationNodes = prevSkip;
    }) as Promise<void>;
  }

  /**
   * 指定した参照ノードの後に子ノードを挿入します。
   *
   * @param newChild 子ノード
   * @param referenceChild 参照ノード
   * @returns 挿入のPromise
   */
  public insertAfter(
    newChild: Fragment,
    referenceChild: Fragment | null,
  ): Promise<void> {
    if (referenceChild == null) {
      return this.insertBefore(newChild, null);
    }
    const index = this.children.indexOf(referenceChild);
    if (index === -1) {
      const insertionPoint = this.resolveInsertionPointFromDom(
        referenceChild,
        true,
      );
      if (insertionPoint === null) {
        Log.warn(
          '[Haori]',
          'Reference child not found in children.',
          referenceChild,
        );
        return this.insertBefore(newChild, null);
      }
      return this.insertBefore(
        newChild,
        this.children[insertionPoint.index] || null,
        insertionPoint.referenceNode,
      );
    }
    return this.insertBefore(newChild, this.children[index + 1] || null);
  }

  /**
   * 前のエレメントフラグメントを取得します。
   * 存在しない場合はnullを返します。
   *
   * @return 前のエレメントフラグメントまたはnull
   */
  public getPrevious(): ElementFragment | null {
    const parent = this.getParent();
    if (parent === null) {
      return null;
    }
    const siblings = parent.getChildElementFragments();
    const index = siblings.indexOf(this);
    if (index <= 0) {
      return null;
    }
    return siblings[index - 1];
  }

  /**
   * 次のエレメントフラグメントを取得します。
   * 存在しない場合はnullを返します。
   *
   * @return 次のエレメントフラグメントまたはnull
   */
  public getNext(): ElementFragment | null {
    const parent = this.getParent();
    if (parent === null) {
      return null;
    }
    const siblings = parent.getChildElementFragments();
    const index = siblings.indexOf(this);
    if (index < 0 || index + 1 >= siblings.length) {
      return null;
    }
    return siblings[index + 1];
  }

  /**
   * 表示状態を返します。
   *
   * @returns 表示状態
   */
  public isVisible(): boolean {
    return this.visible;
  }

  /**
   * エレメントを非表示にします。
   *
   * @returns エレメントの非表示のPromise
   */
  public hide(): Promise<void> {
    if (!this.visible) {
      return Promise.resolve();
    }
    this.visible = false;
    const target = this.getTarget();
    this.display = target.style.getPropertyValue('display');
    this.displayPriority = target.style.getPropertyPriority('display');
    target.style.setProperty('display', 'none', 'important');
    target.setAttribute(`${Env.prefix}if-false`, '');
    return Promise.resolve();
  }

  /**
   * エレメントを表示します。
   *
   * @return エレメントの表示のPromise
   */
  public show(): Promise<void> {
    if (this.visible) {
      return Promise.resolve();
    }
    const target = this.getTarget();
    if (this.display === null || this.display === '') {
      target.style.removeProperty('display');
    } else {
      target.style.setProperty(
        'display',
        this.display,
        this.displayPriority ?? '',
      );
    }
    this.display = null;
    this.displayPriority = null;
    target.removeAttribute(`${Env.prefix}if-false`);
    this.visible = true;
    return Promise.resolve();
  }

  /**
   * 指定した属性名を持つ最も近い親要素を返します。
   * 見つからない場合はnullを返します。
   *
   * @param name 属性名
   * @returns 最も近い親要素またはnull
   */
  public closestByAttribute(name: string): ElementFragment | null {
    if (this.hasAttribute(name)) {
      return this;
    }
    const parent = this.getParent();
    if (parent === null) {
      return null;
    }
    return parent.closestByAttribute(name);
  }
}

/**
 * テキストフラグメント。
 * テキストノードを表現します。
 */
export class TextFragment extends Fragment {
  /** 未評価のテキスト文字列 */
  private text: string;

  /** コンテンツ */
  private contents: TextContents;

  /** 更新スキップフラグ（オブザーバーによる無限ループ対応） */
  private skipMutation = false;

  /** 直近に描画した文字列 */
  private renderedText: string | null = null;

  /**
   * テキストフラグメントのコンストラクタ。
   * 対象テキストノードの内容を初期化します。
   *
   * @param target 対象テキストノード
   */
  public constructor(target: Text) {
    super(target);
    this.text = target.textContent || '';
    this.contents = new TextContents(this.text);
  }

  /**
   * フラグメントをクローンします。
   *
   * @returns クローンされたフラグメント
   */
  public clone(): TextFragment {
    const clone = new TextFragment(this.target.cloneNode(true) as Text);
    clone.mounted = false;
    clone.text = this.text;
    clone.contents = this.contents;
    clone.renderedText = this.renderedText;
    return clone;
  }

  /**
   * フラグメントの対象ノードを取得します。
   *
   * @returns フラグメントの対象ノード
   */
  public getTarget(): Text {
    return this.target as Text;
  }

  /**
   * テキストに評価式が含まれているかどうかを返します。
   *
   * @returns 評価式を含むなら true
   */
  public hasDynamicContent(): boolean {
    return this.contents.isEvaluate || this.contents.isRawEvaluate;
  }

  /**
   * コンテンツを更新します。
   *
   * @param text テキスト
   * @returns 更新のPromise
   */
  public setContent(text: string): Promise<void> {
    if (this.skipMutation || this.text === text) {
      return Promise.resolve();
    }
    this.text = text;
    this.contents = new TextContents(text);
    return this.evaluate();
  }

  /**
   * フラグメントを評価します。
   *
   * @returns 評価結果のPromise
   */
  public evaluate(): Promise<void> {
    if (this.contents.isRawEvaluate && this.parent === null) {
      return Promise.reject(
        new Error('Parent fragment is required for raw evaluation'),
      );
    }
    return Queue.enqueue(() => {
      this.skipMutation = true;
      let nextText = this.text;
      if (this.contents.isRawEvaluate) {
        nextText = this.contents.evaluate(
          this.parent!.getBindingData(),
          {
            kind: 'text',
            element: this.parent!.getTarget(),
            childIndex: this.parent!.getChildren().indexOf(this),
            template: this.text,
          },
        )[0] as string;
      } else if (this.contents.isEvaluate) {
        nextText = TextContents.joinEvaluateResults(
          this.contents.evaluate(this.parent!.getBindingData(), {
            kind: 'text',
            element: this.parent!.getTarget(),
            childIndex: this.parent!.getChildren().indexOf(this),
            template: this.text,
          }),
        );
      }
      const currentText = this.contents.isRawEvaluate
        ? this.parent!.getTarget().innerHTML
        : this.target.textContent || '';
      if (this.renderedText === nextText && currentText === nextText) {
        return;
      }
      if (this.contents.isRawEvaluate) {
        this.parent!.getTarget().innerHTML = nextText;
      } else {
        this.target.textContent = nextText;
      }
      this.renderedText = nextText;
    }).finally(() => {
      this.skipMutation = false;
    }) as Promise<void>;
  }
}

/**
 * コメントフラグメント。
 * コメントノードを表現します。
 */
export class CommentFragment extends Fragment {
  /** コメント文字列 */
  private text: string;

  /** 更新スキップフラグ（オブザーバーによる無限ループ対応） */
  private skipMutation = false;

  /**
   * コメントフラグメントのコンストラクタ。
   * 対象コメントノードの内容を初期化します。
   *
   * @param target 対象コメントノード
   */
  public constructor(target: Comment) {
    super(target);
    this.text = target.textContent || '';
  }

  /**
   * フラグメントをクローンします。
   *
   * @returns クローンされたフラグメント
   */
  public clone(): Fragment {
    const clone = new CommentFragment(this.target.cloneNode(true) as Comment);
    clone.mounted = false;
    clone.text = this.text;
    return clone;
  }

  /**
   * フラグメントの対象ノードを取得します。
   *
   * @returns フラグメントの対象ノード
   */
  public getTarget(): Comment {
    return this.target as Comment;
  }

  /**
   * コンテンツを更新します。
   *
   * @param text テキスト
   * @return 更新のPromise
   */
  public setContent(text: string): Promise<void> {
    if (this.skipMutation || this.text === text) {
      return Promise.resolve();
    }
    this.text = text;
    return Queue.enqueue(() => {
      this.skipMutation = true;
      this.target.textContent = this.text;
    }).finally(() => {
      this.skipMutation = false;
    }) as Promise<void>;
  }
}

/**
 * 値の種別。
 */
enum ExpressionType {
  /** テキスト */
  TEXT,

  /** 評価式 */
  EXPRESSION,

  /** 生の評価式 */
  RAW_EXPRESSION,
}

/**
 * コンテンツのインターフェース。
 */
interface Content {
  /** コンテンツの内容 */
  text: string;

  /** 値の種別 */
  type: ExpressionType;
}

/**
 * テキストコンテンツを管理するクラスです。
 * 一度生成されると内部は変更しません。
 */
class TextContents {
  /** プレースホルダ検出用の正規表現 */
  protected static readonly PLACEHOLDER_REGEX =
    /\{\{\{([\s\S]+?)\}\}\}|\{\{([\s\S]+?)\}\}/g;

  /**
   * 評価結果を結合して文字列にします。
   *
   * @param contents 評価結果の配列
   * @returns 結合された文字列
   */
  public static joinEvaluateResults(contents: unknown[] | null): string {
    if (contents === null || contents.length === 0) {
      return '';
    }
    return contents
      .map(c => {
        if (c === null || c === undefined || c === false || Number.isNaN(c)) {
          return '';
        } else if (typeof c !== 'string') {
          return String(c);
        } else {
          return c;
        }
      })
      .join('');
  }

  /** コンテンツのリスト */
  protected readonly contents: Content[] = [];

  /** 評価式が含まれるかどうか */
  public readonly isEvaluate: boolean = false;

  /** 生の評価式が含まれるかどうか */
  public readonly isRawEvaluate: boolean = false;

  /** 評価前の値 */
  private readonly value: string;

  /**
   * コンストラクタ。
   *
   * @param text テキスト
   */
  constructor(text: string) {
    this.value = text;

    const matches = [...text.matchAll(TextContents.PLACEHOLDER_REGEX)];
    let lastIndex = 0;

    let hasEvaluate = false;
    let hasRawEvaluate = false;
    for (const match of matches) {
      // プレースホルダ前の通常テキスト
      if (match.index > lastIndex) {
        this.contents.push({
          text: text.slice(lastIndex, match.index),
          type: ExpressionType.TEXT,
        });
      }
      // プレースホルダ本体
      const content = {
        text: match[1] ?? match[2],
        type: match[1]
          ? ExpressionType.RAW_EXPRESSION
          : ExpressionType.EXPRESSION,
      };
      hasEvaluate = true;
      hasRawEvaluate =
        hasRawEvaluate || content.type === ExpressionType.RAW_EXPRESSION;
      this.contents.push(content);
      lastIndex = match.index! + match[0].length;
    }
    // 最後のプレースホルダ以降の通常テキスト
    if (lastIndex < text.length) {
      this.contents.push({
        text: text.slice(lastIndex),
        type: ExpressionType.TEXT,
      });
    }
    this.isEvaluate = hasEvaluate;
    this.isRawEvaluate = hasRawEvaluate;
    this.checkRawExpressions();
  }

  /**
   * 評価前の値を取得します。
   *
   * @returns 評価前の値
   */
  public getValue(): string {
    return this.value;
  }

  /**
   * 単体プレースホルダのみで構成されているかどうかを返します。
   *
   * @returns 単体プレースホルダなら true
   */
  public isSingleExpression(): boolean {
    return (
      this.contents.length === 1 &&
      (this.contents[0].type === ExpressionType.EXPRESSION ||
        this.contents[0].type === ExpressionType.RAW_EXPRESSION)
    );
  }

  /**
   * RAW_EXPRESSION のチェックを行います。
   */
  protected checkRawExpressions(): void {
    for (let i = 0; i < this.contents.length; i++) {
      const content = this.contents[i];
      if (
        content.type === ExpressionType.RAW_EXPRESSION &&
        this.contents.length > 1
      ) {
        Log.error(
          '[Haori]',
          'Raw expressions are not allowed in multi-content expressions.',
        );
        this.contents[i].type = ExpressionType.EXPRESSION;
      }
    }
  }

  /**
   * 式評価を行い、結果を返します。
   *
   * @param bindingValues バインディングされた値のオブジェクト
   * @returns 評価結果のリスト
   */
  public evaluate(
    bindingValues: Record<string, unknown>,
    profileContext?: EvaluationProfileContext,
  ): unknown[] {
    return this.evaluateDetailed(bindingValues, profileContext).results;
  }

  /**
   * 式評価を行い、未解決参照の有無を含む結果を返します。
   *
   * @param bindingValues バインディングされた値のオブジェクト
   * @returns 評価結果と未解決参照の有無
   */
  public evaluateDetailed(
    bindingValues: Record<string, unknown>,
    profileContext?: EvaluationProfileContext,
  ): {
    results: unknown[];
    hasUnresolvedReference: boolean;
  } {
    if (!this.isEvaluate && !this.isRawEvaluate) {
      return {
        results: this.contents.map(c => c.text),
        hasUnresolvedReference: false,
      };
    }
    return this.evaluateWithProfile(
      bindingValues,
      profileContext,
      content =>
        content.type === ExpressionType.EXPRESSION ||
        content.type === ExpressionType.RAW_EXPRESSION,
      'text',
    );
  }

  /**
   * 式評価と profiler 記録をまとめて実行します。
   *
   * @param bindingValues バインディングされた値のオブジェクト
   * @param profileContext profiler 用コンテキスト
   * @param shouldEvaluate 評価対象判定
   * @param errorKind エラーログ種別
   * @returns 評価結果と未解決参照の有無
   */
  protected evaluateWithProfile(
    bindingValues: Record<string, unknown>,
    profileContext: EvaluationProfileContext | undefined,
    shouldEvaluate: (content: Content) => boolean,
    errorKind: 'text' | 'attribute',
  ): {
    results: unknown[];
    hasUnresolvedReference: boolean;
  } {
    const results: unknown[] = [];
    const profileExpressions: Array<{expression: string; durationMs: number}> =
      [];
    let totalDurationMs = 0;
    let hasUnresolvedReference = false;
    this.contents.forEach(content => {
      try {
        if (shouldEvaluate(content)) {
          const measured = EvaluationProfileRegistry.measure(() =>
            Expression.evaluateDetailed(content.text, bindingValues),
          );
          const result = measured.value;
          totalDurationMs += measured.durationMs;
          profileExpressions.push({
            expression: content.text,
            durationMs: measured.durationMs,
          });
          hasUnresolvedReference =
            hasUnresolvedReference || result.unresolvedReference;
          results.push(result.value);
        } else {
          results.push(content.text);
        }
      } catch (error) {
        Log.error(
          '[Haori]',
          `Error evaluating ${errorKind} expression: ${content.text}`,
          error,
        );
        profileExpressions.push({
          expression: content.text,
          durationMs: 0,
        });
        results.push('');
      }
    });
    EvaluationProfileRegistry.record(
      profileContext,
      profileExpressions,
      totalDurationMs,
    );
    return {results, hasUnresolvedReference};
  }
}

/**
 * 属性のコンテンツを管理するクラスです。
 * 一度生成されると内部は変更しません。
 */
class AttributeContents extends TextContents {
  /** 強制評価する属性名 */
  private static readonly FORCE_EVALUATION_ATTRIBUTES = [
    'data-if',
    'hor-if',
    'data-each',
    'hor-each',
    'data-derive',
    'hor-derive',
  ];

  /** 強制評価フラグ（プレースホルダでなくても評価する） */
  private readonly forceEvaluation: boolean;

  /**
   * コンストラクタ。
   *
   * @param name 属性名
   * @param text 属性値
   */
  constructor(name: string, value: string) {
    super(value);
    this.forceEvaluation =
      AttributeContents.FORCE_EVALUATION_ATTRIBUTES.includes(name);
  }

  /**
   * 強制評価フラグを取得します。
   *
   * @returns 強制評価フラグ
   */
  public isForceEvaluation(): boolean {
    return this.forceEvaluation;
  }

  /**
   * 式評価を行い、結果を返します。
   *
   * @param bindingValues バインディングされた値のオブジェクト
   * @returns 評価結果のリスト
   */
  public evaluate(
    bindingValues: Record<string, unknown>,
    profileContext?: EvaluationProfileContext,
  ): unknown[] {
    return this.evaluateDetailed(bindingValues, profileContext).results;
  }

  /**
   * 式評価を行い、未解決参照の有無を含む結果を返します。
   *
   * @param bindingValues バインディングされた値のオブジェクト
   * @returns 評価結果と未解決参照の有無
   */
  public evaluateDetailed(
    bindingValues: Record<string, unknown>,
    profileContext?: EvaluationProfileContext,
  ): {
    results: unknown[];
    hasUnresolvedReference: boolean;
  } {
    if (!this.isEvaluate && !this.forceEvaluation) {
      return {
        results: this.contents.map(c => c.text),
        hasUnresolvedReference: false,
      };
    }
    const detail = this.evaluateWithProfile(
      bindingValues,
      profileContext,
      content =>
        (this.forceEvaluation && content.type === ExpressionType.TEXT) ||
        content.type === ExpressionType.EXPRESSION ||
        content.type === ExpressionType.RAW_EXPRESSION,
      'attribute',
    );
    if (this.forceEvaluation && detail.results.length > 1) {
      Log.error(
        '[Haori]',
        'each or if expressions must have a single content.',
        detail.results,
      );
      return {
        results: [detail.results[0]],
        hasUnresolvedReference: detail.hasUnresolvedReference,
      };
    }
    return detail;
  }
}
