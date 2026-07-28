/**
 * @fileoverview Haori環境検出機能
 *
 * 実行環境を管理します。
 */

import Dev from './dev';

/**
 * Haori.js の実行モードを表します。
 */
export type HaoriRuntime = 'embedded' | 'demo';

const DEFAULT_RUNTIME: HaoriRuntime = 'embedded';

/**
 * 指定文字列が有効な実行モードかどうかを判定します。
 *
 * @param runtime 判定対象の文字列。
 * @return 有効な実行モードなら true。
 */
function isHaoriRuntime(runtime: string): runtime is HaoriRuntime {
  return runtime === 'embedded' || runtime === 'demo';
}

/**
 * data-runtime 属性値を実行モードへ正規化します。
 *
 * @param runtime 属性から取得した値。
 * @return 有効な実行モード。属性が未設定なら null、無効値なら embedded。
 */
function resolveRuntimeAttribute(runtime: string | null): HaoriRuntime | null {
  if (runtime === null) {
    return null;
  }

  return isHaoriRuntime(runtime) ? runtime : DEFAULT_RUNTIME;
}

/**
 * 実行環境を管理するクラスです。
 */
export default class Env {
  private static _prefix: string = 'data-';
  private static _runtime: HaoriRuntime = DEFAULT_RUNTIME;
  private static _strictBind: boolean = false;

  /**
   * 厳格バインドモードが有効かどうかを取得します。
   *
   * 有効な場合、バインドに無いキーの参照を検出した時点で `error` ログを出力します。
   * 無効（既定）の場合は正常系として扱い、開発モードで集約警告のみを出します。
   *
   * @returns 厳格バインドモードなら true。
   */
  public static get strictBind(): boolean {
    return Env._strictBind;
  }

  /**
   * 厳格バインドモードを設定します。
   *
   * @param enabled 有効にする場合は true。
   * @return 戻り値はありません。
   */
  public static setStrictBind(enabled: boolean): void {
    Env._strictBind = enabled;
  }

  /**
   * 実行モードを取得します。
   *
   * @returns 実行モード。
   */
  public static get runtime(): HaoriRuntime {
    return Env._runtime;
  }

  /**
   * 実行モードを設定します。
   *
   * @param runtime 設定する実行モード。
   * @return 戻り値はありません。
   */
  public static setRuntime(runtime: string): void {
    Env._runtime = isHaoriRuntime(runtime) ? runtime : DEFAULT_RUNTIME;
  }

  /**
   * 実行環境からプレフィックスと開発モードかどうかを自動検出します。
   * scriptタグにdata-prefixがある場合は、その値+"-"をプレフィックスとして使用します。
   * scriptタグにdata-dev属性がある場合、
   * もしくはローカルホスト系ドメインであれば開発モードを有効化します。
   */
  static detect(): void {
    try {
      const currentScript =
        document.currentScript ||
        document.querySelector('script[src*="haori"]');
      if (currentScript instanceof HTMLScriptElement) {
        const prefix = currentScript.getAttribute('data-prefix') || Env._prefix;
        Env._prefix = prefix.endsWith('-') ? prefix : prefix + '-';

        const runtime = resolveRuntimeAttribute(
          currentScript.getAttribute('data-runtime'),
        );
        if (runtime !== null) {
          Env._runtime = runtime;
        }

        Env._strictBind = currentScript.hasAttribute(
          `${Env._prefix}strict-bind`,
        );
      }
      if (
        currentScript instanceof HTMLScriptElement &&
        currentScript.hasAttribute(`${Env._prefix}dev`)
      ) {
        Dev.set(true);
        return;
      }

      // ローカルホスト系ドメインの場合
      const host = window.location.hostname;
      if (
        host === 'localhost' ||
        host.endsWith('.localhost') ||
        host === '127.0.0.1' ||
        host === '::1' ||
        host.endsWith('.local')
      ) {
        Dev.set(true);
        return;
      }

      // それ以外は開発モードを無効化
      Dev.set(false);
    } catch {
      // SSRや非ブラウザ環境では無視
    }
  }

  /**
   * プレフィックスを取得します。
   *
   * @returns プレフィックス
   */
  public static get prefix(): string {
    return Env._prefix;
  }
}

// SSR や単体 import のような非ブラウザ環境では起動処理を行わない
// （このモジュールを import しただけで ReferenceError にならないようにする）。
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', Env.detect);
  } else {
    Env.detect();
  }
}
