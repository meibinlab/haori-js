/* @vitest-environment jsdom */
/**
 * @fileoverview CSP モードの評価器で、これまで試していなかった書き方を従来の方式と
 * 比べるテスト
 *
 * 期待値の根拠は仕様「CSP モードの式評価」の「**評価の結果は従来の方式と同じです。**」
 * です。評価器のテストの網羅率を測り、通っていなかった分岐（文字列のエスケープ、
 * 引数の分割代入の誤り、アロー関数の引数への増減演算子など）に当たる式を集めています。
 * 構文として受け付けない式は、どちらの方式でも `null` になることを確かめます。
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import Expression from '../src/expression';
import ExpressionInterpreter from '../src/expression_interpreter';
import Log from '../src/log';
import {comparable} from './helpers/comparable';
import {cspEvaluateDetailed} from './helpers/csp-evaluate';

/** 試す式 */
const CASES: readonly string[] = [
  // 文字列のエスケープ
  "'a\\nb'",
  "'a\\tb'",
  "'a\\rb'",
  "'a\\bb'",
  "'a\\fb'",
  "'a\\vb'",
  "'a\\0b'",
  "'a\\01'",
  "'\\x41'",
  "'\\x4'",
  "'\\xZZ'",
  "'\\u0041'",
  "'\\u004'",
  "'\\u{41}'",
  "'\\u{1F600}'",
  "'\\u{110000}'",
  "'\\u{}'",
  "'\\u{41'",
  "'a\\\r\nb'",
  "'a\\\nb'",
  "'\\q'",
  "'\\''",
  '"\\""',
  "'a\\",
  // async のアロー関数（括弧の無い引数）
  'async x => x',
  '(async x => x)(1)',
  'async',
  // 引数の分割代入の誤り
  '(({...[a]}) => a)({})',
  "(({'a'}) => 1)({})",
  '(({a: [b]}) => b)({a: [1]})',
  '(({...r}) => r)({a: 1})',
  '(([a, ...r]) => r)([1, 2, 3])',
  // 数字や記号で書いたプロパティ名
  'obj.1',
  'obj.#x',
  'obj.',
  // アロー関数の引数への増減演算子
  '(x => ++x)(1)',
  '(x => x++)(1)',
  '(x => --x)(1)',
  '(x => [x++, x])(1)',
  '(x => (y => ++x)(0) + x)(1)',
  // ミューテーションテストで見つけた、確かめていなかった書き方
  // 数値の指数
  '1e+5',
  '1e-3',
  '1E2',
  // 0 で始まらない数値の後の x / o / b（`0x` などの接頭辞ではない）
  '1b1',
  '2x1',
  '3o7',
  // 16 進・Unicode のエスケープの誤り
  "'\\xg4'",
  "'\\u00g1'",
  "'\\u{41g}'",
  "'\\u{ 41}'",
  "'\\u{10FFFF}'.length",
  // 文字列の中の改行（エスケープしない CR）と、CR・U+2028・U+2029 による行の継続
  "'a\rb'",
  "'a\\\rb'",
  "'a\\ b'",
  "'a\\ b'",
  // 増減演算子を重ねる・カンマ演算子の左辺の評価
  '[a++, a++, a]',
  '[a++, b++, a]',
  '(a++, a)',
  // リテラルの呼び出し
  'null()',
  // async ではない名前の後のアロー関数・引数にできない名前
  'f (x) => x',
  'f x => x',
  'async null => 1',
  '(null => 1)',
  '(false => 1)',
  '((x, null) => 1)',
  // 引数の分割代入
  '(({...1}) => 1)({})',
  '(({...null}) => 1)({})',
  '(({null}) => 1)({})',
  '(({a}) => a)({a: 1})',
  // 引数名の重複
  '((x, x) => x)',
  '(({x}, x) => x)',
  '(({y: x}, x) => x)',
  '(({...x}, x) => x)',
  '(([x], x) => x)',
  '(([, x], x) => x)',
  '(([...x], x) => x)',
  '((x, ...x) => x)',
  '((x, ...[x]) => x)',
  '(({x}, {y}) => x + y)({x: 1}, {y: 2})',
  // オブジェクトリテラル
  '({+: 1}).undefined',
  '({...obj})',
  '({...obj})[1]',
  "({'a'})",
  '({1})',
  '({true})',
  '({false})',
  '({null})',
  '({a: 1 b: 2})',
  // オプショナルな呼び出し
  'f?.(2)',
  'undefined?.(1)',
];

/** 名前を指定したバインド値で試す式 */
const CASES_WITH_BINDINGS: readonly (readonly [
  string,
  Record<string, unknown>,
])[] = [
  // 遮断した名前は `'undefined'` というキーになる（仕様「評価メカニズム」の 7）
  ["o['constructor']", {o: {undefined: 'U', '': 'E'}}],
  ["o['__pro' + 'to__']", {o: {undefined: 'U', '': 'E'}}],
  // リテラルと同じ名前のバインドキーの呼び出しは、オプショナルにしない
  ['NaN()', {NaN: undefined}],
  ['Infinity()', {Infinity: null}],
  // 自身のプロパティでも、遮断して見えないもの（Proxy が記述子を返さない）は写さない
  ['({...o})', {o: {constructor: 1, a: 2}}],
];

