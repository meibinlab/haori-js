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
 *
 * 期待値の根拠は仕様「双方向バインディングの自動更新」と仕様「行の対応付けと `data-each-key`」。
 */
import {afterEach, describe, expect, it, vi} from 'vitest';
import Dev from '../src/dev';
import Form from '../src/form';
import Log from '../src/log';

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

    it('リストキーを持たない配列は出現順で対応する', () => {
      // ここで渡す配列は収集経路を通っていないため行の識別情報を持たず、
      // `data-each` で描いていない静的な行と同じ扱いになる。
      //
      // 出現順の対応は「配列と画面の行数・並びが一致している」ことが前提で、
      // 崩れると残った行が消えた行の非入力フィールドを引き継ぐ。画面を通した
      // 対応付け（`data-each-key` によるリストキー照合）は
      // `tests/row-identity.test.ts` で検証する。
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

  describe('出現順への退避の通知', () => {
    /**
     * 通知の記録が空の状態から検証します。
     *
     * 通知は同じ理由を繰り返さないようモジュール内に記録を持ち、jsdom は
     * ホスト名が `localhost` のため開発モードが既定で有効です。したがって
     * 静的な import を使うと、先行するテストが通知を消費したかどうかに結果が
     * 左右されます。モジュールを作り直して順序依存を断ちます。
     *
     * @returns 作り直した Form / Log / Dev
     */
    const freshModules = async (): Promise<{
      form: typeof Form;
      log: typeof Log;
      dev: typeof Dev;
    }> => {
      vi.resetModules();
      const [form, log, dev] = await Promise.all([
        import('../src/form'),
        import('../src/log'),
        import('../src/dev'),
      ]);
      return {form: form.default, log: log.default, dev: dev.default};
    };

    afterEach(() => {
      vi.restoreAllMocks();
      vi.resetModules();
      Dev.disable();
    });

    it('行らしい配列で識別情報が無い場合は開発モードで知らせる', async () => {
      // 識別情報は収集した配列そのものを鍵に持つため、収集から重ね合わせまでの
      // 途中で配列を複製する処理が増えると黙って出現順へ退く。その番犬。
      const {form, log, dev} = await freshModules();
      const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined);
      dev.enable();

      form.mergeCollectedValues({rows: [{id: 1, t: 'a'}]}, {rows: [{t: 'b'}]});

      expect(warn).toHaveBeenCalled();
      expect(String(warn.mock.calls[0][1])).toContain('出現順で対応付けます');
    });

    it('同じ理由では繰り返し知らせない', async () => {
      const {form, log, dev} = await freshModules();
      const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined);
      dev.enable();

      form.mergeCollectedValues({rows: [{id: 1, t: 'a'}]}, {rows: [{t: 'b'}]});
      form.mergeCollectedValues({rows: [{id: 2, t: 'a'}]}, {rows: [{t: 'c'}]});

      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('スカラの配列では知らせない', async () => {
      // 入力要素へ付けた `data-form-list` が集めるスカラの配列は、出現順で
      // 対応させるのが正しい構成。
      const {form, log, dev} = await freshModules();
      const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined);
      dev.enable();

      form.mergeCollectedValues({tags: ['x', 'y']}, {tags: ['x', 'z']});

      expect(warn).not.toHaveBeenCalled();
    });

    it('開発モードでなければ知らせない', async () => {
      const {form, log, dev} = await freshModules();
      const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined);
      dev.disable();

      form.mergeCollectedValues({rows: [{id: 2, t: 'a'}]}, {rows: [{t: 'b'}]});

      expect(warn).not.toHaveBeenCalled();
    });
  });
});
