/**
 * Haori-JS スコープ管理システム
 * data-bind による階層的なスコープ構造を管理
 */

import { logWarning, logInfo } from './log';
import { evaluateExpressionSafe, type Scope } from './expression';

/**
 * テキストノード評価情報
 */
export interface EvaluatedTextNode {
  /** 対象のテキストノード */
  textNode: Text;
  /** プレースホルダ付きの元の文字列 */
  originalValue: string;
  /** 再評価関数 */
  evaluator: () => any;
}

/**
 * 属性評価情報
 */
export interface EvaluatedAttribute {
  /** 対象の属性ノード */
  attr: Attr;
  /** プレースホルダ付きの元の文字列 */
  originalValue: string;
  /** 再評価関数 */
  evaluator: () => any;
}

/**
 * Haori-JS のバインディングスコープ
 * 各 data-bind を持つ要素ごとに割り当てられる
 */
export interface BindingScope {
  /** 親スコープ */
  parent?: BindingScope;
  /** 子スコープ */
  children: BindingScope[];
  /** 対応する DOM ノード */
  node: Element;
  /** 表示状態 */
  visible: boolean;
  /** スコープデータ */
  data: Record<string, any>;
  /** テキストノード評価情報 */
  evaluatedTextNodes: Map<Text, EvaluatedTextNode>;
  /** 構造制御属性の評価関数 */
  structuralEvaluators: Map<Attr, () => any>;
  /** 属性評価情報 */
  evaluatedAttrs: Map<string, EvaluatedAttribute>;
}

/**
 * スコープマップ - DOM要素とBindingScopeの対応表
 */
export const scopeMap = new Map<Element, BindingScope>();

/**
 * 文字列内の全てのプレースホルダを評価して置換
 */
function evaluateAllPlaceholders(
    template: string, scope: Scope): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, expression) => {
    const result = evaluateExpressionSafe(expression.trim(), scope);
    // null, undefined, NaN の場合は空文字列に変換
    return result == null || Number.isNaN(result) ? '' : String(result);
  });
}

/**
 * data-bind 属性からスコープデータを解析
 */
function parseDataBind(attr: string): Record<string, any> {
  try {
    return JSON.parse(attr);
  } catch (err) {
    logWarning('[Haori: data-bind構文エラー]', attr, err);
    return {};
  }
}

/**
 * 親スコープを検索
 */
export function findParentScope(el: Element): BindingScope|undefined {
  let parent = el.parentElement;
  while (parent) {
    const scope = scopeMap.get(parent);
    if (scope) {
      return scope;
    }
    parent = parent.parentElement;
  }
  return undefined;
}

/**
 * スコープチェーンを解決して最終的なスコープオブジェクトを生成
 */
export function resolveScope(scope: BindingScope): Scope {
  const resolved: Scope = {};

  // 親から子へ順番にマージ（子が親を上書き）
  const scopes: BindingScope[] = [];
  let current: BindingScope|undefined = scope;

  while (current) {
    scopes.unshift(current);
    current = current.parent;
  }

  // 親から子の順でマージ（後から来るものが上書き）
  for (const s of scopes) {
    Object.assign(resolved, s.data);
  }

  return resolved;
}

/**
 * 指定要素にBindingScopeを構築
 */
export function bindScope(
    el: Element, parentScope?: BindingScope): BindingScope {
  // 既存のスコープがある場合は警告して返す
  if (scopeMap.has(el)) {
    logWarning('[Haori: Scope]', 'スコープが既に存在します', el);
    return scopeMap.get(el)!;
  }

  const attr = el.getAttribute('data-bind');
  const data = attr ? parseDataBind(attr) : {};

  const scope: BindingScope = {
    parent: parentScope,
    children: [],
    node: el,
    visible: true,
    data,
    evaluatedTextNodes: new Map(),
    structuralEvaluators: new Map(),
    evaluatedAttrs: new Map(),
  };

  // 親の子リストに追加
  if (parentScope) {
    parentScope.children.push(scope);
  }

  // スコープマップに登録
  scopeMap.set(el, scope);

  logInfo('[Haori: Scope]', 'スコープを作成しました', el, data);

  return scope;
}

