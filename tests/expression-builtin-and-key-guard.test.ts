/**
 * @fileoverview 標準組み込みの書き換えと、文字列以外で書いた計算プロパティ名の遮断のテスト
 *
 * 期待値の根拠は仕様「バインドに無い識別子の扱い」の「標準組み込みは書き換えられません」と、
 * 仕様「評価メカニズム」の「7 は名前の書き方に依存しません」です。
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import Expression from '../src/expression';

/** 書き換えを試す標準組み込み */
const BUILTIN_NAMES = ['Math', 'JSON', 'parseInt'] as const;

describe('標準組み込みの書き換え', () => {
  const saved = new Map<string, unknown>();
  const globals = globalThis as unknown as Record<string, unknown>;

  beforeEach(() => {
    BUILTIN_NAMES.forEach(name => saved.set(name, globals[name]));
  });

  afterEach(() => {
    // 修正前のコードでは書き換わるため、後続のテストへ影響しないよう戻す。
    saved.forEach((value, name) => {
      globals[name] = value;
    });
  });

  // 仕様「バインドに無い識別子の扱い」の「`Math++` のように標準組み込みへ増減演算子（`++` / `--`）を書いた式は
  // `TypeError` になり、評価できません（結果は `null` で、`error` ログを出力します）。ページの `Math` などはそのまま残ります」
  it.each(['Math++', '++JSON', '(Math)++', 'parseInt--'])(
    '%s はページの値を書き換えない',
    expression => {
      expect(Expression.evaluate(expression)).toBeNull();
      BUILTIN_NAMES.forEach(name => {
        expect(globals[name]).toBe(saved.get(name));
      });
    },
  );

  // 仕様「バインドに無い識別子の扱い」の「バインドのキーに同じ名前がある場合は、その値を書き換えます」
  it('バインドのキーに同じ名前があれば、その値を書き換える', () => {
    const bindings = {Math: 1};
    expect(Expression.evaluate('Math++ + Math', bindings)).toBe(3);
    // 仕様「バインドに無い識別子の扱い」の「書き換えはその評価の中だけで、バインドデータは書き換えません」
    expect(bindings.Math).toBe(1);
    expect(globals.Math).toBe(saved.get('Math'));
  });

  // 仕様「バインドに無い識別子の扱い」の「**式から参照できる標準組み込み**は遮蔽の対象外です。以下は従来どおり利用できます」
  it('標準組み込みは従来どおり使える', () => {
    expect(Expression.evaluate('Math.max(1, 2) + count++', {count: 1})).toBe(3);
    expect(Expression.evaluate('JSON.stringify([n])', {n: 1})).toBe('[1]');
  });

  // 仕様「判定する式と値を求める式」の「バインドに無いキーを `undefined` とみなして評価し直した結果が**真偽値になる場合だけ**、
  // その値を採用します」
  it('判定する式として評価し直す場合も標準組み込みを使える', () => {
    expect(
      Expression.evaluate('missing === Math.max(count++, 1)', {count: 0}),
    ).toBe(false);
  });
});

describe('文字列以外で書いた計算プロパティ名の遮断', () => {
  // 仕様「評価メカニズム」の「名前はプロパティのキーへ変換してから検査するため、文字列以外の値で書いた名前
  // （`obj[["constructor"]]` のような配列など）も遮断します」
  it.each([
    ['""[["constructor"]]', {}],
    ['s[[k]]', {s: 'x', k: 'constructor'}],
    ['n[[k]]', {n: 1, k: 'constructor'}],
    ['s[o]', {s: 'x', o: {toString: () => 'constructor'}}],
  ])('%s は undefined になる', (expression, bindings) => {
    expect(Expression.evaluate(expression, bindings)).toBeUndefined();
  });

  it('String をバインドで差し替えても遮断する', () => {
    expect(
      Expression.evaluate('s[[k]]', {
        s: 'x',
        k: 'constructor',
        // 差し替えた変換は禁止名でない名前を返す。変換に使うと `s.length` になる。
        String: () => 'length',
      }),
    ).toBeUndefined();
  });

  // 仕様「評価メカニズム」の「7. 計算プロパティ名（`obj[式]`）は評価時にプロパティ名を検査し、
  // `constructor` / `__proto__` / `prototype` のときは名前を `undefined` へ差し替え」（それ以外の名前はそのまま）
  it('禁止名でないキーはそのまま参照できる', () => {
    expect(Expression.evaluate('items[1]', {items: ['a', 'b']})).toBe('b');
    expect(Expression.evaluate('items[[0]]', {items: ['a', 'b']})).toBe('a');
    expect(
      Expression.evaluate('items[Symbol.iterator] !== undefined', {items: []}),
    ).toBe(true);
  });
});
