import {defineConfig, mergeConfig} from 'vitest/config';

import baseConfig from './vitest.shared.config';

/**
 * 全テストを従来の方式（`new Function`）で流す設定です（`npm run test:legacy`）。
 *
 * `tests/helpers/legacy-mode-setup.ts` が CSP モードを無効にします。従来の方式は
 * `<script>` に `data-csp="false"` を書いたページの方式です（仕様「CSP モード」）。
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      setupFiles: ['tests/helpers/legacy-mode-setup.ts'],
    },
  }),
);
