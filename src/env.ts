/**
 * @fileoverview Haori環境検出機能
 *
 * 実行環境を管理します。
 */

import Dev from './dev';

/**
 * 実行環境を管理するクラスです。
 */
export default class Env {
  private static _prefix: string = 'data-';

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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Env.detect);
} else {
  Env.detect();
}
