import {defineConfig, mergeConfig} from 'vitest/config';

import baseConfig from './vitest.config';

/**
 * 全テストを CSP モードの評価器で流す設定です（`npm run test:csp`）。
 *
 * 除外するのは、方式によらない層のログと診断（開発モードの警告・厳格バインドの
 * エラー・未解決参照の集約・コンパイル失敗の記録・危険な値の検査結果の控え）を
 * 確かめるテストです。`tests/helpers/csp-evaluate.ts` はこれらの層を再現しないため、
 * 組み合わせる段階で `expression.ts` の層をそのまま使うようになってから対象に戻します。
 * `log.test.ts` は、差し替えのために先に読み込むモジュールが開発モードの判定へ
 * 影響するため除外します。
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      setupFiles: ['tests/helpers/csp-mode-setup.ts'],
      exclude: [
        'node_modules/**',
        'tests/binding-key-identifier.test.ts',
        'tests/cross-scope-identifier-diagnostics.test.ts',
        'tests/expression-disallowed-keyword-hint.test.ts',
        'tests/expression-forbidden-hint.test.ts',
        'tests/expression-global-shadowing.test.ts',
        'tests/expression-storage-unavailable.test.ts',
        'tests/expression-unresolved-reference.test.ts',
        'tests/fetch-state-unresolved-warning.test.ts',
        'tests/forbidden-binding-values.test.ts',
        'tests/log.test.ts',
        'tests/row-scope-identifier-diagnostics.test.ts',
        'tests/strict-comparison-diagnosis-side-effects.test.ts',
      ],
    },
  }),
);
