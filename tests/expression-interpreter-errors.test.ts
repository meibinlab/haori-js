/* @vitest-environment jsdom */
/**
 * @fileoverview 評価中に例外になる式で、CSP モードの評価器と従来の方式の扱いが同じかを
 * 確かめるテスト
 *
 * 期待値の根拠は仕様「CSP モードの式評価」の「**評価の結果は従来の方式と同じです。**」
 * です。正常な値の一致は `expression-interpreter-corpus.test.ts` と
 * `expression-interpreter-fuzz.test.ts` が確かめるため、ここでは例外になる式に絞ります。
 *
 * 従来の方式は、評価中の例外を種類で振り分けます（仕様「バインドに無い識別子の扱い」）。
 * `ReferenceError` は未解決参照、それ以外は `null` です。そのため、入口の結果に加えて、
 * 評価関数そのものが投げる例外の種類も比べます。従来の方式の評価関数は、暗黙の
 * オプショナルチェーンなどの変換を入れた後の `new Function` です。構文の検証で
 * 拒否される式は、どちらの方式でも評価しません。
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import Expression from '../src/expression';
import ExpressionInterpreter from '../src/expression_interpreter';
import Log from '../src/log';
import {comparable} from './helpers/comparable';
import {cspEvaluateDetailed} from './helpers/csp-evaluate';

/** `Expression` の非公開の関数（評価関数の取り出しに使う） */
interface ExpressionInternals {
  containsDangerousPatterns(expression: string): boolean;
  prepareEvaluator(
    expression: string,
    bindings: Record<string, unknown>,
  ): {bindKeys: string[]; evaluator: ((...args: unknown[]) => unknown) | null};
  BUILTIN_HOLDER: object;
}
const internals = Expression as unknown as ExpressionInternals;

/**
 * 評価に使うバインド値を作ります。
 *
 * @returns バインド値
 */
function bindings(): Record<string, unknown> {
  return {a: 1, s: 'abc', list: [1, 2], empty: [], none: null, obj: {x: 1}};
}

/** 例外になる式 */
const CASES: readonly string[] = [
  'list.map(1)',
  's.repeat(-1)',
  '1n + 1',
  "JSON.parse('{')",
  'missingName',
  'missingName + 1',
  '[...a]',
  '[...none]',
  '(({x}) => x)()',
  '((p = missingName) => p)()',
  'BigInt(1.5)',
  "Symbol() + ''",
  'empty.reduce((p, x) => p + x)',
  'Math.max(...obj)',
  '(p => p)(...none)',
  'undefined()',
  'NaN()',
  '(1)()',
  "'a'()",
  'a()',
  'obj.x()',
  'list[0]()',
  '(() => missingName)()',
  'list.map(x => missingName)',
  'list.find(x => x.y.z.w())',
  "s.localeCompare('a', 'xx-invalid-tag-zzzzzzzzzz')",
  "new Intl.NumberFormat('en', {style: 'currency'})",
  'Number.prototype.toFixed.call(s)',
  '(1).toFixed(200)',
  'a.toString(1)',
  'String.fromCodePoint(-1)',
  "decodeURIComponent('%')",
  'null.x',
  'undefined.x',
  'none.x.y',
  'obj.missing.deep()',
  '[] + {}',
  'a ** -1n',
];

describe('例外になる式での、CSP モードの評価器と従来の方式の一致', () => {
  beforeEach(() => {
    vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(CASES)('%s の入口の結果が同じ', expression => {
    // 仕様「CSP モードの式評価」の「**評価の結果は従来の方式と同じです。**」
    const legacy = Expression.evaluateDetailed(expression, bindings());
    const csp = cspEvaluateDetailed(expression, bindings());
    expect({
      value: comparable(csp.value),
      unresolved: csp.unresolvedReference,
    }).toEqual({
      value: comparable(legacy.value),
      unresolved: legacy.unresolvedReference,
    });
  });

  it.each(CASES)('%s で投げる例外の種類が同じ', expression => {
    // 仕様「CSP モードの式評価」の「**評価の結果は従来の方式と同じです。**」
    const outcome = (run: () => unknown): string => {
      try {
        return `value ${JSON.stringify(comparable(run()))}`;
      } catch (error) {
        return `throw ${(error as Error).constructor.name}`;
      }
    };
    const values = bindings();
    // 従来の方式の評価関数は構文の検証を通らない式も組み立てるため、検証で
    // 拒否する式（`Number.prototype` など）は組み立てられないものとして扱う。
    const setup = internals.containsDangerousPatterns(expression)
      ? {bindKeys: [], evaluator: null}
      : internals.prepareEvaluator(expression, values);
    const legacy =
      setup.evaluator === null
        ? 'compile error'
        : outcome(() =>
            setup.evaluator!.call(
              internals.BUILTIN_HOLDER,
              ...setup.bindKeys.map(key => values[key]),
            ),
          );
    let csp: string;
    try {
      const compiled = ExpressionInterpreter.compile(expression);
      csp = outcome(() => ExpressionInterpreter.run(compiled, bindings()));
    } catch {
      csp = 'compile error';
    }
    expect(csp).toBe(legacy);
  });
});
