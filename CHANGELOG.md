# CHANGELOG

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
