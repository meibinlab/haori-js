/**
 * @fileoverview BindingScope - Haori データバインディングスコープ管理。
 *
 * 各`data-bind`要素に対応するスコープを管理し、プレースホルダの評価、
 * 親子スコープチェーンの解決、再評価処理を担当します。
 */

import { evaluateExpressionSafe, type Scope } from './expression';
import { Dom } from './dom';
import { logError } from './log';

/**
 * HTMLエスケープを行います。
 * 
 * @param unsafe エスケープ対象の文字列
 * @returns エスケープ済み文字列
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * テキスト内のプレースホルダを解析し、評価済みテキストを生成する関数を作成します。
 *
 * @param template プレースホルダを含むテンプレート文字列
 * @param scope 評価に使用するスコープ
 * @returns 評価済みテキストを生成する関数
 */
export function createTextEvaluator(
  template: string,
  scope: BindingScope
): () => string {
  // プレースホルダパターン: {{expression}} と {{{expression}}} に対応
  const doubleBracePattern = /\{\{([^}]+)\}\}/g;
  const tripleBracePattern = /\{\{\{([^}]+)\}\}\}/g;

  return () => {
    let result = template;
    
    // トリプルブレース（HTML未エスケープ）を先に処理
    result = result.replace(tripleBracePattern, (match, expression) => {
      try {
        const value = scope.evaluateExpression(expression.trim());
        // HTMLエスケープを行わずに値をそのまま返す
        return value != null ? String(value) : '';
      } catch (error) {
        console.warn('[Haori: Triple Brace Evaluation Error]', expression, error);
        return '';
      }
    });
    
    // ダブルブレース（HTMLエスケープ済み）を処理
    result = result.replace(doubleBracePattern, (match, expression) => {
      try {
        const value = scope.evaluateExpression(expression.trim());
        const stringValue = value != null ? String(value) : '';
        // HTMLエスケープを実行
        return escapeHtml(stringValue);
      } catch (error) {
        console.warn('[Haori: Double Brace Evaluation Error]', expression, error);
        return '';
      }
    });
    
    return result;
  };
}

/** 属性評価に関する情報 */
export interface EvaluatedAttribute {
  /** 対象要素 */
  element: Element;

  /** 属性名 */
  attrName: string;

  /** プレースホルダ付きの元の文字列 */
  originalValue: string;

  /** 再評価関数 */
  evaluator: (scope: BindingScope) => string;
}

/** テキストコンテンツ評価に関する情報 */
export interface EvaluatedTextContent {
  /** 対象のテキストノード */
  textNode: Text;

  /** プレースホルダ付きの元の文字列 */
  originalValue: string;

  /** 再評価関数 */
  evaluator: () => any;
}

/**
 * バインディングスコープクラスです。
 * 
 * 各`data-bind`要素に対応するスコープを管理し、以下の機能を提供します：
 * - 親子スコープチェーンの管理
 * - プレースホルダ式の評価と再評価
 * - 属性値の動的更新
 * - 表示状態の制御（data-if対応）
 */
export class BindingScope {
  /** 親スコープ（ネスト元） */
  public parent?: BindingScope;

  /** 子スコープリスト（ネスト先） */
  public children: BindingScope[] = [];

  /** 対象のDOMノード */
  public node: Element;

  /** data-if制御による表示状態 */
  public visible: boolean = true;

  /** 非表示時に保存された子ノード */
  private savedChildNodes: Node[] = [];

  /** 非表示時に保存された元のdisplayスタイル */
  private originalDisplay: string = '';

  /** このスコープのデータ（data-bind） */
  public data: Record<string, any> = {};

  /** 属性評価に関する情報 */
  public evaluatedAttrs: EvaluatedAttribute[] = [];

  /** テキストコンテンツ評価に関する情報 */
  public evaluatedTextContents: EvaluatedTextContent[] = [];

