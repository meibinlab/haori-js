/**
 * @fileoverview イベント振り分け機能
 *
 * クリック/変更/ロード/ポップステートイベントを検出し Procedure に委譲します。
 */

import Fragment, {ElementFragment} from './fragment';
import Procedure from './procedure';
import Log from './log';
import Env from './env';

/**
 * イベントの振り分けを行うクラスです。
 */
export default class EventDispatcher {
  /** Haori が history.state に埋め込む状態キー */
  private static readonly HISTORY_STATE_KEY = '__haoriHistoryState__';

  /**
   * `data-on` で指定しても受け付けない組み込みイベント名。これらは
   * `data-{event}-*`（デリゲート方式）を使う。
   */
  private static readonly BUILTIN_EVENT_NAMES: ReadonlySet<string> = new Set([
    'click',
    'change',
    'input',
    'load',
  ]);

  /** ルート要素 */
  private readonly root: Document | HTMLElement;

  /** 購読中のカスタムイベント名とそのリスナーの対応。 */
  private readonly customEventHandlers = new Map<
    string,
    (event: Event) => void
  >();

  /** `data-on` 宣言の追加（data-import 等）を監視する Observer。 */
  private customEventObserver: MutationObserver | undefined;

  /** 組み込みイベントのリスナーを登録済みかどうか（二重登録の防止）。 */
  private builtinListenersAdded = false;

  /**
   * 手続きの実行を保留中かどうか（初期化中モード）。
   *
   * 初期スキャン中に発火したイベントを取りこぼさないため、`startDeferred()` では
   * リスナー登録だけを先に行い、手続きの実行は `release()` まで保留します。
   */
  private deferred = false;

  /**
   * 保留中の手続き実行。`release()` で登録順に実行されます。
   * イベントオブジェクトはそのまま保持するため、`detail` などの情報は失われません。
   */
  private readonly deferredProcedures: (() => void)[] = [];

  /** クリックデリゲータ */
  private readonly onClick = (event: Event) => this.delegate(event, 'click');

  /** 変更デリゲータ */
  private readonly onChange = (event: Event) => this.delegate(event, 'change');

  /** 入力デリゲータ（逐次入力。data-input-* を持つ要素のみ対象） */
  private readonly onInput = (event: Event) => this.delegate(event, 'input');

  /** ロードデリゲータ（キャプチャで拾う） */
  private readonly onLoadCapture = (event: Event) =>
    this.delegate(event, 'load');

  /** ページ全体のロード完了時の処理 */
  private readonly onWindowLoad = () => {
    // 初期化中は手続きの実行を保留する。リスナー登録を初期スキャン前へ移した
    // ことで、スキャン中に window load が発火し得るようになったため、
    // data-haori-ready 前・フラグメント未確定の状態で走らせない。
    if (this.deferred) {
      this.deferredProcedures.push(() => this.runWindowLoadProcedure());
      return;
    }
    this.runWindowLoadProcedure();
  };

  /**
   * ページロード時の `load` 手続きを `<html>` に対して実行します。
   *
   * @returns 戻り値はない。
   */
  private runWindowLoadProcedure(): void {
    const html = document.documentElement;
    const fragment = Fragment.get(html);
    if (fragment) {
      void new Procedure(fragment, 'load').run();
    }
  }

  /**
   * popstate デリゲータ（Haori が管理する履歴に戻った場合だけページをリロード）。
   *
   * @param event popstate イベント
   */
  private readonly onPopstate = (event: PopStateEvent) => {
    const state = event.state as Record<string, unknown> | null;
    if (!state || state[EventDispatcher.HISTORY_STATE_KEY] !== true) {
      return;
    }
    location.reload();
  };

  /**
   * コンストラクタ。
   *
   * @param root 監視対象のルート要素（デフォルトは document ）
   */
  constructor(root: Document | HTMLElement = document) {
    this.root = root;
  }

  /**
   * イベントリスナーの登録を開始します。
   * クリック、変更、ロード、popstate イベントを監視し、対応するProcedureを実行します。
   */
  start(): void {
    // startDeferred() 後に release() を経ずに start() が呼ばれても、
    // 手続きが恒久的に保留されないよう保留モードを解除する。
    this.deferred = false;
    this.addBuiltinListeners();
    // data-on で宣言されたカスタムイベントの購読を開始
    this.subscribeDeclaredCustomEvents();
    this.observeCustomEventDeclarations();
  }