describe('網羅率で見つけた書き方での、CSP モードの評価器と従来の方式の一致', () => {
  beforeEach(() => {
    vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(CASES)('%s', expression => {
    // 仕様「CSP モードの式評価」の「**評価の結果は従来の方式と同じです。**」
    const bindings = () => ({
      a: 1,
      b: 2,
      f: (x: unknown) => x,
      obj: {1: 'one'},
    });
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

  it.each(CASES_WITH_BINDINGS)('%s', (expression, bindings) => {
    // 仕様「CSP モードの式評価」の「**評価の結果は従来の方式と同じです。**」
    const legacy = Expression.evaluateDetailed(expression, {...bindings});
    const csp = cspEvaluateDetailed(expression, {...bindings});
    expect({
      value: comparable(csp.value),
      unresolved: csp.unresolvedReference,
    }).toEqual({
      value: comparable(legacy.value),
      unresolved: legacy.unresolvedReference,
    });
  });
});

describe('オブジェクトのスプレッドで写したプロパティ', () => {
  it('JavaScript のスプレッドと同じ記述子になる', () => {
    // 仕様「CSP モードの式評価」の「リテラル・スプレッド・分割代入の評価は JavaScript と同じです」
    const source = {a: 1, b: 'x'};
    const value = cspEvaluateDetailed('({...o, c: 3})', {o: source})
      .value as object;
    expect(Object.getOwnPropertyDescriptors(value)).toEqual(
      Object.getOwnPropertyDescriptors({...source, c: 3}),
    );
  });
});

describe('配列の分割代入で反復を進める回数', () => {
  /** 反復の操作を数える反復可能なオブジェクト */
  interface CountingIterable extends Iterable<number> {
    /** `next()` を呼んだ回数 */
    nexts: number;
    /** `return()` を呼んだ回数 */
    returns: number;
  }

  /**
   * 反復の操作を数える反復可能なオブジェクトを作ります。
   *
   * @param values 順に返す値
   * @returns 反復可能なオブジェクト
   */
  function counting(values: number[]): CountingIterable {
    const iterable: CountingIterable = {
      nexts: 0,
      returns: 0,
      [Symbol.iterator]() {
        let index = 0;
        return {
          next: () => {
            iterable.nexts += 1;
            return index < values.length
              ? {done: false, value: values[index++]}
              : {done: true, value: undefined};
          },
          return: () => {
            iterable.returns += 1;
            return {done: true, value: undefined};
          },
        };
      },
    };
    return iterable;
  }

  it.each([
    ['([p]) => p', (([p]: number[]) => p) as (it: Iterable<number>) => unknown],
    [
      '([p, q, r]) => [p, q, r]',
      (([p, q, r]: number[]) => [p, q, r]) as (it: Iterable<number>) => unknown,
    ],
    [
      '([p, q, r, s]) => [p, q, r, s]',
      (([p, q, r, s]: number[]) => [p, q, r, s]) as (
        it: Iterable<number>,
      ) => unknown,
    ],
    [
      '([p, ...r]) => r',
      (([, ...r]: number[]) => r) as (it: Iterable<number>) => unknown,
    ],
  ])('%s', (arrow, native) => {
    // 仕様「CSP モードの式評価」の「リテラル・スプレッド・分割代入の評価は JavaScript と同じです」
    const expected = counting([1, 2]);
    const expectedValue = native(expected);
    const actual = counting([1, 2]);
    const actualValue = cspEvaluateDetailed(`(${arrow})(it)`, {
      it: actual,
    }).value;
    expect(comparable(actualValue)).toEqual(comparable(expectedValue));
    expect({nexts: actual.nexts, returns: actual.returns}).toEqual({
      nexts: expected.nexts,
      returns: expected.returns,
    });
  });
});

describe('括弧で囲んだ引数の async のアロー関数', () => {
  // 従来の方式は、`async (` を呼び出しとみなして暗黙のオプショナルチェーン
  // （`async?.(`）へ書き換えるため、構文エラーになり `null` を返す（従来の方式の
  // 不具合として報告済み）。期待値は仕様から取る。

  it('アロー関数になる', () => {
    // 仕様「CSP モードの式評価」の「本体が式のアロー関数（`async` を含む）。引数は識別子・分割代入（オブジェクト・配列）・残余引数」
    expect(typeof cspEvaluateDetailed('async (x) => x', {}).value).toBe(
      'function',
    );
  });

  it('呼び出すと Promise を返し、引数の値で解決する', async () => {
    // 仕様「CSP モードの式評価」の「本体が式のアロー関数（`async` を含む）。引数は識別子・分割代入（オブジェクト・配列）・残余引数」
    const value = cspEvaluateDetailed(
      '(async (x, y) => x + y)(1, 2)',
      {},
    ).value;
    expect(value).toBeInstanceOf(Promise);
    await expect(value).resolves.toBe(3);
  });
});

describe('評価器が単独で構文エラーにする式', () => {
  // 入口では従来の方式の構文の検証が先に拒否するため、評価器の構文解析まで届かない
  // 式。評価器を単独で使っても同じく拒否することを確かめる。JavaScript でも構文
  // エラーになる式に限る。
  it.each([
    ["'a\\"],
    ["'\\0"],
    ['obj.1'],
    ['obj.#x'],
    ['/(/'],
    ['/a/gg'],
    ['(eval => 1)'],
    ['/a\\\n/'],
    ['(arguments => 1)'],
    ['(static => 1)'],
    ['async eval => 1'],
    ['async x\n=> x'],
    ['(({...eval}) => 1)'],
    ['(({eval}) => 1)'],
  ])('%s', expression => {
    // 仕様「CSP モードの式評価」の「従来の方式と同じく、次は書けません（構文エラーになります）」
    expect(() => new Function(`"use strict"; return (${expression});`)).toThrow(
      SyntaxError,
    );
    expect(() => ExpressionInterpreter.compile(expression)).toThrow(
      SyntaxError,
    );
  });
});
