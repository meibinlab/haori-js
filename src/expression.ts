/**
 * @fileoverview 式評価エンジン
 *
 * 式評価システムです。
 * XSS攻撃やコードインジェクションを防ぐためのセキュリティ機能と、
 * パフォーマンス向上のためのキャッシュ機能を提供します。
 */

import Log from './log';

/**
 * 式評価結果の詳細です。
 */
export interface ExpressionEvaluationDetail {
  /** 評価結果 */
  value: unknown;

  /** 未解決参照が含まれていたかどうか */
  unresolvedReference: boolean;
}

type ExpressionTokenType = 'identifier' | 'number' | 'string' | 'operator';

interface ExpressionToken {
  type: ExpressionTokenType;
  value: string;
  position: number;
}

type GroupContext = 'paren' | 'array' | 'member' | 'object';

export default class Expression {
  /** 危険値チェック結果の短命キャッシュ */
  private static forbiddenBindingValueCache = new WeakMap<object, boolean>();

  /** 危険値チェックキャッシュのクリア予約済みフラグ */
  private static forbiddenBindingValueCacheResetScheduled = false;

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

  /** 明示バインド時のみ利用を許可する衝突名 */
  private static readonly REBINDABLE_FORBIDDEN_NAMES = new Set(['location']);

  /** バインド識別子としては拒否する名前 */
  private static readonly FORBIDDEN_BINDING_NAMES = new Set([
    ...Expression.FORBIDDEN_NAMES.filter(
      name => !Expression.REBINDABLE_FORBIDDEN_NAMES.has(name),
    ),
    'constructor',
    '__proto__',
    'prototype',
    ...Expression.STRICT_FORBIDDEN_NAMES,
  ]);

  /**
   * 明示バインド内に持ち込まれてはならない危険値を返します。
   *
   * @returns 危険値の配列
   */
  private static getForbiddenBindingValues(): unknown[] {
    const scope = globalThis as typeof globalThis & {
      window?: Window;
      document?: Document;
      navigator?: Navigator;
      history?: History;
      localStorage?: Storage;
      sessionStorage?: Storage;
      fetch?: typeof fetch;
    };
    const candidates: unknown[] = [
      scope,
      scope.window,
      scope.document,
      scope.navigator,
      scope.history,
      scope.localStorage,
      scope.sessionStorage,
      scope.fetch,
      scope.Function,
      scope.setTimeout,
      scope.setInterval,
      scope.requestAnimationFrame,
      scope.alert,
      scope.confirm,
      scope.prompt,
    ];
    if (scope.window?.location) {
      candidates.push(scope.window.location);
    }
    return candidates.filter(value => value !== undefined && value !== null);
  }

  /**
   * 現在の評価サイクルで利用する危険値集合を返します。
   *
   * @returns 危険値の集合
   */
  private static getForbiddenBindingValueSet(): ReadonlySet<unknown> {
    return new Set(this.getForbiddenBindingValues());
  }

  /**
   * 危険値チェック用の短命キャッシュを次の microtask で破棄します。
   */
  private static scheduleForbiddenBindingValueCacheReset(): void {
    if (this.forbiddenBindingValueCacheResetScheduled) {
      return;
    }
    this.forbiddenBindingValueCacheResetScheduled = true;
    queueMicrotask(() => {
      this.forbiddenBindingValueCache = new WeakMap<object, boolean>();
      this.forbiddenBindingValueCacheResetScheduled = false;
    });
  }

  /** プロパティアクセスで拒否する名前 */
  private static readonly FORBIDDEN_PROPERTY_NAMES = new Set([
    'constructor',
    '__proto__',
    'prototype',
  ]);

