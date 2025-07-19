/**
 * @fileoverview Haori Core - 初期化と変更監視の中心モジュール。
 * 
 * Haoriアプリケーションの初期化、DOMの監視、データの変更監視、
 * 自動的な再描画処理を担当するコアモジュールです。
 */

import {BindingScope, processTextPlaceholders, processAttributePlaceholders} from './scope';
import {logInfo, logError, logWarning} from './log';

/**
 * Haori初期化オプション。
 */
export interface HaoriOptions {
  /** 監視対象のルート要素（デフォルト: document.body） */
  root?: Element;
  
  /** データバインディングの属性名（デフォルト: ["data-bind", "hor-bind"]） */
  bindAttributes?: string[];
  
  /** デバッグモードを有効にするか（デフォルト: false） */
  debug?: boolean;
}

/**
 * Haoriメインクラス。
 * アプリケーションの初期化、DOM監視を管理します。
 */
export class Haori {
  private static instance: Haori | null = null;
  
  /** 初期化オプション */
  private options: Required<HaoriOptions>;
  
  /** ルートスコープ */
  private rootScope: BindingScope | null = null;
  
  /** すべてのスコープのレジストリ */
  private scopeRegistry: Map<Element, BindingScope> = new Map();
  
  /** MutationObserver インスタンス */
  private mutationObserver: MutationObserver | null = null;
  
  /** 初期化済みフラグ */
  private initialized: boolean = false;
  
  /**
   * Haoriインスタンスを構築します。
   */
  private constructor(options: HaoriOptions = {}) {
    this.options = {
      root: options.root || document.body,
      bindAttributes: options.bindAttributes || ['data-bind', 'hor-bind'],
      debug: options.debug || false,
    };
  }
  
  /**
   * Haoriインスタンスを取得します（シングルトン）。
   */
  public static getInstance(options?: HaoriOptions): Haori {
    if (!Haori.instance) {
      Haori.instance = new Haori(options);
    }
    return Haori.instance;
  }
  
  /**
   * Haoriを初期化します
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      logWarning('[Haori]', 'Already initialized');
      return;
    }
    
    try {
      logInfo('[Haori]', 'Initializing...');
      
      // DOM待機
      await this.waitForDOM();
      
      // 初期バインディング処理
      await this.performInitialBinding();
      
      // DOM変更監視開始
      this.startDOMObservation();
      
      this.initialized = true;
      logInfo('[Haori]', 'Initialization completed');
      
    } catch (error) {
      logError('[Haori]', 'Initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Haoriを破棄します
   */
  public destroy(): void {
    logInfo('[Haori]', 'Destroying...');
    
    // DOM監視停止
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    
    // スコープクリア
    this.scopeRegistry.clear();
    this.rootScope = null;
    
    this.initialized = false;
    
    // グローバルインスタンスをクリア
    if (Haori.instance === this) {
      Haori.instance = null;
      globalHaori = null;
    }
    
    logInfo('[Haori]', 'Destroyed');
  }
  

  
  /**
   * 手動で再描画を実行します
   */
  public async refresh(): Promise<void> {
    logInfo('[Haori]', 'Manual refresh triggered');
    await this.refreshAllScopes();
  }
  
  /**
   * スコープを取得します
   */
  public getScope(element: Element): BindingScope | undefined {
    return this.scopeRegistry.get(element);
  }
  
  /**
   * ルートスコープを取得します
   */
  public getRootScope(): BindingScope | null {
    return this.rootScope;
  }
  
  /**
   * 要素がバインディング属性を持つかチェックします
   */
  private hasBindingAttribute(element: Element): boolean {
    return this.options.bindAttributes.some(attr => element.hasAttribute(attr));
  }
  
  /**
   * 要素からバインディング属性の値を取得します
   */
  private getBindingAttributeValue(element: Element): string | null {
    for (const attr of this.options.bindAttributes) {
      const value = element.getAttribute(attr);
      if (value !== null) {
        return value;
      }
    }
    return null;
  }
  
  /**
   * バインディング属性のセレクタを作成します
   */
  private createBindingSelector(): string {
    return this.options.bindAttributes.map(attr => `[${attr}]`).join(',');
  }
  
  /**
   * DOM待機処理
   */
  private async waitForDOM(): Promise<void> {
    if (document.readyState === 'loading') {
      return new Promise((resolve) => {
        document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
      });
    }
  }
  
