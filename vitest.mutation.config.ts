import {defineConfig} from 'vitest/config';

import baseConfig from './vitest.config';

/**
 * ミューテーションテストで流すテストの設定です（`stryker.config.mjs`）。
 *
 * CSP モードの評価器のテストと、評価器を組み込んだ部分・`*-run` 系の宣言の
 * テストだけを流します。`mergeConfig()` は配列をつなげる
 * （`include` が全テストのままになる）ため、`include` だけを差し替えます。
 */
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    setupFiles: ['tests/helpers/mutation-setup.ts'],
    include: [
      'tests/**/expression-interpreter*.test.ts',
      'tests/expression-csp-integration.test.ts',
      'tests/run-handler.test.ts',
      'tests/csp-run-attribute.test.ts',
      // 従来の方式で本文を JavaScript として実行する経路（RunAttribute.applies）
      'tests/data-click-run.test.ts',
      'tests/procedure_events.test.ts',
    ],
  },
});
