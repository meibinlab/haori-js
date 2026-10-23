import {defineConfig, mergeConfig} from 'vitest/config';

import baseConfig from './vitest.config';

/**
 * 全テストを CSP モードで流す設定です（`npm run test:csp`）。
 *
 * `tests/helpers/csp-mode-setup.ts` が CSP モードを有効にし、`Function`
 * コンストラクタと `eval` を `EvalError` を投げるものへ置き換えます。
 *
 * 除外するのは次の 2 種類です。
 *
 * - 二つの方式の結果を比べるテスト。従来の方式を同じプロセスで動かすため、
 *   `new Function` を拒否する環境では比べられません（既定の設定で流します）。
 * - `data-{event}-run` など、属性値を JavaScript として実行する属性のテスト。
 *   CSP モードでの扱いを決めるまで除外します。
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      setupFiles: ['tests/helpers/csp-mode-setup.ts'],
      exclude: [
        'node_modules/**',
        // 二つの方式の結果を比べるテスト
        'tests/expression-csp-integration.test.ts',
        'tests/expression-interpreter-corpus.test.ts',
        'tests/expression-interpreter-edge.test.ts',
        'tests/expression-interpreter-errors.test.ts',
        'tests/expression-interpreter-escape.test.ts',
        'tests/expression-interpreter-fuzz.test.ts',
        'tests/expression-interpreter-parity.test.ts',
        // 属性値を JavaScript として実行する属性のテスト
        'tests/checked_selected_focus_guard.test.ts',
        'tests/click-lock-fetch.test.ts',
        'tests/custom-event-target.test.ts',
        'tests/custom_event_trigger.test.ts',
        'tests/data-click-run.test.ts',
        'tests/demo-runtime-normalization.test.ts',
        'tests/each-nested-fresh-row-fixed.test.ts',
        'tests/event-gate-two-way-commit.test.ts',
        'tests/external-select-integration.test.ts',
        'tests/fetch-and-procedure-scenarios.test.ts',
        'tests/if-each-attribute-show.test.ts',
        'tests/if-false-validation-exclusion.test.ts',
        'tests/init-deferred-events.test.ts',
        'tests/intersect.test.ts',
        'tests/procedure-fetch-options.test.ts',
        'tests/procedure-run-await.test.ts',
        'tests/procedure_events.test.ts',
        'tests/repro_report5_full.test.ts',
      ],
    },
  }),
);
