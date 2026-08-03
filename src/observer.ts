/**
 * @fileoverview 監視機能
 *
 * Observerクラスは、DOMの変更を監視し、バインディングの更新を行います。
 * MutationObserverを使用して、属性の変更、ノードの追加・削除、テキストノードの変更を監視します。
 */
import Core from './core';
import Env from './env';
import HaoriEvent from './event';
import EventDispatcher from './event_dispatcher';
import {ElementFragment, IF_DISABLED_MARKER} from './fragment';
import IntersectObserver from './intersect';
import Log from './log';
import PollObserver from './poll';
import Queue from './queue';
import {VERSION} from './version';
import VisibleRangeObserver from './visible_range';

/**
 * 監視対象の要素を管理するためのクラスです。
 */
export class Observer {
  private static _initialized = false;

  /** 稼働中の MutationObserver 一覧 */
  private static readonly _mutationObservers: MutationObserver[] = [];

  /** 稼働中の EventDispatcher（初期化中モードの解除に使用） */
  private static _dispatcher: EventDispatcher | null = null;

  /**
   * 既存の MutationObserver をすべて停止します。
   */
  private static disconnectMutationObservers(): void {
    Observer._mutationObservers.forEach(observer => {
      observer.disconnect();
    });
    Observer._mutationObservers.length = 0;
  }

  /**
   * 初期化メソッド。
   * ドキュメントのheadとbodyを監視対象として設定します。
   */
  public static async init() {
    if (Observer._initialized) {
      return;
    }
    Observer._initialized = true;
    Observer.disconnectMutationObservers();
    // 操作の通番を発番する側が、発番の直前に保留中の変更を引き取れるようにする。
    // `Observer` を直接参照すると循環参照になるためフックで渡す。登録は初期化 1 回で
    // 足りる（`observe()` は監視対象ごとに呼ばれるため、そこで登録すると同じフックを
    // 上書きし続けることになる）。
    ElementFragment.setPendingMutationFlusher(() => {
      Observer.flushPendingMutations();
    });
    // 初期スキャンより先にイベントリスナーを登録する。初期スキャン中に
    // data-each-rendered-run 等から同期的に発火されたイベント（select の既定選択を
    // 確定する change など）は、リスナー未登録のままだと手続きが実行されずに
    // 失われるため、リスナー登録だけを先行させ、手続きの実行は初期化完了後
    // （data-haori-ready 付与後）まで保留する。
    const dispatcher = new EventDispatcher();
    Observer._dispatcher = dispatcher;
    dispatcher.startDeferred();
    // 初期化のどこで失敗しても保留モードを必ず解除する。解除し損ねると以降
    // すべてのイベントで手続きが実行されなくなり（data-{event}-prevent は
    // 同期段で効くため）「押しても何も起きない」状態になる。
    try {
      const results = await Promise.allSettled([
        Core.scan(document.head),
        Core.scan(document.body),
      ]);
      const [headResult, bodyResult] = results;
      if (headResult.status !== 'fulfilled') {
        Log.error(
          '[Haori]',
          'Failed to build head fragment:',
          headResult.reason,
        );
      }
      if (bodyResult.status !== 'fulfilled') {
        Log.error(
          '[Haori]',
          'Failed to build body fragment:',
          bodyResult.reason,
        );
      }
      await Queue.wait();
      document.body.setAttribute('data-haori-ready', '');
      Observer.observe(document.head);
      Observer.observe(document.body);
      IntersectObserver.syncTree(document.body);
      PollObserver.syncTree(document.body);
      VisibleRangeObserver.syncTree(document.body);
    } finally {
      // 監視と表示範囲の同期をすべて整えてから、保留していた手続きを実行する。
      dispatcher.release();
    }
    // 初期化完了を通知する。保留していた手続きの解除まで済んだ後に発火するため、
    // 購読側からその場で Haori の機能を呼び出せる。初期化が失敗した場合は
    // 例外が上へ抜けるため、ここには到達せず発火しない。
    HaoriEvent.ready(VERSION);
  }

