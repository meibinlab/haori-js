/**
 * @fileoverview Core機能
 *
 * Fragmentの管理、属性変化の監視、条件分岐・繰り返し処理など、
 * アプリケーションの中心的な機能を提供します。
 */
import Env from './env';
import Dev from './dev';
import Expression from './expression';
import Form from './form';
import Fragment, {ElementFragment, TextFragment} from './fragment';
import Log from './log';
import Procedure from './procedure';
import Url from './url';
import {Import} from './import';
import Queue from './queue';
import HaoriEvent from './event';

interface ReactiveFetchState {
  lastSignature: string | null;
  running: boolean;
  rerunRequested: boolean;
}

interface ReactiveImportState {
  lastUrl: string | null;
  running: boolean;
  rerunRequested: boolean;
}

/** data-each の差分更新の再入制御状態 */
interface EachUpdateState {
  /** updateDiff が実行中かどうか */
  running: boolean;
  /** 実行中に再評価要求があったかどうか */
  rerunRequested: boolean;
}

type DerivedSubtreeSignatureSource = 'evaluateAll' | 'refresh';

interface DerivedSubtreeProfile {
  hostId: string;
  signatureComputeTotal: number;
  signatureComputeFromEvaluateAll: number;
  signatureComputeFromRefresh: number;
  skipHitCount: number;
  skipMissCount: number;
  skipIneligibleCount: number;
}

/**
 * アプリケーションの中心的な制御を行うクラスです。
 * Fragment の初期化、属性変化の処理、条件分岐・繰り返し処理を管理します。
 */
export default class Core {
  /** 属性エイリアスのサフィックス */
  private static readonly ATTRIBUTE_ALIAS_SUFFIX = 'attr-';

  /** 優先処理する属性のサフィックス（処理順序で定義） */
  private static readonly PRIORITY_ATTRIBUTE_SUFFIXES = [
    'bind',
    'url-param',
    'derive-name',
    'derive',
    'if',
    'each',
  ];

  /** 遅延処理する属性のサフィックス */
  private static readonly DEFERRED_ATTRIBUTE_SUFFIXES = ['fetch'];

  /** evaluateAll で再評価対象から除外する特殊属性のサフィックス */
  private static readonly EVALUATE_ALL_EXCLUDED_ATTRIBUTE_SUFFIXES = [
    'bind',
    'derive',
    'derive-name',
    'if',
    'each',
    'fetch',
    'import',
    'url-param',
  ];

  /** 属性内プレースホルダ検出用の正規表現 */
  private static readonly ATTRIBUTE_PLACEHOLDER_REGEX =
    /\{\{\{[\s\S]+?\}\}\}|\{\{[\s\S]+?\}\}/;

  /** data-fetch の自動再評価状態 */
  private static readonly REACTIVE_FETCH_STATES = new WeakMap<
    HTMLElement,
    ReactiveFetchState
  >();

  /** data-import の自動再評価状態 */
  private static readonly REACTIVE_IMPORT_STATES = new WeakMap<
    HTMLElement,
    ReactiveImportState
  >();

  /** data-derive subtree skip の開発用プロファイル */
  private static readonly DERIVE_SUBTREE_PROFILES = new WeakMap<
    ElementFragment,
    DerivedSubtreeProfile
  >();

  /** data-each の差分更新の再入制御状態 */
  private static readonly EACH_UPDATE_STATES = new WeakMap<
    ElementFragment,
    EachUpdateState
  >();

  /**
   * 遅延属性かどうか（完全名で判定）を判定します。
   *
   * @param name 属性名
   * @returns 遅延属性かどうか
   */
  private static isDeferredAttributeName(name: string): boolean {
    return Core.DEFERRED_ATTRIBUTE_SUFFIXES.some(
      suffix => name === `${Env.prefix}${suffix}`,
    );
  }

  /**
   * evaluateAll で再評価対象から除外する特殊属性かどうかを判定します。
   *
   * @param name 属性名
   * @returns 除外対象かどうか
   */
  private static isEvaluateAllExcludedAttributeName(name: string): boolean {
    return Core.EVALUATE_ALL_EXCLUDED_ATTRIBUTE_SUFFIXES.some(
      suffix => name === `${Env.prefix}${suffix}`,
    );
  }

  /**
   * evaluateAll で通常属性を再評価すべきかを判定します。
   *
   * @param name 属性名
   * @param value 属性の生値
   * @returns 再評価する場合は true
   */
  private static shouldReevaluateAttribute(
    name: string,
    value: string | null,
  ): boolean {
    return (
      value !== null &&
      !Core.isEvaluateAllExcludedAttributeName(name) &&
      Core.ATTRIBUTE_PLACEHOLDER_REGEX.test(value)
    );
  }

  /**
   * data-attr-* 形式の属性名から実際に更新する属性名を取得します。
   *
   * @param name 属性名
   * @returns 実際の属性名。data-attr-* でない場合は null
   */
  private static getAliasedAttributeName(name: string): string | null {
    const aliasPrefix = `${Env.prefix}${Core.ATTRIBUTE_ALIAS_SUFFIX}`;
    if (!name.startsWith(aliasPrefix) || name.length <= aliasPrefix.length) {
      return null;
    }
    return name.slice(aliasPrefix.length);
  }

  /**
   * 実属性の変更が data-attr-* の内部反映かどうかを判定します。
   *
   * @param element 対象要素
   * @param name 変更された属性名
   * @returns data-attr-* の内部反映なら true
   */
  public static isAliasedAttributeReflection(
    element: HTMLElement,
    name: string,
  ): boolean {
    const fragment = Fragment.get(element);
    if (!(fragment instanceof ElementFragment)) {
      return false;
    }
    return fragment.hasAttribute(
      `${Env.prefix}${Core.ATTRIBUTE_ALIAS_SUFFIX}${name}`,
    );
  }

  /**
   * プレースホルダを含む通常属性を再評価します。
   * 内部状態の更新は同期的に行い、DOM 反映は fragment 側の非同期更新に委ねます。
   *
   * @param fragment 対象フラグメント
   * @returns 再評価完了の Promise
   */
  private static reevaluateInterpolatedAttributes(
    fragment: ElementFragment,
  ): Promise<void> {
    let chain = Promise.resolve();
    for (const name of fragment.getAttributeNames()) {
      const rawValue = fragment.getRawAttribute(name);
      if (!Core.shouldReevaluateAttribute(name, rawValue)) {
        continue;
      }
      chain = chain.then(() =>
        Core.setAttribute(fragment.getTarget(), name, rawValue),
      );
    }
    return chain.then(() => undefined);
  }

  /**
   * 指定フラグメントの直下の子孫評価を再実行します。
   *
   * @param fragment 対象フラグメント
   * @returns 再評価完了の Promise
   */
  private static reevaluateChildren(fragment: ElementFragment): Promise<void> {
    const promises: Promise<void>[] = [];
    fragment.getChildren().forEach(child => {
      if (child instanceof ElementFragment) {
        promises.push(Core.evaluateAll(child));
      } else if (child instanceof TextFragment) {
        promises.push(Core.evaluateText(child));
      }
    });
    return Promise.all(promises).then(() => undefined);
  }

  /**
   * data-fetch の再評価状態を取得します。
   *
   * @param element 対象要素
   * @returns 再評価状態
   */
  private static getReactiveFetchState(
    element: HTMLElement,
  ): ReactiveFetchState {
    const existing = Core.REACTIVE_FETCH_STATES.get(element);
    if (existing) {
      return existing;
    }
    const state: ReactiveFetchState = {
      lastSignature: null,
      running: false,
      rerunRequested: false,
    };
    Core.REACTIVE_FETCH_STATES.set(element, state);
    return state;
  }

