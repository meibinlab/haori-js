# Haori.js 利用ガイド

バージョン: 0.11.1

## 目次

### 第1部: HTML/CSS開発者向け

1. [はじめに](#はじめに)
2. [インストールと基本設定](#インストールと基本設定)
3. [データバインディングの基本](#データバインディングの基本)
4. [条件分岐で要素を表示・非表示](#条件分岐で要素を表示非表示)
5. [リストの表示と繰り返し](#リストの表示と繰り返し)
6. [フォームとデータの双方向バインディング](#フォームとデータの双方向バインディング)
7. [サーバーからデータを取得する](#サーバーからデータを取得する)
8. [ボタンクリックで処理を実行する](#ボタンクリックで処理を実行する)
9. [実践的なサンプル](#実践的なサンプル)

### 第2部: JavaScript開発者向け

10. [JavaScriptからHaoriを使う](#javascriptからhaoriを使う)
11. [カスタムイベントの活用](#カスタムイベントの活用)
12. [Haoriクラスの拡張](#haoriクラスの拡張)
13. [高度なカスタマイズ](#高度なカスタマイズ)

---

# 第1部: HTML/CSS開発者向け

## はじめに

Haori.jsは、**JavaScriptをほとんど書かずに**、HTML属性だけで動的なWebページを作れるライブラリです。

### Haori.jsでできること

- データをHTMLに自動的に表示（データバインディング）
- 条件に応じて要素を表示・非表示
- リストを自動的に繰り返し表示
- フォーム入力を自動的にデータに反映
- ボタンクリックでサーバーにデータを送信
- サーバーからデータを取得して表示

### こんな人におすすめ

- HTMLとCSSは書けるけど、JavaScriptは苦手
- シンプルな動的Webページを素早く作りたい
- フレームワークは大げさすぎると感じている

---

## インストールと基本設定

### CDNから読み込む（最も簡単）

HTMLファイルの`<head>`内に以下を追加するだけで使えます：

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>Haori.js サンプル</title>

  <!-- Haori.jsを読み込む -->
  <script src="https://cdn.jsdelivr.net/npm/haori/dist/haori.iife.js"></script>
</head>
<body>
  <!-- ここにコンテンツを書く -->
</body>
</html>
```

これだけで準備完了です！JavaScriptを書く必要はありません。

この CDN URL は npm に公開済みの最新バージョンを参照します。

### npmでインストール（プロジェクトで使う場合）

```bash
npm install haori
```

```javascript
import Haori from 'haori'
```

### 初期表示のちらつきを防ぐ（data-haori-ready）

Haori.js の初期化（スキャンと初期フェッチ）がすべて完了すると、`<body>` タグに `data-haori-ready` 属性が自動的に付与されます。この属性を使って CSS で表示タイミングを制御することで、`{{name}}` のようなプレースホルダが一瞬表示される「ちらつき」を防げます。

**基本的な使い方**:

```html
<style>
  /* 初期化完了前はコンテンツを隠す */
  body:not([data-haori-ready]) .page-content {
    visibility: hidden;
  }
</style>

<div class="page-content" data-fetch="/api/data">
  <h1>{{title}}</h1>
  <p>{{description}}</p>
</div>
```

> `visibility: hidden` を使うと要素のレイアウト領域が保持されるためガタつきが起きません。`display: none` を使うと領域がなくなりレイアウトシフトが発生することがあります。

ローディング表示と組み合わせる場合：

```html
<style>
  #loading { display: flex; justify-content: center; padding: 2rem; }
  body[data-haori-ready] #loading { display: none; }
  body:not([data-haori-ready]) .page-content { visibility: hidden; }
</style>

<div id="loading">
  <p>読み込み中...</p>
</div>

<div class="page-content" data-fetch="/api/profile">
  <h1>{{name}}</h1>
  <p>{{email}}</p>
</div>
```

---

## データバインディングの基本

データバインディングとは、**データをHTMLに自動的に表示する仕組み**です。

### 基本の書き方

#### 1. データを設定する（`data-bind`属性）

**記述するHTML**:
```html
<div data-bind='{"name":"田中太郎","age":25}'>
  <!-- ここにデータが自動的に反映される -->
</div>
```

#### 2. データを表示する（`{{変数名}}`）

**記述するHTML**:
```html
<div data-bind='{"name":"田中太郎","age":25}'>
  <p>名前: {{name}}</p>
  <p>年齢: {{age}}歳</p>
</div>
```

**ブラウザでの表示結果**:
```
名前: 田中太郎
年齢: 25歳
```

**パラメータ形式でも記載可能**:

`data-bind`属性は、JSON形式だけでなく、URLパラメータ形式でも記述できます：

**記述するHTML**:
```html
<!-- JSON形式 -->
<div data-bind='{"name":"田中太郎","age":"25"}'>
  <p>名前: {{name}}</p>
  <p>年齢: {{age}}歳</p>
</div>

<!-- パラメータ形式 -->
<div data-bind="name=田中太郎&age=25">
  <p>名前: {{name}}</p>
  <p>年齢: {{age}}歳</p>
</div>
```

どちらも同じ結果になります。シンプルなデータの場合はパラメータ形式の方が書きやすいこともあります。

### 複雑なデータも扱える

**記述するHTML**:
```html
<div data-bind='{"user":{"name":"佐藤花子","email":"hanako@example.com"}}'>
  <h2>ユーザー情報</h2>
  <p>名前: {{user.name}}</p>
  <p>メール: {{user.email}}</p>
</div>
```

**ブラウザでの表示結果**:
```
ユーザー情報
名前: 佐藤花子
メール: hanako@example.com
```

### 計算式も使える

**記述するHTML**:
```html
<div data-bind='{"price":1000,"quantity":3}'>
  <p>単価: {{price}}円</p>
  <p>数量: {{quantity}}個</p>
  <p>合計: {{price * quantity}}円</p>
</div>
```

**ブラウザでの表示結果**:
```
単価: 1000円
数量: 3個
合計: 3000円
```

### 式を書くときの注意

`{{ ... }}` や `data-if` などの評価式では、プロパティ参照、配列の添字、optional chaining、三項演算子、配列の `map` / `filter` などの安全な構文を利用できます。

**記述するHTML**:
```html
<div data-bind='{"user":{"name":"田中"},"items":[{"active":true},{"active":false}]}'>
  <p>名前: {{user?.name}}</p>
  <p>有効件数: {{items.filter(item => item.active).length}}</p>
</div>
```

一方で、安全のため `window` や `document` などのグローバルオブジェクト、`eval`、`arguments`、`constructor`、`__proto__`、`prototype`、`Reflect`、そして **`Object`** は使えません。危険な式や構文エラーを含む式は正しく評価されません。詳しい制約は技術仕様書を参照してください。

> **注意**: `Object` もブロック対象のため、`Object.assign({}, a, b)` のような式は使えません（`Object` が `undefined` になり `TypeError` で失敗します）。オブジェクトの合成は**スプレッド構文** `{...a, ...b}` を使ってください。ブロックされた識別子を式で参照して評価に失敗した場合、コンソールに「`blocked identifier(s): …`」という警告が出力され、原因を特定できます。

### ブラウザが先に読む属性は `data-attr-*` を使う

`src` や `type="number"` の `value` のように、ブラウザが HTML を解析した時点で意味を持つ属性へ `{{...}}` を直接書くと、Haori.js が評価する前に警告や不要なアクセスが発生することがあります。そのような属性は `data-attr-属性名` へ移してください。

```html
<img data-attr-src="img/{{id}}.jpg" alt="商品画像">
<iframe data-attr-src="/preview/{{pageId}}"></iframe>
<input type="number" data-attr-value="{{count}}" readonly>
```

`data-attr-*` は対応する属性だけを更新します。たとえば `data-attr-value` は `value` 属性を変更しますが、`input.value` などの DOM property を同期する用途ではありません。フォームの現在値制御とは分けて考えてください。

### グローバル関数を使った値の整形

`{{ ... }}` 内はJavaScriptの式として評価されるため、グローバルスコープに定義した関数やオブジェクトを式の中で呼び出すことができます。

たとえば、ISO 8601形式の日時文字列を読みやすい形式に整形したい場合は、次のようなユーティリティオブジェクトをあらかじめ定義しておくと便利です。

```js
window.Dates = {
  format(iso, locale = 'ja-JP', options) {
    return new Intl.DateTimeFormat(locale, options).format(new Date(iso));
  }
};
```

```html
<script src="dates.js"></script>

<div data-bind='{"createdAt":"2024-01-15T10:30:00Z"}'>
  <p>作成日時: {{Dates.format(createdAt, 'ja-JP', {dateStyle:'long',timeStyle:'short'})}}</p>
</div>
```

**ブラウザでの表示結果**:
```
作成日時: 2024年1月15日 19:30
```

同様に、数値のフォーマットや文字列の変換など、用途に合わせたユーティリティを定義して式内で利用できます。

### 組み込みヘルパーで整形する（`haori.date` / `haori.number`）

よく使う日時・数値の整形は、グローバル関数を自前で用意しなくても、式中の予約名前空間 `haori` の組み込みヘルパーで書けます。

**記述するHTML**:
```html
<div data-bind='{"lastUpdatedAt":"2024-01-15T10:30:00","amount":1234567}'>
  <p>最終更新: {{ haori.date(lastUpdatedAt, 'yyyy/MM/dd HH:mm') }}</p>
  <p>金額: {{ haori.number(amount) }} 円</p>
</div>
```

**ブラウザでの表示結果**:
```
最終更新: 2024/01/15 10:30
金額: 1,234,567 円
```

- `haori.date(value, format?)`: ISO 文字列・エポックミリ秒・`Date` をローカル時刻で整形します（既定は `yyyy/MM/dd HH:mm`）。利用できるトークンは `yyyy`（4桁年）`yy`（2桁年）`MM`/`M`（月）`dd`/`d`（日）`HH`/`H`（時・24時間）`mm`（分）`ss`（秒）です。空・不正な値は空文字になります。`y M d H m s` などトークンに使う英字をそのまま文字として出したい場合はシングルクォートで囲みます（例 `{{ haori.date(t, "yyyy-MM-dd'T'HH:mm") }}` → `2024-01-15T10:30`）。
- `haori.number(value, decimals?)`: 桁区切りを付けて整形します。`decimals` を指定すると小数桁を固定できます（例 `{{ haori.number(rate, 2) }}`）。数値文字列の前後空白は無視し、空・空白のみ・数値化できない値は空文字になります。

> `haori` は予約名です。`data-bind` で `haori` というキーを与えても、式の中では組み込みヘルパーが優先されます。同じ関数は JavaScript からも `Haori.date(...)` / `Haori.number(...)` として呼べます。

### データの継承

親要素のデータは子要素でも使えます：

**記述するHTML**:
```html
<div data-bind='{"user":"田中太郎"}'>
  <header>
    ようこそ、{{user}}さん
  </header>

  <div data-bind='{"points":1500}'>
    <!-- userもpointsも使える -->
    <p>{{user}}さんのポイント: {{points}}pt</p>
  </div>
</div>
```

**ブラウザでの表示結果**:
```
ようこそ、田中太郎さん

田中太郎さんのポイント: 1500pt
```

---

## 条件分岐で要素を表示・非表示

`data-if`属性を使うと、条件に応じて要素を表示・非表示できます。

### 基本的な使い方

**記述するHTML**:
```html
<div data-bind='{"isLoggedIn":true}'>
  <p data-if="isLoggedIn">ログイン中です</p>
  <p data-if="!isLoggedIn">ログインしてください</p>
</div>
```

**ブラウザでの表示結果**:
```
ログイン中です
```

`isLoggedIn`が`true`のときは「ログイン中です」だけが表示されます。
`isLoggedIn`が`false`なら「ログインしてください」が表示されます。

### 比較演算子を使う

```html
<div data-bind='{"age":20,"score":85}'>
  <!-- 18歳以上なら表示 -->
  <p data-if="age >= 18">成人です</p>

  <!-- 80点以上なら表示 -->
  <div data-if="score >= 80">
    <p>優秀です！</p>
  </div>

  <!-- 60点未満なら表示 -->
  <div data-if="score < 60">
    <p>もう少し頑張りましょう</p>
  </div>
</div>
```

### 複数の条件を組み合わせる

```html
<div data-bind='{"isLoggedIn":true,"isPremium":true}'>
  <!-- ログイン中 かつ プレミアム会員 -->
  <div data-if="isLoggedIn && isPremium">
    <p>プレミアム特典をご利用いただけます</p>
  </div>

  <!-- ログイン中 または プレミアム会員 -->
  <div data-if="isLoggedIn || isPremium">
    <p>会員限定コンテンツ</p>
  </div>
</div>
```

### 存在チェック

```html
<div data-bind='{"message":"こんにちは"}'>
  <!-- messageが存在するなら表示 -->
  <p data-if="message">メッセージ: {{message}}</p>
</div>
```

`data-if` の表示判定は JavaScript の falsy 判定に準拠します。`false`・`null`・`undefined`・`NaN` に加えて、**数値 `0` と空文字列 `''` も非表示**になります。たとえば `data-if="items.length"` は要素数が 0 のとき非表示、`data-if="message"` は空文字列のとき非表示です。一方、空配列 `[]` や空オブジェクト `{}` は JavaScript と同様に truthy として扱われ、表示されます（件数で判定したい場合は `data-if="items.length"` を使ってください）。

### 同時に1つだけ開く（排他パネル・アコーディオン）

「状態を1つだけ持たせ、`data-if` で表示を切り替える」だけで、複数パネルの相互排他（同時に1つしか開かない）を JavaScript なしで表現できます。Bootstrap の collapse（`data-bs-parent`）のような仕組みを使わずに済みます。

```html
<div id="panel-state" data-bind='{"open": ""}'>
  <!-- 開いているパネル名を state に入れる（同じ値なら閉じたい場合は条件を工夫） -->
  <button data-click-data='{"open": "add"}' data-click-bind="#panel-state" data-click-bind-merge>
    ユーザを追加
  </button>
  <button data-click-data='{"open": "edit"}' data-click-bind="#panel-state" data-click-bind-merge>
    ユーザ編集
  </button>

  <div data-if="open === 'add'">…ユーザ追加フォーム…</div>
  <div data-if="open === 'edit'">…ユーザ編集フォーム…</div>
</div>
```

`open` は1つの値しか持てないため、片方を開くともう片方は自動的に閉じます。開閉アニメーションが必要な場合は、表示要素に CSS の `transition` を定義してください（Bootstrap collapse のスライドが必須の場合のみ、別途その仕組みを併用します）。

---

## リストの表示と繰り返し

`data-each`属性を使うと、配列のデータを自動的に繰り返し表示できます。

> **重要（配置ルール）**: `data-each` は**繰り返しの「コンテナ要素」に付与**します。コンテナの**最初の子要素がテンプレート**として扱われ、配列の要素数だけ複製されます。繰り返したい要素そのものに付けるのではない点に注意してください。
>
> - 正しい: `<ul data-each="items"><li>…</li></ul>` → `<li>` が要素数ぶん複製される。
> - テーブルは `<tbody data-each="rows"><tr>…</tr></tbody>` のように **`<tbody>` に付与**し、`<tr>` をテンプレートにします。
> - 誤り: `<tr data-each="rows"><td>…</td></tr>` … これは `<tr>` ではなく**子の `<td>` が複製**され、行が増えません（Vue の `v-for` のように「その要素自身」を繰り返す挙動ではありません）。

### 基本的な使い方

**記述するHTML**:
```html
<div data-bind='{"users":[
  {"name":"田中太郎","age":25},
  {"name":"佐藤花子","age":30},
  {"name":"鈴木一郎","age":28}
]}'>
  <h2>ユーザー一覧</h2>
  <ul data-each="users" data-each-key="name">
    <li>{{name}} ({{age}}歳)</li>
  </ul>
</div>
```

**ブラウザでの表示結果**:
```
ユーザー一覧
• 田中太郎 (25歳)
• 佐藤花子 (30歳)
• 鈴木一郎 (28歳)
```

**最終的なDOM** (参考):
```html
<div data-bind='{"users":[...]}'>
  <h2>ユーザー一覧</h2>
  <ul data-each="users" data-each-key="name">
    <li data-row="田中太郎">田中太郎 (25歳)</li>
    <li data-row="佐藤花子">佐藤花子 (30歳)</li>
    <li data-row="鈴木一郎">鈴木一郎 (28歳)</li>
  </ul>
</div>
```

### 重要な属性

- `data-each="配列名"`: 繰り返すデータを指定
- `data-each-key="キー名"`: 各項目を識別するための一意なキー（IDなど）
- `data-row`: 自動的に付与される属性。`data-each-key`で指定したキーの値が設定されます。JavaScriptから行を操作する際の識別子として使用されます。

### インデックス番号を表示

**記述するHTML**:
```html
<div data-bind='{"items":["リンゴ","バナナ","オレンジ"]}'>
  <ul data-each="items" data-each-arg="item" data-each-index="i">
    <li>{{i + 1}}. {{item}}</li>
  </ul>
</div>
```

**ブラウザでの表示結果**:
```
• 1. リンゴ
• 2. バナナ
• 3. オレンジ
```

**属性の説明**:
- `data-each-arg="item"`: 各要素のデータを入れる変数名（プリミティブ配列では必須）
- `data-each-index="i"`: インデックス番号を入れる変数名

### テーブルで表示

**記述するHTML**:
```html
<div data-bind='{"products":[
  {"id":1,"name":"ノートPC","price":80000},
  {"id":2,"name":"マウス","price":2000},
  {"id":3,"name":"キーボード","price":5000}
]}'>
  <table>
    <thead>
      <tr>
        <th>商品名</th>
        <th>価格</th>
      </tr>
    </thead>
    <tbody data-each="products" data-each-key="id">
      <tr>
        <td>{{name}}</td>
        <td>{{price}}円</td>
      </tr>
    </tbody>
  </table>
</div>
```

**ブラウザでの表示結果**:
```
┌─────────┬──────────┐
│ 商品名  │ 価格     │
├─────────┼──────────┤
│ ノートPC│ 80000円  │
│ マウス  │ 2000円   │
│ キーボード│ 5000円  │
└─────────┴──────────┘
```

### 空のリストの場合のメッセージ

```html
<div data-bind='{"items":[]}'>
  <ul data-each="items" data-each-key="id">
    <li data-each-before>商品一覧</li>
    <li>{{name}}</li>
    <li data-each-after data-if="items.length === 0">
      商品がありません
    </li>
  </ul>
</div>
```

**属性の説明**:
- `data-each-before`: ループの前に表示（繰り返されない）
- `data-each-after`: ループの後に表示（繰り返されない）

### 番号ページネーションを作る（`haori.pages`）

`haori.pages(totalPages, current, options?)` は、先頭・末尾と現在ページ周辺を残し、間を省略記号（…）で省いた「番号ページネーション」用の配列を返します。`data-each` の式に直接書いて、自前の JavaScript なしでページ番号リンクを構築できます。

- `current` は **0 始まり**（サーバー側の総ページ数・現在ページがそのまま使える形）を想定します。
- 各要素は次の値を持ちます: `page`（0 始まりのページ番号。省略記号は `null`）、`label`（表示用。`page + 1`。省略記号は `…`）、`active`（現在ページなら `true`）、`ellipsis`（省略記号なら `true`）。
- `options` で `window`（現在ページの前後に出す数。既定 2）と `boundary`（先頭・末尾に常に出す数。既定 1）を調整できます。

```html
<div data-bind='{"totalPages":20,"number":9}'>
  <nav aria-label="ページネーション">
    <ul data-each="haori.pages(totalPages, number, {window: 2})" data-each-key="page">
      <li>
        <span data-if="ellipsis" aria-hidden="true">…</span>
        <span data-if="!ellipsis && active" aria-current="page">{{label}}</span>
        <button data-if="!ellipsis && !active" type="button">{{label}}</button>
      </li>
    </ul>
  </nav>
</div>
```

**ブラウザでの表示結果**（`number=9`、つまり 10 ページ目を表示中）:
```
1 … 8 9 [10] 11 12 … 20
```

整数の連番だけが欲しいときは `haori.range(n)`（`[0, 1, …, n-1]`）も使えます。

### 親子プルダウン向けの派生値定義

親の選択値から子プルダウンの候補を導出したい場合は、`data-derive` / `data-derive-name` を使って派生値を子孫要素へ渡せます。

`data-derive` は派生値の供給だけを担い、繰り返し描画には既存の `data-each` を使います。`select` に対しても `data-each` の一般規則をそのまま適用し、子要素の `option` をテンプレートとして扱います。

```html
<select
  name="contractId"
  data-each="contracts"
  data-each-arg="contract"
  data-each-key="id"
>
  <option data-each-before value="">契約を選択してください</option>
  <option value="{{ contract.id }}">{{ contract.name }}</option>
</select>

<div
  data-derive="contracts.find(contract => contract.id === contractId)?.options ?? []"
  data-derive-name="optionList"
>
  <select
    name="optionId"
    data-each="optionList"
    data-each-arg="option"
    data-each-key="id"
  >
    <option data-each-before value="">オプションを選択してください</option>
    <option value="{{ option.id }}">{{ option.optionName }}</option>
  </select>
</div>
```

この仕様では、少なくとも次の点を前提にしています。

- `data-derive` はフォーム値更新時と `data-bind` 更新時に再評価される
- `data-derive-name` の有効範囲は当該要素の配下に限定される
- `option` を含む場合も `data-each` の一般規則を使い、`option` 自身に `data-each` は付けない

### 名前衝突時の優先順位

`data-derive-name` が既存の binding key と同じ名前でも使えます。子孫から見た同一スコープでは派生値が優先されますが、さらに内側の要素や form が同名の値を持つ場合は、その内側の値が優先されます。

```html
<div data-bind='{"status":"outer"}'>
  <section
    data-bind='{"status":"host"}'
    data-derive="'derived'"
    data-derive-name="status"
  >
    <p>{{status}}</p>

    <form data-bind='{"status":"form"}'>
      <input name="status" value="{{status}}">
      <p>{{status}}</p>
    </form>
  </section>
</div>
```

この例では、`section` 直下の `<p>` は `derived` を表示します。`form` の中では `form` 側の `status` がさらに近いスコープとして優先されるため、`input` と `<p>` は form の値を使います。

設計の整理や背景は `docs/ja/data-derive-confirmation-draft.md` を参照してください。

### 式の識別子解決スコープ

`data-if` や `{{ ... }}` などの式に書いた識別子（`id`、`dialog` など）は、その式を持つ要素を起点に **DOM のネストをたどって解決**されます。優先順位は次のとおりです（先に見つかったものが採用され、内側が外側を上書きします）。

1. 起点要素自身の `data-bind`
2. 祖先要素の `data-derive`（`data-derive-name` で公開された派生値。同一要素では `data-bind` より優先）
3. 祖先要素の `data-bind`（内側の祖先ほど優先）
4. グローバル（`window` 上の関数・オブジェクトなど。上記で同名がシャドウされていない場合のみ）

そのため、`data-url-param`（`data-url-arg` を付けた場合はそのキー配下に格納される）や祖先の `data-bind` で定義された値も、ネスト順に従って解決されます。

#### フォーム入力値はスコープに自動投入されない（重要）

フォームの入力値（`name` 属性）は、**ユーザーの変更（change）または明示的な同期が行われるまで、フォームの binding data に反映されません**。初期表示時点（未入力・未同期）では、入力名と同名の識別子は**外側のスコープにフォールバック**して解決されます。

たとえば次の構造では、`#state` がトップレベルに `id`（顧客 ID など）を持つ場合、フォーム内の `name="id"` がまだ同期されていない初期表示では、`data-if="!(dialog?.id || id)"` の `id` は **フォームの空文字ではなく `#state` の `id`** に解決されます。

```html
<div id="state" data-bind='{"id":"CUSTOMER-1"}'>
  <form>
    <input name="id" type="text">
    <!-- 初期表示では id = "CUSTOMER-1"（外側）に解決される -->
    <button data-if="!(dialog?.id || id)">新規登録</button>
  </form>
</div>
```

意図しないスコープ解決を避けるには、トップレベルのキーと衝突しない**専用のキー名**を使う（例: フォーム側を `data-bind` で別名にする、判定に `id` を使わず `data-if="!(dialog?.id)"` とする）か、`data-derive-name` で明示的にスコープへ供給してください。

#### 推奨パターン: `data-derive` でクリーンなスコープで判定する

`name="id"` の入力を持つフォーム内で「新規モード判定」をしたい場合、フォームの**外側**（`name="id"` の影響を受けないスコープ）で `data-derive` を使って判定値を計算し、一意名で配下へ公開すると、入力値との衝突を避けられます。

```html
<div id="state">
  <!-- form の外側で判定（id は外側の値で解決され、form 入力に汚染されない） -->
  <div data-derive="!(dialog?.id || id)" data-derive-name="isNew">
    <form>
      <input name="id" type="text">
      <!-- isNew は name="id" と衝突しない一意名なので安全 -->
      <button data-if="isNew">新規登録</button>
    </form>
  </div>
</div>
```

#### スコープのデバッグ（開発モード）

解決スコープを確認するには `Core.dumpScope(element)` を使います（ブラウザのグローバルからは `Haori.Core.dumpScope(要素)`）。解決済みスコープ（`resolved`）と、各キーがどの要素・種類（`bind` / `derive`）に由来するか（`sources`）を返します。`Dev.enable()`（開発モード）時はコンソールにも出力します。

```js
// 例: 開発者ツールのコンソールで
const {resolved, sources} = Haori.Core.dumpScope(document.querySelector('button'))
console.log(resolved.id, sources.id) // 値と由来（例: { source: '#state', kind: 'bind', ... }）
```

さらに**開発モードでは、`data-if` が falsy（非表示）と評価されるたびに、その式と参照している識別子の解決値・由来をコンソールへ自動出力**します。`data-if="!(dialog?.id || id)"` が想定外に非表示になる場合、`id` がどの要素（例: フォーム）の値で解決されているかをそのまま確認できます。

---

## フォームとデータの双方向バインディング

フォームの入力内容を自動的にデータに反映できます。

### 基本的なフォーム

**記述するHTML**:
```html
<form>
  <div>
    <label>ユーザー名:</label>
    <input type="text" name="username">
  </div>

  <div>
    <label>メール:</label>
    <input type="email" name="email">
  </div>

  <!-- 入力内容がリアルタイムで表示される -->
  <div>
    <p>入力内容:</p>
    <p>ユーザー名: {{username}}</p>
    <p>メール: {{email}}</p>
  </div>
</form>
```

**動作**:
- ユーザーが入力欄に文字を入力すると、リアルタイムで「入力内容」の部分が更新されます
- フォームの`name`属性の値が自動的にバインディングデータとして使用されます
- **`data-bind`属性は省略可能**です。入力時に自動的に追加・更新されます

**自動バインディングの仕組み**:
1. フォーム内の入力要素で値が変更される（`change`イベント）
2. フォーム要素の`data-bind`属性が自動的に更新される
3. バインディングデータが更新され、`{{変数名}}`や`data-if`などが自動的に再評価される

初期値を設定したい場合は、従来通り`data-bind`属性を記述できます:
```html
<form data-bind='{"username":"太郎","email":""}'>
  <!-- 初期値が設定されます -->
</form>
```

フォーム自身に `data-bind` を設定して `Core.setBindingData()` や `data-fetch` で値を更新した場合も、フォーム内の入力要素へ無イベントで同期されます。text input / textarea / select は `value`、checkbox / radio は既存の `Form.setValues()` と同じ規則で反映されます。

### 送信ボタンでページを再読込せずに処理する（`data-click-prevent`）

`<form>` 内の `type="submit"` ボタンをクリックすると、Haori の処理に加えてブラウザのネイティブなフォーム送信が走り、ページが再読込されてフェッチ結果やトーストが破棄されてしまいます。`data-click-prevent` を付けると、ネイティブ送信を抑止したうえで `data-click-fetch` などの処理だけを実行できます。

```html
<form data-bind='{"username":"","password":""}'>
  <input type="text" name="username" placeholder="ユーザー名">
  <input type="password" name="password" placeholder="パスワード">
  <button
    type="submit"
    data-click-prevent
    data-click-form
    data-click-fetch="/api/login"
    data-click-fetch-method="POST"
  >ログイン</button>
</form>
```

- `type="submit"` のまま使えるため、Enter キーでの送信やネイティブのフォーム検証といった意味論を保てます（送信先の処理だけを Haori が引き受けます）。
- `data-click-prevent` はクリックの同期段で `preventDefault()` を呼ぶため、`data-click-defer` と併用しても確実に再読込を防げます。`stopPropagation()` は呼ばないので、他ライブラリのハンドラには影響しません。
- 送信を伴わないボタンに使えば、`onclick="return false"` のように既定動作だけを止めることもできます。

### チェックボックスとラジオボタン

```html
<form>
  <!-- チェックボックス -->
  <label>
    <input type="checkbox" name="agree" value="true">
    利用規約に同意する
  </label>

  <!-- ラジオボタン -->
  <p>プランを選択:</p>
  <label>
    <input type="radio" name="plan" value="free">
    無料プラン
  </label>
  <label>
    <input type="radio" name="plan" value="premium">
    プレミアムプラン
  </label>

  <!-- 選択内容を表示 -->
  <div>
    <p>同意: {{agree ? 'はい' : 'いいえ'}}</p>
    <p>選択プラン: {{plan}}</p>
  </div>
</form>
```

**注意**: チェックボックスで`true`/`false`の真偽値を扱う場合は、`value="true"`属性を追加してください。`value="true"` を持つ checkbox は boolean モードとして扱われ、チェック時は `true`、未チェック時は `false` を返します。

```html
<form data-bind='{"mailImapSsl": true}'>
  <label>
    <input type="checkbox" name="mailImapSsl" value="true">
    IMAP over SSL
  </label>
</form>
```

上の例では、`data-bind` や `data-fetch` によってフォームのバインディングデータが `{ mailImapSsl: true }` へ更新されるとチェックが入り、`{ mailImapSsl: false }` へ更新されるとチェックが外れます。

### 数値フィールド（`type="number"`）は数値型で扱われる

`type="number"` の入力は、値を**数値型**としてバインド・送信します。HTML の入力値は本来すべて文字列ですが、サーバー側の DTO が `Double` や `Integer` を期待する場合に文字列（例 `"2.5"`）で送られて型不一致になるのを防ぎます。

```html
<form>
  <input type="number" name="stockFee" value="2.5">
  <input type="number" name="quantity" value="3">
  <input type="text" name="code" value="100">
</form>
```

このフォームを `data-click-form` などで送信すると、JSON は次のようになります（`stockFee`・`quantity` は数値、`code` は `type="text"` なので文字列のまま）:

```json
{ "stockFee": 2.5, "quantity": 3, "code": "100" }
```

- 空の数値フィールドは `null` になります。
- 数値に変換できない値も `null` になります。
- 文字列として送りたい項目は `type="text"` を使ってください。

> 補足: この数値化は 0.13.0 からの挙動です。それ以前は `type="number"` も文字列で送信していました。

### セレクトボックス

```html
<form>
  <label>国を選択:</label>
  <select name="country">
    <option value="">選択してください</option>
    <option value="jp">日本</option>
    <option value="us">アメリカ</option>
    <option value="uk">イギリス</option>
  </select>

  <p>選択: {{country}}</p>
</form>
```

### ネストしたフォームデータ

#### オブジェクト形式（`data-form-object`）

```html
<form>
  <fieldset data-form-object="address">
    <legend>住所</legend>
    <input type="text" name="zip" placeholder="郵便番号">
    <input type="text" name="city" placeholder="市区町村">
  </fieldset>

  <!-- データ構造: {"address":{"zip":"100-0001","city":"東京都"}} -->
</form>
```

#### 配列形式（`data-form-list`）

```html
<form>
  <h3>趣味（複数選択）</h3>
  <label><input type="checkbox" name="hobbies" value="読書" data-form-list> 読書</label>
  <label><input type="checkbox" name="hobbies" value="音楽" data-form-list> 音楽</label>
  <label><input type="checkbox" name="hobbies" value="スポーツ" data-form-list> スポーツ</label>

  <!-- データ構造: {"hobbies":["読書","音楽"]} -->
</form>
```

#### フォームデータから除外する（`data-form-detach`）

`data-form-detach`属性を使うと、その入力要素をフォームデータの取得対象から除外できます。表示専用のフィールドや計算結果など、サーバーに送信したくないデータに使用します。

**記述するHTML**:
```html
<form>
  <label>
    単価:
    <input type="number" name="price">
  </label>
  <label>
    数量:
    <input type="number" name="quantity">
  </label>
  <label>
    合計（送信されない）:
    <input type="number" name="total" data-attr-value="{{price * quantity}}" data-form-detach readonly>
  </label>
</form>
```

フォームデータを取得すると、`total`は除外され、`{"price":1000,"quantity":3}`のみが取得されます。

#### `<form>` を置けない場所でのフォーム化（`data-form`）

HTML 仕様上 `<table>` の中に `<form>` を直接置けないため、テーブルの各行に入力欄が並ぶ UI などでは `<form>` を使えません。このような場合、任意の要素に **`data-form`** 属性を付けると、その要素を `<form>` と同等の**値収集コンテナ**として扱えます（属性値は不要・無視されます）。

`data-click-form`（および `data-change-form` / `data-load-form` / `data-intersect-form`）が対象を探す際、`<form>` 要素に加えて `data-form` を持つ要素も認識します。`data-click-form` を空で指定すれば、先祖の `data-form` 要素が自動的に対象になります。

```html
<table>
  <tbody data-each="prices" data-each-key="id">
    <tr data-form>
      <td><input type="month"  name="startMonth"></td>
      <td><input type="number" name="price"></td>
      <td><input type="text"   name="remarks"></td>
      <td>
        <button
          data-click-validate
          data-click-fetch="{{'../api/prices/' + id}}"
          data-click-fetch-method="PUT"
          data-click-form
          data-click-toast="更新しました。"
          data-click-refetch="#price-list">
          確定
        </button>
      </td>
    </tr>
  </tbody>
</table>
```

セレクタで直接指定することもできます。

```html
<section id="filter-form" data-form>
  <select name="area">...</select>
  <select name="type">...</select>
</section>
<button data-click-form="#filter-form" data-click-fetch="/api/data">検索</button>
```

補足:
- `data-click-validate` は `<form>` でなくても、コンテナ配下の入力要素を個別に検証するため `data-form` でも機能します。
- `data-form` は**値収集（送信）専用のコンテナ宣言**です。入力変更を要素の binding data へ書き戻す双方向バインディングは行いません。これは意図的な設計で、`data-each` 行（行データに `id` などを持つ）に `data-form` を付けても**行の binding data が入力値で上書きされない**ため、上の例の `{{'../api/prices/' + id}}` が正しく解決されます。
- `data-form` と `data-form-object` を同一要素に併用することは推奨しません（コンテナ宣言とデータ構造変換が競合するため、`data-form` としての利用を想定してください）。

---

## URLパラメータとHTMLインポート

### URLパラメータをバインドする

`data-url-param`属性を使うと、URLのクエリパラメータをバインディングデータに設定できます。

#### 基本的な使い方

```html
<!-- URL: /page?name=田中&age=25 の場合 -->

<div data-url-param>
  <h2>ユーザー情報</h2>
  <p>名前: {{name}}</p>
  <p>年齢: {{age}}歳</p>
</div>
```

#### `data-url-arg`: パラメータをネストする

```html
<!-- URL: /page?name=田中&age=25 の場合 -->

<div data-url-param data-url-arg="params">
  <h2>ユーザー情報</h2>
  <p>名前: {{params.name}}</p>
  <p>年齢: {{params.age}}歳</p>
</div>
```

#### 実用例: 検索結果ページ

```html
<!-- URL: /search?keyword=JavaScript&category=programming -->

<div data-url-param>
  <h1>検索結果</h1>
  <p>キーワード: {{keyword}}</p>
  <p>カテゴリ: {{category}}</p>

  <!-- 検索結果を取得 -->
  <div
    data-fetch="/api/search?keyword={{keyword}}&category={{category}}"
    data-bind="#results"
  >
  </div>

  <div id="results">
    <ul data-each="items" data-each-key="id">
      <li>{{title}}</li>
    </ul>
  </div>
</div>
```

### HTMLをインポートする

`data-import`属性を使うと、別のHTMLファイルを読み込んで表示できます。

#### 基本的な使い方

```html
<div data-import="/components/header.html"></div>
```

`/components/header.html`の`<body>`タグ内容が、この`<div>`の`innerHTML`として挿入されます。

`data-import` にテンプレート式を含めることもできます。未解決参照がある間は読み込みを行わず、後続のバインディング更新で評価後 URL が確定して前回値から変わったときだけ再読み込みします。URL が変わらない限り再読み込みは行われません。

#### 実用例: 共通ヘッダー・フッター

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>マイページ</title>
  <script src="https://cdn.jsdelivr.net/npm/haori/dist/haori.iife.js"></script>
</head>
<body>
  <!-- 共通ヘッダー -->
  <header data-import="/components/header.html"></header>

  <!-- メインコンテンツ -->
  <main>
    <h1>マイページ</h1>
    <p>コンテンツ</p>
  </main>

  <!-- 共通フッター -->
  <footer data-import="/components/footer.html"></footer>
</body>
</html>
```

**header.html**:
```html
<!DOCTYPE html>
<html>
<body>
  <nav>
    <a href="/">ホーム</a>
    <a href="/about">会社概要</a>
    <a href="/contact">お問い合わせ</a>
  </nav>
</body>
</html>
```

---

## サーバーからデータを取得する

`data-fetch`属性を使うと、サーバーからデータを取得して表示できます。

### 基本的な使い方

```html
<div data-fetch="/api/user">
  <h2>ユーザー情報</h2>
  <p>名前: {{name}}</p>
  <p>メール: {{email}}</p>
</div>
```

ページ読み込み時に`/api/user`からデータを取得し、自動的に表示します。

`data-fetch` の URL や `data-fetch-data` などにテンプレート式を含めることもできます。これらの評価で未解決参照が 1 つでもある場合、その評価サイクルではフェッチは実行されません。後続の `data-bind` 更新などで参照が解決し、評価後のリクエスト内容が変わったときに初めて実行されます。

### data-fetch の関連属性

#### `data-fetch-method`: HTTPメソッドを指定

```html
<!-- GETリクエスト（デフォルト） -->
<div data-fetch="/api/users"></div>

<!-- POSTリクエスト -->
<div data-fetch="/api/create" data-fetch-method="POST"></div>

<!-- その他のメソッド -->
<div data-fetch="/api/resource/123" data-fetch-method="PUT"></div>
<div data-fetch="/api/resource/123" data-fetch-method="DELETE"></div>
```

#### `data-fetch-headers`: リクエストヘッダーを設定

```html
<!-- JSON形式で指定 -->
<div
  data-fetch="/api/data"
  data-fetch-headers='{"Authorization":"Bearer token123","X-Custom-Header":"value"}'
>
</div>

<!-- パラメータ形式で指定 -->
<div
  data-fetch="/api/data"
  data-fetch-headers="Authorization=Bearer token123&X-Custom-Header=value"
>
</div>
```

#### `data-fetch-content-type`: Content-Typeを指定

```html
<!-- JSONとして送信（デフォルト: POST/PUT/PATCH時） -->
<div
  data-fetch="/api/data"
  data-fetch-method="POST"
  data-fetch-content-type="application/json"
></div>

<!-- フォームデータとして送信 -->
<div
  data-fetch="/api/upload"
  data-fetch-method="POST"
  data-fetch-content-type="application/x-www-form-urlencoded"
></div>

<!-- ファイルアップロード -->
<div
  data-fetch="/api/upload"
  data-fetch-method="POST"
  data-fetch-content-type="multipart/form-data"
></div>
```

#### `data-fetch-data`: 送信データを指定

```html
<!-- JSON形式で指定 -->
<div
  data-fetch="/api/create"
  data-fetch-method="POST"
  data-fetch-data='{"name":"田中","age":25}'
></div>

<!-- パラメータ形式で指定 -->
<div
  data-fetch="/api/create"
  data-fetch-method="POST"
  data-fetch-data="name=田中&age=25"
></div>

<!-- テンプレート式で既存バインディングを参照 -->
<div
  data-bind='{"page":2,"q":"検索語"}'
  data-fetch="/api/search"
  data-fetch-method="POST"
  data-fetch-data="page={{page + 1}}&q={{q}}"
></div>
```

`data-fetch` はバインディング更新のたびに無条件で再実行されるわけではありません。評価後の URL、HTTP メソッド、ヘッダー、body をまとめたリクエスト内容が前回と変わった場合のみ再実行されます。同じリクエスト内容であれば再フェッチされません。

#### `data-fetch-form`: フォームからデータを取得

```html
<form id="userForm">
  <input type="text" name="username">
  <input type="email" name="email">
</form>

<!-- フォームのデータを自動的に送信 -->
<button
  data-fetch="/api/register"
  data-fetch-method="POST"
  data-fetch-form="#userForm"
>
  登録
</button>

<!-- data-fetch-form を空にすると、自要素または先祖のformを使用 -->
<form>
  <input type="text" name="username">
  <button
    data-fetch="/api/register"
    data-fetch-method="POST"
    data-fetch-form
  >
    登録
  </button>
</form>
```

#### `data-fetch-bind`: 取得したデータの表示先を指定

```html
<!-- データ取得（非表示でもOK） -->
<div data-fetch="/api/products" data-fetch-bind="#productList" style="display:none;"></div>

<!-- 取得したデータを表示 -->
<div id="productList">
  <ul data-each="products" data-each-key="id">
    <li>{{name}} - {{price}}円</li>
  </ul>
</div>
```

#### `data-fetch-arg` / `data-fetch-bind-arg`: データをネストするキー名を指定

レスポンスデータを指定したキー名の下に格納してバインドします。
`data-fetch-arg` と `data-fetch-bind-arg` は同義で、`data-fetch-arg` が優先されます。
イベント属性版は `data-{event}-bind-arg` を使用します。

```html
<div data-fetch="/api/user" data-fetch-arg="user">
  <!-- データが {"name":"田中","email":"..."} の場合 -->
  <!-- user.name, user.email としてアクセスできる -->
  <p>{{user.name}}</p>
  <p>{{user.email}}</p>
</div>

<!-- data-fetch-bind-arg も同じ意味 -->
<div data-fetch="/api/user" data-fetch-bind-arg="user">
  <p>{{user.name}}</p>
</div>
```

#### `data-fetch-bind-params`: 特定のパラメータだけをバインド

```html
<div
  data-fetch="/api/user"
  data-fetch-bind="#userView"
  data-fetch-bind-params="name&email"
>
</div>

<!-- レスポンスから name と email だけを抽出してバインド -->
<div id="userView">
  <p>名前: {{name}}</p>
  <p>メール: {{email}}</p>
</div>
```

#### `data-fetch-bind-append`: 指定した配列プロパティを追記

```html
<div
  data-fetch="/api/posts?cursor={{cursor}}"
  data-fetch-bind="#feed"
  data-fetch-bind-params="items&cursor&hasMore"
  data-fetch-bind-append="items"
></div>

<div id="feed" data-bind='{"items":[],"cursor":null,"hasMore":true}'>
  <ul data-each="items" data-each-key="id">
    <li>{{title}}</li>
  </ul>
</div>
```

`data-fetch-bind-append` は `&` 区切りで指定したキーについて、レスポンス値が配列であれば既存の配列へ追記します。無限スクロールのように `items` だけを追加し、`cursor` や `hasMore` は通常どおり上書きしたい場合に使用します。

`data-click-bind-append`、`data-change-bind-append`、`data-load-bind-append`、`data-intersect-bind-append` も同じ意味で使えます。

#### 既存データを保持してマージする（`data-*-bind-merge`）

通常のバインドは、バインド先要素の `data-bind` を**解決済みデータで全置換**します。これは `data-fetch` でサーバーの最新状態に差し替える用途に適していますが、「一部のキーだけを更新し、他のキーは残したい」場合には向きません。

`data-*-bind-merge` を付けると、バインド先要素の**既存 `data-bind` を保持したまま**、解決済みデータの各キーを浅く上書きします。

```html
<div id="state" data-bind='{"items":[],"selectedId":null}'>
  <!-- items 読み込み後に表示され、selectedId だけを更新する（items は保持） -->
  <button
    type="button"
    data-if="items.length > 0 && !selectedId"
    data-load-data="selectedId={{items[0]?.id}}"
    data-load-bind="#state"
    data-load-bind-merge
  >自動選択</button>
</div>
```

この例では、`data-load-bind-merge` がないと `#state` が `{selectedId}` だけに置き換わり `items` が消えますが、指定することで `items` を保持したまま `selectedId` を更新できます。`data-load-*` は `data-if` の表示（`haori:show`）と連動して発火するため、`items` がセットされてボタンが表示されたタイミングで自動選択が行われます。

`data-click-bind-merge`、`data-change-bind-merge`、`data-intersect-bind-merge`、`data-fetch-bind-merge` も同じ意味で使えます。

### 組み合わせ例

```html
<!-- 認証トークン付きでデータを取得 -->
<div
  data-fetch="/api/private/data"
  data-fetch-headers='{"Authorization":"Bearer YOUR_TOKEN"}'
  data-fetch-bind="#dataView"
  data-fetch-arg="result"
>
</div>

<div id="dataView">
  <p>データ: {{result.value}}</p>
</div>
```

### フェッチなしで state を更新する（`data-click-data` + `data-click-bind`）

`data-click-fetch` を指定しなければ、`data-click-data` に書いたインライン JSON（とフォーム値）が**そのままバインド先へ反映**されます。サーバー通信なしに state を初期化・更新したいときに使えます。`data-click-bind-merge` を併用すれば、既存の state を保持したまま一部キーだけを差し替えられます。

```html
<!-- API を呼ばずに #page-state を初期化してからモーダルを開く -->
<button
  data-click-data='{"detail": {}, "users": []}'
  data-click-bind="#page-state"
  data-click-bind-merge
  data-click-open="#agency-modal"
>新規追加</button>
```

「新規追加」でフォームを空にしてからダイアログを開く、といった操作を JavaScript なしで宣言できます。

### サーバーのバリデーションエラーをフィールドに表示する

`data-click-fetch` などの送信に対してサーバーが 4xx を返し、ボディが `{"errors": {"フィールド名": "メッセージ"}}` 形式（配列も可）であれば、Haori は各メッセージを **`name` が一致するフィールドへ自動的に振り分け**ます。フォーム全体に関わるメッセージは `message` / `messages` で返すと、フォーム先頭にまとめて表示されます。

```jsonc
// 400 レスポンス例
{
  "errors": {
    "code": "コードは必須です",
    "email": ["形式が不正です"]
  },
  "message": "入力内容を確認してください"
}
```

```html
<form>
  <input name="code">
  <input name="email" type="email">
  <button type="submit" data-click-prevent data-click-form
          data-click-fetch="/api/agencies" data-click-fetch-method="POST">保存</button>
</form>
```

haori-bootstrap を併用していれば、エラーのあるフィールド直後に `invalid-feedback` 要素が自動生成され、`is-invalid` クラスが付きます（フィールド側に対応付け用の属性を書く必要はありません）。エラーメッセージ表示そのものの仕組みは「メッセージ表示」の章を参照してください。

> 補足: トップレベルが配列の `[{"key":"code","message":"..."}]` 形式は未対応です。サーバー側を `{"errors": {...}}` 形式に揃えてください。

### 1クリックで複数のエンドポイントを取得して1つの state にまとめる（`data-click-click`）

`data-click-fetch` は1クリックにつき1エンドポイントですが、`data-click-click` で**複数の隠し要素のクリックを発火**すれば、それぞれの `data-click-fetch` を起動できます。各取得先で `data-click-bind-arg` を変えて**同じ要素の別キー**へマージすれば、複数の結果を1つの state にまとめられます。`data-click-click` のセレクタは複数要素にマッチできます。

```html
<!-- 編集: detail と users を取得してからモーダルを開く -->
<button data-click-click=".agency-loaders" data-click-open="#agency-modal">編集</button>

<!-- 同じ行（バインドスコープ）内に置き、{{id}} を解決させる -->
<span hidden class="agency-loaders"
  data-click-fetch="{{'../api/agencies/' + id + '.json'}}"
  data-click-bind="#page-state" data-click-bind-arg="detail"></span>
<span hidden class="agency-loaders"
  data-click-fetch="{{'../api/agencies/' + id + '/users.json'}}"
  data-click-bind="#page-state" data-click-bind-arg="users"></span>
```

`#page-state` には `{ detail: …, users: … }` のように両方の結果が入ります（`data-click-bind-arg` は対象自身の既存データを保ちつつ該当キーだけを更新するため、2本の取得が混ざりません）。

注意点:

- 各取得は**非同期**で、編集ボタン側は完了を待ちません。モーダルは取得前に開き、結果が届くと中身が**リアクティブに**埋まります。「両方そろってから処理」が必要な場合は別の作りにしてください。
- トリガー要素は対象と同じバインドスコープ（行内など）に置きます（`{{id}}` を解決するため）。
- トリガーは `<button disabled>` だと `click()` が効かないため、`data-click-fetch` を持つ `<span>` などを使うと確実です。

---

## 画面位置で処理を実行する（`data-intersect-*`）

`data-intersect-*` 属性を使うと、要素がビューポートまたは指定したスクロールコンテナに入ったときに処理を実行できます。内部的には `IntersectionObserver` を使う想定で、無限スクロールや遅延読み込みに向いています。

### 基本的な使い方

```html
<div id="feed" data-bind='{"items":[],"cursor":null,"hasMore":true}'>
  <ul data-each="items" data-each-key="id">
    <li>{{title}}</li>
  </ul>

  <div
    data-if="hasMore"
    data-intersect-fetch="/api/posts?cursor={{cursor}}"
    data-intersect-bind="#feed"
    data-intersect-bind-params="items&cursor&hasMore"
    data-intersect-bind-append="items"
    data-intersect-root-margin="300px"
    data-intersect-threshold="0"
    data-intersect-disabled="{{!hasMore}}"
  ></div>
</div>
```

この例では、末尾の要素が監視領域に入ると次ページを取得し、`items` は追記、`cursor` と `hasMore` は上書きされます。

### `data-intersect-*` の関連属性

#### `data-intersect-fetch`: 交差時にフェッチを実行

```html
<div data-intersect-fetch="/api/posts"></div>
```

要素が交差したタイミングで `data-fetch` 系と同様の通信処理を開始します。

#### `data-intersect-root`: 監視するスクロールコンテナ

```html
<div class="list-wrapper">
  <div
    data-intersect-fetch="/api/posts"
    data-intersect-root=".list-wrapper"
  ></div>
</div>
```

省略した場合はビューポートを監視対象にします。

#### `data-intersect-root-margin`: 手前で先読みするための余白

```html
<div
  data-intersect-fetch="/api/posts"
  data-intersect-root-margin="0px 0px 300px 0px"
></div>
```

監視領域の外側に余白を追加します。下方向に正の値を指定すると、実際に見える少し手前でフェッチできるため、無限スクロールの先読みに向いています。

#### `data-intersect-threshold`: どの程度見えたら発火するか

```html
<div
  data-intersect-fetch="/api/posts"
  data-intersect-threshold="0.5"
></div>
```

`0` なら 1px でも交差した時点で発火し、`1` なら要素全体が監視領域に入った時点で発火します。大きなローディング領域やカード自体を監視するときに有効です。

#### `data-intersect-disabled`: 一時的に停止

```html
<div
  data-intersect-fetch="/api/posts"
  data-intersect-disabled="{{loading || !hasMore}}"
></div>
```

真と評価されたときは、交差しても処理を実行しません。

#### `data-intersect-once`: 1回だけ実行

```html
<div
  data-intersect-fetch="/api/hero"
  data-intersect-once
></div>
```

初回の成功後に監視を終了したい場合に使います。

#### `data-intersect-bind` / `data-intersect-bind-arg` / `data-intersect-bind-params` / `data-intersect-bind-append`

```html
<div
  data-intersect-fetch="/api/posts"
  data-intersect-bind="#feed"
  data-intersect-bind-params="items&cursor&hasMore"
  data-intersect-bind-append="items"
></div>
```

交差時の処理でも、`data-click-*` や `data-fetch-*` と同じ考え方でバインド先と反映方法を指定できます。

また、必要に応じて `data-intersect-fetch-method`、`data-intersect-fetch-headers`、`data-intersect-fetch-data`、`data-intersect-fetch-form`、`data-intersect-before-run`、`data-intersect-after-run` も併用できます。

---

## ボタンクリックで処理を実行する

`data-click-*`属性を使うと、ボタンクリック時の処理を定義できます。

**注意**: `data-click-*`の代わりに`data-change-*`（フォーム要素の変更時）、`data-load-*`（要素のロード時）も使えます。画面への到達をきっかけにしたい場合は、この節とは別に `data-intersect-*` を使います。

`data-load-*` は、ネイティブの `load` イベントを発火する要素（画像・iframe など）のロード時に加えて、**`data-if` が偽から真に変わって要素が表示された（`haori:show` が発火した）タイミングでも実行されます**。これにより、`<button>` や `<div>` のようにネイティブの `load` イベントが発生しない要素でも、表示を契機とした処理を定義できます。発火するのは非表示→表示への遷移時のみで、表示状態のままの再評価では再発火しません（無限ループや過剰実行を防ぐため）。

### 処理の実行順序

イベント属性は以下の順序で実行されます：

1. `data-click-validate` - バリデーション
2. `data-click-confirm` - 確認ダイアログ
3. `data-click-reset-before` - 送信前にリセット
4. `data-click-data` / `data-click-form` - データ取得
5. `data-click-before-run` - 前処理スクリプト
6. `data-click-fetch` - サーバー通信
7. `data-click-after-run` - 後処理スクリプト
8. `data-click-bind` - データバインド
9. `data-click-adjust` - 値の増減
10. `data-click-row-add` / `data-click-row-remove` / `data-click-row-prev` / `data-click-row-next` - 行操作
11. `data-click-reset` - リセット
12. `data-click-copy` / `data-click-copy-params` - 別要素へ値をコピー
13. `data-click-refetch` - 再フェッチ
14. `data-click-click` - 別要素のクリック
15. `data-click-open` / `data-click-close` - ダイアログ操作
16. `data-click-dialog` / `data-click-toast` - メッセージ表示
17. `data-click-history` - 履歴への pushState
18. `data-click-redirect` - リダイレクト

### 他ライブラリとの共存（`data-click-no-disabled`）

Haori は `data-click-*` のクリック手続き実行中、多重クリックを防ぐためにボタンへ一時的に native の `disabled` 属性を付与します（手続き完了で解除）。Haori はクリックイベントの伝播を止めません（`stopPropagation` / `preventDefault` は呼びません）が、Bootstrap などの他ライブラリや CSS は `disabled` 要素のクリックを無視するため、**同じボタンに `data-bs-toggle="collapse"` のような他ライブラリのハンドラを併用すると、それらの動作が阻害される**ことがあります。

このような場合は `data-click-no-disabled` を付けると、クリック手続き中に native の `disabled` を付与しなくなります。Haori 内部の多重実行ガードは引き続き有効なので、Haori 自身の処理が二重に走ることはありません。

```html
<!-- Bootstrap の collapse トグルと Haori のクリック処理を同居させる -->
<button
  data-bs-toggle="collapse"
  data-bs-target="#detail-search"
  data-click-reset-before="#state"
  data-click-copy="#state"
  data-click-no-disabled
>
  詳細検索
</button>
```

#### クリック処理を遅延する（`data-click-defer`）

`data-click-defer` を付けると、Haori のクリック手続きを**クリックイベントの同期実行中ではなく次フレーム（`requestAnimationFrame`、無ければ `setTimeout(0)`）へ遅延**します。Bootstrap の `data-bs-toggle="collapse"` のように、**同一クリックイベント中に同期実行される他ライブラリのハンドラを先に完了させたい**場合に使います。

```html
<button
  data-bs-toggle="collapse"
  data-bs-target="#detail-search"
  data-click-reset-before="#state"
  data-click-copy="#state"
  data-click-no-disabled
  data-click-defer
>
  詳細検索
</button>
```

> **注意（デフォルト動作との関係）**: 遅延後の手続きは元のクリック `event` を参照しないため、`data-{event}-run` の `return false` のように**手続き内で**呼ぶ `preventDefault()` は間に合いません。`<a href="…">` や `type="submit"` のボタンに `defer` を併用し、かつ手続き内で既定動作を止めようとすると、遅延された手続きが走る前にリンク遷移・フォーム送信が先に発生します。デフォルト動作を抑止したい場合は `data-click-prevent` を併用してください。`data-click-prevent` はクリックの同期段で `preventDefault()` を呼ぶため、`defer` と併用しても確実に抑止できます。

なお、他ライブラリが要素へ命令的に付与したクラス（Bootstrap の `.show` など）は、その要素や祖先が Haori によって再描画されると、宣言された静的な属性で上書きされて失われることがあります（`data-click-defer` ではこの再描画起因の競合は解消しません）。トグル対象（collapse の本体など）は、Haori が再描画する subtree の外に置くか、`data-bind` 由来の再評価対象に含めない構成にすることを推奨します。

#### フェッチなしで JS を実行する（`data-click-run`）

`data-click-run` を付けると、フェッチを伴わずに**任意の JavaScript をクリック時に実行**できます。クライアント側の状態操作や関数呼び出しのために独自のクリックハンドラ（`document.addEventListener('click', ...)`）を書かずに済みます。`data-change-run` など他イベントでも同様に使えます。

```html
<!-- 関数呼び出し（type=button では既定動作がないので preventDefault 不要） -->
<button type="button"
  data-click-run="Plans.addRule('#state', '#rule-form')">
  ルール追加
</button>

<!-- {{...}} はレンダリング時に展開される（ruleI=2 なら editRule('#state', 2) を実行） -->
<button type="button"
  data-click-run="Plans.editRule('#state', {{ruleI}})">
  編集
</button>
```

ポイント:

- 属性値は `data-click-before-run` / `-after-run` と同じく**実 JavaScript** として実行されます（サンドボックス式ではないため `Plans` や `confirm` などのグローバルも使えます）。`{{...}}` 部分のみバインディングスコープを参照できます。
- 本体が **`false` を返したときだけ `event.preventDefault()`** を呼びます（`onclick="return false"` と同じ慣習）。`<a href>` や `type="submit"` の既定動作を止めたいときは `return false` を返してください。
- `event` を引数で受け取れるので、`event.stopPropagation()` 等も本体から呼べます。
- `data-click-fetch` と併用すると **run → fetch** の順で実行されます（run の `false` は preventDefault のみを制御し、fetch は中止しません。fetch を止めたい場合は `data-click-before-run` を使用）。
- 実行・評価エラーはコンソールに出力され、例外は外へ伝播しません。
- `data-click-defer` と併用すると手続きが次フレームへ遅延し、`return false` による `preventDefault()` は間に合いません。

> **⚠️ セキュリティ警告（重要）**: `data-click-run` の `{{...}}` は、**展開後の文字列がそのまま実行コードに結合**されます。`data-bind` やテキストの `{{...}}` は結果を「データ」として扱うため安全ですが、`data-click-run` では結果を「コード」として再実行するため、**`{{...}}` に入れた値が JavaScript として実行されます**。
>
> ```html
> <!-- 危険: name が API/ユーザー入力など信頼できない文字列の場合 -->
> <button data-click-run="greet('{{name}}')">...</button>
> <!-- name = "'); evilCode(); ('" だと greet(''); evilCode(); ('') となり evilCode() が実行される -->
> ```
>
> したがって、`data-click-run` の `{{...}}` には**自分で制御する信頼できる値のみ**を入れてください（ループ index や自前で採番した ID などの数値・既知文字列）。**API レスポンスやユーザー入力などの信頼できない文字列を `{{...}}` で差し込まないでください**（任意コード実行＝XSS になり得ます）。信頼できない値を扱う必要がある場合は、`{{...}}` で文字列結合せず、その値を `data-bind` 経由でスコープに置いたうえで、`data-click-run` から呼ぶ関数の内部で参照する（例: 関数側で対象要素の binding を読む）構成にしてください。

### すべての属性の詳細

#### `data-click-validate`: バリデーション実行

```html
<form id="loginForm">
  <input type="email" name="email" required>
  <input type="password" name="password" required minlength="8">

  <button
    data-click-validate
    data-click-form="#loginForm"
    data-click-fetch="/api/login"
    data-click-fetch-method="POST"
  >
    ログイン
  </button>
</form>
```

HTML5バリデーション（required, type, minlength等）を実行し、エラーがあれば処理を中断します。

#### `data-click-confirm`: 確認ダイアログ

```html
<button
  data-click-confirm="本当に削除しますか？"
  data-click-fetch="/api/delete/123"
  data-click-fetch-method="DELETE"
>
  削除
</button>
```

#### `data-click-data`: 送信データを指定

```html
<button
  data-click-fetch="/api/update"
  data-click-fetch-method="POST"
  data-click-data='{"status":"active","priority":1}'
>
  有効化
</button>
```

#### `data-click-form`: フォームからデータを取得

```html
<form id="myForm">
  <input type="text" name="username">
  <input type="email" name="email">

  <button
    data-click-fetch="/api/register"
    data-click-fetch-method="POST"
    data-click-form="#myForm"
  >
    登録
  </button>
</form>
```

#### `data-click-before-run`: フェッチ前スクリプト

```html
<button
  data-click-before-run="console.log('送信開始'); return true"
  data-click-fetch="/api/data"
>
  送信
</button>
```

戻り値が`false`または`{stop: true}`の場合、以降の処理を中断します。

#### `data-click-fetch`: サーバー通信

```html
<button data-click-fetch="/api/users">
  ユーザー一覧を取得
</button>
```

#### `data-click-fetch-method`: HTTPメソッド

```html
<button
  data-click-fetch="/api/create"
  data-click-fetch-method="POST"
>
  作成
</button>
```

#### `data-click-fetch-headers`: リクエストヘッダー

```html
<button
  data-click-fetch="/api/data"
  data-click-fetch-headers='{"Authorization":"Bearer token"}'
>
  取得
</button>
```

#### `data-click-fetch-content-type`: Content-Type

```html
<button
  data-click-fetch="/api/upload"
  data-click-fetch-method="POST"
  data-click-fetch-content-type="multipart/form-data"
>
  アップロード
</button>
```

#### `data-click-bind`: データのバインド先

```html
<button
  data-click-fetch="/api/users"
  data-click-bind="#userList"
>
  取得
</button>

<div id="userList">
  <ul data-each="users" data-each-key="id">
    <li>{{name}}</li>
  </ul>
</div>
```

#### `data-click-bind-arg`: バインドキー名

```html
<button
  data-click-fetch="/api/user"
  data-click-bind="#view"
  data-click-bind-arg="currentUser"
>
  取得
</button>

<div id="view">
  <p>{{currentUser.name}}</p>
</div>
```

#### `data-click-bind-params`: 抽出パラメータ

```html
<button
  data-click-fetch="/api/user"
  data-click-bind-params="name&email"
>
  取得
</button>
```

#### `data-click-after-run`: フェッチ後スクリプト

```html
<button
  data-click-fetch="/api/data"
  data-click-after-run="console.log('取得完了', arguments[0])"
>
  取得
</button>
```

#### `data-click-adjust`: 値の増減

```html
<input type="number" id="quantity" value="1" min="1">

<button data-click-adjust="#quantity" data-click-adjust-value="1">
  +1
</button>

<button data-click-adjust="#quantity" data-click-adjust-value="-1">
  -1
</button>
```

#### `data-click-adjust-value`: 増減量

上記の例を参照。

#### `data-click-row-add`: 行を追加

```html
<div data-bind='{"items":[{"name":"A"}]}'>
  <div data-each="items" data-each-key="name">
    <input type="text" name="name" value="{{name}}">
    <button data-click-row-add>行追加</button>
  </div>
</div>
```

#### `data-click-row-remove`: 行を削除

```html
<button data-click-row-remove>この行を削除</button>
```

#### `data-click-row-prev`: 前の行と入れ替え

```html
<button data-click-row-prev>↑</button>
```

#### `data-click-row-next`: 次の行と入れ替え

```html
<button data-click-row-next>↓</button>
```

#### `data-click-reset`: リセット

```html
<form id="myForm">
  <input type="text" name="username">
</form>

<button data-click-reset="#myForm">
  フォームをリセット
</button>
```

`data-click-copy` と組み合わせた場合は、リセット後の値がコピーされます。

#### `data-click-reset-before`: 送信前にリセット

```html
<form id="searchForm">
  <input type="text" name="keyword" value="haori">
</form>

<button
  data-click-reset-before="#searchForm"
  data-click-form="#searchForm"
  data-click-fetch="/api/search"
>
  検索
</button>
```

確認ダイアログを通過した後、`data-click-before-run` や `data-click-data` / `data-click-form` の前に対象フォームを初期化します。以降の `data-click-data`、`data-click-form`、`data-click-history-data`、`data-click-history-form`、`data-click-copy` は、リセット後の値を基準に評価されます。

#### `data-click-copy`: 別要素へ値をコピー

`data-click-form` がある場合はフォームの現在値を、ない場合はボタン自身の bindingData をコピー元として、指定した要素へ反映します。コピー先は既存の `data-bind` を保持したまま、同名キーだけを上書きします。

```html
<form id="searchForm">
  <input type="text" name="keyword" value="haori">
</form>

<form id="searchCommitted">
  <input type="hidden" name="keyword">
</form>

<button
  data-click-form="#searchForm"
  data-click-copy="#searchCommitted"
>
  検索
</button>
```

コピー先がフォームの場合は `data-bind` の更新後に入力要素へも同期されます。`data-change-copy`、`data-load-copy`、`data-intersect-copy` も同じ意味で使用できます。

#### `data-click-copy-params`: include と exclude を指定する

`&` 区切りでキーを指定します。通常のキーは include、先頭に `!` を付けたキーは exclude として扱います。include がある場合はそのキーだけをコピー対象にし、exclude はその中から差し引きます。exclude だけを指定した場合は、コピー元の全キーを対象にしたうえで、指定したキーだけを除外します。省略時または空文字の場合は全件コピーです。

指定されていないキーはコピー先の既存値を保持し、コピー元に存在しないキーは無視します。`!` で始まるキー名は exclude 記法と衝突するため、include としては使用できません。

```html
<button
  data-click-form="#searchForm"
  data-click-copy="#searchState"
  data-click-copy-params="keyword&page"
>
  検索条件を確定
</button>

<button
  data-click-form="#searchForm"
  data-click-copy="#searchState"
  data-click-copy-params="!page&!sort"
>
  ページ情報を除外してコピー
</button>
```

#### `data-click-refetch`: 再フェッチ

```html
<div id="userList" data-fetch="/api/users">
  <!-- リスト表示 -->
</div>

<button data-click-refetch="#userList">
  リストを更新
</button>
```

#### `data-click-click`: 別要素をクリック

```html
<button id="submitBtn">送信</button>

<button data-click-click="#submitBtn">
  間接的に送信
</button>
```

#### `data-click-open`: ダイアログを開く

```html
<dialog id="myDialog">
  <p>ダイアログの内容</p>
  <button data-click-close="#myDialog">閉じる</button>
</dialog>

<button data-click-open="#myDialog">
  ダイアログを開く
</button>
```

#### `data-click-close`: ダイアログを閉じる

上記の例を参照。

#### `data-click-dialog`: ダイアログメッセージ表示

```html
<button
  data-click-fetch="/api/save"
  data-click-fetch-method="POST"
  data-click-dialog="保存が完了しました"
>
  保存
</button>
```

#### `data-click-toast`: トースト通知表示

```html
<button
  data-click-fetch="/api/save"
  data-click-fetch-method="POST"
  data-click-toast="保存しました"
>
  保存
</button>
```

トーストは3秒間表示されます。

#### `data-click-history`: 履歴への pushState

`history.pushState()` を実行してブラウザの履歴を更新します。SPA風のページ遷移アニメーションや、検索条件をURLに反映する用途に使います。

```html
<!-- URL だけ更新 -->
<button data-click-history="/search">検索ページへ</button>

<!-- クエリパラメータ付き -->
<button
  data-click-fetch="/api/search"
  data-click-bind="#result"
  data-click-history="/search"
  data-click-history-data="keyword={{keyword}}&page=1"
>
  検索
</button>

<!-- history 指定なし、現在 URL のクエリだけ更新 -->
<button data-click-history-data="tab=list">一覧タブ</button>
```

- `data-click-history` を省略すると現在パスをベースにクエリだけ更新します
- `data-click-history-data` は JSON または `key=value&...` 形式で指定します
- `data-click-history-form` は明示指定した場合のみフォームの入力値をクエリに追記します。`data-click-form` では自動補完しません
- `data-click-redirect` と併用すると、history を追加した後にリダイレクトします

#### `data-click-redirect`: リダイレクト

```html
<button
  data-click-fetch="/api/complete"
  data-click-fetch-method="POST"
  data-click-redirect="/success"
>
  完了
</button>
```

#### `data-click-scroll`: 成功時スクロール

フェッチ成功後に、指定した CSS セレクターの要素まで自動スクロールします。

```html
<button
  data-click-fetch="/api/save"
  data-click-fetch-method="POST"
  data-click-scroll="#result"
>
  保存
</button>

<div id="result"><!-- 保存結果がここに表示される --></div>
```

- 値には CSS セレクターを指定します
- 成功後のスクロールはリダイレクト (`data-click-redirect`) より前に実行されます
- セレクターに一致する要素が存在しない場合は何もしません

#### `data-click-scroll-error`: エラー時スクロール

フェッチ失敗時やバリデーション失敗時に、最初のエラー箇所まで自動スクロールします。

```html
<button
  data-click-fetch="/api/save"
  data-click-fetch-method="POST"
  data-click-form="#myForm"
  data-click-scroll-error
>
  保存
</button>
```

- 属性値は不要です（属性の有無で動作を切り替えます）
- バリデーション失敗時は最初の不正入力フィールドへスクロールします
- サーバーエラー時は `data-message-level="error"` が付与された最初の要素へスクロールします
- 複数のエラーが同時に発生しても、スクロールは 1 回だけ実行されます

### サーバーにデータを送信する完全な例

```html
<form id="myForm">
  <input type="text" name="username" placeholder="ユーザー名">
  <input type="email" name="email" placeholder="メールアドレス">

  <button
    data-click-validate
    data-click-confirm="この内容で登録しますか？"
    data-click-fetch="/api/register"
    data-click-fetch-method="POST"
    data-click-form="#myForm"
    data-click-toast="登録が完了しました"
    data-click-redirect="/dashboard"
  >
    登録
  </button>
</form>
```

**実行される処理**:
1. バリデーション実行
2. 確認ダイアログ表示
3. フォームのデータを取得
4. `/api/register`にPOSTで送信
5. 成功したら「登録が完了しました」とトースト表示
6. `/dashboard`にリダイレクト

---

## 実践的なサンプル

### サンプル1: ToDoリスト

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>ToDoリスト</title>
  <script src="https://cdn.jsdelivr.net/npm/haori/dist/haori.iife.js"></script>
  <style>
    .completed { text-decoration: line-through; color: #999; }
  </style>
</head>
<body>
  <div data-fetch="/api/todos" data-fetch-bind="#app">
    <div id="app">
      <h1>ToDoリスト</h1>

      <!-- 新規追加フォーム -->
      <form id="addForm" data-bind='{"newTodo":""}'>
        <input type="text" name="newTodo" placeholder="新しいタスク">
        <button
          data-click-fetch="/api/todos"
          data-click-fetch-method="POST"
          data-click-form="#addForm"
          data-click-refetch="#app"
          data-click-reset="#addForm"
        >
          追加
        </button>
      </form>

      <!-- ToDoリスト -->
      <ul data-each="todos" data-each-key="id">
        <li>
          <span data-bind='{"completed":false}'>
            <input type="checkbox" name="completed">
            <span data-bind:class="completed ? 'completed' : ''">
              {{title}}
            </span>
          </span>

          <button
            data-click-fetch="/api/todos/{{id}}"
            data-click-fetch-method="DELETE"
            data-click-refetch="#app"
          >
            削除
          </button>
        </li>
      </ul>

      <!-- 統計 -->
      <p>
        全{{todos.length}}件
        （完了: {{todos.filter(t => t.completed).length}}件）
      </p>
    </div>
  </div>
</body>
</html>
```

### サンプル2: ユーザー検索

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>ユーザー検索</title>
  <script src="https://cdn.jsdelivr.net/npm/haori/dist/haori.iife.js"></script>
</head>
<body>
  <div>
    <h1>ユーザー検索</h1>

    <!-- 検索フォーム -->
    <form id="searchForm" data-bind='{"keyword":""}'>
      <input type="text" name="keyword" placeholder="名前で検索">
      <button
        data-click-fetch="/api/users/search"
        data-click-fetch-method="GET"
        data-click-form="#searchForm"
        data-click-bind="#results"
      >
        検索
      </button>
    </form>

    <!-- 検索結果 -->
    <div id="results">
      <h2 data-if="users && users.length > 0">
        検索結果: {{users.length}}件
      </h2>

      <ul data-each="users" data-each-key="id">
        <li>
          <h3>{{name}}</h3>
          <p>メール: {{email}}</p>
          <p>部署: {{department}}</p>
        </li>
      </ul>

      <p data-if="users && users.length === 0">
        該当するユーザーが見つかりませんでした
      </p>
    </div>
  </div>
</body>
</html>
```

### サンプル3: 商品カート

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>ショッピングカート</title>
  <script src="https://cdn.jsdelivr.net/npm/haori/dist/haori.iife.js"></script>
</head>
<body>
  <div data-fetch="/api/cart" data-fetch-bind="#cart">
    <div id="cart">
      <h1>ショッピングカート</h1>

      <!-- カート内容 -->
      <table>
        <thead>
          <tr>
            <th>商品名</th>
            <th>単価</th>
            <th>数量</th>
            <th>小計</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody data-each="items" data-each-key="id">
          <tr>
            <td>{{name}}</td>
            <td>{{price}}円</td>
            <td>
              <button data-click-adjust="[name='quantity']" data-click-adjust-value="-1">-</button>
              <input type="number" name="quantity" data-attr-value="{{quantity}}" min="1">
              <button data-click-adjust="[name='quantity']" data-click-adjust-value="1">+</button>
            </td>
            <td>{{price * quantity}}円</td>
            <td>
              <button
                data-click-row-remove
                data-click-confirm="この商品を削除しますか？"
              >
                削除
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 合計 -->
      <div>
        <p>
          <strong>合計: {{items.reduce((sum, item) => sum + item.price * item.quantity, 0)}}円</strong>
        </p>
      </div>

      <!-- 購入ボタン -->
      <button
        data-click-fetch="/api/checkout"
        data-click-fetch-method="POST"
        data-click-form="#cart"
        data-click-confirm="この内容で購入しますか？"
        data-click-redirect="/order-complete"
      >
        購入する
      </button>

      <!-- 空のカート -->
      <p data-if="!items || items.length === 0">
        カートは空です
      </p>
    </div>
  </div>
</body>
</html>
```

---

# 第2部: JavaScript開発者向け

## JavaScriptからHaoriを使う

Haori.jsはJavaScriptからも制御できます。

### モジュールのインポート

```javascript
import Haori, { Core, Fragment, Form, Queue } from 'haori'
```

### 基本的な使い方

```javascript
// 要素を取得
const element = document.getElementById('myElement')

// データをバインド
await Core.setBindingData(element, {
  name: '田中太郎',
  age: 25
})
```

### Fragmentの取得と操作

```javascript
import { Fragment, ElementFragment } from 'haori'

const element = document.getElementById('myElement')
const fragment = Fragment.get(element)

if (fragment instanceof ElementFragment) {
  // バインディングデータを取得
  const data = fragment.getBindingData()
  console.log(data)

  // データを更新
  fragment.setBindingData({
    ...data,
    name: '佐藤花子'
  })

  // 属性を設定
  await fragment.setAttribute('data-custom', 'value')

  // 表示/非表示
  await fragment.show()
  await fragment.hide()
}
```

### フォームの値を取得・設定

```javascript
import { Form, Fragment } from 'haori'

const formElement = document.getElementById('myForm')
const formFragment = Fragment.get(formElement)

// 値を取得
const values = Form.getValues(formFragment)
console.log(values)
// 例: { username: "田中", email: "tanaka@example.com" }

// 値を設定
await Form.setValues(formFragment, {
  username: '佐藤',
  email: 'sato@example.com'
})

// checkbox の boolean モード（value="true"）
// 例: { mailImapSsl: true } / { mailImapSsl: false }

// リセット
await Form.reset(formFragment)
```

### ユーティリティメソッド

```javascript
import Haori from 'haori'

// ダイアログ表示
await Haori.dialog('処理が完了しました')

// トースト通知（3秒表示。level 省略時は 'info'）
await Haori.toast('保存しました', 'info')     // info（青）
await Haori.toast('警告メッセージ', 'warning') // warning（黄）
await Haori.toast('エラー発生', 'error')       // error（赤）
await Haori.toast('成功しました', 'success')   // success（緑）

// 確認ダイアログ
const result = await Haori.confirm('削除しますか？')
if (result) {
  console.log('OKが押されました')
}

// <dialog>要素の制御
const dialog = document.getElementById('myDialog')
await Haori.openDialog(dialog)
await Haori.closeDialog(dialog)

// エラーメッセージの設定
const input = document.querySelector('input[name="email"]')
await Haori.addErrorMessage(input, 'メールアドレスが不正です')

// レベル付きメッセージの設定
await Haori.addMessage(input, '入力を確認してください', 'warning')

// メッセージのクリア
const form = document.getElementById('myForm')
await Haori.clearMessages(form)
```

### 非同期キューの利用

```javascript
import { Queue } from 'haori'

// タスクをキューに追加（順番に実行される）
await Queue.enqueue(() => {
  console.log('タスク1')
})

await Queue.enqueue(() => {
  console.log('タスク2')
})

// 優先実行（キューの先頭に追加）
await Queue.enqueue(() => {
  console.log('優先タスク')
}, true)

// すべてのタスクの完了を待つ
await Queue.wait()
```

---

## カスタムイベントの活用

Haori.jsは様々なカスタムイベントを発火します。これを活用して高度な処理を実装できます。

### ライフサイクルイベント

```javascript
// Haori.js初期化完了
document.addEventListener('haori:ready', (event) => {
  console.log('Haori.js バージョン:', event.detail.version)
  // 初期化処理
})

// 要素がレンダリングされた
element.addEventListener('haori:render', () => {
  console.log('レンダリング完了')
})
```

### バインディングイベント

```javascript
element.addEventListener('haori:bindchange', (event) => {
  console.log('前の値:', event.detail.previous)
  console.log('新しい値:', event.detail.next)
  console.log('変更理由:', event.detail.reason)

  // 例: 特定のデータが変更されたら処理
  if (event.detail.next.status === 'completed') {
    console.log('ステータスが完了になりました')
  }
})
```

`data-*-bind` / `data-*-bind-arg` などによるバインドと、それに伴う対象要素配下の再評価（`data-if` / `data-each` など）が完了すると、対象要素で `haori:bindcomplete` が発火します。バインド完了を契機に外部スクリプトで同期処理を行いたい場合に利用できます。

**発火タイミングの保証**: `haori:bindcomplete` は、バインド操作だけでなく、**そのバインドに起因する `data-if` の表示切り替えと `data-each` の差分描画（複数フレームに分割される場合や、再評価が重なって再実行される場合も含む）がすべて DOM へ反映された後**に発火します。したがって `haori:bindcomplete` を待てば、参照キーに基づく `data-if` / `data-each` の結果を安全に参照できます（行内に `data-fetch` / `data-import` がある場合、それらの非同期処理はバインド完了後に別途進行します）。

```javascript
document.querySelector('#dialog-state').addEventListener('haori:bindcomplete', (event) => {
  // event.detail.bindArg: bind-arg で指定したネストキー（無指定なら null）
  console.log('バインド完了:', event.detail.bindArg)
})
```

### 表示制御イベント

```javascript
element.addEventListener('haori:show', () => {
  console.log('要素が表示されました')
  // アニメーション処理など
})

element.addEventListener('haori:hide', () => {
  console.log('要素が非表示になりました')
})
```

### リスト更新イベント

`data-each` の差分更新が完了すると、`data-each` 要素で `haori:eachupdate` が発火します。

**発火タイミングの保証**: `haori:eachupdate` は、その更新で**追加・削除・並べ替えされた全行が DOM に反映され、各行の `{{...}}` 補間などの内容描画が完了した後**に発火します。`data-each` は大量行を複数の `requestAnimationFrame` フレームに分割して描画しますが、`haori:eachupdate` はそれら全フレームの完了後に1回発火するため、**描画完了の検知に利用できます**（行内に `data-fetch` / `data-import` / 入れ子の `data-each` がある場合、それらの非同期処理は各行の描画完了後に別途進行します）。

`event.detail` は以下を提供します。

- `added`: 今回追加された行キーの配列
- `removed`: 今回削除された行キーの配列
- `order`: 更新後の全行キーの配列（現在の並び順）
- `total`: 更新後の総行数（`order.length`）

```javascript
listElement.addEventListener('haori:eachupdate', (event) => {
  console.log('追加されたキー:', event.detail.added)
  console.log('削除されたキー:', event.detail.removed)
  console.log('最終的な順序:', event.detail.order)
  console.log('総行数:', event.detail.total)

  // 例: 想定行数に達したら描画完了とみなす（外部からの完了検知）
  if (event.detail.total === expectedRowCount) {
    console.log('全行の描画が完了しました')
  }
})
```

#### 外部テストから描画完了を待機する

Playwright などの外部テストでは、`haori:eachupdate` の購読登録前に発火してしまうと待機が永久に解決しないことがあります。これを避けるため、次の2つの手段を利用できます。

**1. `data-each-done` 属性（推奨・宣言的）**: `data-each` が最新データで全行の描画を完了すると、その要素に `data-each-done` 属性が付与されます（更新が始まると一旦外れ、安定完了で再付与）。属性は完了後に残るため、購読タイミングの競合がありません。

```js
await page.click('#demand-tab')
await page.waitForSelector('#demand-table tbody[data-each-done]')
```

**2. `Haori.waitForRenders()`（命令的・全体待機）**: 進行中および追従して投入されるものを含め、すべてのレンダリングタスクの完了を待つ `Promise<void>` を返します。特定の `data-each` を指定せず、タブ切り替え後の複数描画をまとめて待ちたい場合に有用です。

```js
await page.click('#demand-tab')
await page.evaluate(() => Haori.waitForRenders())
```

iife（`<script src>`）読み込み時はグローバル `Haori.waitForRenders()`、ES Module では `import {waitForRenders} from 'haori'`（または `import Haori from 'haori'; Haori.waitForRenders()`）で利用できます。

```javascript
listElement.addEventListener('haori:rowadd', (event) => {
  console.log('行が追加されました')
  console.log('キー:', event.detail.key)
  console.log('インデックス:', event.detail.index)
  console.log('データ:', event.detail.item)
})

listElement.addEventListener('haori:rowremove', (event) => {
  console.log('行が削除されました')
  console.log('キー:', event.detail.key)
})

listElement.addEventListener('haori:rowmove', (event) => {
  console.log(`行が移動: ${event.detail.from} → ${event.detail.to}`)
})
```

### フェッチイベント

```javascript
element.addEventListener('haori:fetchstart', (event) => {
  console.log('フェッチ開始:', event.detail.url)
  // ローディング表示
  showLoadingSpinner()
})

element.addEventListener('haori:fetchend', (event) => {
  console.log('フェッチ完了:', event.detail.url)
  console.log('ステータス:', event.detail.status)
  console.log('所要時間:', event.detail.durationMs + 'ms')
  // ローディング非表示
  hideLoadingSpinner()
})

element.addEventListener('haori:fetcherror', (event) => {
  console.error('フェッチエラー:', event.detail.url)
  console.error('エラー内容:', event.detail.error)
  // エラー通知
  showErrorNotification(event.detail.error)
})
```

### HTMLインポートイベント

```javascript
element.addEventListener('haori:importstart', (event) => {
  console.log('インポート開始:', event.detail.url)
})

element.addEventListener('haori:importend', (event) => {
  console.log('インポート完了:', event.detail.url)
  console.log('バイト数:', event.detail.bytes)
  console.log('所要時間:', event.detail.durationMs + 'ms')
})

element.addEventListener('haori:importerror', (event) => {
  console.error('インポートエラー:', event.detail.url)
  console.error('エラー:', event.detail.error)
})
```

### 実践例: グローバルローディング表示

```javascript
// すべてのフェッチにローディングを表示
let fetchCount = 0

document.addEventListener('haori:fetchstart', () => {
  fetchCount++
  if (fetchCount === 1) {
    document.getElementById('globalLoading').style.display = 'block'
  }
}, true) // キャプチャフェーズで捕捉

document.addEventListener('haori:fetchend', () => {
  fetchCount--
  if (fetchCount === 0) {
    document.getElementById('globalLoading').style.display = 'none'
  }
}, true)

document.addEventListener('haori:fetcherror', () => {
  fetchCount--
  if (fetchCount === 0) {
    document.getElementById('globalLoading').style.display = 'none'
  }
}, true)
```

---

## Haoriクラスの拡張

Haori.jsのユーティリティクラスを拡張して、独自の機能を追加できます。

### カスタムダイアログの実装

```javascript
import Haori from 'haori'

class MyHaori extends Haori {
  // オリジナルのdialogメソッドをオーバーライド
  static async dialog(message) {
    return new Promise((resolve) => {
      // カスタムダイアログUIを表示
      const dialog = document.createElement('div')
      dialog.className = 'custom-dialog'
      dialog.innerHTML = `
        <div class="dialog-content">
          <p>${message}</p>
          <button id="dialogOk">OK</button>
        </div>
      `
      document.body.appendChild(dialog)

      dialog.querySelector('#dialogOk').addEventListener('click', () => {
        dialog.remove()
        resolve()
      })
    })
  }

  // カスタムトーストの実装
  static async toast(message, level = 'info') {
    // アニメーション付きトースト
    const toast = document.createElement('div')
    toast.className = `custom-toast toast-${level} fade-in`
    toast.textContent = message

    document.body.appendChild(toast)

    // 3秒後にフェードアウト
    setTimeout(() => {
      toast.classList.add('fade-out')
      setTimeout(() => toast.remove(), 300)
    }, 3000)
  }

  // 新しいメソッドの追加
  static async snackbar(message, action, callback) {
    return new Promise((resolve) => {
      const snackbar = document.createElement('div')
      snackbar.className = 'snackbar'
      snackbar.innerHTML = `
        <span>${message}</span>
        <button>${action}</button>
      `
      document.body.appendChild(snackbar)

      snackbar.querySelector('button').addEventListener('click', () => {
        callback?.()
        snackbar.remove()
        resolve()
      })

      // 5秒後に自動で消える
      setTimeout(() => {
        snackbar.remove()
        resolve()
      }, 5000)
    })
  }
}

// 使用例
await MyHaori.dialog('カスタムダイアログ')
await MyHaori.toast('カスタムトースト', 'success')
await MyHaori.snackbar('削除しました', '元に戻す', () => {
  console.log('元に戻す処理')
})
```

### グローバルに置き換える

```javascript
// Haoriクラスをグローバルに置き換え
window.Haori = MyHaori

// これで、HTML属性からも新しい実装が使用される
```

---

## 高度なカスタマイズ

### カスタムバリデーション

```javascript
import { Form, Fragment } from 'haori'

class CustomForm extends Form {
  // バリデーションロジックをカスタマイズ
  static validate(fragment) {
    const values = this.getValues(fragment)
    const errors = []

    // カスタムバリデーション
    if (values.email && !values.email.includes('@')) {
      errors.push({ field: 'email', message: 'メールアドレスが不正です' })
    }

    if (values.password && values.password.length < 8) {
      errors.push({ field: 'password', message: 'パスワードは8文字以上必要です' })
    }

    // エラーメッセージを表示
    errors.forEach(error => {
      const fragments = this.findFragmentsByKey(fragment, error.field)
      fragments.forEach(f => {
        this.addErrorMessage(f, error.field, error.message)
      })
    })

    return errors.length === 0
  }
}

// イベントリスナーで使用
document.addEventListener('submit', async (event) => {
  const form = event.target
  const fragment = Fragment.get(form)

  if (!CustomForm.validate(fragment)) {
    event.preventDefault()
    Haori.toast('入力内容を確認してください', 'error')
  }
}, true)
```

### カスタム式関数の追加

Haori.jsの式評価エンジンは拡張できませんが、データ側で関数を提供できます：

```javascript
import { Core } from 'haori'

// ヘルパー関数を含むデータをバインド
const element = document.getElementById('app')
await Core.setBindingData(element, {
  items: [1, 2, 3, 4, 5],

  // ヘルパー関数
  sum: (arr) => arr.reduce((a, b) => a + b, 0),
  average: (arr) => arr.reduce((a, b) => a + b, 0) / arr.length,
  formatDate: (date) => new Date(date).toLocaleDateString('ja-JP'),
  formatCurrency: (amount) => `¥${amount.toLocaleString()}`
})
```

```html
<div id="app">
  <p>合計: {{sum(items)}}</p>
  <p>平均: {{average(items)}}</p>
  <p>日付: {{formatDate('2025-01-15')}}</p>
  <p>金額: {{formatCurrency(10000)}}</p>
</div>
```

### グローバルフィルター

```javascript
// すべてのフェッチリクエストにトークンを追加
document.addEventListener('haori:fetchstart', (event) => {
  const token = localStorage.getItem('authToken')
  if (token) {
    // リクエストヘッダーにトークンを追加
    // ※実際にはdata-fetch-headersで設定する必要があります
    console.log('トークンをヘッダーに追加:', token)
  }
}, true)

// すべてのエラーレスポンスをハンドリング
document.addEventListener('haori:fetcherror', async (event) => {
  const { status } = event.detail

  if (status === 401) {
    // 認証エラー → ログイン画面へ
    await Haori.dialog('セッションが切れました。再度ログインしてください。')
    window.location.href = '/login'
  } else if (status === 500) {
    // サーバーエラー
    await Haori.toast('サーバーエラーが発生しました', 'error')
  }
}, true)
```

### プログレスバーの実装

```javascript
class ProgressManager {
  constructor() {
    this.activeRequests = new Map()
    this.progressBar = document.getElementById('globalProgress')

    document.addEventListener('haori:fetchstart', (e) => {
      this.onStart(e.detail.url)
    }, true)

    document.addEventListener('haori:fetchend', (e) => {
      this.onComplete(e.detail.url)
    }, true)

    document.addEventListener('haori:fetcherror', (e) => {
      this.onComplete(e.detail.url)
    }, true)
  }

  onStart(url) {
    this.activeRequests.set(url, Date.now())
    this.updateProgress()
  }

  onComplete(url) {
    this.activeRequests.delete(url)
    this.updateProgress()
  }

  updateProgress() {
    const count = this.activeRequests.size
    if (count > 0) {
      this.progressBar.style.display = 'block'
      this.progressBar.style.width = '80%' // インデターミネート
    } else {
      this.progressBar.style.width = '100%'
      setTimeout(() => {
        this.progressBar.style.display = 'none'
        this.progressBar.style.width = '0%'
      }, 300)
    }
  }
}

// 初期化
new ProgressManager()
```

---

## まとめ

### HTMLベースの開発（第1部）

Haori.jsを使えば、HTML属性だけで：

- ✅ データバインディング（`data-bind`, `{{変数}}`）
- ✅ 条件分岐（`data-if`）
- ✅ 繰り返し（`data-each`）
- ✅ フォーム連携（`name`属性）
- ✅ サーバー通信（`data-fetch`, `data-click-fetch`）
- ✅ UI操作（ダイアログ、トースト、リダイレクト）

これらがJavaScriptなしで実現できます。

### JavaScript拡張（第2部）

JavaScriptを使えば：

- ✅ プログラムからのデータ操作
- ✅ カスタムイベントの監視
- ✅ ユーティリティクラスの拡張
- ✅ 高度なカスタマイズ

が可能になります。

### 次のステップ

- 📖 [技術仕様書](./specs.md) - 詳細な仕様を確認
- 💻 [GitHubリポジトリ](https://github.com/example/haori-js) - ソースコードとサンプル
- 🐛 [Issue報告](https://github.com/example/haori-js/issues) - バグ報告や機能要望

---

**Happy Coding with Haori.js! 🎉**