/**
 * スコープのデータを更新し、再評価を実行
 */
export function updateBindingData(
    el: Element, newData: Record<string, any>): void {
  const scope = scopeMap.get(el);
  if (!scope) {
    logWarning('[Haori: Scope]', 'スコープが見つかりません', el);
    return;
  }

  scope.data = newData;

  // data-bind 属性も更新
  el.setAttribute('data-bind', JSON.stringify(newData));

  logInfo('[Haori: Scope]', 'スコープデータを更新しました', el, newData);

  // 再評価を実行
  rebindScope(scope);
}

/**
 * スコープの再評価を実行
 */
export function rebindScope(scope: BindingScope): void {
  if (!scope.visible) {
    return;
  }

  const resolvedScope = resolveScope(scope);

  // テキストノード評価を実行
  for (const evalTextNode of scope.evaluatedTextNodes.values()) {
    try {
      evalTextNode.evaluator();
    } catch (err) {
      logWarning('[Haori: Scope]', 'テキストノード再評価エラー', err);
    }
  }

  // 構造制御属性の評価を実行
  for (const evaluator of scope.structuralEvaluators.values()) {
    try {
      evaluator();
    } catch (err) {
      logWarning('[Haori: Scope]', '構造制御再評価エラー', err);
    }
  }

  // 属性評価も実行
  for (const [attrName, evalAttr] of scope.evaluatedAttrs) {
    try {
      evalAttr.evaluator();
    } catch (err) {
      logWarning(
          '[Haori: Scope]', '属性再評価エラー', attrName, evalAttr.attr, err);
    }
  }

  // 子スコープも再帰的に再評価
  for (const childScope of scope.children) {
    rebindScope(childScope);
  }
}

/**
 * スコープとその子スコープを削除
 */
export function deleteScope(el: Element): void {
  const scope = scopeMap.get(el);
  if (!scope) {
    return;
  }

  // 子スコープも再帰的に削除
  for (const childScope of scope.children) {
    deleteScope(childScope.node);
  }

  // 親の子リストから削除
  if (scope.parent) {
    const index = scope.parent.children.indexOf(scope);
    if (index !== -1) {
      scope.parent.children.splice(index, 1);
    }
  }

  // スコープマップから削除
  scopeMap.delete(el);

  logInfo('[Haori: Scope]', 'スコープを削除しました', el);
}

/**
 * スコープの表示状態を設定
 */
export function setScopeVisible(el: Element, visible: boolean): void {
  const scope = scopeMap.get(el);
  if (!scope) {
    return;
  }

  scope.visible = visible;

  // 表示状態になった場合は再評価
  if (visible) {
    rebindScope(scope);
  }
}

/**
 * 指定要素のスコープを取得
 */
export function getScope(el: Element): BindingScope|undefined {
  return scopeMap.get(el);
}

/**
 * 指定要素のスコープを解決して最終的なスコープオブジェクトを取得
 */
export function getResolvedScope(el: Element): Scope {
  const scope = scopeMap.get(el);
  if (!scope) {
    return {};
  }
  return resolveScope(scope);
}

/**
 * スコープにテキストノード評価を追加
 */
export function addEvaluatedTextNode(
    el: Element,
    textNode: Text,
    originalValue: string,
    evaluator?: () => any): void {
  const scope = scopeMap.get(el);
  if (!scope) {
    logWarning(
        '[Haori: Scope]', 'テキストノード評価追加: スコープが見つかりません', el);
    return;
  }

  // カスタム評価関数が提供されていない場合は、汎用的な評価関数を使用
  const finalEvaluator = evaluator || (() => {
    const resolvedScope = resolveScope(scope);
    const result = evaluateAllPlaceholders(originalValue, resolvedScope);
    textNode.textContent = result;
  });

  scope.evaluatedTextNodes.set(textNode, {
    textNode,
    originalValue,
    evaluator: finalEvaluator,
  });

  logInfo(
      '[Haori: Scope]', 'テキストノード評価を追加しました', el, originalValue);
}