  /**
   * BindingScopeを構築します。
   *
   * @param node 対象のDOMノード
   * @param data スコープデータ
   * @param parent 親スコープ（オプション）
   */
  constructor(node: Element, data: Record<string, any> = {}, parent?: BindingScope) {
    this.node = node;
    this.data = data;
    this.parent = parent;

    // 親スコープの子リストに自身を追加
    if (parent) {
      parent.children.push(this);
    }

    // スコープマップに登録
    scopeMap.set(node, this);
  }

  /**
   * スコープチェーンを解決し、親から子へのマージされたスコープを生成します。
   * 同じキーが存在する場合、子の値が親を完全に上書きします（マージは行われません）。
   *
   * @returns マージされたスコープオブジェクト
   */
  public getMergedScope(): Scope {
    const result: Scope = {};
    const chain: BindingScope[] = [];

    // 親から子への順序でスコープチェーンを構築
    let current: BindingScope | undefined = this;
    while (current) {
      chain.unshift(current);
      current = current.parent;
    }

    // 親から子の順でデータをマージ（子の値が優先）
    for (const scope of chain) {
      Object.assign(result, scope.data);
    }

    return result;
  }

  /**
   * 式を安全に評価します。
   *
   * @param expression 評価対象の式文字列
   * @returns 評価結果
   */
  public evaluateExpression(expression: string): unknown {
    const mergedScope = this.getMergedScope();
    return evaluateExpressionSafe(expression, mergedScope);
  }

  /**
   * スコープデータを更新し、登録された評価関数をすべて再実行します。
   *
   * @param newData 新しいスコープデータ
   */
  public updateData(newData: Record<string, any>): void {
    this.data = newData;
    this.rebind();
  }

  /**
   * プレースホルダや属性の再評価を実行します。
   * 子スコープも再帰的に再評価されます。
   */
  public rebind(): void {
    if (!this.visible) {
      return;
    }

    // 属性評価を実行
    for (const attrEval of this.evaluatedAttrs) {
      try {
        const newValue = attrEval.evaluator(this);
        attrEval.element.setAttribute(attrEval.attrName, newValue);
      } catch (error) {
        console.warn('[Haori: Attribute Rebind Error]', error);
      }
    }

    // テキストコンテンツ評価を実行
    for (const textEval of this.evaluatedTextContents) {
      try {
        textEval.evaluator();
      } catch (error) {
        console.warn('[Haori: Text Content Rebind Error]', error);
      }
    }

    // 子スコープを再帰的に再評価
    for (const child of this.children) {
      child.rebind();
    }
  }

  /**
   * 属性評価情報を追加します。
   *
   * @param attrEval 属性評価情報
   */
  public addEvaluatedAttribute(attrEval: EvaluatedAttribute): void {
    this.evaluatedAttrs.push(attrEval);
  }

  /**
   * テキストコンテンツ評価情報を追加します。
   *
   * @param textEval テキストコンテンツ評価情報
   */
  public addEvaluatedTextContent(textEval: EvaluatedTextContent): void {
    this.evaluatedTextContents.push(textEval);
  }

  /**
   * 表示状態を設定します（data-if制御用）。
   * Haoriの仕様に従い、非表示時は子ノードを削除してdata-bind-false属性を設定、
   * 再表示時は子ノードを復活させて再評価を実行します。
   *
   * @param visible 表示状態
   * @returns DOM操作完了のPromise
   */
  public async setVisible(visible: boolean): Promise<void> {
    if (this.visible === visible) {
      return; // 状態が変わらない場合は何もしない
    }

    this.visible = visible;

    if (visible) {
      // 再表示処理
      await this.showElement();
    } else {
      // 非表示処理
      await this.hideElement();
    }
  }

  /**
   * 要素を非表示にします（data-if: false時の処理）。
   * - data-bind-false属性を設定
   * - display: noneを設定（元の値を保存）
   * - 子ノードをDOMから削除（保存）
   */
  private async hideElement(): Promise<void> {
    const element = this.node as HTMLElement;

    // 元のdisplayスタイルを保存
    this.originalDisplay = element.style.display || '';

    // 子ノードを保存してDOMから削除（Dom APIを使用）
    this.savedChildNodes = Array.from(element.childNodes);
    const removePromises = this.savedChildNodes.map(child => 
      Dom.removeNode(child)
    );

    // DOM操作を並列実行
    await Promise.all([
      Dom.setAttribute(element, 'data-bind-false', ''),
      Dom.setStyle(element, 'display', 'none'),
      ...removePromises
    ]);
  }

