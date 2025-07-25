/**
 * @fileoverview 式評価エンジン
 *
 * 式評価システムです。
 * XSS攻撃やコードインジェクションを防ぐためのセキュリティ機能と、
 * パフォーマンス向上のためのキャッシュ機能を提供します。
 */

import {Log} from './log';

export class Expression {
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
      try {
        const body =
          '"use strict";\n' + `${this.assignments};\nreturn (${expression});`;
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
      bindKeys.forEach((key: string) => {
        argValues.push(bindedValues[key]);
      });
      return evaluator(...argValues);
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
    const dangerousPatterns = [
      /\beval\s*\(/, // eval(...)
      /\barguments\s*\[/, // arguments[...]
      /\barguments\s*\./, // arguments.xxx
    ];
    return dangerousPatterns.some(pattern => pattern.test(expression));
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
