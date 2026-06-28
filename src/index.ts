/**
 * @fileoverview Haori-js メインエントリーポイント
 *
 * Haori-jsライブラリのすべての機能を提供するメインファイルです。
 */

import Core from './core';
import Env from './env';
import Fragment from './fragment';
import Form from './form';
import Haori from './haori';
import Log from './log';
import Queue from './queue';
// ブラウザ運用時の監視・自動起動（本番動作）は observer モジュールが担います
import './observer';

// メインクラスとユーティリティをエクスポート
export {Core, Env, Fragment, Form, Haori, Log, Queue};
export type {HaoriRuntime} from './env';

/**
 * すべてのレンダリングタスク（追従投入分を含む）の完了を待ちます。
 *
 * iife グローバルからは `Haori.waitForRenders()`、ESM では
 * `import {waitForRenders} from 'haori'` で利用できます。
 *
 * @return すべてのレンダリングが完了したら解決される Promise
 */
export const waitForRenders = (): Promise<void> => Haori.waitForRenders();

// デフォルトエクスポート（Haoriをメインとして提供）
export default Haori;

// バージョン情報
export const version = '0.25.0';