  /**
   * 初期バインディング処理
   */
  private async performInitialBinding(): Promise<void> {
    const bindElements = this.options.root.querySelectorAll(this.createBindingSelector());
    
    logInfo('[Haori]', `Found ${bindElements.length} binding elements`);
    
    for (let i = 0; i < bindElements.length; i++) {
      await this.createBindingScope(bindElements[i] as Element);
    }
  }
  
  /**
   * バインディングスコープを作成します
   */
  private async createBindingScope(element: Element): Promise<BindingScope> {
    // 既存スコープがあれば返す
    if (this.scopeRegistry.has(element)) {
      return this.scopeRegistry.get(element)!;
    }
    
    // 親スコープを探す
    let parent: BindingScope | undefined;
    let currentElement = element.parentElement;
    while (currentElement && !parent) {
      parent = this.scopeRegistry.get(currentElement);
      currentElement = currentElement.parentElement;
    }
    
    // スコープ作成
    const scope = new BindingScope(element, parent);
    
    // データ-bindからデータを解析
    const bindValue = this.getBindingAttributeValue(element);
    if (bindValue) {
      try {
        const data = this.parseBindingData(bindValue);
        scope.updateData(data);
      } catch (error) {
        logError('[Haori]', `Failed to parse binding data: ${bindValue}`, error);
      }
    }
    
    // スコープ登録
    this.scopeRegistry.set(element, scope);
    
    // ルートスコープ設定
    if (!this.rootScope && !parent) {
      this.rootScope = scope;
    }

    // プレースホルダ処理（element が Node として使用可能な場合のみ）
    try {
      processTextPlaceholders(element, scope);
      processAttributePlaceholders(scope);
    } catch (error) {
      if (this.options.debug) {
        logWarning('[Haori]', 'Placeholder processing skipped:', error);
      }
    }
    
    // 初期評価
    scope.updateData(scope.data);
    
    // data-if属性の初期評価
    await this.processDataIfAttribute(scope);
    
    if (this.options.debug) {
      logInfo('[Haori]', `Created scope for element:`, element);
    }
    
    return scope;
  }
  
  /**
   * バインディングデータを解析します
   */
  private parseBindingData(bindValue: string): Record<string, any> {
    try {
      // JSONとして解析を試行
      return JSON.parse(bindValue);
    } catch {
      // JSONでない場合は、キー=値のペアとして解析
      const data: Record<string, any> = {};
      const pairs = bindValue.split(',');
      
      for (const pair of pairs) {
        const [key, value] = pair.split('=').map(s => s.trim());
        if (key && value) {
          // 数値、ブール値、文字列の自動推論
          if (value === 'true') {
            data[key] = true;
          } else if (value === 'false') {
            data[key] = false;
          } else if (/^\d+$/.test(value)) {
            data[key] = parseInt(value, 10);
          } else if (/^\d*\.\d+$/.test(value)) {
            data[key] = parseFloat(value);
          } else {
            // 引用符を除去
            data[key] = value.replace(/^['"]|['"]$/g, '');
          }
        }
      }
      
      return data;
    }
  }
  
  /**
   * DOM変更監視を開始します
   */
  private startDOMObservation(): void {
    this.mutationObserver = new MutationObserver((mutations) => {
      this.handleMutations(mutations);
    });
    
    this.mutationObserver.observe(this.options.root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: this.options.bindAttributes,
    });
    
    logInfo('[Haori]', 'DOM observation started');
  }
  
  /**
   * DOM変更を処理します
   */
  private async handleMutations(mutations: MutationRecord[]): Promise<void> {
    let needsRefresh = false;
    
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        // 追加されたノードを処理
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (this.hasBindingAttribute(element)) {
              await this.createBindingScope(element);
              needsRefresh = true;
            }
            
            // 子要素もチェック
            const children = element.querySelectorAll(this.createBindingSelector());
            for (let j = 0; j < children.length; j++) {
              await this.createBindingScope(children[j] as Element);
              needsRefresh = true;
            }
          }
        }
        