  /**
   * 要素を再表示します（data-if: true時の処理）。
   * - data-bind-false属性を削除
   * - displayスタイルを元に戻す
   * - 子ノードを復活
   * - data-ifエレメント以下を再評価
   */
  private async showElement(): Promise<void> {
    const element = this.node as HTMLElement;

    // DOM操作を並列実行
    const domOperations: Promise<void>[] = [
      Dom.removeAttribute(element, 'data-bind-false')
    ];

    if (this.originalDisplay) {
      domOperations.push(Dom.setStyle(element, 'display', this.originalDisplay));
    } else {
      // displayプロパティを削除（Dom APIを使用）
      domOperations.push(Dom.removeStyle(element, 'display'));
    }

    await Promise.all(domOperations);

    // 子ノードを復活（Dom APIを使用して並列実行）
    const appendPromises = this.savedChildNodes.map(childNode => 
      Dom.appendNode(element, childNode)
    );
    await Promise.all(appendPromises);
    this.savedChildNodes = [];

    // data-ifエレメント以下を再評価
    this.rebind();

    // 子ノード内のプレースホルダも再処理（後で実装される関数を呼び出し）
    if (typeof processTextPlaceholders === 'function') {
      processTextPlaceholders(element, this);
    }
  }

  /**
   * 子スコープを追加します。
   *
   * @param child 子スコープ
   */
  public addChild(child: BindingScope): void {
    if (!this.children.includes(child)) {
      this.children.push(child);
      child.parent = this;
    }
  }

