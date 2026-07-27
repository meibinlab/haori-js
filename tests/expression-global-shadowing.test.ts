/* @vitest-environment jsdom */
/**
 * @fileoverview バインドに無い識別子がグローバルへ解決されないことの検証。
 *
 * 報告された症状の回帰ガードです。
 * 1. `{{agencyCode}}` が `id="agencyCode"` の要素（window の named access）へ
 *    解決され、`[object HTMLInputElement]` が入力欄へ書き込まれる
 * 2. 未解決参照として扱われないため `required` の必須検証も通ってしまう
 * 3. `{{name}}` `{{status}}` のような window の既存プロパティも同様に解決される
 *
 * あわせて、標準組み込み（`Math` など）は従来どおり参照できること、
 * 短絡評価で参照されない識別子の扱いが変わらないことを確認します。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Core from '../src/core';
import Expression from '../src/expression';
import Log from '../src/log';
import {waitForDomSettled} from './helpers/async';

/** jsdom は window の named access を実装しないため、同等の状態を作る対象名 */
const NAMED_ACCESS_KEY = 'agencyCode';

describe('バインドに無い識別子のグローバル解決', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    delete (window as unknown as Record<string, unknown>)[NAMED_ACCESS_KEY];
    (window as unknown as Record<string, unknown>)['name'] = '';
  });

  /**
   * 実ブラウザの named access on window と同じスコープ解決になる状態を作ります。
   * jsdom には id 由来の named access が無いため、同名のグローバルを定義します。
   *
   * @param element 解決先の要素
   */
  const defineNamedAccess = (element: Element): void => {
    Object.defineProperty(window, NAMED_ACCESS_KEY, {
      configurable: true,
      get: () => element,
    });
  };

  describe('window の named access', () => {
    it('同名 id の要素へ解決せず未解決参照になる', () => {
      container.innerHTML = '<input id="agencyCode">';
      defineNamedAccess(container.querySelector('input')!);

      const result = Expression.evaluateDetailed(NAMED_ACCESS_KEY, {});
      expect(result.value).toBeUndefined();
      expect(result.unresolvedReference).toBe(true);
    });

    it('`??` を伴う場合はフォールバック値になる', () => {
      container.innerHTML = '<input id="agencyCode">';
      defineNamedAccess(container.querySelector('input')!);

      const result = Expression.evaluateDetailed('agencyCode ?? \'fb\'', {});
      expect(result.value).toBe('fb');
      expect(result.unresolvedReference).toBe(false);
    });

    it('バインドに同名キーがあればその値を使う', () => {
      container.innerHTML = '<input id="agencyCode">';
      defineNamedAccess(container.querySelector('input')!);

      const result = Expression.evaluateDetailed(NAMED_ACCESS_KEY, {
        agencyCode: 'A-1',
      });
      expect(result.value).toBe('A-1');
      expect(result.unresolvedReference).toBe(false);
    });

    it('原因を特定できるエラーログを出力する', () => {
      const error = vi.spyOn(Log, 'error').mockImplementation(() => undefined);
      container.innerHTML = '<input id="agencyCode">';
      defineNamedAccess(container.querySelector('input')!);

      Expression.evaluateDetailed(NAMED_ACCESS_KEY, {});

      expect(error).toHaveBeenCalled();
      const message = error.mock.calls
        .map(call => call.map(part => String(part)).join(' '))
        .join('\n');
      expect(message).toContain(NAMED_ACCESS_KEY);
      expect(message).toContain('not in the');
    });
  });

  describe('window の既存プロパティ', () => {
    it('`name` がバインド無しで解決されない', () => {
      (window as unknown as Record<string, unknown>)['name'] = 'WINDOW-NAME';

      const result = Expression.evaluateDetailed('name', {});
      expect(result.value).toBeUndefined();
      expect(result.unresolvedReference).toBe(true);
    });

    it('`status` / `length` / `origin` も解決されない', () => {
      for (const key of ['status', 'length', 'origin', 'screenX']) {
        const result = Expression.evaluateDetailed(key, {});
        expect(result.value, key).toBeUndefined();
        expect(result.unresolvedReference, key).toBe(true);
      }
    });
  });

  describe('標準組み込みは参照できる', () => {
    it('名前空間オブジェクトとコンストラクタを使える', () => {
      expect(
        Expression.evaluate('Math.max(...scores)', {scores: [1, 9, 3]}),
      ).toBe(9);
      expect(Expression.evaluate('JSON.stringify(a)', {a: {x: 1}})).toBe(
        '{"x":1}',
      );
      expect(Expression.evaluate('Array(n).fill(0).length', {n: 3})).toBe(3);
      expect(Expression.evaluate('String(v) + Number(w)', {v: 1, w: '2'})).toBe(
        '12',
      );
    });

    it('組み込み関数を使える', () => {
      expect(Expression.evaluate('parseInt(\'42\', 10)', {})).toBe(42);
      expect(Expression.evaluate('isNaN(v)', {v: 'x'})).toBe(true);
      expect(Expression.evaluate('encodeURIComponent(\'a b\')', {})).toBe(
        'a%20b',
      );
    });

    it('未解決参照として扱われない', () => {
      const result = Expression.evaluateDetailed('Math.abs(-1)', {});
      expect(result.value).toBe(1);
      expect(result.unresolvedReference).toBe(false);
    });
  });

  describe('遮蔽が式を壊さない', () => {
    it('アロー関数の引数はシャドウされない', () => {
      expect(
        Expression.evaluate('items.map(i => i.v).join(\',\')', {
          items: [{v: 1}, {v: 2}],
        }),
      ).toBe('1,2');
      expect(
        Expression.evaluate('items.filter(x => x > 1).length', {
          items: [1, 2, 3],
        }),
      ).toBe(2);
    });

    it('リテラルは宣言されない', () => {
      expect(Expression.evaluate('true', {})).toBe(true);
      expect(Expression.evaluate('null', {})).toBeNull();
      expect(Expression.evaluate('undefined', {})).toBeUndefined();
      expect(Expression.evaluate('NaN', {})).toBeNaN();
      expect(Expression.evaluate('Infinity', {})).toBe(Infinity);
    });

    it('オブジェクトリテラルのキーとショートハンドを扱える', () => {
      expect(Expression.evaluate('{name: \'literal\'}', {})).toEqual({
        name: 'literal',
      });
      expect(Expression.evaluate('{shorthand}', {shorthand: 7})).toEqual({
        shorthand: 7,
      });
    });

    it('短絡評価で参照されない識別子は未解決にしない', () => {
      const skipped = Expression.evaluateDetailed('cond ? missing : 5', {
        cond: false,
      });
      expect(skipped.value).toBe(5);
      expect(skipped.unresolvedReference).toBe(false);

      const evaluated = Expression.evaluateDetailed('cond ? missing : 5', {
        cond: true,
      });
      expect(evaluated.value).toBeUndefined();
      expect(evaluated.unresolvedReference).toBe(true);
    });

    it('`haori` の組み込みヘルパーを参照できる', () => {
      const result = Expression.evaluateDetailed('haori.number(v, 2)', {
        v: 1.5,
      });
      expect(result.unresolvedReference).toBe(false);
      expect(String(result.value)).toContain('1.5');
    });
  });

  describe('data-attr-value への影響', () => {
    it('要素オブジェクトを書き込まず必須検証も働く', async () => {
      container.innerHTML = [
        '<form>',
        '  <input id="agencyCode" name="agencyCode" required',
        '         data-attr-value="{{agencyCode}}">',
        '</form>',
      ].join('\n');
      defineNamedAccess(container.querySelector('#agencyCode')!);
      vi.spyOn(Log, 'error').mockImplementation(() => undefined);

      await Core.scan(container);
      await waitForDomSettled();

      const input = container.querySelector<HTMLInputElement>('#agencyCode')!;
      expect(input.value).toBe('');
      expect(input.checkValidity()).toBe(false);
    });

    it('window プロパティ名でも同様', async () => {
      (window as unknown as Record<string, unknown>)['name'] = 'WINDOW-NAME';
      container.innerHTML = [
        '<form>',
        '  <input name="userName" required data-attr-value="{{name}}">',
        '</form>',
      ].join('\n');
      vi.spyOn(Log, 'error').mockImplementation(() => undefined);

      await Core.scan(container);
      await waitForDomSettled();

      const input =
        container.querySelector<HTMLInputElement>('[name="userName"]')!;
      expect(input.value).toBe('');
      expect(input.checkValidity()).toBe(false);
    });

    it('テンプレート展開でも要素オブジェクトを描画しない', async () => {
      container.innerHTML = [
        '<div>',
        '  <span id="agencyCode">x</span>',
        '  <p id="out">{{agencyCode}}</p>',
        '</div>',
      ].join('\n');
      defineNamedAccess(container.querySelector('#agencyCode')!);
      vi.spyOn(Log, 'error').mockImplementation(() => undefined);

      await Core.scan(container);
      await waitForDomSettled();

      expect(container.querySelector('#out')!.textContent).toBe('');
    });
  });
});
