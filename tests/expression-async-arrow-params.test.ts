/* @vitest-environment jsdom */
/**
 * @fileoverview 引数を丸括弧で囲んだ async のアロー関数を評価できること。
 *
 * 期待値の根拠は仕様「暗黙のオプショナルチェーン」の「変換はメンバーアクセスに
 * 限られます。アロー関数の引数リストやグループ化の丸括弧は呼び出しとみなしません」。
 * `async (x) => x` の `(x)` も引数リストなので、`async?.(x)` へ書き換えない。
 */
import {afterEach, describe, expect, it, vi} from 'vitest';
import Expression from '../src/expression';
import Log from '../src/log';

describe('引数を丸括弧で囲んだ async のアロー関数', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('アロー関数として評価できる（回帰）', () => {
    // 仕様「暗黙のオプショナルチェーン」の「アロー関数の引数リストやグループ化の丸括弧は呼び出しとみなしません」
    vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    expect(typeof Expression.evaluate('async (x) => x')).toBe('function');
  });

  it('呼び出すと引数の値で解決する Promise を返す（回帰）', async () => {
    // 仕様「暗黙のオプショナルチェーン」の「アロー関数の引数リストやグループ化の丸括弧は呼び出しとみなしません」
    vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    const value = Expression.evaluate('(async (x, y) => x + y)(1, 2)');
    expect(value).toBeInstanceOf(Promise);
    await expect(value).resolves.toBe(3);
  });

  it('メソッドの引数に渡せる（回帰）', async () => {
    // 仕様「暗黙のオプショナルチェーン」の「アロー関数の引数リストやグループ化の丸括弧は呼び出しとみなしません」
    vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    const value = Expression.evaluate(
      'Promise.all(items.map(async (item, i) => item.v + i))',
      {items: [{v: 1}, {v: 2}]},
    );
    await expect(value).resolves.toEqual([1, 3]);
  });

  it('前に呼び出しがある式の中でも評価できる（回帰）', () => {
    // 仕様「暗黙のオプショナルチェーン」の「アロー関数の引数リストやグループ化の丸括弧は呼び出しとみなしません」
    vi.spyOn(Log, 'error').mockImplementation(() => undefined);
    const value = Expression.evaluate('[f(1), async (x) => x][1]', {
      f: (n: number) => n,
    });
    expect(typeof value).toBe('function');
  });

  it('async という名前の関数の呼び出しは、従来どおり暗黙のオプショナルチェーンになる', () => {
    // 仕様「暗黙のオプショナルチェーン」の「解決できる場合の結果は従来と同じです」
    expect(Expression.evaluate('async(2)', {async: (n: number) => n * 2})).toBe(
      4,
    );
    expect(Expression.evaluate('obj.async(2)', {obj: {}})).toBeUndefined();
  });
});