  /**
   * 稼働中の EventDispatcher を返します。
   *
   * @internal テストからの購読停止に使用します。
   * @returns 稼働中の EventDispatcher。未初期化の場合は null。
   */
  public static getDispatcher(): EventDispatcher | null {
    return Observer._dispatcher;
  }

  /**
   * 指定ノードが「外部管理」サブツリーに属するかどうかを判定します。
   *
   * `data-external` 属性を持つ要素とその子孫で発生した DOM 変更は、外部の
   * select 拡張ライブラリ（Choices.js など）が生成・更新する DOM とみなし、
   * Haori の監視・自動更新の対象から除外します。これにより、外部生成 DOM が
   * Haori に破壊・干渉されることを防ぎます。`data-each` による `<option>` の
   * 配列バインドは Haori のバインド評価パイプラインが駆動するため、監視除外
   * 下でも維持されます。
   *
   * @param node 判定対象のノード（要素・テキスト・コメントいずれも可）
   * @returns 外部管理サブツリーに属する場合 true
   */
  private static isExternallyManaged(node: Node | null): boolean {
    const element =
      node instanceof Element ? node : (node?.parentElement ?? null);
    return element?.closest(`[${Env.prefix}external]`) != null;
  }

  /**
   * 指定された要素を監視します。
   *
   * @param root 監視対象の要素
   */
  public static observe(root: HTMLElement | Document) {
    const observer = new MutationObserver(mutations => {
      Observer.processMutations(mutations);
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    Observer._mutationObservers.push(observer);
  }

  /**
   * 保留中の DOM 変更を同期的に引き取って処理へ載せます。
   *
   * `MutationObserver` は非同期にしか通知しないため、他スクリプトが `data-bind` を
   * 書き換えた直後に利用者が操作すると、**実際には先に起きた外部の書き換えの方が
   * 後の通番を得る**という逆転が起きます（`docs/ja/値の供給と権威解決の設計書.md`
   * 「段構成の訂正」）。操作の通番を発番する側が、その直前にこれを呼び出して
   * 「自分より前に DOM 上で起きていた変更」を先に番号付けします。呼び出すのは
   * **DOM イベントを起点とする手続き**からだけです（`Procedure` のコンストラクタを
   * 参照）。取り込みは同期的にバインドデータの更新まで進むため、バインドワークの
   * 内部から生成される手続きで呼ぶと実行中のワークへ再入します。
   *
   * 同期で処理するのは `data-bind` 属性の書き換えだけです。**それ以外の変更は
   * 従来どおり非同期に処理します。** 同期で処理すると、他ライブラリが同一クリック中に
   * 行ったノード削除などがこの操作より前に適用され、手続きの前提が変わります
   * （`tests/init-deferred-events.test.ts` の「対象要素が DOM から外れても手続きを
   * 実行する」を参照）。番号付けが必要なのは値の権威に関わる `data-bind` だけです。
   *
   * @returns 戻り値はありません。
   */
  public static flushPendingMutations(): void {
    for (const observer of Observer._mutationObservers) {
      const records = observer.takeRecords();
      if (records.length === 0) {
        continue;
      }
      const bindRecords = records.filter(Observer.isBindAttributeRecord);
      const others = records.filter(
        record => !Observer.isBindAttributeRecord(record),
      );
      if (bindRecords.length > 0) {
        // 引き取った書き換えは、この時点で「Haori が知った」ものとして 1 つの通番を
        // 割り当てる。番号の割り当てだけが同期で、適用は従来どおり非同期に進む。
        Observer.processMutations(bindRecords, ElementFragment.nextSequence());
      }
      if (others.length > 0) {
        // 引き取ってしまった分は失わせない。監視コールバックと同じ非同期の位置で
        // 処理し、この操作より前に適用されないようにする。
        void Promise.resolve().then(() => {
          Observer.processMutations(others);
        });
      }
    }
  }

  /**
   * `data-bind` 属性の書き換えを表すレコードかどうかを返します。
   *
   * @param record 判定する変更レコード
   * @returns `data-bind` 属性の変更なら true
   */
  private static isBindAttributeRecord(record: MutationRecord): boolean {
    return (
      record.type === 'attributes' &&
      record.attributeName === `${Env.prefix}bind`
    );
  }

  /**
   * DOM 変更のレコードを処理します。
   *
   * @param mutations 処理する変更レコード
   * @param originSequence 変更を検知した時点の通番。`flushPendingMutations()` から
   *     同期的に引き取った場合だけ渡す。渡さない場合は取り込みの時点で発番される
   * @returns 戻り値はありません。
   */
  private static processMutations(
    mutations: MutationRecord[],
    originSequence?: number,
  ): void {
    for (const mutation of mutations) {
      try {
        // 外部管理サブツリー（data-external 配下）で発生した変更は、外部の
        // select 拡張ライブラリ等が生成・更新する DOM とみなして無視する。
        if (Observer.isExternallyManaged(mutation.target)) {
          continue;
        }
        switch (mutation.type) {
          case 'attributes': {
            const element = mutation.target as HTMLElement;
            if (
              mutation.attributeName &&
              element.hasAttribute('data-haori-click-lock') &&
              (mutation.attributeName === 'disabled' ||
                mutation.attributeName === 'data-haori-click-lock')
            ) {
              break;
            }
            // 非表示分岐（data-if が偽）で検証対象から外すために付けた disabled は
            // エンジン管理なので属性処理へ載せない。載せると内部の属性マップに
            // disabled が焼き付き、表示へ戻した後の再評価で付け直される。
            // 復帰時は印を先に外すため、この判定に掛からず解除が反映される。
            if (
              mutation.attributeName &&
              element.hasAttribute(IF_DISABLED_MARKER) &&
              (mutation.attributeName === 'disabled' ||
                mutation.attributeName === IF_DISABLED_MARKER)
            ) {
              break;
            }
            if (
              mutation.attributeName &&
              Core.isAliasedAttributeReflection(element, mutation.attributeName)
            ) {
              break;
            }
            Core.setAttribute(
              element,
              mutation.attributeName!,
              element.getAttribute(mutation.attributeName!),
              true,
              originSequence,
            );
            IntersectObserver.syncElement(element);
            PollObserver.syncElement(element);
            VisibleRangeObserver.syncElement(element);
            break;
          }
          case 'childList': {
            Array.from(mutation.removedNodes).forEach(node => {
              IntersectObserver.cleanupTree(node);
              PollObserver.cleanupTree(node);
              VisibleRangeObserver.cleanupTree(node);
              Core.removeNode(node);
            });
            Array.from(mutation.addedNodes).forEach(node => {
              if (!(node.parentElement instanceof Element)) {
                return;
              }
              Core.addNode(node.parentElement, node);
              IntersectObserver.syncTree(node);
              PollObserver.syncTree(node);
              VisibleRangeObserver.syncTree(node);
            });
            // 行の増減があったコンテナ自身の監視対象を取り直す
            // （data-each-visible は親コンテナに付与され、行はその子のため）。
            if (mutation.target instanceof Element) {
              VisibleRangeObserver.syncElement(mutation.target as HTMLElement);
            }
            break;
          }
          case 'characterData': {
            if (
              mutation.target instanceof Text ||
              mutation.target instanceof Comment
            ) {
              Core.changeText(mutation.target, mutation.target.textContent!);
            } else {
              Log.warn(
                '[Haori]',
                'Unsupported character data type:',
                mutation.target,
              );
            }
            break;
          }
          default:
            Log.warn('[Haori]', 'Unknown mutation type:', mutation.type);
            continue;
        }
      } catch (error) {
        Log.error('[Haori]', 'Error processing mutation:', error);
      }
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Observer.init);
} else {
  Observer.init();
}
