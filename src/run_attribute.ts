/**
 * @fileoverview `new Function` を使わずに `*-run` 系の宣言を呼び出す処理
 *
 * `*-run` 系の属性（`data-{event}-run` / `-before-run` / `-after-run` /
 * `data-each-rendered-run` など）は、従来は属性値を JavaScript の本文として
 * `new Function` で実行します。次の 2 つの場合は、ここで組み立てた呼び出しを
 * 使います（仕様「登録した関数（`Haori.handlers`）」「CSP モードでの `*-run`」）。
 *
 * - `-handler` 属性がある: 登録した関数を名前で呼び、`-args` の式の値を引数に足す
 * - CSP モード: 本文を haori の式として評価する
 */

import Dev from './dev';
import Env from './env';
import Expression from './expression';
import ExpressionInterpreter from './expression_interpreter';
import type {ElementFragment} from './fragment';
import Handlers from './handlers';
import Log from './log';

/**
 * 組み立てた呼び出しです。
 *
 * @param args 従来の本文へ渡していた引数（`event` / `fetchUrl` など）
 * @returns 戻り値（従来の本文の戻り値と同じ扱い）
 */
export type RunCallable = (args: readonly unknown[]) => unknown;

// ログの文言は仕様が決めないため、ミューテーションテストの対象から外す
// （docs/ja/testing.md「CSP モードの評価器はミューテーションテストで確かめる」の
// 「ログの文言」）。
// Stryker disable all
/** ログの見出し */
const TAG = '[Haori]';

/** ログの文言 */
const MESSAGES = {
  bodyIgnored: (attrName: string): string =>
    `${attrName} is ignored because ${attrName}-handler is also declared.`,
  notRegistered: (name: string, attrName: string): string =>
    `Handler "${name}" is not registered (${attrName}-handler).` +
    ' Register it with Haori.handlers.register().',
  argsNotArray: (attrName: string): string =>
    `${attrName}-args must evaluate to an array without unresolved` +
    ' references; the handler is not called.',
  templateInBody: (attrName: string): string =>
    `${attrName} with {{...}} is not run in the CSP mode. Write the` +
    ' expression without {{...}}, or use ' +
    `${attrName}-handler and ${attrName}-args.`,
  notExpression: (attrName: string): string =>
    `${attrName} is not run in the CSP mode because it is not a single` +
    ` expression. Use ${attrName}-handler and ${attrName}-args.`,
  shadowed: (names: readonly string[], attrName: string): string =>
    `Handler(s) ${names.join(', ')} are shadowed by binding keys of` +
    ` the same name in ${attrName}; the binding values are used.`,
};
// Stryker restore all

/**
 * `*-run` 系の宣言の呼び出しを組み立てるクラスです。
 */
export default class RunAttribute {
  /**
   * ここで組み立てる宣言かどうかを返します。false の場合、呼び出し側は従来どおり
   * 本文を `new Function` で実行します。
   *
   * @param fragment 宣言を書いた要素
   * @param attrName 本文の属性名（`data-click-run` など）
   * @returns `-handler` 属性があるか CSP モードなら true
   */
  public static applies(fragment: ElementFragment, attrName: string): boolean {
    return Env.csp || fragment.hasAttribute(`${attrName}-handler`);
  }

  /**
   * 宣言があるかどうかを返します（本文の属性か `-handler` 属性）。
   *
   * @param fragment 宣言を書いた要素
   * @param attrName 本文の属性名
   * @returns どちらかがあれば true
   */
  public static declared(fragment: ElementFragment, attrName: string): boolean {
    return (
      fragment.hasAttribute(attrName) ||
      fragment.hasAttribute(`${attrName}-handler`)
    );
  }

