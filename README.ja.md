# Haori.js（日本語ドキュメント）

Haori.js は、HTML 属性を中心にして動的な UI を実現する軽量なライブラリです。JavaScript をほとんど書かずに、データバインディング、条件分岐、繰り返し処理、フォームの双方向バインディング、サーバー通信などを HTML 属性で宣言できます。

バージョン: 0.45.2

---

**目次**

- 概要
- インストール
- クイックスタート
- よく使う属性（概要）
- 公開・ビルド手順
- ライセンス・貢献
- 詳細ドキュメント

---

## 概要

- 設計思想: HTML-First（HTML 属性のみで UI を宣言）
- 内部状態を正とし、表示状態は DOM へ非同期で追随する
- 主な特徴:
  - データバインディング（`data-bind`）
  - 条件表示（`data-if`、JavaScript の falsy 準拠: `false`・`null`・`undefined`・`NaN`・`0`・`''` は非表示）
  - 繰り返し表示（`data-each`）
  - フォーム双方向バインディング（`name` 属性による自動バインド）
  - `value="true"` を付けたチェックボックスの boolean 対応（チェック時 `true`、未チェック時 `false`）
  - `type="number"` 入力の数値型対応（バインド・送信時に数値。空・数値化できない値は `null`）
  - イベント駆動アクション（`data-click-*`・`data-change-*`・`data-load-*`・`data-intersect-*`）
  - 定期取得（`data-poll-*`。取得間隔・打ち切り時間・停止条件を指定）
  - サーバー通信（`data-fetch`）
  - HTML インポート（`data-import`）
  - ライフサイクルイベント（`haori:eachupdate`・`haori:bindcomplete`・`haori:show` / `haori:hide` など）
  - ゼロ依存（ブラウザネイティブのみ）

必要に応じて `data-runtime` と `Env.runtime` を使い、組込利用とデモ表示で挙動を切り替えられます。

## インストール

npm:

```bash
npm install haori
```

CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/haori/dist/haori.iife.js"></script>
```

この CDN URL は npm に公開済みの最新バージョンを参照します。

ES Module:

```js
import Haori from 'haori';
```

---

## クイックスタート

HTML だけで簡単に使えます。以下は最小の例です。

```html
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>Haori サンプル</title>
    <script src="https://cdn.jsdelivr.net/npm/haori/dist/haori.iife.js"></script>
  </head>
  <body>
    <div data-bind='{"name":"太郎"}'>
      <p>こんにちは、{{name}} さん</p>
    </div>
  </body>
</html>
```

JavaScript からマウントする例:

```js
import Haori from 'haori';

