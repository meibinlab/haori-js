/**
 * @fileoverview 定期取得（ポーリング）トリガー機能
 *
 * `data-poll-*` 属性を監視し、一定間隔で Procedure を実行します。
 */

import Core from './core';
import Env from './env';
import HaoriEvent from './event';
import Fragment, {ElementFragment} from './fragment';
import Log from './log';
import Procedure from './procedure';

/**
 * ポーリングが恒久停止した理由です。
 *
 * - `until`: `data-poll-until` の条件が成立した
 * - `timeout`: `data-poll-timeout` に到達した
 * - `error`: `data-poll-error-limit` の連続失敗回数に到達した
 * - `detached`: 対象要素が DOM から外れた
 */
export type PollStopReason = 'until' | 'timeout' | 'error' | 'detached';

/**
 * ポーリングの登録情報です。
 */
interface PollRegistration {
  /** 対象フラグメント */
  fragment: ElementFragment;

  /**
   * 設定の同一性を判定するキー。
   *
   * `data-poll-*` の**生の属性値**（テンプレート展開前）だけを連結したもので、
   * 評価値は含めません。詳細は `buildConfigKey()` のコメントを参照してください。
   */
  configKey: string;

  /** 取得間隔（ミリ秒） */
  intervalMs: number;

  /** 打ち切り時間（ミリ秒）。無制限の場合は null */
  timeoutMs: number | null;

  /** 連続失敗の上限回数。無制限の場合は null */
  errorLimit: number | null;

  /** ポーリング開始時刻（`performance.now()` 基準） */
  startedAt: number;

  /** 次回実行のタイマー ID。待機していない場合は null */
  intervalTimerId: ReturnType<typeof setTimeout> | null;

  /** 打ち切り用タイマー ID。無制限の場合は null */
  timeoutTimerId: ReturnType<typeof setTimeout> | null;

  /** 手続きの実行中かどうか */
  fetching: boolean;

  /** 一時停止中（非表示または `data-poll-disabled`）かどうか */
  paused: boolean;

  /** 恒久停止済みかどうか */
  stopped: boolean;

  /** 打ち切り時間に到達したかどうか */
  timedOut: boolean;

  /** 恒久停止の理由。停止していない場合は null */
  stopReason: PollStopReason | null;

  /** 手続きの実行回数 */
  count: number;

  /** 連続失敗回数（成功時に 0 へ戻る） */
  consecutiveErrors: number;
}

/**
 * `data-poll-*` 属性を監視し、一定間隔で Procedure を実行します。
 *
 * `data-intersect-*`（`IntersectObserver`）と同じ「専用トリガー属性」の仕組みで、
 * 発火の契機がタイマーである点だけが異なります。`data-poll-fetch` /
 * `data-poll-bind` などのアクション語彙は `data-{event}-*` と共通です。
 */
export default class PollObserver {
  /**
   * トリガーではなく設定を表す `data-poll-*` のキー。
   *
   * これらだけを持つ要素は監視対象になりません（`shouldObserve()`）。
   */
  private static readonly CONFIG_KEYS: ReadonlySet<string> = new Set([
    'interval',
    'timeout',
    'until',
    'error-limit',
    'disabled',
    'state',
  ]);

  /** `data-poll-interval` を省略した場合の既定間隔（ミリ秒） */
  private static readonly DEFAULT_INTERVAL_MS = 5000;

  /**
   * `data-poll-interval` の下限（ミリ秒）。
   *
   * `0` や負値の指定でタイマーが暴走することを防ぐための保険です。
   */
  private static readonly MIN_INTERVAL_MS = 100;

  /** 監視中の要素と登録情報の対応 */
  private static readonly registrations = new Map<
    HTMLElement,
    PollRegistration
  >();

  /** `visibilitychange` の購読ハンドラ。未購読の場合は null */
  private static visibilityListener: (() => void) | null = null;

