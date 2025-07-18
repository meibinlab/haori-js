/**
 * @fileoverview Haori DOM操作システム - キューベース実装
 *
 * DOM操作を非同期でキューイングし、バッチ処理することで
 * パフォーマンスを最適化するシステムです。
 *
 * 主な機能:
 * - 操作の優先度付きキューイング
 * - 動的バッチサイズ調整
 * - XSS対策を含むセキュアな操作実行
 * - requestAnimationFrameを使用したスムーズな実行
 */

import {logError, logWarning} from './log';

/**
 * DOM操作の種類
 */
export enum DomOperationType {
  SET_ATTRIBUTE = 'setAttribute',
  REMOVE_ATTRIBUTE = 'removeAttribute',
  SET_TEXT_CONTENT = 'setTextContent',
  SET_HTML_CONTENT = 'setHTMLContent',
  ADD_CLASS = 'addClass',
  REMOVE_CLASS = 'removeClass',
  TOGGLE_CLASS = 'toggleClass',
  SET_STYLE = 'setStyle',
  REMOVE_STYLE = 'removeStyle',
  APPEND_CHILD = 'appendChild',
  REMOVE_CHILD = 'removeChild',
  INSERT_BEFORE = 'insertBefore',
}

/**
 * DOM操作コマンド構造体
 */
export interface DomOperation {
  /** 操作の一意なID */
  id: string;

  /** 操作の種類 */
  type: DomOperationType;

  /** CSSセレクタ */
  selector: string;

  /** キャッシュされた要素（オプション） */
  element?: Element|null;

  /** 属性名またはプロパティ名（オプション） */
  key?: string;

  /** 設定する値（オプション） */
  value?: unknown;

  /** 対象の要素またはノード（オプション） */
  target?: Element|Node;

  /** 参照ノード（insertBefore用、オプション） */
  reference?: Element|Node;

  /** 優先度（数値が大きいほど高優先度、オプション） */
  priority?: number;

  /** 操作が作成された時刻（Unix timestamp） */
  timestamp: number;

  /** 操作完了時に解決されるPromise */
  promise: Promise<void>;

  /** Promise解決用の関数 */
  resolve: () => void;

  /** Promise拒否用の関数 */
  reject: (error: Error) => void;
}

/**
 * DOM操作キュー管理クラス
 *
 * DOM操作を非同期でバッチ処理することで、パフォーマンスを最適化します。
 * 動的バッチサイズ調整により、実行時間を目標値内に収めます。
 */
class DomOperationQueue {
  /** 操作キュー */
  private queue: DomOperation[] = [];

  /** 処理中フラグ */
  private processing = false;

  /** 現在のバッチサイズ */
  private batchSize = 10;

  /** キューの最大サイズ */
  private readonly maxQueueSize = 1000;

  // 動的バッチサイズ調整用の設定
  /** 最小バッチサイズ */
  private readonly MIN_BATCH_SIZE = 1;

  /** 最大バッチサイズ */
  private readonly MAX_BATCH_SIZE = 50;

  /** 目標実行時間（ミリ秒）- 60FPS対応 */
  private readonly TARGET_EXECUTION_TIME = 16;

  /** バッチサイズ調整係数 */
  private readonly ADJUSTMENT_FACTOR = 1.2;

  /** 最後の実行時間（ミリ秒） */
  private lastExecutionTime = 0;

  /** 実行時間履歴 */
  private readonly executionTimeHistory: number[] = [];

  /** 履歴保持サイズ */
  private readonly HISTORY_SIZE = 5;

  /**
   * 操作をキューに追加します。
   *
   * @param operation 追加する操作
   * @return 操作完了Promise
   */
  enqueue(operation: Omit<DomOperation, 'id'|'timestamp'|'promise'|'resolve'|'reject'>): Promise<void> {
    if (this.queue.length >= this.maxQueueSize) {
      logWarning(
        '[Haori: DOM Queue]', 'Queue is full, dropping oldest operations');
      const dropped = this.queue.shift();
      if (dropped) {
        dropped.reject(new Error('Operation dropped due to queue overflow'));
      }
    }

    const id = this.generateOperationId();
    let resolve: () => void;
    let reject: (error: Error) => void;
    
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const domOperation: DomOperation = {
      ...operation,
      id,
      timestamp: Date.now(),
      priority: operation.priority || 0,
      promise,
      resolve: resolve!,
      reject: reject!,
    };

    // 優先度順で挿入
    const insertIndex = this.findInsertPosition(domOperation);
    this.queue.splice(insertIndex, 0, domOperation);

    // 非同期で処理開始
    this.scheduleProcessing();

    return promise;
  }