Haori.mount(document.body, {items: [{name: 'りんご'}, {name: 'みかん'}]});
```

---

## よく使う属性（概要）

- `data-bind` — 要素にバインディングデータを設定（JSON またはパラメータ形式）。**トップレベルキーの予約名**: グローバルと衝突するデータ／ナビゲーション／ストレージ系の名前（`location`・`history`・`document`・`navigator`・`localStorage`・`sessionStorage`）は**トップレベルキーとして利用でき**、式中ではバインド値が同名グローバルを遮蔽します（例 `{"history":[…]}` を `data-each="history"` で利用可）。実行系・プロトタイプ脱出名（`window`・`self`・`globalThis`・`Object`・`Function`・`eval`・`constructor`・`__proto__`・`prototype`・`setTimeout` など）は**使えません**。その場合、該当キーだけが無視され（式中では `undefined`）、残りのキーは通常どおり描画され、無視したキー名が `error` ログに出力されます。ネストしたオブジェクト／配列要素のプロパティ名には制約はありません。
- `{{ ... }}` — テンプレート式（式評価により挿入）
- `data-if` — 条件に応じて要素を表示 / 非表示
- `data-each` — 配列を繰り返し表示（`data-each-key`, `data-each-arg`, `data-each-index` など）
- `data-attr-xxx` — ブラウザが先に解釈する属性を安全に更新（`src`, `value` など）
- `data-value-type` — 入力欄の収集値の型を宣言します（`boolean` / `number` / `string`）。`input` の値は常に文字列のため、真偽値を `type="hidden"` に載せると `"true"` という文字列で送られます。型を宣言すると、収集値・バインドデータ・送信ボディが API の期待する型になります（判定できない値は `null` になるため、未入力を `false` として送りません）。利用者に見せないだけの項目を、真偽値のために「表示しないチェックボックス」で代用する必要がなくなります。`checkbox` / `radio` / `file` と複数選択の `<select>` では無視します（開発モードで警告）。
- `data-fetch` — サーバーからデータを取得してバインド
- `data-import` — 外部 HTML を読み込んで挿入
- `data-url-param` — URL のクエリパラメータをバインディングに取り込む
- `data-store` — 宣言したバインディングキーをブラウザストレージへミラーします（1 ストレージキー = 1 JSON レコード）。復元は `data-bind` の直後に処理されるため、`data-if` の条件・`data-each` の配列・入力欄の初期値としてそのまま機能します。対象キーは `data-store-params="a&b"` で選び、`data-store-arg="名前"` でレコード内へネストできます（どちらか一方が必須）。`data-store-type="session|local"` で保存先を選べます（既定 `session`）。保存は対象キーの値が変わったときに自動で行われ（フォームの双方向コミットとフェッチ応答を含む）、バインディングと同期で書き出すため `data-{event}-redirect` の直前でも取りこぼしません。書き込みは宣言したキーだけを置換するので、画面ごとに担当キーを持てます。入力状態を保存する場合は `<form>` 自身に宣言してください。破棄は `data-{event}-store-clear="キー"`（＋ `-type`）で行います。これにより複数画面のウィザードを JavaScript なしで実現できます。
- `data-unauthorized-redirect` / `data-forbidden-redirect` — `<body>`/`<html>` に宣言する認証ガード。Haori の fetch 応答が 401／403 のとき指定 URL（式可）へ遷移します。全 fetch 経路（`data-fetch`・イベント fetch・`data-import`）に適用。ステータス別オプトイン。`*-return-param="クエリ名"` を併用すると、ログイン後復帰用に現在の `pathname+search+hash` を戻り先クエリとして自動付与します（遷移先に同名クエリがあればそちらを優先）。
- `data-{event}-redirect-replace="URL"` — 履歴を置き換えて遷移します（`location.replace()` 相当）。申込の確定のように一度きりの操作を終えた画面を履歴に残さないため、完了画面から「戻る」で戻って同じ操作をもう一度実行する経路が無くなります。遷移先の評価タイミングは `data-{event}-redirect` と同じで、両方を宣言した場合はこちらを採用して警告します。
- `data-{event}-redirect-return-param="クエリ名"` — 上記の対称な受け手側。手続きの成功後リダイレクト先を URL クエリから解決し、**安全な同一オリジンのローカルパス**のときのみそこへ遷移します（オープンリダイレクト対策を内蔵）。安全でない／値が無い場合は `data-{event}-redirect` へフォールバック。認証ガードの `*-return-param` と同名クエリで使えば付与 → 消費が対称になり、従来必要だった手書きの検証 JS が不要になります。

追加のバインディング補助:

- `data-derive` / `data-derive-name` — 要素上で派生値を定義し、その要素の子孫にだけ公開します。親子プルダウンのような用途で使えます。
- `data-*-bind-merge`（例: `data-click-bind-merge`・`data-fetch-bind-merge`）— 結果をバインド先要素へ反映する際、`data-bind` を全置換せず、既存の値を保持したまま浅くマージします（新しいデータに無いキーは保持）。`selectedId={{items[0].id}}` のような計算値を既存 state に追記したい場合に有用です。
- `data-fetch-arg` / `data-{event}-bind-arg` — 結果をバインドするキー名を指定します。**そのキーの配下だけを更新するため、バインド先の他のキーは保持されます**（`-bind-merge` は不要で、キー名を指定した場合は無視します）。キー名を指定しないと**バインド先を全置換**するため、別の `data-fetch` が寄せていたキーが消え、そのフェッチは実行シグネチャが変わらないので再取得もされません。共有する state へ寄せる場合はキー名を指定してください。`data-fetch-bind-arg` は `data-fetch-arg` の別名で**非推奨**です（両方ある場合は `data-fetch-arg` を採用）。

イベント駆動アクション:

- `data-click-*`・`data-change-*`・`data-input-*`・`data-load-*`・`data-intersect-*` は、それぞれクリック・フォーム変更・逐次入力・要素ロード・ビューポート交差を契機に処理（fetch、bind、copy、ダイアログ操作など）を宣言します。`data-load-*` は `data-if` 要素が非表示→表示へ遷移した（`haori:show`）タイミングでも発火するため、ネイティブの `load` が発生しない `<button>` などでも利用できます。
- `data-poll-*` — タイマーで手続きを繰り返し起動します（定期取得）。別端末や別プロセスでの操作完了を待つ画面に使います。アクション語彙は `data-{event}-*` と共通（`data-poll-fetch`・`data-poll-bind`・`data-poll-bind-arg` など）。設定属性は `data-poll-interval`（取得間隔ミリ秒。既定 5000、下限 100）、`data-poll-timeout`（打ち切りミリ秒。省略時は無制限）、`data-poll-until="{{式}}"`（真になった時点で恒久停止。各リクエスト前とバインド反映後に評価）、`data-poll-error-limit`（連続失敗回数の上限。省略時は継続）、`data-poll-disabled`（真の間は抑止）、`data-poll-state`（`_poll` 状態の注入先。`running`・`paused`・`stopped`・`timedOut`・`stopReason`・`count`・`elapsedMs`）です。初回は即時実行、2回目以降は前回完了時点から計測するためリクエストは多重化せず、`data-if` で非表示の間は一時停止して再表示で再開し、DOM から外れた時点で恒久停止します。バックグラウンドタブではブラウザがタイマーを抑制するため指定間隔は保証されません（タブが表示に戻った時点で即時に取得し直します）。
- `data-input-*` — テキスト入力1文字ごと（`input` イベント）に手続きを起動します。逐次発火するため `data-input-*` を**明示した要素のみ**が対象（オプトイン）で、`change` 同様に先祖フォームを自動検出して双方向バインディングへ反映します。検索欄の逐次絞り込みなどに使えます（例: `<input name="q" data-input-form>`）。
- `data-on="イベント名"` ＋ `data-on-*` — `window` / `document` へ dispatch された**任意のカスタムイベント**を契機に手続きを起動します（アクション語彙は `data-{event}-*` と共通）。ネイティブ橋の準備完了通知など、組み込みイベント以外での初期化を宣言的に書けます（例: `<body data-on="appReady" data-on-fetch="/api/init.json" data-on-bind="#app">`）。イベント名は属性値で保持（属性名の小文字化対策）、`window` キャプチャ1本で二重発火なく購読、後挿入要素も追従。組み込みイベント名（click/change/input/load）は警告し購読しません。Haori 購読開始前に発火したイベントは受け取れない点に注意。
- `data-validity="{{式}}"` / `data-validity-message="…"` — 入力欄へ宣言するフィールド間検証です。条件を `setCustomValidity()` へ反映してネイティブ検証（`data-{event}-validate`）に相乗りするため、バブル表示・フォーカス移動・`:invalid` の装飾がそのまま使えます。「連絡先いずれか必須」「メールアドレスの一致」のようにネイティブの制約では表現できない条件を宣言できます。
- `data-{event}-if="{{式}}"`（非イベントは `data-fetch-if`）— 手続きの実行条件です。偽なら fetch・リダイレクト・`data-{event}-run` まで含めて実行しません。どちらも**実行時に同期評価**するため、属性の再描画（`requestAnimationFrame`）を待たず、直前に変更した入力を含めて判定されます（`data-attr-disabled` では「最後の欄を直してそのまま押す」操作で 1 フレーム古い判定になります）。押下のブロックに `disabled` を使わないでください。無効化されたボタンはクリックイベントを発火しないため、「直したのに押せない」方向は救えません。
- 応答のバインドより**後**に実行されるアクション（`data-{event}-redirect`・`-redirect-replace`・`-redirect-return-param`・`-dialog`・`-toast`・`-history`・`-scroll`）は、実行する直前に属性を評価します。そのため遷移先やメッセージを応答の値で切り替えられます（`data-click-redirect="{{nextAction === 'pay' ? redirectUrl : '/complete.html'}}"`）。応答は `data-{event}-bind` で自要素または祖先へ反映してください（式のスコープに入る位置が必要です）。式が使っていたキーが手続きの途中で消えた場合（全置換の `data-{event}-bind`）は開始時の評価値を使い、開発モードで警告します（遷移が静かに止まりません）。`data-store` のミラーはバインディングと同期なので、遷移前に必ず完了しています。
- `data-enhance="名前"` — DOM を走査して機能を付加する外部ライブラリ（Choices.js・郵便番号補完など）を宣言で適用します。`Haori.enhancers.register(名前, {init, refresh, destroy})` で登録すると、初期表示・後から追加された要素・`data-each` の新規行では `init`、`data-each` の描画確定と `data-if` の再表示では `refresh`、DOM から外れたときは `destroy` が呼ばれます。適用は要素ごと・名前ごとに一度だけで、走査は宣言した要素の配下に限定されます。未登録の名前は適用を保留し、登録時に遡って適用するため読み込み順に依存しません。登録なしで済ませる簡易形 `data-enhance-new="Global.Ctor"` は、ドット区切りのグローバル参照を対象要素で `new` します（値にコードは書けません）。外部ライブラリの生成 DOM は `data-external` で監視対象から外せます。
- 編集可能な行の中で「取得した候補から選択中の 1 件を引く」構成では、`data-attr-value="{{...}}"` のように**宣言バインドで値が決まる入力は、行の値反映で上書きされません**（評価が解決している間）。評価が未解決のあいだは従来どおり行データの値を表示するため、保存済みレコードから復元した値も失われません。応答は式を書いた要素自身か祖先へバインドする必要があるため、行全体で使う場合は `data-fetch-bind` で**行の内側のラッパ**へ寄せてください（行要素自身を指すと行データへの書き戻しになり、候補一覧が収集値へ入ります）。バインド先の外に置いた宣言は既定値のままになるため、開発モードでは「別のスコープでは供給されているキー」として警告します。
- 編集可能な行（`data-each` と `data-form-list` の併用）では、行要素をセレクタで指した `data-{event}-copy` / `data-{event}-bind` が、行に対応する**配列要素**へ書き戻されます。行の入力欄の値は配列の要素データが権威なので、これにより他の行に影響せず複数の入力欄へまとめて値を流し込めます（「契約者住所と同じ」の複写や、郵便番号から住所を引いて行へ入れる処理）。`data-form-list` を持つ外側の `<form>` が必要な構成では入れ子の `<form>` を置けないため、行の中に `<form>` を置く書き方の代わりに使います。
- **CSS セレクタ**を値に取る属性（`data-{event}-bind`・`-form`・`-copy`・`-copy-source`・`-reset`・`-refetch`・`-click`・`-open`・`-close`・`-adjust`・`-row-*`・`data-fetch-bind`・`data-fetch-state` など）は、照会の前に `{{ ... }}` を評価します。`data-each` の行の中から「その行の要素」を対象にでき（`id="plan-scope-{{i}}"` と `data-change-bind="#plan-scope-{{i}}"` の組み合わせ）、行ごとのバインドや住所複写が属性だけで書けます。不正なセレクタは例外にせずログしてスキップし、単体プレースホルダの未解決参照は「値の指定なし」として扱います（値を省略したときの既定動作になります）。`-bind-arg`・`-copy-params` のようなキー名を並べる属性は評価しません。
- `data-click-copy-source` — `data-click-copy` のコピー元要素を明示指定します（既定は `data-click-form` のフォーム、無ければイベント発火元の binding）。
- `data-click-no-disabled` / `data-click-defer` — 他ライブラリとの併用補助です。`no-disabled` はクリック手続き実行中に `disabled` 属性を付与せず実行します（Bootstrap collapse など disabled 要素を無視するライブラリ・CSS が動作し続けます。多重実行は内部マーカーで防止）。`defer` はクリック手続きを次フレーム（`requestAnimationFrame`／`setTimeout(0)`）で実行し、他ライブラリの同期 click ハンドラを先に完了させます。遅延後は `preventDefault()` できないため、`<a href>` や `type="submit"` への `defer` 併用は避けてください。
- `data-{event}-prevent`（例: `data-click-prevent`）— そのイベントでブラウザのネイティブなデフォルト動作（`type="submit"` ボタンのフォーム送信、`<a href>` の遷移など）を抑止します。`preventDefault()` はクリックの同期区間で呼ぶため `data-click-defer` と併用しても確実に抑止でき、`stopPropagation()` は呼ばないので他ライブラリのイベント伝播には影響しません。これにより `type="submit"` のまま `data-click-fetch` 等を付けても、ページ再読込なしに動作します。
- `data-{event}-run`（例: `data-click-run`・`data-change-run`）— フェッチを伴わず任意の JavaScript をイベント時に実行します。属性値は `new Function` で実 JS として実行され（`-before-run`/`-after-run` と同方式）、`{{...}}` はレンダリング時に展開、`event` が引数で渡されます。本体が `false` を返すと `event.preventDefault()` を呼びます（`onclick="return false"` の慣習）。**セキュリティ**: 展開後の `{{...}}` は実行コードへ結合されるため、信頼できる値（数値 index・自前採番 ID 等）のみを入れてください。API レスポンスやユーザー入力などの信頼できない文字列を入れると任意コード実行（XSS）になり得ます。信頼できない値は `data-bind` 経由で渡し、呼び出す関数の内部で参照してください。

ライフサイクルイベント:

- `haori:eachupdate` — `data-each` のリスト差分完了時に `data-each` 要素で発火します。発火時点で追加・削除・並べ替えされた全行が DOM に反映され、各行の内容（`{{...}}`）も描画済みのため、描画完了の検知に利用できます（`detail`: `added`・`removed`・`order`・`total`）。
- `haori:bindcomplete` — `data-*-bind` / `data-*-bind-arg` によるバインドと、対象要素配下の再評価が完了した後に対象要素で発火します（`detail.bindArg`）。
- `haori:show` / `haori:hide` — `data-if` 要素の表示・非表示時に発火します。
- `haori:rowadd` / `haori:rowremove` / `haori:rowmove` — `data-each` の差分更新で行ごとに行要素で発火します（`detail`: `key`・`index`・`item` / `key`・`index` / `key`・`from`・`to`）。伝播するためコンテナや `document` でも購読できます。`rowadd` は行内容の描画後、`rowremove` は行が DOM から外れる**前**に発火します。
- `haori:ready` — 初期化完了時に `document` で発火します（`detail.version`）。購読はライブラリの読み込みより前に登録してください。

式中では予約名前空間 `haori` の組み込みヘルパーを利用できます。`haori.date(value, format?, timeZone?)` は ISO 文字列・エポックミリ秒・`Date` を整形し（既定 `yyyy/MM/dd HH:mm`。`timeZone` 省略時はローカル時刻、`'Asia/Tokyo'` 等の IANA タイムゾーン名を渡すとその地域の時刻）、`haori.number(value, decimals?)` は桁区切り付きで数値を整形、`haori.range(start, end?, step?)` は整数配列を生成し（終端排他）、`haori.pages(totalPages, current, {window?, boundary?})` は省略記号付きの番号ページ列を生成します（`current` は 0 始まり。各要素は `{page, label, active, ellipsis}` を持ち `label` は `page + 1`）。月別 UI 向けに、`haori.monthAdd(value, delta)` は `YYYY-MM` 形式の年月へ月数を加算し（`Date` を介さない整数演算でタイムゾーン非依存。不正な入力は空文字）、`haori.monthRange(count, base?)` は基準月から降順に `count + 1` 個の `{targetMonth, label}` を返します（`base` 省略時は現在月）。ページ件数表示向けに、`haori.pageSummary(page, visibleCount?)` は Spring の `Page` 相当（`number`・`size`・`totalElements`／`totalCount`）から `{start, end, total, empty}` を計算します。`haori.findBy(array, key, value)` は配列から `item[key]` が `value` に一致する最初の要素（文字列化比較）を返し、無ければ `null` を返します。`haori.sum(array, key?)` は配列の数値合計を返します（`key` 省略時は要素自体、指定時は `item[key]`、数値化できない値は無視、非配列は `0`）。`haori.distinct(array, key?)` は重複を取り除いた配列を返し（`key` 省略時は要素自体、指定時は `item[key]` で判定。文字列化比較で最初の出現を保持）、`haori.groupBy(array, key)` は `item[key]` ごとに `{key, items}` の配列へ分けます（出現順）。明細を 1 件 1 行へまとめたり、入れ子の `data-each` でグループ表示したりするのに使えます。これにより番号ページネーション（`data-each="haori.pages(totalPages, number, {window: 2})"`）・値の整形（`{{ haori.date(lastUpdatedAt, 'yyyy/MM/dd HH:mm') }}`）・集計行（`{{ haori.number(haori.sum(rows, 'total')) }}`）を宣言的に書けます。同じ関数は `Haori.date` / `Haori.number` / `Haori.range` / `Haori.pages` / `Haori.monthAdd` / `Haori.monthRange` / `Haori.pageSummary` / `Haori.findBy` / `Haori.sum` / `Haori.distinct` / `Haori.groupBy` としても公開されています。`haori` は予約名のため、同名の `data-bind` キーを与えても式中では組み込みが優先されます。

`<script src>`（iife）で読み込んだときのグローバル `Haori` は `Haori` クラスそのものです。`Haori.addErrorMessage(...)` のようにクラス API を直接呼び出せ、`Core` や `Env` などは `Haori.Core` / `Haori.Env` として参照します（`Haori.Haori` は自己参照のため、0.37.1 以前の書き方も動作します）。

JS からバインドデータを読むには `Haori.Core.getBindingData(element, {resolved?})` を使います。既定では要素自身の生バインドデータ（無ければ `null`）、`resolved: true` で継承を解決済みのスコープを返します（`setBindingData` の対となる読み取り API）。

テンプレート式では、プロパティアクセス、動的インデックスを含むブラケットアクセス、optional chaining、三項演算子、配列 `map` / `filter` のアロー関数、spread を伴う呼び出しなどの構文を利用できます。一方で、グローバルオブジェクト、`eval` や `arguments`、`constructor`、`__proto__`、`prototype`、`Reflect`、`Object` などの脱出経路は遮断されます（計算プロパティ名で組み立てた場合も評価時に遮断します）。`Object` がブロックされるため、`Object.assign` の代わりにスプレッド構文 `{...a, ...b}` を使ってください。ブロックされた識別子を式で参照すると、コンソールに `blocked identifier(s): …` という警告が出力されます。

> **セキュリティの前提**: 式のテキストは**開発者が書くコード**です。上記の遮断は事故を難しくする多層防御であり、悪意ある式を防ぐ境界ではありません（式は最終的に `new Function` で評価されます）。**利用者入力や API 応答を式のテキストへ差し込まないでください。** HTML エスケープは式のエスケープではありません（`&#39;` は属性値を読む時点で `'` に戻るため、文字列リテラルの外へ出られます）。信頼できない値は `data-bind` の**値**として渡し、式からはキーで参照してください。詳細は [docs/ja/specs.md](docs/ja/specs.md) の「XSS対策」を参照してください。