  /** object literal のプロパティ定義で前置修飾子として扱う識別子 */
  private static readonly OBJECT_PROPERTY_MODIFIERS = new Set([
    'get',
    'set',
    'async',
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

  /**
   * 現在のバインド識別子に含まれない禁止グローバルを遮断するコードを生成します。
   *
   * @param bindKeys 現在の式で利用するバインド識別子一覧
   * @returns 評価前に挿入する初期化コード
   */
  private static buildAssignments(bindKeys: string[]): string {
    const bindKeySet = new Set(bindKeys);
    return this.FORBIDDEN_NAMES.filter(name => !bindKeySet.has(name))
      .map(name => `const ${name} = undefined`)
      .join(';\n');
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
    return this.evaluateDetailed(expression, bindedValues).value;
  }

  /**
   * 式を評価し、未解決参照の有無を含む詳細結果を返します。
   *
   * @param expression 評価する式文字列
   * @param bindedValues バインドされた値のオブジェクト
   * @returns 評価結果と未解決参照の有無
   */
  public static evaluateDetailed(
    expression: string,
    bindedValues: Record<string, unknown> = {},
  ): ExpressionEvaluationDetail {
    this.scheduleForbiddenBindingValueCacheReset();
    if (expression.trim() === '') {
      Log.warn('[Haori]', expression, 'Expression is empty');
      return {value: null, unresolvedReference: false};
    }
    if (this.containsDangerousPatterns(expression)) {
      Log.warn('[Haori]', expression, 'Expression contains dangerous patterns');
      return {value: null, unresolvedReference: false};
    }
    if (this.containsForbiddenKeys(bindedValues)) {
      Log.warn('[Haori]', bindedValues, 'Binded values contain forbidden keys');
      return {value: null, unresolvedReference: false};
    }
    const forbiddenBindingValues = this.getForbiddenBindingValueSet();
    if (
      this.containsForbiddenBindingValues(
        bindedValues,
        new WeakSet(),
        forbiddenBindingValues,
      )
    ) {
      Log.warn(
        '[Haori]',
        bindedValues,
        'Binded values contain forbidden values',
      );
      return {value: null, unresolvedReference: false};
    }

    const bindKeys = Object.keys(bindedValues)
      .filter(key => !this.FORBIDDEN_BINDING_NAMES.has(key))
      .sort();
    const cacheKey = `${expression}:${bindKeys.join(',')}`;

    let evaluator = this.EXPRESSION_CACHE.get(cacheKey);
    if (!evaluator) {
      const assignments = this.buildAssignments(bindKeys);
      const body = assignments
        ? '"use strict";\n' + `${assignments};\nreturn (${expression});`
        : '"use strict";\n' + `return (${expression});`;
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
        return {value: null, unresolvedReference: false};
      }
    }
    try {
      const argValues: unknown[] = [];
      const wrappedValues = this.wrapBoundValues(bindedValues);
      bindKeys.forEach((key: string) => {
        argValues.push(wrappedValues[key]);
      });
      return {
        value: this.withBlockedPropertyAccess(() => evaluator(...argValues)),
        unresolvedReference: false,
      };
    } catch (error) {
      Log.error('[Haori]', 'Expression evaluation error:', expression, error);
      if (error instanceof ReferenceError) {
        // ReferenceError（未定義変数）はundefinedを返す
        return {value: undefined, unresolvedReference: true};
      }
      return {value: null, unresolvedReference: false};
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
      const beforePrevious = tokens[index - 2] || null;
      const thirdPrevious = tokens[index - 3] || null;

      if (
        this.startsObjectKey(
          activeGroup,
          previous,
          beforePrevious,
          thirdPrevious,
        )
      ) {
        if (token.value === '[') {
          return false;
        }
        if (
          token.type === 'identifier' &&
          this.FORBIDDEN_PROPERTY_NAMES.has(token.value)
        ) {
          return false;
        }
        if (
          token.type === 'string' &&
          this.FORBIDDEN_PROPERTY_NAMES.has(
            this.decodeStringLiteral(token.value),
          )
        ) {
          return false;
        }
      }

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
        case '{':
          groups.push('object');
          break;
        case ']': {
          const group = groups.pop();
          if (group === undefined) {
            return false;
          }
          break;
        }
        case '}': {
          const group = groups.pop();
          if (group !== 'object') {
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
      '{',
      '}',
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
   * object literal 内で次のトークンがキー位置かどうかを判定します。
   *
   * @param activeGroup 現在のグループ種別
   * @param previous 直前のトークン
   * @returns object literal のキー位置であれば true
   */
  private static startsObjectKey(
    activeGroup: GroupContext | null,
    previous: ExpressionToken | null,
    beforePrevious: ExpressionToken | null,
    thirdPrevious: ExpressionToken | null,
  ): boolean {
    if (activeGroup !== 'object') {
      return false;
    }
    if (previous?.value === '{' || previous?.value === ',') {
      return true;
    }

    if (
      previous?.type === 'identifier' &&
      this.OBJECT_PROPERTY_MODIFIERS.has(previous.value) &&
      (beforePrevious?.value === '{' || beforePrevious?.value === ',')
    ) {
      return true;
    }

    if (previous?.value !== '*') {
      return false;
    }

    if (beforePrevious?.value === '{' || beforePrevious?.value === ',') {
      return true;
    }

    return (
      beforePrevious?.type === 'identifier' &&
      beforePrevious.value === 'async' &&
      (thirdPrevious?.value === '{' || thirdPrevious?.value === ',')
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
      .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, code: string) =>
        String.fromCodePoint(parseInt(code, 16)),
      )
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
        return this.wrapBoundValue(result, cache);
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
   * トップレベルのバインド識別子に拒否対象名が含まれていないかを判定します。
   * ネストしたオブジェクトのプロパティ名は識別子として評価されないため、ここでは拒否しません。
   *
   * @param obj チェック対象のオブジェクト
   * @return 禁止識別子が含まれていればtrue
   */
  protected static containsForbiddenKeys(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') {
      return false;
    }

    for (const key of Object.keys(obj as object)) {
      if (this.FORBIDDEN_BINDING_NAMES.has(key)) {
        return true;
      }
    }

    return false;
  }

  /**
   * バインド値に危険なホストオブジェクトやグローバル関数が含まれていないかを再帰的に判定します。
   *
   * @param obj チェック対象の値
   * @param seen 循環参照検出用の訪問済み集合
   * @return 危険値が含まれていればtrue
   */
  protected static containsForbiddenBindingValues(
    obj: unknown,
    seen: WeakSet<object> = new WeakSet<object>(),
    forbiddenBindingValues: ReadonlySet<unknown> =
    this.getForbiddenBindingValueSet(),
  ): boolean {
    if (!obj || typeof obj !== 'object') {
      return false;
    }

    const cached = this.forbiddenBindingValueCache.get(obj as object);
    if (cached !== undefined) {
      return cached;
    }

    if (seen.has(obj as object)) {
      return false;
    }
    seen.add(obj as object);

    if (forbiddenBindingValues.has(obj)) {
      this.forbiddenBindingValueCache.set(obj as object, true);
      return true;
    }

    for (const value of Object.values(obj as Record<string, unknown>)) {
      if (typeof value === 'function') {
        if (forbiddenBindingValues.has(value)) {
          this.forbiddenBindingValueCache.set(obj as object, true);
          return true;
        }
        continue;
      }
      if (
        this.containsForbiddenBindingValues(value, seen, forbiddenBindingValues)
      ) {
        this.forbiddenBindingValueCache.set(obj as object, true);
        return true;
      }
    }

    this.forbiddenBindingValueCache.set(obj as object, false);
    return false;
  }
}
