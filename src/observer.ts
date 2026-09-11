/**
 * @fileoverview 監視機能
 *
 * Observerクラスは、DOMの変更を監視し、バインディングの更新を行います。
 * MutationObserverを使用して、属性の変更、ノードの追加・削除、テキストノードの変更を監視します。
 */
import Core from './core';
import Enhance from './enhance';
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
   * 初期化の途中で取り込んだ DOM 変更の処理（要素の追加の走査と、属性の反映）。
   * `init()` の完了待ちに含めます。テキストの変更の評価は、初期化の最後の
   * `Queue.wait()` が待つため控えません（控える行を外しても結果が変わらないことを
   * 確認済み）。
   *
   * 初期化の間だけ配列で、それ以外は `null` です。
   */
  private static _initialIntakes: Promise<void>[] | null = null;

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
    // 初期スキャン中の取り込みで始まった処理を控える（`waitInitialIntakes()` を参照）。
    Observer._initialIntakes = [];
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
      await Observer.waitInitialIntakes();
      await Queue.wait();
      document.body.setAttribute('data-haori-ready', '');
      Observer.observe(document.head);
      Observer.observe(document.body);
      IntersectObserver.syncTree(document.body);
      PollObserver.syncTree(document.body);
      VisibleRangeObserver.syncTree(document.body);
    } finally {
      Observer._initialIntakes = null;
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
   * 初期化の途中で取り込んだ DOM 変更の処理を、すべて待ちます。
   *
   * 初期スキャン中の連携の呼び出しが起こした変更は、`captureMutations()` が取り込んで
   * 処理（要素の追加の走査、属性の反映など）を始めています。仕様
   * 「data-haori-ready 属性」の「すべての DOM 操作の完了後」を保つため、それらの完了を
   * 待ってから付与へ進みます。待っている間の取り込みで増えた分も待ちます。
   *
   * @returns 待機完了の Promise
   */
  private static async waitInitialIntakes(): Promise<void> {
    const pending = Observer._initialIntakes;
    while (pending !== null && pending.length > 0) {
      await Promise.allSettled(pending.splice(0));
    }
  }

  /**
   * 連携の呼び出しを実行し、呼び出しが起こした DOM 変更を取り込みます。
   *
   * DOM の監視は初期スキャンの後に始まるため、初期スキャン中の連携の呼び出しが
   * 起こした変更（要素の生成、`{{式}}` を含む宣言の追加など）は、そのままでは
   * 取り込まれません。仕様「`data-enhance`」の「初期スキャンの途中でも、後から追加
   * されたノードと同じく取り込みます」のため、監視の開始前に限り一時的な
   * `MutationObserver` で包み、呼び出しの直後に引き取った記録から既にある要素の
   * 取り外しと、既にある要素を包む追加を除いて（`toCapturedRecord()`）、通常の監視と
   * 同じ処理へ渡します。監視の開始後は、通常の監視が受け取るため何もしません。
   *
   * @internal `Enhance` の連携の呼び出しから使います（`Enhance.setMutationCapture()`）。
   * @param callback 連携の呼び出し
   * @returns 戻り値はありません。
   */
  public static captureMutations(callback: () => void): void {
    // 監視の開始後は通常の監視に任せる。ここで同期的に取り込むと、通常の監視も同じ
    // 変更を後から処理する（二重の処理）うえ、描画の処理の内側から呼ばれた連携の変更を
    // その場で取り込み、実行中の処理へ再入する（`flushPendingMutations()` を参照）。
    // この条件を外して落ちるテストは無いが、上の理由で残す（人間の判断、2026-09-11）。
    if (Observer._mutationObservers.length > 0) {
      callback();
      return;
    }
    const capture = new MutationObserver(() => undefined);
    capture.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    try {
      callback();
    } finally {
      const records = capture
        .takeRecords()
        .map(record => Observer.toCapturedRecord(record));
      capture.disconnect();
      Observer.processMutations(records);
    }
  }

  /**
   * 監視の開始前に引き取った記録から、既にある要素の取り外しと、既にある要素を包む
   * 追加を除きます。
   *
   * 連携の呼び出しが新しく生成した要素の追加と、属性・テキストの変更は取り込みます
   * （仕様「`data-enhance`」の「初期スキャンの途中でも、後から追加されたノードと同じく
   * 取り込みます」）。既にある要素の取り外しと、既にある要素を生成した要素で包むことは
   * 取り込みません（同じ節の「既にある要素の取り外しと、既にある要素を生成した要素で
   * 包むことは、初期スキャンの途中では取り込みません」）。取り外しを取り込むと、DOM を
   * 動かすライブラリを `data-external` なしで使ったとき、移動に伴う取り外しで `init` の
   * 直後に `destroy` と取り外しが走り、書いた要素が初期表示で DOM から消えます。既にある
   * 要素を包む追加を取り込むと、生成した要素の断片がその要素を子にする一方で元の親の子の
   * 一覧にも残り、値が二重に収集されます。
   *
   * @param record 引き取った記録
   * @returns 処理する記録
   */
  private static toCapturedRecord(record: MutationRecord): MutationRecord {
    if (record.type !== 'childList') {
      return record;
    }
    // `processMutations()` が読むのは種別・対象・追加・取り外しだけなので、追加を絞り、
    // 取り外しを空にした記録を作って渡す。
    return {
      type: record.type,
      target: record.target,
      addedNodes: Array.from(record.addedNodes).filter(
        node => !Observer.hasKnownDescendant(node),
      ),
      removedNodes: [],
    } as unknown as MutationRecord;
  }

  /**
   * ノードの子孫の要素に、Haori が既に知っているものがあるかを返します。
   *
   * ノード自身が既に知っている要素かは確かめません。既にある要素そのものの追加は、
   * 取り外しを除いていれば断片の付け替えになるだけで、`destroy` も二重の収集も起こさない
   * ためです（確かめる行を外しても、既存のテストと、移した要素の `data-fetch` の回数に
   * 差が出ないことを確認済み）。
   *
   * @param node 対象ノード
   * @returns 既に知っている要素を子孫に含む場合 true
   */
  private static hasKnownDescendant(node: Node): boolean {
    return (
      node instanceof Element &&
      Array.from(node.querySelectorAll('*')).some(
        element => ElementFragment.peek(element) !== null,
      )
    );
  }

  /**
   * 取り除いた記録が、`data-external` の内側の断片に対する古い記録かどうかを返します。
   *
   * `data-external` の配下で起きた変更は `isExternallyManaged()` で読み飛ばしますが、
   * その判定は処理の時点の祖先で行います。外部ライブラリの `destroy` が生成コンテナを
   * 取り除くと、コンテナの中で起きた変更（元の要素を戻したことなど）の記録は、処理の
   * 時点で対象が切り離されていて配下と判定できません。そのまま処理すると、
   * `data-external` の要素が保っている断片が木から外れ、書いた入力が収集から落ちます
   * （課題 #43）。記録の親と、ノードの断片の親が食い違い、かつその親が
   * `data-external` の要素かその配下なら、古い記録として捨てます。`data-external` の
   * 外では、移動の処理で断片の親が先に付け替わることがあるため適用しません。
   *
   * @param mutation 取り除いた記録
   * @param node 取り除かれたノード
   * @returns 捨てる場合 true
   */
  private static isStaleExternalRemoval(
    mutation: MutationRecord,
    node: Node,
  ): boolean {
    const parent = ElementFragment.peek(node)?.getParent() ?? null;
    if (parent === null || parent.getTarget() === mutation.target) {
      return false;
    }
    return parent.getTarget().closest(`[${Env.prefix}external]`) !== null;
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
            // `data-if` の非表示化・表示は `data-if-false` と `style.display` を DOM
            // へ直接書く。仕様「data-if の動作」の「判定の基準は内部状態であり、
            // `style.display` や `data-if-false` は追随結果として扱う」に従い、
            // これらは宣言として取り込まない。取り込むと内部の属性マップへ焼き付き、
            // 未スキャンの子を `scan` で初期化する経路（同節）の属性再適用が
            // 非表示の状態を書き戻して、表示へ戻した分岐を非表示へ引き戻す。
            // `style` は非表示のあいだだけ外す（利用者が書いた `style` の宣言は
            // 通常どおり取り込む）。復帰時は `data-if-false` を最後に外すため、
            // `show()` が戻した `style` はこの判定に掛からず取り込まれる。
            if (
              mutation.attributeName &&
              (mutation.attributeName === `${Env.prefix}if-false` ||
                (mutation.attributeName === 'style' &&
                  element.hasAttribute(`${Env.prefix}if-false`)))
            ) {
              if (mutation.attributeName === 'style') {
                // 取り込まないだけでは、外部のスクリプトが `display` を書き換えた
                // ときに要素が見えたまま残る。判定の基準は内部状態なので、追随結果
                // を書き直す（`reassertHiddenDisplay()` のコメントを参照）。
                // エンジン自身の書き込みもここへ来るが、その時点で追随結果どおり
                // なので書き直しは起きない。
                ElementFragment.reassertHiddenDisplay(element);
              }
              break;
            }
            if (
              mutation.attributeName &&
              Core.isAliasedAttributeReflection(element, mutation.attributeName)
            ) {
              break;
            }
            const applied = Core.setAttribute(
              element,
              mutation.attributeName!,
              element.getAttribute(mutation.attributeName!),
              true,
              originSequence,
            );
            // 初期化の途中で取り込んだ変更は、初期化の完了待ちに含める。
            Observer._initialIntakes?.push(applied);
            IntersectObserver.syncElement(element);
            PollObserver.syncElement(element);
            VisibleRangeObserver.syncElement(element);
            break;
          }
          case 'childList': {
            Array.from(mutation.removedNodes).forEach(node => {
              if (Observer.isStaleExternalRemoval(mutation, node)) {
                return;
              }
              IntersectObserver.cleanupTree(node);
              PollObserver.cleanupTree(node);
              VisibleRangeObserver.cleanupTree(node);
              Core.removeNode(node);
            });
            Array.from(mutation.addedNodes).forEach(node => {
              if (!(node.parentElement instanceof Element)) {
                return;
              }
              const scanned = Core.addNode(node.parentElement, node);
              // 初期化の途中で取り込んだ変更は、初期化の完了待ちに含める。
              Observer._initialIntakes?.push(scanned);
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

// 連携の呼び出しが監視の開始前に起こした DOM 変更を取り込む（`captureMutations()`）。
Enhance.setMutationCapture(callback => Observer.captureMutations(callback));

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Observer.init);
} else {
  Observer.init();
}
