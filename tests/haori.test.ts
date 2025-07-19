import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Haori, init, getHaori, refresh } from '../src/haori';

// Dom APIのモック
vi.mock('../src/dom', () => ({
  Dom: {
    setAttribute: vi.fn().mockImplementation((element, name, value) => {
      element.setAttribute(name, value);
      return Promise.resolve();
    }),
    removeAttribute: vi.fn().mockImplementation((element, name) => {
      element.removeAttribute(name);
      return Promise.resolve();
    }),
    setStyle: vi.fn().mockImplementation((element, property, value) => {
      element.style[property] = value;
      return Promise.resolve();
    }),
    removeStyle: vi.fn().mockImplementation((element, property) => {
      element.style.removeProperty(property);
      return Promise.resolve();
    }),
    appendChild: vi.fn().mockImplementation((parent, child) => {
      parent.appendChild(child);
      return Promise.resolve();
    }),
    appendNode: vi.fn().mockImplementation((parent, node) => {
      parent.appendChild(node);
      return Promise.resolve();
    }),
    removeChild: vi.fn().mockImplementation((parent, child) => {
      parent.removeChild(child);
      return Promise.resolve();
    }),
    removeNode: vi.fn().mockImplementation((node) => {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
      return Promise.resolve();
    }),
    insertBefore: vi.fn().mockImplementation((parent, newNode, referenceNode) => {
      parent.insertBefore(newNode, referenceNode);
      return Promise.resolve();
    }),
  }
}));

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
    appendChild: vi.fn((child: any) => {
      child.parentNode = document.body;
      child.parentElement = document.body;
    }),
    removeChild: vi.fn((child: any) => {
      child.parentNode = null;
      child.parentElement = null;
    }),
  },
  writable: true
});

