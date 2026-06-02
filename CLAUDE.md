# エージェント構成

人間から指示を受けたら、必ず最初に `.github/agents/ディレクター.agent.md` を読み込み、その役割・進行方針・委譲条件・フィードバック形式に従って作業を進めること。
サブエージェントへの委譲が必要な場合も、同ファイルの委譲方針に従い、該当するエージェントファイルを読み込んでその役割を担うこと。

| エージェント | ファイル | 主な役割 |
|---|---|---|
| ディレクター | `.github/agents/ディレクター.agent.md` | 依頼の受付・工程分解・進行管理（エントリーポイント） |
| アナリスト | `.github/agents/アナリスト.agent.md` | 要件整理・仕様確認・不明点の洗い出し |
| アーキテクト | `.github/agents/アーキテクト.agent.md` | 設計方針・責務分割・構成検討 |
| デベロッパー | `.github/agents/デベロッパー.agent.md` | 実装・設定変更・関連文書更新 |
| テスター | `.github/agents/テスター.agent.md` | テスト設計・テストコード作成・検証 |
| レビュワー | `.github/agents/レビュワー.agent.md` | 成果物レビュー・品質確認・差し戻し判断 |
| 文書エディター | `.github/agents/文書エディター.agent.md` | README・仕様書・CHANGELOG の作成・更新・同期 |

# AI 運用ルール

- 回答は日本語で、簡潔・丁寧・実務的に行う。
- 質問の対象範囲にのみ回答し、不要な背景説明は省略する。
- コード変更前に「変更計画（5ステップ以内）」を提示する。
- 不明点や確証がない点は明示し、推測で断定しない。
- 参照元は `README.md` と `doc/` を最優先とする。
- VS Code では Mamori Inspector 拡張の利用を前提とする。
- **git commit は人間から明示的に指示があった場合のみ実行する。作業完了後に自動でコミットしない。**

# 共通ルール

- システム共通の命名規則や表記ルールは `doc/02_システム設計/00_共通ルール.md` を参照する。
- 仕様変更によりソースコードを修正した場合は、関連するコメント、README.md、doc/ 配下の文書、テストも必要に応じて合わせて修正する。

# 依存ライブラリ選定方針

- GPL などの感染性ライセンスを持つものや有償ライブラリは、原則として採用しない。
- 代替手段がなく採用を検討する場合は、採用理由、影響範囲、ライセンス条件、費用を整理したうえで事前に相談する。

# ソースコードコメント方針

- public またはそれに準ずる公開範囲の関数、クラス、変数にコメントを必須とする。
- public またはそれに準ずる公開範囲の関数やメソッドでは、引数と戻り値のコメントも必須とする。
- private な関数、クラス、変数についても、役割や意図が自明でないものはできるだけコメントを記載する。
- コメントの記述方式は各言語の Google Style に準拠する。

# ファイル運用

- 一時ファイルは `.gitignore` に従って管理する。

# 言語別詳細ルール

ファイル種別ごとの実装ルールは `.github/instructions/` 配下を参照する。
必要に応じて該当ファイルを `@.github/instructions/ファイル名` で読み込むこと。

| 対象 | ファイル |
|---|---|
| Java | `.github/instructions/java.instructions.md` |
| Spring Boot（共通） | `.github/instructions/spring-boot.instructions.md` |
| Spring Boot Controller | `.github/instructions/spring-boot-controller.instructions.md` |
| Spring Boot Service | `.github/instructions/spring-boot-service.instructions.md` |
| Spring Boot Repository / Entity | `.github/instructions/spring-boot-repository.instructions.md` |
| Spring Boot Domain Entity | `.github/instructions/spring-boot-domain-entity.instructions.md` |
| Spring Boot テスト | `.github/instructions/spring-boot-test.instructions.md` |
| pom.xml | `.github/instructions/pom.instructions.md` |
| HTML | `.github/instructions/html.instructions.md` |
| CSS | `.github/instructions/css.instructions.md` |
| JavaScript | `.github/instructions/javascript.instructions.md` |
| TypeScript | `.github/instructions/typescript.instructions.md` |
| Markdown | `.github/instructions/markdown.instructions.md` |
