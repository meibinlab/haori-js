/**
 * @fileoverview URLパラメータ取得クラス
 *
 * URLのクエリパラメータを取得します。
 */

export default class Url {
  /**
   * URLのクエリパラメータを取得します。
   *
   * 名前が 1 つなら文字列、同じ名前が複数あれば出現順の配列にします。
   * `data-{event}-history` は配列を同じ名前の繰り返しで書くため、書いた URL を
   * 読み直すと同じ配列に戻ります（仕様「`data-url-param`」、課題 53）。
   *
   * @returns URLのクエリパラメータのキーと値のマップ
   */
  public static readParams(): Record<string, string | string[]> {
    const params: Record<string, string | string[]> = {};
    const urlParams = new URLSearchParams(window.location.search);
    for (const key of new Set(urlParams.keys())) {
      if (key === '__proto__') {
        // 配列を代入すると、このオブジェクトのプロトタイプが差し替わる。
        continue;
      }
      const values = urlParams.getAll(key);
      params[key] = values.length === 1 ? values[0] : values;
    }
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
