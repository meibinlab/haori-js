/* @vitest-environment jsdom */
/**
 * @fileoverview Expression（式評価エンジン）のセキュリティテスト
 */
import {describe, it, expect} from 'vitest';
import Expression from '../src/expression';

describe('Expression', () => {
  describe('基本的な式評価', () => {
    it('単純な変数参照を評価できる', () => {
      const result = Expression.evaluate('x', {x: 10});
      expect(result).toBe(10);
    });

    it('算術演算を評価できる', () => {
      const result = Expression.evaluate('x + y', {x: 10, y: 20});
      expect(result).toBe(30);
    });

    it('文字列連結を評価できる', () => {
      const result = Expression.evaluate('name + "様"', {name: '田中'});
      expect(result).toBe('田中様');
    });

    it('プロパティアクセスを評価できる', () => {
      const result = Expression.evaluate('user.name', {
        user: {name: '田中'},
      });
      expect(result).toBe('田中');
    });

    it('配列アクセスを評価できる', () => {
      const result = Expression.evaluate('items[0]', {items: ['a', 'b', 'c']});
      expect(result).toBe('a');
    });

    it('メソッド呼び出しを評価できる', () => {
      const result = Expression.evaluate('name.toUpperCase()', {
        name: 'hello',
      });
      expect(result).toBe('HELLO');
    });

    it('三項演算子を評価できる', () => {
      const result = Expression.evaluate('x > 5 ? "large" : "small"', {x: 10});
      expect(result).toBe('large');
    });

    it('空の式はnullを返す', () => {
      const result = Expression.evaluate('', {});
      expect(result).toBeNull();
    });

    it('空白のみの式はnullを返す', () => {
      const result = Expression.evaluate('   ', {});
      expect(result).toBeNull();
    });
  });

  describe('セキュリティ: 危険なパターンのブロック', () => {
    it('eval()パターンをブロックする', () => {
      const result = Expression.evaluate('eval("alert(1)")', {});
      expect(result).toBeNull();
    });

    it('eval()前後のスペースを含むパターンをブロックする', () => {
      const result = Expression.evaluate('eval  ("alert(1)")', {});
      expect(result).toBeNull();
    });

    it('arguments[n]パターンをブロックする', () => {
      const result = Expression.evaluate('arguments[0]', {});
      expect(result).toBeNull();
    });

    it('arguments.xxxパターンをブロックする', () => {
      const result = Expression.evaluate('arguments.length', {});
      expect(result).toBeNull();
    });
  });

  describe('セキュリティ: 禁止識別子の上書き', () => {
    it('windowへのアクセスはundefinedになる', () => {
      const result = Expression.evaluate('window', {});
      expect(result).toBeUndefined();
    });

    it('window.locationへのアクセスはエラーになる', () => {
      const result = Expression.evaluate('window.location', {});
      // windowがundefinedなのでTypeError
      expect(result).toBeNull();
    });

    it('documentへのアクセスはundefinedになる', () => {
      const result = Expression.evaluate('document', {});
      expect(result).toBeUndefined();
    });

    it('globalThisへのアクセスはundefinedになる', () => {
      const result = Expression.evaluate('globalThis', {});
      expect(result).toBeUndefined();
    });

    it('fetchへのアクセスはundefinedになる', () => {
      const result = Expression.evaluate('fetch', {});
      expect(result).toBeUndefined();
    });

    it('Functionへのアクセスはundefinedになる', () => {
      const result = Expression.evaluate('Function', {});
      expect(result).toBeUndefined();
    });

    it('setTimeoutへのアクセスはundefinedになる', () => {
      const result = Expression.evaluate('setTimeout', {});
      expect(result).toBeUndefined();
    });

    it('setIntervalへのアクセスはundefinedになる', () => {
      const result = Expression.evaluate('setInterval', {});
      expect(result).toBeUndefined();
    });

    it('constructorへのアクセスはundefinedになる', () => {
      const result = Expression.evaluate('constructor', {});
      expect(result).toBeUndefined();
    });

    it('__proto__へのアクセスはundefinedになる', () => {
      const result = Expression.evaluate('__proto__', {});
      expect(result).toBeUndefined();
    });

    it('prototypeへのアクセスはundefinedになる', () => {
      const result = Expression.evaluate('prototype', {});
      expect(result).toBeUndefined();
    });

    it('localStorageへのアクセスはundefinedになる', () => {
      const result = Expression.evaluate('localStorage', {});
      expect(result).toBeUndefined();
    });

    it('sessionStorageへのアクセスはundefinedになる', () => {
      const result = Expression.evaluate('sessionStorage', {});
      expect(result).toBeUndefined();
    });

    it('alertへのアクセスはundefinedになる', () => {
      const result = Expression.evaluate('alert', {});
      expect(result).toBeUndefined();
    });

    it('confirmへのアクセスはundefinedになる', () => {
      const result = Expression.evaluate('confirm', {});
      expect(result).toBeUndefined();
    });

    it('promptへのアクセスはundefinedになる', () => {
      const result = Expression.evaluate('prompt', {});
      expect(result).toBeUndefined();
    });
  });

  describe('セキュリティ: バインド値内の禁止識別子チェック', () => {
    it('バインド値にwindowキーが含まれるとnullを返す', () => {
      const result = Expression.evaluate('x', {x: 1, window: {}});
      expect(result).toBeNull();
    });

    it('バインド値にdocumentキーが含まれるとnullを返す', () => {
      const result = Expression.evaluate('x', {x: 1, document: {}});
      expect(result).toBeNull();
    });

    it('バインド値にevalキーが含まれるとnullを返す', () => {
      const result = Expression.evaluate('x', {x: 1, eval: () => {}});
      expect(result).toBeNull();
    });

    it('バインド値にargumentsキーが含まれるとnullを返す', () => {
      const result = Expression.evaluate('x', {x: 1, arguments: []});
      expect(result).toBeNull();
    });

    it('ネストされたオブジェクト内の禁止キーも検出する', () => {
      const result = Expression.evaluate('x', {
        x: 1,
        nested: {window: {}},
      });
      expect(result).toBeNull();
    });

    it('深くネストされたオブジェクト内の禁止キーも検出する', () => {
      const result = Expression.evaluate('x', {
        x: 1,
        level1: {
          level2: {
            level3: {
              document: {},
            },
          },
        },
      });
      expect(result).toBeNull();
    });

    it('禁止キーがないバインド値は正常に評価される', () => {
      const result = Expression.evaluate('user.name', {
        user: {name: '田中', age: 30},
      });
      expect(result).toBe('田中');
    });
  });

  describe('エラーハンドリング', () => {
    it('未定義変数へのアクセスはundefinedを返す', () => {
      const result = Expression.evaluate('undefinedVar', {});
      expect(result).toBeUndefined();
    });

    it('構文エラーのある式はnullを返す', () => {
      const result = Expression.evaluate('x +', {x: 1});
      expect(result).toBeNull();
    });

    it('nullのプロパティアクセスはnullを返す', () => {
      const result = Expression.evaluate('obj.prop', {obj: null});
      expect(result).toBeNull();
    });

    it('undefinedのプロパティアクセスはnullを返す', () => {
      const result = Expression.evaluate('obj.prop', {obj: undefined});
      expect(result).toBeNull();
    });
  });

  describe('キャッシング', () => {
    it('同じ式を複数回評価しても正しい結果を返す', () => {
      const result1 = Expression.evaluate('x + y', {x: 1, y: 2});
      const result2 = Expression.evaluate('x + y', {x: 10, y: 20});
      expect(result1).toBe(3);
      expect(result2).toBe(30);
    });

    it('異なるバインドキーの式は別々にキャッシュされる', () => {
      const result1 = Expression.evaluate('x', {x: 1});
      const result2 = Expression.evaluate('x', {x: 2, y: 3});
      expect(result1).toBe(1);
      expect(result2).toBe(2);
    });

    it('キーの順序が異なっても同じキャッシュを使用する', () => {
      const result1 = Expression.evaluate('a + b', {a: 1, b: 2});
      const result2 = Expression.evaluate('a + b', {b: 20, a: 10});
      expect(result1).toBe(3);
      expect(result2).toBe(30);
    });
  });

  describe('禁止識別子のフィルタリング', () => {
    it('バインド値に禁止識別子があっても式には使用できない', () => {
      // windowキーを含むバインド値は事前にブロックされる
      const result = Expression.evaluate('x', {
        x: 1,
        window: 'should be blocked',
      });
      expect(result).toBeNull();
    });
  });

  describe('複雑な式', () => {
    it('複数の演算子を含む式を評価できる', () => {
      const result = Expression.evaluate('(a + b) * c - d / e', {
        a: 1,
        b: 2,
        c: 3,
        d: 4,
        e: 2,
      });
      expect(result).toBe(7);
    });

    it('論理演算子を含む式を評価できる', () => {
      const result = Expression.evaluate('a && b || c', {
        a: true,
        b: false,
        c: true,
      });
      expect(result).toBe(true);
    });

    it('比較演算子を含む式を評価できる', () => {
      const result = Expression.evaluate('a > b && c <= d', {
        a: 5,
        b: 3,
        c: 2,
        d: 2,
      });
      expect(result).toBe(true);
    });

    it('テンプレートリテラル風の文字列連結を評価できる', () => {
      const result = Expression.evaluate('"Hello, " + name + "!"', {
        name: 'World',
      });
      expect(result).toBe('Hello, World!');
    });

    it('配列メソッドを使用できる', () => {
      const result = Expression.evaluate('items.length', {
        items: [1, 2, 3],
      });
      expect(result).toBe(3);
    });

    it('配列のmapメソッドを使用できる', () => {
      const result = Expression.evaluate('items.map(x => x * 2)', {
        items: [1, 2, 3],
      });
      expect(result).toEqual([2, 4, 6]);
    });

    it('配列のfilterメソッドを使用できる', () => {
      const result = Expression.evaluate('items.filter(x => x > 1)', {
        items: [1, 2, 3],
      });
      expect(result).toEqual([2, 3]);
    });
  });
});
