/* @vitest-environment jsdom */
/**
 * @fileoverview 収集値の重ね合わせ（`Form.mergeCollectedValues`）の単体検証。
 *
 * 双方向コミットは収集値でバインドデータを置き換えるのではなく、直前のバインド
 * データへ重ねます。収集値は入力欄が表す部分だけなので、置き換えると行データの
 * 表示専用ラベル・`data-attr-value` へ渡す送信値・保存に要る `id` などが失われる
 * ためです。
 *
 * ここでは重ね合わせの規則そのもの（土台の保持、配列の出現順対応、危険キーの
 * 読み飛ばし）を、画面を挟まずに固定します。画面を通した検証は
 * `tests/row-value-roundtrip.test.ts` にあります。
 */
import {describe, expect, it} from 'vitest';
import Form from '../src/form';

describe('収集値の重ね合わせ', () => {
  describe('土台の保持', () => {
    it('収集値に無いキーは直前の値を残す', () => {
      const merged = Form.mergeCollectedValues(
        {id: 7, label: 'ラベル', title: '旧'},
        {title: '新'},
      );

      expect(merged).toEqual({id: 7, label: 'ラベル', title: '新'});
    });

    it('土台が無ければ収集値をそのまま使う', () => {
      expect(Form.mergeCollectedValues(null, {title: '新'})).toEqual({
        title: '新',
      });
    });

    it('入れ子のオブジェクトも階層ごとに重ねる', () => {
      const merged = Form.mergeCollectedValues(
        {customer: {id: 7, name: '旧'}},
        {customer: {name: '新'}},
      );

      expect(merged).toEqual({customer: {id: 7, name: '新'}});
    });

    it('土台を書き換えない', () => {
      const previous = {customer: {id: 7, name: '旧'}};
      Form.mergeCollectedValues(previous, {customer: {name: '新'}});

      expect(previous).toEqual({customer: {id: 7, name: '旧'}});
    });

    it('型が変わる場合は収集値で置き換える', () => {
      expect(
        Form.mergeCollectedValues({v: {a: 1}}, {v: 'スカラ'}),
      ).toEqual({v: 'スカラ'});
      expect(Form.mergeCollectedValues({v: [1, 2]}, {v: null})).toEqual({
        v: null,
      });
    });
  });

  describe('配列（行）の対応', () => {
    it('要素数は収集値に従う', () => {
      const previous = {rows: [{id: 1, t: 'a'}, {id: 2, t: 'b'}]};

      expect(
        Form.mergeCollectedValues(previous, {rows: [{t: 'a'}]}),
      ).toEqual({rows: [{id: 1, t: 'a'}]});
      expect(
        Form.mergeCollectedValues(previous, {
          rows: [{t: 'a'}, {t: 'b'}, {t: 'c'}],
        }),
      ).toEqual({rows: [{id: 1, t: 'a'}, {id: 2, t: 'b'}, {t: 'c'}]});
    });

    it('行は出現順で対応する（位置が前提）', () => {
      // 入力欄への書き戻しも同じ規則（同じ収集キーの出現順に配る）なので、
      // 収集 → 重ね合わせ → 書き戻しで対応がずれない。
      //
      // 裏を返すと、バインドデータの配列を縮めないまま短い収集値を確定させると、
      // 残った行が消えた行の非入力フィールドを引き継ぐ。行の増減は必ずバインド
      // データの配列を先に更新してから収集を確定させること。
      const previous = {
        rows: [
          {id: 1, label: 'A'},
          {id: 2, label: 'B'},
          {id: 3, label: 'C'},
        ],
      };

      expect(
        Form.mergeCollectedValues(previous, {rows: [{t: 'a'}, {t: 'c'}]}),
      ).toEqual({
        rows: [
          {id: 1, label: 'A', t: 'a'},
          {id: 2, label: 'B', t: 'c'},
        ],
      });
    });

    it('土台が配列でなければ収集値をそのまま使う', () => {
      expect(
        Form.mergeCollectedValues({rows: {a: 1}}, {rows: [{t: 'a'}]}),
      ).toEqual({rows: [{t: 'a'}]});
    });
  });

  describe('危険なキー', () => {
    it('__proto__ を載せずプロトタイプを差し替えない', () => {
      // 入力欄の name はサーバ側の値から組み立てられることがある。
      const collected = JSON.parse(
        '{"__proto__":{"polluted":"yes"},"title":"新"}',
      ) as Record<string, unknown>;

      const merged = Form.mergeCollectedValues({title: '旧'}, collected);

      expect(merged).toEqual({title: '新'});
      expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
      expect((merged as Record<string, unknown>).polluted).toBeUndefined();
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('constructor と prototype も載せない', () => {
      const merged = Form.mergeCollectedValues(
        {title: '旧'},
        {constructor: 'x', prototype: 'y', title: '新'},
      );

      expect(merged).toEqual({title: '新'});
      expect(merged.constructor).toBe(Object);
    });

    it('入れ子の __proto__ も載せない', () => {
      const collected = JSON.parse(
        '{"customer":{"__proto__":{"polluted":"yes"},"name":"新"}}',
      ) as Record<string, unknown>;

      const merged = Form.mergeCollectedValues(
        {customer: {id: 7, name: '旧'}},
        collected,
      );

      expect(merged).toEqual({customer: {id: 7, name: '新'}});
      expect(Object.getPrototypeOf(merged.customer as object)).toBe(
        Object.prototype,
      );
    });
  });
});
