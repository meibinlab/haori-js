/**
 * @fileoverview 全テストを従来の方式で流すための設定
 *
 * `vitest.legacy.config.ts` と `vitest.mutation.config.ts` の `setupFiles` から
 * 読み込みます。CSP モード（既定）を無効にし、`<script>` に `data-csp="false"` を
 * 書いたページと同じ従来の方式（`new Function`）にします。
 */

import {vi} from 'vitest';

// モジュールを読み直すテスト（`vi.resetModules()`）でも従来の方式になるよう、
// 読み込むたびに無効にする。
vi.mock('../../src/env', async importOriginal => {
  const module = await importOriginal<typeof import('../../src/env')>();
  module.default.setCsp(false);
  return module;
});
