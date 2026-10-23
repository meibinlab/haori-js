/* @vitest-environment jsdom */
/**
 * @fileoverview 評価関数の引数・ラップ・prototype 系アクセスの遮断を、式に応じて
 * 絞ることのテスト。
 *
 * 期待値の根拠は仕様「評価メカニズム」の「**評価関数の引数と 5 のラップは、式が
 * 参照する名前に限ります。**」と「**6 の遮断は、呼び出し（`?.()` を含む）か
 * スプレッドを含む式に限ります。**」。
 */
import {afterEach, describe, expect, it, vi} from 'vitest';
import Expression from '../src/expression';

/** 評価中に式の外のコードが読んだ `constructor` */
let observed: unknown;

/**
 * 式の外のコードとして `constructor` を読み、記録します。
 *
 * @returns 常に 1
 */
function readConstructor(): number {
  observed = ({} as {constructor: unknown}).constructor;
  return 1;
}

describe('式が参照する名前に限った引数とラップ', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('参照しない名前の値はラップしない', () => {
    // 仕様「評価メカニズム」の「たとえば `{{n.label}}` の評価関数が受け取るのは `n` だけです」
    const wrap = vi.spyOn(
      Expression as unknown as {wrapBoundValue: (value: unknown) => unknown},
      'wrapBoundValue',
    );
    const scope = {n: {label: 'a'}, list: [{id: 1}], other: {x: 1}};

    expect(Expression.evaluate('n.label', scope)).toBe('a');
    const wrapped = wrap.mock.calls.map(args => args[0]);
    expect(wrapped).toContain(scope.n);
    expect(wrapped).not.toContain(scope.list);
    expect(wrapped).not.toContain(scope.other);
  });

  it('同じ名前を何度参照しても評価できる', () => {
    // 仕様「評価メカニズム」の「**評価関数の引数と 5 のラップは、式が参照する名前に限ります。**」
    expect(Expression.evaluate('a + a * a', {a: 2})).toBe(6);
  });
});

describe('呼び出しかスプレッドを含む式に限った prototype 系アクセスの遮断', () => {
  afterEach(() => {
    observed = 'not-read';
  });

  it('呼び出しもスプレッドも無い式の評価中は、本来の値が返る', () => {
    // 仕様「評価メカニズム」の「そうした式の評価中に、バインド値のゲッターなど式の外のコードが `constructor` を読んだ場合は、本来の値が返ります」
    const r = {
      get id() {
        return readConstructor();
      },
    };

    expect(Expression.evaluate('r.id', {r})).toBe(1);
    expect(observed).toBe(Object);
  });

  it.each([
    ['メソッドの呼び出し', 'r.f()'],
    ['括弧で囲んだ関数の呼び出し', '(r.f)()'],
    ['ブラケット記法で取り出した関数の呼び出し', "r['f']()"],
    ['オプショナルな呼び出し', 'r.f?.()'],
  ])('%s を含む式の評価中は遮断する', (_label, expression) => {
    // 仕様「評価メカニズム」の「6 が守るのは、式の外のコードが評価中に `constructor` などを読む経路で、これは `map` などの標準組み込みのメソッドを呼んだときに起きます」
    expect(Expression.evaluate(expression, {r: {f: readConstructor}})).toBe(1);
    expect(observed).toBeUndefined();
  });

  it('リテラルと同じ名前のバインドキーに渡した関数の呼び出しも遮断する', () => {
    // 仕様「評価メカニズム」の「**6 の遮断は、呼び出し（`?.()` を含む）かスプレッドを含む式に限ります。**」
    expect(
      Expression.evaluate('undefined()', {undefined: readConstructor}),
    ).toBe(1);
    expect(observed).toBeUndefined();
  });

  it('スプレッドを含む式の評価中は遮断する', () => {
    // 仕様「評価メカニズム」の「**6 の遮断は、呼び出し（`?.()` を含む）かスプレッドを含む式に限ります。**」
    const r = {
      get list() {
        readConstructor();
        return [1, 2];
      },
    };

    expect(Expression.evaluate('[...r.list]', {r})).toEqual([1, 2]);
    expect(observed).toBeUndefined();
  });
});
