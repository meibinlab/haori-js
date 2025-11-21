# CHANGELOG

すべての重要な変更をこのファイルに記録します。

## [0.1.0] - 2025-11-21

### Added
- 初回公開リリース `haori@0.1.0` を npm に公開しました。
- ビルド成果物 (`dist/`) と型定義ファイルを出力するビルド設定。

### Changed
- 属性仕様をドキュメントと実装で整合させました。
  - `data-{event}-fetch-*` 系の属性名に統一（例: `data-click-fetch-method` など）。
- テストを属性駆動に書き換え、DOM をプログラムで構築して属性のみで動作する総合テストに変更。

### Fixed
- `src/procedure.ts` のフェッチオプション組立てと bind-arg の優先処理を修正。
- ESLint の `max-len` などのスタイル違反を修正。
- テストスイート（Vitest + jsdom）で全テストが通るように修正。

### Docs
- `docs/ja/guide.md` と `docs/ja/specs.md` を属性仕様に合わせて更新しました。
- README にビルド・公開手順を明記。

### Notes
- パッケージ名: `haori`（公開済み）
- 今後の作業: GitHub Release の作成、タグ付け、CHANGELOG の拡張（変更履歴の詳細化）を推奨します。
