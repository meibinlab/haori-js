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

// デフォルトエクスポート（Haoriをメインとして提供）
export default Haori;

// バージョン情報
export const version = '1.0.0';
