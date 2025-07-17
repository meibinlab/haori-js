import {vi} from 'vitest';
import {
  evaluateExpressionSafe,
  getExpressionCacheSize,
  clearExpressionCache,
} from '../src/expression';
import {setDevMode} from '../src/dev';

describe('式評価エンジン (evaluateExpressionSafe)', () => {
  beforeEach(() => {
    clearExpressionCache();
    setDevMode(true); // デバッグのため開発モードを有効化
  });

  describe('基本的な式評価', () => {
    it('文字列リテラルを評価できること', () => {
      expect(evaluateExpressionSafe('"hello"')).toBe('hello');
    });

    it('数値リテラルを評価できること', () => {
      expect(evaluateExpressionSafe('42')).toBe(42);
    });

    it('真偽値リテラルを評価できること', () => {
      expect(evaluateExpressionSafe('true')).toBe(true);
      expect(evaluateExpressionSafe('false')).toBe(false);
    });

    it('スコープの値を参照できること', () => {
      const scope = {name: '花子', age: 25};
      expect(evaluateExpressionSafe('name', scope)).toBe('花子');
      expect(evaluateExpressionSafe('age', scope)).toBe(25);
    });

    it('ネストされたオブジェクトを参照できること', () => {
      const scope = {user: {name: '太郎', profile: {age: 30}}};
      expect(evaluateExpressionSafe('user.name', scope)).toBe('太郎');
      expect(evaluateExpressionSafe('user.profile.age', scope)).toBe(30);
    });
  });

  describe('式の演算', () => {
    it('文字列連結ができること', () => {
      const scope = {name: '花子'};
      expect(evaluateExpressionSafe('name + "さん"', scope)).toBe('花子さん');
    });

    it('数値演算ができること', () => {
      const scope = {a: 10, b: 5};
      expect(evaluateExpressionSafe('a + b', scope)).toBe(15);
      expect(evaluateExpressionSafe('a - b', scope)).toBe(5);
      expect(evaluateExpressionSafe('a * b', scope)).toBe(50);
      expect(evaluateExpressionSafe('a / b', scope)).toBe(2);
    });

    it('演算子の優先順位が正しく動作すること', () => {
      const scope = {a: 1, b: 3};
      expect(evaluateExpressionSafe('a + b * 2', scope)).toBe(7);
    });

    it('比較演算ができること', () => {
      const scope = {age: 20, score: 75};
      expect(evaluateExpressionSafe('age >= 18', scope)).toBe(true);
      expect(evaluateExpressionSafe('score >= 60', scope)).toBe(true);
    });

    it('三項演算子が使えること', () => {
      const scope = {isAdmin: true, name: '管理者', score: 75};
      expect(evaluateExpressionSafe('isAdmin ? name + "（管理）" : name', scope))
          .toBe('管理者（管理）');
      expect(evaluateExpressionSafe('score >= 60 ? "pass" : "fail"', scope))
          .toBe('pass');
    });

    it('論理演算ができること', () => {
      const scope = {a: true, b: false};
      expect(evaluateExpressionSafe('a && b', scope)).toBe(false);
      expect(evaluateExpressionSafe('a || b', scope)).toBe(true);
      expect(evaluateExpressionSafe('!a', scope)).toBe(false);
    });
  });

  describe('セキュリティ対策', () => {
    it('禁止識別子がundefinedになること', () => {
      expect(evaluateExpressionSafe('window')).toBe(undefined);
      expect(evaluateExpressionSafe('document')).toBe(undefined);
      expect(evaluateExpressionSafe('alert')).toBe(undefined);
      expect(evaluateExpressionSafe('eval')).toBe(undefined);
      expect(evaluateExpressionSafe('Function')).toBe(undefined);
    });

    it('危険な関数呼び出しがnullになること', () => {
      // これらの関数は undefined なので呼び出せずエラーになり、nullが返される
      expect(evaluateExpressionSafe('alert("test")')).toBe(null);
      expect(evaluateExpressionSafe('eval("1+1")')).toBe(null);
    });

    it('スコープ内の値が禁止識別子を上書きできること', () => {
      const scope = {window: 'safe-value'};
      expect(evaluateExpressionSafe('window', scope)).toBe('safe-value');
    });

    it('evalを使った様々な攻撃パターンを防げること', () => {
      // 直接のeval参照
      expect(evaluateExpressionSafe('eval')).toBe(undefined);
      
      // eval関数呼び出し
      expect(evaluateExpressionSafe('eval("alert(1)")')).toBe(null);
      expect(evaluateExpressionSafe('eval("1+1")')).toBe(null);
      expect(evaluateExpressionSafe('eval("console.log(1)")')).toBe(null);
      
      // 間接的なeval参照の試み
      expect(evaluateExpressionSafe('window.eval')).toBe(null);
      expect(evaluateExpressionSafe('globalThis.eval')).toBe(null);
      
      // evalをスコープで上書きしても安全であること
      const scope = {eval: 'safe-eval'};
      expect(evaluateExpressionSafe('eval', scope)).toBe('safe-eval');
    });

    it('argumentsを使った攻撃パターンを防げること', () => {
      // 直接のarguments参照
      expect(evaluateExpressionSafe('arguments')).toBe(undefined);
      
      // arguments経由での脱出試行
      expect(evaluateExpressionSafe('arguments[0]')).toBe(null);
      expect(evaluateExpressionSafe('arguments.callee')).toBe(null);
      
      // argumentsをスコープで上書きしても安全であること
      const scope = {arguments: 'safe-arguments'};
      expect(evaluateExpressionSafe('arguments', scope)).toBe('safe-arguments');
    });
  });

  describe('エラーハンドリング', () => {
    it('空文字列の場合nullを返すこと', () => {
      expect(evaluateExpressionSafe('')).toBe(null);
      expect(evaluateExpressionSafe('   ')).toBe(null);
    });

    it('不正な型の場合nullを返すこと', () => {
      expect(evaluateExpressionSafe(null as any)).toBe(null);
      expect(evaluateExpressionSafe(undefined as any)).toBe(null);
      expect(evaluateExpressionSafe(123 as any)).toBe(null);
    });

    it('構文エラーの場合nullを返すこと', () => {
      expect(evaluateExpressionSafe('unclosed"')).toBe(null);
      expect(evaluateExpressionSafe('{')).toBe(null);
      expect(evaluateExpressionSafe('name +')).toBe(null);
    });

    it('存在しない変数参照の場合undefinedを返すこと', () => {
      // 仕様書13.1：未定義変数はundefinedとして扱われる
      // 空文字列への変換は表示層で行われる
      expect(evaluateExpressionSafe('nonExistentVar')).toBe(undefined);
      expect(evaluateExpressionSafe('undefinedVar')).toBe(undefined);
      expect(evaluateExpressionSafe('user.age')).toBe(undefined);
    });

    it('開発モード時にエラーログを出力すること', () => {
      setDevMode(true);
      const originalWarn = console.warn;
      const mockWarn = vi.fn();
      console.warn = mockWarn;

      try {
        evaluateExpressionSafe('invalid syntax');
        expect(mockWarn).toHaveBeenCalled();
      } finally {
        console.warn = originalWarn;
      }
    });
  });

  describe('キャッシュ機能', () => {
    it('同じ式は関数がキャッシュされること', () => {
      const expression = 'name + "さん"';
      const scope = {name: '花子'};

      expect(getExpressionCacheSize()).toBe(0);

      evaluateExpressionSafe(expression, scope);
      expect(getExpressionCacheSize()).toBe(1);

      // 同じ式と同じスコープキーを再実行してもキャッシュサイズは変わらない
      evaluateExpressionSafe(expression, scope);
      expect(getExpressionCacheSize()).toBe(1);

      // 異なる式は新しいキャッシュが作られる
      evaluateExpressionSafe('age', {age: 25});
      expect(getExpressionCacheSize()).toBe(2);
    });

    it('異なる式は別々にキャッシュされること', () => {
      evaluateExpressionSafe('a + b', {a: 1, b: 2});
      evaluateExpressionSafe('c + d', {c: 3, d: 4});
      
      expect(getExpressionCacheSize()).toBe(2);
    });

    it('キャッシュクリア機能が動作すること', () => {
      evaluateExpressionSafe('test');
      expect(getExpressionCacheSize()).toBe(1);

      clearExpressionCache();
      expect(getExpressionCacheSize()).toBe(0);
    });
  });

  describe('複雑な使用例', () => {
    it('複数のスコープレベルで動作すること', () => {
      const scope = {
        user: {
          name: '田中',
          settings: {
            theme: 'dark',
            notifications: true,
          },
        },
        isAdmin: false,
      };

      expect(evaluateExpressionSafe(
          'user.name + (isAdmin ? " (管理者)" : "")',
          scope,
      )).toBe('田中');

      expect(evaluateExpressionSafe(
          'user.settings.theme === "dark" ? "ダークモード" : "ライトモード"',
          scope,
      )).toBe('ダークモード');
    });

    it('配列やオブジェクトの操作ができること', () => {
      const scope = {
        items: ['apple', 'banana', 'cherry'],
        count: 3,
      };

      expect(evaluateExpressionSafe('items[0]', scope)).toBe('apple');
      expect(evaluateExpressionSafe('items.length', scope)).toBe(3);
      expect(evaluateExpressionSafe('count > items.length', scope)).toBe(false);
    });
  });
});
