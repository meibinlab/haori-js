// 特定のテストを実行するための簡易スクリプト
import { evaluateExpressionSafe, clearExpressionCache } from './src/expression.js';

// キャッシュをクリア
clearExpressionCache();

console.log('=== Test 1: Basic evaluation ===');
const result1 = evaluateExpressionSafe('age', { name: null, age: null, score: 0 });
console.log('Result:', result1);

console.log('\n=== Test 2: Different scope ===');
const result2 = evaluateExpressionSafe('age', { firstName: 'John', lastName: 'Doe', age: 30 });
console.log('Result:', result2);

console.log('\n=== Test 3: Same expression with original scope ===');
const result3 = evaluateExpressionSafe('age', { name: null, age: null, score: 0 });
console.log('Result:', result3);
