import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Haori, init, getHaori, refresh } from '../src/haori';

// DOMのモック
Object.defineProperty(document, 'querySelector', {
  value: vi.fn(),
  writable: true
});

Object.defineProperty(document, 'querySelectorAll', {
  value: vi.fn(() => []),
  writable: true
});

Object.defineProperty(document, 'body', {
  value: {
    querySelectorAll: vi.fn(() => []),
    hasAttribute: vi.fn(() => false),
    getAttribute: vi.fn(() => null),
  },
  writable: true
});

// document.addEventListenerのモック
Object.defineProperty(document, 'addEventListener', {
  value: vi.fn(),
  writable: true
});

// MutationObserverのモック
Object.defineProperty(window, 'MutationObserver', {
  value: vi.fn().mockImplementation((callback) => ({
    observe: vi.fn(),
    disconnect: vi.fn(),
    takeRecords: vi.fn(),
  })),
  writable: true
});

describe('Haori初期化と変更監視', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    const haori = getHaori();
    if (haori) {
      haori.destroy();
    }
  });

  describe('初期化', () => {
    it('Haoriインスタンスをシングルトンとして取得できる', () => {
      const instance1 = Haori.getInstance();
      const instance2 = Haori.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('initで初期化を実行できる', async () => {
      const haori = await init({
        debug: true
      });
      
      expect(haori).toBeInstanceOf(Haori);
      expect(getHaori()).toBe(haori);
    });
  });

  describe('DOM監視', () => {
    it('MutationObserverが設定される', async () => {
      await init();
      
      expect(window.MutationObserver).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('手動操作', () => {
    it('手動でリフレッシュを実行できる', async () => {
      await init();
      
      await refresh();
      
      // エラーなく実行されることを確認
      expect(true).toBe(true);
    });
  });
});