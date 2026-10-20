/* @vitest-environment jsdom */
/**
 * @fileoverview 許可構文の検証の結果を、式ごとに控えること。
 *
 * 期待値は仕様「評価メカニズム」の「**1 の検証の結果は式の文字列だけで決まるため、
 * 式ごとに控えます。** 同じ式を評価するたびに字句へ分け直しません」から取っている。
 */
import {afterEach, describe, expect, it, vi} from 'vitest';
import Expression from '../src/expression';
import Log from '../src/log';

describe('許可構文の検証の結果', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * 式を評価する間に、式を字句へ分けた回数を数えます。
   *
   * @param expression 評価する式
   * @param bindedValues バインドされた値
   * @returns 字句へ分けた回数
   */
  function countTokenizations(
    expression: string,
    bindedValues: Record<string, unknown>,
  ): number {
    const tokenize = vi.spyOn(
      Expression as unknown as {tokenizeExpression: (e: string) => unknown},
      'tokenizeExpression',
    );
    Expression.evaluate(expression, bindedValues);
    const count = tokenize.mock.calls.length;
    tokenize.mockRestore();
    return count;
  }

  it('同じ式を評価し直すときは、字句へ分け直さない（回帰）', () => {
    const expression = 'row.price * row.quantity';
    Expression.evaluate(expression, {row: {price: 100, quantity: 2}});

    expect(
      countTokenizations(expression, {row: {price: 120, quantity: 3}}),
    ).toBe(0);
    expect(
      Expression.evaluate(expression, {row: {price: 120, quantity: 3}}),
    ).toBe(360);
  });

  it('許可しない構文の式は、控えた結果でも拒否する', () => {
    vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
    const expression = 'a; b';

    expect(Expression.evaluate(expression, {a: 1, b: 2})).toBeNull();
    expect(Expression.evaluate(expression, {a: 1, b: 2})).toBeNull();
  });
});