  /**
   * 初期化中モードで購読を開始します。
   *
   * イベントリスナーの登録だけを先に行い、手続きの実行は `release()` が呼ばれる
   * まで保留します。`Observer.init()` の初期スキャン中に `data-each-rendered-run`
   * などから同期的に発火されたイベントが、リスナー未登録のまま失われるのを防ぐ
   * ためのモードです。保留したイベントは初期化完了後に発火順で処理されます。
   *
   * `data-on` の宣言追加を監視する MutationObserver は、初期スキャン中の大量の
   * ノード追加に対する無駄な走査を避けるため `release()` まで開始しません
   * （初期スキャン中に追加された宣言は `release()` 時に一括で購読されます）。
   *
   * @returns 戻り値はない。
   */
  startDeferred(): void {
    this.deferred = true;
    this.addBuiltinListeners();
    this.subscribeDeclaredCustomEvents();
  }

  /**
   * 初期化中モードを解除し、保留していた手続きを発火順に実行します。
   *
   * 初期化中モードでない場合は何もしません。
   *
   * @returns 戻り値はない。
   */
  release(): void {
    if (!this.deferred) {
      return;
    }
    this.deferred = false;
    // 初期スキャン中に追加された data-on 宣言も購読し、以降の追加を監視する。
    this.subscribeDeclaredCustomEvents();
    this.observeCustomEventDeclarations();
    const pending = this.deferredProcedures.splice(0);
    for (const run of pending) {
      try {
        run();
      } catch (error) {
        Log.error('[Haori]', 'Deferred event handling error:', error);
      }
    }
  }

  /**
   * 組み込みイベント（click / change / input / load / popstate）のリスナーを登録します。
   * 二重登録は行いません。
   *
   * @returns 戻り値はない。
   */
  private addBuiltinListeners(): void {
    if (this.builtinListenersAdded) {
      return;
    }
    this.builtinListenersAdded = true;
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('change', this.onChange);
    this.root.addEventListener('input', this.onInput);
    // load は非バブルなのでキャプチャで拾う
    this.root.addEventListener('load', this.onLoadCapture, true);
    // ページ全体のロード
    window.addEventListener('load', this.onWindowLoad, {once: true});
    // ブラウザの戻る・進む操作
    window.addEventListener('popstate', this.onPopstate);
  }

  /**
   * イベントリスナーの登録を停止します。
   */
  stop(): void {
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('change', this.onChange);
    this.root.removeEventListener('input', this.onInput);
    this.root.removeEventListener('load', this.onLoadCapture, true);
    window.removeEventListener('load', this.onWindowLoad);
    window.removeEventListener('popstate', this.onPopstate);
    this.builtinListenersAdded = false;
    // 保留中の手続きは破棄する（購読停止後に実行しても意味がないため）。
    this.deferred = false;
    this.deferredProcedures.length = 0;
    // カスタムイベント購読を解除
    for (const [name, handler] of this.customEventHandlers) {
      window.removeEventListener(name, handler, true);
    }
    this.customEventHandlers.clear();
    this.customEventObserver?.disconnect();
    this.customEventObserver = undefined;
  }

  /**
   * `data-on` 属性名。
   *
   * @returns `data-on` 属性名
   */
  private get onAttributeName(): string {
    return `${Env.prefix}on`;
  }

  /**
   * ルート配下に存在する `data-on` 宣言を走査し、カスタムイベントを購読します。
   *
   * @returns 戻り値はない。
   */
  private subscribeDeclaredCustomEvents(): void {
    const root = this.root as Document | HTMLElement;
    root
      .querySelectorAll(`[${this.onAttributeName}]`)
      .forEach(element =>
        this.subscribeCustomEvent(element.getAttribute(this.onAttributeName)),
      );
  }