テスト・デバッグ補助: `waitForRenders()`（`Haori.waitForRenders()` でも可）は、初期化・進行中のフェッチ・キューに積まれた描画タスクがすべて落ち着くまで待機します（E2E テストで描画完了を待つのに便利）。`Haori.Core.dumpScope(element)` は要素に解決されるスコープ（`resolved`）と各キーの由来（`sources`）を返します。開発モードでは、`data-if` が非表示へ切り替わった時点で、その式と参照スコープを自動でログ出力します（非表示のまま再描画しても再出力しません）。式評価の所要時間は `window.__HAORI_EVALUATION_PROFILE__.start()` で集計を開始し、`snapshot()` で取得します（開始するまで集計しません）。

開発モードは `<script src="haori.js" data-dev>` で強制でき、**ローカルホストでは既定で有効**です。開発モードの診断は再描画のコストに乗るため、ローカルで本番相当の性能を測る場合は `data-dev="false"` を指定して無効化してください。

`data-fetch` と `data-import` は、バインディング更新時に評価結果が変化した場合のみ自動で再評価されます。`data-fetch` は評価後の URL、HTTP メソッド、ヘッダー、body を含む実行シグネチャで比較し、`data-import` は評価後 URL で比較します。これらの属性値に未解決参照が 1 つでも含まれる場合、その時点では実行されず、後続のバインディング更新で参照が解決したときに初めて実行対象になります。

