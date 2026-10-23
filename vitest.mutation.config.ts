import {defineConfig} from 'vitest/config';

import baseConfig from './vitest.shared.config';

/**
 * ミューテーションテストで流すテストの設定です（`stryker.config.mjs`）。
 *
 * CSP モードの評価器のテストと、評価器を組み込んだ部分・`*-run` 系の宣言の
 * テストだけを流します。`mergeConfig()` は配列をつなげる
 * （`include` が全テストのままになる）ため、`include` だけを差し替えます。
 *
 * 従来の方式で本文を JavaScript として実行する経路も確かめるため、従来の方式
 * （`tests/helpers/legacy-mode-setup.ts`）で流します。CSP モードのテストは、
 * テストの中で CSP モードに切り替えます。
 */
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    setupFiles: [
      'tests/helpers/legacy-mode-setup.ts',
      'tests/helpers/mutation-setup.ts',
    ],
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
