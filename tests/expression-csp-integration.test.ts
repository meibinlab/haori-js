/* @vitest-environment jsdom */
/**
 * @fileoverview CSP モードの評価器を式の評価に組み込んだ部分のテスト
 *
 * 期待値の根拠は仕様「CSP モードの式評価」の「そのため、ログと診断も従来の方式と
 * 同じです」です。評価関数を作る部分の前後は両方の方式で共通のため、ここでは
 * 方式ごとに分けた部分（評価器が受け付けない式の扱いと、バインドに無い名前の
 * 報告）を確かめます。従来の方式と比べるため、CSP モードの設定
 * （`vitest.csp.config.ts`）では流しません。
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import Env from '../src/env';
import Expression from '../src/expression';
import Log from '../src/log';
import {cspEvaluateDetailed} from './helpers/csp-evaluate';

describe('評価器が受け付けない式', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** CSP モードでは構文エラーになる式（ブロックを本体にしたアロー関数） */
  const BLOCK_BODY = 'items.forEach(x => { f(x) })';

  it('error ログを出し、値は null になる', () => {
    // 仕様「CSP モードの式評価」の「評価器が受け付けない式は、従来の方式でコンパイルに失敗した式と同じく `error` ログを出し、値は `null` になります」
    const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    const detail = cspEvaluateDetailed(BLOCK_BODY, {items: [], f: () => 1});
    expect(detail).toEqual({value: null, unresolvedReference: false});
    expect(error).toHaveBeenCalled();
  });

  it('コンパイルに失敗した式として記録する', () => {
    // 仕様「CSP モードの式評価」の「評価器が受け付けない式は、従来の方式でコンパイルに失敗した式と同じく `error` ログを出し、値は `null` になります」
    vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    cspEvaluateDetailed(BLOCK_BODY, {items: [], f: () => 1});
    expect(Expression.hasCompileFailure(BLOCK_BODY)).toBe(true);
  });
});

describe('バインドキーを引数名にできるかの判定', () => {
  /** `Expression` の非公開の判定 */
  const internals = Expression as unknown as {
    isUsableBindingKey(key: string): boolean;
    usableBindingKeyCache: Map<string, boolean>;
  };

  /**
   * 判定を求めます（キー単位の控えは使わない）。
   *
   * @param key キー
   * @param csp CSP モードで判定するか
   * @returns 引数名にできる場合は true
   */
  function judge(key: string, csp: boolean): boolean {
    const previous = Env.csp;
    Env.setCsp(csp);
    internals.usableBindingKeyCache.clear();
    try {
      return internals.isUsableBindingKey(key);
    } finally {
      Env.setCsp(previous);
      internals.usableBindingKeyCache.clear();
    }
  }

  // ECMAScript の予約語・strict モードだけの予約語・`eval` / `arguments` と、
  // 予約語に似た識別子。
  it.each([
    'await',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'enum',
    'export',
    'extends',
    'false',
    'finally',
    'for',
    'function',
    'if',
    'import',
    'in',
    'instanceof',
    'new',
    'null',
    'return',
    'super',
    'switch',
    'this',
    'throw',
    'true',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'with',
    'yield',
    'let',
    'static',
    'implements',
    'interface',
    'package',
    'private',
    'protected',
    'public',
    'eval',
    'arguments',
    'async',
    'of',
    'get',
    'set',
    'undefined',
    'NaN',
    'Infinity',
    'plainKey',
  ])('%s の判定が従来の方式と同じ', key => {
    // 仕様「バインドキーと識別子（`name` の命名）」の「判定の結果は従来の方式と同じです」
    expect(judge(key, true)).toBe(judge(key, false));
  });
});

describe('バインドに無い名前の報告', () => {
  beforeEach(() => {
    Env.setStrictBind(true);
  });

  afterEach(() => {
    Env.setStrictBind(false);
    vi.restoreAllMocks();
  });

  /**
   * 式を評価し、厳格バインドモードで出た error ログを返します。
   *
   * @param evaluate 評価する関数
   * @returns error ログの引数の一覧
   */
  function errorsOf(evaluate: () => unknown): unknown[][] {
    const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    evaluate();
    const calls = error.mock.calls.map(call => [...call]);
    error.mockRestore();
    return calls;
  }

  it.each([['missingA + missingB'], ['[missingA, missingB]']])(
    '%s で報告する名前が従来の方式と同じ（回帰）',
    expression => {
      // 仕様「CSP モードの式評価」の「そのため、ログと診断も従来の方式と同じです」
      const legacy = errorsOf(() => Expression.evaluateDetailed(expression));
      const csp = errorsOf(() => cspEvaluateDetailed(expression));
      expect(legacy).toHaveLength(1);
      expect(csp).toEqual(legacy);
    },
  );
});
