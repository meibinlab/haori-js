/**
 * @fileoverview 登録した関数（`Haori.handlers`）
 *
 * `data-{event}-run-handler` などで名前を指定して呼ぶ関数と、CSP モードで式として
 * 書いた `*-run` から呼ぶ関数を保持します（仕様「登録した関数（`Haori.handlers`）」）。
 */

import Log from './log';

/**
 * 登録する関数です。`this` は宣言を書いた要素です。
 */
export type Handler = (this: Element, ...args: unknown[]) => unknown;

// ログの文言は仕様が決めないため、ミューテーションテストの対象から外す
// （docs/ja/testing.md「CSP モードの評価器はミューテーションテストで確かめる」の
// 「ログの文言」）。
// Stryker disable all
/** ログの見出し */
const TAG = '[Haori]';

/** ログの文言 */
const MESSAGES = {
  nameRequired: 'Handler name is required.',
  notFunction: (name: string): string =>
    `Handler "${name}" must be a function.`,
};
// Stryker restore all

/**
 * 登録した関数を保持するクラスです。
 */
export default class Handlers {
  /** 名前 → 関数 */
  private static readonly handlers = new Map<string, Handler>();

  /**
   * 関数を登録します。同じ名前で登録し直すと置き換えます。
   *
   * @param name 宣言に書く名前
   * @param handler 関数
   * @returns 戻り値はありません。
   */
  public static register(name: string, handler: Handler): void {
    const key = typeof name === 'string' ? name.trim() : '';
    if (key === '') {
      Log.error(TAG, MESSAGES.nameRequired);
      return;
    }
    if (typeof handler !== 'function') {
      Log.error(TAG, MESSAGES.notFunction(key));
      return;
    }
    Handlers.handlers.set(key, handler);
  }

  /**
   * 登録した関数かどうかを返します。
   *
   * @param name 名前
   * @returns 登録してあれば true
   */
  public static has(name: string): boolean {
    return Handlers.handlers.has(name);
  }

  /**
   * 登録した関数を返します。
   *
   * @param name 名前
   * @returns 関数。登録していなければ undefined
   */
  public static get(name: string): Handler | undefined {
    return Handlers.handlers.get(name);
  }

  /**
   * 登録した関数をすべて返します（式のスコープへ載せるため）。
   *
   * @returns 名前 → 関数
   */
  public static entries(): Record<string, Handler> {
    return Object.fromEntries(Handlers.handlers);
  }
}