`src` や `type="number"` の `value` のように、ブラウザが HTML 解析時に先に解釈する属性へテンプレート式を直接書くと、初期表示時に警告や不要なアクセスが発生することがあります。こうした属性は `data-attr-*` を使ってください。`data-attr-xxx` は対応する `xxx` 属性を更新します。加えて、入力欄の状態と DOM の食い違いを防ぐため、`value`（テキスト系入力）と `checked`（radio / checkbox）・`selected`（option）は DOM property（`input.value` / `element.checked` / `option.selected`）も同期します。ただし**フォーカス中（編集中）の入力**と、**`change` / `input` で確定した編集を抱えている入力**には再適用しません（利用者の入力を守るため）。確定した編集の印は、フェッチ応答の反映・`data-{event}-reset`・`Core.setBindingData()` などの明示的な値の供給で解除されます。

詳しい使い方や多数のサンプルについては、公式ドキュメントを参照してください。

---

## 公開・ビルド手順（パッケージ作成）

ローカル確認とリリース準備の基本手順を示します。

公開運用メモ:

1. `npm run test`、`npm run build`、`npm pack --dry-run` を実行する
2. `npm version patch` などで公開する版数に更新する
3. `git push origin main` と `git push origin --tags` を実行する
4. 新しい版数タグから GitHub Release を公開する
5. npm、jsDelivr、GitHub Release の assets が新しい版数を指すことを確認する

