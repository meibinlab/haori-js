import {defineConfig} from 'vitest/config';

import baseConfig from './vitest.config';

/**
 * ミューテーションテストで流すテストの設定です（`stryker.config.mjs`）。
 *
 * CSP モードの評価器のテストだけを流します。`mergeConfig()` は配列をつなげる
 * （`include` が全テストのままになる）ため、`include` だけを差し替えます。
 */
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['tests/**/expression-interpreter*.test.ts'],
  },
});
