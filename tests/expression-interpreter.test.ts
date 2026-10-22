/**
 * @fileoverview CSP モードの式の評価器のテスト
 *
 * 期待値の根拠は仕様「CSP モードの式評価」と、同節が参照する仕様「バインドに無い
 * 識別子の扱い」「暗黙のオプショナルチェーン」「正規表現リテラル」「評価メカニズム」
 * です。演算の結果は、同節の「演算子の意味（型の変換・比較・短絡評価）は
 * JavaScript と同じです」に従い、JavaScript の結果を期待値にしています。
 */

import {afterEach, describe, expect, it, vi} from 'vitest';

import ExpressionInterpreter from '../src/expression_interpreter';
import * as Parser from '../src/expression_parser';

/**
 * 式を評価します（バインドに無い識別子は `ReferenceError`）。
 *
 * @param expression 式
 * @param bindings バインド値
 * @returns 評価結果
 */
function run(
  expression: string,
  bindings: Record<string, unknown> = {},
): unknown {
  return ExpressionInterpreter.evaluate(expression, bindings);
}

/**
 * 式を評価します（バインドに無い識別子は `undefined`）。
 *
 * @param expression 式
 * @param bindings バインド値
 * @returns 評価結果
 */
function runLenient(
  expression: string,
  bindings: Record<string, unknown> = {},
): unknown {
  return ExpressionInterpreter.evaluate(expression, bindings, {
    missingIdentifier: 'undefined',
  });
}

