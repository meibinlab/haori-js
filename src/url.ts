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
}