  /**
   * data-import の再評価状態を取得します。
   *
   * @param element 対象要素
   * @returns 再評価状態
   */
  private static getReactiveImportState(
    element: HTMLElement,
  ): ReactiveImportState {
    const existing = Core.REACTIVE_IMPORT_STATES.get(element);
    if (existing) {
      return existing;
    }
    const state: ReactiveImportState = {
      lastUrl: null,
      running: false,
      rerunRequested: false,
    };
    Core.REACTIVE_IMPORT_STATES.set(element, state);
    return state;
  }

  /**
   * bind 更新時に data-fetch / data-import を専用ルートで再評価します。
   *
   * @param fragment 対象フラグメント
   * @param skipFragments 再評価をスキップするフラグメント集合
   * @returns 再評価完了の Promise
   */
  private static reevaluateReactiveSpecialAttributes(
    fragment: ElementFragment,
    skipFragments: ReadonlySet<ElementFragment> = new Set(),
  ): Promise<void> {
    if (skipFragments.has(fragment)) {
      return Promise.resolve();
    }
    const promises: Promise<void>[] = [];
    if (fragment.hasAttribute(`${Env.prefix}fetch`)) {
      promises.push(Core.executeManagedFetch(fragment));
    }
    if (fragment.hasAttribute(`${Env.prefix}import`)) {
      promises.push(Core.executeManagedImport(fragment));
    }
    fragment.getChildren().forEach(child => {
      if (child instanceof ElementFragment) {
        promises.push(
          Core.reevaluateReactiveSpecialAttributes(child, skipFragments),
        );
      }
    });
    return Promise.all(promises).then(() => undefined);
  }

  /**
   * data-fetch をシグネチャ比較付きで実行します。
   *
   * @param fragment 対象フラグメント
   * @returns 実行完了の Promise
   */
  private static executeManagedFetch(fragment: ElementFragment): Promise<void> {
    const target = fragment.getTarget();
    const state = Core.getReactiveFetchState(target);
    const resolved = Procedure.resolveAutoFetchSignature(fragment);

    if (state.running) {
      if (
        resolved.hasUnresolvedReference ||
        resolved.signature !== state.lastSignature
      ) {
        state.rerunRequested = true;
      }
      return Promise.resolve();
    }

    if (resolved.hasUnresolvedReference || resolved.signature === null) {
      state.lastSignature = null;
      return Promise.resolve();
    }

    if (state.lastSignature === resolved.signature) {
      return Promise.resolve();
    }

    state.lastSignature = resolved.signature;
    state.running = true;
    return new Procedure(fragment, null)
      .runWithResult()
      .then(() => undefined)
      .finally(() => {
        state.running = false;
        if (state.rerunRequested) {
          state.rerunRequested = false;
          return Core.executeManagedFetch(fragment);
        }
        return undefined;
      });
  }

  /**
   * data-import を URL 比較付きで実行します。
   *
   * @param fragment 対象フラグメント
   * @returns 実行完了の Promise
   */
  private static executeManagedImport(
    fragment: ElementFragment,
  ): Promise<void> {
    const target = fragment.getTarget();
    const state = Core.getReactiveImportState(target);
    const importEvaluation = fragment.getAttributeEvaluation(
      `${Env.prefix}import`,
    );
    const resolvedUrl =
      importEvaluation &&
      !importEvaluation.hasUnresolvedReference &&
      typeof importEvaluation.value === 'string' &&
      importEvaluation.value !== ''
        ? importEvaluation.value
        : null;

    if (state.running) {
      if (resolvedUrl !== state.lastUrl) {
        state.rerunRequested = true;
      }
      return Promise.resolve();
    }

    if (resolvedUrl === null) {
      state.lastUrl = null;
      return Promise.resolve();
    }

    if (state.lastUrl === resolvedUrl) {
      return Promise.resolve();
    }

    state.lastUrl = resolvedUrl;
    state.running = true;
    const startedAt = performance.now();
    target.setAttribute(`${Env.prefix}importing`, '');
    HaoriEvent.importStart(target, resolvedUrl);

    return Import.load(resolvedUrl)
      .then(html => {
        const bytes = new TextEncoder().encode(html).length;
        return Queue.enqueue(() => {
          target.innerHTML = html;
        }).then(() => {
          target.removeAttribute(`${Env.prefix}importing`);
          HaoriEvent.importEnd(target, resolvedUrl, bytes, startedAt);
          if (!document.body.hasAttribute('data-haori-ready')) {
            const childPromises: Promise<void>[] = [];
            target.childNodes.forEach(node => {
              const child = Fragment.get(node);
              if (child instanceof ElementFragment) {
                childPromises.push(Core.scan(child.getTarget()));
              } else if (child instanceof TextFragment) {
                childPromises.push(Core.evaluateText(child));
              }
            });
            return Promise.all(childPromises).then(() => undefined);
          }
          return undefined;
        });
      })
      .catch(error => {
        target.removeAttribute(`${Env.prefix}importing`);
        HaoriEvent.importError(target, resolvedUrl, error);
        Log.error('[Haori]', 'Failed to import HTML:', resolvedUrl, error);
      })
      .finally(() => {
        state.running = false;
        if (state.rerunRequested) {
          state.rerunRequested = false;
          return Core.executeManagedImport(fragment);
        }
        return undefined;
      }) as Promise<void>;
  }

  /**
   * 指定された要素と、その子要素をスキャンし、Fragmentを生成します。
   *
   * @param element スキャン対象の要素
   * @returns Promise (スキャンが完了したときに解決される)
   */
  public static scan(element: HTMLElement): Promise<void> {
    const fragment = Fragment.get(element);
    if (!fragment) {
      return Promise.resolve();
    }
    return Core.initializeElementFragment(fragment, false);
  }

  /**
   * 新規 each 行を局所初期化します。
   * 既存 scan の属性順序を保ちつつ、Fragment 木を直接たどります。
   *
   * @param fragment 新規挿入された行フラグメント
   * @returns 初期化完了の Promise
   */
  private static initializeFreshEachRow(
    fragment: ElementFragment,
  ): Promise<void> {
    return Core.initializeElementFragment(fragment, true).then(() => {
      if (Core.needsScheduledEvaluateAll(fragment)) {
        Core.scheduleEvaluateAll(fragment);
      }
      return undefined;
    });
  }

  /**
   * ElementFragment とその子孫を初期化します。
   *
   * @param fragment 対象フラグメント
   * @param stopAtEach true の場合、data-each 要素では通常再帰を止める
   * @returns 初期化完了の Promise
   */
  private static initializeElementFragment(
    fragment: ElementFragment,
    stopAtEach: boolean,
  ): Promise<void> {
    Core.syncMountedState(fragment);
    if (stopAtEach && fragment.isFreshInitializationSkippable()) {
      return Promise.resolve();
    }
    return Core.initializeElementAttributes(fragment).then(() => {
      if (Core.shouldSkipChildInitialization(fragment, stopAtEach)) {
        Core.refreshDerivedSubtreeSignature(fragment);
        return undefined;
      }
      const childPromises: Promise<void>[] = [];
      fragment.getChildren().forEach(child => {
        if (child instanceof ElementFragment) {
          childPromises.push(Core.initializeElementFragment(child, stopAtEach));
        } else if (child instanceof TextFragment) {
          childPromises.push(Core.evaluateText(child));
        }
      });
      return Promise.all(childPromises).then(() => {
        Core.refreshDerivedSubtreeSignature(fragment);
        return undefined;
      });
    });
  }

  /**
   * 要素初期化時の mounted 状態を同期します。
   *
   * @param fragment 対象フラグメント
   */
  private static syncMountedState(fragment: ElementFragment): void {
    const parent = fragment.getParent();
    if (parent?.isMounted()) {
      fragment.setMounted(true);
      return;
    }
    const target = fragment.getTarget();
    if (target.parentNode && document.body.contains(target)) {
      fragment.setMounted(true);
      return;
    }
    fragment.setMounted(false);
  }

