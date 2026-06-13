/**
 * @fileoverview 認証ガード（401/403 時のリダイレクト）機能。
 *
 * `<body>` または `<html>` に宣言したグローバル属性に従い、Haori の fetch 応答が
 * 認証エラー（401 Unauthorized / 403 Forbidden）だったときに指定 URL へ遷移します。
 * HTTP ステータス別のオプトイン属性として提供します。
 *
 * - `data-unauthorized-redirect="URL"`: 401 応答時の遷移先。
 * - `data-forbidden-redirect="URL"`: 403 応答時の遷移先。
 *
 * 属性値は `{{...}}` 式で記述できます（例 `data-unauthorized-redirect="{{loginUrl}}"`）。
 * 対象属性が無いステータスでは何もしません（ステータス別オプトイン）。
 *
 * さらに、ログイン後の復帰用に「現在の遷移元 URL」を遷移先へクエリとして自動付与する
 * オプトイン属性をステータス別に提供します。
 *
 * - `data-unauthorized-redirect-return-param="クエリ名"`: 401 遷移先へ付与。
 * - `data-forbidden-redirect-return-param="クエリ名"`: 403 遷移先へ付与。
 *
 * 付与値は現在ページの `pathname + search + hash` で、`encodeURIComponent` により
 * パーセントエンコードされます。遷移先 URL に同名クエリが既にある場合は、宣言された
 * 遷移先 URL 側の値を優先し、自動付与は行いません。
 */

import Env from './env';
import Expression from './expression';
import Fragment, {ElementFragment} from './fragment';

/** ステータスコードと対応する遷移属性サフィックスの対応表。 */
const REDIRECT_ATTR_SUFFIX: Readonly<Record<number, string>> = {
  401: 'unauthorized-redirect',
  403: 'forbidden-redirect',
};

/**
 * `{{...}}` を含むテンプレート文字列を、指定スコープで評価して文字列化します。
 * URL 属性向けの最小限の置換で、評価に失敗した式は空文字へ落とします。
 *
 * @param template テンプレート文字列
 * @param scope 評価スコープ（要素の解決済みバインドデータ）
 * @returns 置換後の文字列
 */
function evaluateUrlTemplate(
  template: string,
  scope: Record<string, unknown>,
): string {
  return template.replace(/\{\{([\s\S]+?)\}\}/g, (_match, expression) => {
    try {
      const value = Expression.evaluate(String(expression).trim(), scope);
      return value === null || value === undefined ? '' : String(value);
    } catch {
      return '';
    }
  });
}

/**
 * 指定要素から遷移先 URL を取得します。属性値は DOM から直接読み取り、`{{...}}` を
 * 含む場合のみ要素の解決済みスコープで評価します。
 *
 * @param element 対象要素
 * @param attr 属性名
 * @returns 解決済みの URL。未設定・空文字なら null。
 */
function resolveRedirectUrl(element: HTMLElement, attr: string): string | null {
  const raw = element.getAttribute(attr);
  if (raw === null || raw === '') {
    return null;
  }
  if (!raw.includes('{{')) {
    return raw;
  }
  const fragment = Fragment.get(element);
  const scope =
    fragment instanceof ElementFragment ? fragment.getBindingData() : {};
  const url = evaluateUrlTemplate(raw, scope);
  return url === '' ? null : url;
}

/**
 * 遷移先 URL へ「現在の遷移元 URL」を復帰用クエリとして付与します。対象要素に
 * `<遷移属性>-return-param` が宣言されている場合のみ動作し、その値をクエリ名として
 * `pathname + search + hash` を `encodeURIComponent` でエンコードして付与します。
 *
 * 付与は宣言された遷移先 URL の形式（相対/絶対）を保持したまま、フラグメント（`#...`）の
 * 手前へクエリを挿入します。遷移先 URL に同名クエリが既にある場合は、宣言された遷移先
 * URL 側を優先して付与しません。URL 解析に失敗した場合や属性が無い場合は、元の URL を
 * そのまま返します。
 *
 * @param element 遷移先 URL を解決した要素（戻り先属性も同要素から読み取る）
 * @param attr 遷移属性名（例 `data-unauthorized-redirect`）
 * @param url 解決済みの遷移先 URL
 * @returns 戻り先クエリを付与した URL。付与対象でなければ元の URL。
 */
function applyReturnParam(
  element: HTMLElement,
  attr: string,
  url: string,
): string {
  const paramName = element.getAttribute(`${attr}-return-param`);
  if (paramName === null || paramName === '') {
    return url;
  }
  // 同名クエリは宣言された遷移先 URL 側を優先し、自動付与は行わない。
  try {
    if (new URL(url, window.location.href).searchParams.has(paramName)) {
      return url;
    }
  } catch {
    // URL 解析に失敗した場合は付与せず元の URL を返す。
    return url;
  }
  const current =
    window.location.pathname + window.location.search + window.location.hash;
  const pair =
    `${encodeURIComponent(paramName)}=${encodeURIComponent(current)}`;
  // フラグメント（#...）があればその手前にクエリを挿入する。
  const hashIndex = url.indexOf('#');
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const separator = beforeHash.includes('?') ? '&' : '?';
  return `${beforeHash}${separator}${pair}${hash}`;
}

/**
 * fetch 応答ステータスが認証エラー（401/403）の場合に、`<body>`／`<html>` に
 * 宣言された遷移先属性へリダイレクトします。`<body>` を優先し、無ければ `<html>` を
 * 参照します。
 *
 * 戻り先属性（`<遷移属性>-return-param`）が宣言されている場合は、遷移直前に現在の
 * 遷移元 URL を復帰用クエリとして付与します。
 *
 * 同一 URL（現在ページ自身）への遷移は無限リロードを避けるため行いません。判定は
 * 戻り先クエリ付与後の最終 URL に対して行います。
 *
 * @param status HTTP ステータスコード
 * @returns リダイレクトを実行した場合 true（呼び出し側は以後の処理を停止できる）
 */
export function checkAuthRedirect(status: number): boolean {
  const suffix = REDIRECT_ATTR_SUFFIX[status];
  if (suffix === undefined || typeof document === 'undefined') {
    return false;
  }
  const attr = `${Env.prefix}${suffix}`;
  const candidates: HTMLElement[] = [];
  if (document.body) {
    candidates.push(document.body);
  }
  if (document.documentElement) {
    candidates.push(document.documentElement);
  }
  for (const element of candidates) {
    const url = resolveRedirectUrl(element, attr);
    if (url === null) {
      continue;
    }
    const finalUrl = applyReturnParam(element, attr, url);
    // ログインページ自身の通信が再び認証エラーになった場合などの無限ループを防ぐ。
    try {
      if (
        new URL(finalUrl, window.location.href).href === window.location.href
      ) {
        return false;
      }
    } catch {
      // URL 解決に失敗した場合はそのまま遷移を試みる。
    }
    window.location.href = finalUrl;
    return true;
  }
  return false;
}
