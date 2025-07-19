/**
 * @fileoverview Haori環境検出機能
 *
 * 実行環境から開発モードかどうかを自動検出します。
 * scriptタグにdata-devもしくはhor-dev属性がある場合、
 * もしくはローカルホスト系ドメインであれば開発モードを有効化します。
 */

import {setDevMode} from './dev';

/**
 * 開発モードかどうかを環境から検出します。
 */
export function detectDevMode(): void {
  try {
    // script タグに data-dev または hor-dev 属性がある場合
    const currentScript =
      document.currentScript || document.querySelector('script[src*="haori"]');
    if (
      currentScript instanceof HTMLScriptElement &&
      (currentScript.hasAttribute('data-dev') ||
        currentScript.hasAttribute('hor-dev'))
    ) {
      setDevMode(true);
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
      setDevMode(true);
      return;
    }

    // それ以外は開発モードを無効化
    setDevMode(false);
  } catch {
    // SSRや非ブラウザ環境では無視
  }
}
