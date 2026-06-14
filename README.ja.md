# Haori.js（日本語ドキュメント）

Haori.js は、HTML 属性を中心にして動的な UI を実現する軽量なライブラリです。JavaScript をほとんど書かずに、データバインディング、条件分岐、繰り返し処理、フォームの双方向バインディング、サーバー通信などを HTML 属性で宣言できます。

バージョン: 0.20.1

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

- `data-bind` — 要素にバインディングデータを設定（JSON またはパラメータ形式）
- `{{ ... }}` — テンプレート式（式評価により挿入）
- `data-if` — 条件に応じて要素を表示 / 非表示
- `data-each` — 配列を繰り返し表示（`data-each-key`, `data-each-arg`, `data-each-index` など）
- `data-attr-xxx` — ブラウザが先に解釈する属性を安全に更新（`src`, `value` など）
- `data-fetch` — サーバーからデータを取得してバインド
- `data-import` — 外部 HTML を読み込んで挿入
- `data-url-param` — URL のクエリパラメータをバインディングに取り込む
- `data-unauthorized-redirect` / `data-forbidden-redirect` — `<body>`/`<html>` に宣言する認証ガード。Haori の fetch 応答が 401／403 のとき指定 URL（式可）へ遷移します。全 fetch 経路（`data-fetch`・イベント fetch・`data-import`）に適用。ステータス別オプトイン。`*-return-param="クエリ名"` を併用すると、ログイン後復帰用に現在の `pathname+search+hash` を戻り先クエリとして自動付与します（遷移先に同名クエリがあればそちらを優先）。
- `data-{event}-redirect-return-param="クエリ名"` — 上記の対称な受け手側。手続きの成功後リダイレクト先を URL クエリから解決し、**安全な同一オリジンのローカルパス**のときのみそこへ遷移します（オープンリダイレクト対策を内蔵）。安全でない／値が無い場合は `data-{event}-redirect` へフォールバック。認証ガードの `*-return-param` と同名クエリで使えば付与 → 消費が対称になり、従来必要だった手書きの検証 JS が不要になります。

追加のバインディング補助:

- `data-derive` / `data-derive-name` — 要素上で派生値を定義し、その要素の子孫にだけ公開します。親子プルダウンのような用途で使えます。
- `data-*-bind-merge`（例: `data-click-bind-merge`・`data-fetch-bind-merge`）— 結果をバインド先要素へ反映する際、`data-bind` を全置換せず、既存の値を保持したまま浅くマージします（新しいデータに無いキーは保持）。`selectedId={{items[0].id}}` のような計算値を既存 state に追記したい場合に有用です。

イベント駆動アクション:

