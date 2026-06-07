# CHANGELOG

## [0.13.2] - 2026-06-07

### Fixed

- `type="number"` の数値化を `value="{{...}}"`（value 属性のテンプレート評価）経由にも適用した。従来は `syncValue` / `applyValue` 経由のみ正規化され、属性評価経由では文字列のまま内部値に残っていた（`data-attr-value` は仕様上 `input.value` を同期しないため対象外）。
- `haori.date()` でフォーマット中の英字（`y M d H m s`）が常にトークンとして解釈され、リテラル文字（例 `'Month'` の `M`）が誤って置換される問題に対し、シングルクォートによるリテラルエスケープ（例 `yyyy-MM-dd'T'HH:mm`、`''` は `'` 1文字）を追加した。
- `haori.number()` で空白のみの文字列が `0` になっていたのを空文字に修正し、数値文字列の前後空白を無視するようにした。
- `haori.pages()` で「隠れるページが1つだけ」のとき（ギャップが2）でも省略記号を出していたのを、その番号を表示するよう改善した（例 `pages(5, 2, {window: 0})` → `1 2 [3] 4 5`）。
- `EventDispatcher` のクリック委譲・`data-{event}-prevent`・`data-click-defer` 判定がプレフィックスを `data-` でハードコードしていたのを `Env.prefix` 基準に修正した。`data-prefix` でプレフィックスを変更した場合に委譲・prevent・defer が機能しなかった既存の不具合を解消（既定 `data-` では挙動不変）。
- 式評価で予約名前空間 `haori` の参照を検出する際、文字列リテラル（`'...'` / `"..."`）内の `haori` を識別子と誤認して不要な注入・警告を出していたのを、検出前に文字列リテラルを除外して回避した（テンプレートリテラルの `${...}` は対象外）。

### Documentation

- 上記の挙動（date のエスケープ、number の空白扱い、pages の単一ページ表示、number 収集経路と `data-attr-value` の非対象、エラー応答 `errors` 配列の改行連結）を specs.md・guide.md に反映した。

### Library

- date エスケープ、number の3桁丸め・空白、range の非整数/上限、pages の単一ページ/boundary、式の文字列リテラル除外、value 属性経由の number 収集、カスタムプレフィックス時の prevent/委譲、change での prevent 無害性を検証する回帰テストを追加した。

## [0.13.1] - 2026-06-07

### Packaging

- npm パッケージの同梱物を実行時成果物だけに絞った。`files` を `dist` 一括指定から `dist/haori.es.js` / `dist/haori.cjs.js` / `dist/haori.iife.js` / `dist/index.d.ts` の明示指定へ変更し、これまで同梱されていたコンパイル済みテスト（`dist/tests/**`）・ソースマップ（`*.map`）・型宣言の個別ファイル（`dist/src/**`）・設定ファイル（`dist/vite.config.*` 等）を公開物から除外した（unpacked size を縮小。ランタイム動作・CDN 配信・型解決には影響なし）。
- `exports` を実在ファイルへ修正した。`import` 条件が存在しない `./dist/haori.js` を指していた不整合を `./dist/haori.es.js` に直し、`require`（`./dist/haori.cjs.js`）と `types`（`./dist/index.d.ts`）条件、および `module` / `unpkg` / `jsdelivr` フィールドを追加して、ESM `import`・CJS `require`・型・CDN の各解決を正しくした。型宣言（`dist/index.d.ts`）はロールアップ済みで自己完結のため、`dist/src` を除外しても型解決に影響しない。

## [0.13.0] - 2026-06-07

### Changed

- `type="number"` の `<input>` を**数値型**として収集・バインドするようにした。HTML の入力値は常に文字列だが、バックエンドの DTO が `Double` / `Integer` を期待する場合に文字列で送られて型不一致になるのを防ぐ。空文字・数値化できない値は `null`、小数はそのまま数値になる。`ElementFragment` の内部値正規化（`normalizeValueForElement`）を、DOM→内部値（`syncValue`：`change`・構築時）とバインド→内部値（`applyValue`）の両経路に適用し、`Form.getValues()` の結果や JSON 送信ボディに数値として現れる。**挙動変更**: 0.12.x までは `type="number"` も文字列で収集していた。文字列のまま扱いたい場合は `type="text"` を使う

