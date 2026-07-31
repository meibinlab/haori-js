/**
 * @fileoverview 外部ライブラリ連携（`data-enhance` / `data-enhance-new`）
 *
 * DOM を走査して機能を付加する外部ライブラリ（Choices.js・YubinBango など）は、
 * `data-each` の行追加や `data-if` の再表示で DOM が入れ替わるたびに再適用が必要に
 * なります。適用対象・冪等性・インスタンスの保持を画面側の JavaScript に持たせずに
 * 済むよう、宣言で契機を与える仕組みです。
 *
 * - `data-enhance="名前"`: `Haori.enhancers.register()` で登録した連携を適用します。
 *   要素ごと・名前ごとに `init` は一度だけ実行し、以後の再描画では `refresh` を
 *   呼びます。要素が DOM から外れたときは `destroy` を呼びます。
 * - `data-enhance-new="Global.Ctor"`: 登録なしで、グローバル参照を `new` するだけの
 *   簡易形です。値はドット区切りのグローバル参照だけを許し、引数には対象要素を
 *   渡します。要素ごとに一度だけ実行します。
 */

import Dev from './dev';
import Env from './env';
import Log from './log';

/**
 * 外部ライブラリ連携の定義。
 *
 * `init` の戻り値はインスタンスとして保持し、`refresh` と `destroy` へ渡します。
 */
export interface Enhancer {
  /**
   * 対象要素へ外部ライブラリを適用します。
   *
   * @param element 対象要素
   * @returns 保持するインスタンス（不要なら戻り値なし）
   */
  init(element: HTMLElement): unknown;

  /**
   * 適用済みの要素を再同期します（`data-each` の再描画後など）。
   *
   * @param element 対象要素
   * @param instance `init` が返したインスタンス
   * @returns 戻り値はありません。
   */
  refresh?(element: HTMLElement, instance: unknown): void;

  /**
   * 要素が DOM から外れるときに後始末します。
   *
   * @param element 対象要素
   * @param instance `init` が返したインスタンス
   * @returns 戻り値はありません。
   */
  destroy?(element: HTMLElement, instance: unknown): void;
}

/** `data-enhance-new` に書けるグローバル参照の形式 */
const GLOBAL_REFERENCE_PATTERN =
  /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;

/** `data-enhance-new` で適用済みを記録するキーの接頭辞 */
const NEW_INSTANCE_KEY_PREFIX = 'new:';

/**
 * 外部ライブラリ連携の適用を管理します。
 */
export default class Enhance {
  /** 登録済みの連携（名前 → 定義） */
  private static readonly enhancers = new Map<string, Enhancer>();

  /** 要素ごとの適用状況（要素 → キー → インスタンス） */
  private static readonly instances = new WeakMap<
    HTMLElement,
    Map<string, unknown>
  >();

  /** 未登録の名前として警告済みの連携名 */
  private static readonly warnedUnknownNames = new Set<string>();

  /** 解決できないグローバル参照として警告済みの値 */
  private static readonly warnedMissingGlobals = new Set<string>();

  /**
   * 外部ライブラリ連携を登録します。
   *
   * 登録前に描画された要素へも遡って適用するため、スクリプトの読み込み順に
   * 依存しません（登録の時点で `document.body` 配下を走査します）。
   *
   * @param name `data-enhance` に書く名前
   * @param enhancer 連携の定義
   * @returns 戻り値はありません。
   */
  public static register(name: string, enhancer: Enhancer): void {
    const key = typeof name === 'string' ? name.trim() : '';
    if (key === '') {
      Log.error('[Haori]', 'Enhancer name is required.');
      return;
    }
    if (!enhancer || typeof enhancer.init !== 'function') {
      Log.error('[Haori]', `Enhancer "${key}" must have an init function.`);
      return;
    }
    Enhance.enhancers.set(key, enhancer);
    Enhance.warnedUnknownNames.delete(key);
    if (typeof document !== 'undefined' && document.body) {
      // 登録より前に描画された要素へ遡って適用する。
      Enhance.applySubtree(document.body);
    }
  }

  /**
   * 登録済みの連携かどうかを返します。
   *
   * @param name 連携名
   * @returns 登録済みなら true
   */
  public static has(name: string): boolean {
    return Enhance.enhancers.has(name);
  }