  /**
   * 子スコープを削除します。
   *
   * @param child 削除する子スコープ
   */
  public removeChild(child: BindingScope): void {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
      child.parent = undefined;
    }
  }

  /**
   * スコープとそのすべての子スコープをクリーンアップします。
   */
  public async dispose(): Promise<void> {
    // 非表示状態の場合は要素を復元してからクリーンアップ
    if (!this.visible) {
      await this.showElement();
    }

    // 子スコープを逐次的にクリーンアップ（順序が重要な場合があるため）
    for (const child of this.children) {
      await child.dispose();
    }

    // 親スコープから自身を削除
    if (this.parent) {
      this.parent.removeChild(this);
    }

    // 評価関数をクリア
    this.evaluatedAttrs.length = 0;
    this.evaluatedTextContents.length = 0;
    this.children.length = 0;
    this.savedChildNodes.length = 0;
  }

  /**
   * data-each用にスコープとエレメントを複製します。
   * 子スコープも含めて完全な複製を行います。
   *
   * @param newData 新しいスコープデータ
   * @param parent 複製先の親スコープ（オプション）
   * @returns 複製されたBindingScope
   */
  public clone(newData: Record<string, any>, parent?: BindingScope): BindingScope {
    // エレメントを複製
    const clonedElement = this.node.cloneNode(true) as Element;

    // 新しいスコープを作成
    const clonedScope = new BindingScope(clonedElement, newData, parent);

    // 内部状態を複製
    clonedScope.visible = this.visible;
    clonedScope.originalDisplay = this.originalDisplay;

    // 非表示状態の場合は特別な処理
    if (!this.visible) {
      // 保存された子ノードを複製
      const savedNodes = this.getSavedChildNodes();
      if (savedNodes.length > 0) {
        clonedScope.setSavedChildNodes(savedNodes.map(node => node.cloneNode(true)));
      }

      // クローンされた要素の子ノードを削除し、非表示の外観にする
      const element = clonedScope.node as HTMLElement;
      while (element.firstChild) {
        element.removeChild(element.firstChild);
      }

      // data-bind-falseとdisplayを設定
      element.setAttribute('data-bind-false', '');
      element.style.display = 'none';
    }

    // 評価情報は複製しない（新しくプレースホルダ処理が必要）
    // これにより、複製後に processTextPlaceholders などを呼び出す必要がある

    // 子スコープも再帰的に複製
    for (const childScope of this.children) {
      // 複製されたエレメント内で対応する子エレメントを見つける
      const originalChild = childScope.node;
      const clonedChild = this.findCorrespondingElement(originalChild, this.node, clonedElement);

      if (clonedChild) {
        // 子スコープのデータをそのまま使用して複製
        const clonedChildScope = childScope.clone(childScope.data, clonedScope);
        clonedChildScope.node = clonedChild;

        // nodeが変更されたのでスコープマップを更新
        scopeMap.delete(clonedChildScope.node);
        scopeMap.set(clonedChild, clonedChildScope);
      }
    }

    return clonedScope;
  }

  /**
   * 保存された子ノードを取得します（複製時に使用）。
   *
   * @returns 保存された子ノードの配列
   */
  public getSavedChildNodes(): Node[] {
    return [...this.savedChildNodes];
  }

  /**
   * 保存された子ノードを設定します（複製時に使用）。
   *
   * @param nodes 設定する子ノードの配列
   */
  public setSavedChildNodes(nodes: Node[]): void {
    this.savedChildNodes = [...nodes];
  }

  /**
   * 複製されたエレメント内で元のエレメントに対応する要素を見つけます。
   *
   * @param originalChild 元の子エレメント
   * @param originalParent 元の親エレメント
   * @param clonedParent 複製された親エレメント
   * @returns 対応する複製された子エレメント
   */
  private findCorrespondingElement(
    originalChild: Element,
    originalParent: Element,
    clonedParent: Element
  ): Element | null {
    // 元の親エレメント内での位置を特定
    const originalChildren = Array.from(originalParent.querySelectorAll('*'));
    const childIndex = originalChildren.indexOf(originalChild);

    if (childIndex === -1) {
      return null;
    }

    // 複製された親エレメント内の同じ位置の要素を取得
    const clonedChildren = Array.from(clonedParent.querySelectorAll('*'));
    return clonedChildren[childIndex] || null;
  }

  /**
   * エレメントをDOMから削除し、対応するBindingScopeもクリーンアップします。
   * 
   * このメソッドは以下の処理を行います：
   * - 要素とその子要素に関連するすべてのBindingScopeを再帰的に削除
   * - 親スコープから自身を削除
   * - DOMから要素を削除
   * 
   * @param permanently 完全削除フラグ（デフォルト: true）
   */
  public async remove(permanently: boolean = true): Promise<void> {
    // 子スコープを並列で削除
    const childrenToRemove = [...this.children];
    await Promise.all(childrenToRemove.map(child => child.remove(permanently)));

    // 親スコープから自身を削除
    if (this.parent) {
      this.parent.removeChild(this);
    }

    // スコープマップから削除
    scopeMap.delete(this.node);

    // DOMから要素を削除（Nodeなので直接操作）
    if (permanently && this.node.parentNode) {
      this.node.parentNode.removeChild(this.node);
    }

    // 内部データをクリア（親から削除済みなのでdisposeで親削除は不要）
    this.children.length = 0;
    this.evaluatedAttrs.length = 0;
    this.evaluatedTextContents.length = 0;
    this.savedChildNodes.length = 0;

    // 非表示状態の場合は要素を復元
    if (!this.visible) {
      await this.showElement();
    }
  }

  /**
   * 既存のスコープを指定した親要素に移動し、スコープの親子関係も更新します。
   *
   * @param parentElement 移動先の親要素
   * @param position 挿入位置（'beforeend', 'afterbegin', 'beforebegin', 'afterend'）
   * @returns 移動されたスコープ自身（メソッドチェーン用）
   */
  public async moveTo(
    parentElement: Element,
    position: 'beforeend' | 'afterbegin' | 'beforebegin' | 'afterend' = 'beforeend'
  ): Promise<this> {
    // 現在の親スコープから自身を削除
    if (this.parent) {
      this.parent.removeChild(this);
    }

    // DOM上で要素を移動
    await this.appendTo(parentElement, position);

    // 新しい親スコープを見つけて関係を更新
    const newParentScope = this.findParentScope(parentElement);
    if (newParentScope) {
      newParentScope.addChild(this);
    }

    return this;
  }

  /**
   * 指定した要素から最も近い親のBindingScopeを見つけます。
   *
   * @param element 検索開始要素
   * @returns 見つかった親BindingScope（存在しない場合はundefined）
   */
  private findParentScope(element: Element): BindingScope | undefined {
    let current = element.parentElement;
    while (current) {
      const scope = getBindingScope(current);
      if (scope) {
        return scope;
      }
      current = current.parentElement;
    }
    return undefined;
  }

  /**
   * 複製されたスコープを指定した親要素に追加します。
   *
   * @param parentElement 追加先の親要素
   * @param position 挿入位置（'beforeend', 'afterbegin', 'beforebegin', 'afterend'）
   * @returns 追加されたスコープ自身（メソッドチェーン用）
   */
  public async appendTo(
    parentElement: Element,
    position: 'beforeend' | 'afterbegin' | 'beforebegin' | 'afterend' = 'beforeend'
  ): Promise<this> {
    switch (position) {
      case 'beforeend':
        await Dom.appendChild(parentElement, this.node);
        break;
      case 'afterbegin':
        if (parentElement.firstElementChild) {
          await Dom.insertBefore(parentElement, this.node, parentElement.firstElementChild);
        } else {
          await Dom.appendChild(parentElement, this.node);
        }
        break;
      case 'beforebegin':
        if (parentElement.parentNode) {
          await Dom.insertBefore(parentElement.parentNode as Element, this.node, parentElement);
        }
        break;
      case 'afterend':
        if (parentElement.parentNode && parentElement.nextElementSibling) {
          await Dom.insertBefore(parentElement.parentNode as Element, this.node, parentElement.nextElementSibling);
        } else if (parentElement.parentNode) {
          await Dom.appendChild(parentElement.parentNode as Element, this.node);
        }
        break;
    }
    return this;
  }

  /**
   * 既存のスコープを指定した要素の前に移動し、スコープの親子関係も更新します。
   *
   * @param targetElement 挿入位置の基準となる要素
   * @returns 移動されたスコープ自身（メソッドチェーン用）
   */
  public async moveBefore(targetElement: Element): Promise<this> {
    // 現在の親スコープから自身を削除
    if (this.parent) {
      this.parent.removeChild(this);
    }

    // DOM上で要素を移動
    await this.insertBefore(targetElement);

    // 新しい親スコープを見つけて関係を更新
    if (targetElement.parentElement) {
      const newParentScope = this.findParentScope(targetElement.parentElement);
      if (newParentScope) {
        newParentScope.addChild(this);
      }
    }

    return this;
  }

  /**
   * 既存のスコープを指定した要素の後に移動し、スコープの親子関係も更新します。
   *
   * @param targetElement 挿入位置の基準となる要素
   * @returns 移動されたスコープ自身（メソッドチェーン用）
   */
  public async moveAfter(targetElement: Element): Promise<this> {
    // 現在の親スコープから自身を削除
    if (this.parent) {
      this.parent.removeChild(this);
    }

    // DOM上で要素を移動
    await this.insertAfter(targetElement);

    // 新しい親スコープを見つけて関係を更新
    if (targetElement.parentElement) {
      const newParentScope = this.findParentScope(targetElement.parentElement);
      if (newParentScope) {
        newParentScope.addChild(this);
      }
    }

    return this;
  }

  /**
   * 複製されたスコープを指定した要素の前に挿入します。
   *
   * @param targetElement 挿入位置の基準となる要素
   * @returns 追加されたスコープ自身（メソッドチェーン用）
   */
  public async insertBefore(targetElement: Element): Promise<this> {
    if (targetElement.parentNode) {
      await Dom.insertBefore(targetElement.parentNode as Element, this.node, targetElement);
    }
    return this;
  }

  /**
   * 複製されたスコープを指定した要素の後に挿入します。
   *
   * @param targetElement 挿入位置の基準となる要素
   * @returns 追加されたスコープ自身（メソッドチェーン用）
   */
  public async insertAfter(targetElement: Element): Promise<this> {
    if (targetElement.parentNode) {
      if (targetElement.nextElementSibling) {
        await Dom.insertBefore(targetElement.parentNode as Element, this.node, targetElement.nextElementSibling);
      } else {
        await Dom.appendChild(targetElement.parentNode as Element, this.node);
      }
    }
    return this;
  }

  /**
   * 既存のスコープで指定した要素を置き換え、スコープの親子関係も更新します。
   *
   * @param targetElement 置き換え対象の要素
   * @returns 置き換えたスコープ自身（メソッドチェーン用）
   */
  public async moveAndReplace(targetElement: Element): Promise<this> {
    // 現在の親スコープから自身を削除
    if (this.parent) {
      this.parent.removeChild(this);
    }

    // 置き換え先の親スコープを取得
    let newParentScope: BindingScope | undefined;
    if (targetElement.parentElement) {
      newParentScope = this.findParentScope(targetElement.parentElement);
    }

    // DOM上で要素を置き換え
    await this.replaceElement(targetElement);

    // 新しい親スコープとの関係を更新
    if (newParentScope) {
      newParentScope.addChild(this);
    }

    return this;
  }

  /**
   * 複製されたスコープを指定した要素で置き換えます。
   *
   * @param targetElement 置き換え対象の要素
   * @returns 追加されたスコープ自身（メソッドチェーン用）
   */
  public async replaceElement(targetElement: Element): Promise<this> {
    if (targetElement.parentNode) {
      // 直接のDOM操作で置き換え（Dom APIにreplaceChildがないため）
      targetElement.parentNode.replaceChild(this.node, targetElement);

      // 置き換えられた要素のスコープがあれば削除
      const targetScope = getBindingScope(targetElement);
      if (targetScope) {
        await targetScope.remove(false); // DOMからは既に削除されているのでfalse
      }
    }
    return this;
  }

  /**
   * スコープを複製して指定した親要素に追加します（ワンステップ操作）。
   *
   * @param newData 新しいスコープデータ
   * @param parentElement 追加先の親要素
   * @param position 挿入位置（デフォルト: 'beforeend'）
   * @param parent 複製先の親スコープ（オプション）
   * @returns 複製されて追加されたBindingScope
   */
  public async cloneAndAppendTo(
    newData: Record<string, any>,
    parentElement: Element,
    position: 'beforeend' | 'afterbegin' | 'beforebegin' | 'afterend' = 'beforeend',
    parent?: BindingScope
  ): Promise<BindingScope> {
    const clonedScope = this.clone(newData, parent);
    await clonedScope.appendTo(parentElement, position);
    return clonedScope;
  }

  /**
   * スコープの詳細情報を文字列として返します（デバッグ用）。
   *
   * @returns スコープの詳細情報
   */
  public toString(): string {
    const nodeInfo = this.node.tagName + (this.node.id ? `#${this.node.id}` : '');
    const dataKeys = Object.keys(this.data).join(', ');
    return `BindingScope(${nodeInfo}, data: {${dataKeys}}, visible: ${this.visible}, children: ${this.children.length})`;
  }
}