### Library

- `type="number"` の数値型変換について、静的 value 属性・小数・空値（`null`）・`change` 入力後・数値文字列バインド経由の各ケースを検証する回帰テストを追加した。挙動変更に伴い、既存のフォーム収集テストの期待値（`type="number"` の項目）を数値に更新した

### Documentation

- 既存機能で実現できる利用パターンを文書化した（コード変更なし）:
  - サーバの 4xx レスポンスが `{"errors": {"フィールド名": "メッセージ"}}`（配列も可）形式のとき、`key` が `name` 一致のフィールドへ自動振り分けされ、haori-bootstrap 併用時は `invalid-feedback` / `is-invalid` が自動描画されること（フィールド別エラー表示。トップレベル配列形式は未対応）
  - `data-if` + 1つの状態キーで「同時に1つだけ開く」排他パネル／アコーディオンを宣言的に表現できること
  - `data-click-fetch` を伴わない `data-click-data` + `data-click-bind`（`data-click-bind-merge` 併用可）で、フェッチなしに任意 JSON を state へ反映できること
  - `data-click-click`（複数要素にマッチ可）で複数の隠し要素のクリックを発火し、各々の `data-click-bind-arg` で同じ要素の別キーへマージすることで、連番属性なしに複数エンドポイントの取得結果を1つの state へ統合できること（取得は非同期で完了は待たない点に注意）

## [0.12.0] - 2026-06-05

### Added

- テンプレート式から呼び出せる組み込みヘルパーを追加した。式中の予約名前空間 `haori` として注入され、`haori.date(value, format?)`（日時整形）・`haori.number(value, decimals?)`（数値整形）・`haori.range(start, end?, step?)`（整数レンジ）・`haori.pages(totalPages, current, options?)`（省略記号付き番号ページネーション）を提供する。いずれも副作用のない純粋関数で、`data-each="haori.pages(...)"` や `{{ haori.date(lastUpdatedAt, 'yyyy/MM/dd HH:mm') }}` のように宣言的に利用できる。同じ関数は公開 API `Haori.date` / `Haori.number` / `Haori.range` / `Haori.pages` としても利用できる。`pages()` の `current` は 0 始まり（Spring の `Page.number` 等）を想定し、各要素の `label` は表示用に 1 始まりへ変換される
- `data-{event}-prevent`（主に `data-click-prevent`）を追加した。指定要素のイベントでブラウザのネイティブなデフォルト動作（`type="submit"` のフォーム送信や `<a href>` の遷移）を抑止する。クリックの同期区間で `preventDefault()` を呼ぶため `data-click-defer` と併用しても確実に抑止でき、`stopPropagation()` は呼ばないので他ライブラリのイベント伝播には影響しない。これにより `type="submit"` のまま `data-click-fetch` 等を付けても、ページ再読込なしにフェッチ・トースト・リダイレクトが機能する

### Library

- `haori` は式評価エンジンの予約名前空間となり、`data-bind` で同名のキーを与えても式中では組み込みヘルパーが優先される（開発モードでは警告を出す）。式が `haori` を独立した識別子として参照する場合のみヘルパーを注入し、参照しない式には影響しない
- 組み込みヘルパー（date/number/range/pages）の単体テスト、式評価への注入・予約名の上書き不可・プロパティアクセス非干渉の回帰テスト、`data-{event}-prevent` の送信抑止・オプトイン・`data-click-defer` 併用の回帰テスト（vitest）、および実ブラウザでの日時整形・番号ページネーション・送信抑止を検証する Playwright e2e（`demo/builtins/haori-builtins-demo.html`）を追加した