  /**
   * 対象要素とその子孫へ、まだ適用していない連携を適用します。
   *
   * 初期スキャン・新規ノードの追加・`data-each` の新規行から呼び出します。
   *
   * @param root 走査の起点となる要素
   * @returns 戻り値はありません。
   */
  public static applySubtree(root: HTMLElement): void {
    Enhance.forEachTarget(root, element => {
      Enhance.applyElement(element);
    });
  }

  /**
   * 対象要素とその子孫の連携を再同期します。
   *
   * 適用済みの要素では `refresh`、未適用の要素では `init` を呼びます。
   * `data-each` の描画確定と `data-if` の再表示から呼び出します。
   *
   * @param root 走査の起点となる要素
   * @returns 戻り値はありません。
   */
  public static refreshSubtree(root: HTMLElement): void {
    Enhance.forEachTarget(root, element => {
      Enhance.refreshElement(element);
    });
  }

  /**
   * 対象要素とその子孫の連携を破棄します。
   *
   * 要素が DOM から外れるとき（`data-each` の行削除など）に呼び出します。
   *
   * @param root 走査の起点となる要素
   * @returns 戻り値はありません。
   */
  public static destroySubtree(root: HTMLElement): void {
    Enhance.forEachTarget(root, element => {
      Enhance.destroyElement(element);
    });
  }

  /**
   * 走査対象（連携を宣言した要素）を列挙します。
   *
   * @param root 走査の起点となる要素
   * @param callback 各要素に対する処理
   * @returns 戻り値はありません。
   */
  private static forEachTarget(
    root: HTMLElement,
    callback: (element: HTMLElement) => void,
  ): void {
    if (!root || typeof root.querySelectorAll !== 'function') {
      return;
    }
    const selector =
      `[${Env.prefix}enhance],[${Env.prefix}enhance-new]`;
    if (typeof root.matches === 'function' && root.matches(selector)) {
      callback(root);
    }
    root.querySelectorAll<HTMLElement>(selector).forEach(element => {
      callback(element);
    });
  }

  /**
   * 1 要素へ、まだ適用していない連携を適用します。
   *
   * @param element 対象要素
   * @returns 戻り値はありません。
   */
  private static applyElement(element: HTMLElement): void {
    const applied = Enhance.instances.get(element) ?? null;
    Enhance.names(element, `${Env.prefix}enhance`).forEach(name => {
      if (applied?.has(name)) {
        return;
      }
      const enhancer = Enhance.enhancers.get(name);
      if (!enhancer) {
        // 登録がまだの場合は適用を保留する（`register()` が遡って適用する）。
        Enhance.warnUnknownName(name);
        return;
      }
      Enhance.run(`enhance "${name}"`, () => {
        const instance = enhancer.init(element);
        Enhance.appliedKeys(element).set(name, instance);
      });
    });
    Enhance.names(element, `${Env.prefix}enhance-new`).forEach(reference => {
      const key = `${NEW_INSTANCE_KEY_PREFIX}${reference}`;
      if (Enhance.instances.get(element)?.has(key)) {
        return;
      }
      const constructor = Enhance.resolveGlobal(reference);
      if (constructor === null) {
        return;
      }
      Enhance.run(`enhance-new "${reference}"`, () => {
        const instance = new (constructor as new (
          element: HTMLElement,
        ) => unknown)(element);
        Enhance.appliedKeys(element).set(key, instance);
      });
    });
  }

  /**
   * 1 要素の連携を再同期します（未適用なら適用します）。
   *
   * @param element 対象要素
   * @returns 戻り値はありません。
   */
  private static refreshElement(element: HTMLElement): void {
    const applied = Enhance.instances.get(element);
    Enhance.names(element, `${Env.prefix}enhance`).forEach(name => {
      if (!applied || !applied.has(name)) {
        return;
      }
      const enhancer = Enhance.enhancers.get(name);
      if (!enhancer || typeof enhancer.refresh !== 'function') {
        return;
      }
      Enhance.run(`enhance "${name}" refresh`, () => {
        enhancer.refresh!(element, applied.get(name));
      });
    });
    // 未適用の宣言（新しく描画された要素や、登録が後になった連携）を適用する。
    Enhance.applyElement(element);
  }