  /**
   * 指定ノードとその子孫を走査し、`data-poll-*` の監視状態を同期します。
   *
   * @param root 走査対象のノード
   * @returns 戻り値はありません。
   */
  public static syncTree(root: Node): void {
    if (!(root instanceof Element || root instanceof DocumentFragment)) {
      return;
    }
    if (PollObserver.isHtmlElement(root)) {
      PollObserver.syncElement(root);
    }
    root.querySelectorAll<HTMLElement>('*').forEach(element => {
      PollObserver.syncElement(element);
    });
  }

  /**
   * 指定要素の `data-poll-*` の監視状態を同期します。
   *
   * 監視対象でなくなった場合は登録を解除し、設定が変わった場合は張り直します。
   * 設定が同じ場合はタイマーを維持します。
   *
   * @param element 対象要素
   * @returns 戻り値はありません。
   */
  public static syncElement(element: HTMLElement): void {
    const registration = PollObserver.registrations.get(element);
    // 本メソッドは属性変更のたびに全要素へ呼ばれるため、無関係な要素は最小の
    // コストで抜ける。`data-poll-*` を持たず登録も無い要素は対象外。
    if (!registration && !PollObserver.hasPollAttribute(element)) {
      return;
    }
    const fragment = Fragment.get(element);
    if (
      !(fragment instanceof ElementFragment) ||
      !PollObserver.shouldObserve(fragment)
    ) {
      if (registration) {
        PollObserver.teardown(element, registration);
      }
      return;
    }

    const configKey = PollObserver.buildConfigKey(fragment);
    if (registration) {
      if (registration.configKey === configKey) {
        // 設定が同じ場合はタイマーを維持する。ここで張り直すと、間隔タイマーと
        // 打ち切りタイマーの起点が毎回リセットされ、`data-poll-timeout` へ
        // 永久に到達しなくなる。
        registration.fragment = fragment;
        return;
      }
      PollObserver.teardown(element, registration);
    }
    PollObserver.startPolling(element, fragment, configKey);
  }

  /**
   * 指定ノードとその子孫の監視を解除します。
   *
   * DOM から除去された要素に対して呼び出され、タイマーを確実に破棄します。
   * `_poll` の注入や停止イベントの発火は行いません（要素が既に失われているため）。
   *
   * @param root 走査対象のノード
   * @returns 戻り値はありません。
   */
  public static cleanupTree(root: Node): void {
    if (PollObserver.isHtmlElement(root)) {
      const registration = PollObserver.registrations.get(root);
      if (registration) {
        PollObserver.teardown(root, registration);
      }
    }
    if (!(root instanceof Element || root instanceof DocumentFragment)) {
      return;
    }
    root.querySelectorAll<HTMLElement>('*').forEach(element => {
      const registration = PollObserver.registrations.get(element);
      if (registration) {
        PollObserver.teardown(element, registration);
      }
    });
  }

