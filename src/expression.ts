/**
 * @fileoverview 式評価エンジン
 *
 * 式評価システムです。
 * XSS攻撃やコードインジェクションを防ぐためのセキュリティ機能と、
 * パフォーマンス向上のためのキャッシュ機能を提供します。
 */

import Log from './log';

type ExpressionTokenType = 'identifier' | 'number' | 'string' | 'operator';

interface ExpressionToken {
  type: ExpressionTokenType;
  value: string;
  position: number;
}

type GroupContext = 'paren' | 'array' | 'member';

export default class Expression {
  /** Haoriで禁止すべき識別子一覧（eval と arguments は strict モードで無効化） */
  private static readonly FORBIDDEN_NAMES = [
    // グローバルオブジェクト
    'window',
    'self',
    'globalThis',
    'frames',
    'parent',
    'top',
    // 危険な関数/オブジェクト
    'Function',
    'setTimeout',
    'setInterval',
    'requestAnimationFrame',
    'alert',
    'confirm',
    'prompt',
    'fetch',
    'XMLHttpRequest',
    'Reflect',
    // 脱出経路・プロトタイプ
    'constructor',
    '__proto__',
    'prototype',
    'Object',
    // その他
    'document',
    'location',
    'navigator',
    'localStorage',
    'sessionStorage',
    'IndexedDB',
    'history',
  ];

  /** strict モードで禁止される識別子 */
  private static readonly STRICT_FORBIDDEN_NAMES = ['eval', 'arguments'];

  /** プロパティアクセスで拒否する名前 */
  private static readonly FORBIDDEN_PROPERTY_NAMES = new Set([
    'constructor',
    '__proto__',
    'prototype',
  ]);

  /** 式構文として許可しない予約語 */
  private static readonly DISALLOWED_KEYWORDS = new Set([
    'await',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'export',
    'finally',
    'for',
    'function',
    'if',
    'import',
    'in',
    'instanceof',
    'let',
    'new',
    'return',
    'switch',
    'this',
    'throw',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'with',
    'yield',
  ]);

  /** 式 → 評価関数のグローバルキャッシュ */
  private static readonly EXPRESSION_CACHE = new Map<
    string,
    (...args: unknown[]) => unknown
  >();

  /** 評価関数の前に実行されるコード */
  private static assignments: string;

  static {
    // static初期化ブロック
    const lines: string[] = [];
    this.FORBIDDEN_NAMES.forEach((name: string) => {
      lines.push(`const ${name} = undefined`);
    });
    this.assignments = lines.join(';\n');
  }

  /**
   * 式を評価します。
   *
   * @param expression 評価する式文字列
   * @param bindedValue バインドされた値のオブジェクト
   */
  public static evaluate(
    expression: string,
    bindedValues: Record<string, unknown> = {},
  ): unknown {
    if (expression.trim() === '') {
      Log.warn('[Haori]', expression, 'Expression is empty');
      return null;
    }
    if (this.containsDangerousPatterns(expression)) {
      Log.warn('[Haori]', expression, 'Expression contains dangerous patterns');
      return null;
    }
    if (this.containsForbiddenKeys(bindedValues)) {
      Log.warn('[Haori]', bindedValues, 'Binded values contain forbidden keys');
      return null;
    }

    const bindKeys = Object.keys(bindedValues)
      .filter(
        key =>
          !this.FORBIDDEN_NAMES.includes(key) &&
          !this.STRICT_FORBIDDEN_NAMES.includes(key),
      )
      .sort();
    const cacheKey = `${expression}:${bindKeys.join(',')}`;

    let evaluator = this.EXPRESSION_CACHE.get(cacheKey);
    if (!evaluator) {
      const body =
        '"use strict";\n' + `${this.assignments};\nreturn (${expression});`;
      try {
        evaluator = new Function(...bindKeys, body) as (
          ...args: unknown[]
        ) => unknown;
        this.EXPRESSION_CACHE.set(cacheKey, evaluator);
      } catch (error) {
        Log.error(
          '[Haori]',
          'Failed to compile expression:',
          expression,
          error,
        );
        return null;
      }
    }
    try {
      const argValues: unknown[] = [];
      const wrappedValues = this.wrapBoundValues(bindedValues);
      bindKeys.forEach((key: string) => {
        argValues.push(wrappedValues[key]);
      });
      return this.withBlockedPropertyAccess(() => evaluator(...argValues));
    } catch (error) {
      Log.error('[Haori]', 'Expression evaluation error:', expression, error);
      if (error instanceof ReferenceError) {
        // ReferenceError（未定義変数）はundefinedを返す
        return undefined;
      }
      return null;
    }
  }

