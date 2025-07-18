/**
 * @fileoverview Haori開発モード管理機能
 * 
 * 開発モードの有効/無効を管理し、デバッグ機能の制御を行います。
 * プロダクション環境では開発向け機能を無効化することで、
 * パフォーマンスとセキュリティを向上させます。
 */

/** 開発モードフラグ */
let devMode = false;

/**
 * 開発モードの是非を取得します。
 * 
 * @return 開発モードならtrue、そうでなければfalse
 */
export function isDevMode(): boolean {
  return devMode;
}

/**
 * 開発モードを切り替えます。
 * 
 * @param enabled trueにすると開発モードを有効化、falseにすると無効化します
 */
export function setDevMode(enabled: boolean): void {
  devMode = Boolean(enabled);
}