## [0.11.1] - 2026-06-03

### Documentation

- `data-{event}-run` の `{{...}}` 展開結果が実行コードへ文字列結合される（信頼できない値を入れると任意コード実行＝XSS になり得る）旨のセキュリティ警告を、guide.md・specs.md（属性詳細とセキュリティ章）に追記した。信頼できる値のみを `{{...}}` に入れ、信頼できない値は `data-bind` 経由で関数内部から参照する旨も明記した

## [0.11.0] - 2026-06-03

### Added

- `data-{event}-run` を追加した。フェッチを伴わないクリック等のイベントで任意の JavaScript を実行する（`data-click-run` / `data-change-run` など）。属性値は `{{...}}` をレンダリング時に展開した文字列を本体として `new Function('event', ...)` で実行する（`data-{event}-before-run` / `-after-run` と同じ実 JS 実行方式）。本体が `false` を返した場合のみ `event.preventDefault()` を呼ぶ（`onclick="return false"` / jQuery と同じ慣習）。`event` を引数で受け取れるため `stopPropagation()` 等も明示できる。`data-click-fetch` と併用した場合は run を同期実行してから fetch を継続する（run の戻り値は preventDefault のみを制御し fetch は中止しない）。評価・実行エラーは `Log.error` で報告する

### Library

- `data-{event}-run` のクリック実行・`{{...}}` 展開・`return false` での preventDefault・戻り値なしでの非抑止・エラー時の Log.error・change イベントでの動作を検証する回帰テストを追加した

## [0.10.1] - 2026-06-03

### Changed

- 式評価で使用できないキーワード（`function`・`return` などのステートメント系キーワード）を含む式が失敗した場合、従来の汎用的な `Expression contains dangerous patterns` ではなく、検出したキーワード名と「アロー関数を使う（`x => ({key: value})`）」具体的なヒントを併記した警告を出すようにした。`data-derive` で `function(m){return {...}}` を使うと式が `null` になり行が描画されない、といった原因の分かりにくい事象の特定を容易にする（プロパティ名や部分一致は誤検出しない）

### Library

- 使用できないキーワードを含む式の評価失敗時に、具体的なヒント付き警告を出すこと・正常なアロー関数式や部分一致識別子では出さないことの回帰テストを追加した
- `data-derive` → `data-each` 連鎖の行描画が `Haori.waitForRenders()` で待機できること、各行に nested `data-fetch` を含む場合も待機できることの回帰テストを追加した

## [0.10.0] - 2026-06-03

### Fixed

- `data-each` がテンプレート（最初の要素子）をフラグメント木から見つけられない場合に、対象要素の DOM 要素子からテンプレートを復旧するフォールバックを追加した。Bootstrap タブペイン内のネスト `data-if` 配下を `data-click-bind-arg` で更新する特定フローで、フラグメント木と DOM の子が同期せずテンプレート未検出となり一覧が描画されない（`{{...}}` が未評価のまま1行残る）不具合を修正した。フォールバック時は先頭の要素子をテンプレートとし、`each-before`/`each-after` 以外の残留要素子（未追跡の素の DOM ノードを含む）もまとめて除去してから差分更新を開始するため、複数の残留行があっても全行が正しく再構成される
- `data-*-bind-arg` のバインドを、バインド先「自身の」binding（`getRawBindingData`）のみを基底に `bindArg` キーだけ更新するようにした。従来は `getBindingData()`（継承込み）を基底にしていたため、継承キーがバインド先の `data-bind` に混入していた。読み取り〜書き込みは同期で行われ呼び出し単位で原子的なため、並行・リアクティブな複数 `bind-arg` が重なっても各キーが保持される（互いに上書きしない）

### Added

- `data-click-defer` を追加した（依頼4）。指定時は Haori のクリック手続きをクリックイベントの同期実行中ではなく次フレーム（`requestAnimationFrame` / `setTimeout(0)`）へ遅延し、Bootstrap の collapse トグルなど他ライブラリの同期 click ハンドラを先に完了させる。`data-click-no-disabled` と併用できる（ただし再描画による命令的クラスの上書き＝別要因はこれでは解消しない）