  /**
   * scan と fresh clone 初期化で共有する属性初期化を行います。
   *
   * @param fragment 対象フラグメント
   * @returns 属性初期化完了の Promise
   */
  private static initializeElementAttributes(
    fragment: ElementFragment,
  ): Promise<void> {
    let attributeChain = Promise.resolve();
    const processedAttributes = new Set<string>();
    for (const suffix of Core.PRIORITY_ATTRIBUTE_SUFFIXES) {
      // 優先属性の処理
      const name = Env.prefix + suffix;
      if (fragment.hasAttribute(name)) {
        attributeChain = attributeChain.then(() =>
          Core.setAttribute(
            fragment.getTarget(),
            name,
            fragment.getRawAttribute(name),
          ),
        );
        processedAttributes.add(name);
      }
    }
    for (const name of fragment.getAttributeNames()) {
      if (processedAttributes.has(name) || Core.isDeferredAttributeName(name)) {
        // すでに処理済みもしくは遅延処理の属性はスキップ
        continue;
      }
      const value = fragment.getRawAttribute(name);
      if (value !== null) {
        attributeChain = attributeChain.then(() =>
          Core.setAttribute(fragment.getTarget(), name, value),
        );
      }
    }
    for (const suffix of Core.DEFERRED_ATTRIBUTE_SUFFIXES) {
      // 遅延属性の処理
      const name = Env.prefix + suffix;
      if (fragment.hasAttribute(name)) {
        attributeChain = attributeChain.then(() =>
          Core.setAttribute(
            fragment.getTarget(),
            name,
            fragment.getRawAttribute(name),
          ),
        );
        processedAttributes.add(name);
      }
    }
    return attributeChain.then(() => undefined);
  }

  /**
   * 子孫初期化をスキップすべきかどうかを返します。
   *
   * @param fragment 対象フラグメント
   * @param stopAtEach true の場合、data-each 要素で通常再帰を止める
   * @returns 子孫初期化をスキップするなら true
   */
  private static shouldSkipChildInitialization(
    fragment: ElementFragment,
    stopAtEach: boolean,
  ): boolean {
    const condition = fragment.getAttribute(`${Env.prefix}if`);
    if (
      fragment.hasAttribute(`${Env.prefix}if`) &&
      Core.isHiddenIfCondition(condition)
    ) {
      return true;
    }
    return stopAtEach && fragment.hasAttribute(`${Env.prefix}each`);
  }

  /**
   * エレメントに属性を設定します。
   * 属性固有の処理も行います。
   *
   * @param element エレメント
   * @param name 属性名
   * @param value 属性値
   * @returns Promise (DOM操作が完了したときに解決される)
   */
  public static setAttribute(
    element: HTMLElement,
    name: string,
    value: string | null,
    fromObserver = false,
  ): Promise<void> {
    const fragment = Fragment.get(element);
    const aliasedAttributeName = Core.getAliasedAttributeName(name);
    if (aliasedAttributeName !== null) {
      if (value === null) {
        return fragment.removeAliasedAttribute(name, aliasedAttributeName);
      }
      return fragment.setAliasedAttribute(
        name,
        aliasedAttributeName,
        value,
        fromObserver,
      );
    }
    const promises: Promise<void>[] = [];
    let deriveChangedPromise: Promise<boolean> | null = null;
    let nextDeriveInputSignature: string | null = null;
    switch (name) {
      case `${Env.prefix}bind`: {
        if (value === null) {
          fragment.clearBindingDataCache();
          fragment.setBindingData({});
        } else {
          fragment.setBindingData(Core.parseDataBind(value));
        }
        break;
      }
      case `${Env.prefix}derive`:
        nextDeriveInputSignature = Core.createDeriveInputSignature(
          fragment,
          value,
          fragment.getRawAttribute(`${Env.prefix}derive-name`),
        );
        deriveChangedPromise = Core.evaluateDerive(
          fragment,
          value,
          fragment.getRawAttribute(`${Env.prefix}derive-name`),
        );
        promises.push(deriveChangedPromise.then(() => undefined));
        break;
      case `${Env.prefix}derive-name`:
        nextDeriveInputSignature = Core.createDeriveInputSignature(
          fragment,
          fragment.getRawAttribute(`${Env.prefix}derive`),
          value,
        );
        deriveChangedPromise = Core.evaluateDerive(
          fragment,
          fragment.getRawAttribute(`${Env.prefix}derive`),
          value,
        );
        promises.push(deriveChangedPromise.then(() => undefined));
        break;
      case `${Env.prefix}if`:
        promises.push(Core.evaluateIf(fragment));
        break;
      case `${Env.prefix}each`:
        promises.push(Core.evaluateEach(fragment));
        break;
      case `${Env.prefix}fetch`:
        promises.push(Core.executeManagedFetch(fragment));
        break;
      case `${Env.prefix}import`:
        if (typeof value === 'string') {
          promises.push(Core.executeManagedImport(fragment));
        }
        break;
      case `${Env.prefix}url-param`: {
        const arg = fragment.getAttribute(`${Env.prefix}url-arg`);
        const params = Url.readParams();
        if (arg === null) {
          promises.push(Core.setBindingData(element, params));
        } else {
          const data = fragment.getRawBindingData() || {};
          data[String(arg)] = params;
          promises.push(Core.setBindingData(element, data));
        }
        break;
      }
    }
    if (value === null) {
      promises.push(fragment.removeAttribute(name));
    } else {
      promises.push(fragment.setAttribute(name, value, fromObserver));
    }
    return Promise.all(promises)
      .then(() => {
        if (deriveChangedPromise !== null) {
          fragment.setDeriveInputSignature(nextDeriveInputSignature);
          return deriveChangedPromise.then(changed => {
            if (!changed) {
              return undefined;
            }
            return Core.reevaluateChildren(fragment);
          });
        }
        return undefined;
      })
      .then(() => undefined);
  }

  /**
   * エレメントに属性を設定し、評価を行います。
   *
   * @param element エレメント
   * @param name 属性名
   * @param value 属性値
   * @returns Promise (DOM操作が完了したときに解決される)
   */
  public static setBindingData(
    element: HTMLElement,
    data: Record<string, unknown>,
    skipFragments: ReadonlySet<ElementFragment> = new Set(),
  ): Promise<void> {
    const fragment = Fragment.get(element) as ElementFragment;
    const previous = fragment.getRawBindingData();
    fragment.setBindingData(data);
    let chain = fragment.setAttribute(
      `${Env.prefix}bind`,
      JSON.stringify(data),
    );
    if (element.tagName === 'FORM') {
      const arg = fragment.getAttribute(`${Env.prefix}form-arg`);
      const formValues =
        arg &&
        data[String(arg)] &&
        typeof data[String(arg)] === 'object' &&
        !Array.isArray(data[String(arg)])
          ? (data[String(arg)] as Record<string, unknown>)
          : arg
            ? {}
            : data;
      chain = chain.then(() => Form.syncValues(fragment, formValues));
    }
    chain = chain.then(() => Core.evaluateAll(fragment, skipFragments));
    chain = chain.then(() =>
      Core.reevaluateReactiveSpecialAttributes(fragment, skipFragments),
    );

    // bindchangeイベントを発火
    HaoriEvent.bindChange(element, previous, data, 'manual');

    return chain.then(() => undefined);
  }

  /**
   * data-bind 属性の値をパースします。
   *
   * @param data data-bind 属性の値
   * @returns パースされたデータオブジェクト
   */
  public static parseDataBind(data: string): Record<string, unknown> {
    if (data.startsWith('{') || data.startsWith('[')) {
      // JSONとしてパース
      try {
        return JSON.parse(data);
      } catch (e) {
        Log.error('[Haori]', 'Invalid JSON in data-bind:', e);
        return {};
      }
    } else {
      // URLSearchParamsでパース
      const params = new URLSearchParams(data);
      const result: Record<string, unknown> = {};
      for (const [key, value] of params.entries()) {
        if (result[key] !== undefined) {
          // すでに値がある場合は配列化
          if (Array.isArray(result[key])) {
            (result[key] as string[]).push(value);
          } else {
            result[key] = [result[key], value];
          }
        } else {
          result[key] = value;
        }
      }
      return result;
    }
  }

