/**
 * @fileoverview Haori共通ログ機能
 * 
 * 開発モード時のみログ出力を行う機能を提供します。
 * プロダクションビルドでのログ出力を避けることで、
 * パフォーマンスとセキュリティを向上させます。
 */

import { isDevMode } from './dev';

/**
 * 開発モードでのみコンソールに警告を出力します。
 *
 * @param message メッセージ
 * @param args 追加の引数
 */
export function logWarning(message: string, ...args: unknown[]): void {
  if (isDevMode() && typeof console !== 'undefined' && console.warn) {
    console.warn(message, ...args);
  }
}

/**
 * 開発モードでのみコンソールにエラーを出力します。
 *
 * @param message メッセージ
 * @param args 追加の引数
 */
export function logError(message: string, ...args: unknown[]): void {
  if (isDevMode() && typeof console !== 'undefined' && console.error) {
    console.error(message, ...args);
  }
}

/**
 * 開発モードでのみコンソールに情報を出力します。
 *
 * @param message メッセージ
 * @param args 追加の引数
 */
export function logInfo(message: string, ...args: unknown[]): void {
  if (isDevMode() && typeof console !== 'undefined' && console.log) {
    console.log(message, ...args);
  }
}