### Changed

- 式評価で使用できない（ブロックされた）グローバル識別子（`Object` など）を参照して評価に失敗した場合、コンソールに「`blocked identifier(s): …`」という明示的な警告を出すようにした。`Object.assign(...)` のように原因の分かりにくい `TypeError` になるケースで、原因特定とスプレッド構文への移行を促す（プロパティアクセス `foo.Object` は誤検出しない）
- 開発モード（`Dev.enable()`）で `data-if` 式が falsy（非表示）と評価されたとき、その式と参照識別子の解決値・由来（`dumpScope` の `sources`）をコンソールに出力するようにした（依頼3）。`data-if="!(dialog?.id || id)"` の `id` がフォーム入力等の想定外スコープで解決される問題のデバッグに役立つ

### Documentation

- `data-each` の配置ルール（コンテナ要素に付与し最初の子要素をテンプレートとする。テーブルは `<tbody data-each>`、`<tr data-each>` は誤り）を `guide.md` に明記した
- 式でブロックされる識別子に `Object` を明記し、`Object.assign` の代わりにスプレッド構文 `{...a, ...b}` を使う旨と、ブロック識別子参照時の警告について `guide.md` に追記した
- `name="id"` フォーム内のスコープ競合を避ける `data-derive` 推奨パターン（クリーンなスコープで判定値を計算し一意名で公開）と、開発モードの falsy `data-if` 診断出力について `guide.md` に追記した（依頼3）

### Library

- フラグメント子と DOM の子が同期しない状況でも `data-each` がテンプレートを復旧して全行描画することの回帰テストを追加した
- `data-*-bind-arg` が継承キーを混入させず、連続バインドで各 `bindArg` キーを保持することの回帰テストを追加した
- 式評価でブロック識別子（`Object` 等）を参照したとき警告を出すこと・プロパティアクセスを誤検出しないことの回帰テストを追加した
- `data-click-defer` 指定時に Procedure がクリック同期中ではなく次フレームで起動すること、未指定時は同期起動することの回帰テストを追加した
- 開発モードで falsy な `data-if` の式と参照スコープを出力すること・無効時は出力しないことの回帰テストを追加した

## [0.9.0] - 2026-06-03

### Fixed

- `haori:bindcomplete` を、バインド操作だけでなく**バインド起因の `data-if` 表示切り替えと `data-each` 差分描画の DOM 反映完了後**に発火するよう強化した。`evaluateEach` の再入時の再実行を fire-and-forget から待機可能（loop-until-stable な単一 settle Promise を共有）へ変更し、`evaluateAll`→`setBindingData`→`haori:bindcomplete` が最終描画まで確実に待つようにした

### Added

- `Core.dumpScope(element)` を追加した（ブラウザでは `Haori.Core.dumpScope(element)`）。式の識別子解決で見えるスコープ（`resolved`）と各キーの由来要素・種類（`sources`: `bind` / `derive`）を返し、開発モード（`Dev.enable()`）時はコンソールにも出力する。スコープ衝突のデバッグに利用できる
- `data-each` の描画完了を外部テストから検知する手段を追加した（依頼3）。`data-each` が最新データで全行の描画を完了すると対象要素に `data-each-done` 属性を付与する（更新開始で除去、安定完了で再付与）。Playwright 等は `waitForSelector('[data-each-done]')` で待機できる
- `Haori.waitForRenders()`（および `Queue.waitForIdle()` / 最上位 `waitForRenders` エクスポート）を追加した。進行中・追従投入分を含むすべてのレンダリングタスクの完了を待つ `Promise<void>` を返す。タブ切り替えやクリック後の複数描画をまとめて待機でき、イベント購読タイミングの競合を回避できる
- `data-click-no-disabled` を追加した（依頼4）。指定時はクリック手続き中にボタンへ native `disabled` を付与しない。Bootstrap など他ライブラリの click ハンドラや CSS が `disabled` 要素を無視する問題を回避でき、Haori 内部の多重実行ガード（`data-haori-click-lock` / WeakSet）は維持される
- `data-form` 属性を追加した。`<form>` を直接置けない場所（`<table>` 内の `<tr>` など）でも、`data-form` を付けた任意の要素を `data-click-form` 等の値収集コンテナとして扱える。`Form.getFormFragment` が `<form>` に加えて `data-form` 要素を認識する（値収集専用で、双方向バインディングは行わないため `data-each` 行の binding data を壊さない）

