/* @vitest-environment jsdom */
/**
 * @fileoverview 未解決参照を正常系として扱う仕様の検証。
 *
 * 「初期表示でエラーを出さないために data-bind でキーを宣言する」必要をなくす
 * ための仕様変更の回帰ガードです。
 * 1. バインドに無いキーの参照はエラーにせず未解決参照とする
 * 2. `null` / `undefined` を経由するメンバーアクセスも `?.` を書かずに未解決参照
 * 3. 判定する式は「無い＝偽」として結論を出す
 * 4. 診断は開発モード限定で、描画完了後に一度も供給されなかったキーだけを集約警告
 * 5. `data-strict-bind` を付けた場合だけ即時 error
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Dev from '../src/dev';
import Env from '../src/env';
import Expression from '../src/expression';
import Log from '../src/log';
import Queue from '../src/queue';

describe('未解決参照の扱い', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Dev.enable();
    Env.setStrictBind(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Env.setStrictBind(false);
  });

  describe('規則1: バインドに無いキーはエラーにしない', () => {
    it('宣言していないキーを参照してもエラーログを出さない', () => {
      const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);

      const result = Expression.evaluateDetailed('result', {});

      expect(result.value).toBeUndefined();
      expect(result.unresolvedReference).toBe(true);
      expect(error).not.toHaveBeenCalled();
    });

    it('本番（開発モード無効）では警告も出さない', async () => {
      Dev.disable();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const error = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      Expression.evaluateDetailed('productionOnlyKey', {});
      await Queue.waitForIdle();

      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      Dev.enable();
    });
  });

  describe('規則2: null / undefined 経由のメンバーアクセス', () => {
    it('途中が null でも例外にせず未解決参照にする', () => {
      const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);

      const result = Expression.evaluateDetailed('view.totalCount', {
        view: null,
      });

      expect(result.value).toBeUndefined();
      expect(result.unresolvedReference).toBe(true);
      expect(error).not.toHaveBeenCalled();
    });

    it('多段のプロパティでも未解決参照にする', () => {
      const result = Expression.evaluateDetailed('a.b.c', {a: {}});
      expect(result.value).toBeUndefined();
      expect(result.unresolvedReference).toBe(true);
    });

    it('添字アクセスの結果が無くても未解決参照にする', () => {
      const result = Expression.evaluateDetailed('list[0].name', {list: []});
      expect(result.value).toBeUndefined();
      expect(result.unresolvedReference).toBe(true);
    });

    it('存在しないメソッド呼び出しも未解決参照にする', () => {
      const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);

      const result = Expression.evaluateDetailed('obj.fn()', {obj: {}});

      expect(result.value).toBeUndefined();
      expect(result.unresolvedReference).toBe(true);
      expect(error).not.toHaveBeenCalled();
    });

    it('解決できる場合は従来どおり値を返す', () => {
      expect(Expression.evaluate('a.b.c', {a: {b: {c: 1}}})).toBe(1);
      expect(Expression.evaluate('name.toUpperCase()', {name: 'ab'})).toBe('AB');
      expect(
        Expression.evaluate('items.map(i => i.v).join(\',\')', {
          items: [{v: 1}, {v: 2}],
        }),
      ).toBe('1,2');
      expect(Expression.evaluate('Math.max(...scores)', {scores: [1, 9]})).toBe(
        9,
      );
      expect(Expression.evaluate('list[0].name', {list: [{name: 'n'}]})).toBe(
        'n',
      );
    });

    it('明示的な `?.` と併用しても壊れない', () => {
      expect(Expression.evaluate('user?.profile?.age', {user: null}))
        .toBeUndefined();
      expect(
        Expression.evaluate('user?.profile.age', {
          user: {profile: {age: 20}},
        }),
      ).toBe(20);
      expect(Expression.evaluate('fn?.(1)', {fn: (n: number) => n + 1})).toBe(2);
    });

    it('アロー関数の引数リストを呼び出しと誤認しない', () => {
      expect(Expression.evaluate('(a, b) => a + b', {})).toBeTypeOf('function');
      expect(
        Expression.evaluate('(cond ? f : g)(2)', {
          cond: true,
          f: (n: number) => n * 2,
          g: null,
        }),
      ).toBe(4);
    });
  });

  describe('規則3: 判定する式は結論を出す', () => {
    it('否定は「無い＝偽」の否定で true になる', () => {
      const result = Expression.evaluateDetailed('!_fetch.status', {});
      expect(result.value).toBe(true);
      expect(result.unresolvedReference).toBe(false);
    });

    it('比較は false として結論が出る', () => {
      expect(Expression.evaluateDetailed('count > 0', {}).value).toBe(false);
      expect(Expression.evaluateDetailed('a === \'x\'', {}).value).toBe(false);
    });

    it('値を求める式は未解決参照のままにする', () => {
      // 'xundefined' や NaN を表示しないための境界。
      const concatenated = Expression.evaluateDetailed('\'x\' + missing', {});
      expect(concatenated.value).toBeUndefined();
      expect(concatenated.unresolvedReference).toBe(true);

      const arithmetic = Expression.evaluateDetailed('a + b', {});
      expect(arithmetic.value).toBeUndefined();
      expect(arithmetic.unresolvedReference).toBe(true);
    });

    it('短絡評価で参照されない識別子の扱いは変わらない', () => {
      expect(Expression.evaluateDetailed('cond ? missing : 5', {cond: false}))
        .toMatchObject({value: 5, unresolvedReference: false});
      expect(Expression.evaluateDetailed('cond ? missing : 5', {cond: true}))
        .toMatchObject({unresolvedReference: true});
    });
  });

  describe('規則4: 診断は集約して 1 回', () => {
    it('描画完了後に一度も供給されなかったキーだけを警告する', async () => {
      const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);

      Expression.evaluateDetailed('neverSuppliedKey', {});
      Expression.evaluateDetailed('laterSuppliedKey', {});
      // 後続のバインド更新で解決したキーは報告対象から外す。
      Expression.evaluateDetailed('laterSuppliedKey', {
        laterSuppliedKey: 'ok',
      });

      await Queue.waitForIdle();

      const message = warn.mock.calls
        .map(call => call.map(part => String(part)).join(' '))
        .join('\n');
      expect(message).toContain('neverSuppliedKey');
      expect(message).not.toContain('laterSuppliedKey');
    });
  });

  describe('規則5: 厳格バインドモード', () => {
    it('script タグの data-strict-bind を検出する', () => {
      const script = document.createElement('script');
      script.setAttribute('src', '/dist/haori.iife.js');
      document.head.appendChild(script);
      try {
        // 属性が無ければ無効のまま。
        Env.detect();
        expect(Env.strictBind).toBe(false);

        script.setAttribute('data-strict-bind', '');
        Env.detect();
        expect(Env.strictBind).toBe(true);

        // 属性を外せば無効へ戻る。
        script.removeAttribute('data-strict-bind');
        Env.detect();
        expect(Env.strictBind).toBe(false);
      } finally {
        script.remove();
        Env.setStrictBind(false);
      }
    });

    it('data-strict-bind 相当では即時にエラーを出す', () => {
      const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);
      Env.setStrictBind(true);

      Expression.evaluateDetailed('strictModeKey', {});

      const message = error.mock.calls
        .map(call => call.map(part => String(part)).join(' '))
        .join('\n');
      expect(message).toContain('strictModeKey');
      expect(message).toContain('not in the binding data');
    });
  });
});
