/**
 * @fileoverview Haori共通ログ機能
 *
 * 開発モード時のみログ出力を行います。
 */

import {Dev} from './dev';

/**
 * ログ出力を管理するクラス
 */
export class Log {
  /**
   * 開発モードでのみコンソールに情報を出力します。
   *
   * @param message 出力するメッセージ
   * @param args 追加の引数
   */
  static info(message: string, ...args: unknown[]): void {
    if (Dev.isEnabled() && typeof console !== 'undefined' && console.log) {
      console.log(message, ...args);
    }
  }

  /**
   * 開発モードでのみコンソールに警告を出力します。
   *
   * @param message 出力するメッセージ
   * @param args 追加の引数
   */
  static warn(message: string, ...args: unknown[]): void {
    if (Dev.isEnabled() && typeof console !== 'undefined' && console.warn) {
      console.warn(message, ...args);
    }
  }

  /**
   * 開発モードでのみコンソールにエラーを出力します。
   *
   * @param message 出力するメッセージ
   * @param args 追加の引数
   */
  static error(message: string, ...args: unknown[]): void {
    if (Dev.isEnabled() && typeof console !== 'undefined' && console.error) {
      console.error(message, ...args);
    }
  }
}