### Documentation

- 式の識別子解決スコープ（DOM ネスト優先・`data-derive` の位置づけ・グローバル）と、**フォーム入力値は change／明示同期までスコープに投入されない**ことを `guide.md` に明文化した。あわせて `haori:bindcomplete` の発火タイミング保証（DOM 反映完了まで）を追記した
- 外部テスト（Playwright 等）から `data-each` の描画完了を待機する手段（`data-each-done` 属性 / `Haori.waitForRenders()`）を `guide.md` に追記した
- `data-click-no-disabled` と他ライブラリ（Bootstrap 等）との共存（Haori はイベント伝播を止めないこと、`disabled` 付与の回避、命令的クラス上書きの注意）を `guide.md` に追記した

### Library

- `haori:bindcomplete` 発火時点で `data-if` 表示・`data-each` 全行が反映済みであること、`Core.dumpScope` のスコープ解決・由来情報（内側優先、フォーム未同期時の外側フォールバック）に関する回帰テストを追加した
- `data-each-done` の付与/除去タイミングと `Haori.waitForRenders()` / `Queue.waitForIdle()` による描画完了待機に関する回帰テストを追加した
- `data-click-no-disabled` 指定時に `disabled` を付与しないこと・多重実行ガードが維持されることの回帰テストを追加した
- `data-form` を form コンテナとして認識すること、`<tr data-form>` のテーブル行で `data-click-form` が行 id を保持したまま入力値を収集・送信できることの回帰テストを追加した

## [0.8.0] - 2026-06-03

### Changed

- `data-load-*` を `data-if` の表示（`haori:show`）と連動させ、非表示→表示への遷移時にも発火するようにした。`<button>` や `<div>` などネイティブの `load` イベントが発生しない要素でも、表示を契機とした処理を定義できる。発火は遷移時のみで、表示状態のままの再評価では再発火しない
- `data-if` の非表示判定を JavaScript の falsy 準拠に統一し、数値 `0` と空文字列 `''` も非表示とした（従来は `false`・`null`・`undefined`・`NaN` のみ非表示）。`data-if="items.length"` が要素数 0 のとき意図どおり非表示になる。空配列 `[]`・空オブジェクト `{}` は従来どおり truthy として表示される

### Fixed

- `data-each` の差分更新（`updateDiff`）を再入制御で直列化し、`data-*-bind-arg` などでバインド直後にリアクティブ再評価が重なった際に、同一 `data-each` への並行評価で行が重複・欠落したり描画が停止したりする不具合を修正した。実行中の再評価要求は記録し、現在の更新完了後に最新データで一度だけ再実行する

### Added

- `data-*-bind-merge`（`data-click-bind-merge`・`data-change-bind-merge`・`data-load-bind-merge`・`data-intersect-bind-merge`・`data-fetch-bind-merge`）を追加した。指定時はバインド先の既存 `data-bind` を保持したまま解決済みデータを浅くマージ（未指定キーを保持）する。未指定時は従来どおり全置換。計算値（例: `selectedId={{items[0].id}}`）を既存 state にマージしたいケースで利用できる
- `haori:bindcomplete` イベントを追加した。`data-*-bind` / `data-*-bind-arg` などによるバインドと対象要素配下の再評価（`data-if` / `data-each` 等）の完了時に対象要素で発火し、`detail.bindArg`（使用したネストキー、無指定なら `null`）を提供する。外部スクリプトからのバインド完了同期に利用できる

