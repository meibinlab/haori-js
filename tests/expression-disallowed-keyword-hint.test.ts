/* @vitest-environment jsdom */
/**
 * @fileoverview
 * 使用できないキーワード（function / return など）を含む式の評価失敗時に、
 * 具体的なヒント（アロー関数への置き換え）付き警告を出すことを検証する。
 * 背景: data-derive で `function(m){return {...}}` を使うと式が null になり
 * 行が描画されない事象の原因特定を容易にするための DX 改善。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Expression from '../src/expression';
import Log from '../src/log';

describe('使用できないキーワードの警告ヒント', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** すべての warn 呼び出しの引数を連結した文字列を返す。 */
  const warnText = (): string =>
    warnSpy.mock.calls.map(args => args.join(' ')).join('\n');

  it('function/return を含む式は null を返し、アロー関数を促す警告を出す', () => {
    const result = Expression.evaluate(
      'items.map(function(m){return {id: m.id};})',
      {items: [{id: 1}]},
    );
    expect(result).toBeNull();
    const text = warnText();
    expect(text).toContain('disallowed keyword(s)');
    expect(text).toContain('function');
    expect(text).toContain('return');
    expect(text).toContain('arrow function');
  });

  it('アロー関数版は正常に評価され、警告は出ない', () => {
    const result = Expression.evaluate('items.map(m => ({id: m.id}))', {
      items: [{id: 1}, {id: 2}],
    });
    expect(result).toEqual([{id: 1}, {id: 2}]);
    expect(warnText()).not.toContain('disallowed keyword(s)');
  });

  it('キーワードを部分文字列に含む識別子は誤検出しない', () => {
    // `returnValue` は `return` を含むが、独立したキーワードではない。
    const result = Expression.evaluate('returnValue + 1', {returnValue: 5});
    expect(result).toBe(6);
    expect(warnText()).not.toContain('disallowed keyword(s)');
  });
});
