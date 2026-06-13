/**
 * @fileoverview URLパラメータ取得クラス
 *
 * URLのクエリパラメータを取得します。
 */

export default class Url {
  /**
   * URLのクエリパラメータを取得します。
   *
   * @returns URLのクエリパラメータのキーと値のマップ
   */
  public static readParams(): Record<string, string> {
    const params: Record<string, string> = {};
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    urlParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  }

  /**
   * 値が安全な同一オリジンのローカルパスかどうかを判定します。
   *
   * オープンリダイレクトを防ぐため、外部遷移やプロトコル相対と解釈され得る値を
   * 拒否します。判定前に前後の空白を除去します。具体的には、空白除去後の値が
   * 単一の `/` で始まり、`//`・`/\`（ともにプロトコル相対と解釈され得る）で
   * 始まらないことを要件とし、さらに現在オリジンを基準に解決したオリジンが一致
   * することも確認します（スキームやオーソリティの混入対策）。
   *
   * 戻り先クエリの受け手（`data-{event}-redirect-return-param`）から利用され、
   * 送り手（認証ガードの `*-return-param`）と対称な検証を一元化します。
   *
   * @param value 判定対象の値（URL クエリから1回だけデコードして取得した想定）
   * @returns 安全な同一オリジンのローカルパスなら true
   */
  public static isSafeLocalPath(value: string): boolean {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed[0] !== '/') {
      return false;
    }
    // '//' と '/\' はプロトコル相対 URL と解釈され得るため拒否する。
    if (trimmed[1] === '/' || trimmed[1] === '\\') {
      return false;
    }
    // 念のため、現在オリジンを基準に解決したオリジンの一致も確認する。
    try {
      const resolved = new URL(trimmed, window.location.origin);
      return resolved.origin === window.location.origin;
    } catch {
      return false;
    }
  }
}