/** スコープマップ（DOMノード → BindingScope） */
export const scopeMap = new Map<Element, BindingScope>();

/**
 * 要素にBindingScopeを生成・登録します。
 *
 * @param element 対象要素
 * @param data スコープデータ
 * @param parent 親スコープ（オプション）
 * @returns 生成されたBindingScope
 */
export async function createBindingScope(
  element: Element,
  data: Record<string, any> = {},
  parent?: BindingScope
): Promise<BindingScope> {
  // 既存のスコープがある場合は削除
  const existingScope = scopeMap.get(element);
  if (existingScope) {
    await existingScope.dispose();
  }

  const scope = new BindingScope(element, data, parent);
  // コンストラクタですでに登録されているので、ここでの登録は不要
  return scope;
}

/**
 * 要素のBindingScopeを取得します。
 *
 * @param element 対象要素
 * @returns BindingScope（存在しない場合はundefined）
 */
export function getBindingScope(element: Element): BindingScope | undefined {
  return scopeMap.get(element);
}

/**
 * 要素のBindingScopeを削除します。
 *
 * @param element 対象要素
 */
export async function removeBindingScope(element: Element): Promise<void> {
  const scope = scopeMap.get(element);
  if (scope) {
    await scope.dispose();
    scopeMap.delete(element);
  }
}

