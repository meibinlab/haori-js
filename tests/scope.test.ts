import {
  BindingScope,
  EvaluatedTextNode,
  EvaluatedAttribute,
  scopeMap,
  findParentScope,
  resolveScope,
  bindScope,
  updateBindingData,
  rebindScope,
  deleteScope,
  setScopeVisible,
  getScope,
  getResolvedScope,
  addEvaluatedTextNode,
  removeEvaluatedTextNode,
  addStructuralEvaluator,
  removeStructuralEvaluator,
  addEvaluatedAttribute,
  removeEvaluatedAttribute,
  getScopeStats,
} from '../src/scope';

// テスト用のDOM環境をセットアップ
beforeEach(() => {
  // スコープマップをクリア
  scopeMap.clear();
  
  // DOM環境をリセット
  document.body.innerHTML = '';
});

describe('BindingScope', () => {
  describe('findParentScope', () => {
    it('親要素にスコープが存在する場合は親スコープを返す', () => {
      const parent = document.createElement('div');
      const child = document.createElement('div');
      parent.appendChild(child);
      document.body.appendChild(parent);

      const parentScope = bindScope(parent);
      const result = findParentScope(child);

      expect(result).toBe(parentScope);
    });

    it('親要素にスコープが存在しない場合はundefinedを返す', () => {
      const child = document.createElement('div');
      document.body.appendChild(child);

      const result = findParentScope(child);

      expect(result).toBeUndefined();
    });

    it('複数階層の親スコープを正しく検索する', () => {
      const grandParent = document.createElement('div');
      const parent = document.createElement('div');
      const child = document.createElement('div');
      
      grandParent.appendChild(parent);
      parent.appendChild(child);
      document.body.appendChild(grandParent);

      const grandParentScope = bindScope(grandParent);
      const result = findParentScope(child);

      expect(result).toBe(grandParentScope);
    });
  });

  describe('resolveScope', () => {
    it('単一スコープの場合はそのスコープのデータを返す', () => {
      const element = document.createElement('div');
      element.setAttribute('data-bind', '{"name": "Alice", "age": 30}');
      
      const scope = bindScope(element);
      const resolved = resolveScope(scope);

      expect(resolved).toEqual({ name: 'Alice', age: 30 });
    });

    it('親子スコープの場合は親から子の順でマージする', () => {
      const parent = document.createElement('div');
      const child = document.createElement('div');
      parent.appendChild(child);
      
      parent.setAttribute('data-bind', '{"name": "Alice", "role": "admin"}');
      child.setAttribute('data-bind', '{"name": "Bob", "age": 25}');

      const parentScope = bindScope(parent);
      const childScope = bindScope(child, parentScope);
      const resolved = resolveScope(childScope);

      expect(resolved).toEqual({ name: 'Bob', role: 'admin', age: 25 });
    });

    it('3階層のスコープも正しくマージする', () => {
      const grandParent = document.createElement('div');
      const parent = document.createElement('div');
      const child = document.createElement('div');
      
      grandParent.appendChild(parent);
      parent.appendChild(child);
      
      grandParent.setAttribute('data-bind', '{"a": 1, "b": 2, "c": 3}');
      parent.setAttribute('data-bind', '{"b": 20, "d": 4}');
      child.setAttribute('data-bind', '{"c": 300, "e": 5}');

      const grandParentScope = bindScope(grandParent);
      const parentScope = bindScope(parent, grandParentScope);
      const childScope = bindScope(child, parentScope);
      const resolved = resolveScope(childScope);

      expect(resolved).toEqual({ a: 1, b: 20, c: 300, d: 4, e: 5 });
    });
  });

  describe('bindScope', () => {
    it('data-bind属性を持つ要素にスコープを作成する', () => {
      const element = document.createElement('div');
      element.setAttribute('data-bind', '{"name": "Alice"}');

      const scope = bindScope(element);

      expect(scope.node).toBe(element);
      expect(scope.data).toEqual({ name: 'Alice' });
      expect(scope.visible).toBe(true);
      expect(scope.parent).toBeUndefined();
      expect(scope.children).toEqual([]);
      expect(scopeMap.get(element)).toBe(scope);
    });

    it('data-bind属性がない要素には空のデータでスコープを作成する', () => {
      const element = document.createElement('div');

      const scope = bindScope(element);

      expect(scope.data).toEqual({});
    });

    it('親スコープを指定した場合は親子関係を構築する', () => {
      const parent = document.createElement('div');
      const child = document.createElement('div');
      
      const parentScope = bindScope(parent);
      const childScope = bindScope(child, parentScope);

      expect(childScope.parent).toBe(parentScope);
      expect(parentScope.children).toContain(childScope);
    });

    it('既存のスコープがある場合は警告を出して既存のスコープを返す', () => {
      const element = document.createElement('div');
      
      const scope1 = bindScope(element);
      const scope2 = bindScope(element);

      expect(scope1).toBe(scope2);
    });

    it('不正なJSON形式のdata-bind属性は空オブジェクトとして扱う', () => {
      const element = document.createElement('div');
      element.setAttribute('data-bind', 'invalid json');

      const scope = bindScope(element);

      expect(scope.data).toEqual({});
    });
  });

  describe('updateBindingData', () => {
    it('スコープのデータを更新する', () => {
      const element = document.createElement('div');
      element.setAttribute('data-bind', '{"name": "Alice"}');
      
      const scope = bindScope(element);
      const newData = { name: 'Bob', age: 25 };
      
      updateBindingData(element, newData);

      expect(scope.data).toEqual(newData);
      expect(element.getAttribute('data-bind')).toBe(JSON.stringify(newData));
    });

    it('スコープが存在しない場合は警告を出す', () => {
      const element = document.createElement('div');
      
      // 警告が出ることを確認（実際の警告内容は log.ts に依存）
      expect(() => {
        updateBindingData(element, { name: 'Alice' });
      }).not.toThrow();
    });
  });

  describe('rebindScope', () => {
    it('visible=falseのスコープは再評価をスキップする', () => {
      const element = document.createElement('div');
      const scope = bindScope(element);
      scope.visible = false;

      const mockEvaluator = vi.fn();
      scope.evaluatedTextNodes.set(document.createTextNode('test'), {
        textNode: document.createTextNode('test'),
        originalValue: 'test',
        evaluator: mockEvaluator,
      });

      rebindScope(scope);

      expect(mockEvaluator).not.toHaveBeenCalled();
    });

    it('visible=trueのスコープは全ての評価関数を実行する', () => {
      const element = document.createElement('div');
      const scope = bindScope(element);

      const textNode = document.createTextNode('test');
      const mockTextEvaluator = vi.fn();
      const mockStructuralEvaluator = vi.fn();
      const mockAttrEvaluator = vi.fn();

      scope.evaluatedTextNodes.set(textNode, {
        textNode,
        originalValue: 'test',
        evaluator: mockTextEvaluator,
      });

      const attr = document.createAttribute('data-test');
      scope.structuralEvaluators.set(attr, mockStructuralEvaluator);

      scope.evaluatedAttrs.set('test-attr', {
        attr,
        originalValue: 'test',
        evaluator: mockAttrEvaluator,
      });

      rebindScope(scope);

      expect(mockTextEvaluator).toHaveBeenCalled();
      expect(mockStructuralEvaluator).toHaveBeenCalled();
      expect(mockAttrEvaluator).toHaveBeenCalled();
    });

    it('子スコープも再帰的に再評価する', () => {
      const parent = document.createElement('div');
      const child = document.createElement('div');
      
      const parentScope = bindScope(parent);
      const childScope = bindScope(child, parentScope);

      const mockChildEvaluator = vi.fn();
      const textNode = document.createTextNode('child');
      childScope.evaluatedTextNodes.set(textNode, {
        textNode,
        originalValue: 'child',
        evaluator: mockChildEvaluator,
      });

      rebindScope(parentScope);

      expect(mockChildEvaluator).toHaveBeenCalled();
    });

    it('評価関数でエラーが発生しても処理を続行する', () => {
      const element = document.createElement('div');
      const scope = bindScope(element);

      const textNode = document.createTextNode('test');
      const errorEvaluator = vi.fn(() => {
        throw new Error('Test error');
      });
      const normalEvaluator = vi.fn();

      scope.evaluatedTextNodes.set(textNode, {
        textNode,
        originalValue: 'test',
        evaluator: errorEvaluator,
      });

      const attr = document.createAttribute('data-test');
      scope.structuralEvaluators.set(attr, normalEvaluator);

      expect(() => rebindScope(scope)).not.toThrow();
      expect(errorEvaluator).toHaveBeenCalled();
      expect(normalEvaluator).toHaveBeenCalled();
    });
  });

  describe('deleteScope', () => {
    it('スコープとその子スコープを削除する', () => {
      const parent = document.createElement('div');
      const child = document.createElement('div');
      
      const parentScope = bindScope(parent);
      const childScope = bindScope(child, parentScope);

      deleteScope(parent);

      expect(scopeMap.has(parent)).toBe(false);
      expect(scopeMap.has(child)).toBe(false);
    });

    it('親の子リストからスコープを削除する', () => {
      const parent = document.createElement('div');
      const child = document.createElement('div');
      
      const parentScope = bindScope(parent);
      const childScope = bindScope(child, parentScope);

      deleteScope(child);

      expect(parentScope.children).not.toContain(childScope);
    });

    it('存在しないスコープを削除しようとしても例外は発生しない', () => {
      const element = document.createElement('div');
      
      expect(() => deleteScope(element)).not.toThrow();
    });
  });

  describe('setScopeVisible', () => {
    it('スコープの表示状態を設定する', () => {
      const element = document.createElement('div');
      const scope = bindScope(element);

      setScopeVisible(element, false);
      expect(scope.visible).toBe(false);

      setScopeVisible(element, true);
      expect(scope.visible).toBe(true);
    });

    it('visible=trueになったとき再評価を実行する', () => {
      const element = document.createElement('div');
      const scope = bindScope(element);
      scope.visible = false;

      const mockEvaluator = vi.fn();
      const textNode = document.createTextNode('test');
      scope.evaluatedTextNodes.set(textNode, {
        textNode,
        originalValue: 'test',
        evaluator: mockEvaluator,
      });

      setScopeVisible(element, true);

      expect(mockEvaluator).toHaveBeenCalled();
    });

    it('存在しないスコープには何もしない', () => {
      const element = document.createElement('div');
      
      expect(() => setScopeVisible(element, false)).not.toThrow();
    });
  });

  describe('getScope', () => {
    it('要素に対応するスコープを取得する', () => {
      const element = document.createElement('div');
      const scope = bindScope(element);

      const result = getScope(element);

      expect(result).toBe(scope);
    });

    it('スコープが存在しない場合はundefinedを返す', () => {
      const element = document.createElement('div');
      
      const result = getScope(element);

      expect(result).toBeUndefined();
    });
  });

  describe('getResolvedScope', () => {
    it('要素に対応する解決済みスコープを取得する', () => {
      const element = document.createElement('div');
      element.setAttribute('data-bind', '{"name": "Alice"}');
      
      bindScope(element);
      const resolved = getResolvedScope(element);

      expect(resolved).toEqual({ name: 'Alice' });
    });

    it('スコープが存在しない場合は空オブジェクトを返す', () => {
      const element = document.createElement('div');
      
      const resolved = getResolvedScope(element);

      expect(resolved).toEqual({});
    });
  });

  describe('addEvaluatedTextNode', () => {
    it('テキストノード評価を追加する', () => {
      const element = document.createElement('div');
      const scope = bindScope(element);
      const textNode = document.createTextNode('test');
      const mockEvaluator = vi.fn();

      addEvaluatedTextNode(element, textNode, 'Hello {{name}}', mockEvaluator);

      expect(scope.evaluatedTextNodes.has(textNode)).toBe(true);
      const evalInfo = scope.evaluatedTextNodes.get(textNode);
      expect(evalInfo?.originalValue).toBe('Hello {{name}}');
      expect(evalInfo?.evaluator).toBe(mockEvaluator);
    });

    it('カスタム評価関数がない場合はデフォルト評価関数を使用する', () => {
      const element = document.createElement('div');
      element.setAttribute('data-bind', '{"name": "Alice"}');
      const scope = bindScope(element);
      const textNode = document.createTextNode('test');

      addEvaluatedTextNode(element, textNode, 'Hello {{name}}');

      const evalInfo = scope.evaluatedTextNodes.get(textNode);
      expect(evalInfo?.evaluator).toBeDefined();
      
      // デフォルト評価関数を実行してテキストが更新されることを確認
      evalInfo?.evaluator();
      expect(textNode.textContent).toBe('Hello Alice');
    });

    it('スコープが存在しない場合は警告を出す', () => {
      const element = document.createElement('div');
      const textNode = document.createTextNode('test');

      expect(() => {
        addEvaluatedTextNode(element, textNode, 'Hello {{name}}');
      }).not.toThrow();
    });
  });

  describe('removeEvaluatedTextNode', () => {
    it('テキストノード評価を削除する', () => {
      const element = document.createElement('div');
      const scope = bindScope(element);
      const textNode = document.createTextNode('test');

      addEvaluatedTextNode(element, textNode, 'Hello {{name}}');
      expect(scope.evaluatedTextNodes.has(textNode)).toBe(true);

      removeEvaluatedTextNode(element, textNode);
      expect(scope.evaluatedTextNodes.has(textNode)).toBe(false);
    });

    it('存在しないテキストノードを削除しようとしても例外は発生しない', () => {
      const element = document.createElement('div');
      const scope = bindScope(element);
      const textNode = document.createTextNode('test');

      expect(() => {
        removeEvaluatedTextNode(element, textNode);
      }).not.toThrow();
    });
  });

  describe('addStructuralEvaluator', () => {
    it('構造制御属性評価を追加する', () => {
      const element = document.createElement('div');
      const scope = bindScope(element);
      const attr = document.createAttribute('data-if');
      const mockEvaluator = vi.fn();

      addStructuralEvaluator(element, attr, mockEvaluator);

      expect(scope.structuralEvaluators.has(attr)).toBe(true);
      expect(scope.structuralEvaluators.get(attr)).toBe(mockEvaluator);
    });

    it('スコープが存在しない場合は警告を出す', () => {
      const element = document.createElement('div');
      const attr = document.createAttribute('data-if');
      const mockEvaluator = vi.fn();

      expect(() => {
        addStructuralEvaluator(element, attr, mockEvaluator);
      }).not.toThrow();
    });
  });

  describe('removeStructuralEvaluator', () => {
    it('構造制御属性評価を削除する', () => {
      const element = document.createElement('div');
      const scope = bindScope(element);
      const attr = document.createAttribute('data-if');
      const mockEvaluator = vi.fn();

      addStructuralEvaluator(element, attr, mockEvaluator);
      expect(scope.structuralEvaluators.has(attr)).toBe(true);

      removeStructuralEvaluator(element, attr);
      expect(scope.structuralEvaluators.has(attr)).toBe(false);
    });

    it('存在しない属性を削除しようとしても例外は発生しない', () => {
      const element = document.createElement('div');
      const scope = bindScope(element);
      const attr = document.createAttribute('data-if');

      expect(() => {
        removeStructuralEvaluator(element, attr);
      }).not.toThrow();
    });
  });

  describe('addEvaluatedAttribute', () => {
    it('属性評価を追加する', () => {
      const element = document.createElement('div');
      const scope = bindScope(element);
      const attr = document.createAttribute('title');
      const mockEvaluator = vi.fn();

      addEvaluatedAttribute(element, 'title', attr, 'Hello {{name}}', mockEvaluator);

      expect(scope.evaluatedAttrs.has('title')).toBe(true);
      const evalInfo = scope.evaluatedAttrs.get('title');
      expect(evalInfo?.originalValue).toBe('Hello {{name}}');
      expect(evalInfo?.evaluator).toBe(mockEvaluator);
    });

    it('カスタム評価関数がない場合はデフォルト評価関数を使用する', () => {
      const element = document.createElement('div');
      element.setAttribute('data-bind', '{"name": "Alice"}');
      const scope = bindScope(element);
      const attr = document.createAttribute('title');

      addEvaluatedAttribute(element, 'title', attr, 'Hello {{name}}');

      const evalInfo = scope.evaluatedAttrs.get('title');
      expect(evalInfo?.evaluator).toBeDefined();
      
      // デフォルト評価関数を実行して属性が更新されることを確認
      evalInfo?.evaluator();
      expect(attr.value).toBe('Hello Alice');
    });

    it('スコープが存在しない場合は警告を出す', () => {
      const element = document.createElement('div');
      const attr = document.createAttribute('title');

      expect(() => {
        addEvaluatedAttribute(element, 'title', attr, 'Hello {{name}}');
      }).not.toThrow();
    });
  });

  describe('removeEvaluatedAttribute', () => {
    it('属性評価を削除する', () => {
      const element = document.createElement('div');
      const scope = bindScope(element);
      const attr = document.createAttribute('title');

      addEvaluatedAttribute(element, 'title', attr, 'Hello {{name}}');
      expect(scope.evaluatedAttrs.has('title')).toBe(true);

      removeEvaluatedAttribute(element, 'title');
      expect(scope.evaluatedAttrs.has('title')).toBe(false);
    });

    it('存在しない属性を削除しようとしても例外は発生しない', () => {
      const element = document.createElement('div');
      const scope = bindScope(element);

      expect(() => {
        removeEvaluatedAttribute(element, 'title');
      }).not.toThrow();
    });
  });

  describe('getScopeStats', () => {
    it('スコープの統計情報を取得する', () => {
      const element1 = document.createElement('div');
      const element2 = document.createElement('div');
      
      const scope1 = bindScope(element1);
      const scope2 = bindScope(element2);
      
      // テキストノード評価を追加
      const textNode = document.createTextNode('test');
      addEvaluatedTextNode(element1, textNode, 'test');
      
      // 構造制御属性評価を追加
      const attr = document.createAttribute('data-if');
      addStructuralEvaluator(element1, attr, vi.fn());
      
      // 属性評価を追加
      const titleAttr = document.createAttribute('title');
      addEvaluatedAttribute(element1, 'title', titleAttr, 'test');
      
      // scope2を非表示にする
      scope2.visible = false;

      const stats = getScopeStats();

      expect(stats.totalScopes).toBe(2);
      expect(stats.visibleScopes).toBe(1);
      expect(stats.textNodeEvaluatorsCount).toBe(1);
      expect(stats.structuralEvaluatorsCount).toBe(1);
      expect(stats.evaluatedAttrsCount).toBe(1);
    });

    it('スコープがない場合はすべて0を返す', () => {
      const stats = getScopeStats();

      expect(stats.totalScopes).toBe(0);
      expect(stats.visibleScopes).toBe(0);
      expect(stats.textNodeEvaluatorsCount).toBe(0);
      expect(stats.structuralEvaluatorsCount).toBe(0);
      expect(stats.evaluatedAttrsCount).toBe(0);
    });
  });
});