- `data-click-*`・`data-change-*`・`data-input-*`・`data-load-*`・`data-intersect-*` は、それぞれクリック・フォーム変更・逐次入力・要素ロード・ビューポート交差を契機に処理（fetch、bind、copy、ダイアログ操作など）を宣言します。`data-load-*` は `data-if` 要素が非表示→表示へ遷移した（`haori:show`）タイミングでも発火するため、ネイティブの `load` が発生しない `<button>` などでも利用できます。
- `data-input-*` — テキスト入力1文字ごと（`input` イベント）に手続きを起動します。逐次発火するため `data-input-*` を**明示した要素のみ**が対象（オプトイン）で、`change` 同様に先祖フォームを自動検出して双方向バインディングへ反映します。検索欄の逐次絞り込みなどに使えます（例: `<input name="q" data-input-form>`）。
- `data-on="イベント名"` ＋ `data-on-*` — `window` / `document` へ dispatch された**任意のカスタムイベント**を契機に手続きを起動します（アクション語彙は `data-{event}-*` と共通）。ネイティブ橋の準備完了通知など、組み込みイベント以外での初期化を宣言的に書けます（例: `<body data-on="appReady" data-on-fetch="/api/init.json" data-on-bind="#app">`）。イベント名は属性値で保持（属性名の小文字化対策）、`window` キャプチャ1本で二重発火なく購読、後挿入要素も追従。組み込みイベント名（click/change/input/load）は警告し購読しません。Haori 購読開始前に発火したイベントは受け取れない点に注意。
- `data-click-copy-source` — `data-click-copy` のコピー元要素を明示指定します（既定は `data-click-form` のフォーム、無ければイベント発火元の binding）。
- `data-click-no-disabled` / `data-click-defer` — 他ライブラリとの併用補助です。`no-disabled` はクリック手続き実行中に `disabled` 属性を付与せず実行します（Bootstrap collapse など disabled 要素を無視するライブラリ・CSS が動作し続けます。多重実行は内部マーカーで防止）。`defer` はクリック手続きを次フレーム（`requestAnimationFrame`／`setTimeout(0)`）で実行し、他ライブラリの同期 click ハンドラを先に完了させます。遅延後は `preventDefault()` できないため、`<a href>` や `type="submit"` への `defer` 併用は避けてください。
- `data-{event}-prevent`（例: `data-click-prevent`）— そのイベントでブラウザのネイティブなデフォルト動作（`type="submit"` ボタンのフォーム送信、`<a href>` の遷移など）を抑止します。`preventDefault()` はクリックの同期区間で呼ぶため `data-click-defer` と併用しても確実に抑止でき、`stopPropagation()` は呼ばないので他ライブラリのイベント伝播には影響しません。これにより `type="submit"` のまま `data-click-fetch` 等を付けても、ページ再読込なしに動作します。
- `data-{event}-run`（例: `data-click-run`・`data-change-run`）— フェッチを伴わず任意の JavaScript をイベント時に実行します。属性値は `new Function` で実 JS として実行され（`-before-run`/`-after-run` と同方式）、`{{...}}` はレンダリング時に展開、`event` が引数で渡されます。本体が `false` を返すと `event.preventDefault()` を呼びます（`onclick="return false"` の慣習）。**セキュリティ**: 展開後の `{{...}}` は実行コードへ結合されるため、信頼できる値（数値 index・自前採番 ID 等）のみを入れてください。API レスポンスやユーザー入力などの信頼できない文字列を入れると任意コード実行（XSS）になり得ます。信頼できない値は `data-bind` 経由で渡し、呼び出す関数の内部で参照してください。

ライフサイクルイベント:

- `haori:eachupdate` — `data-each` のリスト差分完了時に `data-each` 要素で発火します。発火時点で追加・削除・並べ替えされた全行が DOM に反映され、各行の内容（`{{...}}`）も描画済みのため、描画完了の検知に利用できます（`detail`: `added`・`removed`・`order`・`total`）。
- `haori:bindcomplete` — `data-*-bind` / `data-*-bind-arg` によるバインドと、対象要素配下の再評価が完了した後に対象要素で発火します（`detail.bindArg`）。
- `haori:show` / `haori:hide` — `data-if` 要素の表示・非表示時に発火します。

式中では予約名前空間 `haori` の組み込みヘルパーを利用できます。`haori.date(value, format?, timeZone?)` は ISO 文字列・エポックミリ秒・`Date` を整形し（既定 `yyyy/MM/dd HH:mm`。`timeZone` 省略時はローカル時刻、`'Asia/Tokyo'` 等の IANA タイムゾーン名を渡すとその地域の時刻）、`haori.number(value, decimals?)` は桁区切り付きで数値を整形、`haori.range(start, end?, step?)` は整数配列を生成し（終端排他）、`haori.pages(totalPages, current, {window?, boundary?})` は省略記号付きの番号ページ列を生成します（`current` は 0 始まり。各要素は `{page, label, active, ellipsis}` を持ち `label` は `page + 1`）。月別 UI 向けに、`haori.monthAdd(value, delta)` は `YYYY-MM` 形式の年月へ月数を加算し（`Date` を介さない整数演算でタイムゾーン非依存。不正な入力は空文字）、`haori.monthRange(count, base?)` は基準月から降順に `count + 1` 個の `{targetMonth, label}` を返します（`base` 省略時は現在月）。ページ件数表示向けに、`haori.pageSummary(page, visibleCount?)` は Spring の `Page` 相当（`number`・`size`・`totalElements`／`totalCount`）から `{start, end, total, empty}` を計算します。`haori.findBy(array, key, value)` は配列から `item[key]` が `value` に一致する最初の要素（文字列化比較）を返し、無ければ `null` を返します。`haori.sum(array, key?)` は配列の数値合計を返します（`key` 省略時は要素自体、指定時は `item[key]`、数値化できない値は無視、非配列は `0`）。`haori.distinct(array, key?)` は重複を取り除いた配列を返し（`key` 省略時は要素自体、指定時は `item[key]` で判定。文字列化比較で最初の出現を保持）、`haori.groupBy(array, key)` は `item[key]` ごとに `{key, items}` の配列へ分けます（出現順）。明細を 1 件 1 行へまとめたり、入れ子の `data-each` でグループ表示したりするのに使えます。これにより番号ページネーション（`data-each="haori.pages(totalPages, number, {window: 2})"`）・値の整形（`{{ haori.date(lastUpdatedAt, 'yyyy/MM/dd HH:mm') }}`）・集計行（`{{ haori.number(haori.sum(rows, 'total')) }}`）を宣言的に書けます。同じ関数は `Haori.date` / `Haori.number` / `Haori.range` / `Haori.pages` / `Haori.monthAdd` / `Haori.monthRange` / `Haori.pageSummary` / `Haori.findBy` / `Haori.sum` / `Haori.distinct` / `Haori.groupBy` としても公開されています。`haori` は予約名のため、同名の `data-bind` キーを与えても式中では組み込みが優先されます。