  /**
   * 宣言の呼び出しを組み立てます。
   *
   * @param fragment 宣言を書いた要素
   * @param attrName 本文の属性名
   * @param parameterNames 従来の本文の引数名（CSP モードの式から参照できる名前）
   * @returns 呼び出し。実行するものが無い場合は null
   */
  public static compile(
    fragment: ElementFragment,
    attrName: string,
    parameterNames: readonly string[],
  ): RunCallable | null {
    const handlerAttrName = `${attrName}-handler`;
    if (fragment.hasAttribute(handlerAttrName)) {
      if (Dev.isEnabled() && fragment.hasAttribute(attrName)) {
        Log.warn(TAG, MESSAGES.bodyIgnored(attrName), fragment.getTarget());
      }
      return RunAttribute.compileHandler(fragment, attrName);
    }
    return RunAttribute.compileExpression(fragment, attrName, parameterNames);
  }

  /**
   * 登録した関数を呼ぶ呼び出しを組み立てます（`-handler` / `-args`）。
   *
   * 関数は呼ぶ時点で探します。宣言より後に登録した関数も呼べます。
   *
   * @param fragment 宣言を書いた要素
   * @param attrName 本文の属性名
   * @returns 呼び出し
   */
  private static compileHandler(
    fragment: ElementFragment,
    attrName: string,
  ): RunCallable {
    const name = fragment.getRawAttribute(`${attrName}-handler`) as string;
    const argsExpression = fragment.getRawAttribute(`${attrName}-args`);
    return args => {
      const handler = Handlers.get(name);
      if (handler === undefined) {
        Log.warn(
          TAG,
          MESSAGES.notRegistered(name, attrName),
          fragment.getTarget(),
        );
        return undefined;
      }
      let extra: readonly unknown[] = [];
      if (argsExpression !== null) {
        const detail = Expression.evaluateDetailed(
          argsExpression,
          fragment.getBindingData(),
        );
        // 未解決参照を含む式の値は undefined になるため、配列かどうかの判定で
        // 両方を止められる（仕様「登録した関数（`Haori.handlers`）」）。
        if (!Array.isArray(detail.value)) {
          Log.warn(TAG, MESSAGES.argsNotArray(attrName), argsExpression);
          return undefined;
        }
        extra = detail.value;
      }
      return handler.call(fragment.getTarget(), ...args, ...extra);
    };
  }

  /**
   * CSP モードで、本文を haori の式として評価する呼び出しを組み立てます。
   *
   * 式から参照できる名前は、従来の本文の引数名・要素のスコープ・登録した関数の
   * 順に解決します。式として読めない本文と `{{` を含む本文は評価しません。
   *
   * @param fragment 宣言を書いた要素
   * @param attrName 本文の属性名
   * @param parameterNames 従来の本文の引数名
   * @returns 呼び出し。評価しない本文の場合は null
   */
  private static compileExpression(
    fragment: ElementFragment,
    attrName: string,
    parameterNames: readonly string[],
  ): RunCallable | null {
    const body = fragment.getRawAttribute(attrName) as string;
    if (body.includes('{{')) {
      Log.warn(TAG, MESSAGES.templateInBody(attrName), fragment.getTarget());
      return null;
    }
    try {
      ExpressionInterpreter.compile(body);
    } catch {
      Log.warn(TAG, MESSAGES.notExpression(attrName), fragment.getTarget());
      return null;
    }
    return args => {
      const bindings = fragment.getBindingData();
      if (Dev.isEnabled()) {
        RunAttribute.reportShadowedHandlers(bindings, attrName);
      }
      const scope: Record<string, unknown> = {
        ...Handlers.entries(),
        ...bindings,
      };
      parameterNames.forEach((name, index) => {
        scope[name] = args[index];
      });
      return Expression.evaluate(body, scope);
    };
  }

  /**
   * スコープのキーに隠れて式から呼べない登録した関数を警告します（開発モード）。
   *
   * @param bindings 要素のスコープ
   * @param attrName 本文の属性名
   * @returns 戻り値はありません。
   */
  private static reportShadowedHandlers(
    bindings: Record<string, unknown>,
    attrName: string,
  ): void {
    const shadowed = Object.keys(bindings).filter(key => Handlers.has(key));
    if (shadowed.length > 0) {
      Log.warn(TAG, MESSAGES.shadowed(shadowed, attrName));
    }
  }
}
