/* @vitest-environment jsdom */
/**
 * @fileoverview
 * 式評価で使用できない（ブロックされた）グローバル識別子（Object 等）を参照したとき、
 * 原因を特定しやすい明示的な警告を出すことを検証する（改修依頼2 の DX 改善）。
 */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import Expression from '../src/expression';
import Log from '../src/log';

describe('式評価: ブロック識別子の明示警告', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Object.assign を使うと blocked identifier 警告を出す', () => {
    const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Log, 'error').mockImplementation(() => undefined);

    // Object はブロックされ undefined になるため Object.assign は TypeError
    const result = Expression.evaluate('Object.assign({}, a)', {a: {x: 1}});
    expect(result).toBeNull();

    const warned = warn.mock.calls.some(args =>
      args.some(
        a => typeof a === 'string' && a.includes('blocked identifier'),
      ),
    );
    expect(warned).toBe(true);
    const mentionsObject = warn.mock.calls.some(args =>
      args.some(a => typeof a === 'string' && /\bObject\b/.test(a)),
    );
    expect(mentionsObject).toBe(true);
  });

  it('通常のプロパティ名 Object（foo.Object）は誤検出しない', () => {
    const warn = vi.spyOn(Log, 'warn').mockImplementation(() => undefined);
    // foo.Object は許可（プロパティアクセス）。エラーにならず警告も出ない。
    const result = Expression.evaluate('foo.Object', {foo: {Object: 7}});
    expect(result).toBe(7);
    const warnedBlocked = warn.mock.calls.some(args =>
      args.some(
        a => typeof a === 'string' && a.includes('blocked identifier'),
      ),
    );
    expect(warnedBlocked).toBe(false);
  });
});
