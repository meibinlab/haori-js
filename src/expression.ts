/**
 * Haori式評価エンジン - セキュリティ対策付き
 * ドキュメント仕様に基づいた実装
 */

import { logWarning } from './log';

export type Scope = Record<string, any>;

// 式 → 評価関数のグローバルキャッシュ
const expressionCache = new Map<string, Function>();

// Haoriで禁止すべき識別子一覧（strict mode で有効な識別子のみ）
const forbiddenNames = [
  // グローバルオブジェクト
  "window", "self", "globalThis", "frames", "parent", "top",
  // 危険な関数/オブジェクト
  "Function", "setTimeout", "setInterval", "requestAnimationFrame",
  "alert", "confirm", "prompt", "fetch", "XMLHttpRequest",
  // 脱出経路・プロトタイプ
  "constructor", "__proto__", "prototype", "Object",
  // その他
  "document", "location", "navigator", "localStorage", "sessionStorage",
  "IndexedDB", "history"
];

// strict modeで引数名として使用できない特別な識別子
const specialForbiddenNames = ["eval", "arguments"];

/**
 * 式にevalや危険な構文が含まれているかチェック
 */
function containsDangerousPatterns(expression: string): boolean {
  return specialForbiddenNames.some(name => 
    new RegExp(`\\b${name}\\b`).test(expression)
  );
}

/**
 * Haori 式評価関数（安全・高速・キャッシュ対応）
 * @param expression 評価対象の式文字列（例: "name + 'さん'"）
 * @param scope 評価スコープ（data-bindなどから渡される値）
 * @returns 評価結果、またはエラー時は null
 */
export function evaluateExpressionSafe(
  expression: string,
  scope: Scope = {}
): any | null {
  try {
    if (typeof expression !== "string" || expression.trim() === "") {
      logWarning("[Haori: Expression Error]", expression, "Expression is empty");
      return null;
    }

    // 危険なパターンをチェック
    if (containsDangerousPatterns(expression)) {
      logWarning("[Haori: Expression Error]", expression, "Contains dangerous patterns");
      return null;
    }

    // スコープキーを取得してソート（一意のキャッシュキーを生成するため）
    const scopeKeys = Object.keys(scope).sort();
    const cacheKey = `${expression}:${scopeKeys.join(',')}`;

    // キャッシュから評価関数を取得または生成
    let evaluator = expressionCache.get(cacheKey);

    if (!evaluator) {
      const allKeys = [...forbiddenNames, ...scopeKeys];
      const body = `"use strict"; return (${expression});`;
      evaluator = new Function(...allKeys, body);
      expressionCache.set(cacheKey, evaluator);
    }

    // 禁止識別子を undefined に設定
    const context: Scope = Object.fromEntries(forbiddenNames.map(k => [k, undefined]));
    const finalScope: Scope = { ...context, ...scope };

    // 引数を準備（スコープキーはソートされた順序で）
    const allKeys = [...forbiddenNames, ...scopeKeys];
    const argValues = allKeys.map(key => finalScope[key]);

    return evaluator(...argValues);
  } catch (err) {
    logWarning("[Haori: Expression Error]", expression, err);
    // ReferenceErrorの場合はundefinedを返す
    if (err instanceof ReferenceError) {
      return undefined;
    }
    return null;
  }
}

/**
 * 式評価キャッシュをクリア（テスト用）
 */
export function clearExpressionCache(): void {
  expressionCache.clear();
}

/**
 * 現在のキャッシュサイズを取得（デバッグ用）
 */
export function getExpressionCacheSize(): number {
  return expressionCache.size;
}