  /**
   * ノードを親要素に追加し評価を行います。
   *
   * @param parentElement 親エレメント
   * @param node 追加するノード
   */
  public static addNode(parentElement: HTMLElement, node: Node) {
    const parent = Fragment.get(parentElement);
    // skipMutationNodesが設定されている場合は処理をスキップ
    if (parent.isSkipMutationNodes()) {
      return;
    }
    const next = Fragment.get(node.nextSibling);
    const fragment = Fragment.get(node);
    if (fragment) {
      parent.insertBefore(fragment, next);
      if (fragment instanceof ElementFragment) {
        // 新規追加ノードは属性評価（bind/if/each/import など含む）のフルスキャンを行う。
        // これにより、取り込まれた断片内の data-import の入れ子や data-bind も正しく処理される。
        Core.scan(fragment.getTarget());
      } else if (fragment instanceof TextFragment) {
        Core.evaluateText(fragment);
      }
    }
  }

  /**
   * ノードを親要素から削除します。
   *
   * @param node 削除するノード
   */
  public static removeNode(node: Node) {
    const fragment = Fragment.get(node);
    if (fragment) {
      const parent = fragment.getParent();
      // skipMutationNodesが設定されている場合は処理をスキップ
      if (parent && parent.isSkipMutationNodes()) {
        return;
      }
      fragment.remove();
    }
  }

  /**
   * ノードのテキストを変更します。
   *
   * @param node 変更するノード
   * @param text 新しいテキスト
   */
  public static changeText(node: Text | Comment, text: string) {
    const fragment = Fragment.get(node);
    if (fragment) {
      fragment.setContent(text);
    }
  }

  /**
   * エレメントの値を変更します。
   * フォームの双方向バインディングを考慮し、フォームのバインドデータも更新します。
   *
   * @param element 変更するエレメント
   * @param value 新しい値
   * @returns Promise (DOM操作が完了したときに解決される)
   */
  public static changeValue(
    element: HTMLElement,
    value: string,
  ): Promise<void> {
    const fragment = Fragment.get(element);
    if (fragment.getValue() === value) {
      return Promise.resolve();
    }
    const promises: Promise<void>[] = [];
    promises.push(fragment.setValue(value));
    const formFragment = Core.getFormFragment(fragment);
    if (formFragment) {
      const values = Form.getValues(formFragment);
      const arg = formFragment.getAttribute(`${Env.prefix}form-arg`);
      let bindingData;
      if (arg) {
        bindingData = formFragment.getRawBindingData();
        if (!bindingData) {
          bindingData = {};
        }
        bindingData[String(arg)] = values;
      } else {
        bindingData = values;
      }
      promises.push(Core.setBindingData(formFragment.getTarget(), bindingData));
    }
    return Promise.all(promises).then(() => undefined);
  }

  /**
   * フォームフラグメントを取得します。
   *
   * @param fragment フラグメント
   * @returns フォームフラグメントまたはnull
   */
  private static getFormFragment(
    fragment: ElementFragment,
  ): ElementFragment | null {
    if (fragment.getTarget() instanceof HTMLFormElement) {
      return fragment;
    }
    const parent = fragment.getParent();
    if (parent) {
      return Core.getFormFragment(parent);
    }
    return null;
  }

  /**
   * フラグメントとその子要素を評価します。
   *
   * @param fragment 対象フラグメント
   * @return Promise (DOM操作が完了したときに解決される)
   */
  public static evaluateAll(
    fragment: ElementFragment,
    skipFragments: ReadonlySet<ElementFragment> = new Set(),
  ): Promise<void> {
    if (skipFragments.has(fragment)) {
      return Promise.resolve();
    }
    let chain = Core.reevaluateInterpolatedAttributes(fragment);
    const hasDerive = fragment.hasAttribute(`${Env.prefix}derive`);
    const hasIf = fragment.hasAttribute(`${Env.prefix}if`);
    const hasEach = fragment.hasAttribute(`${Env.prefix}each`);
    const deriveExpression = fragment.getRawAttribute(`${Env.prefix}derive`);
    const deriveName = fragment.getRawAttribute(`${Env.prefix}derive-name`);
    let shouldSkipDerivedSubtree = false;
    let shouldRecordDerivedSubtreeSignature = false;
    let nextDerivedSubtreeSignature: string | null = null;
    if (!hasDerive && fragment.getDeriveSubtreeSignature() !== null) {
      fragment.setDeriveSubtreeSignature(null);
    }
    if (!hasDerive && fragment.getDeriveInputSignature() !== null) {
      fragment.setDeriveInputSignature(null);
    }
    if (hasDerive) {
      const nextDeriveInputSignature = Core.createDeriveInputSignature(
        fragment,
        deriveExpression,
        deriveName,
      );
      if (nextDeriveInputSignature === null) {
        if (fragment.getDeriveInputSignature() !== null) {
          fragment.setDeriveInputSignature(null);
        }
        chain = chain.then(() =>
          Core.evaluateDerive(fragment, deriveExpression, deriveName).then(
            () => undefined,
          ),
        );
      } else if (
        fragment.getDeriveInputSignature() !== nextDeriveInputSignature
      ) {
        chain = chain.then(() => {
          return Core.evaluateDerive(
            fragment,
            deriveExpression,
            deriveName,
          ).then(() => {
            fragment.setDeriveInputSignature(nextDeriveInputSignature);
            return undefined;
          });
        });
      }
    }
    if (hasIf) {
      chain = chain.then(() => Core.evaluateIf(fragment));
    }
    if (hasEach) {
      if (fragment.getDeriveSubtreeSignature() !== null) {
        fragment.setDeriveSubtreeSignature(null);
      }
      return chain.then(() => Core.evaluateEach(fragment));
    }
    if (hasIf) {
      if (fragment.getDeriveSubtreeSignature() !== null) {
        fragment.setDeriveSubtreeSignature(null);
      }
      return chain.then(() => undefined);
    }
    if (hasDerive) {
      chain = chain.then(() => {
        if (!Core.canSkipStableDerivedSubtree(fragment)) {
          fragment.setDeriveSubtreeSignature(null);
          Core.logDerivedSubtreeProfileSnapshot(fragment, 'skip-ineligible');
          return;
        }
        nextDerivedSubtreeSignature = Core.createDescendantBindingSignature(
          fragment,
          'evaluateAll',
        );
        shouldRecordDerivedSubtreeSignature = true;
        shouldSkipDerivedSubtree =
          fragment.getDeriveSubtreeSignature() !== null &&
          fragment.getDeriveSubtreeSignature() === nextDerivedSubtreeSignature;
        Core.logDerivedSubtreeProfileSnapshot(
          fragment,
          shouldSkipDerivedSubtree ? 'skip-hit' : 'skip-miss',
        );
      });
    }
    return chain
      .then(() => {
        if (shouldSkipDerivedSubtree) {
          return undefined;
        }
        const promises: Promise<void>[] = [];
        fragment.getChildren().forEach(child => {
          if (child instanceof ElementFragment) {
            if (Core.canSkipUnchangedNestedEach(child)) {
              return;
            }
            promises.push(Core.evaluateAll(child, skipFragments));
          } else if (child instanceof TextFragment) {
            promises.push(Core.evaluateText(child));
          }
        });
        return Promise.all(promises).then(() => undefined);
      })
      .then(() => {
        if (
          shouldRecordDerivedSubtreeSignature &&
          nextDerivedSubtreeSignature !== null
        ) {
          fragment.setDeriveSubtreeSignature(nextDerivedSubtreeSignature);
        }
        return undefined;
      });
  }

