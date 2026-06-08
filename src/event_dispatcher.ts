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

  /** ルート要素 */
  private readonly root: Document | HTMLElement;

  /** クリックデリゲータ */
  private readonly onClick = (event: Event) => this.delegate(event, 'click');

  /** 変更デリゲータ */
  private readonly onChange = (event: Event) => this.delegate(event, 'change');

  /** ロードデリゲータ（キャプチャで拾う） */
  private readonly onLoadCapture = (event: Event) =>
    this.delegate(event, 'load');

  /** ページ全体のロード完了時の処理 */
  private readonly onWindowLoad = () => {
    // ページロード時にも load を1回ディスパッチ
    const html = document.documentElement;
    const fragment = Fragment.get(html);
    if (fragment) {
      void new Procedure(fragment, 'load').run();
    }
  };

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
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('change', this.onChange);
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
    this.root.removeEventListener('load', this.onLoadCapture, true);
    window.removeEventListener('load', this.onWindowLoad);
    window.removeEventListener('popstate', this.onPopstate);
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

    // data-{event}-prevent: ネイティブのデフォルト動作（type="submit" のフォーム送信や
    // <a href> の遷移など）を抑止する。delegate はイベントリスナー内で同期実行される
    // ため、ここで preventDefault すれば data-click-defer と併用してもデフォルト動作を
    // 確実に止められる（伝播は止めないので他ライブラリのハンドラには影響しない）。
    if (element.hasAttribute(`${Env.prefix}${type}-prevent`)) {
      event.preventDefault();
    }

    const fragment = Fragment.get(element);
    if (!fragment) {
      return;
    }

    // changeイベントの場合、DOM値と同期
    if (type === 'change' && fragment instanceof ElementFragment) {
      fragment.syncValue();
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
