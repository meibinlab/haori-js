/* @vitest-environment jsdom */
/**
 * @fileoverview Expression（式評価エンジン）のセキュリティテスト
 */
import {describe, it, expect, vi} from 'vitest';
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

    it('文字列キーのブラケットアクセスを評価できる', () => {
      const result = Expression.evaluate('user["name"]', {
        user: {name: '田中'},
      });
      expect(result).toBe('田中');
    });

    it('動的インデックスのブラケットアクセスを評価できる', () => {
      const result = Expression.evaluate('items[index]', {
        items: ['a', 'b', 'c'],
        index: 1,
      });
      expect(result).toBe('b');
    });

    it('式を含む動的インデックスを評価できる', () => {
      const result = Expression.evaluate('items[index + 1]', {
        items: ['a', 'b', 'c'],
        index: 0,
      });
      expect(result).toBe('b');
    });

    it('optional chaining を評価できる', () => {
      const result = Expression.evaluate('user?.name', {
        user: {name: '田中'},
      });
      expect(result).toBe('田中');
    });

    it('optional chaining と動的キーを組み合わせて評価できる', () => {
      const result = Expression.evaluate('user?.[key]', {
        user: {name: '田中'},
        key: 'name',
      });
      expect(result).toBe('田中');
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

    it('バインド値に constructor キーが含まれると null を返す', () => {
      const result = Expression.evaluate('x', {x: 1, constructor: {}});
      expect(result).toBeNull();
    });

    it('バインド値に location キーが含まれる場合は明示バインド値を利用できる', () => {
      const result = Expression.evaluate('location', {
        location: '東京都千代田区',
      });
      expect(result).toBe('東京都千代田区');
    });

    it('ネストした plain object の window キーは許可される', () => {
      const result = Expression.evaluate('ctx.window.label', {
        ctx: {window: {label: 'safe-window'}},
      });
      expect(result).toBe('safe-window');
    });

    it('ネストした window 実体は拒否する', () => {
      const result = Expression.evaluate('ctx.window.location.href', {
        ctx: {window},
      });
      expect(result).toBeNull();
    });

    it('ネストした document 実体は拒否する', () => {
      const result = Expression.evaluate('ctx.document.title', {
        ctx: {document},
      });
      expect(result).toBeNull();
    });

    it('禁止キーがないバインド値は正常に評価される', () => {
      const result = Expression.evaluate('user.name', {
        user: {name: '田中', age: 30},
      });
      expect(result).toBe('田中');
    });

    it('ネストしたオブジェクトの location プロパティは評価できる', () => {
      const result = Expression.evaluate('project.location', {
        project: {location: '東京都千代田区'},
      });
      expect(result).toBe('東京都千代田区');
    });

    it('配列要素内の location プロパティも評価できる', () => {
      const result = Expression.evaluate('content[0].location', {
        content: [{location: '東京都港区'}],
      });
      expect(result).toBe('東京都港区');
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

    it('同じバインド参照を同一 microtask 内で再評価すると危険値チェックを再帰し直さない', () => {
      const containsForbiddenBindingValuesSpy = vi.spyOn(
        Expression as unknown as {
          containsForbiddenBindingValues: (
            obj: unknown,
            seen?: WeakSet<object>,
            forbiddenBindingValues?: ReadonlySet<unknown>,
          ) => boolean;
        },
        'containsForbiddenBindingValues',
      );
      const bindedValues = {
        user: {
          profile: {
            name: '田中',
          },
        },
        items: [
          {id: 1, label: 'A'},
          {id: 2, label: 'B'},
        ],
      };

      expect(Expression.evaluate('user.profile.name', bindedValues)).toBe('田中');
      const firstCallCount = containsForbiddenBindingValuesSpy.mock.calls.length;

      expect(Expression.evaluate('items[1].label', bindedValues)).toBe('B');
      const secondCallCount =
        containsForbiddenBindingValuesSpy.mock.calls.length - firstCallCount;

      expect(firstCallCount).toBeGreaterThan(1);
      expect(secondCallCount).toBe(1);

      containsForbiddenBindingValuesSpy.mockRestore();
    });

    it('危険値チェックのキャッシュは次の microtask で破棄される', async () => {
      const bindedValues: {
        ctx: {label: string} | {document: Document};
      } = {
        ctx: {label: 'safe'},
      };

      expect(Expression.evaluate('ctx.label', bindedValues)).toBe('safe');

      await Promise.resolve();

      bindedValues.ctx = {document};

      expect(Expression.evaluate('ctx.document.title', bindedValues)).toBeNull();
    });
  });

  describe('禁止識別子のフィルタリング', () => {
    it('location は明示バインドされていない場合は引き続きブロックされる', () => {
      const result = Expression.evaluate('location', {});
      expect(result).toBeUndefined();
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

    it('Date インスタンスのメソッド呼び出しを評価できる', () => {
      const when = new Date('2024-01-02T03:04:05.000Z');
      const result = Expression.evaluate('when.getTime()', {when});
      expect(result).toBe(when.getTime());
    });

    it('Map インスタンスのメソッド呼び出しを評価できる', () => {
      const result = Expression.evaluate('mapping.get("name")', {
        mapping: new Map([['name', '田中']]),
      });
      expect(result).toBe('田中');
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

    it('配列メソッド内でオブジェクトリテラルを返せる', () => {
      const result = Expression.evaluate(
        'items.map(item => ({value: item, even: item % 2 === 0}))',
        {
          items: [1, 2, 3],
        },
      );
      expect(result).toEqual([
        {value: 1, even: false},
        {value: 2, even: true},
        {value: 3, even: false},
      ]);
    });

    it('ページネーション向けの reduce + オブジェクトリテラル連鎖を評価できる', () => {
      const result = Expression.evaluate(
        'Array(totalPages).fill(0).map((_, i) => i).filter(i => i === 0 || i === totalPages - 1 || (i >= number - 2 && i <= number + 2)).reduce((acc, page) => acc.length > 0 && page > acc[acc.length - 1] + 1 ? [...acc, -acc.length, page] : [...acc, page], []).map(page => ({page, active: page >= 0 && page === number, ellipsis: page < 0}))',
        {
          totalPages: 10,
          number: 4,
        },
      );
      expect(result).toEqual([
        {page: 0, active: false, ellipsis: false},
        {page: -1, active: false, ellipsis: true},
        {page: 2, active: false, ellipsis: false},
        {page: 3, active: false, ellipsis: false},
        {page: 4, active: true, ellipsis: false},
        {page: 5, active: false, ellipsis: false},
        {page: 6, active: false, ellipsis: false},
        {page: -7, active: false, ellipsis: true},
        {page: 9, active: false, ellipsis: false},
      ]);
    });

    it('スプレッド構文を含むメソッド呼び出しを評価できる', () => {
      const result = Expression.evaluate('Math.max(...scores)', {
        scores: [10, 3, 7],
      });
      expect(result).toBe(10);
    });

    it('配列メソッド内のアロー関数とプロパティアクセスを評価できる', () => {
      const result = Expression.evaluate(
        'items.filter(item => item.active).length',
        {
          items: [
            {active: true},
            {active: false},
            {active: true},
          ],
        },
      );
      expect(result).toBe(2);
    });
  });

  describe('セキュリティ: constructor 経由の脱出防止', () => {
    it('object literal の識別子キーで constructor をブロックする', () => {
      const result = Expression.evaluate('({constructor: 1})', {});
      expect(result).toBeNull();
    });

    it('object literal の文字列キーで __proto__ をブロックする', () => {
      const result = Expression.evaluate('({"__proto__": {polluted: true}})', {});
      expect(result).toBeNull();
    });

    it('object literal の Unicode escape 文字列キーで __proto__ をブロックする', () => {
      const result = Expression.evaluate(
        '({"\\u{5f}\\u{5f}proto__": {polluted: true}})',
        {},
      );
      expect(result).toBeNull();
    });

    it('object literal の computed key をブロックする', () => {
      const result = Expression.evaluate('({["prototype"]: 1})', {});
      expect(result).toBeNull();
    });

    it('object literal の getter で __proto__ をブロックする', () => {
      const result = Expression.evaluate('({get __proto__(){x}})', {});
      expect(result).toBeNull();
    });

    it('object literal の setter で constructor をブロックする', () => {
      const result = Expression.evaluate('({set constructor(v){x}})', {});
      expect(result).toBeNull();
    });

    it('object literal の getter で prototype をブロックする', () => {
      const result = Expression.evaluate('({get prototype(){x}})', {});
      expect(result).toBeNull();
    });

    it('object literal の async method で constructor をブロックする', () => {
      const result = Expression.evaluate('({async constructor(){}})', {});
      expect(result).toBeNull();
    });

    it('ドット記法の constructor 呼び出しをブロックする', () => {
      const result = Expression.evaluate('[].filter.constructor(\'return this\')()', {});
      expect(result).toBeNull();
    });

    it('ブラケット記法の constructor 呼び出しをブロックする', () => {
      const result = Expression.evaluate(
        '[]["filter"]["constructor"]("return this")()',
        {},
      );
      expect(result).toBeNull();
    });

    it('危険なプロトタイプアクセスをブロックする', () => {
      expect(Expression.evaluate('user.constructor', {user: {name: '田中'}})).toBeNull();
      expect(Expression.evaluate('user["__proto__"]', {user: {name: '田中'}})).toBeNull();
    });

    it('変数経由の computed constructor アクセスをブロックする', () => {
      const result = Expression.evaluate(
        'items.filter[key]("return this")()',
        {
          items: [1, 2, 3],
          key: 'constructor',
        },
      );
      expect(result).toBeNull();
    });

    it('Reflect 経由の constructor 取得をブロックする', () => {
      const result = Expression.evaluate(
        'Reflect.get(Reflect.get([], "filter"), "constructor")("return 7")()',
        {},
      );
      expect(result).toBeNull();
    });

    it('関数戻り値経由の computed constructor アクセスをブロックする', () => {
      const result = Expression.evaluate(
        'fn()[key]("return 7")()',
        {
          fn: () => ({constructor: Function}),
          key: 'constructor',
        },
      );
      expect(result).toBeNull();
    });
  });
});