/**
 * スコープマップをクリアします（テスト用）。
 */
export async function clearScopeMap(): Promise<void> {
  const disposePromises = Array.from(scopeMap.values()).map(scope => scope.dispose());
  await Promise.all(disposePromises);
  scopeMap.clear();
}

/**
 * 現在のスコープマップサイズを取得します（デバッグ用）。
 *
 * @returns スコープマップのサイズ
 */
export function getScopeMapSize(): number {
  return scopeMap.size;
}

/**
 * 要素の全てのテキストノードを走査し、プレースホルダを含むものを処理します。
 *
 * @param element 対象要素
 * @param scope バインディングスコープ
 */
export function processTextPlaceholders(
  element: Element,
  scope: BindingScope
): void {
  const walker = document.createTreeWalker(
    element as Node,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const textContent = node.textContent || '';
        // ダブルブレースまたはトリプルブレースのプレースホルダが含まれているかチェック
        return /\{\{\{[^}]+\}\}\}|\{\{[^}]+\}\}/.test(textContent)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    }
  );

  const textNodes: Text[] = [];
  let node: Node | null;

  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      textNodes.push(node as Text);
    }
  }

  // 各テキストノードに対して評価関数を設定
  for (const textNode of textNodes) {
    const originalValue = textNode.textContent || '';
    const evaluator = createTextEvaluator(originalValue, scope);

    // 初回評価
    textNode.textContent = evaluator();

    // 再評価用に登録
    const textEval: EvaluatedTextContent = {
      textNode,
      originalValue,
      evaluator: () => {
        textNode.textContent = evaluator();
      }
    };

    scope.addEvaluatedTextContent(textEval);
  }
}