// document.createElement のモック
Object.defineProperty(document, 'createElement', {
  value: vi.fn((tagName) => {
    const element: any = {
      tagName: tagName.toUpperCase(),
      style: {},
      attributes: {} as Record<string, string>,
      childNodes: [] as any[],
      parentNode: null,
      parentElement: null,
      textContent: '',
      innerHTML: '',
      getAttribute: vi.fn((name: string) => element.attributes[name] || null),
      setAttribute: vi.fn((name: string, value: string) => { element.attributes[name] = value; }),
      removeAttribute: vi.fn((name: string) => { delete element.attributes[name]; }),
      hasAttribute: vi.fn((name: string) => name in element.attributes),
      appendChild: vi.fn((child: any) => {
        element.childNodes.push(child);
        child.parentNode = element;
        child.parentElement = element;
      }),
      removeChild: vi.fn((child: any) => {
        const index = element.childNodes.indexOf(child);
        if (index > -1) {
          element.childNodes.splice(index, 1);
          child.parentNode = null;
          child.parentElement = null;
        }
      }),
      querySelectorAll: vi.fn(() => []),
    };
    return element;
  }),
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

  describe('data-if機能', () => {
    let testContainer: HTMLDivElement;
    let haori: Haori;

    beforeEach(async () => {
      // テスト用のコンテナを作成
      testContainer = document.createElement('div') as HTMLDivElement;
      // testContainerにも適切なappendChildメソッドを追加
      (testContainer as any).appendChild = vi.fn((child: any) => {
        (testContainer as any).childNodes.push(child);
        child.parentNode = testContainer;
        child.parentElement = testContainer;
        return child;
      });
      document.body.appendChild(testContainer);

      // Haoriインスタンスを初期化
      haori = await init({
        root: testContainer,
        debug: true
      });
    });

    afterEach(() => {
      if (testContainer.parentNode) {
        testContainer.parentNode.removeChild(testContainer);
      }
    });

    it('data-if="true"で要素が表示される', async () => {
      // data-if属性を持つ要素を作成
      const element = document.createElement('div');
      element.setAttribute('data-bind', '{"visible": true}');
      element.setAttribute('data-if', 'visible');
      element.textContent = 'テスト要素';
      testContainer.appendChild(element);

      // スコープを作成してdata-ifを処理
      await haori['createBindingScope'](element);

      // 要素が表示されていることを確認
      const scope = haori.getScope(element);
      expect(scope?.visible).toBe(true);
      expect(element.hasAttribute('data-bind-false')).toBe(false);
    });

    it('data-if="false"で要素が非表示になる', async () => {
      const element = document.createElement('div');
      element.setAttribute('data-bind', '{"visible": false}');
      element.setAttribute('data-if', 'visible');
      element.textContent = 'テスト要素';
      testContainer.appendChild(element);

      await haori['createBindingScope'](element);

      const scope = haori.getScope(element);
      expect(scope?.visible).toBe(false);
      expect(element.hasAttribute('data-bind-false')).toBe(true);
    });

    it('hor-if属性も正しく処理される', async () => {
      const element = document.createElement('div');
      element.setAttribute('data-bind', '{"show": true}');
      element.setAttribute('hor-if', 'show');
      element.textContent = 'テスト要素';
      testContainer.appendChild(element);

      await haori['createBindingScope'](element);

      const scope = haori.getScope(element);
      expect(scope?.visible).toBe(true);
    });

    it('複雑な式を評価できる', async () => {
      const element = document.createElement('div');
      element.setAttribute('data-bind', '{"count": 5, "limit": 3}');
      element.setAttribute('data-if', 'count > limit');
      element.textContent = 'テスト要素';
      testContainer.appendChild(element);

      await haori['createBindingScope'](element);

      const scope = haori.getScope(element);
      expect(scope?.visible).toBe(true);
    });

    it('偽値（0, "", null, undefined）で要素が非表示になる', async () => {
      const testCases = [
        { data: '{"value": 0}', expression: 'value' },
        { data: '{"value": ""}', expression: 'value' },
        { data: '{"value": null}', expression: 'value' },
        { data: '{"value": false}', expression: 'value' }
      ];

      for (const testCase of testCases) {
        const element = document.createElement('div');
        element.setAttribute('data-bind', testCase.data);
        element.setAttribute('data-if', testCase.expression);
        element.textContent = 'テスト要素';
        testContainer.appendChild(element);

        await haori['createBindingScope'](element);

        const scope = haori.getScope(element);
        expect(scope?.visible).toBe(false);
        
        // クリーンアップ
        testContainer.removeChild(element);
      }
    });

    it('NaN値で要素が非表示になる', async () => {
      const element = document.createElement('div');
      element.setAttribute('data-bind', '{"value": "abc"}');
      element.setAttribute('data-if', 'parseFloat(value)');
      element.textContent = 'テスト要素';
      testContainer.appendChild(element);

      await haori['createBindingScope'](element);

      const scope = haori.getScope(element);
      expect(scope?.visible).toBe(false);
    });

    it('data-if属性がない場合は何も処理されない', async () => {
      const element = document.createElement('div');
      element.setAttribute('data-bind', '{"visible": false}');
      element.textContent = 'テスト要素';
      testContainer.appendChild(element);

      await haori['createBindingScope'](element);

      const scope = haori.getScope(element);
      // data-if属性がないので、setVisibleは呼ばれず、デフォルト状態のまま
      expect(scope?.visible).toBe(true);
    });

    it('式の評価エラー時は評価結果がnull/undefinedで非表示になる', async () => {
      const element = document.createElement('div');
      element.setAttribute('data-bind', '{"name": "test"}');
      element.setAttribute('data-if', 'undefined.property'); // エラーを発生させる式
      element.textContent = 'テスト要素';
      testContainer.appendChild(element);

      await haori['createBindingScope'](element);

      const scope = haori.getScope(element);
      
      // evaluateExpressionSafeはエラー時nullを返すため、結果は非表示になる
      expect(scope?.visible).toBe(false);
    });

    it('親スコープの値も参照できる', async () => {
      // より直接的なテスト：親スコープを手動で作成して検証
      const parentElement = document.createElement('div');
      const childElement = document.createElement('div');
      childElement.setAttribute('data-if', 'parentValue');
      
      // 親スコープを手動で作成（BindingScopeのコンストラクタ：node, data, parent）
      const parentScope = new (await import('../src/scope')).BindingScope(parentElement, { parentValue: true }, undefined);
      
      // 子スコープを親スコープ付きで作成
      const childScope = new (await import('../src/scope')).BindingScope(childElement, { childValue: "test" }, parentScope);
      
      // data-ifを手動で処理
      await haori['processDataIfAttribute'](childScope);
      
      // 検証
      expect(childScope.parent).toBe(parentScope);
      expect(childScope.visible).toBe(true);
      
      // 親の値をfalseに変更してテスト
      parentScope.updateData({ parentValue: false });
      await haori['processDataIfAttribute'](childScope);
      expect(childScope.visible).toBe(false);
    });
  });
});