import {Expression} from '../src/expression';

describe('Expression', () => {
  beforeEach(() => {
    // キャッシュをクリア
    (Expression as any).EXPRESSION_CACHE.clear();
  });

  describe('evaluate', () => {
    describe('基本的な式評価', () => {
      test('数値の計算ができる', () => {
        expect(Expression.evaluate('1 + 2')).toBe(3);
        expect(Expression.evaluate('10 * 5')).toBe(50);
        expect(Expression.evaluate('100 / 4')).toBe(25);
        expect(Expression.evaluate('2 ** 3')).toBe(8);
      });

      test('文字列の評価ができる', () => {
        expect(Expression.evaluate('"hello"')).toBe('hello');
        expect(Expression.evaluate("'world'")).toBe('world');
        expect(Expression.evaluate('"a" + "b"')).toBe('ab');
      });

      test('真偽値の評価ができる', () => {
        expect(Expression.evaluate('true')).toBe(true);
        expect(Expression.evaluate('false')).toBe(false);
        expect(Expression.evaluate('!true')).toBe(false);
        expect(Expression.evaluate('true && false')).toBe(false);
      });

      test('比較演算子が動作する', () => {
        expect(Expression.evaluate('5 > 3')).toBe(true);
        expect(Expression.evaluate('2 < 1')).toBe(false);
        expect(Expression.evaluate('10 === 10')).toBe(true);
        expect(Expression.evaluate('5 !== 3')).toBe(true);
      });

      test('三項演算子が動作する', () => {
        expect(Expression.evaluate('true ? "yes" : "no"')).toBe('yes');
        expect(Expression.evaluate('false ? "yes" : "no"')).toBe('no');
      });
    });

    describe('bindedValues の使用（スコープ仕様に準拠）', () => {
      test('バインドされた値を参照できる', () => {
        const scope = {x: 10, y: 20};
        expect(Expression.evaluate('x + y', scope)).toBe(30);
        expect(Expression.evaluate('x * 2', scope)).toBe(20);
      });

      test('ネストしたオブジェクトを参照できる', () => {
        const scope = {user: {name: 'John', age: 30}};
        expect(Expression.evaluate('user.name', scope)).toBe('John');
        expect(Expression.evaluate('user.age', scope)).toBe(30);
        expect(Expression.evaluate('user.name + "さん"', scope)).toBe(
          'Johnさん',
        );
      });

      test('配列を参照できる', () => {
        const scope = {items: [1, 2, 3], names: ['A', 'B']};
        expect(Expression.evaluate('items[0]', scope)).toBe(1);
        expect(Expression.evaluate('items.length', scope)).toBe(3);
        expect(Expression.evaluate('names.join(",")', scope)).toBe('A,B');
      });

      test('複雑な式でスコープを使用できる', () => {
        const scope = {base: 100, multiplier: 2, addition: 50};
        expect(Expression.evaluate('base * multiplier + addition', scope)).toBe(
          250,
        );
      });

      test('bindedValuesが空の場合でも基本式は動作する', () => {
        expect(Expression.evaluate('1 + 1')).toBe(2);
        expect(Expression.evaluate('1 + 1', {})).toBe(2);
        expect(Expression.evaluate('"hello"')).toBe('hello');
      });

      test('禁止識別子が含まれている場合は評価されない', () => {
        const forbiddenKeys = [
          'window',
          'self',
          'globalThis',
          'Function',
          'constructor',
          '__proto__',
          'prototype',
          'Object',
          'document',
          'location',
          'navigator',
          'localStorage',
          'sessionStorage',
          'IndexedDB',
          'history',
          'eval',
          'arguments',
        ];
        forbiddenKeys.forEach(key => {
          const scope = {[key]: 123};
          expect(Expression.evaluate(key, scope)).toBe(null);
        });
        // ネストした場合も評価されない
        const nested = {safe: {eval: 1}};
        expect(Expression.evaluate('safe.eval', nested)).toBe(null);
        const deepNested = {a: {b: {arguments: 2}}};
        expect(Expression.evaluate('a.b.arguments', deepNested)).toBe(null);
      });

      test('スコープ継承と上書き（仕様通り）', () => {
        // 親スコープ
        const parent = {user: {name: '佐藤', age: 30}};
        // 子スコープ（userを上書き）
        const child = {user: {name: '田中'}};
        // マージルール: userは完全上書き、ageは消える
        expect(Expression.evaluate('user.name', child)).toBe('田中');
        expect(Expression.evaluate('user.age', child)).toBe(undefined);
      });
    });

    describe('セキュリティ機能（禁止識別子の無効化）', () => {
      test('危険なパターンを含む式は評価前に拒否される', () => {
        expect(Expression.evaluate('eval("alert(1)")')).toBe(null);
        expect(Expression.evaluate('arguments[0]')).toBe(null);
        expect(Expression.evaluate('arguments.callee')).toBe(null);
        expect(Expression.evaluate('eval ("1+1")')).toBe(null);
      });

      test('禁止識別子は未定義になる', () => {
        const values = {};

        // グローバルオブジェクト
        expect(Expression.evaluate('typeof window', values)).toBe('undefined');
        expect(Expression.evaluate('typeof document', values)).toBe(
          'undefined',
        );
        expect(Expression.evaluate('typeof globalThis', values)).toBe(
          'undefined',
        );

        // 危険な関数
        expect(Expression.evaluate('typeof Function', values)).toBe(
          'undefined',
        );
        expect(Expression.evaluate('typeof setTimeout', values)).toBe(
          'undefined',
        );
        expect(Expression.evaluate('typeof alert', values)).toBe('undefined');

        // プロトタイプ関連
        expect(Expression.evaluate('typeof constructor', values)).toBe(
          'undefined',
        );
        expect(Expression.evaluate('typeof __proto__', values)).toBe(
          'undefined',
        );
      });

      test('禁止識別子を使った式はundefinedを参照する', () => {
        // これらは評価されるが、禁止識別子はundefinedになる
        expect(Expression.evaluate('window || "safe"')).toBe('safe');
        expect(Expression.evaluate('document || "safe"')).toBe('safe');
        expect(Expression.evaluate('Function || "safe"')).toBe('safe');
      });
    });

    describe('エラーハンドリング', () => {
      test('空の式はnullを返す', () => {
        expect(Expression.evaluate('')).toBe(null);
        expect(Expression.evaluate('   ')).toBe(null);
        expect(Expression.evaluate('\t\n')).toBe(null);
      });

      test('構文エラーはnullを返す', () => {
        expect(Expression.evaluate('1 +')).toBe(null);
        expect(Expression.evaluate('{')).toBe(null);
        expect(Expression.evaluate(')')).toBe(null);
        expect(Expression.evaluate('1 ++')).toBe(null);
      });

      test('ReferenceErrorは仕様通りundefinedを返す', () => {
        expect(Expression.evaluate('nonExistentVariable')).toBe(undefined);
        expect(Expression.evaluate('values.nonExistentProperty')).toBe(
          undefined,
        );
      });

      test('その他のランタイムエラーはnullを返す', () => {
        expect(Expression.evaluate('null.property')).toBe(null);
        expect(Expression.evaluate('undefined.method()')).toBe(null);
      });

      test('null/undefined/NaNの直接評価', () => {
        const values = {empty: null, missing: undefined, invalid: NaN};
        expect(Expression.evaluate('empty', values)).toBe(null);
        expect(Expression.evaluate('missing', values)).toBe(undefined);
        expect(Expression.evaluate('invalid', values)).toBe(NaN);
      });
    });

    describe('キャッシュ機能', () => {
      test('同じ式は2回目以降はキャッシュから取得される', () => {
        const expression = '1 + 2';

        // 1回目の評価
        const result1 = Expression.evaluate(expression);
        expect(result1).toBe(3);

        // 2回目の評価（キャッシュから取得）
        const result2 = Expression.evaluate(expression);
        expect(result2).toBe(3);

        // キャッシュにエントリが存在することを確認
        const cache = (Expression as any).EXPRESSION_CACHE;
        expect(cache.size).toBe(1);
      });

      test('異なる式は別々にキャッシュされる', () => {
        Expression.evaluate('1 + 2');
        Expression.evaluate('3 + 4');
        Expression.evaluate('5 * 6');

        const cache = (Expression as any).EXPRESSION_CACHE;
        expect(cache.size).toBe(3);
      });

      test('同じ式でも異なるbindedValuesで正しく動作する', () => {
        const expression = 'x + y';

        expect(Expression.evaluate(expression, {x: 1, y: 2})).toBe(3);
        expect(Expression.evaluate(expression, {x: 10, y: 20})).toBe(30);

        // キャッシュは式文字列ベースなので1つだけ
        const cache = (Expression as any).EXPRESSION_CACHE;
        expect(cache.size).toBe(1);
      });
    });

    describe('実用的な式パターン', () => {
      test('条件分岐を含む式', () => {
        const values = {status: 'active', count: 5};
        expect(
          Expression.evaluate('status === "active" ? "有効" : "無効"', values),
        ).toBe('有効');
        expect(
          Expression.evaluate('count > 0 ? count + "件" : "なし"', values),
        ).toBe('5件');
      });

      test('配列メソッドの使用', () => {
        const values = {items: [1, 2, 3, 4, 5]};
        expect(Expression.evaluate('items.filter(x => x > 3)', values)).toEqual(
          [4, 5],
        );
        expect(Expression.evaluate('items.map(x => x * 2)', values)).toEqual([
          2, 4, 6, 8, 10,
        ]);
      });

      test('文字列操作', () => {
        const values = {name: 'John', surname: 'Doe'};
        expect(Expression.evaluate('name + " " + surname', values)).toBe(
          'John Doe',
        );
        expect(Expression.evaluate('name.toLowerCase()', values)).toBe('john');
        expect(Expression.evaluate('name.length', values)).toBe(4);
      });

      test('数学計算', () => {
        const values = {price: 1000, tax: 0.1};
        expect(
          Expression.evaluate('Math.round(price * (1 + tax))', values),
        ).toBe(1100);
        expect(Expression.evaluate('Math.max(price, 500)', values)).toBe(1000);
      });
    });
  });

  describe('containsDangerousPatterns', () => {
    describe('eval パターンの検出', () => {
      test('eval関数呼び出しを検出する', () => {
        // protected化対応: as any でアクセス
        expect(
          (Expression as any).containsDangerousPatterns('eval("code")'),
        ).toBe(true);
        expect(
          (Expression as any).containsDangerousPatterns('eval ("code")'),
        ).toBe(true);
        expect(
          (Expression as any).containsDangerousPatterns('eval\t("code")'),
        ).toBe(true);
        expect(
          (Expression as any).containsDangerousPatterns('eval\n("code")'),
        ).toBe(true);
      });

      test('eval文字列を含むが関数呼び出しでないものは検出しない', () => {
        expect(
          (Expression as any).containsDangerousPatterns('evaluation'),
        ).toBe(false);
        expect((Expression as any).containsDangerousPatterns('medieval')).toBe(
          false,
        );
        expect((Expression as any).containsDangerousPatterns('evalData')).toBe(
          false,
        );
      });
    });

    describe('arguments パターンの検出', () => {
      test('arguments配列アクセスを検出する', () => {
        expect(
          (Expression as any).containsDangerousPatterns('arguments[0]'),
        ).toBe(true);
        expect(
          (Expression as any).containsDangerousPatterns('arguments [1]'),
        ).toBe(true);
        expect(
          (Expression as any).containsDangerousPatterns('arguments\t[2]'),
        ).toBe(true);
      });

      test('argumentsプロパティアクセスを検出する', () => {
        expect(
          (Expression as any).containsDangerousPatterns('arguments.callee'),
        ).toBe(true);
        expect(
          (Expression as any).containsDangerousPatterns('arguments.length'),
        ).toBe(true);
        expect(
          (Expression as any).containsDangerousPatterns('arguments .caller'),
        ).toBe(true);
      });

      test('arguments文字列を含むが危険でないものは検出しない', () => {
        expect(
          (Expression as any).containsDangerousPatterns('argumentsArray'),
        ).toBe(false);
        expect(
          (Expression as any).containsDangerousPatterns('functionArguments'),
        ).toBe(false);
        expect(
          (Expression as any).containsDangerousPatterns('myarguments'),
        ).toBe(false);
      });
    });

    describe('安全な式は検出しない', () => {
      test('通常の計算式', () => {
        expect((Expression as any).containsDangerousPatterns('1 + 2')).toBe(
          false,
        );
        expect(
          (Expression as any).containsDangerousPatterns('Math.max(1, 2)'),
        ).toBe(false);
      });

      test('values参照', () => {
        expect(
          (Expression as any).containsDangerousPatterns('values.name'),
        ).toBe(false);
        expect(
          (Expression as any).containsDangerousPatterns('values.items[0]'),
        ).toBe(false);
      });

      test('メソッド呼び出し', () => {
        expect(
          (Expression as any).containsDangerousPatterns(
            'values.text.toUpperCase()',
          ),
        ).toBe(false);
        expect(
          (Expression as any).containsDangerousPatterns(
            'values.arr.filter(x => x > 0)',
          ),
        ).toBe(false);
      });
    });
  });

  describe('static初期化ブロック', () => {
    test('assignments が正しく初期化されている', () => {
      const assignments = (Expression as any).assignments as string;

      // 禁止識別子がundefinedに設定されている
      expect(assignments).toContain('const window = undefined');
      expect(assignments).toContain('const Function = undefined');
      expect(assignments).toContain('const document = undefined');

      // セミコロンで区切られている
      expect(assignments.split(';\n').length).toBeGreaterThan(1);
    });

    test('FORBIDDEN_NAMES の全要素が assignments に含まれている', () => {
      const assignments = (Expression as any).assignments as string;
      const forbiddenNames = (Expression as any).FORBIDDEN_NAMES as string[];

      forbiddenNames.forEach(name => {
        expect(assignments).toContain(`const ${name} = undefined`);
      });
    });
  });
});
