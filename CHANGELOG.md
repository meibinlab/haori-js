# CHANGELOG

## [Unreleased]

## [0.6.0] - 2026-05-19

### Changed

- `data-derive` / `data-derive-name` を追加し、descendant-only な派生値を `data-if` / `data-each` / 通常式から参照できるようにした
- `data-derive` は初回 scan、`data-bind` 更新、form 更新、`data-derive` / `data-derive-name` の動的 add/change/remove 時に再評価され、子孫の `data-if` / `data-each` より先に反映されるようにした
- `select` に対する既存の `data-each` 経路で、`data-each-before` / `data-each-after` の前後位置が更新後も崩れないようにした

### Library

- `data-derive` のスコープ、名前衝突、未解決参照のクリア、form 更新、`data-if` false 枝、`data-fetch` / `data-import` / `data-fetch-bind` 連携、`data-each` 行ごとの独立性を確認する回帰テストを追加した
- 全体 Vitest 実行で不安定だった `tests/procedure-fetch-options.test.ts` を明示 `scan()` と DOM 後始末で安定化した

## [0.5.1] - 2026-05-16

### Changed

- `data-if` が false の枝では子孫評価を止め、非表示要素内の危険な式や不要な再評価が走らないようにした
- 初回に false だった `data-if` 配下が後から表示されたとき、未初期化の子孫を `scan()` で再初期化するようにした

### Library

- 初回 false の `data-if` 配下にある `data-each` / `data-fetch` / `data-import` が表示後に正しく初期化される回帰テストを追加した
- 表示済み subtree の `true -> false -> true` トグル時に `evaluateAll()` 側で再評価される回帰テストを追加した

## [0.5.0] - 2026-05-14

### Changed

- プレースホルダ解決規則を見直し、`data-if` / `data-each` / 通常属性 / テキストノード / `data-fetch` / `data-import` で、単体プレースホルダと文字列埋め込みの未解決参照・`false`・`null`・`undefined`・空文字の扱いを統一した
- `data-url-param` を入力系属性として `data-if` / `data-each` / 通常属性 / 副作用属性より先に反映するようにした
- `data-each` は未解決参照および `false` / `null` / `undefined` を空配列として扱うようにした
- 通常属性と `data-attr-*` は、テンプレート式を含む場合だけ空結果で削除し、リテラル空文字属性は保持するようにした

### Library

- プレースホルダ解決規則を種類別に網羅する回帰テストを追加し、`data-fetch` / `data-import` / `data-if` / `data-each` / 通常属性 / `data-attr-*` / テキストノード / 評価順を確認できるようにした
- 行追加・削除・移動系の回帰テストと full Vitest 実行で、空値属性を使う `data-click-row-*` が影響を受けないことを確認した
- jsdom 下の再初期化で stale な `MutationObserver` と `HTMLElement` 判定に引きずられないようにし、Observer / Intersect 周辺のテストを安定化した

## [0.4.17] - 2026-05-13

### Changed

- `data-fetch` と `data-import` で未解決参照を含む評価サイクルの副作用実行を止め、後続の bind 更新で参照解決後にだけ再評価するようにした
- `data-fetch` の自動再評価を URL 比較ではなく、URL・HTTP メソッド・ヘッダー・body を含む実行シグネチャ比較で判定するようにした

### Library

- 未解決参照時の `data-fetch` / `data-import` 抑止と、解決後の再評価条件を確認する回帰テストを追加した
- README、README.ja.md、`docs/ja/guide.md`、`docs/ja/specs.md` を新しい `data-fetch` / `data-import` 仕様に合わせて更新した

## [0.4.16] - 2026-05-06

### Changed

- `data-click-copy-params` で include / exclude を併用できるようにし、除外だけ指定した場合も全件コピーから差し引けるようにした

### Library

- `data-click-copy-params` の exclude-only、include/exclude 併用、空トークンと前後スペースの回帰テストを追加した

## [0.4.15] - 2026-05-06

### Changed

- `data-click-reset-before` の評価順を調整し、送信前のリセット後に `data` / `form` / `history` を評価するようにした

### Library

