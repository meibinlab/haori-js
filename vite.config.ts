import {defineConfig} from 'vite';
import dts from 'vite-plugin-dts';

/**
 * ES / CJS 配布物と型定義のビルド設定。
 *
 * iife 配布物（`haori.iife.js`）はグローバル `Haori` をクラス本体にするため
 * 入口が異なり、`vite.config.iife.ts` で別にビルドします。
 */
export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'Haori',
      formats: ['es', 'cjs'],
      fileName: fmt => `haori.${fmt}.js`,
    },
    sourcemap: true,
    rollupOptions: {
      external: [],
      output: {
        // Ensure Rollup uses named exports for the CJS bundle to avoid
        // consumers needing to access `.default` when requiring the package.
        exports: 'named',
      },
    },
  },
  plugins: [
    dts({
      rollupTypes: true,
      insertTypesEntry: true,
    }),
  ],
});
