/**
 * @fileoverview ライブラリのバージョン
 *
 * `src/index.ts` の `version` と `haori:ready` の `detail.version` の両方から
 * 参照します。`src/index.ts` に直接置くと、`observer.ts` から参照したときに
 * 循環参照（index → observer → index）になるため独立したモジュールにしています。
 */

/**
 * ライブラリのバージョン。
 *
 * リリース時に `package.json` と揃えて更新します（`tests/version.test.ts` が
 * 一致を検査します）。
 */
export const VERSION = '0.39.0';