/**
 * エレメントをDOMから削除し、対応するBindingScopeもクリーンアップします。
 * 
 * @param element 削除対象の要素
 * @param permanently 完全削除フラグ（デフォルト: true）
 */
export async function removeElement(element: Element, permanently: boolean = true): Promise<void> {
  const scope = getBindingScope(element);
  if (scope) {
    await scope.remove(permanently);
  } else {
    // スコープが存在しない場合でも、子要素のスコープを削除
    await removeChildScopes(element, permanently);

    // DOMから削除
    if (permanently && element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }
}

/**
 * 指定した要素の子要素に関連するBindingScopeを再帰的に削除します。
 * 
 * @param element 親要素
 * @param permanently 完全削除フラグ
 */
async function removeChildScopes(element: Element, permanently: boolean): Promise<void> {
  const childElements = Array.from(element.querySelectorAll('*'));

  const removePromises = childElements.map(async (childElement) => {
    const childScope = getBindingScope(childElement);
    if (childScope) {
      await childScope.remove(permanently);
    }
  });

  await Promise.all(removePromises);
}

/**
 * エレメント内の属性プレースホルダを処理し、評価可能な属性プレースホルダを設定します。
 * 
 * @param scope 対象のBindingScope
 */
export function processAttributePlaceholders(scope: BindingScope): void {
  const element = scope.node;
  
  // すべての属性をチェック
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    const attrName = attr.name;
    const attrValue = attr.value;
    
    // {{...}} と {{{...}}} パターンの属性プレースホルダを検出
    const doubleBracePlaceholders = Array.from(attrValue.matchAll(/\{\{([^}]+)\}\}/g));
    const tripleBracePlaceholders = Array.from(attrValue.matchAll(/\{\{\{([^}]+)\}\}\}/g));
    const allPlaceholders = [...doubleBracePlaceholders, ...tripleBracePlaceholders];
    
    if (allPlaceholders.length > 0) {
      // 元の属性値をバックアップ
      const originalValue = attrValue;
      
      // 属性プレースホルダ評価器を作成
      const evaluator = createAttributeEvaluator(originalValue, doubleBracePlaceholders, tripleBracePlaceholders);
      
      // 評価済み属性として登録
      scope.evaluatedAttrs.push({
        element,
        attrName,
        originalValue,
        evaluator
      });
      
      // 初回評価
      try {
        const evaluatedValue = evaluator(scope);
        element.setAttribute(attrName, evaluatedValue);
      } catch (error) {
        logError('[AttributePlaceholder]', `Failed to evaluate attribute ${attrName}:`, error);
      }
    }
  }
}