GitHub Release 起点で npm publish する workflow は、npm の Trusted Publishing（OIDC）で認証します。長期トークンは使いません。npm のパッケージ設定で、この repository と `publish-on-release.yml` からの公開を Trusted Publisher として登録しておいてください。登録が無いと `npm publish` が認証エラーで失敗します。

6. 依存インストール

```bash
npm install
```

2. 型チェックとテスト

```bash
npm run compile
npm run test
```

3. 配布物のビルド

```bash
npm run build
```

4. バージョン更新

```bash
npm version patch
```

5. 版数更新のコミットとタグを push

```bash
git push origin main
git push origin --tags
```

6. 新しいタグから GitHub Release を公開

このリポジトリの npm 公開は GitHub Actions で行います。現在の workflow は `release.published` を契機に起動し、パッケージをビルドしたうえで、対象 version が未公開のときだけ npm へ公開し、あわせて `dist.zip` を GitHub Release のアセットとして添付します。認証は npm の Trusted Publishing（OIDC）で行い、出自証明（provenance）が自動で付きます。

必要な前提条件:

- npm のパッケージ設定で、この repository と `publish-on-release.yml` が Trusted Publisher として登録されていること
- 公開ジョブに `id-token: write` の権限があること（OIDC トークンの発行に必要）
- 対象バージョンのタグから Release を `published` 状態で公開すること

公開前の推奨確認:

- `npm run test`
- `npm run build`
- `npm pack --dry-run`

注意: `package.json` の `name`, `version`, `description`, `repository`, `license` が正しいことを確認してください。公開対象ファイルは `files` フィールドに従います。

---

## ライセンス・貢献

- ライセンス: MIT（リポジトリの `LICENSE` を参照）

貢献歓迎: バグ報告、改善提案、プルリクエストは GitHub リポジトリへお願いします。

---

## 詳細ドキュメント

より詳しい使い方、属性仕様、内部設計については以下のドキュメントを参照してください。

- `docs/ja/guide.md` — 利用ガイド（サンプル多数）
- `docs/ja/specs.md` — 技術仕様書（内部設計・API など）
- `demo/index.html` — 動くデモの一覧（属性ごと・機能ごとの個別デモへ辿れます。`npm run dev:demo` で起動）

---

README の作成にあたって追加してほしい項目（API 参照、図、例など）があれば教えてください。