/**
 * スコープから特定のテキストノード評価を削除
 */
export function removeEvaluatedTextNode(
    el: Element, textNode: Text): void {
  const scope = scopeMap.get(el);
  if (!scope) {
    return;
  }

  if (scope.evaluatedTextNodes.has(textNode)) {
    scope.evaluatedTextNodes.delete(textNode);
    logInfo('[Haori: Scope]', 'テキストノード評価を削除しました', el);
  }
}

/**
 * スコープに構造制御属性評価を追加
 */
export function addStructuralEvaluator(
    el: Element, attr: Attr, evaluator: () => any): void {
  const scope = scopeMap.get(el);
  if (!scope) {
    logWarning(
        '[Haori: Scope]', '構造制御評価追加: スコープが見つかりません', el,
        attr.name);
    return;
  }

  scope.structuralEvaluators.set(attr, evaluator);

  logInfo(
      '[Haori: Scope]', '構造制御評価を追加しました', el, attr.name, attr.value);
}

/**
 * スコープから構造制御属性評価を削除
 */
export function removeStructuralEvaluator(
    el: Element, attr: Attr): void {
  const scope = scopeMap.get(el);
  if (!scope) {
    return;
  }

  scope.structuralEvaluators.delete(attr);
  logInfo('[Haori: Scope]', '構造制御評価を削除しました', el, attr.name);
}

/**
 * スコープに属性評価を追加
 */
export function addEvaluatedAttribute(
    el: Element,
    attrName: string,
    attr: Attr,
    originalValue: string,
    evaluator?: () => any): void {
  const scope = scopeMap.get(el);
  if (!scope) {
    logWarning(
        '[Haori: Scope]', '属性評価追加: スコープが見つかりません', el, attrName);
    return;
  }

  // カスタム評価関数が提供されていない場合は、汎用的な評価関数を使用
  const finalEvaluator = evaluator || (() => {
    const resolvedScope = resolveScope(scope);
    const result = evaluateAllPlaceholders(originalValue, resolvedScope);
    attr.value = result;
  });

  scope.evaluatedAttrs.set(attrName, {
    attr,
    originalValue,
    evaluator: finalEvaluator,
  });

  logInfo(
      '[Haori: Scope]', '属性評価を追加しました', el, attrName, originalValue);
}

/**
 * スコープから属性評価を削除
 */
export function removeEvaluatedAttribute(
    el: Element, attrName: string): void {
  const scope = scopeMap.get(el);
  if (!scope) {
    return;
  }

  scope.evaluatedAttrs.delete(attrName);
  logInfo('[Haori: Scope]', '属性評価を削除しました', el, attrName);
}

/**
 * スコープの統計情報を取得
 */
export function getScopeStats(): {
  totalScopes: number;
  visibleScopes: number;
  textNodeEvaluatorsCount: number;
  structuralEvaluatorsCount: number;
  evaluatedAttrsCount: number;
} {
  let totalScopes = 0;
  let visibleScopes = 0;
  let textNodeEvaluatorsCount = 0;
  let structuralEvaluatorsCount = 0;
  let evaluatedAttrsCount = 0;

  for (const scope of scopeMap.values()) {
    totalScopes++;
    if (scope.visible) {
      visibleScopes++;
    }
    textNodeEvaluatorsCount += scope.evaluatedTextNodes.size;
    structuralEvaluatorsCount += scope.structuralEvaluators.size;
    evaluatedAttrsCount += scope.evaluatedAttrs.size;
  }

  return {
    totalScopes,
    visibleScopes,
    textNodeEvaluatorsCount,
    structuralEvaluatorsCount,
    evaluatedAttrsCount,
  };
}
