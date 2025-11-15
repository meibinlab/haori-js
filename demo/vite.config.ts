import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// GitHub Pages のプロジェクトサイト用に base をリポジトリ名に合わせる
// 公開URL例: https://meibinlab.github.io/haori-js/
export default defineConfig({
  root: './demo',
  base: '/haori-js/',
  build: {
    outDir: '../dist/demo',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        'event-test': resolve(__dirname, 'event-test.html'),
      },
    },
  },
});
