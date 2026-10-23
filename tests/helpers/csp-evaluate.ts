/**
 * @fileoverview 式を CSP モードで評価するテスト用の補助
 *
 * 二つの方式の結果を同じ入口（`Expression.evaluateDetailed()`）で比べるために、
 * その呼び出しの間だけ CSP モードを有効にします。
 */

import Env from '../../src/env';
import Expression, {ExpressionEvaluationDetail} from '../../src/expression';

/**
 * CSP モードで式を評価します。
 *
 * @param expression 式
 * @param bindedValues バインド値
 * @returns 評価結果と未解決参照の有無
 */
export function cspEvaluateDetailed(
  expression: string,
  bindedValues: Record<string, unknown> = {},
): ExpressionEvaluationDetail {
  const previous = Env.csp;
  Env.setCsp(true);
  try {
    return Expression.evaluateDetailed(expression, bindedValues);
  } finally {
    Env.setCsp(previous);
  }
}