  /**
   * data-derive / data-derive-name を評価し、子孫要素向けの派生値を更新します。
   *
   * @param fragment 対象フラグメント
   * @param deriveExpression 上書きする導出式
   * @param deriveName 上書きする導出名
   * @returns Promise (評価完了時に解決)
   */
  public static evaluateDerive(
    fragment: ElementFragment,
    deriveExpression: string | null = fragment.getRawAttribute(
      `${Env.prefix}derive`,
    ),
    deriveName: string | null = fragment.getRawAttribute(
      `${Env.prefix}derive-name`,
    ),
  ): Promise<boolean> {
    const previousDerivedBindingData = fragment.getRawDerivedBindingData();
    const normalizedName =
      typeof deriveName === 'string' ? deriveName.trim() : '';
    if (!deriveExpression || normalizedName === '') {
      if (previousDerivedBindingData === null) {
        return Promise.resolve(false);
      }
      fragment.setDerivedBindingData(null);
      return Promise.resolve(true);
    }
    const result = Expression.evaluateDetailed(
      deriveExpression,
      fragment.getBindingData(),
    );
    if (result.unresolvedReference) {
      if (previousDerivedBindingData === null) {
        return Promise.resolve(false);
      }
      fragment.setDerivedBindingData(null);
      return Promise.resolve(true);
    }
    const nextDerivedBindingData = {
      [normalizedName]: result.value,
    };
    if (
      Core.createBindingSignature(previousDerivedBindingData) ===
      Core.createBindingSignature(nextDerivedBindingData)
    ) {
      return Promise.resolve(false);
    }
    fragment.setDerivedBindingData(nextDerivedBindingData);
    return Promise.resolve(true);
  }

  /**
   * テキストフラグメントを評価します。
   *
   * @param fragment 対象フラグメント
   * @returns Promise (DOM操作が完了したときに解決される)
   */
  public static evaluateText(fragment: TextFragment): Promise<void> {
    return fragment.evaluate();
  }

  /**
   * data-if の評価値が「非表示」とみなされるかどうかを判定します。
   *
   * JavaScript の falsy 判定に準拠し、`false`・`null`・`undefined`・`NaN` に加えて
   * `0`・空文字列 `''` も非表示とします（例: `data-if="items.length"` は要素数 0 で
   * 非表示）。空配列 `[]` や空オブジェクト `{}` は JavaScript 同様 truthy なので表示されます。
   *
   * @param condition data-if の評価結果
   * @return 非表示とみなす場合は true
   */
  private static isHiddenIfCondition(condition: unknown): boolean {
    return !condition;
  }

  /**
   * if要素を評価します。
   * 値が falsy（false・null・undefined・NaN・0・空文字列）の場合は非表示にし、
   * それ以外の場合は表示します。
   *
   * @param fragment 対象フラグメント
   * @return Promise (DOM操作が完了したときに解決される)
   */
  public static evaluateIf(fragment: ElementFragment): Promise<void> {
    const promises: Promise<void>[] = [];
    const condition = fragment.getAttribute(`${Env.prefix}if`);
    if (Core.isHiddenIfCondition(condition)) {
      promises.push(
        fragment.hide().then(() => {
          HaoriEvent.hide(fragment.getTarget());
        }),
      );
    } else {
      // 非表示→表示への遷移を検出するため、show() 前の表示状態を退避する。
      const wasVisible = fragment.isVisible();
      const childPromises: Promise<void>[] = [];
      fragment.getChildren().forEach(child => {
        if (child instanceof ElementFragment) {
          // 未スキャンの子は scan で初期化し、既に表示済みの子は再評価だけ行う。
          childPromises.push(
            child.isMounted()
              ? Core.evaluateAll(child)
              : Core.scan(child.getTarget()),
          );
        } else if (child instanceof TextFragment) {
          childPromises.push(Core.evaluateText(child));
        }
      });
      promises.push(
        fragment.show().then(() => {
          HaoriEvent.show(fragment.getTarget());
          // 非表示→表示へ遷移したときだけ data-load-* を発火する。
          // ボタンや div などネイティブの load イベントが発生しない要素でも、
          // data-if による表示（haori:show）を契機に data-load-* を実行できるようにする。
          // 毎回の再評価で発火させると無限ループや過剰実行を招くため、遷移時に限定する。
          if (!wasVisible) {
            Core.triggerLoadOnShow(fragment);
          }
        }),
      );
      promises.push(Promise.all(childPromises).then(() => undefined));
    }
    return Promise.all(promises).then(() => undefined);
  }

  /**
   * data-if 表示時に data-load-* 手続きを発火します。
   *
   * 対象要素が data-load-* 属性を持つ場合のみ、load 種別の Procedure を1回実行します。
   * 結果は待機せず（fire-and-forget）、表示処理の完了をブロックしません。
   *
   * @param fragment 対象フラグメント
   * @return 戻り値はありません。
   */
  private static triggerLoadOnShow(fragment: ElementFragment): void {
    const loadPrefix = `${Env.prefix}load-`;
    const hasLoadAttribute = fragment
      .getTarget()
      .getAttributeNames()
      .some(name => name.startsWith(loadPrefix));
    if (!hasLoadAttribute) {
      return;
    }
    void new Procedure(fragment, 'load').run().catch(error => {
      Log.error('[Haori]', 'data-load procedure error (on show):', error);
    });
  }

  /**
   * data-each フラグメントの差分更新の再入制御状態を取得します。
   *
   * @param fragment 対象フラグメント
   * @return 再入制御状態
   */
  private static getEachUpdateState(
    fragment: ElementFragment,
  ): EachUpdateState {
    let state = Core.EACH_UPDATE_STATES.get(fragment);
    if (!state) {
      state = {running: false, rerunRequested: false};
      Core.EACH_UPDATE_STATES.set(fragment, state);
    }
    return state;
  }

  /**
   * each要素を評価します。
   * 非表示または未マウントの場合は処理をスキップします。
   *
   * 同一フラグメントに対する差分更新が並行・再入しないように直列化します。
   * 実行中に再度呼び出された場合は再評価要求だけを記録し、現在の更新完了後に
   * 最新データで一度だけ再実行します。これにより、bind 直後のリアクティブ再評価が
   * 重なっても data-each の描画が破壊されないようにします。
   *
   * @param fragment 対象フラグメント
   * @return 差分更新完了の Promise
   */
  public static evaluateEach(fragment: ElementFragment): Promise<void> {
    if (!fragment.isVisible() || !fragment.isMounted()) {
      return Promise.resolve();
    }
    const state = Core.getEachUpdateState(fragment);
    if (state.running) {
      // 実行中は再評価要求のみ記録し、完了後に最新データで再実行する。
      state.rerunRequested = true;
      return Promise.resolve();
    }
    state.running = true;
    return Core.performEachUpdate(fragment)
      .catch(error => {
        // updateDiff のエラーは呼び出し元へ伝播させつつ、ロックは finally で解除する。
        throw error;
      })
      .finally(() => {
        state.running = false;
        if (state.rerunRequested) {
          state.rerunRequested = false;
          // 実行中に届いた最新データで再評価する（戻り値は待たず fire-and-forget）。
          void Core.evaluateEach(fragment);
        }
      }) as Promise<void>;
  }