  /**
   * 指定したカスタムイベント名を購読します。重複購読・組み込みイベント名は無視します。
   *
   * window のキャプチャで購読することで、window / document いずれへ dispatch された
   * イベントも二重発火なく一度だけ拾えます（document へ dispatch されたイベントの
   * 伝播経路に window が含まれるため）。
   *
   * @param name `data-on` の値（イベント名）
   * @returns 戻り値はない。
   */
  private subscribeCustomEvent(name: string | null): void {
    if (name === null || name === '') {
      return;
    }
    if (EventDispatcher.BUILTIN_EVENT_NAMES.has(name)) {
      Log.warn(
        '[Haori]',
        `data-on="${name}" は組み込みイベントです。` +
          `data-${name}-* を使用してください（data-on はカスタムイベント専用）。`,
      );
      return;
    }
    if (this.customEventHandlers.has(name)) {
      return;
    }
    const handler = (event: Event): void =>
      this.runCustomEventProcedures(name, event);
    this.customEventHandlers.set(name, handler);
    window.addEventListener(name, handler, true);
  }

  /**
   * カスタムイベント発火時に、対応する `data-on` 要素の手続き（type=`on`）を起動します。
   *
   * @param name イベント名
   * @param event 発火したイベント
   * @returns 戻り値はない。
   */
  private runCustomEventProcedures(name: string, event: Event): void {
    // 初期化中は手続きの実行を保留する（イベントオブジェクトはそのまま保持するため
    // detail 等の情報は失われない）。
    if (this.deferred) {
      this.deferredProcedures.push(() =>
        this.runCustomEventProcedures(name, event),
      );
      return;
    }
    const root = this.root as Document | HTMLElement;
    // 属性セレクタの値エスケープ（CSS.escape）に依存せず、値一致で絞り込む。
    root.querySelectorAll(`[${this.onAttributeName}]`).forEach(element => {
      if (element.getAttribute(this.onAttributeName) !== name) {
        return;
      }
      const fragment = Fragment.get(element);
      if (fragment instanceof ElementFragment) {
        new Procedure(fragment, 'on', event).run().catch(error => {
          Log.error('[Haori]', 'Procedure execution error:', error);
        });
      }
    });
  }

