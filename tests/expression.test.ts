import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateExpressionSafe, clearExpressionCache, getExpressionCacheSize } from '../src/expression';
import { setDevMode } from '../src/dev';

describe('式評価エンジン', () => {
  beforeEach(() => {
    clearExpressionCache();
    setDevMode(true); // 開発モードを有効にしてエラーを確認
  });

  describe('基本的な式評価', () => {
    it('単純な文字列連結', () => {
      const result = evaluateExpressionSafe("name + 'さん'", { name: "花子" });
      expect(result).toBe("花子さん");
    });

    it('数値計算', () => {
      const result = evaluateExpressionSafe("a + b * 2", { a: 1, b: 3 });
      expect(result).toBe(7);
    });

    it('論理演算', () => {
      const result = evaluateExpressionSafe("age >= 18", { age: 20 });
      expect(result).toBe(true);
    });

    it('条件演算子', () => {
      const result = evaluateExpressionSafe("score >= 60 ? 'pass' : 'fail'", { score: 75 });
      expect(result).toBe('pass');
    });
  });

  describe('セキュリティ対策', () => {
    it('window へのアクセスをブロック', () => {
      const result = evaluateExpressionSafe("window.location.href", {});
      expect(result).toBe(null);
    });

    it('eval の使用をブロック', () => {
      const result = evaluateExpressionSafe("eval('1+1')", {});
      expect(result).toBe(null);
    });

    it('Function constructor の使用をブロック', () => {
      const result = evaluateExpressionSafe("Function('return 1')()", {});
      expect(result).toBe(null);
    });

    it('alert の使用をブロック', () => {
      const result = evaluateExpressionSafe("alert('test')", {});
      expect(result).toBe(null);
    });
  });

  describe('エラーハンドリング', () => {
    it('空の式は null を返す', () => {
      const result = evaluateExpressionSafe("", {});
      expect(result).toBe(null);
    });

    it('空白のみの式は null を返す', () => {
      const result = evaluateExpressionSafe("   ", {});
      expect(result).toBe(null);
    });

    it('構文エラーは null を返す', () => {
      const result = evaluateExpressionSafe("name +", { name: "test" });
      expect(result).toBe(null);
    });

    it('未定義変数は undefined として扱う', () => {
      const result = evaluateExpressionSafe("undefinedVar", {});
      expect(result).toBe(undefined);
    });
  });

  describe('キャッシュ機能', () => {
    it('同じ式を再評価するとキャッシュされる', () => {
      const expression = "name + 'さん'";
      const scope = { name: "太郎" };
      
      evaluateExpressionSafe(expression, scope);
      const initialCacheSize = getExpressionCacheSize();
      
      evaluateExpressionSafe(expression, scope);
      const finalCacheSize = getExpressionCacheSize();
      
      expect(finalCacheSize).toBe(initialCacheSize);
    });

    it('異なる式は別々にキャッシュされる', () => {
      evaluateExpressionSafe("a + b", { a: 1, b: 2 });
      evaluateExpressionSafe("c + d", { c: 3, d: 4 });
      
      expect(getExpressionCacheSize()).toBe(2);
    });
  });
});