- `data-click-reset-before` と history スナップショットの回帰テストを追加した

## [0.4.14] - 2026-05-06

### Changed

- click 実行時の再入防止で `disabled` 属性の再付与を抑止し、非 form control の disabled をロックとして扱えるようにした

### Library

- 非 form control の disabled 抑止と `data-click-form` 経路の回帰テストを追加した

## [0.4.13] - 2026-05-05

### Changed

- クリック委譲の対象を `data-click-*` 属性を持つ要素に限定し、入力欄など属性のない要素をクリックしたときに不要な `disabled` 付与や処理起動が起きないようにした

### Library

- クリック委譲の対象判定と、`dispatchEvent()` 直後の `disabled` 状態および `Procedure.run` の未起動を確認する回帰テストを強化した

## [0.4.12] - 2026-05-03

### Changed

- `data-if` の非表示処理で inline style の `display: ... !important` を保持し、`hide()` / `show()` の再入でも元の表示状態を壊さないようにした

### Library

- `display: ... !important` の元値保持と `hide()` / `show()` の連続呼び出しを検証する回帰テストを追加した

## [0.4.11] - 2026-05-03

### Changed

- `MutationObserver` 経由の書き戻しで `attributeMap` がテンプレート式を失わないようにした
- `data-attr-*` も `Observer` 経由の書き戻し抑止対象に含め、展開済み値での上書きを防ぐようにした

### Library

- `fromObserver` フラグの伝播と `data-attr-src` の回帰テストを追加した

## [0.4.10] - 2026-05-02

### Changed

- `data-each` 配下で `data-fetch` 経由の再評価でも `data-if` と通常属性の展開が安定するようにした
- `waitForCondition` に `delayMs` を追加し、`scheduleEvaluateAll` の完了確認を DOM 状態ベースで行いやすくした

### Library

- `data-if` と `href` プレースホルダの共存、および `data-fetch` 経由の回帰テストを追加した
- `waitForCondition` の `delayMs` を使った CI 耐性のある待機テストを追加した

## [0.4.9] - 2026-05-01

### Changed

- `data-click-fetch` など click 手続きの実行中は起点要素へ `disabled` 属性を付与し、同一要素の重複実行を抑止するようにした

### Library

- click 手続きの `disabled` 属性付与と重複実行抑止の回帰テストを追加した

## [0.4.8] - 2026-05-01

### Changed

- `data-haori-ready` を `body` に付与し、初期化完了前のちらつきを CSS で抑えやすくした
- `data-import` の取り込み直後スキャンを初期化中に限定し、Observer 起動後の二重初期化を防いだ
- `popstate` で Haori 管理の history だけをリロード対象にし、ブラウザ戻る・進む後の状態崩れを抑えた

### Library

- `data-haori-ready`、`data-import`、`popstate` の回帰テストを追加した

## [0.4.7] - 2026-04-29

### Changed

- `data-each` 配下の `data-if` と通常属性の再評価順を見直し、ページネーションのような再利用行でも表示が崩れないようにした
- clone 時の runtime 表示状態を整理し、テンプレート由来の `hidden` が次の行へ持ち越されないようにした

### Library

- fetch / Procedure の統合テストを安定化し、`afterCallback` と `data-fetch-bind-params` の回帰を確認できるようにした

## [0.4.6] - 2026-04-28

### Changed

- 式評価で object literal を含む安全な式を扱えるようにし、ページネーションなどの表示モデル生成をテンプレート式で記述できるようにした
- object literal の key 位置でも `constructor`、`__proto__`、`prototype` を拒否し、getter / setter / async method / Unicode escape を使った危険キーの迂回を防止した

### Library

- object literal を返す `map()` と、ページネーション向けの `reduce()` 連鎖を評価する回帰テストを追加した
- object literal の危険キー拒否に関する回帰テストを追加した

## [0.4.5] - 2026-04-28

### Changed

- `data-{event}-scroll-error` を追加し、バリデーション失敗やエラー発生時に最初のエラー要素へスクロールできるようにした
- non-form target のエラー表示でも `data-message-level="error"` を起点にスクロールするようにした
- `validate` で最初の不正入力要素へフォーカスし、スクロールを 1 回だけ行うようにした
- `history.state` を使って Haori 管理の履歴だけを `popstate` リロード対象にし、外部の履歴遷移では `location.reload()` しないようにした

