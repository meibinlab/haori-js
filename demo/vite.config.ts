import {defineConfig, type Plugin} from 'vite';
import {fileURLToPath} from 'node:url';
import {dirname, relative, resolve, sep} from 'node:path';
import {existsSync, readFileSync, readdirSync} from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** デモの HTML に書かれているライブラリ本体の参照（ローカル配信用の相対パス）。 */
const LIBRARY_SOURCE_REF = '../../dist/haori.iife.js';

/** 公開ビルドでライブラリ本体を置く位置（`dist/demo/` からの相対パス）。 */
const LIBRARY_OUTPUT_PATH = 'lib/haori.iife.js';

/**
 * 書き換え対象のスクリプトタグ。
 *
 * 相対の深さに依存しないよう `src` 全体を置き換えます（部分一致の置換では
 * `../../../dist/...` のような綴り違いが壊れたパスになり、検知もできません）。
 */
const LIBRARY_SCRIPT_PATTERN = /(<script[^>]*\ssrc=")[^"]*\/dist\/haori\.iife\.js(")/g;

/**
 * 書き換え漏れの検知に使う目印。
 *
 * ライブラリ本体（`haori.iife.js` / `haori.es.js`）の `dist/` 参照だけに一致させる
 * ため末尾のドットまで含めます。CDN から読み込む `dist/haori-bootstrap.iife.js` は
 * 対象外です。
 */
const LIBRARY_LEFTOVER_MARK = 'dist/haori.';

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

/**
 * 公開ビルドでライブラリ本体を配置し、デモの参照を書き換えるプラグインです。
 *
 * デモの HTML は `../../dist/haori.iife.js` を読み込みます。この相対パスは
 * リポジトリのルートを配信したとき（`npm run dev:demo` やローカルの静的サーバー、
 * Playwright）に解決できますが、公開ビルドは `dist/demo/` 配下だけを配信する
 * ため、そのままではライブラリが 404 になります。ビルド時に本体を
 * `dist/demo/lib/` へ複製し、HTML の参照を base 付きの絶対パスへ書き換えます。
 *
 * @returns デモ公開ビルド用の Vite プラグイン
 */
function bundleLibraryForDemo(): Plugin {
  const libraryPath = resolve(__dirname, '..', 'dist', 'haori.iife.js');
  const sourceMapPath = `${libraryPath}.map`;
  let publicPath = LIBRARY_OUTPUT_PATH;

  return {
    name: 'haori-demo-library',
    apply: 'build',

    configResolved(config) {
      publicPath = `${config.base}${LIBRARY_OUTPUT_PATH}`;
    },

    buildStart() {
      if (!existsSync(libraryPath)) {
        this.error(
          `ライブラリ本体が見つかりません: ${libraryPath}\n` +
            'デモのビルドより先に `npm run build` を実行してください。',
        );
      }
    },

    // Vite 自身の HTML 処理のあとに書き換える。
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(
          LIBRARY_SCRIPT_PATTERN,
          (_match, before: string, after: string) =>
            `${before}${publicPath}${after}`,
        );
      },
    },

    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: LIBRARY_OUTPUT_PATH,
        source: readFileSync(libraryPath),
      });
      if (existsSync(sourceMapPath)) {
        // 本体末尾の sourceMappingURL が指すファイルも一緒に置く。
        this.emitFile({
          type: 'asset',
          fileName: `${LIBRARY_OUTPUT_PATH}.map`,
          source: readFileSync(sourceMapPath),
        });
      }
    },

    // 出力が確定したあとに書き換え漏れを検知する。公開サイトは dist/demo/ 配下
    // だけを配信するため、リポジトリのルートを前提とした `dist/` への参照は解決
    // できない。書き換え後の参照は `lib/haori.iife.js` なので、HTML に
    // `dist/haori.` は 1 件も残らないはずである。
    writeBundle(_options, bundle) {
      const leftovers: string[] = [];
      for (const [fileName, output] of Object.entries(bundle)) {
        if (!fileName.endsWith('.html') || output.type !== 'asset') {
          continue;
        }
        if (String(output.source).includes(LIBRARY_LEFTOVER_MARK)) {
          leftovers.push(fileName);
        }
      }
      if (leftovers.length > 0) {
        this.error(
          `ライブラリの相対参照が書き換えられていません: ${leftovers.join(', ')}\n` +
            `デモは ${LIBRARY_SOURCE_REF} の形で読み込んでください。`,
        );
      }
    },
  };
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
  plugins: [bundleLibraryForDemo()],
});
