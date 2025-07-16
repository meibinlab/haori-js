let devMode = false;

/**
 * 開発モードの是非を取得します。
 * 
 * @returns {boolean} 開発モードならtrue、そうでなければfalse
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
