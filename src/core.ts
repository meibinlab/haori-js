/**
 * @fileoverview Core機能
 *
 * Fragmentの管理、属性変化の監視、条件分岐・繰り返し処理など、
 * アプリケーションの中心的な機能を提供します。
 */
import Env from './env';
import Dev from './dev';
import Enhance from './enhance';
import Expression from './expression';
import Form from './form';
import Fragment, {ElementFragment, TextFragment} from './fragment';
import type {ValueChangeKind, ValueChangeOrigin} from './fragment';
import Log from './log';
import Procedure from './procedure';
import Store from './store';
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
  /**
   * 実行中の差分更新（再実行を含む）の完了 Promise。
   * 再入した呼び出し元はこの Promise を待つことで、最終的な DOM 反映まで待機できる。
   */
  settled: Promise<void> | null;
}

/**
 * `Core.setBindingData()` の任意指定。
 *
 * 値の由来（`kind` と `sequence`）は**呼び出し側が何をしているか**だけを表します。
 * 適用するかどうかの判定は宛先の側（`ElementFragment.canApplyValue()` と
 * `canApplyPath()`）に集約されており、呼び出し側が順序や基準の数値を選ぶことは
 * ありません（`docs/ja/値の供給と権威解決の設計書.md`）。
 */
export interface SetBindingDataOptions {
  /** 再評価をスキップするフラグメント集合 */
  readonly skipFragments?: ReadonlySet<ElementFragment>;
  /**
   * 直列化中の再帰呼出で即時実行するか。
   *
   * FIFO キューへ積むと現在のワークの完了を待って自己デッドロックする経路
   * （`data-url-param` の再評価や、実行中のワークへ戻すマネージド fetch の bind）
   * だけで `true` にします。
   */
  readonly reentrant?: boolean;
  /**
   * `data-bind` 属性へミラーするか（既定 true）。
   *
   * `_fetch` / `_poll` / 可視範囲のようなエンジン管理変数の高頻度更新では `false` に
   * して全データ直列化を避けます。
   */
  readonly reflectToAttribute?: boolean;
  /**
   * この更新の種別（既定は供給）。
   *
   * 供給は前の編集を上書きし、後の編集に負けます。値の供給ではない内部更新
   * （双方向コミット、`data-url-param` の再評価、エンジン管理変数）は
   * `'nonSupply'` を渡します。
   */
  readonly kind?: ValueChangeKind;
  /**
   * この更新を起こした**操作の**通番。
   *
   * 操作と呼び出しが非同期に離れている経路（リセットの各段、フェッチ応答の反映、
   * 外部属性書き換えの取り込みなど）では、操作が起きた時点で発番した番号を渡します。
   * 呼び出し時点で発番すると、先に起きた操作が後の番号を得て権威が逆転します。
   *
   * **省略した場合は「呼び出し時点が操作の時点である」と解釈**し、保留中の外部
   * 書き換えを先に番号付けしてから発番します（`ElementFragment.nextOperationSequence()`）。
   * 公開 API の直接呼び出し向けの既定です。Haori 内部からの呼び出しは、操作と呼び
   * 出しが離れている以上いずれも明示すべきですが、省略しても安全です（取り込みは
   * バインドワークの実行中には行われないため、ワークの内部から省略しても再入しません）。
   */
  readonly sequence?: number;
  /**
   * この更新のうち、利用者が実際に編集したバインドデータの経路。
   *
   * フォーム全体の収集値を運ぶ双方向コミットが、未編集の欄まで編集の権威を得ない
   * ようにするために渡します（`Form.collectEditedPaths()`）。
   */
  readonly editedPaths?: ReadonlySet<string>;
  /**
   * 供給でユーザー編集の印を解除するか（既定は供給なら解除する）。
   *
   * 呼び出し側が独自の規則で編集を突き合わせ済みの経路だけ `false` にします
   * （フェッチ応答の反映は `Procedure.reconcileUserEditsForBind()` が、ポーリングと
   * 通常の再取得を区別して解除するため、ここで重ねて解除してはいけません）。
   */
  readonly clearUserEdits?: boolean;
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
    // `store` は `bind`（既定値）の後、`url-param` の前に置く。URL クエリで明示
    // された値を保存済みの値より優先するため。
    'store',
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
    'store',
    // 条件は評価結果を DOM 属性へ書かない（式は実行時に生値から評価する）。
    'validity',
    'validity-message',
  ];

  /** 属性内プレースホルダ検出用の正規表現 */
  private static readonly ATTRIBUTE_PLACEHOLDER_REGEX =
    /\{\{\{[\s\S]+?\}\}\}|\{\{[\s\S]+?\}\}/;

  /**
   * 行スコープ判定で「属性値そのものが式」とみなす `data-*` 属性のサフィックス。
   * `{{...}}` を伴わずに式を書く属性だけを列挙する。
   */
  private static readonly ROW_LOCAL_EXPRESSION_ATTRIBUTES: ReadonlySet<string> =
    new Set(['each', 'if', 'derive']);

  /**
   * 行スコープ判定で「属性値が式ではない」とみなす `data-*` 属性のサフィックス。
   * ここに無い `data-*` 属性は、行の外を参照し得るものとして安全側に扱う。
   */
  private static readonly ROW_LOCAL_STATIC_ATTRIBUTES: ReadonlySet<string> =
    new Set([
      'each-arg',
      'each-key',
      'each-index',
      'each-before',
      'each-after',
      'derive-name',
      'row',
      'form',
      'form-arg',
      'form-list',
      'form-object',
      'form-detach',
      'store',
      'store-params',
      'store-arg',
      'store-type',
      'enhance',
      'enhance-new',
    ]);

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
   * data-each-rendered-change（既定の `once` モード）で change を発火済みの要素。
   * 再帰的な発火ループを避けるため、要素ごとに一度だけ発火させるために使用します。
   */
  private static readonly EACH_RENDERED_CHANGE_FIRED =
    new WeakSet<HTMLElement>();

  /**
   * data-each-rendered-change の不正な属性値を警告済みの要素。
   * 描画確定ごとに同じ警告を出し続けないために使用します。
   */
  private static readonly EACH_RENDERED_CHANGE_WARNED =
    new WeakSet<HTMLElement>();

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
   * 配下の入力欄からユーザー編集の印を解除します。
   *
   * 明示的に値を供給する操作（フェッチ応答とそれに伴う `data-{event}-bind` の反映、
   * `data-{event}-reset`、`data-{event}-copy`、`data-each` の行データ差し替え）から
   * 呼び出します。解除後の再評価では宣言バインドの評価結果が入力欄へ再適用され、
   * 「再取得したのに古い入力が残る」状態になりません。
   *
   * 逆に、`change` / `input` の双方向コミットや `data-url-param` の再評価のような
   * 「値の供給ではない更新」からは呼び出しません。呼び出すと編集値が評価結果へ
   * 巻き戻ります。フェッチを伴わない `change` / `input` の `data-{event}-bind` も
   * 双方向コミットに含みます（`Procedure` の `twoWayCommitBind` を参照）。
   *
   * @param fragment 対象フラグメント（配下すべてが対象）
   * @param upTo この通し番号までの編集を解除対象とする（既定は現在の最新）
   * @return 戻り値はありません。
   */
  public static clearUserEditMarks(
    fragment: ElementFragment,
    upTo: number = ElementFragment.currentSequence(),
  ): void {
    fragment.clearUserEditMark(upTo);
    fragment.getChildren().forEach(child => {
      if (child instanceof ElementFragment) {
        Core.clearUserEditMarks(child, upTo);
      }
    });
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
    if (fragment.hasAttribute(`${Env.prefix}validity`)) {
      // 表示用（CSS の `:invalid` など）に検証状態を追随させる。ブロックの判定は
      // 手続きの実行時に同期評価した結果が権威で、ここでの更新に依存しない。
      Form.applyCustomValidity(fragment);
    }
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
    // マネージド fetch はバインドワーク（reevaluateReactiveSpecialAttributes）の
    // 内部から起動・await される。その bind が同一フラグメントを指すと FIFO へ
    // 積んだ場合に実行中ワークと相互に待ち合って自己デッドロックするため、bind を
    // reentrant（即時実行）で行う。
    const procedure = new Procedure(fragment, null);
    procedure.markReentrantBind();
    return procedure
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
          // 差し込んだ断片を取り込み先の子としてフラグメント木へ繋いでから
          // 走査する。初期化の前後で分けず、常にこの経路で評価する。監視へ
          // 委ねると、同じ変更で追加された 2 つ目以降のノードが取りこぼされる
          // （`insertBefore` が挿入のあいだ立てる抑止フラグに、同じ通知の後続の
          // `addNode` が掛かるため）。繋いだ子は `addNode` 側で除外する。
          Core.adoptImportedChildren(fragment);
          const childPromises: Promise<void>[] = [];
          fragment.getChildren().forEach(child => {
            if (child instanceof ElementFragment) {
              childPromises.push(Core.scan(child.getTarget()));
            } else if (child instanceof TextFragment) {
              childPromises.push(Core.evaluateText(child));
            }
          });
          return Promise.all(childPromises).then(() => undefined);
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
   * 取り込んだ断片を取り込み先のフラグメントの子として繋ぎます。
   *
   * `data-import` は `innerHTML` で子を差し替えるため、フラグメント木は自動では
   * 追従しません。繋がないまま評価すると、断片の要素は親を持たないフラグメントに
   * なり、祖先をたどれないため評価スコープが空になります（`{{...}}` が空表示に
   * なり、`data-if` が常に偽になる）。DOM 上は取り込み先の子なので、通常の子要素と
   * 同じスコープ解決になるように繋ぎ直します。
   *
   * @param fragment 取り込み先のフラグメント
   * @return 戻り値はありません。
   */
  private static adoptImportedChildren(fragment: ElementFragment): void {
    const target = fragment.getTarget();
    // 差し替えで DOM から外れた子は木から落とす。残すと以降の再評価が DOM に
    // 無いノードをたどり、再取り込みのたびに積み上がる。DOM からの削除は
    // `innerHTML` の差し替えで済んでいるため、切り離しだけを行う（`remove(true)`
    // にすると、外部ライブラリが別の場所へ移した要素まで DOM から取り除いて
    // しまう。判定はフラグメント木の親ではなく DOM の親で行うため）。
    fragment
      .getChildren()
      .filter(child => child.getTarget().parentNode !== target)
      .forEach(child => {
        void child.remove(false);
      });
    target.childNodes.forEach(node => {
      const child = Fragment.get(node);
      if (child !== null && child.getParent() !== fragment) {
        fragment.pushChild(child);
      }
    });
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
    // 初期化（data-each の行生成を含む）が完了してから、初期 data-bind の値を
    // 入力欄へ反映する。行が生成される前に反映しても新規行には値が入らない。
    return Core.initializeElementFragment(fragment, false)
      .then(() => Form.restoreInitialValues(element))
      .then(() => {
        // 外部ライブラリ連携（`data-enhance` / `data-enhance-new`）は、内容の描画と
        // 初期値の反映が済んだ状態で適用する。
        Enhance.applySubtree(element);
      });
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
      // 追加された行にだけ外部ライブラリ連携を適用する。
      Enhance.applySubtree(fragment.getTarget());
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
    // `data-form-name` の初期化（収集キーの検証と、ラジオボタンのグループ用 DOM
    // `name` の生成）を行う。属性の反映後に行うのは、`data-form-name` にテンプレート
    // 式を書いた場合の評価結果を収集キーとして使うため。対象外の要素では Promise を
    // 返さないため、初期化の非同期段数は従来（末尾で undefined へ畳む分）と変わらない。
    return attributeChain.then(() => Form.prepareFormName(fragment));
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
   * @param fromObserver 外部（他スクリプト）による書き換えの取り込みかどうか
   * @param originSequence 外部の書き換えを検知した時点の通番。`Observer` が保留中の
   *     変更を同期的に引き取ったときだけ渡します（`Observer.flushPendingMutations()`
   *     を参照）。渡さない場合は取り込みの時点で発番します
   * @returns Promise (DOM操作が完了したときに解決される)
   */
  public static setAttribute(
    element: HTMLElement,
    name: string,
    value: string | null,
    fromObserver = false,
    originSequence?: number,
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
    /**
     * 属性の反映（内部の属性マップの更新）が済んでから行う処理。
     *
     * 宣言そのものを読み直す副作用属性（`data-fetch` / `data-import`）はここへ回します。
     * 反映より前に実行すると、実行時に属性を付与した場合に宣言が見えません。
     */
    let afterAttributeWrite: (() => Promise<void>) | null = null;
    switch (name) {
      case `${Env.prefix}bind`: {
        if (value !== null) {
          // MutationObserver 経由（fromObserver）の data-bind 変更が Haori 自身の
          // 書き込みのエコーなら再取り込みしない。並行 setBindingData 時に古いエコーを
          // 取り込んで最新の in-memory を巻き戻す競合を防ぐ（in-memory が権威）。
          // 記録に無い値（外部からの data-bind 変更）は従来どおり取り込む。
          if (
            fromObserver &&
            fragment instanceof ElementFragment &&
            fragment.consumeSelfWrittenBind(value)
          ) {
            break;
          }
        }
        const data = value === null ? {} : Core.parseDataBind(value);
        if (fromObserver) {
          // 外部（他のスクリプトやライブラリ）からの属性変更。内部データを差し替える
          // だけでは配下が古いままになり、画面・収集値・バインドデータが食い違う。
          // 通常のバインド更新と同じ経路へ載せて再評価まで行う。書き戻しは自己書き
          // 込みとして記録されるため、上の判定でエコーが消費されて往復しない。
          //
          // 属性の反映は `Core.setBindingData()` の側で完結するため、この case は
          // 共通処理（末尾の属性反映）へ進まずにここで終える。両方が走ると、外部が
          // 書いた表記と正規化した表記のどちらが内部の属性マップへ残るかが、
          // 解決順に左右される。
          // 外部からの書き換えは明示的な値の供給（仕様「`data-bind`」）。通番は変更を検知
          // した時点のもので、同期的に引き取った場合は引き取り側が渡す。渡されて
          // いなければこの取り込みの時点で発番する（`Observer` の非同期通知経路）。
          const bindOriginSequence =
            originSequence ?? ElementFragment.nextSequence();
          if (value === null) {
            // 取り除かれた属性はミラーしない。`{}` を書き戻すと、取り除いたはずの
            // 属性が復活するうえ、続く除去 → 取り込み → ミラーが循環する
            // （`haori:bindchange` も発火しないが、この経路は従来から発火しない）。
            promises.push(
              Core.setBindingData(element, data, {
                reflectToAttribute: false,
                sequence: bindOriginSequence,
              }),
            );
            promises.push(fragment.removeAttribute(name));
          } else {
            promises.push(
              Core.setBindingData(element, data, {
                sequence: bindOriginSequence,
              }),
            );
          }
          return Promise.all(promises).then(() => undefined);
        }
        // スキャン経路。取り込んだ後に呼出側が配下を評価するため、ここでは
        // 内部データの差し替えだけを行う。
        if (value === null) {
          fragment.clearBindingDataCache();
        }
        fragment.setBindingData(data);
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
        // 属性の反映（内部の属性マップの更新）より**後**に実行する。先に実行すると、
        // 実行時に `data-fetch` を付与した場合に「宣言がまだ無い」と判断され、
        // シグネチャが `null` になって取得が走らない（仕様「`data-fetch`」は実行時の直接付与を
        // 案内している）。スキャン経路では属性マップがすでに埋まっているため、
        // どちらの順でも動く。
        //
        // **引き換えに、URL に式を含むマネージド `data-fetch` の初回実行が 1 フレーム
        // 遅れる。** 属性マップの更新自体は同期だが（`setAttributeInternal()`）、その
        // 呼び出しはこの switch より後にあり、待ち合わせが描画キュー（`requestAnimationFrame`）
        // を経由するためである。同期にするには属性の書き込みをこの switch より前へ
        // 移す必要があるが、自己書き込みの待ち合わせで書き込みが繰り延べられた場合に
        // 属性マップが古いまま実行され、上の不具合が再発する。取得は非同期であり
        // 1 フレームの遅れは観測できないため、正しさを取ってこの順序を維持する。
        afterAttributeWrite = () => Core.executeManagedFetch(fragment);
        break;
      case `${Env.prefix}import`:
        if (typeof value === 'string') {
          // `data-fetch` と同じ理由で属性の反映より後に実行する。
          afterAttributeWrite = () => Core.executeManagedImport(fragment);
        }
        break;
      case `${Env.prefix}store`:
        if (value !== null) {
          // 属性の削除では復元しない（削除時点の生属性はまだ残っているため、
          // 判定を省くと保存済みの値で現在のバインドデータを上書きしてしまう）。
          promises.push(Store.restore(fragment));
        }
        break;
      case `${Env.prefix}validity`:
      case `${Env.prefix}validity-message`:
        // 表示用の検証状態だけを更新し、共通処理（属性の DOM 反映）へは進まない。
        // 進むと評価結果（`true` / `false`）が属性値として DOM へ書かれ、宣言した
        // テンプレートが読めなくなる。ブロックの判定は手続きの実行時に生値から
        // 同期評価する（`Form.applyCustomValidity()`）。
        //
        // この経路を通らないため、属性値を実行中に外部から書き換えても反映され
        // ない（`data-store` と同じく、宣言は静的なものとして扱う）。
        if (value !== null) {
          Form.applyCustomValidity(fragment);
        }
        return Promise.all(promises).then(() => undefined);
      case `${Env.prefix}url-param`: {
        const arg = fragment.getAttribute(`${Env.prefix}url-arg`);
        const params = Url.readParams();
        if (arg === null && fragment.hasAttribute(`${Env.prefix}store`)) {
          // data-url-arg 省略時の url-param は生バインドデータを全置換するため、
          // data-store が復元した値も消える。併用時は data-url-arg を指定する。
          Log.warn(
            'Haori',
            `${Env.prefix}url-param を ${Env.prefix}url-arg なしで ` +
              `${Env.prefix}store と併用すると復元した値が消えます` +
              `（${Env.prefix}url-arg を指定してください）。`,
          );
        }
        // data-url-param の再評価は evaluateAll（= setBindingData の work）内から
        // 同一フラグメントへ再帰し得るため reentrant=true で即時実行する。
        // 再評価ごとに走る経路なので、値の供給ではない更新として扱う（権威を持たず、
        // ユーザー編集の印も解除しない）。
        const urlParamOptions: SetBindingDataOptions = {
          reentrant: true,
          kind: 'nonSupply',
          sequence: ElementFragment.nextSequence(),
        };
        if (arg === null) {
          promises.push(Core.setBindingData(element, params, urlParamOptions));
        } else {
          const data = fragment.getRawBindingData() || {};
          data[String(arg)] = params;
          promises.push(Core.setBindingData(element, data, urlParamOptions));
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
      .then(() =>
        afterAttributeWrite === null ? undefined : afterAttributeWrite(),
      )
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
   * 要素のバインドデータを更新し、配下を再評価します。
   *
   * `reflectToAttribute` を `false` にすると `data-bind` 属性へのミラー
   * （`JSON.stringify` による全データ直列化）を抑止します。スクロール追従の
   * 可視範囲のように高頻度で更新される一時的なエンジン管理変数では、属性ミラーの
   * 直列化コスト（保持データ量に比例）が支配的になるため、これを省いて in-memory
   * 更新と再評価だけを行います。属性は次回の通常更新時に最新の in-memory から
   * 反映されます。あわせて外部向けの `haori:bindchange` イベントも発火しません
   * （非ミラーの一時更新は外部通知もしない、という方針で意味を揃えるため）。
   *
   * データの設定は既定で「明示的な値の供給」として扱い、配下の入力欄からユーザー
   * 編集の印を解除します（`clearUserEditMarks`）。これにより、利用者が編集した欄も
   * 供給された値へ更新されます。値の供給ではない内部更新（`change` の双方向コミット、
   * `data-url-param` の再評価、`_poll` / `_fetch` などのエンジン管理変数）は
   * `options.kind` に `'nonSupply'` を渡します。
   *
   * 解除の範囲は呼び出し側が選びません。**供給はその操作の通番までの編集を解除し、
   * それより後の編集は残します**（仕様「ユーザー編集と宣言バインドの権威」）。飛行中の通信の応答が、送出後に
   * 行われた編集を消さないのはこの規則によるものです。
   *
   * @param element 対象要素
   * @param data 設定するバインドデータ
   * @param options 由来と反映方法の指定（`SetBindingDataOptions`）
   * @returns Promise (DOM操作が完了したときに解決される)
   */
  public static setBindingData(
    element: HTMLElement,
    data: Record<string, unknown>,
    options: SetBindingDataOptions = {},
  ): Promise<void> {
    const fragment = Fragment.get(element) as ElementFragment;
    const skipFragments = options.skipFragments ?? new Set<ElementFragment>();
    const reentrant = options.reentrant ?? false;
    const reflectToAttribute = options.reflectToAttribute ?? true;
    // この更新の種別。既定は「明示的な値の供給」（仕様「ユーザー編集と宣言バインドの権威」）。
    const resolvedKind: ValueChangeKind = options.kind ?? 'supply';
    // 通番を省略した呼び出しは「呼び出し時点が操作の時点」＝公開 API の直接呼び出し
    // として扱う。他のスクリプトが直前に書き換えた `data-bind` は `MutationObserver`
    // の非同期通知を待つと後の番号を得てしまうため、先に番号付けしてから発番する
    // （`Observer.flushPendingMutations()`）。
    const originSequence =
      options.sequence ?? ElementFragment.nextOperationSequence();
    // 入力欄へ書き戻すときに宛先の台帳と突き合わせる由来。判定は宛先の 1 箇所
    // （`ElementFragment.canApplyValue()`）に集約する。
    const origin: ValueChangeOrigin = {
      sequence: originSequence,
      kind: resolvedKind,
      ...(options.editedPaths === undefined
        ? {}
        : {editedPaths: options.editedPaths}),
    };
    // この更新が「明示的な値の供給」かどうか。供給だけが宛先の権威を更新し、供給
    // 同士は後勝ち（仕様「反映待ちの間に起きた変化」）で解決する。値の供給ではない内部更新（双方向
    // コミット、`data-url-param` の再評価、エンジン管理変数）は権威を持たない。
    const isSupply = resolvedKind === 'supply';
    if (isSupply) {
      fragment.markSupplyApplied(originSequence);
    }
    // 呼出時点の初期化の通番。入力欄へ書き戻す直前に宛先の通番と比較し、この呼出
    // より後に初期化（`Form.reset()`）されていれば書き戻さない。運んでいる値は
    // 初期化前の状態なので、書き戻すとクリアしたはずの値が復活する。
    const resetSequence = ElementFragment.currentSequence();
    const previous = fragment.getRawBindingData();
    if (isSupply && (options.clearUserEdits ?? true)) {
      // 供給はこの操作までの編集を上書きする。操作より後の編集の印は残るため、
      // 飛行中の通信の応答で新しい編集が消えることはない（仕様「ユーザー編集と宣言バインドの権威」）。
      Core.clearUserEditMarks(fragment, originSequence);
    }
    // 変化した経路ごとに適用可否を判定し、棄却した経路は前の値のまま残す。
    // `reflectToAttribute=false` は `_fetch` / `_poll` / 可視範囲のようなエンジン
    // 管理変数の更新で、権威の競合が起きない代わりに高頻度なので判定を通さない。
    const resolvedData = reflectToAttribute
      ? Core.resolveByPathAuthority(fragment, previous, data, origin)
      : data;
    // 内部バインドデータは即時確定する（後続の同期読み取りが最新値を得られるよう）。
    fragment.setBindingData(resolvedData);

    // bindchangeイベントを発火（従来どおり呼出時点で同期通知する）。
    // reflectToAttribute=false は属性ミラーすら行わない一時的なエンジン管理更新
    // （可視範囲など）のため、外部向け bindchange も発火しない（高頻度更新による
    // 通知の氾濫を避け、「非ミラーの一時更新は外部通知もしない」と意味を揃える）。
    if (reflectToAttribute) {
      HaoriEvent.bindChange(element, previous, resolvedData, 'manual');
      // ブラウザストレージへのミラーは、in-memory が確定したこの時点で同期実行する。
      // Queue（requestAnimationFrame）へ遅延させると、data-{event}-redirect による
      // 遷移や背面タブで次フレームが来ず、遷移直前の保存を取りこぼす。
      // reflectToAttribute=false（`_fetch` / `_poll` などのエンジン管理変数の注入）は
      // ミラーの対象外とし、外部通知と扱いを揃える。
      Store.mirror(fragment);
    }

    // 同一要素への並行呼出で適用順が逆転しないよう、DOM 反映・再評価を呼出順
    // （FIFO）で直列化する。直列化しないと、内部キューの完了順が呼出順と逆転し、
    // 先に呼んだ古いデータの data-bind 属性が後から確定することがある。
    //
    // reentrant=true は、直列化中の処理（evaluateAll → data-url-param 等）の内部から
    // 同一フラグメントへ再帰呼出された場合に使う。FIFO キューへ積むと現在の work の
    // 完了を待って自己デッドロックするため、キューを介さず即時実行する。並行呼出
    // （別イベント由来）は reentrant=false で必ずキューへ積み、適用順を保証する。
    const work = (): Promise<void> => {
      // ワーク実行中（await をまたぐ全期間）であることを記録する。配下の
      // マネージド fetch の bind-back が同一フラグメントを指すとき、この状態を見て
      // reentrant 実行へ切り替え自己デッドロックを避ける（Procedure.bindResult）。
      fragment.markBindingWorkStart();
      // DOM 反映の基準時点は 2 つに分かれる。
      // (1) data-bind 属性のミラー: ワーク開始時点の最新 in-memory を使う。捕捉
      //     スナップショット（data）だと、並行更新時に古い値を data-bind 属性へ
      //     書き込み、それを MutationObserver が拾って巻き戻す競合になり得る。
      //     in-memory は呼出時に同期確定済み（last-wins）。
      // (2) 入力欄への書き戻し: 適用直前に読み直す（後述の Form.syncValues 参照）。
      //     属性書き込みの完了を待つ間にユーザー操作が挟まるため、ワーク開始時点の
      //     値では古くなる。
      const current = fragment.getRawBindingData() ?? resolvedData;
      // reflectToAttribute=false のときは data-bind 属性への全データ直列化を抑止する
      // （一時変数の高頻度更新での直列化コストを避ける。in-memory が権威）。
      let chain = reflectToAttribute
        ? fragment.setAttribute(`${Env.prefix}bind`, JSON.stringify(current))
        : Promise.resolve();
      // ここから 3 段は「入力欄への書き戻し」。いずれも初期化（`Form.reset()`）と
      // 競合しうるため、宛先ごとに `resetSequence` と突き合わせて、この呼出より後に
      // 初期化された宛先へは書き込まない。書き戻し系の段を足すときは同じ判定を通す。
      if (element.tagName === 'FORM') {
        // (a) 自フォームの入力欄。適用直前に読み直した最新の in-memory を基準にする
        // （上記 (2)）。ワーク開始時点のスナップショットを使うと、data-bind 属性の
        // 書き込み（Queue = requestAnimationFrame バッチ）を待っている間にユーザーが
        // 別の入力を操作した場合、その編集を古い収集値で上書きして巻き戻してしまう。
        // さらに、巻き戻された内部値を後続の入力操作が再収集して確定させるため、
        // 誤った値が最終的に残る。
        chain = chain.then(() => {
          if (fragment.wasResetAfter(resetSequence)) {
            return undefined;
          }
          const latest = fragment.getRawBindingData() ?? resolvedData;
          return Form.syncValues(
            fragment,
            Form.resolveSyncValues(fragment, latest),
            false,
            origin,
          );
        });
      }
      // (b) 配下の `data-form-arg` フォームのうち、このフラグメントが当該キーを所有
      // するものへ値を流し込む。祖先がレコードを持ち、フォームがそのキーを編集する
      // 構成（`data-form-arg` と祖先のキーが対応する構成）を成立させるため。
      // 再評価より前に行うのは自フォームへの書き戻しと同じ理由（宣言バインドの
      // 評価結果を後から入れ直す）。初期化の判定はフォームごとに行う。
      chain = chain.then(() =>
        Form.syncAncestorArgForms(fragment, resetSequence, origin),
      );
      chain = chain.then(() => Core.evaluateAll(fragment, skipFragments));
      // (c) 入力欄への書き戻しは行生成より前に走るため、候補を `data-each` で流し込む
      // `<select>` では代入した時点で該当する `<option>` がまだ無く、供給された値が
      // 画面に載らない。候補が揃ったこの時点で載せ直す。初期化の判定は入力欄ごとに
      // 行う。
      chain = chain.then(() =>
        ElementFragment.retryUnappliedValueWrites(element, resetSequence),
      );
      chain = chain.then(() =>
        Core.reevaluateReactiveSpecialAttributes(fragment, skipFragments),
      );
      return chain.then(
        () => fragment.markBindingWorkEnd(),
        e => {
          fragment.markBindingWorkEnd();
          throw e;
        },
      );
    };
    // 再入は即時実行（自己デッドロック防止）、通常呼出は FIFO 直列化。
    return reentrant ? work() : fragment.enqueueBindingWork(work);
  }

  /**
   * 経路が存在しないことを表す番兵。`undefined` を値として持つ経路と区別します。
   */
  private static readonly ABSENT_PATH = Symbol('absent');

  /**
   * 変化した経路ごとに適用可否を判定し、棄却した経路を前の値のまま残したデータを
   * 返します。
   *
   * バインドデータの宛先は**経路単位**です（`docs/ja/値の供給と権威解決の設計書.md`）。
   * 更新はオブジェクト全体を差し替える形で届くため、前の値と突き合わせて「実際に
   * 変化した経路」を求め、その経路ごとに宛先の台帳と照合します。変化していない経路
   * には触らないため、絶えず走る再評価が台帳を汚しません。
   *
   * @param fragment 対象のフラグメント
   * @param previous 更新前のバインドデータ（初回は null）
   * @param next 更新で与えられたバインドデータ
   * @param origin この更新の由来（通番・種別・編集された経路）
   * @returns 適用を許した経路だけが `next` の値になったバインドデータ
   */
  private static resolveByPathAuthority(
    fragment: ElementFragment,
    previous: Record<string, unknown> | null,
    next: Record<string, unknown>,
    origin: ValueChangeOrigin,
  ): Record<string, unknown> {
    const merged = Core.mergePathAuthority(
      fragment,
      previous ?? {},
      next,
      origin,
      '',
    );
    return merged === Core.ABSENT_PATH
      ? next
      : (merged as Record<string, unknown>);
  }

  /**
   * 経路をたどりながら、変化した葉ごとに適用可否を判定します。
   *
   * @param fragment 対象のフラグメント
   * @param previous その経路の更新前の値（存在しない場合は `ABSENT_PATH`）
   * @param next その経路の更新後の値（存在しない場合は `ABSENT_PATH`）
   * @param origin この更新の由来
   * @param path その経路（ルートは空文字）
   * @returns 採用した値。その経路を持たせない場合は `ABSENT_PATH`
   */
  private static mergePathAuthority(
    fragment: ElementFragment,
    previous: unknown,
    next: unknown,
    origin: ValueChangeOrigin,
    path: string,
  ): unknown {
    if (Core.isPlainRecord(previous) && Core.isPlainRecord(next)) {
      const previousRecord = previous as Record<string, unknown>;
      const nextRecord = next as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      let substituted = Object.keys(previousRecord).some(
        key => !Object.prototype.hasOwnProperty.call(nextRecord, key),
      );
      const keys = new Set([
        ...Object.keys(previousRecord),
        ...Object.keys(nextRecord),
      ]);
      for (const key of keys) {
        const childPath = path === '' ? key : `${path}.${key}`;
        const child = Core.mergePathAuthority(
          fragment,
          Object.prototype.hasOwnProperty.call(previousRecord, key)
            ? previousRecord[key]
            : Core.ABSENT_PATH,
          Object.prototype.hasOwnProperty.call(nextRecord, key)
            ? nextRecord[key]
            : Core.ABSENT_PATH,
          origin,
          childPath,
        );
        if (child !== Core.ABSENT_PATH) {
          result[key] = child;
        }
        if (
          child !==
          (Object.prototype.hasOwnProperty.call(nextRecord, key)
            ? nextRecord[key]
            : Core.ABSENT_PATH)
        ) {
          substituted = true;
        }
      }
      // 棄却が無ければ渡されたオブジェクトをそのまま返す。差し替えると、呼び出し側が
      // 保持している参照と内部の値が別物になり、無用な複製も生む。
      return substituted ? result : nextRecord;
    }
    const pairedKeys = Core.resolveArrayPairing(fragment, previous, next, path);
    if (pairedKeys !== null) {
      const previousArray = previous as unknown[];
      const nextArray = next as unknown[];
      const merged = nextArray.map((item, index) =>
        Core.mergePathAuthority(
          fragment,
          previousArray[index],
          item,
          origin,
          `${path}[${pairedKeys[index]}]`,
        ),
      );
      return merged.some((item, index) => item !== nextArray[index])
        ? merged
        : nextArray;
    }
    // 葉（または構造が変わった部分木）。ここが 1 つの宛先になる。
    if (Core.isSameBindingValue(previous, next)) {
      // 変化していない経路は判定も記録もしない。
      return next;
    }
    const kind: ValueChangeKind = origin.editedPaths?.has(path)
      ? 'edit'
      : origin.kind;
    const pathOrigin: ValueChangeOrigin = {sequence: origin.sequence, kind};
    if (!fragment.canApplyPath(path, pathOrigin)) {
      return previous;
    }
    fragment.markPathApplied(path, pathOrigin);
    return next;
  }

  /**
   * 配列を要素ごとの宛先として扱えるかを判定し、扱える場合は各要素のリストキーを
   * 返します。
   *
   * 行の追加・削除・並べ替えが起きている場合は要素の対応が取れないため、配列全体を
   * 1 つの宛先として扱います（`null` を返す）。対応が取れる場合だけ要素へ降り、
   * 経路の要素にはリストキーを使います。添字は行の挿入・削除で意味が変わるため、
   * `data-each-key` の宣言があればそれを優先します（`Core.createListKey()`）。
   *
   * @param fragment 対象のフラグメント
   * @param previous 更新前の値
   * @param next 更新後の値
   * @param path その経路
   * @returns 要素ごとのリストキー。要素へ降りない場合は null
   */
  private static resolveArrayPairing(
    fragment: ElementFragment,
    previous: unknown,
    next: unknown,
    path: string,
  ): string[] | null {
    if (!Array.isArray(previous) || !Array.isArray(next)) {
      return null;
    }
    if (previous.length !== next.length || next.length === 0) {
      return null;
    }
    // `Core.createListKey()` は素のオブジェクト以外で `keyArg` を見ないため、
    // その場合は DOM の走査を省く（更新のたびに走るので費用が積み上がる）。
    const keyArg = next.some(item => Core.isPlainRecord(item))
      ? Core.resolveEachKeyArg(fragment, path)
      : null;
    const previousKeys = previous.map((item, index) =>
      Core.createListKey(
        item as Record<string, unknown> | string | number,
        keyArg,
        index,
      ),
    );
    const nextKeys = next.map((item, index) =>
      Core.createListKey(
        item as Record<string, unknown> | string | number,
        keyArg,
        index,
      ),
    );
    // 同じ位置に同じキーが並んでいるときだけ、要素同士が対応していると言える。
    if (previousKeys.some((key, index) => key !== nextKeys[index])) {
      return null;
    }
    return nextKeys;
  }

  /**
   * 配列の経路に対応する `data-each-key` の指定を探します。
   *
   * `data-each` の属性値は**式**なので、経路とそのまま文字列比較はできません。入れ子の
   * `data-each` は上位の行スコープの名前で書かれるためです（`data-each-arg="r"` の
   * 配下では `r.items`）。そこで宣言の側を絶対経路へ直してから比べます
   * （`Core.resolveEachDeclarationPath()`）。経路の側は配列要素の区間（`[キー]`）を
   * 取り除いた形にします。宣言は「どの階層の配列か」しか表さないためです。
   *
   * @param fragment 対象のフラグメント
   * @param path 配列の経路（`rows[7].items` のような形）
   * @returns リストキーに使うプロパティ名。宣言が無ければ null
   */
  private static resolveEachKeyArg(
    fragment: ElementFragment,
    path: string,
  ): string | null {
    const eachAttribute = `${Env.prefix}each`;
    const root = fragment.getTarget();
    // `rows[7].items` → `rows.items`。宣言は階層だけを表すため、要素の区間を落とす。
    const shapePath = path.replace(/\[[^\]]*\]/g, '');
    const elements = root.querySelectorAll(`[${eachAttribute}]`);
    for (const element of Array.from(elements)) {
      const declared = Core.resolveEachDeclarationPath(element, root);
      if (declared === null || declared !== shapePath) {
        continue;
      }
      const keyArg = element.getAttribute(`${eachAttribute}-key`);
      return keyArg === null ? null : keyArg.trim();
    }
    return null;
  }

  /**
   * `data-each` の宣言を、起点の要素から見た絶対経路へ直します。
   *
   * 上位の `data-each` を遡り、`data-each-arg` で公開された名前を上位の宣言へ
   * 置き換えます。`data-each-arg` が無い構成では要素データのキーがそのまま行スコープ
   * へ広がるため、上位の宣言を接頭に付けます。
   *
   * **`null` を返す 3 つの分岐は、振る舞いとしては観測できません。** 空の宣言や前置の
   * 不一致では、`null` を返さずに組み立てを続けても `rows.` や `.items` のような経路に
   * ならない文字列ができるだけで、呼び出し側の照合はどちらでも一致しません。意図を
   * 明示するために残していますが、**これらを対象にした回帰テストは書けません**
   * （`docs/ja/testing.md` の規則 2 に照らして、落ちないテストは足さない）。
   *
   * @param element `data-each` を持つ要素
   * @param root 起点の要素（経路の基準）
   * @returns 絶対経路。式が空、または経路として扱えない場合は null
   */
  private static resolveEachDeclarationPath(
    element: Element,
    root: HTMLElement,
  ): string | null {
    const eachAttribute = `${Env.prefix}each`;
    let path = element.getAttribute(eachAttribute)?.trim() ?? '';
    if (path === '') {
      return null;
    }
    let current = element.parentElement;
    while (current !== null && current !== root) {
      const ancestorPath = current.getAttribute(eachAttribute)?.trim();
      if (ancestorPath !== null && ancestorPath !== undefined) {
        if (ancestorPath === '') {
          return null;
        }
        const arg = current.getAttribute(`${eachAttribute}-arg`)?.trim();
        if (arg !== null && arg !== undefined && arg !== '') {
          // `data-each-arg="r"` の配下は `r.items` の形で書かれる。`r` を上位の宣言へ
          // 置き換える。前置が一致しない宣言は、この配列の入れ子ではない。
          if (path !== arg && !path.startsWith(`${arg}.`)) {
            return null;
          }
          path =
            path === arg
              ? ancestorPath
              : `${ancestorPath}.${path.slice(arg.length + 1)}`;
        } else {
          // `data-each-arg` が無い構成では、要素データのキーが行スコープへ広がる。
          path = `${ancestorPath}.${path}`;
        }
      }
      current = current.parentElement;
    }
    return path;
  }

  /**
   * 素のオブジェクト（配列でも null でもないオブジェクト）かどうかを返します。
   *
   * @param value 判定する値
   * @returns 素のオブジェクトなら true
   */
  private static isPlainRecord(value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype
    );
  }

  /**
   * バインドデータの 2 つの値が同じ内容かどうかを返します。
   *
   * 直列化できない値（`File` など）は参照の同一性で比べます。
   *
   * @param a 比較する値
   * @param b 比較する値
   * @returns 同じ内容なら true
   */
  private static isSameBindingValue(a: unknown, b: unknown): boolean {
    if (a === b) {
      return true;
    }
    if (a === Core.ABSENT_PATH || b === Core.ABSENT_PATH) {
      return false;
    }
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }

  /**
   * 指定要素のバインディングデータを取得します。`setBindingData` の対となる
   * 公式の読み取り API です。
   *
   * 既定では、その要素自身に設定された生のバインディングデータ（`data-bind` で
   * 宣言・更新された値そのもの）を返します。`resolved` を `true` にすると、DOM の
   * ネストをたどって解決済みのスコープ（内側が外側を上書きし、`data-each` の
   * 行データや派生データを含む、式評価で実際に見える値）を返します。
   *
   * 返されるオブジェクトは内部状態のコピーではなく参照のため、呼び出し側で
   * 直接書き換えないでください（更新は `setBindingData` を使用します）。
   *
   * @param element 対象要素
   * @param options 取得オプション。`resolved` が `true` なら解決済みスコープを返す
   * @return 既定はその要素の生バインディングデータ（無ければ `null`）。
   *     `resolved: true` のときは解決済みスコープ（常にオブジェクト）。
   */
  public static getBindingData(
    element: HTMLElement,
    options: {resolved?: boolean} = {},
  ): Record<string, unknown> | null {
    const fragment = Fragment.get(element);
    if (!(fragment instanceof ElementFragment)) {
      return null;
    }
    return options.resolved
      ? fragment.getBindingData()
      : fragment.getRawBindingData();
  }

  /**
   * 指定要素の式評価で見えるバインディングスコープをダンプします（デバッグ用）。
   *
   * 式（`data-if` / `{{...}}` など）の識別子は、その要素を起点に DOM のネストを
   * たどって解決されます（内側のスコープが外側を上書き）。本メソッドは解決済みの
   * スコープ（`resolved`）と、各キーがどの要素・どの種類（`bind` または `derive`）に
   * 由来するか（`sources`）を返します。開発モード時はコンソールにも出力します。
   *
   * 注意: フォームの入力値（`name` 属性）は、変更（change）や明示的な同期が行われる
   * までフォームの binding data に反映されません。したがって初期表示時点では、入力名と
   * 同名の識別子は**外側のスコープ**にフォールバックして解決されます。
   *
   * @param element 対象要素
   * @return 解決済みスコープと各キーの由来情報
   */
  public static dumpScope(element: HTMLElement): {
    resolved: Record<string, unknown>;
    sources: Record<
      string,
      {value: unknown; source: string; kind: 'bind' | 'derive'; depth: number}
    >;
  } {
    const fragment = Fragment.get(element) as ElementFragment | null;
    if (!fragment) {
      return {resolved: {}, sources: {}};
    }
    const resolved = fragment.getBindingData();
    const sources: Record<
      string,
      {value: unknown; source: string; kind: 'bind' | 'derive'; depth: number}
    > = {};
    const describe = (frag: ElementFragment): string => {
      const target = frag.getTarget();
      const id = Core.resolveElementId(target);
      if (id !== '') {
        return `#${id}`;
      }
      return target.tagName.toLowerCase();
    };
    const record = (
      data: Record<string, unknown> | null,
      frag: ElementFragment,
      kind: 'bind' | 'derive',
      depth: number,
    ): void => {
      if (!data) {
        return;
      }
      for (const key of Object.keys(data)) {
        if (!(key in sources)) {
          sources[key] = {
            value: data[key],
            source: describe(frag),
            kind,
            depth,
          };
        }
      }
    };
    let current: ElementFragment | null = fragment;
    let depth = 0;
    while (current) {
      // 子孫から見ると derive は同要素の bind より優先されるため derive を先に記録する。
      // ただし起点要素自身の derive は自身のスコープには現れない（子孫にのみ公開）。
      if (current !== fragment) {
        record(current.getRawDerivedBindingData(), current, 'derive', depth);
      }
      record(current.getRawBindingData(), current, 'bind', depth);
      current = current.getParent();
      depth += 1;
    }
    if (Dev.isEnabled()) {
      Log.info('[Haori]', 'scope dump for', element, {resolved, sources});
    }
    return {resolved, sources};
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
      if (fragment.getParent() === parent) {
        // すでに親の子としてフラグメント木へ繋がっているノードは、Haori 自身が
        // 差し込んで走査まで済ませたもの（`data-import` の断片）である。挿入し
        // 直すと走査が二重になるため、ここでは何もしない。
        return;
      }
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
      const previous = formFragment.getRawBindingData();
      let bindingData: Record<string, unknown>;
      if (arg) {
        // 生バインドデータを直接書き換えず、複製したうえで差し替える
        // （`Procedure` の双方向コミットと同じ扱い）。直接書き換えると、
        // `Core.setBindingData()` が控える「更新前の値」が更新後と同じ参照になり、
        // 変更前後を比べる処理から差分が見えなくなる。
        bindingData = {...(previous ?? {})};
        const key = String(arg);
        // 祖先が当該キーを所有する場合は、その値を土台に収集値を重ねる。収集値だけで
        // 置き換えると、入力欄に無いフィールド（`id` など）がフォーム自身のコピーから
        // 抜け落ち、そのコピーが祖先をシャドーするためフォーム内の式から参照できなく
        // なる。祖先が当該キーを更新したときはこのコピーを解除して入れ直すため
        // （`Form.syncAncestorArgForms()`）、古い値が残り続けることはない。
        const ancestor = Form.resolveAncestorArgOwner(formFragment, key);
        bindingData[key] = Form.mergeCollectedValues(
          (ancestor
            ? ancestor.value
            : (bindingData[key] as Record<string, unknown> | undefined)) ??
            null,
          values,
        );
      } else {
        bindingData = Form.mergeCollectedValues(previous, values);
      }
      promises.push(
        // 値の設定に伴うコミットなので、値の供給ではない更新として扱う（権威を
        // 持たず、ユーザー編集の印も解除しない）。
        Core.setBindingData(formFragment.getTarget(), bindingData, {
          kind: 'nonSupply',
          sequence: ElementFragment.nextSequence(),
        }),
      );
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
   * 開発モードで、falsy により非表示になった `data-if` 式の診断情報を出力します。
   *
   * 式が参照するトップレベル識別子について、解決値と由来要素（`dumpScope` の
   * `sources`）を併記します。フォームの `name` 由来の値が想定外のスコープから
   * 解決される等のスコープ競合をデバッグするための補助です。
   *
   * @param fragment data-if フラグメント
   * @return 戻り値はありません。
   */
  private static logFalsyIfDiagnostics(fragment: ElementFragment): void {
    const expression = fragment.getRawAttribute(`${Env.prefix}if`);
    if (typeof expression !== 'string' || expression.indexOf('{{') >= 0) {
      // テンプレート式（{{...}}）を含む属性は対象外（純粋な data-if 式のみ）。
      return;
    }
    if (Expression.hasCompileFailure(expression)) {
      // コンパイルに失敗した式の評価結果は null（= falsy）になる。参照値を並べて
      // 「falsy だった」と報告すると、条件が真に見えるのに非表示という矛盾した
      // 診断になるため、評価できていないことを名指しで報告する。
      Log.warn(
        '[Haori]',
        'data-if is hidden because the expression could not be compiled' +
          ' (see the preceding compile error):',
        expression,
      );
      return;
    }
    const {sources} = Core.dumpScope(fragment.getTarget());
    // 式に現れるトップレベル識別子（プロパティアクセスの末尾などは除く）を抽出する。
    const identifiers = new Set<string>();
    const matches = expression.match(/[A-Za-z_$][\w$]*/g) ?? [];
    let prevCharIndex = 0;
    matches.forEach(name => {
      const at = expression.indexOf(name, prevCharIndex);
      prevCharIndex = at + name.length;
      // 直前が `.` の場合はプロパティ名なのでトップレベル識別子ではない。
      if (at > 0 && expression[at - 1] === '.') {
        return;
      }
      identifiers.add(name);
    });
    const used: Record<string, unknown> = {};
    identifiers.forEach(name => {
      if (name in sources) {
        used[name] = sources[name];
      }
    });
    Log.info(
      '[Haori]',
      'data-if is falsy (hidden):',
      expression,
      '— referenced scope:',
      used,
    );
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
      // 開発モードでは、falsy で非表示になった data-if 式と、その式が参照する
      // 識別子の解決値・由来（どの要素の bind/derive か）を出力する。
      // 「フォームの name 由来の値が想定外に解決される」等のスコープ競合の特定に役立つ。
      if (Dev.isEnabled()) {
        Core.logFalsyIfDiagnostics(fragment);
      }
      promises.push(
        fragment.hide().then(() => {
          HaoriEvent.hide(fragment.getTarget());
        }),
      );
    } else {
      // 非表示のあいだ検証対象から外していた入力は、子の評価を始める前に復帰させる。
      // 子の評価より後に復帰させると、`data-attr-disabled` の適用結果を打ち消す。
      fragment.restoreFormControlsDisabledByIf();
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
            // 再表示された分岐の中の外部ライブラリ連携を再同期する（未適用なら適用）。
            Enhance.refreshSubtree(fragment.getTarget());
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
      state = {running: false, rerunRequested: false, settled: null};
      Core.EACH_UPDATE_STATES.set(fragment, state);
    }
    return state;
  }

  /**
   * each要素を評価します。
   * 非表示または未マウントの場合は処理をスキップします。
   *
   * 同一フラグメントに対する差分更新が並行・再入しないように直列化します。
   * 実行中に再度呼び出された場合は再評価要求を記録し、現在進行中の更新の完了
   * Promise（後続の再実行も含む）を返します。これにより、bind 直後のリアクティブ
   * 再評価が重なっても data-each の描画が破壊されず、かつ呼び出し元（`evaluateAll`→
   * `setBindingData`→`haori:bindcomplete`）が**最終的な DOM 反映まで確実に待機**できます。
   *
   * @param fragment 対象フラグメント
   * @return 差分更新（再実行を含む）の完了 Promise
   */
  public static evaluateEach(fragment: ElementFragment): Promise<void> {
    if (Dev.isEnabled()) {
      // 行スコープの名前は、描画をスキップする判定より前に登録する。スキップした
      // 場合はテンプレートが切り出されないため、`scan` がそのまま行のマークアップ
      // へ降りてコンテナのスコープで評価する。このとき行スコープの名前はスコープ外
      // になるので、開発モードの診断が誤って「別のスコープでは供給されている」と
      // 報告しないよう、先に名前を知らせておく必要がある。
      // 本番では属性の評価コストも払わないよう、ここで分岐する
      // （`evaluateEach` はバインド更新のたびに呼ばれる）。
      Expression.recordRowScopeIdentifiers([
        Core.getRowScopeName(fragment, 'each-arg'),
        Core.getRowScopeName(fragment, 'each-index'),
      ]);
    }
    if (!fragment.isVisible() || !fragment.isMounted()) {
      return Promise.resolve();
    }
    const state = Core.getEachUpdateState(fragment);
    if (state.running) {
      // 実行中は再評価要求を記録し、進行中の settle Promise を待つ
      // （最新データの描画完了まで待てるようにする）。
      state.rerunRequested = true;
      return state.settled ?? Promise.resolve();
    }
    return Core.runEachUpdateLoop(fragment, state);
  }

  /**
   * `data-each` が行スコープへ公開する名前を返します。
   *
   * @param fragment `data-each` コンテナのフラグメント
   * @param suffix 参照する属性のサフィックス（`each-arg` または `each-index`）
   * @returns 公開される名前。指定が無い場合は null
   */
  private static getRowScopeName(
    fragment: ElementFragment,
    suffix: 'each-arg' | 'each-index',
  ): string | null {
    const value = fragment.getAttribute(`${Env.prefix}${suffix}`);
    if (typeof value !== 'string' || value === '') {
      return null;
    }
    return value;
  }

  /**
   * `data-each` の差分更新が実行中かどうかを返します。
   *
   * 行の描画中に起動された処理（行の中の `data-fetch` など）が、その行の要素データ
   * を書き換えて所有者へ書き戻すとき、完了を待つべきかの判定に使います。実行中の
   * 描画ループの完了を待つと、ループ側は行の初期化（= その処理）の完了を待っている
   * ため相互に待ち合って止まります。
   *
   * @param fragment `data-each` コンテナのフラグメント
   * @returns 差分更新が実行中なら true
   */
  public static isEachUpdateRunning(fragment: ElementFragment): boolean {
    return Core.getEachUpdateState(fragment).running;
  }

  /**
   * data-each の差分更新を、再評価要求が無くなるまで直列に繰り返し実行します。
   * 進行中・後続の再実行を含む完了 Promise を state に保持し、再入した呼び出し元が
   * 同じ Promise を待てるようにします。
   *
   * @param fragment 対象フラグメント
   * @param state 再入制御状態
   * @return すべての差分更新が安定するまでの完了 Promise
   */
  private static runEachUpdateLoop(
    fragment: ElementFragment,
    state: EachUpdateState,
  ): Promise<void> {
    state.running = true;
    // 新しい描画サイクルの開始時に完了マーカーを外す。
    fragment.getTarget().removeAttribute(`${Env.prefix}each-done`);
    const settled = (async () => {
      try {
        do {
          state.rerunRequested = false;
          await Core.performEachUpdate(fragment);
        } while (state.rerunRequested);
        // 全行の描画が安定して完了したことを示すマーカーを付与する。
        // 外部テストは `[data-each-done]` を待機して描画完了を検知できる。
        const target = fragment.getTarget();
        target.setAttribute(`${Env.prefix}each-done`, '');
        // 外部ライブラリ連携（`data-enhance`）を描画確定ごとに再同期する。
        // 宣言だけで Choices.js 等の `refresh()` を呼べるようにするため、
        // `data-each-rendered-run` より前に実行する。
        Enhance.refreshSubtree(target);
        // data-each-rendered-run: 描画確定ごとに一度、任意 JS を実行する。
        // 外部の select 拡張ライブラリ（Choices.js 等）の再同期フックに使える。
        Core.runEachRenderedScript(target);
      } finally {
        state.running = false;
        state.settled = null;
      }
      // data-each-rendered-change: 描画確定後に change を宣言的に発火する。
      // rendered-run より後に実行し、外部ライブラリの再同期を先に済ませる。
      // 再入制御の解除後（running=false）に発火することで、change の手続きが
      // 同一コンテナの再評価を要求した場合も取りこぼさない。
      Core.runEachRenderedChange(fragment);
    })();
    state.settled = settled;
    return settled;
  }

  /**
   * data-each-rendered-run 属性に指定された JS を、描画確定後に一度実行します。
   *
   * data-each の再描画が安定し `data-each-done` が付与されるたびに呼び出され、
   * 再 fetch・再バインドのたびに確実な再同期契機を提供します。本体内の `this`
   * は対象コンテナ要素に束縛され、外部の select 拡張ライブラリ（Choices.js 等）
   * の再同期フック（例: `window.__choicesRefresh(this)`）として利用できます。
   *
   * @param target data-each コンテナ要素
   */
  private static runEachRenderedScript(target: HTMLElement): void {
    const attrName = `${Env.prefix}each-rendered-run`;
    if (!target.hasAttribute(attrName)) {
      return;
    }
    const body = String(target.getAttribute(attrName) ?? '');
    // data-{event}-run と同様に、まず単一式として評価できるか試し、失敗した
    // 場合は文ブロックとして生成する。末尾の改行は行コメント対策。
    let script: (() => unknown) | null = null;
    try {
      script = new Function(
        `"use strict"; return (\n${body}\n);`,
      ) as () => unknown;
    } catch {
      try {
        script = new Function(`"use strict";\n${body}\n`) as () => unknown;
      } catch (e) {
        Log.error('[Haori]', `Invalid each-rendered-run script: ${e}`);
      }
    }
    if (script) {
      try {
        script.call(target);
      } catch (e) {
        Log.error('[Haori]', `each-rendered-run execution error: ${e}`);
      }
    }
  }

  /**
   * data-each-rendered-change 属性に従い、描画確定後に対象要素へ `change`
   * イベント（バブリングあり）を発火します。
   *
   * API から取得した候補を `data-each` で流し込んだ `<select>` について、
   * 「既定選択を確定して初期データを取得する」パターンをインライン JS なしで
   * 宣言できるようにするための属性です。`<select>` はブラウザが先頭 option を
   * 自動選択するため、描画確定後の `change` がそのまま既定選択の確定になります。
   *
   * 描画行が 0 件のときは発火しません（確定すべき既定値が存在しないため）。
   * この場合は初回発火の判定も消費しないため、行が入った最初の描画で発火します。
   *
   * 属性値による動作の違い:
   * - 省略または `once`: 行が 1 件以上ある最初の描画確定時のみ発火する（既定）。
   * - `always`: 描画確定ごとに毎回発火する。
   *
   * 既定を `once` にしているのは、`change` の手続きが `data-each` の取得元を
   * 再バインドする構成（候補取得 → 選択確定 → 明細取得 → 再描画）で、毎回発火
   * させると再帰的な発火ループになり得るためです。
   *
   * @param fragment data-each コンテナのフラグメント
   */
  private static runEachRenderedChange(fragment: ElementFragment): void {
    const attrName = `${Env.prefix}each-rendered-change`;
    const target = fragment.getTarget();
    if (!target.hasAttribute(attrName)) {
      return;
    }
    const rawMode = String(target.getAttribute(attrName) ?? '')
      .trim()
      .toLowerCase();
    let always = false;
    if (rawMode === 'always') {
      always = true;
    } else if (rawMode !== '' && rawMode !== 'once') {
      // 描画確定ごとに警告が出続けないよう、要素ごとに一度だけ出力する。
      if (!Core.EACH_RENDERED_CHANGE_WARNED.has(target)) {
        Core.EACH_RENDERED_CHANGE_WARNED.add(target);
        Log.warn(
          '[Haori]',
          `Invalid ${attrName} value: "${rawMode}".` +
            ' Use "once" (default) or "always".',
        );
      }
    }
    // 描画行が 0 件のときは発火しない（既定選択として確定すべき値が無い）。
    if (Core.countEachRenderedRows(fragment) === 0) {
      return;
    }
    if (!always) {
      if (Core.EACH_RENDERED_CHANGE_FIRED.has(target)) {
        return;
      }
      Core.EACH_RENDERED_CHANGE_FIRED.add(target);
    }
    try {
      target.dispatchEvent(new Event('change', {bubbles: true}));
    } catch (e) {
      Log.error('[Haori]', `each-rendered-change dispatch error: ${e}`);
    }
  }

  /**
   * data-each コンテナに描画されている行数を返します。
   *
   * 行は差分更新で `data-row` 属性が付与されるため、それを数えます。
   * `data-each-before` / `data-each-after` の固定要素や、テンプレート以外の
   * 静的な子要素（`data-each-before` の付け忘れを含む）は行数に含めません。
   *
   * @param fragment data-each コンテナのフラグメント
   * @returns 描画済みの行数
   */
  private static countEachRenderedRows(fragment: ElementFragment): number {
    let count = 0;
    for (const child of fragment.getChildElementFragments()) {
      if (child.getTarget().hasAttribute(`${Env.prefix}row`)) {
        count += 1;
      }
    }
    return count;
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
      if (!found) {
        // フォールバック: フラグメントの子に要素が無いが DOM には要素子がある場合
        // （タブ表示やネスト data-if など特定フローでフラグメント木と DOM の子が
        //  同期しない状況の復旧）、DOM の要素子からテンプレートを復旧する。
        // この分岐は template===null かつフラグメント子テンプレートも無い「復旧専用
        // パス」であり、each-before/after 以外の要素子はすべて each に未管理の残留物
        // とみなせる。先頭要素子をテンプレートとして採用し、残りの該当要素子も
        // まとめて除去して、後続の updateDiff をクリーンな状態から開始する。
        const target = fragment.getTarget();
        const staleChildren = Array.from(target.children).filter(
          domChild =>
            !domChild.hasAttribute(`${Env.prefix}each-before`) &&
            !domChild.hasAttribute(`${Env.prefix}each-after`),
        );
        staleChildren.forEach(domChild => {
          // 最初の要素子をテンプレートとして採用する。
          if (!found) {
            const childFragment = Fragment.get(domChild);
            if (childFragment instanceof ElementFragment) {
              template = childFragment.clone();
              Core.markFreshInitializationSkippable(template);
              fragment.setTemplate(template);
              found = true;
            }
          }
          // フラグメントに紐づく残留子があれば children から除外する。
          const frag = Fragment.get(domChild);
          if (
            frag instanceof ElementFragment &&
            fragment.getChildren().includes(frag)
          ) {
            fragment.removeChild(frag);
            frag.setMounted(false);
          }
          // 未追跡の素の DOM ノードも含め、残留要素子は DOM から除去する。
          if (domChild.parentNode) {
            domChild.parentNode.removeChild(domChild);
          }
        });
      }
      // テンプレートのunmount完了後にupdateDiffを実行
      return this.updateDiff(fragment, data).then(() => {
        fragment.setEachInputSignature(nextEachInputSignature);
      });
    }
    if (fragment.getEachInputSignature() === nextEachInputSignature) {
      // 行の構成（件数・並び・要素データ）は変わらないので差分更新は不要だが、
      // 行の外にあるデータが変わっている可能性はある。行スコープの値だけで描画が
      // 決まらないテンプレートでは、既存行の子孫を再評価しないと行外データの更新が
      // 行内へ届かない（行内の選択肢を別の data-each で描画する構成など）。
      return Core.reevaluateEachRows(fragment);
    }
    return this.updateDiff(fragment, data).then(() => {
      fragment.setEachInputSignature(nextEachInputSignature);
    });
  }

  /**
   * 差分更新が不要な `data-each` の既存行について、子孫の再評価だけを行います。
   *
   * 行スコープの値だけで描画が決まるテンプレートでは、行の要素データが同値である
   * 限り描画結果も変わらないため何もしません。
   *
   * @param fragment `data-each` コンテナのフラグメント
   * @returns 再評価完了の Promise
   */
  private static reevaluateEachRows(fragment: ElementFragment): Promise<void> {
    if (Core.isRowLocalEachTemplate(fragment)) {
      return Promise.resolve();
    }
    const rows = fragment
      .getChildElementFragments()
      .filter(
        child =>
          !child.hasAttribute(`${Env.prefix}each-before`) &&
          !child.hasAttribute(`${Env.prefix}each-after`),
      );
    if (rows.length === 0) {
      return Promise.resolve();
    }
    return Promise.all(rows.map(row => Core.evaluateAll(row))).then(
      () => undefined,
    );
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
    // 行スコープの外を参照するテンプレートは、要素データが同値でも行外データの
    // 更新で描画が変わる。走査ごと省略すると更新が行内へ届かない。
    if (!Core.isRowLocalEachTemplate(fragment)) {
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
   * `data-each` のテンプレートが行スコープの値だけで描画できるかどうかを返します。
   *
   * 行スコープとは `data-each-arg` と `data-each-index` で公開される名前です。
   * テンプレート内の式がこの名前だけを参照している場合、要素データが同値なら
   * 描画結果も変わらないため、行の子孫の再評価を省略できます。逆に行の外にある
   * 名前（別の一覧や親スコープの値）を参照している場合は、要素データが同値でも
   * 再評価が必要です。
   *
   * 判定できない場合はすべて「行スコープ外」（= 再評価が必要）へ倒します。
   * 具体的には、テンプレート未確定、`data-each-arg` の無い構成（要素データのキーが
   * 行スコープへ直接展開されるため参照名を静的に決められない）、解析できない式、
   * 既知でない `data-*` 属性が該当します。
   *
   * 判定結果はテンプレート単位で不変なのでフラグメントへ保存して再利用します。
   *
   * @param fragment `data-each` コンテナのフラグメント
   * @returns 行スコープの値だけで描画できるなら true
   */
  private static isRowLocalEachTemplate(fragment: ElementFragment): boolean {
    const cached = fragment.getRowLocalTemplate();
    if (cached !== null) {
      return cached;
    }
    const template = fragment.getTemplate();
    const itemArg = fragment.getAttribute(`${Env.prefix}each-arg`);
    if (template === null || !itemArg) {
      fragment.setRowLocalTemplate(false);
      return false;
    }
    const scopeNames = new Set<string>([String(itemArg)]);
    const indexKey = fragment.getAttribute(`${Env.prefix}each-index`);
    if (indexKey) {
      scopeNames.add(String(indexKey));
    }
    const rowLocal = Core.isRowLocalSubtree(template, scopeNames);
    fragment.setRowLocalTemplate(rowLocal);
    return rowLocal;
  }

  /**
   * フラグメントとその子孫の式が、指定した名前だけを参照しているかを判定します。
   *
   * @param fragment 判定対象フラグメント
   * @param scopeNames 参照してよい名前の集合
   * @returns 指定した名前だけを参照しているなら true
   */
  private static isRowLocalSubtree(
    fragment: ElementFragment,
    scopeNames: ReadonlySet<string>,
  ): boolean {
    for (const name of fragment.getAttributeNames()) {
      const rawValue = fragment.getRawAttribute(name);
      const raw = typeof rawValue === 'string' ? rawValue : '';
      if (raw.includes('{{')) {
        if (
          !Core.areExpressionsRowLocal(
            Core.extractInterpolations(raw),
            scopeNames,
          )
        ) {
          return false;
        }
        continue;
      }
      if (!name.startsWith(Env.prefix)) {
        // 素の HTML 属性で `{{` を含まないものは静的。
        continue;
      }
      const suffix = name.slice(Env.prefix.length);
      if (Core.ROW_LOCAL_EXPRESSION_ATTRIBUTES.has(suffix)) {
        if (!Core.areExpressionsRowLocal([raw], scopeNames)) {
          return false;
        }
        continue;
      }
      if (!Core.ROW_LOCAL_STATIC_ATTRIBUTES.has(suffix)) {
        return false;
      }
    }
    // ネストした data-each は自身の行スコープを子孫へ追加で公開する。
    let childScopeNames = scopeNames;
    if (fragment.hasAttribute(`${Env.prefix}each`)) {
      const nestedArg = fragment.getRawAttribute(`${Env.prefix}each-arg`);
      if (typeof nestedArg !== 'string' || nestedArg === '') {
        return false;
      }
      const nested = new Set(scopeNames);
      nested.add(nestedArg);
      const nestedIndex = fragment.getRawAttribute(`${Env.prefix}each-index`);
      if (typeof nestedIndex === 'string' && nestedIndex !== '') {
        nested.add(nestedIndex);
      }
      childScopeNames = nested;
    }
    for (const child of fragment.getChildren()) {
      if (child instanceof ElementFragment) {
        if (!Core.isRowLocalSubtree(child, childScopeNames)) {
          return false;
        }
      } else if (child instanceof TextFragment) {
        const raw = child.getRawText();
        if (
          raw.includes('{{') &&
          !Core.areExpressionsRowLocal(
            Core.extractInterpolations(raw),
            scopeNames,
          )
        ) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * 式の集合が、指定した名前だけを参照しているかを判定します。
   *
   * 参照名を取り出せなかった式は安全側（= 指定外を参照している）として扱います。
   *
   * @param expressions 判定対象の式
   * @param scopeNames 参照してよい名前の集合
   * @returns 指定した名前だけを参照しているなら true
   */
  private static areExpressionsRowLocal(
    expressions: string[],
    scopeNames: ReadonlySet<string>,
  ): boolean {
    for (const expression of expressions) {
      const trimmed = expression.trim();
      if (trimmed === '') {
        continue;
      }
      const identifiers = Expression.getFreeIdentifiers(trimmed);
      if (identifiers.length === 0) {
        return false;
      }
      if (identifiers.some(identifier => !scopeNames.has(identifier))) {
        return false;
      }
    }
    return true;
  }

  /**
   * 文字列から `{{式}}` の中身を取り出します。
   *
   * @param raw 評価前の文字列
   * @returns 式の一覧（出現順）
   */
  private static extractInterpolations(raw: string): string[] {
    const expressions: string[] = [];
    const pattern = /\{\{([\s\S]*?)\}\}/g;
    let match = pattern.exec(raw);
    while (match !== null) {
      expressions.push(match[1]);
      match = pattern.exec(raw);
    }
    return expressions;
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
   * 要素の `id` 属性を安全に取得します。
   *
   * `<form>` は配下の入力要素の `name` が同名の組み込みプロパティを上書きします
   * （HTML 仕様の named access）。そのため `<input name="id">` を含むフォームでは
   * `form.id` が文字列ではなく input 要素を返し、文字列として扱うと
   * `[object HTMLInputElement]` になったり `.trim()` で TypeError になります。
   * 属性から直接読み取ってこの上書きを避けます。
   *
   * @param element 対象要素
   * @returns `id` 属性の値。指定が無ければ空文字
   */
  private static resolveElementId(element: HTMLElement): string {
    return element.getAttribute('id') ?? '';
  }

  /**
   * data-derive subtree host の識別子を作成します。
   *
   * @param fragment 対象フラグメント
   * @returns host 識別子
   */
  private static createDerivedSubtreeHostId(fragment: ElementFragment): string {
    const segments: string[] = [];
    let current: ElementFragment | null = fragment;
    while (current) {
      const target = current.getTarget();
      if (!(target instanceof HTMLElement)) {
        break;
      }
      let segment = target.tagName.toLowerCase();
      const id = Core.resolveElementId(target).trim();
      if (id !== '') {
        segment += `#${id}`;
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
    return fragment
      .getChildren()
      .some(
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
    const removedChildren = new Set<ElementFragment>();
    childElements = childElements.filter((child, previousIndex) => {
      if (!newKeySet.has(String(child.getListKey()))) {
        removedChildren.add(child);
        const removedKey = child.getListKey();
        if (removedKey !== null) {
          // rowremove は行が DOM から外れる前に発火する。外れた後に発火しても
          // 祖先（data-each コンテナ）へ伝播しないため購読できない。
          HaoriEvent.rowRemove(child.getTarget(), removedKey, previousIndex);
        }
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
    // 挿入位置の基準となる現在の子並び。削除対象は除外する（除外しないと、削除中の
    // フラグメントを挿入位置の参照に使ってしまう）。
    const insertTargets = parent
      .getChildElementFragments()
      .filter(child => !removedChildren.has(child));
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
        const currentInsertIndex = baseInsertIndex + loopIndex;
        // 行の入力が同一なら子孫の再評価をスキップする。
        chain = chain.then(() =>
          Core.updateRowFragment(
            child,
            item,
            indexKey as string | null,
            itemIndex,
            itemArg ? String(itemArg) : null,
            newKey,
          ).then(changed =>
            // 再利用行も新しい並び順の位置へ移動する。移動しないと、配列を並べ替え
            // ただけの更新（data-each-key 指定時はキーが変わらないため全行が再利用
            // される）で DOM の順序が古いまま残る。
            Core.repositionEachRow(
              parent,
              child,
              insertTargets,
              currentInsertIndex,
            ).then(movedFrom => {
              if (movedFrom !== null) {
                // 行の位置が実際に変わったときだけ rowmove を発火する。
                // インデックスは固定要素（data-each-before / -after）を除いた
                // 行だけの並びで数える。
                HaoriEvent.rowMove(
                  child.getTarget(),
                  newKey,
                  movedFrom - baseInsertIndex,
                  loopIndex,
                );
              }
              if (!changed) {
                // 行の入力が同一なら子孫の再評価も値の再適用も行わない。
                return undefined;
              }
              // 再利用行に別のレコードが入るため、行内の編集の印を解除する。
              // 解除しないと、宣言バインドで値が決まる入力欄が前のレコードの値を
              // 表示したまま残る（行データ由来の書き戻しは宣言バインド対象を
              // 除外するため、この経路以外では更新されない）。
              Core.clearUserEditMarks(child);
              return Core.evaluateAll(child).then(() =>
                Core.applyRowFormValues(parent, child, item),
              );
            }),
          ),
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
              .then(() => Core.initializeFreshEachRow(child))
              .then(() => Core.applyRowFormValues(parent, child, item))
              .then(() => {
                // rowadd は行の内容描画と入力値の反映まで終えてから発火する。
                // 購読側がその場で行内の DOM を参照できるようにするため。
                HaoriEvent.rowAdd(child.getTarget(), newKey, itemIndex, item);
              });
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
   * 再利用した `data-each` の行を、新しい並び順の位置へ移動します。
   *
   * `insertTargets` は現在の子並びを表す作業用配列で、移動に合わせて更新します。
   * すでに目的の位置にある場合は何もしません。
   *
   * @param parent `data-each` コンテナのフラグメント
   * @param row 移動対象の行フラグメント
   * @param insertTargets 現在の子並び（この呼び出しで更新される）
   * @param targetIndex 移動先のインデックス
   * @returns 移動した場合は移動前のインデックス、移動していない場合は null で
   *   解決される Promise（`haori:rowmove` の発火判定に使う）
   */
  private static repositionEachRow(
    parent: ElementFragment,
    row: ElementFragment,
    insertTargets: ElementFragment[],
    targetIndex: number,
  ): Promise<number | null> {
    const currentIndex = insertTargets.indexOf(row);
    if (currentIndex === -1 || currentIndex === targetIndex) {
      return Promise.resolve(null);
    }
    insertTargets.splice(currentIndex, 1);
    const referenceChild = insertTargets[targetIndex] ?? null;
    insertTargets.splice(targetIndex, 0, row);
    return parent.insertBefore(row, referenceChild).then(() => currentIndex);
  }

  /**
   * `data-each` の行の入力欄へ、その行の要素データを反映します。
   *
   * `data-each` と `data-form-list` を同一要素へ指定した「編集可能な繰り返し行」では、
   * 行内の入力欄は要素データのキーと `name` で対応します。`Core.setBindingData()` の
   * 逆方向同期（`Form.syncValues`）は `Core.evaluateAll`（= 行生成）より**前**に走る
   * ため、その更新で生成・更新された行には値が入りません。ここで行単位に補います。
   *
   * 呼び出すのは「新規生成した行」と「要素データが変化した再利用行」だけです。
   * 変化していない行へ再適用すると、描画の待ち時間中に利用者が編集した入力欄を
   * 古い値で巻き戻す競合になります（0.26.1 で修正した問題と同種）。行の途中へ要素を
   * 挿入すると以降の行は別の要素データを担当することになるため、変化した再利用行への
   * 適用は必要です（これを省くと挿入位置以降の入力値が前の行のまま残ります）。
   *
   * 取得元（`data-each`）と収集先（`data-form-list`）が**別の配列**を指す構成では
   * 反映しません。要素データが権威なのは「行の入力欄が集まって配列要素になる」
   * 場合だけで、別の配列を繰り返している行では、要素データは入力欄を表しません。
   * 反映すると、要素データに無い `name` の欄（選択のチェックボックスなど）が
   * 空になります（`Form.isCollectedListFromEachSource()`）。
   *
   * @param parent `data-each` コンテナのフラグメント
   * @param row 行のフラグメント
   * @param item 行の要素データ
   * @returns 反映完了の Promise
   */
  private static applyRowFormValues(
    parent: ElementFragment,
    row: ElementFragment,
    item: Record<string, unknown> | string | number,
  ): Promise<void> {
    if (!parent.hasAttribute(`${Env.prefix}form-list`)) {
      return Promise.resolve();
    }
    if (!Form.isCollectedListFromEachSource(parent)) {
      return Promise.resolve();
    }
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      // プリミティブ配列は入力欄の name と対応付けられない。
      return Promise.resolve();
    }
    return Form.syncRowValues(row, item as Record<string, unknown>);
  }

  /**
   * リスト比較用のキーを生成します。
   *
   * `data-each` の差分更新で行と要素データを対応付けるキーです。行を指した書き込み
   * （`Procedure` の行への copy / bind）でも、`data-each-key` 指定時に「どの配列
   * 要素がその行か」をキーで特定するために使うため公開しています。生成規則を
   * 呼び出し側で作り直すと差分更新との対応が崩れるためです。
   *
   * @param item 対象オブジェクト
   * @param keyArg リストキーに使用するプロパティ名
   * @param index 配列のインデックス
   * @returns リストキー
   */
  public static createListKey(
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
    let bindingData: Record<string, unknown>;
    if (typeof data === 'object' && data !== null) {
      // data-each-arg 指定時は要素データをそのキーで包む。
      bindingData = arg ? {[arg]: {...data}} : {...data};
    } else if (arg) {
      bindingData = {[arg]: data};
    } else {
      Log.error(
        '[Haori]',
        `Primitive value requires '${Env.prefix}each-arg' attribute: ${data}`,
      );
      return Promise.resolve(false);
    }
    // インデックスは要素データを包んだ「外側」＝行スコープの直下へ置く。
    // data-each-arg 指定時に要素データの内側へ入れると、`{{i}}` が解決できず
    // （`{{arg.i}}` になってしまう）、さらに要素データ自体がインデックスキーで
    // 汚染されて双方向バインドの書き戻しや差分比較へ混入する。
    if (indexKey) {
      bindingData[indexKey] = index;
    }
    const normalizedBindingData = bindingData;
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
    // File / Blob は列挙可能なプロパティを持たないため、そのままオブジェクトとして
    // 走査すると別ファイルでも同じ `{}` になり、差分なしと誤判定されて再評価が
    // 行われない。識別可能な属性でシグネチャを作る。
    if (typeof File !== 'undefined' && value instanceof File) {
      return (
        `[File:${value.name}:${value.size}` +
        `:${value.lastModified}:${value.type}]`
      );
    }
    if (typeof Blob !== 'undefined' && value instanceof Blob) {
      return `[Blob:${value.size}:${value.type}]`;
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
