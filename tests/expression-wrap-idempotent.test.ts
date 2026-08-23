/* @vitest-environment jsdom */
/**
 * @fileoverview バインド値のラップが冪等であることのテスト。
 *
 * 期待値の根拠は仕様「評価メカニズム」。
 */
import {beforeEach, describe, expect, it} from 'vitest';

import Dev from '../src/dev';
import Expression from '../src/expression';

describe('バインド値のラップ', () => {
  beforeEach(() => {
    Dev.disable();
  });

  // 仕様「評価メカニズム」の「すでにこの仕組みでラップした値をもう一度ラップの
  // 対象にしたときは、**同じ Proxy をそのまま返します**」
  it('ラップ済みの値を再ラップしない', () => {
    const raw = {a: 1, nested: {b: 2}};
    const once = Expression.evaluate('x', {x: raw});
    expect(once).not.toBe(raw);

    // 1 度ラップした値をバインド値として渡しても、層は増えない。
    const twice = Expression.evaluate('x', {x: once});
    expect(twice).toBe(once);

    // 何度渡しても同じ。
    const thrice = Expression.evaluate('x', {x: twice});
    expect(thrice).toBe(once);
  });

  it('入れ子から取り出した値も再ラップしない', () => {
    const raw = {nested: {b: 2}};
    // 入れ子はプロパティアクセスの時点でラップされる。
    const nestedOnce = Expression.evaluate('x.nested', {x: raw});
    expect(nestedOnce).not.toBe(raw.nested);
    // それをバインド値として渡し直しても層は増えない。
    const again = Expression.evaluate('x', {x: nestedOnce});
    expect(again).toBe(nestedOnce);
    expect(Expression.evaluate('x.b', {x: nestedOnce})).toBe(2);
  });

  it('配列も再ラップしない', () => {
    const raw = [{id: 1}, {id: 2}];
    const once = Expression.evaluate('x', {x: raw});
    const twice = Expression.evaluate('x', {x: once});
    expect(twice).toBe(once);
  });

  // 遮断の内容は層の数によらない（再ラップしなくても遮断は効く）。
  it('ラップ済みの値でも禁止プロパティは遮断する', () => {
    const raw = {a: 1};
    const once = Expression.evaluate('x', {x: raw});
    expect(Expression.evaluate('x.constructor', {x: once})).toBe(null);
    expect(Expression.evaluate('x["constructor"]', {x: once})).toBe(null);
    expect(Expression.evaluate('x.a', {x: once})).toBe(1);
  });
});
