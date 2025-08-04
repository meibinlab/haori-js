/**
 * @fileoverview Haori環境検出機能
 *
 * 実行環境を管理します。
 */

import Dev from './dev';

/**
 * 実行環境を管理するクラスです。
 */
export class Env {
  /**
   * 実行環境から開発モードかどうかを自動検出します。
   * scriptタグにdata-devもしくはhor-dev属性がある場合、
   * もしくはローカルホスト系ドメインであれば開発モードを有効化します。
   */
  static detectDevMode(): void {
    try {
      // script タグに data-dev または hor-dev 属性がある場合
      const currentScript =
        document.currentScript ||
        document.querySelector('script[src*="haori"]');
      if (
        currentScript instanceof HTMLScriptElement &&
        (currentScript.hasAttribute('data-dev') ||
          currentScript.hasAttribute('hor-dev'))
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
}
