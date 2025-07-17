/**
 * Haori式評価エンジン - セキュリティ対策付き
 * ドキュメント仕様に基づいた実装
 */

import {logWarning} from './log';

export type Scope = Record<string, any>;

/** 式 → 評価関数のグローバルキャッシュ */
const expressionCache = new Map<string, Function>();

/** Haoriで禁止すべき識別子一覧（strict mode で有効な識別子のみ） */
const forbiddenNames = [
  // グローバルオブジェクト
  'window', 'self', 'globalThis', 'frames', 'parent', 'top',
  // 危険な関数/オブジェクト
  'Function', 'setTimeout', 'setInterval', 'requestAnimationFrame',
  'alert', 'confirm', 'prompt', 'fetch', 'XMLHttpRequest',
  // 脱出経路・プロトタイプ
  'constructor', '__proto__', 'prototype', 'Object',
  // その他
  'document', 'location', 'navigator', 'localStorage', 'sessionStorage',
  'IndexedDB', 'history'
];

/** strict modeで引数名として使用できない特別な識別子 */
const specialForbiddenNames = ['eval', 'arguments'];

/**
 * 式にevalや危険な構文が含まれているかチェック
 * ただし、単純な識別子参照は許可する（スコープで上書き可能にするため）
 *
 * @param expression チェック対象の式文字列
 * @returns 危険なパターンが含まれている場合はtrue
 */
function containsDangerousPatterns(expression: string): boolean {
  // eval("code") や arguments[0] のような複雑なパターンのみをブロック
  const dangerousPatterns = [
    /\beval\s*\(/,  // eval(...)
    /\barguments\s*\[/,  // arguments[...]
    /\barguments\s*\./,  // arguments.xxx
  ];
  
  return dangerousPatterns.some(pattern => pattern.test(expression));
}

/**
 * Haori 式評価関数（安全・高速・キャッシュ対応）
 *
 * @param expression 評価対象の式文字列（例: "name + 'さん'"）
 * @param scope 評価スコープ（data-bindなどから渡される値）
 * @returns 評価結果、またはエラー時は null
 */
export function evaluateExpressionSafe(
  expression: string,
  scope: Scope = {}
): any | null {
  try {
    if (typeof expression !== 'string' || expression.trim() === '') {
      logWarning('[Haori: Expression Error]', expression, 'Expression is empty');
      return null;
    }

    // 危険なパターンをチェック
    if (containsDangerousPatterns(expression)) {
      logWarning('[Haori: Expression Error]', expression, 'Contains dangerous patterns');
      return null;
    }

    // スコープキーを取得してソート（一意のキャッシュキーを生成するため）
    const scopeKeys = Object.keys(scope).sort();
    const cacheKey = `${expression}:${scopeKeys.join(',')}`;

    // キャッシュから評価関数を取得または生成
    let evaluator = expressionCache.get(cacheKey);

    if (!evaluator) {
      // 禁止識別子と重複しないスコープキーのみを引数に使用
      const safeScopeKeys = scopeKeys.filter(key => 
        !forbiddenNames.includes(key) && !specialForbiddenNames.includes(key)
      );
      
      // 関数の引数として使用する名前（禁止識別子 + 安全なスコープキー）
      const argNames = [...forbiddenNames, ...safeScopeKeys];
      
      // with文の代わりに、contextオブジェクトを作成してスコープを管理
      const contextProps = [
        ...forbiddenNames.map((name, i) => `${name}: arguments[${i}]`),
        ...safeScopeKeys.map((name, i) => `${name}: arguments[${forbiddenNames.length + i}]`)
      ];
      
      // eval と arguments を特別に処理
      const specialProps: string[] = [];
      if (scopeKeys.includes('eval')) {
        specialProps.push(`eval: arguments[${argNames.length}]`);
      } else {
        specialProps.push(`eval: undefined`);
      }
      if (scopeKeys.includes('arguments')) {
        specialProps.push(`arguments: arguments[${argNames.length + 1}]`);
      } else {
        specialProps.push(`arguments: undefined`);
      }
      
      const allProps = [...contextProps, ...specialProps];
      
      const body = `
        var context = { ${allProps.join(', ')} };
        with (context) {
          return (${expression});
        }
      `;
      
      evaluator = new Function(...argNames, body);
      expressionCache.set(cacheKey, evaluator);
    }

    // 引数を準備
    const argValues: any[] = [];
    
    // 禁止識別子の値を追加（スコープで上書き可能）
    forbiddenNames.forEach(name => {
      if (scope.hasOwnProperty(name)) {
        argValues.push(scope[name]);  // スコープで上書き
      } else {
        argValues.push(undefined);  // デフォルトは undefined
      }
    });
    
    // 安全なスコープキーの値を追加
    const safeScopeKeys = Object.keys(scope).filter(key => 
      !forbiddenNames.includes(key) && !specialForbiddenNames.includes(key)
    ).sort();
    
    safeScopeKeys.forEach(key => {
      argValues.push(scope[key]);
    });
    
    // eval と arguments の上書き値を追加
    argValues.push(scope['eval']);  // eval上書き値
    argValues.push(scope['arguments']);  // arguments上書き値

    return evaluator(...argValues);
  } catch (err) {
    logWarning('[Haori: Expression Error]', expression, err);
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
 *
 * @returns 現在のキャッシュサイズ
 */
export function getExpressionCacheSize(): number {
  return expressionCache.size;
}