  /**
   * `data-import` 等で後から挿入される `data-on` 宣言を購読対象へ追加するため、
   * DOM の追加を監視します。
   *
   * @returns 戻り値はない。
   */
  private observeCustomEventDeclarations(): void {
    if (typeof MutationObserver === 'undefined') {
      return;
    }
    const doc =
      this.root instanceof Document
        ? this.root
        : (this.root.ownerDocument ?? document);
    const observeTarget = this.root instanceof Document ? doc.body : this.root;
    if (!observeTarget) {
      return;
    }
    this.customEventObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) {
            return;
          }
          if (node.hasAttribute(this.onAttributeName)) {
            this.subscribeCustomEvent(node.getAttribute(this.onAttributeName));
          }
          node
            .querySelectorAll(`[${this.onAttributeName}]`)
            .forEach(element =>
              this.subscribeCustomEvent(
                element.getAttribute(this.onAttributeName),
              ),
            );
        });
      }
    });
    this.customEventObserver.observe(observeTarget, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * イベントを処理し、対応するProcedureを実行します。
   *
   * @param event 発生したイベント
   * @param type イベントタイプ（'click', 'change', 'load'など）
   */
  private delegate(event: Event, type: string) {
    const element = this.getElementFromTarget(event.target, type);
    if (!element) {
      return;
    }

    // input は逐次（1文字ごと）に発火するため、data-input-* を明示した要素だけを
    // 手続きの対象にする（オプトイン）。これにより既存の input 既定動作を変えない。
    //
    // ただしユーザー編集の通番の発番は宣言の有無に関わらず行う。オプトインの対象は
    // 手続きの起動だけである。発番しないと、打鍵中（`change` 発火前）に反映待ちの
    // 書き込みが着弾して打った文字を消してしまう（仕様「反映待ちの間に起きた変化」）。
    // 発番だけで、内部値は同期しない（`recordUserEdit()` を参照）。
    if (type === 'input') {
      const inputPrefix = `${Env.prefix}input-`;
      const hasInputTrigger = element
        .getAttributeNames()
        .some(name => name.startsWith(inputPrefix));
      if (!hasInputTrigger) {
        this.recordUserEdit(element);
        return;
      }
    }

    // data-{event}-prevent: ネイティブのデフォルト動作（type="submit" のフォーム送信や
    // <a href> の遷移など）を抑止する。delegate はイベントリスナー内で同期実行される
    // ため、ここで preventDefault すれば data-click-defer と併用してもデフォルト動作を
    // 確実に止められる（伝播は止めないので他ライブラリのハンドラには影響しない）。
    if (element.hasAttribute(`${Env.prefix}${type}-prevent`)) {
      event.preventDefault();
    }

    // 初期化中は手続きの実行だけを保留する。対象要素の解決と preventDefault は
    // イベント発生時に同期で済ませ、フラグメント解決・値同期・手続き実行は
    // 初期化完了後（フラグメントが確実に初期化済みの状態）に行う。
    if (this.deferred) {
      this.deferredProcedures.push(() => {
        // 保留分の再生時のみ、初期化中の再描画などで対象要素が DOM から外れて
        // いれば処理しない（その要素の状態はすでに失われている）。同期経路では
        // 判定しない。他ライブラリのハンドラが同一イベント中に対象要素を DOM から
        // 外す構成でも、従来どおり手続きを実行する必要があるため。
        if (!element.isConnected) {
          return;
        }
        this.runProcedureFor(element, type, event);
      });
      return;
    }

    this.runProcedureFor(element, type, event);
  }

  /**
   * 対象要素に対して、値の同期と手続きの実行を行います。
   *
   * @param element 処理対象の要素
   * @param type イベントタイプ（'click', 'change', 'load'など）
   * @param event 起点となった DOM イベント
   * @returns 戻り値はない。
   */
  private runProcedureFor(
    element: HTMLElement,
    type: string,
    event: Event,
  ): void {
    const fragment = Fragment.get(element);
    if (!fragment) {
      return;
    }

    // change / input イベントの場合、DOM値と内部値を同期する
    if (type === 'change' || type === 'input') {
      this.syncUserEdit(element);
    }

    const runProcedure = () => {
      new Procedure(fragment, type, event).run().catch(error => {
        Log.error('[Haori]', 'Procedure execution error:', error);
      });
    };

    // data-click-defer 指定時は、Haori の click 処理を次フレーム（または次マクロ
    // タスク）へ遅延する。これにより Bootstrap など他ライブラリの「同一クリック
    // イベント中に同期実行される」ハンドラ（collapse トグル等）が先に完了し、
    // Haori の reset/copy 等による DOM 変更との競合を避けられる。
    if (type === 'click' && element.hasAttribute(`${Env.prefix}click-defer`)) {
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => runProcedure());
      } else {
        setTimeout(runProcedure, 0);
      }
      return;
    }

    runProcedure();
  }

  /**
   * 手続きを起動しない `input` について、ユーザー編集の通番だけを発番します。
   *
   * `data-input-*` を宣言していない入力欄でも、打鍵は編集として記録しなければ
   * なりません（記録しないと、反映待ちの書き込みが打鍵の後に着弾して打った文字を
   * 消します）。初期化中は手続きと同じく保留し、フラグメントが確定した後に記録
   * します。
   *
   * **内部値は同期しません**（`syncUserEdit()` との違い）。内部値は「バインドデータへ
   * 載っている値」を表し、DOM が先に進むことは許されています（値収集は DOM を真として
   * 読みます。`ElementFragment.getValueForCollection()`）。ここで同期すると、まだ
   * バインドデータへ載っていない値が内部値だけに載った状態になり、次の逆方向同期
   * （`Form.syncValues()`）が古いバインドデータで入力欄を上書きして値を消します。
   * 反映待ちの書き込みからの保護は通番の発番だけで成立します。
   *
   * 内部値を DOM から取り込むのは、値がバインドデータへ載る機会（`change` の双方向
   * コミット、または `data-input-*` を宣言した要素の手続き）と同じ時点だけです。
   *
   * 対象は値を持つ入力要素だけです。`contenteditable` など値収集の対象でない要素で
   * `input` が発火しても、記録すべき編集はありません。
   *
   * @param element 編集された要素
   * @returns 戻り値はない。
   */
  private recordUserEdit(element: HTMLElement): void {
    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLSelectElement) &&
      !(element instanceof HTMLTextAreaElement)
    ) {
      return;
    }
    if (this.deferred) {
      this.deferredProcedures.push(() => {
        if (!element.isConnected) {
          return;
        }
        this.markUserEditOnly(element);
      });
      return;
    }
    this.markUserEditOnly(element);
  }

  /**
   * 内部値を同期せず、ユーザー編集の通番だけを発番します。
   *
   * @param element 編集された要素
   * @returns 戻り値はない。
   */
  private markUserEditOnly(element: HTMLElement): void {
    const fragment = Fragment.get(element);
    if (!(fragment instanceof ElementFragment)) {
      return;
    }
    fragment.markUserEdit();
  }

  /**
   * `change` / `input` の対象要素について、内部値の同期とユーザー編集の記録を行います。
   *
   * 呼び出すのは、値がバインドデータへ載る機会と同じ時点に限ります（`change` の
   * 双方向コミット、または `data-input-*` を宣言した要素の手続き）。手続きを
   * 起動しない `input` では内部値を同期してはいけません（`recordUserEdit()`）。
   *
   * @param element 編集された要素
   * @returns 戻り値はない。
   */
  private syncUserEdit(element: HTMLElement): void {
    const fragment = Fragment.get(element);
    if (!(fragment instanceof ElementFragment)) {
      return;
    }
    fragment.syncValue();
    // ユーザー編集として記録する。飛行中の通信の応答がこの編集より古い内容を
    // 持っていても、その応答でこの入力欄を巻き戻さないための基準になる。
    fragment.markUserEdit();
    // ラジオボタンは排他制御で他要素が未チェックになるが、その要素では
    // change が発火しないため内部値が古いまま残る。同一フォームスコープの
    // 同名ラジオを併せて同期し、値収集時の不整合（配列累積）を防ぐ。
    if (
      element instanceof HTMLInputElement &&
      element.type === 'radio' &&
      element.name
    ) {
      const group = document.getElementsByName(element.name);
      for (const member of Array.from(group)) {
        if (
          member === element ||
          !(member instanceof HTMLInputElement) ||
          member.type !== 'radio' ||
          member.form !== element.form
        ) {
          continue;
        }
        const memberFragment = Fragment.get(member);
        if (memberFragment instanceof ElementFragment) {
          memberFragment.syncValue();
          // 排他で未チェックになった同名ラジオもユーザー編集として扱う。
          // 起点要素だけを記録すると、応答の書き戻しでグループの一部だけが
          // 巻き戻り、チェック状態が食い違う。
          memberFragment.markUserEdit();
        }
      }
    }
  }

  /**
   * イベントのターゲットから HTMLElement を取得します。
   *
   * @param target イベントのターゲット
   * @param type イベントタイプ。click の場合のみ祖先委譲を行う
   * @returns HTMLElement または null
   */
  private getElementFromTarget(
    target: EventTarget | null,
    type: string | null,
  ): HTMLElement | null {
    if (!target) {
      return null;
    }
    if (target instanceof HTMLElement) {
      if (type === 'click') {
        return this.findClickableElement(target);
      }
      return target;
    }
    if (target instanceof Node) {
      const element = target.parentElement;
      if (!element) {
        return null;
      }
      if (type === 'click') {
        return this.findClickableElement(element);
      }
      return element;
    }
    return null;
  }

  /**
   * data-click-* 属性を持つ最も近い祖先要素を返します。
   *
   * `data-click-passive` を持つ要素は「境界」として扱い、そこより外側（祖先方向）の
   * `data-click-*` へは遡上しません。フォーム入力欄などを囲むコンテナに
   * `data-click-passive` を付けると、その内側で発生したクリックが外側のクリック
   * アクションを誤って発火させるのを防げます（境界より内側に `data-click-*` を持つ
   * 要素があれば最近接優先でそちらが拾われるため、内側のボタン等は従来どおり動作）。
   *
   * @param element 探索開始要素
   * @returns 処理対象要素。見つからない場合は null
   */
  private findClickableElement(element: HTMLElement): HTMLElement | null {
    const clickPrefix = `${Env.prefix}click-`;
    const passiveAttr = `${Env.prefix}click-passive`;
    let current: HTMLElement | null = element;
    while (current) {
      // data-click-passive 自体はトリガーではないため除外して判定する。
      const hasClickTrigger = current
        .getAttributeNames()
        .some(name => name.startsWith(clickPrefix) && name !== passiveAttr);
      if (hasClickTrigger) {
        return current;
      }
      // 境界に到達したら、これ以上外側の data-click-* へは遡上しない。
      if (current.hasAttribute(passiveAttr)) {
        return null;
      }
      current = current.parentElement;
    }
    return null;
  }
}
