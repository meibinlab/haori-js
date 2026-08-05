/* @vitest-environment jsdom */
/**
 * @fileoverview
 * 式評価からのプロトタイプ脱出（サンドボックス脱出）の検証。
 *
 * 期待値の根拠は仕様「評価メカニズム」の「セキュリティレイヤー」で、
 * 「plain object / array / function を Proxy でラップし、`constructor`、`__proto__`、
 * `prototype` へのアクセスを遮断」「評価中のみ prototype 系プロパティの生アクセスを
 * 一時的に遮断」と定め、続けて「遮断されたアクセスは…例外ではなく `undefined` に
 * なります」と定めている。**遮断は名前の書き方に依存しない** ——`obj.constructor`
 * でも `obj["con"+"structor"]` でも同じく遮断される、というのが仕様の要求である。
 *
 * 遮断の結果は仕様上 2 通りある。構文の検証（レイヤー 1）で弾かれた式は評価されず
 * 値が `null` になり、評価中に遮断されたアクセス（レイヤー 3・5・6）は `undefined`
 * になる。どちらで遮断されるかは実装の都合なので、`expectBlocked()` は「危険な値が
 * 返らないこと」を判定する。
 *
 * なお式テキスト自体は開発者が書くコード（信頼境界の内側）であり、この検証は多層
 * 防御の各層が働くことの確認であって、任意の悪意ある式を防ぐ境界の証明ではない
 * （仕様「XSS対策」の脅威モデルを参照）。
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';
import Expression from '../src/expression';

/** 脱出の成否を記録するグローバル */
interface EscapeProbeGlobal {
  __escaped__?: boolean;
}

/**
 * 式が遮断されることを検証します。
 *
 * @param expression 検証する式
 * @param bindedValues バインド値
 */
function expectBlocked(
  expression: string,
  bindedValues: Record<string, unknown> = {},
): void {
  const result = Expression.evaluate(expression, bindedValues);
  // 仕様「評価メカニズム」の遮断結果（評価されない式は `null`、遮断された
  // アクセスは `undefined`）。関数・オブジェクトが返れば脱出できている。
  expect(result === null || result === undefined).toBe(true);
}

describe('式評価からのプロトタイプ脱出', () => {
  const probe = globalThis as unknown as EscapeProbeGlobal;

  beforeEach(() => {
    delete probe.__escaped__;
    // 遮断時は警告が出る経路があるため、出力を抑える（判定には使わない）。
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  describe('関数コンストラクタへ到達できない', () => {
    it('async アロー関数の計算プロパティ名から任意コードを実行できない', () => {
      // 実証済みの脱出経路。`.constructor` は静的に弾かれるが、
      // `["con"+"structor"]` は文字列トークンを 1 個ずつ照合する検証をすり抜け、
      // `AsyncFunction` へ到達して任意コードを実行できていた。
      expectBlocked(
        '(async y=>y)["con"+"structor"]' +
          '("globalThis.__escaped__=true;return 1")()',
      );

      expect(probe.__escaped__).toBeUndefined();
    });

    it('通常のアロー関数の計算プロパティ名から Function へ到達できない', () => {
      expectBlocked('(y=>y)["con"+"structor"]');
    });

    it('文字列リテラルを基点にした計算プロパティ名から String へ到達できない', () => {
      // 基点が文字列リテラルのとき `[` を配列リテラルと誤分類し、
      // `""["constructor"]` が連結すらせず素通りしていた。
      expectBlocked('""["constructor"]');
      expectBlocked('""["con"+"structor"]');
    });

    it('数値・配列・オブジェクトの各リテラルからも到達できない', () => {
      expectBlocked('(1)["con"+"structor"]');
      expectBlocked('[]["con"+"structor"]');
      expectBlocked('({})["con"+"structor"]');
      expectBlocked('true["con"+"structor"]');
    });

    it('バインド値からも到達できない', () => {
      expectBlocked('user["con"+"structor"]', {user: {name: 'a'}});
      expectBlocked('list["con"+"structor"]', {list: [1]});
    });
  });

  describe('名前の作り方を変えても遮断される', () => {
    it('String.fromCharCode で組み立てた名前でも遮断される', () => {
      expectBlocked(
        '(async y=>y)[String.fromCharCode(99,111,110,115,116,114,117,99,116,' +
          '111,114)]',
      );
    });

    it('Unicode エスケープを含む文字列リテラルでも遮断される', () => {
      expectBlocked('""["\\u0063onstructor"]');
    });

    it('配列の join で組み立てた名前でも遮断される', () => {
      expectBlocked('(async y=>y)[["con","structor"].join("")]');
    });

    it('__proto__ と prototype も同様に遮断される', () => {
      expectBlocked('({})["__pro"+"to__"]');
      expectBlocked('""["proto"+"type"]');
      expectBlocked('String["proto"+"type"]');
    });
  });

  describe('プロトタイプ汚染とグローバル到達ができない', () => {
    it('Object.prototype を汚染できない', () => {
      Expression.evaluate(
        '(async y=>y)["con"+"structor"]' +
          '("Object.prototype.__polluted__=1")()',
      );

      expect(({} as Record<string, unknown>).__polluted__).toBeUndefined();
      // 万一汚染された場合に後続のテストへ波及させない。
      delete (Object.prototype as Record<string, unknown>).__polluted__;
    });

    it('fetch などのグローバルへ到達できない', () => {
      expectBlocked('(async y=>y)["con"+"structor"]("return typeof fetch")()');
    });
  });

  describe('正常な動的プロパティアクセスは従来どおり使える', () => {
    it('計算プロパティ名で値を取得できる', () => {
      expect(Expression.evaluate('row["na"+"me"]', {row: {name: '山田'}})).toBe(
        '山田',
      );
    });

    it('変数をキーにした動的アクセスができる', () => {
      expect(
        Expression.evaluate('row[key]', {row: {age: 30}, key: 'age'}),
      ).toBe(30);
    });

    it('配列の添字アクセスと式による添字ができる', () => {
      expect(Expression.evaluate('list[1]', {list: ['a', 'b']})).toBe('b');
      expect(
        Expression.evaluate('list[index + 1]', {list: ['a', 'b'], index: 0}),
      ).toBe('b');
    });

    it('配列リテラルと文字列リテラルの添字は影響を受けない', () => {
      expect(Expression.evaluate('["a","b"][0]')).toBe('a');
      expect(Expression.evaluate('"abc"[1]')).toBe('b');
    });

    it('入れ子の動的アクセスができる', () => {
      expect(
        Expression.evaluate('data[outer][inner]', {
          data: {a: {b: 'ok'}},
          outer: 'a',
          inner: 'b',
        }),
      ).toBe('ok');
    });
  });
});
