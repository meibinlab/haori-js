/**
 * @fileoverview BindingScope テスト
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';

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

import { 
  BindingScope, 
  createBindingScope, 
  getBindingScope, 
  removeBindingScope,
  clearScopeMap,
  getScopeMapSize,
  createTextEvaluator,
  processTextPlaceholders,
  removeElement,
  cloneElementTo,
  type EvaluatedAttribute,
  type EvaluatedTextContent
} from '../src/scope';

describe('BindingScope', () => {
  let testElement: Element;

  beforeEach(async () => {
    // テスト前にスコープマップをクリア
    await clearScopeMap();
    
    // テスト用の要素を作成
    testElement = document.createElement('div');
    testElement.id = 'test';
  });

  describe('constructor', () => {
    test('基本的なスコープを作成できる', () => {
      const data = { name: '田中', age: 30 };
      const scope = new BindingScope(testElement, data);

      expect(scope.node).toBe(testElement);
      expect(scope.data).toEqual(data);
      expect(scope.parent).toBeUndefined();
      expect(scope.children).toEqual([]);
      expect(scope.visible).toBe(true);
      expect(scope.evaluatedAttrs).toEqual([]);
      expect(scope.evaluatedTextContents).toEqual([]);
    });

    test('親スコープとの関係を正しく設定できる', () => {
      const parentElement = document.createElement('div');
      const parentScope = new BindingScope(parentElement, { role: '管理者' });
      
      const childScope = new BindingScope(testElement, { name: '田中' }, parentScope);

      expect(childScope.parent).toBe(parentScope);
      expect(parentScope.children).toContain(childScope);
    });
  });

  describe('getMergedScope', () => {
    test('単一スコープのデータをそのまま返す', () => {
      const data = { name: '田中', age: 30 };
      const scope = new BindingScope(testElement, data);

      const merged = scope.getMergedScope();
      expect(merged).toEqual(data);
    });

    test('親子スコープを正しくマージできる', () => {
      const parentElement = document.createElement('div');
      const parentScope = new BindingScope(parentElement, { 
        role: '管理者', 
        department: '開発部'
      });
      
      const childScope = new BindingScope(testElement, { 
        name: '田中', 
        age: 30 
      }, parentScope);

      const merged = childScope.getMergedScope();
      expect(merged).toEqual({
        role: '管理者',
        department: '開発部',
        name: '田中',
        age: 30
      });
    });

    test('同じキーが存在する場合、子の値が優先される', () => {
      const parentElement = document.createElement('div');
      const parentScope = new BindingScope(parentElement, { 
        user: { name: '山田', role: '管理者' }
      });
      
      const childScope = new BindingScope(testElement, { 
        user: { name: '田中' }
      }, parentScope);

      const merged = childScope.getMergedScope();
      // 子のオブジェクトで完全に上書きされる（マージされない）
      expect(merged.user).toEqual({ name: '田中' });
    });

    test('多層のスコープチェーンを正しく解決できる', () => {
      const grandParentElement = document.createElement('div');
      const grandParentScope = new BindingScope(grandParentElement, { 
        company: 'Haori Inc',
        role: 'スタッフ'
      });
      
      const parentElement = document.createElement('div');
      const parentScope = new BindingScope(parentElement, { 
        department: '開発部',
        role: '管理者'
      }, grandParentScope);
      
      const childScope = new BindingScope(testElement, { 
        name: '田中',
        age: 30
      }, parentScope);

      const merged = childScope.getMergedScope();
      expect(merged).toEqual({
        company: 'Haori Inc',
        role: '管理者', // 親が祖父母の値を上書き
        department: '開発部',
        name: '田中',
        age: 30
      });
    });
  });

  describe('evaluateExpression', () => {
    test('スコープ内の値を正しく評価できる', () => {
      const scope = new BindingScope(testElement, { 
        user: { name: '田中', age: 30 }
      });

      expect(scope.evaluateExpression('user.name')).toBe('田中');
      expect(scope.evaluateExpression('user.age')).toBe(30);
      expect(scope.evaluateExpression('user.name + "さん"')).toBe('田中さん');
    });

    test('親スコープの値も評価できる', () => {
      const parentElement = document.createElement('div');
      const parentScope = new BindingScope(parentElement, { 
        role: '管理者'
      });
      
      const childScope = new BindingScope(testElement, { 
        name: '田中'
      }, parentScope);

      expect(childScope.evaluateExpression('name')).toBe('田中');
      expect(childScope.evaluateExpression('role')).toBe('管理者');
      expect(childScope.evaluateExpression('name + " (" + role + ")"')).toBe('田中 (管理者)');
    });
  });

  describe('updateData', () => {
    test('データを更新し、再評価が実行される', () => {
      const scope = new BindingScope(testElement, { name: '田中' });
      
      let evaluationCount = 0;
      const textNode = document.createTextNode('{{name}}');
      const textEval: EvaluatedTextContent = {
        textNode,
        originalValue: '{{name}}',
        evaluator: () => {
          evaluationCount++;
          textNode.textContent = scope.evaluateExpression('name') as string;
        }
      };
      scope.addEvaluatedTextContent(textEval);

      scope.updateData({ name: '山田', age: 25 });

      expect(scope.data).toEqual({ name: '山田', age: 25 });
      expect(evaluationCount).toBe(1);
    });
  });

  describe('rebind', () => {
    test('表示状態の場合、評価関数が実行される', () => {
      const scope = new BindingScope(testElement, { name: '田中' });
      
      let evaluationCount = 0;
      const textNode = document.createTextNode('{{name}}');
      const textEval: EvaluatedTextContent = {
        textNode,
        originalValue: '{{name}}',
        evaluator: () => {
          evaluationCount++;
        }
      };
      scope.addEvaluatedTextContent(textEval);

      scope.rebind();
      expect(evaluationCount).toBe(1);
    });

    test('非表示状態の場合、評価関数が実行されない', () => {
      const scope = new BindingScope(testElement, { name: '田中' });
      scope.setVisible(false);
      
      let evaluationCount = 0;
      const textNode = document.createTextNode('{{name}}');
      const textEval: EvaluatedTextContent = {
        textNode,
        originalValue: '{{name}}',
        evaluator: () => {
          evaluationCount++;
        }
      };
      scope.addEvaluatedTextContent(textEval);

      scope.rebind();
      expect(evaluationCount).toBe(0);
    });

    test('子スコープも再帰的に再評価される', () => {
      const parentScope = new BindingScope(testElement, { name: '田中' });
      
      const childElement = document.createElement('span');
      const childScope = new BindingScope(childElement, { age: 30 }, parentScope);
      
      let parentEvaluationCount = 0;
      let childEvaluationCount = 0;
      
      const parentTextNode = document.createTextNode('{{name}}');
      const parentTextEval: EvaluatedTextContent = {
        textNode: parentTextNode,
        originalValue: '{{name}}',
        evaluator: () => {
          parentEvaluationCount++;
        }
      };
      parentScope.addEvaluatedTextContent(parentTextEval);
      
      const childTextNode = document.createTextNode('{{age}}');
      const childTextEval: EvaluatedTextContent = {
        textNode: childTextNode,
        originalValue: '{{age}}',
        evaluator: () => {
          childEvaluationCount++;
        }
      };
      childScope.addEvaluatedTextContent(childTextEval);

      parentScope.rebind();
      
      expect(parentEvaluationCount).toBe(1);
      expect(childEvaluationCount).toBe(1);
    });

    test('属性評価も実行される', () => {
      const scope = new BindingScope(testElement, { title: 'テストタイトル' });
      
      const attr = document.createAttribute('title');
      let attributeEvaluationCount = 0;
      
      const attrEval: EvaluatedAttribute = {
        attr,
        originalValue: '{{title}}',
        evaluator: () => {
          attributeEvaluationCount++;
        }
      };
      
      scope.addEvaluatedAttribute(attrEval);
      scope.rebind();
      
      expect(attributeEvaluationCount).toBe(1);
    });

    test('テキストコンテンツ評価も実行される', () => {
      const scope = new BindingScope(testElement, { title: 'テストタイトル' });
      
      const textNode = document.createTextNode('{{title}}');
      let textEvaluationCount = 0;
      
      const textEval: EvaluatedTextContent = {
        textNode,
        originalValue: '{{title}}',
        evaluator: () => {
          textEvaluationCount++;
        }
      };
      
      scope.addEvaluatedTextContent(textEval);
      scope.rebind();
      
      expect(textEvaluationCount).toBe(1);
    });
  });

  describe('setVisible', () => {
    test('表示状態を設定できる', async () => {
      const scope = new BindingScope(testElement, {});
      
      await scope.setVisible(false);
      expect(scope.visible).toBe(false);
      
      await scope.setVisible(true);
      expect(scope.visible).toBe(true);
    });

    test('非表示時にdata-bind-false属性が設定される', async () => {
      const scope = new BindingScope(testElement, {});
      
      await scope.setVisible(false);
      expect(testElement.hasAttribute('data-bind-false')).toBe(true);
      expect((testElement as HTMLElement).style.display).toBe('none');
    });

    test('再表示時にdata-bind-false属性が削除される', async () => {
      const scope = new BindingScope(testElement, {});
      
      await scope.setVisible(false);
      expect(testElement.hasAttribute('data-bind-false')).toBe(true);
      
      await scope.setVisible(true);
      expect(testElement.hasAttribute('data-bind-false')).toBe(false);
    });

    test('非表示時に子ノードがDOMから削除される', async () => {
      testElement.innerHTML = '<span>テスト</span><p>内容</p>';
      expect(testElement.childNodes.length).toBe(2);
      
      const scope = new BindingScope(testElement, {});
      
      await scope.setVisible(false);
      expect(testElement.childNodes.length).toBe(0);
    });

    test('再表示時に子ノードが復活する', async () => {
      testElement.innerHTML = '<span>テスト</span><p>内容</p>';
      const originalHTML = testElement.innerHTML;
      
      const scope = new BindingScope(testElement, {});
      
      await scope.setVisible(false);
      expect(testElement.childNodes.length).toBe(0);
      
      await scope.setVisible(true);
      expect(testElement.innerHTML).toBe(originalHTML);
    });

    test('元のdisplayスタイルが保持・復元される', async () => {
      (testElement as HTMLElement).style.display = 'flex';
      
      const scope = new BindingScope(testElement, {});
      
      await scope.setVisible(false);
      expect((testElement as HTMLElement).style.display).toBe('none');
      
      await scope.setVisible(true);
      expect((testElement as HTMLElement).style.display).toBe('flex');
    });

    test('同じ状態を設定しても処理は実行されない', async () => {
      const scope = new BindingScope(testElement, {});
      
      // 初期状態はtrue
      expect(scope.visible).toBe(true);
      
      // 同じ状態を設定
      await scope.setVisible(true);
      expect(testElement.hasAttribute('data-bind-false')).toBe(false);
    });

    test('表示状態になったときに再評価が実行される', async () => {
      const scope = new BindingScope(testElement, {});
      
      let evaluationCount = 0;
      const textNode = document.createTextNode('test');
      const textEval: EvaluatedTextContent = {
        textNode,
        originalValue: 'test',
        evaluator: () => {
          evaluationCount++;
        }
      };
      scope.addEvaluatedTextContent(textEval);

      await scope.setVisible(false);
      expect(evaluationCount).toBe(0);

      await scope.setVisible(true);
      expect(evaluationCount).toBe(1);
    });
  });

  describe('addChild / removeChild', () => {
    test('子スコープを追加・削除できる', () => {
      const parentScope = new BindingScope(testElement, {});
      const childElement = document.createElement('span');
      const childScope = new BindingScope(childElement, {});

      parentScope.addChild(childScope);
      expect(parentScope.children).toContain(childScope);
      expect(childScope.parent).toBe(parentScope);

      parentScope.removeChild(childScope);
      expect(parentScope.children).not.toContain(childScope);
      expect(childScope.parent).toBeUndefined();
    });

    test('重複した子スコープは追加されない', () => {
      const parentScope = new BindingScope(testElement, {});
      const childElement = document.createElement('span');
      const childScope = new BindingScope(childElement, {});

      parentScope.addChild(childScope);
      parentScope.addChild(childScope); // 重複追加

      expect(parentScope.children.length).toBe(1);
      expect(parentScope.children[0]).toBe(childScope);
    });
  });

  describe('dispose', () => {
    test('スコープとすべての子スコープをクリーンアップできる', async () => {
      const parentScope = new BindingScope(testElement, {});
      
      const childElement = document.createElement('span');
      const childScope = new BindingScope(childElement, {}, parentScope);
      
      const grandchildElement = document.createElement('em');
      const grandchildScope = new BindingScope(grandchildElement, {}, childScope);

      // 評価関数を追加
      const parentTextNode = document.createTextNode('test');
      const parentTextEval: EvaluatedTextContent = {
        textNode: parentTextNode,
        originalValue: 'test',
        evaluator: () => {}
      };
      parentScope.addEvaluatedTextContent(parentTextEval);

      const childTextNode = document.createTextNode('test');
      const childTextEval: EvaluatedTextContent = {
        textNode: childTextNode,
        originalValue: 'test', 
        evaluator: () => {}
      };
      childScope.addEvaluatedTextContent(childTextEval);

      // テキストコンテンツ評価も追加
      const textNode = document.createTextNode('test');
      const textEval: EvaluatedTextContent = {
        textNode,
        originalValue: '{{test}}',
        evaluator: () => {}
      };
      parentScope.addEvaluatedTextContent(textEval);

      // 一部を非表示にしてからクリーンアップ
      await parentScope.setVisible(false);
      await parentScope.dispose();

      expect(parentScope.children.length).toBe(0);
      expect(parentScope.evaluatedTextContents.length).toBe(0);
      expect(childScope.parent).toBeUndefined();
      expect(grandchildScope.parent).toBeUndefined();
      // 非表示状態が復元されているか確認
      expect(testElement.hasAttribute('data-bind-false')).toBe(false);
    });
  });

  describe('toString', () => {
    test('スコープの詳細情報を文字列として返す', () => {
      const scope = new BindingScope(testElement, { name: '田中', age: 30 });
      const childElement = document.createElement('span');
      new BindingScope(childElement, {}, scope);

      const result = scope.toString();
      expect(result).toContain('DIV#test');
      expect(result).toContain('name, age');
      expect(result).toContain('visible: true');
      expect(result).toContain('children: 1');
    });
  });

  describe('clone', () => {
    test('基本的なスコープを複製できる', () => {
      const originalData = { name: '田中', age: 30 };
      const originalScope = new BindingScope(testElement, originalData);
      
      const newData = { name: '山田', age: 25 };
      const clonedScope = originalScope.clone(newData);
      
      expect(clonedScope.data).toEqual(newData);
      expect(clonedScope.node).not.toBe(originalScope.node);
      expect(clonedScope.node.tagName).toBe(originalScope.node.tagName);
      expect(clonedScope.visible).toBe(originalScope.visible);
    });

    test('非表示状態も複製される', async () => {
      testElement.innerHTML = '<p>テスト内容</p>';
      const originalScope = new BindingScope(testElement, { name: '田中' });
      
      await originalScope.setVisible(false);
      
      const clonedScope = originalScope.clone({ name: '山田' });
      
      expect(clonedScope.visible).toBe(false);
      expect(clonedScope.node.hasAttribute('data-bind-false')).toBe(true);
      expect((clonedScope.node as HTMLElement).style.display).toBe('none');
    });

    test('保存された子ノードも複製される', async () => {
      testElement.innerHTML = '<span>子要素1</span><p>子要素2</p>';
      const originalScope = new BindingScope(testElement, { name: '田中' });
      
      // 最初に子要素があることを確認
      expect(originalScope.node.children.length).toBe(2);
      
      await originalScope.setVisible(false); // 子ノードが保存される
      
      // 非表示状態で子要素が削除されていることを確認
      expect(originalScope.node.children.length).toBe(0);
      expect(originalScope.getSavedChildNodes().length).toBe(2);
      
      const clonedScope = originalScope.clone({ name: '山田' });
      
      // クローンも非表示状態で、保存された子ノードがあることを確認
      expect(clonedScope.getSavedChildNodes().length).toBe(2);
      
      // 非表示状態を解除して子ノードが復活することを確認
      await clonedScope.setVisible(true);
      expect(clonedScope.node.children.length).toBe(2);
      expect(clonedScope.node.children[0].textContent).toBe('子要素1');
      expect(clonedScope.node.children[1].textContent).toBe('子要素2');
    });

    test('スコープマップに登録される', () => {
      const originalScope = new BindingScope(testElement, { name: '田中' });
      const clonedScope = originalScope.clone({ name: '山田' });
      
      expect(getBindingScope(clonedScope.node)).toBe(clonedScope);
    });

    test('親スコープを指定できる', () => {
      const parentElement = document.createElement('div');
      const parentScope = new BindingScope(parentElement, { role: '管理者' });
      
      const originalScope = new BindingScope(testElement, { name: '田中' });
      const clonedScope = originalScope.clone({ name: '山田' }, parentScope);
      
      expect(clonedScope.parent).toBe(parentScope);
      expect(parentScope.children).toContain(clonedScope);
    });

    test('子スコープも含めて複製できる', () => {
      // 親要素を設定
      testElement.innerHTML = '<div id="child1"><span id="child2">テスト</span></div>';
      
      const parentScope = new BindingScope(testElement, { parent: 'data' });
      
      // 子スコープを作成
      const child1Element = testElement.querySelector('#child1') as Element;
      const child1Scope = new BindingScope(child1Element, { child1: 'data' }, parentScope);
      
      const child2Element = testElement.querySelector('#child2') as Element;
      const child2Scope = new BindingScope(child2Element, { child2: 'data' }, child1Scope);
      
      // 複製を実行
      const clonedScope = parentScope.clone({ parent: 'new data' });
      
      expect(clonedScope.children.length).toBe(1);
      expect(clonedScope.children[0].children.length).toBe(1);
      expect(clonedScope.data).toEqual({ parent: 'new data' });
      expect(clonedScope.children[0].data).toEqual({ child1: 'data' });
      expect(clonedScope.children[0].children[0].data).toEqual({ child2: 'data' });
    });

    test('複製された要素の構造が保持される', () => {
      testElement.innerHTML = '<div class="container"><p id="text">Hello</p></div>';
      
      const originalScope = new BindingScope(testElement, { message: 'original' });
      const clonedScope = originalScope.clone({ message: 'cloned' });
      
      const clonedContainer = clonedScope.node.querySelector('.container');
      const clonedText = clonedScope.node.querySelector('#text');
      
      expect(clonedContainer).not.toBeNull();
      expect(clonedText).not.toBeNull();
      expect(clonedText?.textContent).toBe('Hello');
    });

    test('複製された子スコープが正しくスコープマップに登録される', () => {
      testElement.innerHTML = '<div id="child">child content</div>';
      
      const parentScope = new BindingScope(testElement, { parent: 'data' });
      const childElement = testElement.querySelector('#child') as Element;
      const childScope = new BindingScope(childElement, { child: 'data' }, parentScope);
      
      const clonedScope = parentScope.clone({ parent: 'new data' });
      const clonedChildElement = clonedScope.node.querySelector('#child') as Element;
      
      expect(getBindingScope(clonedChildElement)).toBeTruthy();
      expect(getBindingScope(clonedChildElement)?.data).toEqual({ child: 'data' });
    });
  });

  describe('remove', () => {
    test('要素とスコープを削除できる', async () => {
      const parentElement = document.createElement('div');
      document.body.appendChild(parentElement);
      
      const scope = new BindingScope(testElement, { name: '田中' });
      parentElement.appendChild(testElement);
      
      expect(document.body.contains(testElement)).toBe(true);
      expect(getBindingScope(testElement)).toBe(scope);
      
      await scope.remove();
      
      expect(document.body.contains(testElement)).toBe(false);
      expect(getBindingScope(testElement)).toBeUndefined();
      
      // クリーンアップ
      if (document.body.contains(parentElement)) {
        document.body.removeChild(parentElement);
      }
    });

    test('子スコープも再帰的に削除される', async () => {
      const parentElement = document.createElement('div');
      document.body.appendChild(parentElement);
      
      testElement.innerHTML = '<div id="child1"><span id="child2">テスト</span></div>';
      parentElement.appendChild(testElement);
      
      const parentScope = new BindingScope(testElement, { parent: 'data' });
      
      const child1Element = testElement.querySelector('#child1') as Element;
      const child1Scope = new BindingScope(child1Element, { child1: 'data' }, parentScope);
      
      const child2Element = testElement.querySelector('#child2') as Element;
      const child2Scope = new BindingScope(child2Element, { child2: 'data' }, child1Scope);
      
      // 削除前の確認
      expect(getBindingScope(testElement)).toBe(parentScope);
      expect(getBindingScope(child1Element)).toBe(child1Scope);
      expect(getBindingScope(child2Element)).toBe(child2Scope);
      expect(getScopeMapSize()).toBe(3);
      
      await parentScope.remove();
      
      // 削除後の確認
      expect(document.body.contains(testElement)).toBe(false);
      expect(getBindingScope(testElement)).toBeUndefined();
      expect(getBindingScope(child1Element)).toBeUndefined();
      expect(getBindingScope(child2Element)).toBeUndefined();
      expect(getScopeMapSize()).toBe(0);
      
      // クリーンアップ
      if (document.body.contains(parentElement)) {
        document.body.removeChild(parentElement);
      }
    });

    test('permanently=falseの場合、DOMからは削除されない', async () => {
      const parentElement = document.createElement('div');
      document.body.appendChild(parentElement);
      
      const scope = new BindingScope(testElement, { name: '田中' });
      parentElement.appendChild(testElement);
      
      expect(document.body.contains(testElement)).toBe(true);
      expect(getBindingScope(testElement)).toBe(scope);
      
      await scope.remove(false);
      
      // DOMには残るがスコープは削除される
      expect(document.body.contains(testElement)).toBe(true);
      expect(getBindingScope(testElement)).toBeUndefined();
      
      // クリーンアップ
      if (document.body.contains(parentElement)) {
        document.body.removeChild(parentElement);
      }
    });

    test('親スコープから削除される', async () => {
      const parentScope = new BindingScope(testElement, { parent: 'data' });
      
      const childElement = document.createElement('div');
      const childScope = new BindingScope(childElement, { child: 'data' }, parentScope);
      
      expect(parentScope.children).toContain(childScope);
      expect(childScope.parent).toBe(parentScope);
      
      await childScope.remove(false);
      
      expect(parentScope.children).not.toContain(childScope);
      expect(childScope.parent).toBeUndefined();
    });
  });

  describe('appendTo / insertBefore / insertAfter / replaceElement', () => {
    test('appendTo - 要素を指定した親の末尾に追加できる', async () => {
      const parentElement = document.createElement('div');
      parentElement.innerHTML = '<p>既存の子要素</p>';
      document.body.appendChild(parentElement);
      
      const originalScope = new BindingScope(testElement, { name: '田中' });
      const clonedScope = originalScope.clone({ name: '山田' });
      
      await clonedScope.appendTo(parentElement);
      
      expect(parentElement.children.length).toBe(2);
      expect(parentElement.children[1]).toBe(clonedScope.node);
      
      // クリーンアップ
      document.body.removeChild(parentElement);
    });

    test('appendTo - 挿入位置を指定できる', async () => {
      const parentElement = document.createElement('div');
      parentElement.innerHTML = '<p>既存の子要素</p>';
      document.body.appendChild(parentElement);
      
      const originalScope = new BindingScope(testElement, { name: '田中' });
      const clonedScope = originalScope.clone({ name: '山田' });
      
      await clonedScope.appendTo(parentElement, 'afterbegin');
      
      expect(parentElement.children.length).toBe(2);
      expect(parentElement.children[0]).toBe(clonedScope.node);
      
      // クリーンアップ
      document.body.removeChild(parentElement);
    });

    test('insertBefore - 指定した要素の前に挿入できる', async () => {
      const parentElement = document.createElement('div');
      const targetElement = document.createElement('p');
      targetElement.textContent = 'ターゲット要素';
      parentElement.appendChild(targetElement);
      document.body.appendChild(parentElement);
      
      const originalScope = new BindingScope(testElement, { name: '田中' });
      const clonedScope = originalScope.clone({ name: '山田' });
      
      await clonedScope.insertBefore(targetElement);
      
      expect(parentElement.children.length).toBe(2);
      expect(parentElement.children[0]).toBe(clonedScope.node);
      expect(parentElement.children[1]).toBe(targetElement);
      
      // クリーンアップ
      document.body.removeChild(parentElement);
    });

    test('insertAfter - 指定した要素の後に挿入できる', async () => {
      const parentElement = document.createElement('div');
      const targetElement = document.createElement('p');
      targetElement.textContent = 'ターゲット要素';
      parentElement.appendChild(targetElement);
      document.body.appendChild(parentElement);
      
      const originalScope = new BindingScope(testElement, { name: '田中' });
      const clonedScope = originalScope.clone({ name: '山田' });
      
      await clonedScope.insertAfter(targetElement);
      
      expect(parentElement.children.length).toBe(2);
      expect(parentElement.children[0]).toBe(targetElement);
      expect(parentElement.children[1]).toBe(clonedScope.node);
      
      // クリーンアップ
      document.body.removeChild(parentElement);
    });

    test('replaceElement - 指定した要素を置き換えできる', async () => {
      const parentElement = document.createElement('div');
      const targetElement = document.createElement('p');
      targetElement.textContent = 'ターゲット要素';
      const targetScope = new BindingScope(targetElement, { target: 'data' });
      parentElement.appendChild(targetElement);
      document.body.appendChild(parentElement);
      
      const originalScope = new BindingScope(testElement, { name: '田中' });
      const clonedScope = originalScope.clone({ name: '山田' });
      
      expect(getScopeMapSize()).toBe(3); // original, target, cloned
      
      await clonedScope.replaceElement(targetElement);
      
      expect(parentElement.children.length).toBe(1);
      expect(parentElement.children[0]).toBe(clonedScope.node);
      expect(getBindingScope(targetElement)).toBeUndefined();
      expect(getScopeMapSize()).toBe(2); // original, cloned
      
      // クリーンアップ
      document.body.removeChild(parentElement);
    });

    test('メソッドチェーンが可能', async () => {
      const parentElement = document.createElement('div');
      document.body.appendChild(parentElement);
      
      const originalScope = new BindingScope(testElement, { name: '田中' });
      const result = await originalScope.clone({ name: '山田' }).appendTo(parentElement);
      
      expect(result).toBeInstanceOf(BindingScope);
      expect(parentElement.children.length).toBe(1);
      
      // クリーンアップ
      document.body.removeChild(parentElement);
    });
  });

  describe('cloneAndAppendTo', () => {
    test('cloneAndAppendTo - 複製と追加を一度に実行できる', async () => {
      const parentElement = document.createElement('div');
      document.body.appendChild(parentElement);
      
      const originalScope = new BindingScope(testElement, { name: '田中' });
      const clonedScope = await originalScope.cloneAndAppendTo({ name: '山田' }, parentElement);
      
      expect(parentElement.children.length).toBe(1);
      expect(parentElement.children[0]).toBe(clonedScope.node);
      expect(clonedScope.data).toEqual({ name: '山田' });
      
      // クリーンアップ
      document.body.removeChild(parentElement);
    });

    test('子スコープを含めて複製と追加を一度に実行できる', async () => {
      testElement.innerHTML = '<div id="child">子要素</div>';
      const parentScope = new BindingScope(testElement, { parent: 'data' });
      
      const childElement = testElement.querySelector('#child') as Element;
      const childScope = new BindingScope(childElement, { child: 'data' }, parentScope);
      
      const targetElement = document.createElement('div');
      document.body.appendChild(targetElement);
      
      const clonedScope = await parentScope.cloneAndAppendTo({ parent: 'new data' }, targetElement);
      
      expect(targetElement.children.length).toBe(1);
      expect(clonedScope.children.length).toBe(1);
      expect(clonedScope.data).toEqual({ parent: 'new data' });
      
      // クリーンアップ
      document.body.removeChild(targetElement);
    });

    test('挿入位置を指定できる', async () => {
      const parentElement = document.createElement('div');
      parentElement.innerHTML = '<p>既存要素</p>';
      document.body.appendChild(parentElement);
      
      const originalScope = new BindingScope(testElement, { name: '田中' });
      const clonedScope = await originalScope.cloneAndAppendTo(
        { name: '山田' }, 
        parentElement, 
        'afterbegin'
      );
      
      expect(parentElement.children.length).toBe(2);
      expect(parentElement.children[0]).toBe(clonedScope.node);
      
      // クリーンアップ
      document.body.removeChild(parentElement);
    });
  });
});

describe('スコープ管理関数', () => {
  beforeEach(() => {
    clearScopeMap();
  });

  describe('createBindingScope', () => {
    test('新しいスコープを作成してマップに登録する', async () => {
      const element = document.createElement('div');
      const data = { name: '田中' };
      
      const scope = await createBindingScope(element, data);
      
      expect(scope.node).toBe(element);
      expect(scope.data).toBe(data);
      expect(getBindingScope(element)).toBe(scope);
      expect(getScopeMapSize()).toBe(1);
    });

    test('既存のスコープがある場合は削除してから新しいスコープを作成する', async () => {
      const element = document.createElement('div');
      
      const oldScope = await createBindingScope(element, { name: '山田' });
      const newScope = await createBindingScope(element, { name: '田中' });
      
      expect(getBindingScope(element)).toBe(newScope);
      expect(getBindingScope(element)).not.toBe(oldScope);
      expect(getScopeMapSize()).toBe(1);
    });
  });

  describe('getBindingScope', () => {
    test('要素のスコープを取得できる', async () => {
      const element = document.createElement('div');
      const scope = await createBindingScope(element, {});
      
      expect(getBindingScope(element)).toBe(scope);
    });

    test('存在しない要素の場合はundefinedを返す', () => {
      const element = document.createElement('div');
      
      expect(getBindingScope(element)).toBeUndefined();
    });
  });

  describe('removeBindingScope', () => {
    test('要素のスコープを削除できる', async () => {
      const element = document.createElement('div');
      await createBindingScope(element, {});
      
      expect(getScopeMapSize()).toBe(1);
      
      await removeBindingScope(element);
      
      expect(getBindingScope(element)).toBeUndefined();
      expect(getScopeMapSize()).toBe(0);
    });
  });

  describe('clearScopeMap', () => {
    test('すべてのスコープをクリアできる', async () => {
      const element1 = document.createElement('div');
      const element2 = document.createElement('span');
      
      await createBindingScope(element1, {});
      await createBindingScope(element2, {});
      
      expect(getScopeMapSize()).toBe(2);
      
      await clearScopeMap();
      
      expect(getScopeMapSize()).toBe(0);
      expect(getBindingScope(element1)).toBeUndefined();
      expect(getBindingScope(element2)).toBeUndefined();
    });
  });

  describe('removeElement', () => {
    test('スコープが存在する要素を削除できる', async () => {
      const parentElement = document.createElement('div');
      document.body.appendChild(parentElement);
      
      const element = document.createElement('div');
      const scope = await createBindingScope(element, { name: '田中' });
      parentElement.appendChild(element);
      
      expect(document.body.contains(element)).toBe(true);
      expect(getBindingScope(element)).toBe(scope);
      expect(getScopeMapSize()).toBe(1);
      
      await removeElement(element);
      
      expect(document.body.contains(element)).toBe(false);
      expect(getBindingScope(element)).toBeUndefined();
      expect(getScopeMapSize()).toBe(0);
      
      // クリーンアップ
      if (document.body.contains(parentElement)) {
        document.body.removeChild(parentElement);
      }
    });

    test('スコープが存在しない要素でも削除できる', async () => {
      const parentElement = document.createElement('div');
      document.body.appendChild(parentElement);
      
      const element = document.createElement('div');
      element.innerHTML = '<span>テスト</span>';
      parentElement.appendChild(element);
      
      expect(document.body.contains(element)).toBe(true);
      expect(getBindingScope(element)).toBeUndefined();
      
      await removeElement(element);
      
      expect(document.body.contains(element)).toBe(false);
      
      // クリーンアップ
      if (document.body.contains(parentElement)) {
        document.body.removeChild(parentElement);
      }
    });

    test('子要素にスコープがある場合も適切に削除される', async () => {
      const parentElement = document.createElement('div');
      document.body.appendChild(parentElement);
      
      const element = document.createElement('div');
      element.innerHTML = '<div id="child">子要素</div>';
      
      const childElement = element.querySelector('#child') as Element;
      const childScope = await createBindingScope(childElement, { child: 'data' });
      
      parentElement.appendChild(element);
      
      expect(document.body.contains(element)).toBe(true);
      expect(getBindingScope(childElement)).toBe(childScope);
      expect(getScopeMapSize()).toBe(1);
      
      await removeElement(element);
      
      expect(document.body.contains(element)).toBe(false);
      expect(getBindingScope(childElement)).toBeUndefined();
      expect(getScopeMapSize()).toBe(0);
      
      // クリーンアップ
      if (document.body.contains(parentElement)) {
        document.body.removeChild(parentElement);
      }
    });

    test('permanently=falseの場合、DOMからは削除されない', async () => {
      const parentElement = document.createElement('div');
      document.body.appendChild(parentElement);
      
      const element = document.createElement('div');
      const scope = await createBindingScope(element, { name: '田中' });
      parentElement.appendChild(element);
      
      expect(document.body.contains(element)).toBe(true);
      expect(getBindingScope(element)).toBe(scope);
      expect(getScopeMapSize()).toBe(1);
      
      await removeElement(element, false);
      
      // DOMには残るがスコープは削除される
      expect(document.body.contains(element)).toBe(true);
      expect(getBindingScope(element)).toBeUndefined();
      expect(getScopeMapSize()).toBe(0);
      
      // クリーンアップ
      if (document.body.contains(parentElement)) {
        document.body.removeChild(parentElement);
      }
    });
  });

  describe('cloneElementTo', () => {
    test('cloneElementTo - 要素のスコープを複製して追加できる', async () => {
      const sourceElement = document.createElement('div');
      const sourceScope = await createBindingScope(sourceElement, { source: 'data' });
      
      const targetElement = document.createElement('div');
      document.body.appendChild(targetElement);
      
      const clonedScope = await cloneElementTo(sourceElement, { source: 'new data' }, targetElement);
      
      expect(clonedScope).toBeDefined();
      expect(clonedScope!.data).toEqual({ source: 'new data' });
      expect(targetElement.children.length).toBe(1);
      expect(targetElement.children[0]).toBe(clonedScope!.node);
      
      // クリーンアップ
      document.body.removeChild(targetElement);
    });

    test('cloneElementTo - スコープが存在しない場合はundefinedを返す', async () => {
      const sourceElement = document.createElement('div');
      const targetElement = document.createElement('div');
      document.body.appendChild(targetElement);
      
      const result = await cloneElementTo(sourceElement, { data: 'test' }, targetElement);
      
      expect(result).toBeUndefined();
      expect(targetElement.children.length).toBe(0);
      
      // クリーンアップ
      document.body.removeChild(targetElement);
    });

    test('子スコープを含めて複製できる', async () => {
      const sourceElement = document.createElement('div');
      sourceElement.innerHTML = '<div id="child">子要素</div>';
      
      const sourceScope = await createBindingScope(sourceElement, { parent: 'data' });
      const childElement = sourceElement.querySelector('#child') as Element;
      const childScope = await createBindingScope(childElement, { child: 'data' }, sourceScope);
      
      const targetElement = document.createElement('div');
      document.body.appendChild(targetElement);
      
      const clonedScope = await cloneElementTo(
        sourceElement, 
        { parent: 'new data' }, 
        targetElement
      );
      
      expect(clonedScope).toBeDefined();
      expect(clonedScope!.data).toEqual({ parent: 'new data' });
      expect(clonedScope!.children.length).toBe(1);
      expect(targetElement.children.length).toBe(1);
      
      // クリーンアップ
      document.body.removeChild(targetElement);
    });

    test('挿入位置を指定できる', async () => {
      const sourceElement = document.createElement('div');
      const sourceScope = await createBindingScope(sourceElement, { source: 'data' });
      
      const targetElement = document.createElement('div');
      targetElement.innerHTML = '<p>既存要素</p>';
      document.body.appendChild(targetElement);
      
      const clonedScope = await cloneElementTo(
        sourceElement, 
        { source: 'new data' }, 
        targetElement, 
        'afterbegin'
      );
      
      expect(clonedScope).toBeDefined();
      expect(targetElement.children.length).toBe(2);
      expect(targetElement.children[0]).toBe(clonedScope!.node);
      
      // クリーンアップ
      document.body.removeChild(targetElement);
    });
  });
});

describe('テキストプレースホルダ処理', () => {
  beforeEach(() => {
    clearScopeMap();
  });

  describe('createTextEvaluator', () => {
    test('単一のプレースホルダを正しく評価できる', () => {
      const element = document.createElement('div');
      const scope = new BindingScope(element, { name: '田中' });
      
      const evaluator = createTextEvaluator('こんにちは、{{name}}さん', scope);
      const result = evaluator();
      
      expect(result).toBe('こんにちは、田中さん');
    });

    test('複数のプレースホルダを正しく評価できる', () => {
      const element = document.createElement('div');
      const scope = new BindingScope(element, { 
        firstName: '太郎', 
        lastName: '田中',
        age: 30
      });
      
      const evaluator = createTextEvaluator(
        '{{lastName}} {{firstName}}（{{age}}歳）',
        scope
      );
      const result = evaluator();
      
      expect(result).toBe('田中 太郎（30歳）');
    });

    test('同じプレースホルダが複数回使用されても正しく評価できる', () => {
      const element = document.createElement('div');
      const scope = new BindingScope(element, { name: '田中' });
      
      const evaluator = createTextEvaluator(
        '{{name}}さん、こんにちは。{{name}}さんはお元気ですか？',
        scope
      );
      const result = evaluator();
      
      expect(result).toBe('田中さん、こんにちは。田中さんはお元気ですか？');
    });

    test('存在しないキーの場合は空文字列になる', () => {
      const element = document.createElement('div');
      const scope = new BindingScope(element, {});
      
      const evaluator = createTextEvaluator('こんにちは、{{name}}さん', scope);
      const result = evaluator();
      
      expect(result).toBe('こんにちは、さん');
    });

    test('式評価エラーの場合は空文字列になる', () => {
      const element = document.createElement('div');
      const scope = new BindingScope(element, {});
      
      const evaluator = createTextEvaluator('結果: {{invalid.property}}', scope);
      const result = evaluator();
      
      expect(result).toBe('結果: ');
    });

    test('プレースホルダがない場合はそのまま返される', () => {
      const element = document.createElement('div');
      const scope = new BindingScope(element, {});
      
      const evaluator = createTextEvaluator('普通のテキストです', scope);
      const result = evaluator();
      
      expect(result).toBe('普通のテキストです');
    });
  });

  describe('processTextPlaceholders', () => {
    test('要素内のプレースホルダを含むテキストノードを処理できる', () => {
      const element = document.createElement('div');
      element.innerHTML = 'こんにちは、<span>{{name}}</span>さん。年齢は{{age}}歳です。';
      
      const scope = new BindingScope(element, { name: '田中', age: 30 });
      
      processTextPlaceholders(element, scope);
      
      expect(element.textContent).toBe('こんにちは、田中さん。年齢は30歳です。');
      expect(scope.evaluatedTextContents.length).toBe(2);
    });

    test('ネストした要素のプレースホルダも処理できる', () => {
      const element = document.createElement('div');
      element.innerHTML = `
        <p>ユーザー情報</p>
        <div>
          <span>名前: {{user.name}}</span>
          <span>年齢: {{user.age}}</span>
          <div>部署: {{user.department}}</div>
        </div>
      `;
      
      const scope = new BindingScope(element, { 
        user: { 
          name: '田中太郎', 
          age: 30, 
          department: '開発部' 
        }
      });
      
      processTextPlaceholders(element, scope);
      
      expect(element.textContent?.replace(/\s+/g, ' ').trim())
        .toBe('ユーザー情報 名前: 田中太郎 年齢: 30 部署: 開発部');
      expect(scope.evaluatedTextContents.length).toBe(3);
    });

    test('プレースホルダがないテキストノードは処理されない', () => {
      const element = document.createElement('div');
      element.innerHTML = '<p>普通のテキスト</p><span>別のテキスト</span>';
      
      const scope = new BindingScope(element, {});
      
      processTextPlaceholders(element, scope);
      
      expect(scope.evaluatedTextContents.length).toBe(0);
    });

    test('スコープ更新時にテキストが再評価される', () => {
      const element = document.createElement('div');
      element.innerHTML = 'こんにちは、{{name}}さん';
      
      const scope = new BindingScope(element, { name: '田中' });
      
      processTextPlaceholders(element, scope);
      expect(element.textContent).toBe('こんにちは、田中さん');
      
      scope.updateData({ name: '山田' });
      expect(element.textContent).toBe('こんにちは、山田さん');
    });
  });
});
