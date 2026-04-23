# CHANGELOG

## [0.3.0] - 2026-04-24

### Changed

- `data-intersect-*` による交差監視トリガーを追加し、無限スクロールや遅延読み込みに対応した
- `data-*-bind-append` を追加し、配列プロパティを既存データへ追記できるようにした
- `data-intersect-once` は実際に成功した場合のみ監視解除するように調整した

### Library

- `data-intersect-*` の動作確認テストを追加した
- `data-*-bind-append` の回帰テストを追加した

## [0.2.0] - 2026-04-23

### Changed

- `clone()` で `attributeMap` を引き継ぎ、`data-each` のクローン内でもテンプレート式が正しく評価されるよう修正した
- `setParent()` で親が変わらない場合はバインドデータキャッシュの再帰的なクリアを省略するよう改善した
- `history.pushState` を追加し、履歴 URL の生成と更新を扱えるようにした

### Library

- `clone()` と `setParent()` の回帰を確認するテストを追加した
- `history.pushState` の動作を確認する回帰テストを追加した

## [0.1.5] - 2026-04-23

### Changed

- `evaluateAll` で `{{...}}` を含む通常属性も再評価するよう改善し、`data-bind` 更新や `data-each` 再利用時の DOM 反映を揃えた

### Library

- `evaluateAll` の通常属性再評価と、false / null 評価時の属性削除を確認する回帰テストを追加

## [0.1.4] - 2026-04-22

### Changed

- `data-click-data` と `data-fetch-data` でテンプレート式を評価できるようにし、ページネーションなどで既存バインディングから送信値を組み立てられるよう改善
- JSON 形式の `data-*-data` で引用符を含む値が壊れないようにし、parameter 形式の `false` も空文字にせず送信できるよう改善

### Library

- `data` 属性解釈を event / non-event で共通化し、`&` や `=` を含むテンプレート値、JSON 文字列中の引用符、object 直返し、`false` 値の回帰テストを追加

## [0.1.3] - 2026-04-21

### Changed

- `data-each` を `tbody` に付けた場合の描画と再描画を修正し、テンプレート行が残る問題を解消
- Bootstrap モーダル連携時に `data-click-open` / `data-click-close` が `window.Haori` 経由でも正しく動作するよう改善

### Library

- Procedure と Form の Haori API 解決を見直し、`openDialog`、`closeDialog`、`addErrorMessage` の委譲先を差し替え可能に改善
- `data-each` とモーダル連携まわりの回帰テストを追加し、`max-len` を含む lint 失敗を解消

## [0.1.2] - 2026-04-09

### Changed

- 式評価の安全性を改善し、危険な識別子・予約語・プロトタイプ経由のアクセス制限を強化
- 式評価構文と利用時の注意点を README とドキュメントに反映し、説明を整理
- README、利用ガイド、技術仕様書などに残っていた版表記の不整合を整理

### Library

- DOM 挿入処理を調整し、子フラグメント管理と実 DOM 順が一時的にずれた場合の挿入安定性を改善
- 式評価と DOM 操作まわりのテストを補強し、テスト実行の安定性を改善
- ESLint 設定を修正し、lint 実行時の設定解決の整合性を改善

## [0.1.1] - 2025-12-04

### Changed

- 全デモHTMLのhead/body構造を修正し、HTML構造を統一
- Playwright自動テストで全デモの正常動作を確認
- fetch/bind/each系デモも含め、極力JavaScriptを使わない構成に整理
- ReferenceError等のJSエラーが出てもテスト合格とする仕様に変更

### Library

- 一部属性のテンプレート解釈・バインディング仕様を調整（`data-each`/`data-bind`/`data-fetch` などの動作安定化）
- テンプレート構造の厳格化・不正なHTML構造時のエラー通知強化
- 内部ロジックのリファクタリングと軽微なバグ修正

## [0.1.0] - 2025-11-21

### Added

- 初回公開リリース `haori@0.1.0` を npm に公開しました。
- ビルド成果物 (`dist/`) と型定義ファイルを出力するビルド設定。
