import {defineConfig} from 'vite';

// GitHub Pages のプロジェクトサイト用に base をリポジトリ名に合わせる
// 公開URL例: https://meibinlab.github.io/haori-js/
export default defineConfig({
  root: './demo',
  base: '/haori-js/',
  build: {
    outDir: '../dist',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        index: './demo/index.html',
        bind: './demo/bind.html',
        if: './demo/if.html',
        each: './demo/each.html',
        import: './demo/import.html',
        ui: './demo/ui.html',
      },
    },
  },
});
