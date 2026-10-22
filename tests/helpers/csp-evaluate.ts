/**
 * @fileoverview CSP モードの評価器を、従来の方式と同じ入口の形で呼ぶテスト用の補助
 *
 * 従来の方式の `Expression.evaluateDetailed()` は、評価関数の組み立て（`new Function`）
 * の前後に方式によらない層（構文の検証・危険な値の検査・`haori` の注入・Proxy の
 * ラップ・評価中の prototype 系アクセスの遮断・未解決参照の扱い）を持ちます。この
 * 補助は、評価関数の部分だけを CSP モードの評価器へ差し替えた形を組み立てます。
 * 組み合わせる前に、二つの方式の結果を同じ入口で比べるためのものです。
 *
 * 方式によらない層は `Expression` の非公開の関数をそのまま呼びます。組み合わせる
 * 段階で、この形を `expression.ts` へ移します。
 */

import Expression, {ExpressionEvaluationDetail} from '../../src/expression';
import ExpressionInterpreter from '../../src/expression_interpreter';
import {
  FORBIDDEN_NAMES,
  REBINDABLE_FORBIDDEN_NAMES,
  STRICT_FORBIDDEN_NAMES,
} from '../../src/expression_rules';

/** `Expression` の非公開の層 */
interface ExpressionInternals {
  containsDangerousPatterns(expression: string): boolean;
  containsForbiddenReferencedValues(
    bindings: Record<string, unknown>,
    names: readonly string[] | null,
  ): boolean;
  getReferencedNames(expression: string): readonly string[];
  canAttemptMissingIdentifierRecovery(expression: string): boolean;
  wrapBoundValues(bindings: Record<string, unknown>): Record<string, unknown>;
  withBlockedPropertyAccess<T>(callback: () => T): T;
  BUILTIN_REFERENCE_PATTERN: RegExp;
  BUILTIN_DATA_REFERENCE_PATTERN: RegExp;
  BUILTIN_HELPERS: Record<string, unknown>;
}

const internals = Expression as unknown as ExpressionInternals;

/** バインドのキーとしても使わない名前（`FORBIDDEN_BINDING_NAMES` と同じ） */
const FORBIDDEN_BINDING_NAMES = new Set([
  ...[...FORBIDDEN_NAMES].filter(name => !REBINDABLE_FORBIDDEN_NAMES.has(name)),
  ...STRICT_FORBIDDEN_NAMES,
]);

/**
 * CSP モードの評価器で式を評価します（従来の方式と同じ入口の形）。
 *
 * @param expression 式
 * @param bindedValues バインド値
 * @returns 評価結果と未解決参照の有無
 */
export function cspEvaluateDetailed(
  expression: string,
  bindedValues: Record<string, unknown> = {},
): ExpressionEvaluationDetail {
  if (
    expression.trim() === '' ||
    internals.containsDangerousPatterns(expression)
  ) {
    return {value: null, unresolvedReference: false};
  }
  const forDetection = expression.replace(
    /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g,
    '',
  );
  const referencesData =
    internals.BUILTIN_DATA_REFERENCE_PATTERN.test(forDetection);
  const names = referencesData
    ? null
    : internals.getReferencedNames(expression);
  if (internals.containsForbiddenReferencedValues(bindedValues, names)) {
    return {value: null, unresolvedReference: false};
  }
  const bindings: Record<string, unknown> = {};
  for (const key of Object.keys(bindedValues)) {
    if (!FORBIDDEN_BINDING_NAMES.has(key)) {
      bindings[key] = bindedValues[key];
    }
  }
  if (internals.BUILTIN_REFERENCE_PATTERN.test(forDetection)) {
    bindings.haori = referencesData
      ? {...internals.BUILTIN_HELPERS, data: {...bindings}}
      : internals.BUILTIN_HELPERS;
  }
  let compiled;
  try {
    compiled = ExpressionInterpreter.compile(expression);
  } catch {
    return {value: null, unresolvedReference: false};
  }
  const recover = internals.canAttemptMissingIdentifierRecovery(expression);
  const evaluate = (missingIdentifier: 'throw' | 'undefined') =>
    internals.withBlockedPropertyAccess(() =>
      ExpressionInterpreter.run(compiled, internals.wrapBoundValues(bindings), {
        missingIdentifier,
      }),
    );
  try {
    const value = evaluate(recover ? 'undefined' : 'throw');
    return {value, unresolvedReference: value === undefined};
  } catch (error) {
    if (!recover && error instanceof ReferenceError) {
      // 仕様「判定する式と値を求める式」: 無いキーを undefined とみなして真偽値になれば採用する。
      try {
        const decided = evaluate('undefined');
        if (typeof decided === 'boolean') {
          return {value: decided, unresolvedReference: false};
        }
      } catch {
        // 判定できない。
      }
      return {value: undefined, unresolvedReference: true};
    }
    return {value: null, unresolvedReference: false};
  }
}
