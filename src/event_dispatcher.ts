/**
 * @fileoverview イベント振り分け機能
 *
 * クリック/変更/ロードイベントを検出し Procedure に委譲します。
 */

import Fragment, {ElementFragment} from './fragment';
import Procedure from './procedure';
import Log from './log';

/**
 * イベントの振り分けを行うクラスです。
 */
export default class EventDispatcher {
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
   * コンストラクタ。
   *
   * @param root 監視対象のルート要素（デフォルトは document ）
   */
  constructor(root: Document | HTMLElement = document) {
    this.root = root;
  }

  /**
   * イベントリスナーの登録を開始します。
   * クリック、変更、ロードイベントを監視し、対応するProcedureを実行します。
   */
  start(): void {
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('change', this.onChange);
    // load は非バブルなのでキャプチャで拾う
    this.root.addEventListener('load', this.onLoadCapture, true);
    // ページ全体のロード
    window.addEventListener('load', this.onWindowLoad, {once: true});
  }

  /**
   * イベントリスナーの登録を停止します。
   */
  stop(): void {
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('change', this.onChange);
    this.root.removeEventListener('load', this.onLoadCapture, true);
    window.removeEventListener('load', this.onWindowLoad);
  }

  /**
   * イベントを処理し、対応するProcedureを実行します。
   *
   * @param event 発生したイベント
   * @param type イベントタイプ（'click', 'change', 'load'など）
   */
  private delegate(event: Event, type: string) {
    const element = this.getElementFromTarget(event.target);
    if (!element) {
      return;
    }
    const fragment = Fragment.get(element);
    if (!fragment) {
      return;
    }

    // changeイベントの場合、DOM値と同期
    if (type === 'change' && fragment instanceof ElementFragment) {
      fragment.syncValue();
    }

    new Procedure(fragment, type).run().catch(error => {G
      Log.error('[Haori]', 'Procedure execution error:', error);
    });
  }

  /**
   * イベントのターゲットから HTMLElement を取得します。
   *
   * @param target イベントのターゲット
   * @returns HTMLElement または null
   */
  private getElementFromTarget(target: EventTarget | null): HTMLElement | null {
    if (!target) {
      return null;
    }
    if (target instanceof HTMLElement) {
      return target;
    }
    if (target instanceof Node) {
      return target.parentElement;
    }
    return null;
  }
}
