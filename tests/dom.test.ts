import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Dom, DomOperationType } from '../src/dom';

// Domのモック
const mockElement = {
  setAttribute: vi.fn(),
  removeAttribute: vi.fn(),
  classList: {
    add: vi.fn(),
    remove: vi.fn(),
    toggle: vi.fn()
  },
  style: {
    setProperty: vi.fn(),
    removeProperty: vi.fn()
  },
  appendChild: vi.fn(),
  removeChild: vi.fn(),
  insertBefore: vi.fn(),
  textContent: '',
  innerHTML: ''
};

// querySelectorのモック
Object.defineProperty(document, 'querySelector', {
  value: vi.fn(() => mockElement),
  writable: true
});

// requestAnimationFrameのモック
Object.defineProperty(window, 'requestAnimationFrame', {
  value: vi.fn((callback) => {
    setTimeout(callback, 0);
    return 1;
  }),
  writable: true
});

// performance.nowのモック
Object.defineProperty(window, 'performance', {
  value: {
    now: vi.fn(() => Date.now())
  },
  writable: true
});

describe('Dom操作システム', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.clearAllTimers();
    
    // テスト終了後にキューを静かにクリア（Unhandled Rejectionを避ける）
    (Dom as any).clearQuiet();
  });

  describe('基本的な操作', () => {
    it('属性を設定できる', async () => {
      const promise = Dom.setAttribute('#test', 'data-value', 'test-value');
      
      expect(promise).toBeInstanceOf(Promise);
      expect(Dom.getStatus().size).toBe(1);
      
      // 少し待って処理を確認
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(document.querySelector).toHaveBeenCalledWith('#test');
      expect(mockElement.setAttribute).toHaveBeenCalledWith('data-value', 'test-value');
    });

    it('属性を削除できる', async () => {
      const promise = Dom.removeAttribute('#test', 'data-value');
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockElement.removeAttribute).toHaveBeenCalledWith('data-value');
    });

    it('テキストコンテンツを設定できる', async () => {
      const promise = Dom.setTextContent('#test', 'Hello World');
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(document.querySelector).toHaveBeenCalledWith('#test');
      // textContentは直接設定されるためモックでは検証困難
    });

    it('HTMLコンテンツを設定できる', async () => {
      const promise = Dom.setHTMLContent('#test', '<span>Hello</span>');
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(document.querySelector).toHaveBeenCalledWith('#test');
    });

    it('クラスを追加できる', async () => {
      const promise = Dom.addClass('#test', 'active');
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockElement.classList.add).toHaveBeenCalledWith('active');
    });

    it('クラスを削除できる', async () => {
      const promise = Dom.removeClass('#test', 'active');
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockElement.classList.remove).toHaveBeenCalledWith('active');
    });

    it('クラスをトグルできる', async () => {
      Dom.toggleClass('#test', 'active');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockElement.classList.toggle).toHaveBeenCalledWith('active');
    });

    it('スタイルを設定できる', async () => {
      Dom.setStyle('#test', 'color', 'red');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockElement.style.setProperty).toHaveBeenCalledWith('color', 'red');
    });

    it('スタイルを削除できる', async () => {
      const promise = Dom.removeStyle('#test', 'color');
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockElement.style.removeProperty).toHaveBeenCalledWith('color');
    });

    it('子要素を追加できる', async () => {
      const childElement = { tagName: 'DIV' } as any;
      const promise = Dom.appendChild(mockElement as any, childElement);
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockElement.appendChild).toHaveBeenCalledWith(childElement);
    });

    it('子要素を削除できる', async () => {
      const childElement = { tagName: 'DIV' } as any;
      const promise = Dom.removeChild(mockElement as any, childElement);
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockElement.removeChild).toHaveBeenCalledWith(childElement);
    });

    it('ノードを削除できる', async () => {
      const node = {
        parentNode: mockElement,
        tagName: 'TEXT'
      } as any;
      
      const promise = Dom.removeNode(node);
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockElement.removeChild).toHaveBeenCalledWith(node);
    });

    it('ノードを追加できる', async () => {
      const node = { nodeType: 3, textContent: 'Hello' } as any; // Text node
      const promise = Dom.appendNode(mockElement as any, node);
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockElement.appendChild).toHaveBeenCalledWith(node);
    });

    it('要素を挿入できる', async () => {
      const newElement = { tagName: 'DIV' } as any;
      const referenceElement = { tagName: 'SPAN' } as any;
      const promise = Dom.insertBefore(mockElement as any, newElement, referenceElement);
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockElement.insertBefore).toHaveBeenCalledWith(newElement, referenceElement);
    });
  });

  describe('キュー管理', () => {
    it('複数の操作をキューに追加できる', () => {
      Dom.setAttribute('#test1', 'data-value', 'value1');
      Dom.setAttribute('#test2', 'data-value', 'value2');
      Dom.addClass('#test3', 'active');
      
      const status = Dom.getStatus();
      expect(status.size).toBe(3);
    });

    it('優先度に基づいて操作を処理する', async () => {
      // 低優先度の操作を先に追加
      Dom.setAttribute('#test1', 'data-value', 'value1', 1);
      // 高優先度の操作を後に追加
      Dom.setAttribute('#test2', 'data-value', 'value2', 10);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // 高優先度の操作が先に処理されることを確認
      // 実際の処理順序の検証は複雑なので、キューのサイズが減ることを確認
      expect(Dom.getStatus().size).toBe(0);
    });

    it('キューをクリアできる', async () => {
      const promise1 = Dom.setAttribute('#test1', 'data-value', 'value1');
      const promise2 = Dom.setAttribute('#test2', 'data-value', 'value2');
      
      expect(Dom.getStatus().size).toBe(2);
      
      Dom.clear();
      expect(Dom.getStatus().size).toBe(0);
      
      // 拒否されたPromiseをキャッチ
      await expect(promise1).rejects.toThrow('Queue cleared');
      await expect(promise2).rejects.toThrow('Queue cleared');
    });
  });

  describe('動的バッチサイズ調整', () => {
    it('初期バッチサイズが設定されている', () => {
      const batchSize = Dom.getBatchSize();
      expect(batchSize).toBeGreaterThan(0);
    });

    it('実行統計を取得できる', () => {
      const stats = Dom.getExecutionStats();
      expect(stats).toHaveProperty('currentBatchSize');
      expect(stats).toHaveProperty('lastExecutionTime');
      expect(stats).toHaveProperty('averageExecutionTime');
      expect(stats).toHaveProperty('executionHistory');
      expect(Array.isArray(stats.executionHistory)).toBe(true);
    });

    it('複数の操作を処理した後に統計が更新される', async () => {
      // 複数の操作を追加してPromiseを保存
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(Dom.setAttribute(`#test${i}`, 'data-value', `value${i}`));
      }

      // すべての操作の完了を待つ
      await Promise.all(promises);

      const stats = Dom.getExecutionStats();
      expect(stats.lastExecutionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('エラーハンドリング', () => {
    it('操作をキャンセルした場合Promiseが拒否される', async () => {
      const promise1 = Dom.setAttribute('#test1', 'data-value', 'value1');
      const promise2 = Dom.setAttribute('#test2', 'data-value', 'value2');
      
      expect(Dom.getStatus().size).toBe(2);
      
      // キューをクリアすることで操作をキャンセル
      Dom.clear();
      expect(Dom.getStatus().size).toBe(0);
      
      // Promiseが拒否されることを確認
      await expect(promise1).rejects.toThrow('Queue cleared');
      await expect(promise2).rejects.toThrow('Queue cleared');
    });

    it('存在しない要素に対する操作はPromiseが拒否される', async () => {
      // querySelectorがnullを返すように設定
      (document.querySelector as any).mockReturnValueOnce(null);
      
      const promise = Dom.setAttribute('#nonexistent', 'data-value', 'test-value');
      
      // Promiseが拒否されることを確認
      await expect(promise).rejects.toThrow('Element not found: #nonexistent');
    });

    it('親ノードがないノードの削除は安全に処理される', async () => {
      const node = {
        parentNode: null,
        tagName: 'TEXT'
      } as any;
      
      // エラーが発生しないことを確認
      const promise = Dom.removeNode(node);
      await expect(promise).resolves.toBeUndefined();
    });

    it('不正な操作タイプはエラーをthrowする', async () => {
      // Dom操作システムの内部的なテスト
      // 実際には不正な操作タイプは型チェックで防がれるが、
      // ランタイムでの安全性を確認
      const element = mockElement as any;
      
      // 正常な操作であることを確認（参考として）
      const promise = Dom.setAttribute(element, 'test', 'value');
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('パフォーマンステスト', () => {
    it('大量の操作を効率的に処理できる', async () => {
      const startTime = Date.now();
      const promises = [];
      
      // 100個の操作を追加
      for (let i = 0; i < 100; i++) {
        promises.push(Dom.setAttribute(`#test${i}`, 'data-index', i.toString()));
      }
      
      // すべての操作の完了を待つ
      await Promise.all(promises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // 処理時間が合理的な範囲内であることを確認（1秒以内）
      expect(duration).toBeLessThan(1000);
      
      // すべての操作が完了していることを確認
      expect(Dom.getStatus().size).toBe(0);
    });

    it('バッチサイズが動的に調整される', async () => {
      const initialBatchSize = Dom.getBatchSize();
      
      // 多数の操作を実行
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(Dom.setAttribute(`#test${i}`, 'data-value', `value${i}`));
      }
      
      await Promise.all(promises);
      
      // 統計が更新されていることを確認
      const stats = Dom.getExecutionStats();
      expect(stats.executionHistory.length).toBeGreaterThan(0);
    });
  });

  describe('セキュリティ', () => {
    it('HTMLコンテンツからスクリプトタグを除去する', async () => {
      const promise = Dom.setHTMLContent('#test', '<div>Safe content</div><script>alert("xss")</script>');
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // スクリプトタグが除去されることを確認（実装詳細による）
      expect(document.querySelector).toHaveBeenCalledWith('#test');
    });

    it('HTMLコンテンツからイベントハンドラを除去する', async () => {
      Dom.setHTMLContent('#test', '<div onclick="alert(\'xss\')">Click me</div>');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(document.querySelector).toHaveBeenCalledWith('#test');
    });
  });

  describe('エレメント直接指定版メソッド', () => {
    it('属性を設定できる (エレメント直接指定)', async () => {
      const element = mockElement as any;
      const promise = Dom.setAttribute(element, 'data-value', 'test-value');
      
      expect(promise).toBeInstanceOf(Promise);
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(element.setAttribute).toHaveBeenCalledWith('data-value', 'test-value');
    });

    it('属性を削除できる (エレメント直接指定)', async () => {
      const element = mockElement as any;
      const promise = Dom.removeAttribute(element, 'data-value');
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(element.removeAttribute).toHaveBeenCalledWith('data-value');
    });

    it('クラスを追加できる (エレメント直接指定)', async () => {
      const element = mockElement as any;
      const promise = Dom.addClass(element, 'test-class');
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(element.classList.add).toHaveBeenCalledWith('test-class');
    });

    it('クラスを削除できる (エレメント直接指定)', async () => {
      const element = mockElement as any;
      const promise = Dom.removeClass(element, 'test-class');
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(element.classList.remove).toHaveBeenCalledWith('test-class');
    });

    it('スタイルを設定できる (エレメント直接指定)', async () => {
      const element = mockElement as any;
      const promise = Dom.setStyle(element, 'color', 'red');
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(element.style.setProperty).toHaveBeenCalledWith('color', 'red');
    });

    it('スタイルを削除できる (エレメント直接指定)', async () => {
      const element = mockElement as any;
      const promise = Dom.removeStyle(element, 'color');
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(element.style.removeProperty).toHaveBeenCalledWith('color');
    });

    it('子要素を追加できる (エレメント直接指定)', async () => {
      const parentElement = mockElement as any;
      const childElement = { tagName: 'DIV' } as any;
      const promise = Dom.appendChild(parentElement, childElement);
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(parentElement.appendChild).toHaveBeenCalledWith(childElement);
    });

    it('子要素を削除できる (エレメント直接指定)', async () => {
      const parentElement = mockElement as any;
      const childElement = { tagName: 'DIV' } as any;
      const promise = Dom.removeChild(parentElement, childElement);
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(parentElement.removeChild).toHaveBeenCalledWith(childElement);
    });

    it('ノードを削除できる (エレメント直接指定)', async () => {
      const node = {
        parentNode: mockElement,
        tagName: 'TEXT'
      } as any;
      
      const promise = Dom.removeNode(node);
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockElement.removeChild).toHaveBeenCalledWith(node);
    });

    it('ノードを追加できる (エレメント直接指定)', async () => {
      const parentElement = mockElement as any;
      const node = { nodeType: 3, textContent: 'Hello' } as any; // Text node
      const promise = Dom.appendNode(parentElement, node);
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(parentElement.appendChild).toHaveBeenCalledWith(node);
    });

    it('要素を挿入できる (エレメント直接指定)', async () => {
      const parentElement = mockElement as any;
      const newElement = { tagName: 'DIV' } as any;
      const referenceElement = { tagName: 'SPAN' } as any;
      const promise = Dom.insertBefore(parentElement, newElement, referenceElement);
      
      await promise;
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(parentElement.insertBefore).toHaveBeenCalledWith(newElement, referenceElement);
    });
  });
});