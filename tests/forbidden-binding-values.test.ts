/* @vitest-environment jsdom */
/**
 * @fileoverview 危険な値の検査の範囲と、検査結果の再利用。
 *
 * 期待値は仕様「評価メカニズム」の次の記述から取っている。
 *
 * - 「**式が参照する名前の値**を再帰的にチェックし、実ホストオブジェクト等の
 *   **危険な値**を含む場合は評価を拒否」
 * - 「**4 の危険な値の検査は、式が参照する名前の値に限ります。**」「参照しない名前の
 *   値に危険な値があっても、その式の評価は拒否しません」
 * - 「`haori.data` を参照する式は、すべての名前の値を運ぶため、従来どおりスコープ全体を
 *   調べます」
 * - 「検査の結果は値（オブジェクト）ごとに控え、同じ microtask の中の評価で再利用
 *   します。次の microtask では捨てて調べ直す」
 * - 「循環参照（A→B→A）は、たどっている途中の値へ戻った時点で打ち切ります。
 *   打ち切った部分の「危険な値なし」は控えません」
 * - 「ストレージは値の同一性ではなく種類（`instanceof Storage`）で判定するため、検査の
 *   ために `localStorage` / `sessionStorage` を読みません。ストレージを参照しただけで
 *   例外になる環境（`allow-same-origin` の無い sandbox iframe など）でも、先に取り出され
 *   たストレージを持ち込めば拒否します。`Storage` の無い環境（ブラウザ以外）では、
 *   ストレージの判定を行いません」
 */
import {afterEach, describe, expect, it, vi} from 'vitest';
import Expression from '../src/expression';
import Log from '../src/log';

describe('危険な値の検査', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * 警告を黙らせます。
   */
  function silence(): void {
    vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
  }

  describe('検査の範囲', () => {
    it('参照しない名前の値に危険な値があっても、式を評価する', () => {
      silence();
      expect(
        Expression.evaluate('n.label', {
          n: {label: 'ノード'},
          other: {host: window},
        }),
      ).toBe('ノード');
    });

    it('プロパティ名と同じ名前の値は、参照しない名前として扱う', () => {
      silence();
      // `n.label` の `label` はプロパティ名で、スコープの `label` を参照しない。
      expect(
        Expression.evaluate('n.label', {n: {label: 'ノード'}, label: window}),
      ).toBe('ノード');
    });

    it('参照する名前の値に危険な値があれば、評価を拒否する', () => {
      silence();
      expect(
        Expression.evaluate('n.label', {n: {label: 'ノード', host: window}}),
      ).toBeNull();
    });

    it('参照する名前の値そのものが危険な関数なら、評価を拒否する', () => {
      silence();
      expect(Expression.evaluate('f', {f: globalThis.setTimeout})).toBeNull();
    });

    it('haori.data を参照する式は、スコープ全体を調べる', () => {
      silence();
      expect(
        Expression.evaluate('haori.data.other.host', {
          n: {label: 'ノード'},
          other: {host: window},
        }),
      ).toBeNull();
    });
  });

  describe('循環参照', () => {
    it('A→B→A で A だけが危険な値を持つとき、B を起点にした検査も拒否する（回帰）', () => {
      silence();
      const a: Record<string, unknown> = {};
      const b: Record<string, unknown> = {a};
      a.b = b;
      a.host = window;

      expect(Expression.evaluate('x', {x: a})).toBeNull();
      // 同じ microtask の中で、B を起点に調べ直す。
      expect(Expression.evaluate('y.a === y.a', {y: b})).toBeNull();
    });

    it('A→B→C→A で A だけが危険な値を持つとき、B と C を起点にした検査も拒否する（回帰）', () => {
      silence();
      const a: Record<string, unknown> = {};
      const c: Record<string, unknown> = {a};
      const b: Record<string, unknown> = {c};
      a.b = b;
      a.host = window;

      expect(Expression.evaluate('x', {x: a})).toBeNull();
      expect(Expression.evaluate('y.c === y.c', {y: b})).toBeNull();
      expect(Expression.evaluate('z.a === z.a', {z: c})).toBeNull();
    });
  });

  describe('ストレージ', () => {
    /** 退避したプロパティの定義（復元用） */
    const saved = new Map<string, PropertyDescriptor>();

    afterEach(() => {
      for (const [name, descriptor] of saved) {
        Object.defineProperty(window, name, descriptor);
      }
      saved.clear();
      vi.unstubAllGlobals();
    });

    /**
     * ストレージの参照を差し替えます。
     *
     * @param name 対象のグローバル名
     * @param get 参照されたときの処理
     */
    function replaceStorage(
      name: 'localStorage' | 'sessionStorage',
      get: () => unknown,
    ): void {
      const descriptor = Object.getOwnPropertyDescriptor(window, name);
      if (descriptor && !saved.has(name)) {
        saved.set(name, descriptor);
      }
      Object.defineProperty(window, name, {configurable: true, get});
    }

    it('検査のためにストレージを読まない', async () => {
      const local = window.localStorage;
      const session = window.sessionStorage;
      let reads = 0;
      replaceStorage('localStorage', () => {
        reads++;
        return local;
      });
      replaceStorage('sessionStorage', () => {
        reads++;
        return session;
      });
      // 前の microtask で作った危険値の集合を使わないよう、microtask を進める。
      await Promise.resolve();

      expect(Expression.evaluate('x.label', {x: {label: 'a'}})).toBe('a');
      expect(reads).toBe(0);
    });

    it('参照すると例外になる環境でも、先に取り出したストレージは拒否する（回帰）', async () => {
      silence();
      const session = window.sessionStorage;
      const blocked = () => {
        throw new DOMException('storage is blocked', 'SecurityError');
      };
      replaceStorage('localStorage', blocked);
      replaceStorage('sessionStorage', blocked);
      await Promise.resolve();

      expect(Expression.evaluate('s', {s: session})).toBeNull();
    });

    it('Storage の無い環境でも、式を評価する', async () => {
      vi.stubGlobal('Storage', undefined);
      await Promise.resolve();

      expect(Expression.evaluate('x.label', {x: {label: 'a'}})).toBe('a');
    });
  });

  describe('検査結果の再利用', () => {
    it('危険な値の集合は、同じ microtask の中では作り直さない', () => {
      const build = vi.spyOn(
        Expression as unknown as {getForbiddenBindingValues: () => unknown[]},
        'getForbiddenBindingValues',
      );
      Expression.evaluate('x', {x: {label: 'a'}});
      Expression.evaluate('y', {y: {label: 'b'}});

      expect(build).toHaveBeenCalledTimes(1);
    });

    it('次の microtask では、差し替えた後の関数を危険な値として扱う', async () => {
      silence();
      const original = globalThis.setTimeout;
      const replaced = ((handler: () => void) =>
        original(handler, 0)) as unknown as typeof setTimeout;
      // 差し替える前の関数で集合を作らせてから差し替える。
      Expression.evaluate('x', {x: {label: 'a'}});
      globalThis.setTimeout = replaced;
      try {
        await Promise.resolve();
        expect(Expression.evaluate('f', {f: replaced})).toBeNull();
      } finally {
        globalThis.setTimeout = original;
      }
    });
  });
});
