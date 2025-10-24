/**
 * @fileoverview HTMLインポート機能
 *
 * 指定URLの HTML を取得し、body タグの中身のみを取り出します。
 * 仕様: data-import — 指定したURLの body タグの中身を対象エレメントの innerHTML に設定する。
 */
import Log from './log';

/**
 * インポート機能を提供するクラスです。
 */
export class Import {
  /**
   * 指定URLから HTML を取得し、body 内の HTML 文字列を返します。
   *
   * 振る舞い:
   * - HTTP ステータスが成功以外の場合は例外を投げます。
   * - HTML のパースに失敗した場合はログを出力し、テキスト全体を返します（フォールバック）。
   * - body タグが存在しない場合もテキスト全体を返します（フォールバック）。
   *
   * @param url 取得先の URL
   * @param init fetch のオプション（任意）
   * @returns body 内の HTML 文字列
   */
  public static async load(url: string, init?: RequestInit): Promise<string> {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (e) {
      Log.error('[Haori]', 'Failed to fetch import source:', url, e);
      throw new Error(`Failed to fetch: ${url}`);
    }

    if (!response.ok) {
      // ネットワーク/HTTP エラーは上位で扱いやすいように例外化
      const status = `${response.status} ${response.statusText}`;
      Log.error('[Haori]', 'Import HTTP error:', url, status);
      throw new Error(`Failed to load ${url}: ${status}`);
    }

    let text: string;
    try {
      text = await response.text();
    } catch (e) {
      Log.error('[Haori]', 'Failed to read response text:', url, e);
      throw new Error(`Failed to read response from: ${url}`);
    }

    // HTML としてパースし、body 内のみを返す
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      if (doc && doc.body) {
        return doc.body.innerHTML;
      }
      Log.warn('[Haori]', 'No body found in imported document:', url);
      return text;
    } catch (e) {
      // パース失敗時はフォールバックとしてテキスト全体を返す
      Log.error('[Haori]', 'Failed to parse imported HTML:', url, e);
      return text;
    }
  }
}
