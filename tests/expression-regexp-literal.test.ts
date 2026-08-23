/**
 * @fileoverview 式の中の正規表現リテラルのテスト
 *
 * 期待値の根拠は仕様「正規表現リテラル」です。
 */

import {beforeEach, describe, expect, it} from 'vitest';

import Dev from '../src/dev';
import Expression from '../src/expression';

describe('式の中の正規表現リテラル', () => {
  beforeEach(() => {
    // 拒否された式は warn で報告されるため、開発モードで観測できる状態にする。
    Dev.enable();
  });

  describe('リテラルとして評価する', () => {
    // 仕様「正規表現リテラル」の「式の中に正規表現リテラル（`/…/フラグ`）を
    // 書けます」
    it('装飾記法の全置換を 1 個の宣言で書ける', () => {
      expect(
        Expression.evaluate(
          String.raw`'[b]x[/b]'.replace(/\[\/?(?:b|red)\]/g, '')`,
        ),
      ).toBe('x');
    });

    it('正規表現リテラルを基点にした判定を書ける', () => {
      expect(Expression.evaluate(String.raw`/^\d+$/.test('123')`)).toBe(true);
      expect(Expression.evaluate(String.raw`/^\d+$/.test('12a')`)).toBe(false);
    });

    it('区切りの正規表現で分割できる', () => {
      expect(
        Expression.evaluate(String.raw`'a , b'.split(/\s*,\s*/).join('・')`),
      ).toBe('a・b');
    });

    it('選択・任意の 1 文字・行頭の指定を書ける', () => {
      expect(Expression.evaluate(String.raw`'abc'.replace(/b|c/g, 'X')`)).toBe(
        'aXX',
      );
      expect(Expression.evaluate(String.raw`'abc'.replace(/./g, 'X')`)).toBe(
        'XXX',
      );
      expect(Expression.evaluate(String.raw`'abc'.replace(/^a/, 'X')`)).toBe(
        'Xbc',
      );
    });

    // 仕様「正規表現リテラル」の「文字クラスの中の `/` は終端になりません」
    it('文字クラスの中の / は終端にならない', () => {
      expect(Expression.evaluate(String.raw`'a/b'.replace(/[/]/g, '-')`)).toBe(
        'a-b',
      );
    });

    // 仕様「正規表現リテラル」の「本体の `\` エスケープと `[…]` 文字クラスを
    // 追跡して終端の `/` を判定します」
    it('エスケープした / は終端にならない', () => {
      expect(Expression.evaluate(String.raw`'a/b'.replace(/a\/b/, 'X')`)).toBe(
        'X',
      );
    });

    it('エスケープした [ は文字クラスの開始にならない', () => {
      expect(Expression.evaluate(String.raw`'a[b'.replace(/\[/, 'X')`)).toBe(
        'aXb',
      );
    });

    // 仕様「正規表現リテラル」の「終端の `/` に続く英字はフラグとして読みます」
    it('フラグを読む', () => {
      expect(Expression.evaluate(String.raw`'aAb'.replace(/a/gi, 'X')`)).toBe(
        'XXb',
      );
    });

    it('1 つの式に複数の正規表現リテラルを書ける', () => {
      expect(
        Expression.evaluate(
          String.raw`'ab'.replace(/a/, 'X').replace(/b/, 'Y')`,
        ),
      ).toBe('XY');
    });
  });

  describe('中身を解釈しない', () => {
    // 仕様「正規表現リテラル」の「1 個のリテラルとして扱い、中身は解釈しません」
    it('使用できないキーワードと同じ綴りを含んでも評価できる', () => {
      expect(Expression.evaluate(String.raw`'new'.replace(/new/, 'X')`)).toBe(
        'X',
      );
      expect(Expression.evaluate(String.raw`'eval'.replace(/eval/, 'X')`)).toBe(
        'X',
      );
    });
  });

  describe('識別子の抽出の対象外', () => {
    // 仕様「正規表現リテラル」の「リテラルの中身は識別子の抽出の対象外です」
    it('本体の識別子を参照名として報告しない', () => {
      expect(
        Expression.getFreeIdentifiers(
          String.raw`text.replace(/x|y/g, other)`,
        ),
      ).toEqual(['text', 'other']);
    });

    it('フラグを参照名として報告しない', () => {
      expect(
        Expression.getFreeIdentifiers(String.raw`text.replace(/a/gi, '')`),
      ).toEqual(['text']);
    });
  });

  describe('式の書き換えの対象外', () => {
    // 仕様「正規表現リテラル」の「リテラルの中身は暗黙のオプショナルチェーンと
    // 計算プロパティ名の検査の対象外です」
    it('文字クラスをメンバーアクセスとして書き換えない', () => {
      // 書き換えると `/a?.[…]/` になり、`x1` に一致してしまう。
      expect(Expression.evaluate(String.raw`'x1'.replace(/a[0-9]/g, 'X')`)).toBe(
        'x1',
      );
    });

    it('連続する捕獲群を呼び出しとして書き換えない', () => {
      // 書き換えると `/(a)?.(a)/` になり、入れ替えの結果が変わる。
      expect(
        Expression.evaluate(String.raw`'aab'.replace(/(a)(a)/, '$2$1')`),
      ).toBe('aab');
    });
  });

  describe('除算との区別', () => {
    // 仕様「正規表現リテラル」の「直前のトークンが識別子・数値・文字列・正規表現
    // リテラル・`)`・`]`・`}` のいずれかであれば除算演算子です」
    it('値の直後の / は除算として扱う', () => {
      expect(Expression.evaluate('10 / 2')).toBe(5);
      expect(Expression.evaluate('2 / 1 / 2')).toBe(1);
      expect(Expression.evaluate('(a + b) / 2', {a: 3, b: 7})).toBe(5);
      expect(Expression.evaluate('list[0] / 2', {list: [8]})).toBe(4);
      expect(Expression.evaluate('count / 2', {count: 9})).toBe(4.5);
    });

    // 仕様「正規表現リテラル」の「後置の `++` / `--` のいずれかであれば除算演算子」
    it('後置の増減演算子の直後の / も除算として扱う', () => {
      expect(Expression.evaluate('count++ / 2', {count: 8})).toBe(4);
      expect(Expression.evaluate('count-- / 2', {count: 8})).toBe(4);
    });

    it('オブジェクトリテラルの直後の / も除算として扱う', () => {
      // 除算とみなさないと `/ 2` を正規表現リテラルの開始として読み進め、終端が
      // 無いため式全体が評価できなくなる。
      expect(Expression.evaluate('{a: 4} / 2')).toBeNaN();
    });

    it('同じ式の中で除算と正規表現リテラルが共存できる', () => {
      expect(
        Expression.evaluate(String.raw`(4 / 2) + 'abc'.replace(/b/, 'X')`),
      ).toBe('2aXc');
    });
  });

  describe('評価できない形', () => {
    // 仕様「正規表現リテラル」の「終端の `/` が見つからない」
    it('終端の / が無い式は評価しない', () => {
      expect(Expression.evaluate(String.raw`'abc'.replace(/abc, '')`)).toBe(
        null,
      );
    });

    // 仕様「正規表現リテラル」の「本体に改行を含む」
    it('本体に改行を含む式は評価しない', () => {
      expect(Expression.evaluate("'abc'.replace(/a\nb/, '')")).toBe(null);
    });

    // 仕様「正規表現リテラル」の「`//` と `/*`（コメントは式の構文に含めません）」
    it('コメントは従来どおり評価しない', () => {
      expect(Expression.evaluate("'abc' // comment")).toBe(null);
      expect(Expression.evaluate("'abc' /* comment */")).toBe(null);
    });
  });

  describe('禁止プロパティ名の検査', () => {
    // 仕様「正規表現リテラル」の「リテラルを基点にしたメンバーアクセスも、他の
    // リテラルと同じく禁止プロパティ名の検査を受けます」
    it('正規表現リテラルを基点にした constructor を遮断する', () => {
      expect(Expression.evaluate(String.raw`/a/["constructor"]`)).toBe(null);
      expect(Expression.evaluate(String.raw`/a/.constructor`)).toBe(null);
    });

    it('禁止されていないプロパティは読める', () => {
      expect(Expression.evaluate(String.raw`/a/["source"]`)).toBe('a');
      expect(Expression.evaluate(String.raw`/ab/.source`)).toBe('ab');
    });
  });
});