  /**
   * 1 要素の連携を破棄します。
   *
   * @param element 対象要素
   * @returns 戻り値はありません。
   */
  private static destroyElement(element: HTMLElement): void {
    const applied = Enhance.instances.get(element);
    if (!applied) {
      return;
    }
    applied.forEach((instance, key) => {
      if (key.startsWith(NEW_INSTANCE_KEY_PREFIX)) {
        // 簡易形は後始末の宣言を持たないため、記録の破棄だけ行う。
        return;
      }
      const enhancer = Enhance.enhancers.get(key);
      if (!enhancer || typeof enhancer.destroy !== 'function') {
        return;
      }
      Enhance.run(`enhance "${key}" destroy`, () => {
        enhancer.destroy!(element, instance);
      });
    });
    Enhance.instances.delete(element);
  }

  /**
   * 要素の適用状況を返します（無ければ作成します）。
   *
   * @param element 対象要素
   * @returns キー → インスタンスの対応
   */
  private static appliedKeys(element: HTMLElement): Map<string, unknown> {
    const existing = Enhance.instances.get(element);
    if (existing) {
      return existing;
    }
    const created = new Map<string, unknown>();
    Enhance.instances.set(element, created);
    return created;
  }

  /**
   * 空白区切りの属性値を名前の一覧へ分解します。
   *
   * @param element 対象要素
   * @param attributeName 属性名
   * @returns 名前の一覧（重複は除去）
   */
  private static names(element: HTMLElement, attributeName: string): string[] {
    const raw = element.getAttribute(attributeName);
    if (raw === null) {
      return [];
    }
    return Array.from(
      new Set(
        raw
          .split(/\s+/)
          .map(name => name.trim())
          .filter(name => name !== ''),
      ),
    );
  }

  /**
   * ドット区切りのグローバル参照を解決します。
   *
   * 値は識別子とドットだけを許します。式やコードは受け付けません（属性値をコード
   * として実行しないため）。
   *
   * @param reference `data-enhance-new` の値
   * @returns 解決した値。解決できない場合は null
   */
  private static resolveGlobal(reference: string): unknown {
    if (!GLOBAL_REFERENCE_PATTERN.test(reference)) {
      Log.error(
        '[Haori]',
        `${Env.prefix}enhance-new accepts a dot-separated global reference` +
          ` only: ${reference}`,
      );
      return null;
    }
    let current: unknown = globalThis;
    for (const part of reference.split('.')) {
      if (current === null || typeof current !== 'object') {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[part];
      if (current === undefined) {
        break;
      }
    }
    if (typeof current !== 'function') {
      if (Dev.isEnabled() && !Enhance.warnedMissingGlobals.has(reference)) {
        Enhance.warnedMissingGlobals.add(reference);
        Log.warn(
          '[Haori]',
          `${Env.prefix}enhance-new could not resolve the global reference` +
            ` (load the library before Haori runs): ${reference}`,
        );
      }
      return null;
    }
    return current;
  }

  /**
   * 未登録の連携名を開発モードで一度だけ警告します。
   *
   * @param name 連携名
   * @returns 戻り値はありません。
   */
  private static warnUnknownName(name: string): void {
    if (!Dev.isEnabled() || Enhance.warnedUnknownNames.has(name)) {
      return;
    }
    Enhance.warnedUnknownNames.add(name);
    Log.warn(
      '[Haori]',
      `Enhancer "${name}" is not registered yet; the declaration is kept` +
        ' pending and applied when it is registered' +
        ` (Haori.enhancers.register('${name}', {init(el) {...}})).`,
    );
  }

  /**
   * 連携の呼び出しを例外から保護して実行します。
   *
   * 1 つの連携の失敗で他の要素の適用や描画を止めないため、例外は記録して続行します。
   *
   * @param label ログに出す処理名
   * @param callback 実行する処理
   * @returns 戻り値はありません。
   */
  private static run(label: string, callback: () => void): void {
    try {
      callback();
    } catch (error) {
      Log.error('[Haori]', `${label} failed:`, error);
    }
  }
}
