/**
 * @fileoverview 全テストを CSP モードの評価器で流すための差し替え
 *
 * `vitest.csp.config.ts` の `setupFiles` から読み込みます。`Expression.evaluateDetailed()`
 * （`Expression.evaluate()` もこれを通ります）を、評価関数の部分だけを CSP モードの
 * 評価器へ差し替えた形（`csp-evaluate.ts`）に置き換えます。組み合わせる前に、既存の
 * テストの期待値が CSP モードでも成り立つことを確かめるためのものです。
 */

import Expression from '../../src/expression';
import {cspEvaluateDetailed} from './csp-evaluate';

(
  Expression as unknown as {evaluateDetailed: typeof cspEvaluateDetailed}
).evaluateDetailed = cspEvaluateDetailed;
