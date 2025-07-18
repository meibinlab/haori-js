/**
 * @fileoverview Haori環境検出機能
 * 
 * 実行環境から開発モードかどうかを自動検出します。
 * scriptタグの属性やホスト名を解析して、
 * 適切に開発モードを有効化する機能を提供します。
 */

import {setDevMode} from './dev';

/**
 * 開発モードかどうかを環境から検出します。
 * 
 * scriptタグのdata-dev/hor-dev属性、またはローカルホスト系ドメインを検出して
 * 自動的に開発モードを有効化します。
 */
export function detectDevModeFromEnv(): void {
  try {
    // script タグに data-dev または hor-dev 属性がある場合
    const currentScript =
        document.currentScript ||
        document.querySelector('script[src*="haori"]');
    if (currentScript instanceof HTMLScriptElement &&
        (currentScript.hasAttribute('data-dev') ||
         currentScript.hasAttribute('hor-dev'))) {
      setDevMode(true);
      return;
    }

    // ローカルホスト系ドメインの場合
    const host = window.location.hostname;
    if (host === 'localhost' || host.endsWith('.localhost') ||
        host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) {
      setDevMode(true);
      return;
    }

    // 条件に一致しなければ false のまま
  } catch {
    // SSRや非ブラウザ環境では無視
  }
}
