/**
 * @fileoverview セレクタ属性の解決機能
 *
 * バインド先・コピー先などをセレクタで指定する属性の値を読み取り、要素を照会
 * します。属性値はテンプレート式（`{{}}`）を評価した結果を用いるため、
 * `data-each` の行の中から「その行の要素」を指す指定（`#plan-{{i}}` など）が
 * 書けます。
 *
 * 照会は例外にしません。CSS セレクタとして不正な値はログ出力してスキップします
 * （式の解決結果が想定と違っても、手続き全体を止めないためです）。
 */

import Log from './log';
import {ElementFragment} from './fragment';

/**
 * セレクタ属性の読み取りと要素照会を行うクラスです。
 */
export default class Selector {
  /**
   * セレクタ属性の値を評価済みの文字列として読み取ります。
   *
   * 値は `{{}}` を評価した結果です。単体プレースホルダが未解決参照になった場合な
   * ど、評価結果が文字列でない場合は「値の指定が無い」ものとして `null` を返します
   * （通常属性の未解決参照を属性削除として扱う規則に合わせています）。
   *
   * @param fragment 対象フラグメント
   * @param name 属性名
   * @returns 評価済みの属性値。属性が無い、または値が文字列でない場合は null
   */
  public static read(fragment: ElementFragment, name: string): string | null {
    if (!fragment.hasAttribute(name)) {
      return null;
    }
    const value = fragment.getAttribute(name);
    return typeof value === 'string' ? value : null;
  }

  /**
   * セレクタに一致する要素をすべて照会します。
   *
   * @param selector CSS セレクタ
   * @param attributeName ログ出力に用いる属性名
   * @param root 照会の起点（既定は `document.body`）
   * @returns 一致した要素の配列。セレクタが不正な場合は空配列
   */
  public static queryAll<T extends Element = Element>(
    selector: string,
    attributeName: string,
    root: ParentNode = document.body,
  ): T[] {
    try {
      return Array.from(root.querySelectorAll<T>(selector));
    } catch (error) {
      Log.error(
        'Haori',
        `Invalid selector: ${selector} (${attributeName})`,
        error,
      );
      return [];
    }
  }

  /**
   * セレクタに一致する要素を、カンマ区切りの各セレクタを書いた順に照会します。
   *
   * 仕様「`data-{event}-click`」の「カンマ区切りの各セレクタを書いた順に押します」。
   * 1 つのセレクタに一致した複数の要素はその中で文書順に並べ、複数のセレクタに
   * 一致した要素は最初に一致した位置にだけ置きます。
   *
   * @param selector CSS セレクタ（カンマ区切りのセレクタリストを含む）
   * @param attributeName ログ出力に用いる属性名
   * @returns 一致した要素の配列。セレクタが不正な場合は空配列
   */
  public static queryAllInListOrder<T extends Element = Element>(
    selector: string,
    attributeName: string,
  ): T[] {
    // 不正なセレクタは、従来どおり全体を不正として扱う（一部だけ押さない）。
    if (Selector.queryAll<T>(selector, attributeName).length === 0) {
      return [];
    }
    const ordered = new Set<T>();
    Selector.splitList(selector).forEach(part => {
      Selector.queryAll<T>(part, attributeName).forEach(element =>
        ordered.add(element),
      );
    });
    return Array.from(ordered);
  }

  /**
   * セレクタリストを、最上位のカンマで各セレクタに分けます。
   *
   * 括弧（`:is(a, b)` など）・属性セレクタの角括弧・引用符の中のカンマと、
   * バックスラッシュでエスケープしたカンマでは分けません。
   *
   * @param selector セレクタリスト
   * @returns 各セレクタ
   */
  private static splitList(selector: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let quote: string | null = null;
    let start = 0;
    for (let i = 0; i < selector.length; i++) {
      const ch = selector[i];
      if (ch === '\\') {
        i++;
      } else if (quote !== null) {
        if (ch === quote) {
          quote = null;
        }
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '(' || ch === '[') {
        depth++;
      } else if (ch === ')' || ch === ']') {
        depth--;
      } else if (ch === ',' && depth === 0) {
        parts.push(selector.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(selector.slice(start));
    return parts;
  }

  /**
   * セレクタに一致する最初の要素を照会します。
   *
   * @param selector CSS セレクタ
   * @param attributeName ログ出力に用いる属性名
   * @param root 照会の起点（既定は `document.body`）
   * @returns 一致した要素。無い場合とセレクタが不正な場合は null
   */
  public static query<T extends Element = Element>(
    selector: string,
    attributeName: string,
    root: ParentNode = document.body,
  ): T | null {
    try {
      return root.querySelector<T>(selector);
    } catch (error) {
      Log.error(
        'Haori',
        `Invalid selector: ${selector} (${attributeName})`,
        error,
      );
      return null;
    }
  }
}