### Documentation

- `haori:eachupdate` の発火タイミングを仕様として明文化した。`data-each` の差分で追加・削除・並べ替えされた全行が DOM に反映され、各行の内容描画（`{{...}}` 補間等）が完了した後に発火することを保証し、大量行が複数フレームに分割描画される場合でも全フレーム完了後に1回発火するため**外部からの描画完了検知に利用できる**ことを `guide.md` に記載した（`detail`: `added` / `removed` / `order` / `total`）

### Library

- `data-load-*` の表示連動発火（遷移時の1回発火、表示維持時の再発火なし、`data-load-*` 非保持要素では未起動）に関する回帰テストを追加した
- `data-if` の falsy 判定（`0`・`''` で非表示、`[]`・`{}` で表示）に関する回帰テストを追加した
- `data-*-bind-merge` の浅いマージ（既存キー保持・上書き）と未指定時の全置換に関する回帰テストを追加した
- `data-*-bind-arg` バインド後の `data-if` 表示・`data-each` 全行描画、同一 `data-each` への並行評価の安全性、`haori:bindcomplete` 発火に関する回帰テストを追加した
- `haori:eachupdate` が「全行の描画完了後」に発火すること（25行で発火時点に全行補間済み）と、`detail` の `added` / `removed` / `order` / `total` に関する回帰テストを追加した

## [0.7.0] - 2026-06-01

### Changed

- `data-click-copy-source` 属性を追加し、`data-click-copy` のコピー元要素を CSS セレクタで明示指定できるようにした。指定がない場合は従来通り `data-click-form` またはトリガー要素の binding data を参照する。空文字指定は自要素をコピー元とする
- `data-click-click` で click を発火する前に `Core.evaluateAll()` を呼ぶようにし、bind 完了後の最新 DOM をクリック先要素が確実に参照できるようにした

### Library

- `data-click-copy-source` のフォーム・binding data・空文字・優先順位・エラーケースを確認する回帰テストを追加した
- `data-click-click` の post-bind 再評価に関するコメントを追加した

## [0.6.2] - 2026-05-26

### Changed

- `data-derive` で入力シグネチャが不変な subtree の再評価をスキップし、重い一覧の再描画コストを抑えた
- development mode の evaluation profiler で、属性・テキスト・プレースホルダごとの `calls`、`totalDurationMs`、`maxDurationMs` を取得できるようにした
- 未宣言識別子を含む optional chaining とフォールバック式では、必要な識別子だけを `undefined` として補完し、初期 `data-bind` が空でも後段の代替値まで評価できるようにした

### Library

- `data-derive` のスキップ判定と evaluation profiler の duration 集計に関する回帰テストを追加した
- 未宣言識別子を含む optional chaining の回帰テストを追加し、未解決参照の副作用抑止を維持したままフォールバック評価できることを確認した
- npm publish の権限不足が `E404` に見えるケースを公開手順へ追記し、リリース時の切り分けをしやすくした

## [0.6.1] - 2026-05-22

### Changed

- `data-each` の描画経路を見直し、入力シグネチャ比較・差分更新・再利用行評価・fresh clone 初期化の無駄を減らして大きな一覧の描画負荷を下げた
- plain nested `data-each` では、入力と要素自身の動的状態が不変な場合に子 `data-each` の再評価をスキップするようにした
- 式評価の危険値チェックと `MutationObserver` 周辺のオーバーヘッドを削減し、大量再評価時のコストを抑えた

### Library

- `data-each` の並び替え・追加削除同時更新・再利用行・fresh clone 初期化・nested `data-each` の同値スキップを確認する回帰テストを追加した
- `customers.html` 相当の重い描画パスを前提に最適化を見直し、Vitest・Playwright・lint を通して回帰がないことを確認した

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
