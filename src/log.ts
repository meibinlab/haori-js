/**
 * Haori共通ログ機能
 */

import { isDevMode } from './dev';

/**
 * 開発モードでのみコンソールに警告を出力する共通関数
 * @param message メッセージ
 * @param args 追加の引数
 */
export function logWarning(message: string, ...args: any[]): void {
  if (isDevMode() && typeof console !== "undefined" && console.warn) {
    console.warn(message, ...args);
  }
}

/**
 * 開発モードでのみコンソールにエラーを出力する共通関数
 * @param message メッセージ
 * @param args 追加の引数
 */
export function logError(message: string, ...args: any[]): void {
  if (isDevMode() && typeof console !== "undefined" && console.error) {
    console.error(message, ...args);
  }
}

/**
 * 開発モードでのみコンソールに情報を出力する共通関数
 * @param message メッセージ
 * @param args 追加の引数
 */
export function logInfo(message: string, ...args: any[]): void {
  if (isDevMode() && typeof console !== "undefined" && console.log) {
    console.log(message, ...args);
  }
}