/**
 * 属性プレースホルダの評価器を作成します。
 * 
 * @param originalValue 元の属性値
 * @param doubleBraceMatches ダブルブレースプレースホルダのマッチ結果
 * @param tripleBraceMatches トリプルブレースプレースホルダのマッチ結果
 * @returns 属性プレースホルダ評価器
 */
function createAttributeEvaluator(
  originalValue: string,
  doubleBraceMatches: RegExpMatchArray[],
  tripleBraceMatches: RegExpMatchArray[]
): (scope: BindingScope) => string {
  return function(scope: BindingScope): string {
    let result = originalValue;
    
    // トリプルブレース（HTML未エスケープ）を先に処理
    for (const match of tripleBraceMatches) {
      const fullMatch = match[0]; // {{{expression}}}
      const expression = match[1].trim(); // expression
      
      try {
        // 式を評価
        const value = scope.evaluateExpression(expression);
        
        // 値を文字列に変換（エスケープなし）
        const stringValue = value === null || value === undefined ? '' : String(value);
        
        // プレースホルダを評価結果で置換
        result = result.replace(fullMatch, stringValue);
      } catch (error) {
        logError('[AttributePlaceholder]', `Failed to evaluate triple brace expression "${expression}":`, error);
        // エラー時は空文字列で置換
        result = result.replace(fullMatch, '');
      }
    }
    
    // ダブルブレース（HTMLエスケープ済み）を処理
    for (const match of doubleBraceMatches) {
      const fullMatch = match[0]; // {{expression}}
      const expression = match[1].trim(); // expression
      
      try {
        // 式を評価
        const value = scope.evaluateExpression(expression);
        
        // 値を文字列に変換（HTMLエスケープ）
        const stringValue = value === null || value === undefined ? '' : String(value);
        const escapedValue = escapeHtml(stringValue);
        
        // プレースホルダを評価結果で置換
        result = result.replace(fullMatch, escapedValue);
      } catch (error) {
        logError('[AttributePlaceholder]', `Failed to evaluate double brace expression "${expression}":`, error);
        // エラー時は空文字列で置換
        result = result.replace(fullMatch, '');
      }
    }
    
    return result;
  };
}

/**
 * 指定した要素のスコープを複製して任意の場所に追加します。
 *
 * @param sourceElement 複製元の要素
 * @param newData 新しいスコープデータ
 * @param targetElement 追加先の親要素
 * @param position 挿入位置（デフォルト: 'beforeend'）
 * @param parent 複製先の親スコープ（オプション）
 * @returns 複製されて追加されたBindingScope（元の要素にスコープがない場合はundefined）
 */
export async function cloneElementTo(
  sourceElement: Element,
  newData: Record<string, any>,
  targetElement: Element,
  position: 'beforeend' | 'afterbegin' | 'beforebegin' | 'afterend' = 'beforeend',
  parent?: BindingScope
): Promise<BindingScope | undefined> {
  const sourceScope = getBindingScope(sourceElement);
  if (!sourceScope) {
    return undefined;
  }

  return await sourceScope.cloneAndAppendTo(newData, targetElement, position, parent);
}
