/**
 * @fileoverview ミューテーションテストで流すテストの前処理
 *
 * `vitest.mutation.config.ts` の `setupFiles` から読み込みます。Stryker は書き換えを
 * 切り替えながら同じプロセスでテストを流し直すため、評価器が式ごとに控えた変換の
 * 結果が、別の書き換えのときのまま残ります。控えから返すと書き換えた構文解析が
 * 走らず、テストが書き換えを見つけられません。テストごとに控えを空にします。
 */

import {beforeEach} from 'vitest';

import ExpressionInterpreter from '../../src/expression_interpreter';

beforeEach(() => {
  (
    ExpressionInterpreter as unknown as {COMPILE_CACHE: Map<string, unknown>}
  ).COMPILE_CACHE.clear();
});
