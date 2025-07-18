/**
 * @fileoverview Haori式評価エンジン - セキュリティ対策付き
 * 
 * ドキュメント仕様に基づいた安全な式評価システムです。
 * XSS攻撃やコードインジェクションを防ぐためのセキュリティ機能と、
 * パフォーマンス向上のためのキャッシュ機能を提供します。
 */

import {logWarning} from './log';

/** スコープオブジェクトの型定義 */
export type Scope = Record<string, unknown>;

/** 式 → 評価関数のグローバルキャッシュ */
const expressionCache = new Map<string, Function>();

/** Haoriで禁止すべき識別子一覧（基本的な禁止識別子） */
const FORBIDDEN_NAMES = [
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

/** 特別な処理が必要な禁止識別子（eval, arguments） */
const SPECIAL_FORBIDDEN_NAMES = ['eval', 'arguments'];

/**
 * 式にevalや危険な構文が含まれているかチェックします。
 * 
 * ただし、単純な識別子参照は許可する（スコープで上書き可能にするため）。
 * 
 * @param expression チェック対象の式文字列
 * @return 危険なパターンが含まれている場合はtrue
 */
function containsDangerousPatterns(expression: string): boolean {
  // eval("code") や arguments[0] のような複雑なパターンのみをブロック
  const dangerousPatterns = [
    /\beval\s*\(/,       // eval(...)
    /\barguments\s*\[/,  // arguments[...]
    /\barguments\s*\./,  // arguments.xxx
  ];

  return dangerousPatterns.some(pattern => pattern.test(expression));
}

/**
 * Haori 式評価関数（安全・高速・キャッシュ対応）です。
 * 
 * @param expression 評価対象の式文字列（例: "name + 'さん'"）
 * @param scope 評価スコープ（data-bindなどから渡される値）
 * @return 評価結果、またはエラー時は null
 */
export function evaluateExpressionSafe(
    expression: string, scope: Scope = {}): unknown {
  try {
    if (typeof expression !== 'string' || expression.trim() === '') {
      logWarning(
          '[Haori: Expression Error]', expression, 'Expression is empty');
      return null;
    }

    // 危険なパターンをチェック
    if (containsDangerousPatterns(expression)) {
      logWarning(
          '[Haori: Expression Error]', expression,
          'Contains dangerous patterns');
      return null;
    }

    // スコープキーを取得してソート（一意のキャッシュキーを生成するため）
    const scopeKeys = Object.keys(scope).sort();
    const cacheKey = `${expression}:${scopeKeys.join(',')}`;

    // キャッシュから評価関数を取得または生成
    let evaluator = expressionCache.get(cacheKey);

    if (!evaluator) {
      // 禁止識別子と重複しないスコープキーのみを引数に使用
      const safeScopeKeys = scopeKeys.filter(
          key => !FORBIDDEN_NAMES.includes(key) &&
              !SPECIAL_FORBIDDEN_NAMES.includes(key));

      // 関数の引数として使用する名前（禁止識別子 + 安全なスコープキー）
      const argNames = [...FORBIDDEN_NAMES, ...safeScopeKeys];

      // strict modeを避けて、動的にスコープを構築
      const assignments: string[] = [];

      // 禁止識別子の代入
      FORBIDDEN_NAMES.forEach((name: string, i: number) => {
        assignments.push(`${name} = arguments[${i}]`);
      });

      // 安全なスコープキーの代入
      safeScopeKeys.forEach((name: string, i: number) => {
        assignments.push(
            `${name} = arguments[${FORBIDDEN_NAMES.length + i}]`);
      });

      // eval と arguments を特別に処理
      if (scopeKeys.includes('eval')) {
        assignments.push(`eval = arguments[${argNames.length}]`);
        argNames.push('_eval_override');
      } else {
        // スコープで上書きされていない場合はundefinedに設定
        assignments.push(`eval = undefined`);
      }

      if (scopeKeys.includes('arguments')) {
        assignments.push(`arguments = arguments[${argNames.length}]`);
        argNames.push('_arguments_override');
      } else {
        // スコープで上書きされていない場合はundefinedに設定
        assignments.push(`arguments = undefined`);
      }

      const body = `
  ${assignments.join(';\n  ')};
  return (${expression});
`;

      evaluator = new Function(...argNames, body);
      expressionCache.set(cacheKey, evaluator);
    }

    // 引数を準備
    const argValues: unknown[] = [];

    // 禁止識別子の値を追加（スコープで上書き可能）
    FORBIDDEN_NAMES.forEach((name: string) => {
      if (scope.hasOwnProperty(name)) {
        argValues.push(scope[name]);  // スコープで上書き
      } else {
        argValues.push(undefined);  // デフォルトは undefined
      }
    });

    // 安全なスコープキーの値を追加
    const safeScopeKeys = Object.keys(scope)
                              .filter(
                                  key => !FORBIDDEN_NAMES.includes(key) &&
                                      !SPECIAL_FORBIDDEN_NAMES.includes(key))
                              .sort();

    safeScopeKeys.forEach(key => {
      argValues.push(scope[key]);
    });

    // eval と arguments の上書き値を追加（スコープに含まれている場合のみ）
    if (Object.keys(scope).includes('eval')) {
      argValues.push(scope['eval']);
    }
    if (Object.keys(scope).includes('arguments')) {
      argValues.push(scope['arguments']);
    }

    return evaluator(...argValues);
  } catch (err) {
    logWarning('[Haori: Expression Error]', expression, err);

    // ReferenceError（未定義変数）はundefinedを返す
    if (err instanceof ReferenceError) {
      return undefined;
    }

    // その他のエラー（構文エラーなど）はnullを返す
    return null;
  }
}

/**
 * 式評価キャッシュをクリアします（テスト用）。
 */
export function clearExpressionCache(): void {
  expressionCache.clear();
}

/**
 * 現在のキャッシュサイズを取得します（デバッグ用）。
 * 
 * @return 現在のキャッシュサイズ
 */
export function getExpressionCacheSize(): number {
  return expressionCache.size;
}
