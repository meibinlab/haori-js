import {defineConfig} from 'vite';

/**
 * `<script src>` で読み込む iife 配布物専用のビルド設定。
 *
 * ES / CJS 向けの `vite.config.ts` とはエントリーポイントが異なります。iife では
 * グローバル `Haori` をクラス本体にするため `src/global.ts` を入口にし、既定
 * エクスポートをそのままグローバルへ割り当てます（`exports: 'default'`）。
 *
 * `vite.config.ts` のビルドのあとに実行する前提で `emptyOutDir` を無効にして
 * います（有効だと先に出力した ES / CJS と型定義を消してしまいます）。
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/global.ts',
      name: 'Haori',
      formats: ['iife'],
      fileName: () => 'haori.iife.js',
    },
    sourcemap: true,
    rollupOptions: {
      external: [],
      output: {
        exports: 'default',
      },
    },
  },
});