describe('CSP モードの式の評価器', () => {
  // 仕様「CSP モードの式評価」の「書ける構文は次のとおりです」
  describe('リテラル', () => {
    it('数値の書き方を JavaScript と同じく読む', () => {
      expect(run('0x1F')).toBe(31);
      expect(run('0o17')).toBe(15);
      expect(run('0b101')).toBe(5);
      expect(run('1_000')).toBe(1000);
      expect(run('1.5e3')).toBe(1500);
      expect(run('2E-1')).toBe(0.2);
      expect(run('1.')).toBe(1);
      expect(run('10n * 2n')).toBe(20n);
      expect(run('0x10n')).toBe(16n);
    });

    it('文字列のエスケープを JavaScript と同じく解く', () => {
      expect(run(String.raw`'a\nb'`)).toBe('a\nb');
      expect(run(String.raw`"it\"s"`)).toBe('it"s');
      expect(run(String.raw`'\x41B\u{43}'`)).toBe('ABC');
      expect(run(String.raw`'\u{1F600}'`)).toBe('\u{1F600}');
      expect(run(String.raw`'\0'`)).toBe('\0');
      expect(run(String.raw`'\q'`)).toBe('q');
      expect(run("'a\\\nb'")).toBe('ab');
    });

    it('true / false / null を値として読む', () => {
      expect(run('true')).toBe(true);
      expect(run('false')).toBe(false);
      expect(run('null')).toBeNull();
    });

    it('配列の穴とスプレッドを読む', () => {
      const holes = run('[1, , 3]') as unknown[];
      expect(holes).toHaveLength(3);
      expect(1 in holes).toBe(false);
      expect(run('[...a, 3]', {a: [1, 2]})).toEqual([1, 2, 3]);
      expect(run('[...s]', {s: 'ab'})).toEqual(['a', 'b']);
      expect(run('[1, 2,]')).toEqual([1, 2]);
    });

    it('オブジェクトのキー・省略形・スプレッドを読む', () => {
      expect(run("({a: 1, 'b c': 2, 3: 4})")).toEqual({a: 1, 'b c': 2, 3: 4});
      expect(run('({a})', {a: 5})).toEqual({a: 5});
      expect(run('({...o, b: 2})', {o: {a: 1, b: 1}})).toEqual({a: 1, b: 2});
      expect(run('({...null, a: 1})')).toEqual({a: 1});
      expect(run('{a: 1}')).toEqual({a: 1});
    });
  });

  // 仕様「CSP モードの式評価」の「書ける構文は次のとおりです」
  describe('参照と呼び出し', () => {
    it('メンバーアクセスの 4 つの書き方を読む', () => {
      const a = {b: 1};
      expect(run('a.b', {a})).toBe(1);
      expect(run('a?.b', {a})).toBe(1);
      expect(run("a['b']", {a})).toBe(1);
      expect(run("a?.['b']", {a})).toBe(1);
    });

    it('スプレッドの引数で呼び出す', () => {
      expect(run('Math.max(...xs)', {xs: [1, 5, 3]})).toBe(5);
    });

    it('メンバーを呼び出すと基点を this にする', () => {
      const a = {
        v: 7,
        f(this: {v: number}) {
          return this.v;
        },
      };
      expect(run('a.f()', {a})).toBe(7);
      expect(run('(a.f)()', {a})).toBe(7);
    });

    it('識別子を呼び出すと this は undefined になる', () => {
      const {f} = {
        f(this: unknown) {
          return this;
        },
      };
      expect(run('f()', {f})).toBeUndefined();
      expect(run('(0, a.f)()', {a: {f}})).toBeUndefined();
    });
  });

  // 仕様「CSP モードの式評価」の「書ける構文は次のとおりです」
  describe('演算子', () => {
    it('単項演算子', () => {
      expect(run('!x', {x: 0})).toBe(true);
      expect(run('-x', {x: 2})).toBe(-2);
      expect(run("+'3'")).toBe(3);
      expect(run('- -x', {x: 2})).toBe(2);
    });

    it('算術・シフト演算子', () => {
      expect(run('2 ** 3 ** 2')).toBe(512);
      expect(run('(-2) ** 2')).toBe(4);
      expect(run('7 % 3')).toBe(1);
      expect(run('1 + 2 * 3')).toBe(7);
      expect(run("'1' + 1")).toBe('11');
      expect(run('1 << 3')).toBe(8);
      expect(run('-16 >> 2')).toBe(-4);
      expect(run('-1 >>> 28')).toBe(15);
    });

    it('比較演算子', () => {
      expect(run('1 < 2')).toBe(true);
      expect(run("'b' > 'a'")).toBe(true);
      expect(run('2 <= 2')).toBe(true);
      expect(run('1 >= 2')).toBe(false);
      expect(run("'1' == 1")).toBe(true);
      expect(run("'1' != 1")).toBe(false);
      expect(run("'1' === 1")).toBe(false);
      expect(run("'1' !== 1")).toBe(true);
      expect(run('null == undefined')).toBe(true);
    });

    it('論理演算子は短絡評価で値を返す', () => {
      expect(run('0 && missing')).toBe(0);
      expect(run("'a' || missing")).toBe('a');
      expect(run('null ?? 1')).toBe(1);
      expect(run('0 ?? 1')).toBe(0);
      expect(run('(a || b) ?? c', {a: 0, b: null, c: 3})).toBe(3);
    });

    it('三項演算子とカンマ演算子', () => {
      expect(run('x ? 1 : 2', {x: true})).toBe(1);
      expect(run('x ? 1 : 2', {x: false})).toBe(2);
      expect(run('(1, 2)')).toBe(2);
    });
  });

  // 仕様「CSP モードの式評価」の「`++` / `--` の対象は識別子だけです」
  describe('増減演算子', () => {
    it('その評価の中だけで値を書き換える', () => {
      const bindings = {count: 8};
      expect(run('count++ + count', bindings)).toBe(17);
      expect(run('++count', bindings)).toBe(9);
      expect(run('count--', bindings)).toBe(8);
      // 仕様「CSP モードの式評価」の「バインドデータは書き換えません」
      expect(bindings.count).toBe(8);
    });

    it('アロー関数の引数を書き換える', () => {
      expect(run('xs.map(x => ++x)', {xs: [1, 2]})).toEqual([2, 3]);
    });

    it('メンバーアクセスは対象にできない', () => {
      expect(() => run('a.b++', {a: {b: 1}})).toThrow(SyntaxError);
      expect(() => run('a[0]++', {a: [1]})).toThrow(SyntaxError);
      expect(() => run('++a.b', {a: {b: 1}})).toThrow(SyntaxError);
    });

    it('禁止識別子・定数・標準組み込みは書き換えられない', () => {
      expect(() => run('window++')).toThrow(TypeError);
      expect(() => run('undefined++')).toThrow(TypeError);
      expect(() => run('Math++')).toThrow(TypeError);
      // 仕様「評価メカニズム」の「トップレベルキーが再バインド不可の予約名と衝突する場合は**該当キーのみ無視**」
      expect(() => run('window++', {window: 1})).toThrow(TypeError);
      expect(typeof Math.max).toBe('function');
    });
  });

  // 仕様「CSP モードの式評価」の「書ける構文は次のとおりです」の「本体が式のアロー関数」
  describe('アロー関数', () => {
    it('組み込みのメソッドから呼ばれる', () => {
      expect(run('items.map(i => i * 2)', {items: [1, 2]})).toEqual([2, 4]);
      expect(run('xs.sort((a, b) => b - a)', {xs: [1, 3, 2]})).toEqual([
        3, 2, 1,
      ]);
    });

    it('分割代入と残余引数を受け取る', () => {
      expect(run('(({a, b: c}) => a + c)({a: 1, b: 2})')).toBe(3);
      expect(run('(({a, ...r}) => r)({a: 1, b: 2, c: 3})')).toEqual({
        b: 2,
        c: 3,
      });
      expect(run('(([a, , c]) => a + c)([1, 2, 3])')).toBe(4);
      expect(run('(([a, ...r]) => r)([1, 2, 3])')).toEqual([2, 3]);
      expect(run('((...xs) => xs.length)(1, 2, 3)')).toBe(3);
      expect(
        run('(list ?? []).map(({row}) => row)', {list: [{row: 1}]}),
      ).toEqual([1]);
    });

    it('引数の数を length にする', () => {
      expect(run('((a, b) => a).length')).toBe(2);
      expect(run('((a, ...r) => a).length')).toBe(1);
    });

    it('外側の引数を参照する', () => {
      expect(
        run('xs.map(x => ys.map(y => x + y))', {xs: [1, 2], ys: [10]}),
      ).toEqual([[11], [12]]);
    });

    it('async のアロー関数は Promise を返す', async () => {
      const result = run('(async x => x + 1)(1)');
      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBe(2);
    });

    it('引数名の重複は書けない', () => {
      expect(() => run('(a, a) => a')).toThrow(SyntaxError);
    });
  });

  // 仕様「CSP モードの式評価」の「従来の方式と同じく、次は書けません」
  describe('書けない構文', () => {
    it.each([
      '`x`',
      'a = 1',
      'a += 1',
      'a & 1',
      'a | 1',
      'a ^ 1',
      '~a',
      '1 /* c */ + 2',
      '1 // c',
      'typeof a',
      'a in b',
      'new Date()',
      'this',
      'a.default',
      '(a = 1) => a',
      '({[k]: 1})',
      '.5',
      'a ?? b || c',
      'a || b ?? c',
      '-2 ** 2',
      '010',
      '08',
      String.raw`'\1'`,
      String.raw`'\8'`,
    ])('%s は構文エラー', expression => {
      expect(() => run(expression)).toThrow(SyntaxError);
    });
  });

  // 仕様「CSP モードと従来の方式の違い」の「次の書き方は、CSP モードでは評価できません」
  describe('文を本体にする関数', () => {
    it.each([
      'x => { x }',
      'x => {}',
      '({f() {}})',
      '({get a() {}})',
      '({set a(v) {}})',
      '({async f() {}})',
    ])('%s は構文エラー', expression => {
      expect(() => run(expression)).toThrow(SyntaxError);
    });
  });

  // 仕様「CSP モードと従来の方式の違い」の「次の 2 つは、CSP モードの方が厳しく遮断します」
  describe('CSP モードの方が厳しく遮断するもの', () => {
    it('文字列以外の値で組み立てた計算プロパティ名を遮断する', () => {
      expect(run(String.raw`""[["constructor"]]`)).toBeUndefined();
    });
  });

  // 仕様「暗黙のオプショナルチェーン」
  describe('暗黙のオプショナルチェーン', () => {
    it('途中の値が null / undefined でも undefined になる', () => {
      expect(run('a.b', {a: null})).toBeUndefined();
      expect(run('a[i]', {a: undefined, i: 0})).toBeUndefined();
      expect(run('a.b()', {a: {}})).toBeUndefined();
      expect(run('a.b.c.d', {a: {}})).toBeUndefined();
      expect(run('f()', {f: null})).toBeUndefined();
    });

    // 仕様「CSP モードの式評価」の「演算子の意味（型の変換・比較・短絡評価）は JavaScript と同じです」
    it('途中で止まった呼び出しの引数は評価しない', () => {
      expect(run('a.f(missing)', {a: null})).toBeUndefined();
    });

    // 仕様「暗黙のオプショナルチェーン」の「値が存在しても**呼び出せない**場合…は従来どおり `TypeError`」
    it('呼び出せない値は TypeError になる', () => {
      expect(() => run('a.b()', {a: {b: 1}})).toThrow(TypeError);
      expect(() => run('x(1)', {x: 3})).toThrow(TypeError);
    });
  });

  // 仕様「バインドに無い識別子の扱い」
  describe('識別子の解決', () => {
    afterEach(() => {
      delete (window as unknown as Record<string, unknown>).agencyCode;
    });

    it('バインドに無い識別子はグローバルへ解決しない', () => {
      // jsdom は id による window の名前付きアクセスを持たないため、同じ状態を
      // 直接作る（仕様「バインドに無い識別子の扱い」の「`id="agencyCode"` の要素が
      // あると、`{{agencyCode}}` がその要素オブジェクトへ解決される」）。
      (window as unknown as Record<string, unknown>).agencyCode =
        document.createElement('input');
      expect(runLenient('agencyCode')).toBeUndefined();
      expect(runLenient('name')).toBeUndefined();
      expect(runLenient('length')).toBeUndefined();
    });

    it('バインドに無い識別子は既定では ReferenceError になる', () => {
      expect(() => run('missing')).toThrow(
        new ReferenceError('missing is not defined'),
      );
    });

    // 仕様「バインドに無い識別子の扱い」の「`?.` / `??` / `||` / `&&` を含む式では、従来どおり `undefined` として評価を続けます」
    it('undefined として続ける指定では既定値が使える', () => {
      expect(runLenient("agencyCode ?? ''")).toBe('');
    });

    // 仕様「バインドに無い識別子の扱い」の「短絡評価や三項演算子で**参照されなかった**識別子は、未解決参照になりません」
    it('参照されなかった識別子は ReferenceError にならない', () => {
      expect(run('flag ? missing : 5', {flag: false})).toBe(5);
    });

    // 仕様「バインドに無い識別子の扱い」の「**式から参照できる標準組み込み**は遮蔽の対象外です」
    it('標準組み込みを参照できる', () => {
      expect(run('Math.max(1, 2)')).toBe(2);
      expect(run('JSON.stringify([1])')).toBe('[1]');
      expect(run("parseInt('12', 10)")).toBe(12);
      expect(run("encodeURIComponent('a b')")).toBe('a%20b');
      expect(run("Number('3')")).toBe(3);
      expect(run('undefined')).toBeUndefined();
      expect(run('Infinity')).toBe(Infinity);
    });

    // 仕様「バインドに無い識別子の扱い」の「`Object` / `Function` / `Reflect` / `window` / `document` などは
    // 従来どおり禁止識別子として `undefined` に遮断されます」
    it('禁止識別子は undefined になる', () => {
      expect(run('Object')).toBeUndefined();
      expect(run('Function')).toBeUndefined();
      expect(run('Reflect')).toBeUndefined();
      expect(run('window')).toBeUndefined();
      expect(run('document')).toBeUndefined();
    });

    // 仕様「評価メカニズム」の「トップレベルキーが再バインド不可の予約名と衝突する場合は**該当キーのみ無視**（引数から除外＋`undefined` 遮蔽）」
    it('再バインドできない禁止識別子はバインドしても undefined になる', () => {
      expect(run('window', {window: 1})).toBeUndefined();
      expect(run('Function', {Function: 1})).toBeUndefined();
    });

    // 仕様「バインドのトップレベルキーと予約名」の「これらは**トップレベルのバインドキーとして利用でき**、式中ではバインド値が同名のグローバルを遮蔽します」
    it('再バインドできる禁止識別子はバインドした値になる', () => {
      expect(run('document', {document: 1})).toBe(1);
      expect(run('history.length', {history: [1, 2]})).toBe(2);
    });

    it('バインドした値はアロー関数の引数より外側で解決する', () => {
      expect(run('xs.map(v => v)', {xs: [1], v: 9})).toEqual([1]);
    });
  });

  // 仕様「評価メカニズム」の「7. 計算プロパティ名（`obj[式]`）は評価時にプロパティ名を検査し」
  describe('計算プロパティ名の検査', () => {
    it.each(['constructor', '__proto__', 'prototype'])(
      '組み立てた %s は undefined になる',
      name => {
        expect(run('a[k]', {a: {}, k: name})).toBeUndefined();
        expect(run('f[k]', {f: () => 1, k: name})).toBeUndefined();
      },
    );

    it('式で組み立てた名前も遮断する', () => {
      expect(run('a["con" + "structor"]', {a: {}})).toBeUndefined();
      expect(run('a["con" + "structor"]()', {a: {}})).toBeUndefined();
    });

    // 仕様「正規表現リテラル」の「`/a/.constructor` と `/a/["constructor"]` は遮断されます」
    it('禁止プロパティ名を書いたメンバーアクセスは構文エラー', () => {
      expect(() => run('/a/.constructor')).toThrow(SyntaxError);
      expect(() => run('a.__proto__', {a: {}})).toThrow(SyntaxError);
      expect(() => run('({constructor: 1})')).toThrow(SyntaxError);
      expect(() => run("({'__proto__': 1})")).toThrow(SyntaxError);
    });
  });

  // 仕様「正規表現リテラル」
  describe('正規表現リテラル', () => {
    it('仕様の例を評価する', () => {
      expect(
        run(String.raw`text.replace(/\[\/?(?:b|red)\]/g, '')`, {
          text: '[b]x[/b]',
        }),
      ).toBe('x');
      expect(
        run(String.raw`/^\d+$/.test(code) ? 'OK' : 'NG'`, {code: '12'}),
      ).toBe('OK');
      expect(
        run(String.raw`text.split(/\s*,\s*/).join('・')`, {text: 'a , b'}),
      ).toBe('a・b');
    });

    it('文字クラスの中の / は終端にならない', () => {
      expect(run("/[/]/.test('/')")).toBe(true);
    });

    it('フラグを読む', () => {
      expect((run('/a/gi') as RegExp).flags).toBe('gi');
    });

    // 仕様「正規表現リテラル」の「`(a + b) / 2`・`items[0] / count`・`count++ / 2` は従来どおり除算になります」
    it('値の後の / は除算になる', () => {
      expect(run('(a + b) / 2', {a: 1, b: 3})).toBe(2);
      expect(run('items[0] / count', {items: [8], count: 2})).toBe(4);
      expect(run('count++ / 2', {count: 8})).toBe(4);
      expect(run('{a: 4} / 2')).toBeNaN();
    });

    // 仕様「正規表現リテラル」の「次の場合は式全体を評価できません」
    it('評価できない書き方は構文エラー', () => {
      expect(() => run("text.replace(/abc, '')", {text: ''})).toThrow(
        SyntaxError,
      );
      expect(() => run('/a\nb/')).toThrow(SyntaxError);
      expect(() => run('/a/g1')).toThrow(SyntaxError);
    });
  });

  describe('式ごとの控え', () => {
    // 仕様「評価メカニズム」の「**1 の検証の結果は式の文字列だけで決まるため、式ごとに控えます。**」
    it('同じ式は同じ変換結果を返す', () => {
      expect(ExpressionInterpreter.compile('a + 1')).toBe(
        ExpressionInterpreter.compile('a + 1'),
      );
    });

    it('構文エラーの式は何度評価しても構文エラーで、解析し直さない', () => {
      const spy = vi.spyOn(Parser, 'parseExpression');
      try {
        expect(() => run('b =')).toThrow(SyntaxError);
        expect(() => run('b =')).toThrow(SyntaxError);
        expect(spy).toHaveBeenCalledTimes(1);
      } finally {
        spy.mockRestore();
      }
    });
  });

  // 仕様「CSP モードの式評価」の「式は strict モードの規則で読みます」と「リテラル・スプレッド・分割代入の評価は JavaScript と同じです」
  describe('字句の細部', () => {
    it.each([
      '1__0',
      '1_',
      '0x1_',
      '0x_1',
      '1._5',
      '1_.5',
      '0_1',
      '1a',
      '1e',
      '1.5n',
      '1e3n',
      "'abc",
      "'a\nb'",
      String.raw`'\x4z'`,
      String.raw`'\u{110000}'`,
      String.raw`'\u12zz'`,
      String.raw`'\01'`,
      '/(/',
      '/a\\\nb/',
      'x //y/',
      'a\n++',
      'a\n=> 1',
      '(a)\n=> 1',
      'async\nx => x',
      '0x',
      '({interface})',
      '({true})',
      'true => 1',
      'interface',
      'enum',
    ])('%j は構文エラー', expression => {
      expect(() => run(expression, {x: 1, a: 1, async: 1})).toThrow(
        SyntaxError,
      );
    });

    it('行の継続（\\r\\n）を 1 つの改行として取り除く', () => {
      expect(run("'a\\\r\nb'")).toBe('ab');
    });

    it('正規表現の本体とフラグは評価の前に検証する', () => {
      expect(() => ExpressionInterpreter.compile('/(/')).toThrow(SyntaxError);
    });

    it('反復できない値はスプレッドできない', () => {
      expect(() => run('[...x]', {x: null})).toThrow(TypeError);
      expect(() => run('[...x]', {x: 1})).toThrow(TypeError);
    });

    it('末尾の穴も配列の長さに数える', () => {
      expect(run('[1, ,]')).toHaveLength(2);
    });

    it('正規表現リテラルは評価のたびに新しいオブジェクトになる', () => {
      expect(run('/a/g')).not.toBe(run('/a/g'));
    });

    it('async は識別子としても使える', () => {
      expect(run('async(1)', {async: (v: number) => v + 1})).toBe(2);
      expect(run('async => async', {})).toBeTypeOf('function');
    });
  });

  // 仕様「CSP モードの式評価」の「リテラル・スプレッド・分割代入の評価は JavaScript と同じです」
  describe('スプレッドと分割代入の細部', () => {
    it('スプレッドは自身の列挙可能なプロパティだけを写す', () => {
      const source = Object.defineProperty({a: 1}, 'hidden', {
        value: 2,
        enumerable: false,
      });
      expect(run('({...o})', {o: source})).toEqual({a: 1});
    });

    it('__proto__ というキーも通常のプロパティとして写す', () => {
      const source = JSON.parse('{"__proto__": 1}');
      const result = run('({...o})', {o: source}) as Record<string, unknown>;
      expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(
        true,
      );
    });

    it('配列の分割代入は途中で止めた反復子を閉じる', () => {
      const close = vi.fn(() => ({done: true, value: undefined}));
      const iterable = {
        [Symbol.iterator]: () => ({
          next: () => ({done: false, value: 1}),
          return: close,
        }),
      };
      expect(run('(([a]) => a)(it)', {it: iterable})).toBe(1);
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('null / undefined はオブジェクトの分割代入にできない', () => {
      expect(() => run('(({a}) => a)(null)')).toThrow(TypeError);
      expect(() => run('(({a}) => a)()')).toThrow(TypeError);
      expect(() => run('(({}) => 1)(null)')).toThrow(TypeError);
      expect(() => run('(({...r}) => r)()')).toThrow(TypeError);
    });
  });

  // 仕様「CSP モードの式評価」の「`++` / `--` の対象は識別子だけです」
  describe('増減演算子の細部', () => {
    it('BigInt を増減する', () => {
      expect(run('++n', {n: 1n})).toBe(2n);
    });

    it('後置は数値へ変換した元の値を返す', () => {
      expect(run('x++', {x: '5'})).toBe(5);
    });

    it('外側のアロー関数の引数を書き換える', () => {
      expect(
        run('xs.map(x => ys.map(() => ++x))', {xs: [1], ys: [0, 0]}),
      ).toEqual([[2, 3]]);
    });

    it('バインドに無い識別子は ReferenceError、undefined として続ける指定では NaN', () => {
      expect(() => run('missing++')).toThrow(ReferenceError);
      expect(runLenient('missing++')).toBeNaN();
    });
  });

  // 仕様「バインドに無い識別子の扱い」の「式の識別子は、バインディングデータのキーとして解決します」
  describe('バインド値の解決の細部', () => {
    it('バインドした値は定数より先に解決する', () => {
      expect(run('NaN', {NaN: 3})).toBe(3);
    });

    it('継承したプロパティはバインドのキーにしない', () => {
      expect(() => run('toString')).toThrow(ReferenceError);
      expect(runLenient('toString')).toBeUndefined();
    });
  });

  // 仕様「暗黙のオプショナルチェーン」の「呼び出しの `(` は、直前が識別子・`)`・`]` のときに変換します」
  describe('呼び出しの変換の細部', () => {
    it('丸括弧と呼び出しの結果の呼び出しも変換する', () => {
      expect(
        run('(flag ? f : g)()', {flag: true, f: null, g: () => 1}),
      ).toBeUndefined();
      expect(run('f()()', {f: () => null})).toBeUndefined();
    });

    it('リテラルと undefined / NaN / Infinity の呼び出しは TypeError', () => {
      expect(() => run('undefined()')).toThrow(TypeError);
      expect(() => run('null()')).toThrow(TypeError);
      expect(() => run("'x'()")).toThrow(TypeError);
      expect(() => run('NaN()')).toThrow(TypeError);
    });
  });
});
