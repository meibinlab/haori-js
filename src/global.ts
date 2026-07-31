/**
 * @fileoverview iife（`<script src>`）配布用のグローバル公開エントリーポイント
 *
 * `haori.iife.js` を読み込むと `window.Haori` にこのモジュールの既定エクスポート
 * が入ります。ES / CJS 向けの入口（`src/index.ts`）は名前空間をそのまま公開する
 * ため、そちらをそのまま iife にすると `window.Haori` が名前空間オブジェクトに
 * なり、`Haori.addMessage()` のようなクラス API が `Haori.Haori.addMessage()` に
 * なってしまいます。ここでクラス本体へ名前付きエクスポートを付け足すことで、
 * グローバルからは `Haori.addMessage()` と `Haori.Core` の双方が使えます。
 *
 * `Haori.Haori` と `Haori.default` は自己参照として残すため、従来の
 * `window.Haori.Haori.xxx` という書き方も引き続き動作します。
 */

import * as api from './index';

/** グローバルへ公開するクラス本体。 */
const globalApi = api.default as typeof api.default & Record<string, unknown>;

// 名前空間側のエクスポート（Core / Env / version など）をクラスへ付け足す。
// クラスに同名の静的メンバーがある場合（waitForRenders / enhancers）は付け足さない。
// 名前空間側はクラスの静的メンバーを呼び出すだけの薄い包みであり、上書きすると
// 自分自身を呼ぶ無限再帰になるためである。
for (const [name, value] of Object.entries(
  api as unknown as Record<string, unknown>,
)) {
  if (name in globalApi) {
    continue;
  }
  Object.defineProperty(globalApi, name, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

export default globalApi;