        // 削除されたノードを処理
        for (let i = 0; i < mutation.removedNodes.length; i++) {
          const node = mutation.removedNodes[i];
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            this.removeScopeRecursively(element);
            needsRefresh = true;
          }
        }
      } else if (mutation.type === 'attributes') {
        // 属性変更を処理
        const element = mutation.target as Element;
        if (this.scopeRegistry.has(element)) {
          const scope = this.scopeRegistry.get(element)!;
          const bindValue = this.getBindingAttributeValue(element);
          if (bindValue) {
            const data = this.parseBindingData(bindValue);
            scope.updateData(data);
            needsRefresh = true;
          }
        }
      }
    }
    
    if (needsRefresh) {
      await this.refreshAllScopes();
    }
  }
  
  /**
   * スコープを再帰的に削除します
   */
  private removeScopeRecursively(element: Element): void {
    this.scopeRegistry.delete(element);
    
    const children = element.querySelectorAll(this.createBindingSelector());
    for (let i = 0; i < children.length; i++) {
      this.scopeRegistry.delete(children[i] as Element);
    }
  }
  
  /**
   * すべてのスコープを再描画します
   */
  private async refreshAllScopes(): Promise<void> {
    for (const scope of this.scopeRegistry.values()) {
      try {
        scope.updateData(scope.data);
      } catch (error) {
        logError('[Haori]', 'Scope refresh error:', error);
      }
    }
  }

  /**
   * data-if属性を処理します。
   */
  private async processDataIfAttribute(scope: BindingScope): Promise<void> {
    const element = scope.node;
    const dataIfValue = element.getAttribute('data-if') || element.getAttribute('hor-if');
    
    if (!dataIfValue) {
      return; // data-if属性がない場合は何もしない
    }
    
    try {
      // data-if式を評価
      const result = scope.evaluateExpression(dataIfValue);
      
      // JavaScriptの偽値判定（false, 0, "", null, undefined, NaN）
      const isVisible = Boolean(result) && !Number.isNaN(result);
      
      // 表示状態を設定
      await scope.setVisible(isVisible);
      
      if (this.options.debug) {
        logInfo('[Haori]', `data-if="${dataIfValue}" evaluated to ${result} (visible: ${isVisible})`, element);
      }
    } catch (error) {
      logError('[Haori]', `Failed to evaluate data-if="${dataIfValue}":`, error);
      // エラー時はデフォルトで表示状態にする
      await scope.setVisible(true);
    }
  }
}

/**
 * グローバルHaoriインスタンス（便利メソッド用）
 */
let globalHaori: Haori | null = null;

/**
 * HTMLの<script>タグの属性からオプションを読み取ります。
 */
function parseScriptOptions(): HaoriOptions {
  const scripts = document.querySelectorAll('script[src*="haori"]');
  const lastScript = scripts[scripts.length - 1] as HTMLScriptElement;
  
  if (!lastScript) return {};
  
  const options: HaoriOptions = {};
  
  // data-bind-attributes="data-bind,hor-bind,my-bind"
  const bindAttrs = lastScript.getAttribute('data-bind-attributes');
  if (bindAttrs) {
    options.bindAttributes = bindAttrs.split(',').map(attr => attr.trim());
  }
  
  // data-debug="true"
  const debug = lastScript.getAttribute('data-debug');
  if (debug !== null) {
    options.debug = debug === 'true';
  }
  
  return options;
}

/**
 * DOMContentLoadedで自動初期化します。
 */
function autoInit() {
  // data-auto-init="false" が設定されている場合は自動初期化しない
  const scripts = document.querySelectorAll('script[src*="haori"]');
  const lastScript = scripts[scripts.length - 1] as HTMLScriptElement;
  
  if (lastScript && lastScript.getAttribute('data-auto-init') === 'false') {
    return;
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init(parseScriptOptions());
    });
  } else {
    // DOMが既に読み込まれている場合は即座に初期化
    init(parseScriptOptions());
  }
}

// スクリプト読み込み時に自動初期化を実行
autoInit();

/**
 * Haoriを初期化します（便利メソッド）
 */
export async function init(options?: HaoriOptions): Promise<Haori> {
  globalHaori = Haori.getInstance(options);
  await globalHaori.initialize();
  return globalHaori;
}

/**
 * グローバルHaoriインスタンスを取得します
 */
export function getHaori(): Haori | null {
  return globalHaori;
}

/**
 * 手動で再描画を実行します（便利メソッド）
 */
export async function refresh(): Promise<void> {
  if (!globalHaori) {
    throw new Error('Haori is not initialized. Call init() first.');
  }
  await globalHaori.refresh();
}