  /**
   * data-each の差分更新本体を実行します（再入制御は呼び出し側で行います）。
   *
   * @param fragment 対象フラグメント
   * @return 差分更新完了の Promise
   */
  private static performEachUpdate(fragment: ElementFragment): Promise<void> {
    const data = Core.resolveEachItems(fragment);
    if (data === null) {
      return Promise.reject(new Error('Invalid each attribute.'));
    }
    let template = fragment.getTemplate();
    const keyArg = fragment.getAttribute(`${Env.prefix}each-key`);
    const nextEachInputSignature = Core.createBindingSignature({
      key: keyArg ? String(keyArg) : null,
      items: data,
    });
    if (template === null) {
      // テンプレートの作成
      let found = false;
      fragment.getChildren().forEach(child => {
        if (found) {
          return;
        }
        if (child instanceof ElementFragment) {
          if (
            child.hasAttribute(`${Env.prefix}each-before`) ||
            child.hasAttribute(`${Env.prefix}each-after`)
          ) {
            return;
          }
          // 最初のElementFragmentをテンプレートとして採用
          template = child.clone();
          Core.markFreshInitializationSkippable(template);
          fragment.setTemplate(template);
          found = true;
          // 元のchildはchildrenから除外
          fragment.removeChild(child);
          // DOMからも必ず除去
          const templateTarget = child.getTarget();
          if (templateTarget.parentNode) {
            templateTarget.parentNode.removeChild(templateTarget);
          }
          child.setMounted(false);
        }
        // TextNodeやCommentNodeはテンプレートにならないので無視
      });
      // テンプレートのunmount完了後にupdateDiffを実行
      return this.updateDiff(fragment, data).then(() => {
        fragment.setEachInputSignature(nextEachInputSignature);
      });
    }
    if (fragment.getEachInputSignature() === nextEachInputSignature) {
      return Promise.resolve();
    }
    return this.updateDiff(fragment, data).then(() => {
      fragment.setEachInputSignature(nextEachInputSignature);
    });
  }

  /**
   * data-each 属性値を仕様に従って配列へ正規化します。
   *
   * @param fragment 対象フラグメント
   * @returns 配列。無効な場合は null
   */
  private static resolveEachItems(
    fragment: ElementFragment,
  ): (Record<string, unknown> | string | number)[] | null {
    const evaluation = fragment.getAttributeEvaluation(`${Env.prefix}each`);
    const data = evaluation?.value;
    if (
      evaluation?.hasUnresolvedReference ||
      data === false ||
      data === null ||
      data === undefined
    ) {
      return [];
    }
    if (Array.isArray(data)) {
      return data as (Record<string, unknown> | string | number)[];
    }
    Log.error('[Haori]', 'Invalid each attribute:', data);
    return null;
  }

  /**
   * nested data-each の入力が同値で、要素自身に他の動的要素が無い場合は
   * evaluateAll の子走査を省略できるかどうかを返します。
   *
   * @param fragment 判定対象フラグメント
   * @returns 省略可能なら true
   */
  private static canSkipUnchangedNestedEach(
    fragment: ElementFragment,
  ): boolean {
    if (!fragment.hasAttribute(`${Env.prefix}each`)) {
      return false;
    }
    if (fragment.getEachInputSignature() === null) {
      return false;
    }
    const parent = fragment.getParent();
    if (
      parent?.closestByAttribute(`${Env.prefix}derive`) ||
      parent?.closestByAttribute(`${Env.prefix}derive-name`) ||
      parent?.closestByAttribute(`${Env.prefix}if`) ||
      parent?.closestByAttribute(`${Env.prefix}fetch`) ||
      parent?.closestByAttribute(`${Env.prefix}import`)
    ) {
      return false;
    }
    if (Core.hasNonEachDynamicElementState(fragment)) {
      return false;
    }
    const data = Core.resolveEachItems(fragment);
    if (data === null) {
      return false;
    }
    const keyArg = fragment.getAttribute(`${Env.prefix}each-key`);
    const nextEachInputSignature = Core.createBindingSignature({
      key: keyArg ? String(keyArg) : null,
      items: data,
    });
    return fragment.getEachInputSignature() === nextEachInputSignature;
  }

  /**
   * data-derive subtree の入力が同値で、保守条件も満たす場合に
   * 子走査を省略できるかどうかを返します。
   *
   * @param fragment 判定対象フラグメント
   * @returns 省略可能なら true
   */
  private static canSkipStableDerivedSubtree(
    fragment: ElementFragment,
  ): boolean {
    if (!fragment.hasAttribute(`${Env.prefix}derive`)) {
      return false;
    }
    if (
      fragment.hasAttribute(`${Env.prefix}if`) ||
      fragment.hasAttribute(`${Env.prefix}each`) ||
      fragment.hasAttribute(`${Env.prefix}fetch`) ||
      fragment.hasAttribute(`${Env.prefix}import`)
    ) {
      return false;
    }
    return !Core.hasDisallowedDerivedSubtreeDescendant(fragment);
  }

  /**
   * data-derive subtree skip の初期 PoC で扱わない子孫要素を含むかを返します。
   *
   * @param fragment 判定対象フラグメント
   * @returns 含むなら true
   */
  private static hasDisallowedDerivedSubtreeDescendant(
    fragment: ElementFragment,
  ): boolean {
    return fragment.getChildren().some(child => {
      if (!(child instanceof ElementFragment)) {
        return false;
      }
      if (
        child.hasAttribute(`${Env.prefix}derive`) ||
        child.hasAttribute(`${Env.prefix}derive-name`) ||
        child.hasAttribute(`${Env.prefix}fetch`) ||
        child.hasAttribute(`${Env.prefix}import`)
      ) {
        return true;
      }
      return Core.hasDisallowedDerivedSubtreeDescendant(child);
    });
  }

  /**
   * data-derive host が子孫要素へ公開している binding の署名を返します。
   *
   * @param fragment 対象フラグメント
   * @returns binding 署名
   */
  private static createDescendantBindingSignature(
    fragment: ElementFragment,
    source: DerivedSubtreeSignatureSource,
  ): string {
    Core.recordDerivedSubtreeSignatureComputation(fragment, source);
    return Core.createBindingSignature(fragment.getDescendantBindingData());
  }

  /**
   * data-derive 実行前の入力署名を返します。
   *
   * @param fragment 対象フラグメント
   * @param deriveExpression 導出式
   * @param deriveName 導出名
   * @returns 入力署名。導出が無効なら null
   */
  private static createDeriveInputSignature(
    fragment: ElementFragment,
    deriveExpression: string | null,
    deriveName: string | null,
  ): string | null {
    const normalizedName =
      typeof deriveName === 'string' ? deriveName.trim() : '';
    if (!deriveExpression || normalizedName === '') {
      return null;
    }
    return Core.createBindingSignature({
      expression: deriveExpression,
      name: normalizedName,
      scope: fragment.getBindingData(),
    });
  }

  /**
   * data-derive subtree skip 用の署名を現在状態で更新します。
   *
   * @param fragment 対象フラグメント
   */
  private static refreshDerivedSubtreeSignature(
    fragment: ElementFragment,
  ): void {
    if (!Core.canSkipStableDerivedSubtree(fragment)) {
      fragment.setDeriveSubtreeSignature(null);
      Core.logDerivedSubtreeProfileSnapshot(fragment, 'skip-ineligible');
      return;
    }
    fragment.setDeriveSubtreeSignature(
      Core.createDescendantBindingSignature(fragment, 'refresh'),
    );
    Core.logDerivedSubtreeProfileSnapshot(fragment, 'refresh');
  }

  /**
   * data-derive subtree skip のプロファイルを取得または初期化します。
   *
   * @param fragment 対象フラグメント
   * @returns プロファイル
   */
  private static getOrCreateDerivedSubtreeProfile(
    fragment: ElementFragment,
  ): DerivedSubtreeProfile | null {
    if (!Dev.isEnabled() || !fragment.hasAttribute(`${Env.prefix}derive`)) {
      return null;
    }
    const existing = Core.DERIVE_SUBTREE_PROFILES.get(fragment);
    if (existing) {
      return existing;
    }
    const profile: DerivedSubtreeProfile = {
      hostId: Core.createDerivedSubtreeHostId(fragment),
      signatureComputeTotal: 0,
      signatureComputeFromEvaluateAll: 0,
      signatureComputeFromRefresh: 0,
      skipHitCount: 0,
      skipMissCount: 0,
      skipIneligibleCount: 0,
    };
    Core.DERIVE_SUBTREE_PROFILES.set(fragment, profile);
    return profile;
  }