  /**
   * 式にevalや危険な構文が含まれているかチェックします。
   *
   * @param expression チェック対象の式文字列
   * @return 危険なパターンが含まれている場合はtrue
   */
  protected static containsDangerousPatterns(expression: string): boolean {
    if (!this.hasAllowedSyntax(expression)) {
      return true;
    }
    const dangerousPatterns = [
      /\beval\s*\(/, // eval(...)
      /\barguments\s*\[/, // arguments[...]
      /\barguments\s*\./, // arguments.xxx
    ];
    return dangerousPatterns.some(pattern => pattern.test(expression));
  }

  /**
   * 許可する式構文かどうかを検証します。
   *
   * @param expression 検証対象の式
   * @returns 許可する構文であればtrue
   */
  private static hasAllowedSyntax(expression: string): boolean {
    const tokens = this.tokenizeExpression(expression);
    if (tokens === null || tokens.length === 0) {
      return false;
    }

    const groups: GroupContext[] = [];
    let previous: ExpressionToken | null = null;

    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      const next = tokens[index + 1] || null;

      const activeGroup = groups[groups.length - 1] || null;

      if (token.type === 'identifier') {
        if (this.DISALLOWED_KEYWORDS.has(token.value)) {
          return false;
        }
        if (this.STRICT_FORBIDDEN_NAMES.includes(token.value)) {
          return false;
        }
        if (
          (previous?.value === '.' || previous?.value === '?.') &&
          this.FORBIDDEN_PROPERTY_NAMES.has(token.value)
        ) {
          return false;
        }
      }

      if (activeGroup === 'member' && token.value !== ']') {
        if (
          token.type === 'string' &&
          this.FORBIDDEN_PROPERTY_NAMES.has(
            this.decodeStringLiteral(token.value),
          )
        ) {
          return false;
        }
      }

      if (token.value === '.' && next?.type !== 'identifier') {
        return false;
      }

      if (
        token.value === '?.' &&
        next?.type !== 'identifier' &&
        next?.value !== '[' &&
        next?.value !== '('
      ) {
        return false;
      }

      switch (token.value) {
        case '(':
          groups.push('paren');
          break;
        case ')': {
          const group = groups.pop();
          if (group !== 'paren') {
            return false;
          }
          break;
        }
        case '[': {
          const group: GroupContext = this.startsMemberAccess(previous)
            ? 'member'
            : 'array';
          groups.push(group);
          break;
        }
        case ']': {
          const group = groups.pop();
          if (group === undefined) {
            return false;
          }
          break;
        }
      }

      previous = token;
    }

    return groups.length === 0;
  }

  /**
   * 式をトークン列に分解します。
   *
   * @param expression 評価前に検証する式
   * @returns 分解結果。未対応構文を含む場合はnull
   */
  private static tokenizeExpression(
    expression: string,
  ): ExpressionToken[] | null {
    const tokens: ExpressionToken[] = [];
    const operators = [
      '===',
      '!==',
      '...',
      '?.',
      '&&',
      '||',
      '>=',
      '<=',
      '==',
      '!=',
      '=>',
    ];
    const singleCharacters = new Set([
      '(',
      ')',
      '[',
      ']',
      '.',
      ',',
      '?',
      ':',
      '+',
      '-',
      '*',
      '/',
      '%',
      '!',
      '>',
      '<',
    ]);
    let index = 0;

    while (index < expression.length) {
      const current = expression[index];

      if (/\s/.test(current)) {
        index += 1;
        continue;
      }

      if (
        current === '/' &&
        (expression[index + 1] === '/' || expression[index + 1] === '*')
      ) {
        return null;
      }

      if (current === '"' || current === '\'') {
        const stringToken = this.readStringToken(expression, index);
        if (stringToken === null) {
          return null;
        }
        tokens.push(stringToken.token);
        index = stringToken.nextIndex;
        continue;
      }

      const operator = operators.find(item =>
        expression.startsWith(item, index),
      );
      if (operator) {
        tokens.push({type: 'operator', value: operator, position: index});
        index += operator.length;
        continue;
      }

      if (/[0-9]/.test(current)) {
        const numberToken = this.readNumberToken(expression, index);
        tokens.push(numberToken.token);
        index = numberToken.nextIndex;
        continue;
      }

      if (/[A-Za-z_$]/.test(current)) {
        const identifierToken = this.readIdentifierToken(expression, index);
        tokens.push(identifierToken.token);
        index = identifierToken.nextIndex;
        continue;
      }

      if (singleCharacters.has(current)) {
        tokens.push({type: 'operator', value: current, position: index});
        index += 1;
        continue;
      }

      return null;
    }

    return tokens;
  }

  /**
   * 文字列リテラルを読み取ります。
   *
   * @param expression 式全体
   * @param start 開始位置
   * @returns トークンと次の位置
   */
  private static readStringToken(
    expression: string,
    start: number,
  ): {token: ExpressionToken; nextIndex: number} | null {
    const quote = expression[start];
    let index = start + 1;

    while (index < expression.length) {
      const current = expression[index];
      if (current === '\\') {
        index += 2;
        continue;
      }
      if (current === quote) {
        return {
          token: {
            type: 'string',
            value: expression.slice(start, index + 1),
            position: start,
          },
          nextIndex: index + 1,
        };
      }
      index += 1;
    }

    return null;
  }

  /**
   * 数値リテラルを読み取ります。
   *
   * @param expression 式全体
   * @param start 開始位置
   * @returns トークンと次の位置
   */
  private static readNumberToken(
    expression: string,
    start: number,
  ): {token: ExpressionToken; nextIndex: number} {
    let index = start;
    while (index < expression.length && /[0-9_]/.test(expression[index])) {
      index += 1;
    }
    if (expression[index] === '.') {
      index += 1;
      while (index < expression.length && /[0-9_]/.test(expression[index])) {
        index += 1;
      }
    }
    return {
      token: {
        type: 'number',
        value: expression.slice(start, index),
        position: start,
      },
      nextIndex: index,
    };
  }

  /**
   * 識別子を読み取ります。
   *
   * @param expression 式全体
   * @param start 開始位置
   * @returns トークンと次の位置
   */
  private static readIdentifierToken(
    expression: string,
    start: number,
  ): {token: ExpressionToken; nextIndex: number} {
    let index = start;
    while (
      index < expression.length &&
      /[A-Za-z0-9_$]/.test(expression[index])
    ) {
      index += 1;
    }
    return {
      token: {
        type: 'identifier',
        value: expression.slice(start, index),
        position: start,
      },
      nextIndex: index,
    };
  }

  /**
   * 角括弧がメンバーアクセスかどうかを判定します。
   *
   * @param previous 直前のトークン
   * @returns メンバーアクセスであればtrue
   */
  private static startsMemberAccess(previous: ExpressionToken | null): boolean {
    if (previous === null) {
      return false;
    }
    if (previous.type === 'identifier' || previous.type === 'number') {
      return true;
    }
    return (
      previous.value === ')' ||
      previous.value === ']' ||
      previous.value === '?.'
    );
  }

  /**
   * 文字列リテラルをプレーン文字列へ変換します。
   *
   * @param literal 文字列リテラル
   * @returns デコード後の文字列
   */
  private static decodeStringLiteral(literal: string): string {
    return literal
      .slice(1, -1)
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) =>
        String.fromCharCode(parseInt(code, 16)),
      )
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, code: string) =>
        String.fromCharCode(parseInt(code, 16)),
      )
      .replace(/\\(["'\\bfnrtv0])/g, (_, escaped: string) => {
        switch (escaped) {
          case 'b':
            return '\b';
          case 'f':
            return '\f';
          case 'n':
            return '\n';
          case 'r':
            return '\r';
          case 't':
            return '\t';
          case 'v':
            return '\v';
          case '0':
            return '\0';
          default:
            return escaped;
        }
      });
  }

  /**
   * バインド値を安全なProxyでラップします。
   *
   * @param bindedValues バインド値
   * @returns ラップ済みのバインド値
   */
  private static wrapBoundValues(
    bindedValues: Record<string, unknown>,
  ): Record<string, unknown> {
    const cache = new WeakMap<object, unknown>();
    const wrappedValues: Record<string, unknown> = {};

    Object.entries(bindedValues).forEach(([key, value]) => {
      wrappedValues[key] = this.wrapBoundValue(value, cache);
    });

    return wrappedValues;
  }

  /**
   * 危険なプロパティアクセスを防ぐために値を再帰的にラップします。
   *
   * @param value ラップ対象の値
   * @param cache 既存Proxyのキャッシュ
   * @returns ラップ済みの値
   */
  private static wrapBoundValue(
    value: unknown,
    cache: WeakMap<object, unknown>,
  ): unknown {
    if (!this.shouldWrapValue(value)) {
      return value;
    }

    const target = value as object;
    const cachedValue = cache.get(target);
    if (cachedValue !== undefined) {
      return cachedValue;
    }

    const proxy = new Proxy(target, {
      get: (currentTarget, property, receiver) => {
        if (
          typeof property === 'string' &&
          this.FORBIDDEN_PROPERTY_NAMES.has(property)
        ) {
          return undefined;
        }
        const result = Reflect.get(currentTarget, property, receiver);
        if (typeof property === 'symbol') {
          return result;
        }
        return this.wrapBoundValue(
          result,
          cache,
        );
      },
      has: (currentTarget, property) => {
        if (
          typeof property === 'string' &&
          this.FORBIDDEN_PROPERTY_NAMES.has(property)
        ) {
          return false;
        }
        return Reflect.has(currentTarget, property);
      },
      getOwnPropertyDescriptor: (currentTarget, property) => {
        if (
          typeof property === 'string' &&
          this.FORBIDDEN_PROPERTY_NAMES.has(property)
        ) {
          return undefined;
        }
        return Reflect.getOwnPropertyDescriptor(currentTarget, property);
      },
      apply: (currentTarget, thisArg, argArray) => {
        const result = Reflect.apply(
          currentTarget as (...args: unknown[]) => unknown,
          thisArg,
          argArray,
        );
        if (this.isIteratorLike(result)) {
          return result;
        }
        return this.wrapBoundValue(result, cache);
      },
      construct: (currentTarget, argArray, newTarget) => {
        return this.wrapBoundValue(
          Reflect.construct(
            currentTarget as new (...args: unknown[]) => object,
            argArray,
            newTarget,
          ),
          cache,
        ) as object;
      },
    });

    cache.set(target, proxy);
    return proxy;
  }

  /**
   * Proxy ラップ対象の値かどうかを判定します。
   *
   * @param value 判定対象
   * @returns ラップ対象であればtrue
   */
  private static shouldWrapValue(value: unknown): value is object {
    if (typeof value === 'function') {
      return true;
    }
    if (value === null || typeof value !== 'object') {
      return false;
    }
    if (Array.isArray(value)) {
      return true;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  /**
   * 評価中のみ prototype 系プロパティへの生アクセスを抑止します。
   *
   * @param callback 実行する処理
   * @returns 処理結果
   */
  private static withBlockedPropertyAccess<T>(callback: () => T): T {
    const blockedDescriptors = [
      {target: Object.prototype, property: 'constructor'},
      {target: Function.prototype, property: 'constructor'},
      {target: Object.prototype, property: '__proto__'},
    ] as const;
    const originals = blockedDescriptors
      .map(item => ({
        ...item,
        descriptor: Object.getOwnPropertyDescriptor(item.target, item.property),
      }))
      .filter(item => item.descriptor?.configurable === true);

    originals.forEach(({target, property}) => {
      Object.defineProperty(target, property, {
        configurable: true,
        enumerable: false,
        get: () => undefined,
        set: () => undefined,
      });
    });

    try {
      return callback();
    } finally {
      originals.forEach(({target, property, descriptor}) => {
        if (descriptor !== undefined) {
          Object.defineProperty(target, property, descriptor);
        }
      });
    }
  }

  /**
   * イテレータ互換オブジェクトかどうかを判定します。
   *
   * @param value 判定対象
   * @returns イテレータ互換であればtrue
   */
  private static isIteratorLike(value: unknown): boolean {
    if (value === null || typeof value !== 'object') {
      return false;
    }

    return typeof (value as Iterator<unknown>).next === 'function';
  }

  /**
   * valuesオブジェクトに禁止識別子が含まれていないか再帰的にチェックします。
   *
   * @param obj チェック対象のオブジェクト
   * @return 禁止識別子が含まれていればtrue
   */
  protected static containsForbiddenKeys(obj: unknown): boolean {
    if (obj && typeof obj === 'object') {
      for (const key of Object.keys(obj as object)) {
        if (this.FORBIDDEN_NAMES.includes(key)) {
          return true;
        }
        if (this.STRICT_FORBIDDEN_NAMES.includes(key)) {
          return true;
        }
        // 再帰的にネストしたオブジェクトもチェック
        if (this.containsForbiddenKeys((obj as Record<string, unknown>)[key])) {
          return true;
        }
      }
    }
    return false;
  }
}
