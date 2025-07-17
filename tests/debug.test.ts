import { evaluateExpressionSafe } from '../src/expression';
import { bindScope, addEvaluatedTextNode, rebindScope, scopeMap } from '../src/scope';

describe('デバッグ スコープシステム', () => {
  beforeEach(() => {
    scopeMap.clear();
    document.body.innerHTML = '';
  });

  it('プレースホルダー内の0を正しく処理する', () => {
    const element = document.createElement('div');
    element.setAttribute('data-bind', '{"name": null, "age": null, "score": 0}');
    
    const scope = bindScope(element);
    console.log('Scope data:', scope.data);
    
    const textNode = document.createTextNode('Name: {{name}}, Age: {{age}}, Score: {{score}}');
    addEvaluatedTextNode(element, textNode, 'Name: {{name}}, Age: {{age}}, Score: {{score}}');

    console.log('Before rebindScope, textNode.textContent:', textNode.textContent);
    
    // 評価を実行
    rebindScope(scope);
    
    console.log('After rebindScope, textNode.textContent:', textNode.textContent);
    
    // 各プレースホルダを個別にテスト
    const nameResult = evaluateExpressionSafe('name', scope.data);
    const ageResult = evaluateExpressionSafe('age', scope.data);
    const scoreResult = evaluateExpressionSafe('score', scope.data);
    
    console.log('name evaluation:', nameResult, typeof nameResult);
    console.log('age evaluation:', ageResult, typeof ageResult);
    console.log('score evaluation:', scoreResult, typeof scoreResult);
    
    expect(textNode.textContent).toBe('Name: , Age: , Score: 0');
  });
});