  /**
   * 特定の操作をキューから削除します。
   *
   * @param id 削除する操作のID
   * @return 削除に成功した場合true
   */
  dequeue(id: string): boolean {
    const index = this.queue.findIndex(op => op.id === id);
    if (index !== -1) {
      const operation = this.queue[index];
      this.queue.splice(index, 1);
      operation.reject(new Error('Operation cancelled'));
      return true;
    }
    return false;
  }

  /**
   * キューをクリアします。
   */
  clear(): void {
    // すべての未実行操作のPromiseを拒否
    this.queue.forEach(operation => {
      operation.reject(new Error('Queue cleared'));
    });
    this.queue = [];
  }

  /**
   * キューの状態を取得します。
   * 
   * @return キューの状態
   */
  getStatus(): {size: number; processing: boolean} {
    return {
      size: this.queue.length,
      processing: this.processing,
    };
  }

  /**
   * 操作IDを生成します。
   *
   * @return 一意な操作ID
   */
  private generateOperationId(): string {
    return `dom_op_${Date.now()}_${
      Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * 優先度に基づく挿入位置を見つけます。
   *
   * @param operation 挿入する操作
   * @return 挿入位置のインデックス
   */
  private findInsertPosition(operation: DomOperation): number {
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].priority! < operation.priority!) {
        return i;
      }
    }
    return this.queue.length;
  }

  /**
   * 実行時間を記録します。
   *
   * @param executionTime 実行時間（ミリ秒）
   */
  private recordExecutionTime(executionTime: number): void {
    this.executionTimeHistory.push(executionTime);
    if (this.executionTimeHistory.length > this.HISTORY_SIZE) {
      this.executionTimeHistory.shift();
    }
  }

  /**
   * 実行時間履歴の平均を計算します。
   *
   * @return 平均実行時間（ミリ秒）
   */
  private getAverageExecutionTime(): number {
    if (this.executionTimeHistory.length === 0) return 0;
    const sum = this.executionTimeHistory.reduce((a, b) => a + b, 0);
    return sum / this.executionTimeHistory.length;
  }

  /**
   * バッチサイズを動的に調整します。
   */
  private adjustBatchSize(): void {
    const avgExecutionTime = this.getAverageExecutionTime();

    // 実行時間の履歴が少ない場合は調整を行わない
    if (this.executionTimeHistory.length < 3) return;

    if (avgExecutionTime > this.TARGET_EXECUTION_TIME) {
      // 実行時間が目標より長い場合、バッチサイズを減らす
      this.batchSize = Math.max(
        this.MIN_BATCH_SIZE,
        Math.floor(this.batchSize / this.ADJUSTMENT_FACTOR));
    } else if (avgExecutionTime < this.TARGET_EXECUTION_TIME * 0.5) {
      // 実行時間が目標の半分以下の場合、バッチサイズを増やす
      this.batchSize = Math.min(
        this.MAX_BATCH_SIZE,
        Math.ceil(this.batchSize * this.ADJUSTMENT_FACTOR));
    }
  }

  /**
   * 現在のバッチサイズを取得します。
   *
   * @return 現在のバッチサイズ
   */
  getBatchSize(): number {
    return this.batchSize;
  }

  /**
   * 最後の実行時間を取得します。
   *
   * @return 最後の実行時間（ミリ秒）
   */
  getLastExecutionTime(): number {
    return this.lastExecutionTime;
  }

  /**
   * 実行時間の統計を取得します。
   *
   * @return 実行統計情報
   */
  getExecutionStats(): {
    currentBatchSize: number;
    lastExecutionTime: number;
    averageExecutionTime: number;
    executionHistory: number[];
  } {
    return {
      currentBatchSize: this.batchSize,
      lastExecutionTime: this.lastExecutionTime,
      averageExecutionTime: this.getAverageExecutionTime(),
      executionHistory: [...this.executionTimeHistory],
    };
  }

  /**
   * 処理をスケジュールします。
   */
  private scheduleProcessing(): void {
    if (this.processing) return;

    // requestAnimationFrameまたはsetTimeoutで非同期処理
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => this.processQueue());
    } else {
      setTimeout(() => this.processQueue(), 0);
    }
  }

  /**
   * 高精度時間を取得します（fallback付き）。
   *
   * @return 現在時刻（ミリ秒）
   */
  private getHighResTime(): number {
    if (typeof performance !== 'undefined' && performance.now) {
      return performance.now();
    }
    return Date.now();
  }

  /**
   * キューを処理します。
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const startTime = this.getHighResTime();

    try {
      // バッチサイズ分だけ処理
      const batch = this.queue.splice(0, this.batchSize);

      for (const operation of batch) {
        await this.executeOperation(operation);
      }

      // 実行時間を記録
      const endTime = this.getHighResTime();
      this.lastExecutionTime = endTime - startTime;
      this.recordExecutionTime(this.lastExecutionTime);

      // バッチサイズを調整
      this.adjustBatchSize();

      // まだキューに残りがあれば継続
      if (this.queue.length > 0) {
        this.scheduleProcessing();
      }
    } catch (error) {
      logError('[Haori: DOM Queue]', 'Error processing queue:', error);
    } finally {
      this.processing = false;
    }
  }

  /**
   * 単一の操作を実行します。
   *
   * @param operation 実行する操作
   */
  private async executeOperation(operation: DomOperation): Promise<void> {
    try {
      // 要素を取得（エレメントが直接提供されている場合はそれを使用、
      // そうでなければセレクタで検索）
      const element = operation.element ||
        (operation.selector ? document.querySelector(operation.selector) : null);

      if (!element) {
        const identifier = operation.element ? 'direct element' : operation.selector;
        const error = new Error(`Element not found: ${identifier}`);
        logWarning('[Haori: DOM]', error.message);
        operation.reject(error);
        return;
      }

      // 操作タイプに応じて実行
      switch (operation.type) {
        case DomOperationType.SET_ATTRIBUTE:
          element.setAttribute(operation.key!, String(operation.value));
          break;
        case DomOperationType.REMOVE_ATTRIBUTE:
          element.removeAttribute(operation.key!);
          break;
        case DomOperationType.SET_TEXT_CONTENT:
          this.setTextContent(element, String(operation.value ?? ''));
          break;
        case DomOperationType.SET_HTML_CONTENT:
          this.setHTMLContent(element, String(operation.value ?? ''));
          break;
        case DomOperationType.ADD_CLASS:
          element.classList.add(String(operation.value ?? ''));
          break;
        case DomOperationType.REMOVE_CLASS:
          element.classList.remove(String(operation.value ?? ''));
          break;
        case DomOperationType.TOGGLE_CLASS:
          element.classList.toggle(String(operation.value ?? ''));
          break;
        case DomOperationType.SET_STYLE:
          this.setStyle(element, operation.key!, String(operation.value ?? ''));
          break;
        case DomOperationType.REMOVE_STYLE:
          this.removeStyle(element, operation.key!);
          break;
        case DomOperationType.APPEND_CHILD:
          element.appendChild(operation.target!);
          break;
        case DomOperationType.REMOVE_CHILD:
          element.removeChild(operation.target!);
          break;
        case DomOperationType.INSERT_BEFORE:
          element.insertBefore(operation.target!, operation.reference!);
          break;
        default:
          const error = new Error(`Unknown operation type: ${operation.type}`);
          logWarning('[Haori: DOM]', error.message);
          operation.reject(error);
          return;
      }

      // 操作が成功したらPromiseを解決
      operation.resolve();
    } catch (error) {
      const errorMessage = `Error executing operation ${operation.id}:`;
      logError('[Haori: DOM]', errorMessage, error);
      operation.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // 個別の操作メソッド（複雑な処理を含むもののみ）

  /**
   * テキストコンテンツを設定します。
   *
   * @param element 対象要素
   * @param content テキストコンテンツ
   */
  private setTextContent(element: Element, content: string): void {
    element.textContent = this.sanitizeText(content);
  }

  /**
   * HTMLコンテンツを設定します。
   *
   * @param element 対象要素
   * @param content HTMLコンテンツ
   */
  private setHTMLContent(element: Element, content: string): void {
    // 基本的なXSS対策
    const sanitized = this.sanitizeHTML(content);
    element.innerHTML = sanitized;
  }

  /**
   * スタイルを設定します。
   *
   * @param element 対象要素
   * @param property CSSプロパティ名
   * @param value CSSプロパティ値
   */
  private setStyle(element: Element, property: string, value: string): void {
    (element as HTMLElement).style.setProperty(property, value);
  }

  /**
   * スタイルを削除します。
   *
   * @param element 対象要素
   * @param property CSSプロパティ名
   */
  private removeStyle(element: Element, property: string): void {
    (element as HTMLElement).style.removeProperty(property);
  }

  /**
   * テキストのサニタイゼーションを行います。
   *
   * @param text サニタイズするテキスト
   * @return サニタイズされたテキスト
   */
  private sanitizeText(text: string): string {
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * HTMLの基本的なサニタイゼーションを行います。
   *
   * @param html サニタイズするHTML
   * @return サニタイズされたHTML
   */
  private sanitizeHTML(html: string): string {
    // 危険なタグとスクリプトを除去
    return html
      .replace(
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(
        /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
      .replace(/on\w+\s*=\s*'[^']*'/gi, '')
      .replace(/javascript:/gi, '');
  }
}

//@ グローバルキューインスタンス
const domQueue = new DomOperationQueue();

/**
 * DOM操作のためのヘルパー関数
 * セレクタまたはエレメントから適切な操作オブジェクトを作成します
 */
function createOperation(
  type: DomOperationType,
  selectorOrElement: string | Element,
  options: {
    key?: string;
    value?: unknown;
    target?: Element | Node;
    reference?: Element | Node;
    priority?: number;
  } = {}
): Omit<DomOperation, 'id' | 'timestamp' | 'promise' | 'resolve' | 'reject'> {
  const { key, value, target, reference, priority = 0 } = options;
  
  if (typeof selectorOrElement === 'string') {
    return {
      type,
      selector: selectorOrElement,
      key,
      value,
      target,
      reference,
      priority,
    };
  } else {
    return {
      type,
      selector: '',
      element: selectorOrElement,
      key,
      value,
      target,
      reference,
      priority,
    };
  }
}

/**
 * DOM操作をキューに追加するヘルパー関数群
 */
export const Dom = {
  /**
   * 属性を設定します。
   *
   * @param selectorOrElement CSSセレクタまたはエレメント
   * @param key 属性名
   * @param value 属性値
   * @param priority 優先度（デフォルト: 0）
   * @return 操作完了Promise
   */
  setAttribute(selectorOrElement: string | Element, key: string, value: unknown, priority = 0): Promise<void> {
    return domQueue.enqueue(createOperation(DomOperationType.SET_ATTRIBUTE, selectorOrElement, { key, value, priority }));
  },

  /**
   * 属性を削除します。
   *
   * @param selectorOrElement CSSセレクタまたはエレメント
   * @param key 属性名
   * @param priority 優先度（デフォルト: 0）
   * @return 操作完了Promise
   */
  removeAttribute(selectorOrElement: string | Element, key: string, priority = 0): Promise<void> {
    return domQueue.enqueue(createOperation(DomOperationType.REMOVE_ATTRIBUTE, selectorOrElement, { key, priority }));
  },

  /**
   * テキストコンテンツを設定します。
   *
   * @param selectorOrElement CSSセレクタまたはエレメント
   * @param content テキストコンテンツ
   * @param priority 優先度（デフォルト: 0）
   * @return 操作完了Promise
   */
  setTextContent(selectorOrElement: string | Element, content: string, priority = 0): Promise<void> {
    return domQueue.enqueue(createOperation(DomOperationType.SET_TEXT_CONTENT, selectorOrElement, { value: content, priority }));
  },

  /**
   * HTMLコンテンツを設定します。
   *
   * @param selectorOrElement CSSセレクタまたはエレメント
   * @param content HTMLコンテンツ
   * @param priority 優先度（デフォルト: 0）
   * @return 操作完了Promise
   */
  setHTMLContent(selectorOrElement: string | Element, content: string, priority = 0): Promise<void> {
    return domQueue.enqueue(createOperation(DomOperationType.SET_HTML_CONTENT, selectorOrElement, { value: content, priority }));
  },

  /**
   * クラスを追加します。
   *
   * @param selectorOrElement CSSセレクタまたはエレメント
   * @param className クラス名
   * @param priority 優先度（デフォルト: 0）
   * @return 操作完了Promise
   */
  addClass(selectorOrElement: string | Element, className: string, priority = 0): Promise<void> {
    return domQueue.enqueue(createOperation(DomOperationType.ADD_CLASS, selectorOrElement, { value: className, priority }));
  },

  /**
   * クラスを削除します。
   *
   * @param selectorOrElement CSSセレクタまたはエレメント
   * @param className クラス名
   * @param priority 優先度（デフォルト: 0）
   * @return 操作完了Promise
   */
  removeClass(selectorOrElement: string | Element, className: string, priority = 0): Promise<void> {
    return domQueue.enqueue(createOperation(DomOperationType.REMOVE_CLASS, selectorOrElement, { value: className, priority }));
  },

  /**
   * クラスをトグルします。
   *
   * @param selectorOrElement CSSセレクタまたはエレメント
   * @param className クラス名
   * @param priority 優先度（デフォルト: 0）
   * @return 操作完了Promise
   */
  toggleClass(selectorOrElement: string | Element, className: string, priority = 0): Promise<void> {
    return domQueue.enqueue(createOperation(DomOperationType.TOGGLE_CLASS, selectorOrElement, { value: className, priority }));
  },

  /**
   * スタイルを設定します。
   *
   * @param selectorOrElement CSSセレクタまたはエレメント
   * @param property CSSプロパティ名
   * @param value CSSプロパティ値
   * @param priority 優先度（デフォルト: 0）
   * @return 操作完了Promise
   */
  setStyle(selectorOrElement: string | Element, property: string, value: string, priority = 0): Promise<void> {
    return domQueue.enqueue(createOperation(DomOperationType.SET_STYLE, selectorOrElement, { key: property, value, priority }));
  },

  /**
   * 子要素を追加します。
   *
   * @param parentElement 親エレメント
   * @param childElement 追加する子エレメント
   * @param priority 優先度（デフォルト: 0）
   * @return 操作完了Promise
   */
  appendChild(parentElement: Element, childElement: Element, priority = 0): Promise<void> {
    return domQueue.enqueue(createOperation(DomOperationType.APPEND_CHILD, parentElement, { target: childElement, priority }));
  },

  /**
   * 子要素を削除します。
   *
   * @param parentElement 親エレメント
   * @param childElement 削除する子エレメント
   * @param priority 優先度（デフォルト: 0）
   * @return 操作完了Promise
   */
  removeChild(parentElement: Element, childElement: Element, priority = 0): Promise<void> {
    return domQueue.enqueue(createOperation(DomOperationType.REMOVE_CHILD, parentElement, { target: childElement, priority }));
  },

  /**
   * 要素を指定位置に挿入します。
   *
   * @param parentElement 親エレメント
   * @param newElement 挿入する新しいエレメント
   * @param referenceElement 挿入位置の参照エレメント
   * @param priority 優先度（デフォルト: 0）
   * @return 操作完了Promise
   */
  insertBefore(parentElement: Element, newElement: Element, referenceElement: Element, priority = 0): Promise<void> {
    return domQueue.enqueue(createOperation(DomOperationType.INSERT_BEFORE, parentElement, { target: newElement, reference: referenceElement, priority }));
  },

  /**
   * 操作をキャンセルします。
   *
   * @param operationId 操作ID
   * @return キャンセルに成功した場合true
   */
  cancel(operationId: string): boolean {
    return domQueue.dequeue(operationId);
  },

  /**
   * キューをクリアします。
   */
  clear(): void {
    domQueue.clear();
  },

  /**
   * キューの状態を取得します。
   *
   * @return キューの状態
   */
  getStatus(): {size: number; processing: boolean} {
    return domQueue.getStatus();
  },

  /**
   * 実行統計を取得します。
   *
   * @return 実行統計情報
   */
  getExecutionStats(): {
    currentBatchSize: number;
    lastExecutionTime: number;
    averageExecutionTime: number;
    executionHistory: number[];
  } {
    return domQueue.getExecutionStats();
  },

  /**
   * 現在のバッチサイズを取得します。
   *
   * @return 現在のバッチサイズ
   */
  getBatchSize(): number {
    return domQueue.getBatchSize();
  },
};
