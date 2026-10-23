/* @vitest-environment jsdom */
/**
 * @fileoverview 登録窓口（`handlers`）を ESM の名前付きエクスポートとして読めることのテスト
 *
 * 期待値の根拠は仕様「登録した関数（`Haori.handlers`）」です。入口のモジュールは
 * 読み込むと監視を始めるため、ほかのテストと分けています。
 */
import {describe, expect, it} from 'vitest';

import Haori from '../src/haori';
import {handlers} from '../src/index';

describe('handlers の公開', () => {
  it('ESM では handlers として読み込める', () => {
    // 仕様「登録した関数（`Haori.handlers`）」の「ESM では `import {handlers} from 'haori'`」
    expect(handlers).toBe(Haori.handlers);
  });
});
