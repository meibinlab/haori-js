/**
 * @fileoverview Haori開発モード管理機能
 *
 * 開発モードの有効/無効を管理し、デバッグ機能の制御を行います。
 * プロダクション環境では開発向け機能を無効化することで、
 * パフォーマンスとセキュリティを向上させます。
 */

/**
 * 開発モード管理クラスです。
 */
export class Dev {
  /** 開発モードフラグ */
  private static devMode = false;

  /**
   * 開発モードの状態を取得します。
   *
   * @returns 開発モードならtrue、そうでなければfalse
   */
  static isEnabled(): boolean {
    return Dev.devMode;
  }

  /**
   * 開発モードを有効化します。
   */
  static enable(): void {
    Dev.devMode = true;
  }

  /**
   * 開発モードを無効化します。
   */
  static disable(): void {
    Dev.devMode = false;
  }

  /**
   * 開発モードを切り替えます。
   *
   * @param enabled trueで有効化、falseで無効化
   */
  static set(enabled: boolean): void {
    Dev.devMode = Boolean(enabled);
  }

  /**
   * 開発モードでのみ実行される関数を実行します。
   *
   * @param fn 実行する関数
   */
  static only(fn: () => void): void {
    if (Dev.devMode) {
      fn();
    }
  }
}

// デフォルトエクスポート
export default Dev;