  /**
   * すべての監視を解除します。
   *
   * @returns 戻り値はありません。
   */
  public static disconnectAll(): void {
    PollObserver.registrations.forEach(registration => {
      PollObserver.clearTimers(registration);
    });
    PollObserver.registrations.clear();
    if (PollObserver.visibilityListener && typeof document !== 'undefined') {
      document.removeEventListener(
        'visibilitychange',
        PollObserver.visibilityListener,
      );
    }
    PollObserver.visibilityListener = null;
  }

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
   * `data-poll-*` 属性を1つでも持つかどうかを DOM の属性から判定します。
   *
   * `syncElement()` の早期リターン用です。`ElementFragment.getAttributeNames()` は
   * 配列を確保するため、属性変更ごとに全要素へ呼ばれる経路では DOM の属性を直接
   * 走査します。
   *
   * @param element 対象要素
   * @returns `data-poll-*` を持つ場合は true
   */
  private static hasPollAttribute(element: HTMLElement): boolean {
    const prefix = `${Env.prefix}poll-`;
    const attributes = element.attributes;
    for (let index = 0; index < attributes.length; index += 1) {
      if (attributes[index].name.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 監視対象の要素かどうかを判定します。
   *
   * 設定用のキー（`CONFIG_KEYS`）以外の `data-poll-*` を1つ以上持つ場合に
   * 監視対象とします。
   *
   * @param fragment 対象フラグメント
   * @returns 監視対象の場合は true
   */
  private static shouldObserve(fragment: ElementFragment): boolean {
    const prefix = `${Env.prefix}poll-`;
    return fragment.getAttributeNames().some(name => {
      if (!name.startsWith(prefix)) {
        return false;
      }
      return !PollObserver.CONFIG_KEYS.has(name.slice(prefix.length));
    });
  }

  /**
   * 設定の同一性を判定するキーを組み立てます。
   *
   * `getRawAttribute()`（テンプレート展開前の生の属性値）だけを使い、評価値は
   * 一切含めません。`getAttributeEvaluation()` は呼び出しごとに再評価するため、
   * `data-poll-until` の評価値は `false` から `true` へ変化し、`data-poll-data`
   * の `{{...}}` もバインドの更新で変化します。評価値をキーに含めると、これを
   * 「設定が変わった」と誤認して登録を張り直し、タイマーと打ち切り時間の起点が
   * リセットされて `data-poll-timeout` へ永久に到達しなくなります。
   *
   * @param fragment 対象フラグメント
   * @returns 設定の同一性を表すキー
   */
  private static buildConfigKey(fragment: ElementFragment): string {
    const prefix = `${Env.prefix}poll-`;
    return fragment
      .getAttributeNames()
      .filter(name => name.startsWith(prefix))
      .sort()
      .map(name => `${name}=${fragment.getRawAttribute(name) ?? ''}`)
      .join('\n');
  }

  /**
   * ポーリングを開始します。初回の手続きは間隔を待たずに即時実行します。
   *
   * @param element 対象要素
   * @param fragment 対象フラグメント
   * @param configKey 設定の同一性を表すキー
   * @returns 戻り値はありません。
   */
  private static startPolling(
    element: HTMLElement,
    fragment: ElementFragment,
    configKey: string,
  ): void {
    const registration: PollRegistration = {
      fragment,
      configKey,
      intervalMs: PollObserver.resolveInterval(fragment),
      timeoutMs: PollObserver.resolveTimeout(fragment),
      errorLimit: PollObserver.resolveErrorLimit(fragment),
      startedAt: performance.now(),
      intervalTimerId: null,
      timeoutTimerId: null,
      fetching: false,
      paused: false,
      stopped: false,
      timedOut: false,
      stopReason: null,
      count: 0,
      consecutiveErrors: 0,
    };
    PollObserver.registrations.set(element, registration);
    PollObserver.ensureVisibilityListener();

    if (registration.timeoutMs !== null) {
      // 打ち切りは間隔タイマーとは独立に張る。間隔タイマーの発火時に判定すると、
      // バックグラウンドタブでのタイマー抑制時に打ち切りが大きく遅れる。
      registration.timeoutTimerId = setTimeout(() => {
        void PollObserver.handleTimeout(element);
      }, registration.timeoutMs);
    }

    void PollObserver.injectState(registration);
    void PollObserver.tick(element);
  }

  /**
   * 1回分のポーリング処理を実行し、継続する場合は次回を予約します。
   *
   * @param element 対象要素
   * @returns 処理完了の Promise
   */
  private static async tick(element: HTMLElement): Promise<void> {
    const registration = PollObserver.registrations.get(element);
    if (!registration || registration.stopped || registration.fetching) {
      return;
    }
    registration.intervalTimerId = null;

    // DOM から外れていれば恒久停止する。`cleanupTree()` を経由しない除去経路
    // （MutationObserver の監視外での移動など）に対する保険。
    if (!element.isConnected) {
      await PollObserver.stop(element, registration, 'detached');
      return;
    }

    // 一時停止の判定は毎回ここで行う。`data-if` の非表示は祖先要素へ
    // `data-if-false` が付与されるため（`ElementFragment.hide()`）、対象要素自身の
    // 属性変更通知では検知できない。祖先方向を都度確認することで、Observer の
    // 配線に依存せず停止・再開できる。
    const paused =
      PollObserver.isHidden(element) ||
      PollObserver.isDisabled(registration.fragment);
    if (paused !== registration.paused) {
      registration.paused = paused;
      await PollObserver.injectState(registration);
    }
    if (paused) {
      // タイマーは動かし続け、条件が戻った時点の周期から再開する。
      PollObserver.schedule(element, registration);
      return;
    }

    // 実行前に停止条件を評価する。初期状態で既に条件が成立している場合に、
    // 無駄なリクエストを1回も出さずに停止できる。
    if (PollObserver.isUntilSatisfied(registration.fragment)) {
      await PollObserver.stop(element, registration, 'until');
      return;
    }

    registration.fetching = true;
    registration.count += 1;
    let succeeded = false;
    try {
      succeeded = await new Procedure(
        registration.fragment,
        'poll',
      ).runWithResult();
    } catch (error) {
      // ネットワーク断などで Procedure が reject する経路。HTTP エラー応答は
      // false を返すため、どちらも「失敗」として同じ扱いにする。
      Log.error('[Haori]', 'Poll procedure execution error:', error);
    } finally {
      registration.fetching = false;
    }

    // 実行中に打ち切りや登録解除が起きていれば、以降の処理は行わない。
    if (
      PollObserver.registrations.get(element) !== registration ||
      registration.stopped
    ) {
      return;
    }

    if (succeeded) {
      registration.consecutiveErrors = 0;
    } else {
      registration.consecutiveErrors += 1;
      if (
        registration.errorLimit !== null &&
        registration.consecutiveErrors >= registration.errorLimit
      ) {
        await PollObserver.stop(element, registration, 'error');
        return;
      }
    }

    await PollObserver.restoreStateIfCleared(registration);

    // バインド反映後に停止条件を評価する。失敗時はバインドが行われないため
    // 評価しない（`Procedure` は HTTP エラー応答ではバインドせずに終了する）。
    if (succeeded && PollObserver.isUntilSatisfied(registration.fragment)) {
      await PollObserver.stop(element, registration, 'until');
      return;
    }

    PollObserver.schedule(element, registration);
  }

  /**
   * 次回のポーリングを予約します。
   *
   * 間隔は前回の手続きが**完了した時点**から計測します。応答が間隔より遅い場合に
   * リクエストが多重化しないようにするためです。
   *
   * @param element 対象要素
   * @param registration 登録情報
   * @returns 戻り値はありません。
   */
  private static schedule(
    element: HTMLElement,
    registration: PollRegistration,
  ): void {
    if (registration.stopped || registration.intervalTimerId !== null) {
      return;
    }
    registration.intervalTimerId = setTimeout(() => {
      void PollObserver.tick(element);
    }, registration.intervalMs);
  }

  /**
   * 打ち切り時間に到達したときの処理を行います。
   *
   * @param element 対象要素
   * @returns 処理完了の Promise
   */
  private static async handleTimeout(element: HTMLElement): Promise<void> {
    const registration = PollObserver.registrations.get(element);
    if (!registration || registration.stopped) {
      return;
    }
    registration.timeoutTimerId = null;
    registration.timedOut = true;
    if (element.isConnected) {
      HaoriEvent.pollTimeout(
        element,
        registration.count,
        PollObserver.elapsed(registration),
      );
    }
    await PollObserver.stop(element, registration, 'timeout');
  }

  /**
   * ポーリングを恒久停止します。
   *
   * @param element 対象要素
   * @param registration 登録情報
   * @param reason 停止理由
   * @returns 処理完了の Promise
   */
  private static async stop(
    element: HTMLElement,
    registration: PollRegistration,
    reason: PollStopReason,
  ): Promise<void> {
    if (registration.stopped) {
      return;
    }
    registration.stopped = true;
    registration.stopReason = reason;
    registration.paused = false;
    PollObserver.clearTimers(registration);

    if (reason === 'detached') {
      // 要素が DOM から失われているため、登録を保持すると要素を参照し続ける。
      PollObserver.registrations.delete(element);
      return;
    }

    await PollObserver.injectState(registration);
    if (element.isConnected) {
      HaoriEvent.pollStop(
        element,
        reason,
        registration.count,
        PollObserver.elapsed(registration),
      );
    }
  }

  /**
   * 登録を解除し、タイマーを破棄します。状態注入やイベント発火は行いません。
   *
   * @param element 対象要素
   * @param registration 登録情報
   * @returns 戻り値はありません。
   */
  private static teardown(
    element: HTMLElement,
    registration: PollRegistration,
  ): void {
    PollObserver.clearTimers(registration);
    PollObserver.registrations.delete(element);
  }

  /**
   * 登録情報が持つタイマーをすべて破棄します。
   *
   * @param registration 登録情報
   * @returns 戻り値はありません。
   */
  private static clearTimers(registration: PollRegistration): void {
    if (registration.intervalTimerId !== null) {
      clearTimeout(registration.intervalTimerId);
      registration.intervalTimerId = null;
    }
    if (registration.timeoutTimerId !== null) {
      clearTimeout(registration.timeoutTimerId);
      registration.timeoutTimerId = null;
    }
  }

  /**
   * ポーリング開始からの経過時間を返します。
   *
   * @param registration 登録情報
   * @returns 経過時間（ミリ秒）
   */
  private static elapsed(registration: PollRegistration): number {
    return Math.round(performance.now() - registration.startedAt);
  }

  /**
   * `visibilitychange` の購読を開始します（未購読の場合のみ）。
   *
   * バックグラウンドのタブではタイマーが大きく抑制されるため、可視化された時点で
   * 待機中の間隔タイマーを破棄して即時実行し、復帰直後の検知遅延を抑えます。
   *
   * @returns 戻り値はありません。
   */
  private static ensureVisibilityListener(): void {
    if (PollObserver.visibilityListener || typeof document === 'undefined') {
      return;
    }
    const listener = (): void => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      // 反復中に登録が変化し得るため、対象を確定させてから処理する。
      Array.from(PollObserver.registrations.entries()).forEach(
        ([element, registration]) => {
          if (registration.stopped || registration.fetching) {
            return;
          }
          if (registration.intervalTimerId !== null) {
            clearTimeout(registration.intervalTimerId);
            registration.intervalTimerId = null;
          }
          void PollObserver.tick(element);
        },
      );
    };
    PollObserver.visibilityListener = listener;
    document.addEventListener('visibilitychange', listener);
  }

  /**
   * `_poll` 状態を注入先のバインディングデータへ反映します。
   *
   * 状態が遷移した時点だけで呼び出します。毎回の取得ごとに注入すると、
   * `data-each` を含む画面では取得間隔ごとに再評価が走り負荷になるためです。
   * リクエスト単位の `loading` / `success` / `error` は既存の
   * `data-poll-fetch-state`（`_fetch`）が担います。
   *
   * @param registration 登録情報
   * @returns 注入完了の Promise
   */
  private static injectState(registration: PollRegistration): Promise<void> {
    const targets = PollObserver.resolveStateFragments(registration);
    if (targets.length === 0) {
      return Promise.resolve();
    }
    const state = {
      running: !registration.stopped,
      paused: registration.paused,
      stopped: registration.stopped,
      timedOut: registration.timedOut,
      stopReason: registration.stopReason,
      count: registration.count,
      elapsedMs: PollObserver.elapsed(registration),
    };
    return Promise.all(
      targets.map(target => {
        const element = target.getTarget();
        // 既存のバインディングデータを保持したまま `_poll` だけを差し替える。
        // `reflectToAttribute=false` で `data-bind` 属性は汚さない。
        const data = {
          ...(target.getRawBindingData() ?? {}),
          _poll: state,
        };
        return Core.setBindingData(element, data, new Set(), false, false);
      }),
    ).then(() => undefined);
  }

  /**
   * 手続きの実行で `_poll` が失われていた場合に注入し直します。
   *
   * `data-poll-bind` は既定でバインド先を全置換するため、注入先が bind 先と同じ
   * 要素（`data-poll-state` の値を省略して自要素を対象にした場合など）では、
   * 取得成功のたびに `_poll` が消えます。失われたときだけ書き戻すことで、毎回の
   * 注入による再評価コスト（`injectState()` のコメント参照）を避けながら状態を
   * 維持します。
   *
   * @param registration 登録情報
   * @returns 処理完了の Promise
   */
  private static async restoreStateIfCleared(
    registration: PollRegistration,
  ): Promise<void> {
    const targets = PollObserver.resolveStateFragments(registration);
    const cleared = targets.some(
      target => (target.getRawBindingData() ?? {})._poll === undefined,
    );
    if (cleared) {
      await PollObserver.injectState(registration);
    }
  }

  /**
   * `_poll` の注入先フラグメントを解決します。
   *
   * `data-poll-state` の値を CSS セレクタとして解決し、値を省略した場合は
   * 自要素を対象とします。属性そのものが無い場合は注入しません。
   *
   * @param registration 登録情報
   * @returns 注入先フラグメントのリスト
   */
  private static resolveStateFragments(
    registration: PollRegistration,
  ): ElementFragment[] {
    const attrName = `${Env.prefix}poll-state`;
    const fragment = registration.fragment;
    if (!fragment.hasAttribute(attrName)) {
      return [];
    }
    const selector = fragment.getAttribute(attrName);
    if (typeof selector !== 'string' || selector.trim() === '') {
      return fragment.getTarget().isConnected ? [fragment] : [];
    }
    const elements = document.querySelectorAll<HTMLElement>(selector);
    if (elements.length === 0) {
      Log.error('[Haori]', `Poll state element not found: ${selector}`);
      return [];
    }
    const fragments: ElementFragment[] = [];
    elements.forEach(element => {
      // 未接続の要素は対象外とする（要素が外れた後の注入で例外にしない）。
      if (!element.isConnected) {
        return;
      }
      const target = Fragment.get(element);
      if (target instanceof ElementFragment) {
        fragments.push(target);
      }
    });
    return fragments;
  }

  /**
   * `data-poll-interval` を解決します。
   *
   * 省略時は既定値、数値として解釈できない場合も既定値へ、下限を下回る場合は
   * 下限へクランプし、いずれも警告を出します。
   *
   * @param fragment 対象フラグメント
   * @returns 取得間隔（ミリ秒）
   */
  private static resolveInterval(fragment: ElementFragment): number {
    const attrName = `${Env.prefix}poll-interval`;
    if (!fragment.hasAttribute(attrName)) {
      return PollObserver.DEFAULT_INTERVAL_MS;
    }
    const interval = PollObserver.toNumber(fragment.getAttribute(attrName));
    if (interval === null) {
      Log.warn(
        '[Haori]',
        `${attrName} は数値で指定してください。` +
          `既定値 ${PollObserver.DEFAULT_INTERVAL_MS}ms を使用します。`,
      );
      return PollObserver.DEFAULT_INTERVAL_MS;
    }
    if (interval < PollObserver.MIN_INTERVAL_MS) {
      Log.warn(
        '[Haori]',
        `${attrName} の下限は ${PollObserver.MIN_INTERVAL_MS}ms です。` +
          `${interval}ms は下限へ切り上げます。`,
      );
      return PollObserver.MIN_INTERVAL_MS;
    }
    return interval;
  }

  /**
   * `data-poll-timeout` を解決します。
   *
   * @param fragment 対象フラグメント
   * @returns 打ち切り時間（ミリ秒）。省略時や不正値の場合は null（無制限）
   */
  private static resolveTimeout(fragment: ElementFragment): number | null {
    const attrName = `${Env.prefix}poll-timeout`;
    if (!fragment.hasAttribute(attrName)) {
      return null;
    }
    const timeout = PollObserver.toNumber(fragment.getAttribute(attrName));
    if (timeout === null || timeout <= 0) {
      Log.warn(
        '[Haori]',
        `${attrName} は正の数値で指定してください。無制限として扱います。`,
      );
      return null;
    }
    return timeout;
  }

  /**
   * `data-poll-error-limit` を解決します。
   *
   * @param fragment 対象フラグメント
   * @returns 連続失敗の上限回数。省略時や不正値の場合は null（無制限）
   */
  private static resolveErrorLimit(fragment: ElementFragment): number | null {
    const attrName = `${Env.prefix}poll-error-limit`;
    if (!fragment.hasAttribute(attrName)) {
      return null;
    }
    const limit = PollObserver.toNumber(fragment.getAttribute(attrName));
    if (limit === null || limit < 1) {
      Log.warn(
        '[Haori]',
        `${attrName} は 1 以上の数値で指定してください。無制限として扱います。`,
      );
      return null;
    }
    return Math.floor(limit);
  }

  /**
   * 属性の評価値を数値へ変換します。
   *
   * @param value 属性の評価値
   * @returns 変換した数値。変換できない場合は null
   */
  private static toNumber(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value !== 'string' || value.trim() === '') {
      return null;
    }
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * `data-if` による非表示の配下にあるかどうかを判定します。
   *
   * `data-if` が false の要素は DOM から削除されず、`display: none` と
   * `data-if-false` 属性が付与された状態で残ります（`ElementFragment.hide()`）。
   * 属性は非表示になった要素自身へ付くため、その配下にある対象要素からは
   * 祖先方向を確認する必要があります。
   *
   * @param element 対象要素
   * @returns 非表示の配下にある場合は true
   */
  private static isHidden(element: HTMLElement): boolean {
    return element.closest(`[${Env.prefix}if-false]`) !== null;
  }

  /**
   * `data-poll-disabled` が真かどうかを判定します。
   *
   * @param fragment 対象フラグメント
   * @returns 抑止中の場合は true
   */
  private static isDisabled(fragment: ElementFragment): boolean {
    const attrName = `${Env.prefix}poll-disabled`;
    if (!fragment.hasAttribute(attrName)) {
      return false;
    }
    return PollObserver.isTruthy(fragment.getAttribute(attrName));
  }

  /**
   * `data-poll-until` の条件が成立したかどうかを判定します。
   *
   * 未解決参照を含む場合は「成立していない」として扱い、停止しません。停止扱いに
   * すると、バインドがまだ届いていない初回の評価で即座に停止してしまうためです。
   * 属性名の綴り誤りなどで永久に停止しない事態に気づけるよう、開発モードでは
   * 警告を出します。
   *
   * @param fragment 対象フラグメント
   * @returns 条件が成立した場合は true
   */
  private static isUntilSatisfied(fragment: ElementFragment): boolean {
    const attrName = `${Env.prefix}poll-until`;
    if (!fragment.hasAttribute(attrName)) {
      return false;
    }
    const evaluation = fragment.getAttributeEvaluation(attrName);
    if (!evaluation) {
      return false;
    }
    if (evaluation.hasUnresolvedReference) {
      // Log.warn は開発モードでのみ出力される。
      Log.warn(
        '[Haori]',
        `${attrName} に未解決の参照が含まれています` +
          '（停止条件は成立扱いにしません）:',
        fragment.getRawAttribute(attrName),
        fragment.getTarget(),
      );
      return false;
    }
    return PollObserver.isTruthy(evaluation.value);
  }

  /**
   * 属性の評価値を真偽値として解釈します。
   *
   * 文字列の `'false'` / `'0'` / 空文字列は偽として扱います（`data-poll-until` に
   * `{{...}}` 以外の文字列が混ざった場合でも意図どおり判定できるようにするため）。
   *
   * @param value 属性の評価値
   * @returns 真と解釈できる場合は true
   */
  private static isTruthy(value: unknown): boolean {
    if (value === null || value === undefined || value === false) {
      return false;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized !== '' && normalized !== 'false' && normalized !== '0';
    }
    return Boolean(value);
  }
}