  /**
   * data-derive subtree host の識別子を作成します。
   *
   * @param fragment 対象フラグメント
   * @returns host 識別子
   */
  private static createDerivedSubtreeHostId(
    fragment: ElementFragment,
  ): string {
    const segments: string[] = [];
    let current: ElementFragment | null = fragment;
    while (current) {
      const target = current.getTarget();
      if (!(target instanceof HTMLElement)) {
        break;
      }
      let segment = target.tagName.toLowerCase();
      if (target.id.trim() !== '') {
        segment += `#${target.id.trim()}`;
        segments.unshift(segment);
        break;
      }
      const deriveName = current.getRawAttribute(`${Env.prefix}derive-name`);
      if (typeof deriveName === 'string' && deriveName.trim() !== '') {
        segment += `[${Env.prefix}derive-name="${deriveName.trim()}"]`;
      }
      const parent = current.getParent();
      if (parent) {
        const siblingIndex = parent
          .getChildren()
          .filter(child => child instanceof ElementFragment)
          .findIndex(child => child === current);
        segment += `:nth-child(${siblingIndex + 1})`;
      }
      segments.unshift(segment);
      current = parent;
    }
    return segments.join(' > ');
  }

  /**
   * data-derive subtree の署名計算回数を記録します。
   *
   * @param fragment 対象フラグメント
   * @param source 計算元
   */
  private static recordDerivedSubtreeSignatureComputation(
    fragment: ElementFragment,
    source: DerivedSubtreeSignatureSource,
  ): void {
    const profile = Core.getOrCreateDerivedSubtreeProfile(fragment);
    if (profile === null) {
      return;
    }
    profile.signatureComputeTotal += 1;
    if (source === 'refresh') {
      profile.signatureComputeFromRefresh += 1;
      return;
    }
    profile.signatureComputeFromEvaluateAll += 1;
  }

  /**
   * data-derive subtree の現在プロファイルをログ出力します。
   *
   * @param fragment 対象フラグメント
   * @param reason ログ理由
   */
  private static logDerivedSubtreeProfileSnapshot(
    fragment: ElementFragment,
    reason: 'refresh' | 'skip-hit' | 'skip-miss' | 'skip-ineligible',
  ): void {
    const profile = Core.getOrCreateDerivedSubtreeProfile(fragment);
    if (profile === null) {
      return;
    }
    if (reason === 'skip-hit') {
      profile.skipHitCount += 1;
    } else if (reason === 'skip-miss') {
      profile.skipMissCount += 1;
    } else if (reason === 'skip-ineligible') {
      profile.skipIneligibleCount += 1;
    }
    Log.info('[Haori][derive-profile]', {
      reason,
      hostId: profile.hostId,
      signatureComputeTotal: profile.signatureComputeTotal,
      signatureComputeFromEvaluateAll: profile.signatureComputeFromEvaluateAll,
      signatureComputeFromRefresh: profile.signatureComputeFromRefresh,
      skipHitCount: profile.skipHitCount,
      skipMissCount: profile.skipMissCount,
      skipIneligibleCount: profile.skipIneligibleCount,
    });
  }

  /**
   * data-each 以外の動的要素状態を持つかどうかを返します。
   *
   * @param fragment 判定対象フラグメント
   * @returns 該当するなら true
   */
  private static hasNonEachDynamicElementState(
    fragment: ElementFragment,
  ): boolean {
    const allowedEachAttributes = new Set([
      `${Env.prefix}each`,
      `${Env.prefix}each-key`,
      `${Env.prefix}each-arg`,
      `${Env.prefix}each-index`,
    ]);
    const hasDynamicAttributes = fragment.getAttributeNames().some(name => {
      if (allowedEachAttributes.has(name)) {
        return false;
      }
      if (name.startsWith(`${Env.prefix}attr-`)) {
        return true;
      }
      if (name.startsWith(Env.prefix)) {
        return true;
      }
      const value = fragment.getRawAttribute(name);
      return typeof value === 'string' && value.includes('{{');
    });
    if (hasDynamicAttributes) {
      return true;
    }
    return fragment.getChildren().some(
      child => child instanceof TextFragment && child.hasDynamicContent(),
    );
  }

  /**
   * fresh clone 初期化を subtree ごと省略できるかどうかを事前計算します。
   *
   * @param fragment 判定対象フラグメント
   * @returns subtree 全体を省略可能なら true
   */
  private static markFreshInitializationSkippable(
    fragment: ElementFragment,
  ): boolean {
    const hasDynamicAttributes = fragment
      .getAttributeNames()
      .some(name => Core.isFreshInitializationDynamicAttribute(fragment, name));
    const hasDynamicChildren = fragment.getChildren().some(child => {
      if (child instanceof ElementFragment) {
        return !Core.markFreshInitializationSkippable(child);
      }
      if (child instanceof TextFragment) {
        return child.hasDynamicContent();
      }
      return false;
    });
    const skippable = !hasDynamicAttributes && !hasDynamicChildren;
    fragment.setFreshInitializationSkippable(skippable);
    return skippable;
  }

  /**
   * fresh clone 初期化で再評価が必要な属性かどうかを返します。
   *
   * @param fragment 判定対象フラグメント
   * @param name 属性名
   * @returns 再評価が必要なら true
   */
  private static isFreshInitializationDynamicAttribute(
    fragment: ElementFragment,
    name: string,
  ): boolean {
    if (name.startsWith(`${Env.prefix}attr-`)) {
      return true;
    }
    if (name.startsWith(Env.prefix)) {
      return true;
    }
    const value = fragment.getRawAttribute(name);
    return typeof value === 'string' && value.includes('{{');
  }

  /**
   * 差分を更新します。
   *
   * @param parent 親フラグメント
   * @param newList 新しいリスト
   */
  private static updateDiff(
    parent: ElementFragment,
    newList: (Record<string, unknown> | string | number)[],
  ): Promise<void> {
    const template = parent.getTemplate();
    if (template === null) {
      Log.error('[Haori]', 'Template is not set for each element.');
      return Promise.resolve();
    }
    let indexKey = parent.getAttribute(`${Env.prefix}each-index`);
    if (indexKey) {
      indexKey = String(indexKey);
    }
    const keyArg = parent.getAttribute(`${Env.prefix}each-key`);
    const itemArg = parent.getAttribute(`${Env.prefix}each-arg`);
    const keyDataMap: Map<
      string,
      {item: (typeof newList)[0]; itemIndex: number}
    > = new Map();
    const newKeys: string[] = [];
    newList.forEach((item, itemIndex) => {
      const listKey = Core.createListKey(
        item,
        keyArg ? String(keyArg) : null,
        itemIndex,
      );
      newKeys.push(listKey);
      keyDataMap.set(listKey, {item, itemIndex});
    });
    const newKeySet = new Set(newKeys);
    const removalPromises: Promise<void>[] = [];
    let childElements = parent
      .getChildren()
      .filter(child => child instanceof ElementFragment)
      .filter(
        child =>
          !child.hasAttribute(`${Env.prefix}each-before`) &&
          !child.hasAttribute(`${Env.prefix}each-after`),
      );
    const previousKeys = childElements.map(child => child.getListKey());
    childElements = childElements.filter(child => {
      if (!newKeySet.has(String(child.getListKey()))) {
        removalPromises.push(child.remove());
        return false;
      }
      return true;
    });
    const srcKeys = childElements.map(child => child.getListKey());
    const childElementsByKey = new Map<string, ElementFragment>();
    childElements.forEach(child => {
      const listKey = child.getListKey();
      if (listKey !== null && !childElementsByKey.has(listKey)) {
        childElementsByKey.set(listKey, child);
      }
    });
    const insertTargets = parent.getChildElementFragments().slice();
    const baseInsertIndex = insertTargets.filter(child =>
      child.hasAttribute(`${Env.prefix}each-before`),
    ).length;
    let chain = Promise.resolve();
    newKeys.forEach((newKey, loopIndex) => {
      const {item, itemIndex} = keyDataMap.get(newKey)!;
      let child: ElementFragment;
      const reusedChild = childElementsByKey.get(newKey);
      if (reusedChild) {
        // 既存の要素を再利用
        child = reusedChild;
        // 行の入力が同一なら子孫の再評価をスキップする。
        chain = chain.then(() =>
          Core.updateRowFragment(
            child,
            item,
            indexKey as string | null,
            itemIndex,
            itemArg ? String(itemArg) : null,
            newKey,
          ).then(changed => {
            if (!changed) {
              return undefined;
            }
            return Core.evaluateAll(child);
          }),
        );
      } else {
        // 新しい要素を追加
        child = template.clone();
        const currentInsertIndex = baseInsertIndex + loopIndex;
        chain = chain.then(() =>
          Core.updateRowFragment(
            child,
            item,
            indexKey as string | null,
            itemIndex,
            itemArg ? String(itemArg) : null,
            newKey,
          ).then(() => {
            const referenceChild = insertTargets[currentInsertIndex] ?? null;
            return parent
              .insertBefore(child, referenceChild)
              .then(() => {
                insertTargets.splice(currentInsertIndex, 0, child);
              })
              .then(() => Core.initializeFreshEachRow(child));
          }),
        );
      }
    });
    return Promise.all(removalPromises)
      .then(() => chain)
      .then(() => {
        // eachupdate イベントを発火する。
        // chain は全新規行の initializeFreshEachRow（= 行内容の描画）完了まで await
        // しているため、本イベントは「今回の差分で追加・削除・並べ替えされた全行が
        // DOM に反映され、各行の {{...}} 補間などの内容描画が完了した後」に発火する。
        // これにより外部から data-each の描画完了を検知できる（仕様上の保証）。
        const validNewKeys = newKeys.filter(
          (key): key is string => key !== null,
        );
        const validSrcKeys = srcKeys.filter(
          (key): key is string => key !== null,
        );
        const validSrcKeySet = new Set(validSrcKeys);
        const addedKeys = validNewKeys.filter(key => !validSrcKeySet.has(key));
        const previousValidKeys = previousKeys.filter(
          (key): key is string => key !== null,
        );
        const removedKeys = previousValidKeys.filter(
          key => !newKeySet.has(key),
        );
        HaoriEvent.eachUpdate(
          parent.getTarget(),
          addedKeys,
          removedKeys,
          validNewKeys,
        );
        return undefined;
      });
  }