JS からバインドデータを読むには `Haori.Core.getBindingData(element, {resolved?})` を使います。既定では要素自身の生バインドデータ（無ければ `null`）、`resolved: true` で継承を解決済みのスコープを返します（`setBindingData` の対となる読み取り API）。

テンプレート式では、プロパティアクセス、動的インデックスを含むブラケットアクセス、optional chaining、三項演算子、配列 `map` / `filter` のアロー関数、spread を伴う呼び出しなどの安全な構文を利用できます。一方で、グローバルオブジェクト、`eval` や `arguments`、`constructor`、`__proto__`、`prototype`、`Reflect`、`Object` などの脱出経路は使用できません。`Object` がブロックされるため、`Object.assign` の代わりにスプレッド構文 `{...a, ...b}` を使ってください。ブロックされた識別子を式で参照すると、コンソールに `blocked identifier(s): …` という警告が出力されます。

テスト・デバッグ補助: `waitForRenders()`（`Haori.waitForRenders()` でも可）は、初期化・進行中のフェッチ・キューに積まれた描画タスクがすべて落ち着くまで待機します（E2E テストで描画完了を待つのに便利）。`Haori.Core.dumpScope(element)` は要素に解決されるスコープ（`resolved`）と各キーの由来（`sources`）を返します。開発モードでは falsy な `data-if` がその式と参照スコープを自動でログ出力します。

`data-fetch` と `data-import` は、バインディング更新時に評価結果が変化した場合のみ自動で再評価されます。`data-fetch` は評価後の URL、HTTP メソッド、ヘッダー、body を含む実行シグネチャで比較し、`data-import` は評価後 URL で比較します。これらの属性値に未解決参照が 1 つでも含まれる場合、その時点では実行されず、後続のバインディング更新で参照が解決したときに初めて実行対象になります。

`src` や `type="number"` の `value` のように、ブラウザが HTML 解析時に先に解釈する属性へテンプレート式を直接書くと、初期表示時に警告や不要なアクセスが発生することがあります。こうした属性は `data-attr-*` を使ってください。`data-attr-xxx` は対応する `xxx` 属性を更新します。加えて、入力欄の状態と DOM の食い違いを防ぐため、`value`（テキスト系入力）と `checked`（radio / checkbox）・`selected`（option）は DOM property（`input.value` / `element.checked` / `option.selected`）も同期します。ただし `value` は**フォーカス中（編集中）の入力には再適用しません**（未コミット入力の巻き戻し防止。コミット値は `change` で反映）。

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

GitHub Release 起点で npm publish する workflow では、`NPM_TOKEN` に `haori` パッケージの owner として publish 権限を持つユーザーのトークンを設定してください。認証自体は通っても `haori` への publish 権限がない場合、`npm publish` で原因が分かりにくい `E404` になることがあります。

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

このリポジトリの npm 公開は GitHub Actions で行います。現在の workflow は `release.published` を契機に起動し、パッケージをビルドしたうえで、対象 version が未公開のときだけ `NPM_TOKEN` を使って npm へ公開し、あわせて `dist.zip` を GitHub Release のアセットとして添付します。

必要な前提条件:

- GitHub Actions の repository secrets に `NPM_TOKEN` が設定されていること
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

---

README の作成にあたって追加してほしい項目（API 参照、図、例など）があれば教えてください。
