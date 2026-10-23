import {defineConfig} from 'vitest/config';

/**
 * 単体テストの設定に共通する部分です。
 *
 * `vitest.config.ts`（CSP モード）・`vitest.legacy.config.ts`（従来の方式）・
 * `vitest.mutation.config.ts` が読み込みます。
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
    silent: false,
    env: {
      NODE_ENV: 'test',
    },
    coverage: {
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
    },
  },
});
