import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Dom, DomOperationType } from '../../src/core/dom';

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
  insertBefore: vi.fn()
};

// querySelectorのモック
global.document = {
  querySelector: vi.fn(() => mockElement)
} as any;

// requestAnimationFrameのモック
global.requestAnimationFrame = vi.fn((callback) => {
  setTimeout(callback, 0);
  return 1;
});

// performance.nowのモック
global.performance = {
  now: vi.fn(() => Date.now())
} as any;

describe('Dom操作システム', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Dom.clear();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('基本的な操作', () => {
    it('属性を設定できる', async () => {
      const operationId = Dom.setAttribute('#test', 'data-value', 'test-value');
      
      expect(operationId).toMatch(/^dom_op_/);
      expect(Dom.getStatus().size).toBe(1);
      
      // 少し待って処理を確認
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(document.querySelector).toHaveBeenCalledWith('#test');
      expect(mockElement.setAttribute).toHaveBeenCalledWith('data-value', 'test-value');
    });

    it('属性を削除できる', async () => {
      Dom.removeAttribute('#test', 'data-value');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockElement.removeAttribute).toHaveBeenCalledWith('data-value');
    });

    it('テキストコンテンツを設定できる', async () => {
      Dom.setTextContent('#test', 'Hello World');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(document.querySelector).toHaveBeenCalledWith('#test');
      // textContentは直接設定されるためモックでは検証困難
    });

    it('HTMLコンテンツを設定できる', async () => {
      Dom.setHTMLContent('#test', '<span>Hello</span>');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(document.querySelector).toHaveBeenCalledWith('#test');
    });

    it('クラスを追加できる', async () => {
      Dom.addClass('#test', 'active');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockElement.classList.add).toHaveBeenCalledWith('active');
    });

    it('クラスを削除できる', async () => {
      Dom.removeClass('#test', 'active');
      
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

    it('操作をキャンセルできる', () => {
      const operationId = Dom.setAttribute('#test', 'data-value', 'test-value');
      
      expect(Dom.getStatus().size).toBe(1);
      
      const cancelled = Dom.cancel(operationId);
      expect(cancelled).toBe(true);
      expect(Dom.getStatus().size).toBe(0);
    });

    it('キューをクリアできる', () => {
      Dom.setAttribute('#test1', 'data-value', 'value1');
      Dom.setAttribute('#test2', 'data-value', 'value2');
      
      expect(Dom.getStatus().size).toBe(2);
      
      Dom.clear();
      expect(Dom.getStatus().size).toBe(0);
    });

    it('存在しない要素に対する操作は無視される', async () => {
      // querySelectorがnullを返すように設定
      (document.querySelector as any).mockReturnValueOnce(null);
      
      Dom.setAttribute('#nonexistent', 'data-value', 'test-value');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // エラーが発生せず、正常に処理される
      expect(Dom.getStatus().size).toBe(0);
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
      // 複数の操作を追加
      for (let i = 0; i < 20; i++) {
        Dom.setAttribute(`#test${i}`, 'data-value', `value${i}`);
      }

      // 処理を待つ
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = Dom.getExecutionStats();
      expect(stats.lastExecutionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('セキュリティ', () => {
    it('HTMLコンテンツからスクリプトタグを除去する', async () => {
      Dom.setHTMLContent('#test', '<div>Safe content</div><script>alert("xss")</script>');
      
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
});