  /**
   * リスト比較用のキーを生成します。
   *
   * @param item 対象オブジェクト
   * @param keyArg リストキーに使用するプロパティ名
   * @param index 配列のインデックス
   * @returns リストキー
   */
  private static createListKey(
    item: Record<string, unknown> | string | number,
    keyArg: string | null,
    index: number,
  ): string {
    let listKey: string;
    if (typeof item === 'object' && item !== null) {
      if (keyArg) {
        const key = item[keyArg as string];
        if (key === null || key === undefined) {
          listKey = `__index_${index}`;
        } else if (typeof key == 'object') {
          listKey = JSON.stringify(key);
        } else {
          listKey = String(key);
        }
      } else {
        // data-each-key がない場合はインデックスをキーとして使用
        listKey = `__index_${index}`;
      }
    } else {
      listKey = String(item);
    }
    return listKey;
  }

  /**
   * 行フラグメントにデータを設定します。
   *
   * @param rowFragment 行フラグメント
   * @param data 行データ
   * @param indexKey インデックスキー
   * @param index インデックス番号
   * @param arg バインドデータパラメータ名
   * @param listKey リストキー
   * @returns 行メタデータの更新完了 Promise
   */
  private static updateRowFragment(
    rowFragment: ElementFragment,
    data: Record<string, unknown> | string | number,
    indexKey: string | null,
    index: number,
    arg: string | null,
    listKey: string,
  ): Promise<boolean> {
    let bindingData = data;
    if (typeof data === 'object' && data !== null) {
      bindingData = {...data};
      if (indexKey) {
        bindingData[indexKey] = index;
      }
      if (arg) {
        bindingData = {
          [arg]: bindingData,
        };
      }
    } else {
      if (arg) {
        bindingData = {
          [arg]: data,
        };
        if (indexKey) {
          bindingData[indexKey] = index;
        }
      } else {
        Log.error(
          '[Haori]',
          `Primitive value requires '${Env.prefix}each-arg' attribute: ${data}`,
        );
        return Promise.resolve(false);
      }
    }
    const normalizedBindingData = bindingData as Record<string, unknown>;
    const nextRenderSignature = Core.createBindingSignature({
      listKey,
      bindingData: normalizedBindingData,
    });
    if (
      rowFragment.getListKey() === listKey &&
      rowFragment.getRenderSignature() === nextRenderSignature
    ) {
      return Promise.resolve(false);
    }
    rowFragment.setListKey(listKey);
    rowFragment.setRenderSignature(nextRenderSignature);
    rowFragment.setBindingData(normalizedBindingData);
    return rowFragment
      .setAttribute(`${Env.prefix}row`, listKey)
      .then(() => true);
  }

  /**
   * 新規挿入行に遅延再評価が必要かどうかを判定します。
   *
   * @param fragment 判定対象の行フラグメント
   * @returns 遅延再評価が必要なら true
   */
  private static needsScheduledEvaluateAll(fragment: ElementFragment): boolean {
    const stack: ElementFragment[] = [fragment];
    while (stack.length > 0) {
      const current = stack.pop()!;
      current.getChildElementFragments().forEach(child => {
        stack.push(child);
      });
      if (
        current !== fragment &&
        !current.isMounted() &&
        Core.hasMountSensitiveAttribute(current)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * mounted 状態に依存して再評価が必要になりやすい属性を持つかどうかを返します。
   *
   * @param fragment 判定対象フラグメント
   * @returns 該当属性を持つなら true
   */
  private static hasMountSensitiveAttribute(
    fragment: ElementFragment,
  ): boolean {
    return ['fetch', 'import'].some(suffix =>
      fragment.hasAttribute(`${Env.prefix}${suffix}`),
    );
  }

  /**
   * バインド値が同一かどうかを再帰的に判定します。
   *
   * @param left 比較元の値
   * @param right 比較先の値
   * @param visited 循環参照対策用の訪問済みペア
   * @returns 同一なら true
   */
  private static createBindingSignature(
    value: unknown,
    seen: WeakMap<object, string> = new WeakMap(),
    nextId: {value: number} = {value: 0},
  ): string {
    if (value === null) {
      return 'null';
    }
    if (value === undefined) {
      return 'undefined';
    }
    if (typeof value === 'string') {
      return JSON.stringify(value);
    }
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    if (typeof value === 'function') {
      return `[Function:${value.name || 'anonymous'}]`;
    }
    if (typeof value === 'symbol') {
      return value.toString();
    }
    if (value instanceof Date) {
      return `[Date:${value.toISOString()}]`;
    }
    if (Array.isArray(value)) {
      if (seen.has(value)) {
        return `[Circular:${seen.get(value)}]`;
      }
      const marker = `array-${nextId.value}`;
      nextId.value += 1;
      seen.set(value, marker);
      return `[${value
        .map(item => Core.createBindingSignature(item, seen, nextId))
        .join(',')}]`;
    }
    if (typeof value === 'object') {
      if (seen.has(value)) {
        return `[Circular:${seen.get(value)}]`;
      }
      const marker = `object-${nextId.value}`;
      nextId.value += 1;
      seen.set(value, marker);
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record)
        .sort()
        .map(
          key =>
            `${JSON.stringify(key)}:${Core.createBindingSignature(
              record[key],
              seen,
              nextId,
            )}`,
        )
        .join(',')}}`;
    }
    return String(value);
  }

  /**
   * フラグメントの再評価を次のイベントループで実行します。
   *
   * @param fragment 再評価対象のフラグメント
   */
  private static scheduleEvaluateAll(fragment: ElementFragment): void {
    setTimeout(() => {
      void Core.evaluateAll(fragment);
    }, 100);
  }
}