### Library

- `data-{event}-scroll-error` と non-form target / 複数 invalid の回帰テストを追加した
- `popstate` の state 判定と `start()` / `stop()` によるリスナー登録・解除の回帰テストを追加した

## [0.4.4] - 2026-04-27

### Changed

- `Haori.toast` で `success` レベルを扱えるようにし、`aria-live` をレベルに応じて切り替えるようにした
- `data-{event}-toast-level` を追加し、イベント属性からトーストレベルを指定できるようにした
- `Form.addMessage` / `Haori.addMessage` を追加し、`data-message-level` を使ったメッセージ表示に対応した
- `clearMessages` で `data-message-level` も削除するようにした
- `Haori.dialog` / `confirm` のリテラル `\n` 正規化を Procedure 経路に限定した
- `data-fetch-bind-arg` を `data-fetch-arg` の別名として扱い、仕様書とガイドで優先順位を整理した

### Library

- `toast` レベル、`data-{event}-toast-level`、`addMessage` / `clearMessages`、`dialog` / `confirm` の改行正規化、`data-fetch-bind-arg` の回帰テストを追加した

## [0.4.3] - 2026-04-25

### Changed

- `data-{event}-copy` と `data-{event}-copy-params` を追加し、イベント種別に依存しないバインディング値のコピーを扱えるようにした
- `reset` の後に `copy` を実行するようにし、フォームリセット後の値をコピーできるよう改善した
- `docs/ja/specs.md` と `docs/ja/guide.md` をコピー仕様に合わせて更新した
- `data-url-param` で URL に存在しないクエリパラメータをフォームへ書き戻さず、既存値を維持するよう修正した
- `data-attr-*` を追加し、ブラウザが先に解釈する属性を raw テンプレートを保持したまま安全に更新できるようにした
- `data-attr-value` は `value` 属性のみを更新し、DOM property を同期しない仕様に合わせて README とドキュメントを更新した

### Library

- `data-{event}-copy`、`copy-params`、`reset` 後のコピー順序を確認する回帰テストを追加した
- `data-url-param` の未存在キーをスキップする回帰テストを追加した
- `data-attr-src` の再評価と `data-attr-value` の属性専用更新を確認する回帰テストを追加した

## [0.4.2] - 2026-04-25

### Changed

- form 自身の `data-bind` / `Core.setBindingData()` 更新時に、フォーム配下の入力要素へ無イベントで逆方向同期するよう改善した
- `value="true"` を持つ checkbox を boolean モードとして扱い、未チェック時は `false` を返すよう改善した
- checkbox を含む `data-fetch-arg` デモを更新し、フォーム双方向バインディングの挙動を確認できるようにした

### Library

- フォーム逆方向同期、boolean checkbox、無限ループ防止の回帰テストを追加した

## [0.4.1] - 2026-04-25

### Changed

- `data-fetch` / `data-bind` 経由で `value="{{...}}"` を更新した際に、text input / textarea / select の `element.value` と内部値がずれないよう修正した
- フォーム入力バインディングの回帰テストを追加し、textarea / checkbox / `Form.getValues()` の経路を確認した

### Library

- 入力値同期の修正とフォーム回帰テストを追加した

## [0.4.0] - 2026-04-24

### Changed

- `data-runtime` を追加し、embedded / demo の実行モードで Procedure の挙動を切り替えられるようにした
- demo runtime では非 GET の `data-fetch` / `data-click-fetch` を GET + query に正規化し、`haori:fetchstart` の detail に runtime / requestedMethod / effectiveMethod / transportMode / queryString を追加した
- `data-click-history` のデモを追加し、`history.pushState` の URL 生成と履歴更新を画面上で確認できるようにした
- README、README.ja.md、docs/ja/specs.md を runtime / demo 仕様に合わせて更新した

### Library

- runtime / fetch 正規化 / history 更新の回帰テストを追加した
- runtime demo と history demo を追加した

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
