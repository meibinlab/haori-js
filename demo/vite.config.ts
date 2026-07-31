import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {dirname, relative, resolve, sep} from 'node:path';
import {readdirSync} from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * デモディレクトリ配下の HTML をビルド入力として列挙します。
 *
 * デモを追加するたびに設定へ書き足す必要がないよう、自動で収集します。
 *
 * @param directory 走査を始めるディレクトリ
 * @returns ロールアップの input（キーは demo/ からの相対パス、拡張子なし）
 */
function collectHtmlInputs(directory: string): Record<string, string> {
  const inputs: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, {withFileTypes: true})) {
      const fullPath = resolve(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        const key = relative(directory, fullPath)
          .split(sep)
          .join('/')
          .replace(/\.html$/, '');
        inputs[key] = fullPath;
      }
    }
  };
  walk(directory);
  return inputs;
}

// GitHub Pages のプロジェクトサイト用に base をリポジトリ名に合わせる
// 公開URL例: https://meibinlab.github.io/haori-js/
export default defineConfig({
  root: './demo',
  base: '/haori-js/',
  build: {
    outDir: '../dist/demo',
    emptyOutDir: true,
    rollupOptions: {
      input: collectHtmlInputs(__dirname),
    },
  },
});
