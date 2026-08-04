# Haori.js 利用ガイド

バージョン: 0.41.0

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

### 動くデモで確かめる

`demo/index.html` に、属性ごと・機能ごとの個別デモの一覧があります。リポジトリで
`npm run dev:demo` を実行してブラウザで開くと、このガイドの例をそのまま動かせます。
各デモは Playwright の操作テストで挙動を検証しているため、書かれているとおりに動きます。

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

`data-attr-*` は対応する属性を更新します。加えて、入力欄の状態と DOM の食い違いを防ぐため、`value`（テキスト系入力）・`checked`（radio / checkbox）・`selected`（option）は DOM property（`input.value` / `element.checked` / `option.selected`）も同期します。`checked="{{式}}"`・`data-attr-checked`・`data-attr-selected` でチェック・選択状態を宣言バインドできます。ただし**フォーカス中（編集中）の入力**と、**`change` / `input` で確定した編集を抱えている入力**には再適用しません（別要素起因の再評価で利用者の入力が失われるのを防ぐため）。確定した編集の印は明示的な値の供給（フェッチ応答の反映、`data-{event}-reset`、`data-{event}-copy`、`Core.setBindingData()`）で解除されます。

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

- `haori.date(value, format?, timeZone?)`: ISO 文字列・エポックミリ秒・`Date` を整形します（既定は `yyyy/MM/dd HH:mm`）。利用できるトークンは `yyyy`（4桁年）`yy`（2桁年）`MM`/`M`（月）`dd`/`d`（日）`HH`/`H`（時・24時間）`mm`（分）`ss`（秒）です。空・不正な値は空文字になります。`y M d H m s` などトークンに使う英字をそのまま文字として出したい場合はシングルクォートで囲みます（例 `{{ haori.date(t, "yyyy-MM-dd'T'HH:mm") }}` → `2024-01-15T10:30`）。`timeZone` を省略するとブラウザのローカル時刻で整形し、IANA タイムゾーン名（例 `'Asia/Tokyo'`）を渡すと端末のタイムゾーンに依存せずその地域の時刻で整形します（例 `{{ haori.date(updatedAt, 'yyyy/MM/dd HH:mm', 'Asia/Tokyo') }}`）。不正なタイムゾーン名は空文字になります。
- `haori.number(value, decimals?)`: 桁区切りを付けて整形します。`decimals` を指定すると小数桁を固定できます（例 `{{ haori.number(rate, 2) }}`）。数値文字列の前後空白は無視し、空・空白のみ・数値化できない値は空文字になります。

> `haori` は予約名です。`data-bind` で `haori` というキーを与えても、式の中では組み込みヘルパーが優先されます。同じ関数は JavaScript からも `Haori.date(...)` / `Haori.number(...)` として呼べます。

### レシピ: ドットを含む `name`（識別子として書けないキー）

サーバ側のパラメータ名に合わせて `<input name="customer.email">` のようにドットを含む `name` を使うことがあります。この値は**フラットなキー `customer.email`** として収集され、送信形式もそのままです（クエリなら `customer.email=...`）。

ただしバインドキーは式の中で識別子として扱われるため、`customer.email` のようなキーは**式から直接参照できません**。参照するには `haori.data` を使います。

```html
<div data-bind='{"route":"x"}'>
  <form>
    <select name="customer.contractorType">
      <option value="">-</option>
      <option value="法人">法人</option>
    </select>

    <!-- ✅ 識別子として書けないキーは haori.data から読む -->
    <div data-if="haori.data['customer.contractorType'] === '法人'">
      <label>法人名 <input name="customer.corpName"></label>
    </div>

    <!-- ❌ 直接参照はできない（未解決参照になり空表示） -->
    <span>{{customer.contractorType}}</span>
  </form>
</div>
```

参照側も自然に書きたい場合は、`name` を識別子として妥当な名前にするか、`data-form-object` で入れ子に収集します（**送信形式が変わる**点に注意してください。クエリでは `customer={"contractorType":"法人"}` のように JSON 文字列になります）。

> **開発モードの警告**
>
> 識別子として使えないキーを検出すると、キーごとに一度だけ警告します。0.29.0 以前は、こうしたキーが 1 つあるだけで**同じスコープのすべての式**が `Failed to compile expression` で評価できなくなっていました。

#### 現在日時・相対日付を入れる（`haori.now` / `haori.today`）

「画面を開いた日」を基準にした初期値（当日・前日・当月初など）は、`haori.now` / `haori.today` で宣言的に書けます。`data-bind` は JSON 専用で `{{}}` を解釈しないため、動的な日付の埋め込みにはこれらを使います。

**記述するHTML**:
```html
<!-- 勤務日の絞り込み: 既定で前日を設定 -->
<input type="date" name="workDateFrom" data-attr-value="{{ haori.today(-1) }}">
<input type="date" name="workDateTo"   data-attr-value="{{ haori.today(-1) }}">

<p>本日: {{ haori.today() }}</p>
<p>翌日: {{ haori.today(1, 'yyyy/MM/dd') }}</p>
<p>現在時刻: {{ haori.now('yyyy/MM/dd HH:mm', 'Asia/Tokyo') }}</p>
```

- `haori.now(format?, timeZone?)`: 評価時点の現在日時を整形します（既定 `yyyy/MM/dd HH:mm`）。トークン・`timeZone` の扱いは `haori.date` と同じです。
- `haori.today(offsetDays?, format?, timeZone?)`: 現在日付に `offsetDays` 日を加減して整形します（既定の `offsetDays` は 0、既定フォーマットは `input[type=date]` 互換の `yyyy-MM-dd`）。加減算はカレンダー演算で行うため月跨ぎ・年跨ぎを自動処理し、夏時間の影響を受けません。`timeZone` を渡すとそのタイムゾーンでの当日を起点に計算します。

> **注意**: `haori.now` / `haori.today` は現在時刻に依存するため、他の組み込みヘルパーと違い**冪等ではありません**。また `data-attr-value` は「初期値」ではなく、スコープ変化のたびに再評価され入力欄へ再適用されます。そのため日跨ぎや再描画で、ユーザーが編集した値が初期日付へ戻ることがあります。一度だけ設定したい場合は再評価されない初期スコープ（`data-bind` のシード値）を使ってください。

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

### 非表示にした入力はフォーム送信に含まれない

`data-if` が `false` の要素は DOM から消えるのではなく、`data-if-false` 属性が付いて非表示で残ります。そのため、同じ `name` の入力を設定型ごとに `data-if` で出し分けると、画面に見えていない分岐の入力も DOM 上に同名で残ります。

フォーム値の収集（`data-click-form` など）は、`data-if` が `false` の要素とその配下を**自動的に対象外**にします。表示中の分岐の値だけが送信され、非表示分岐の値が混ざる心配はありません。

```html
<form data-bind='{"mode":"fixed"}'>
  <!-- mode が fixed のときだけ送信される -->
  <div data-if="mode === 'fixed'">
    <input name="value" value="100">
  </div>
  <!-- 非表示のあいだは送信されない -->
  <div data-if="mode === 'ratio'">
    <input name="value" value="0.5">
  </div>
</form>
```

なお、送信値からは除外されますが、同名の入力要素自体は DOM 上に残ります。Playwright などのセレクタで「1要素だけ」を前提にしたい場合は、入力を1つにまとめ `type` / `step` / `max` などを `{{}}` 式で切り替える方法も検討してください。

### 非表示にした入力はバリデーションにも含まれない

送信値の除外と同じ基準で、`data-if` が `false` の分岐の入力は**バリデーションの対象外**になります。非表示のあいだ、Haori が配下の入力へ `disabled` を付けて制約検証から外すためです。

```html
<form id="f" data-bind='{"kind":"individual"}'>
  <select name="kind">
    <option value="individual">個人</option>
    <option value="company">法人</option>
  </select>
  <!-- 個人を選んでいるあいだ、この required は検証されない -->
  <div data-if="kind === 'company'">
    <input name="companyName" required>
  </div>
</form>
<button data-click-validate data-click-form="#f"
  data-click-fetch="/api/save" data-click-method="post">保存</button>
```

- `data-{event}-validate`・`form.checkValidity()`・ネイティブ送信のいずれも、非表示分岐の `required` では止まりません。
- 表示へ戻すと通常どおり検証対象になります。**利用者が自分で付けた `disabled`（`data-attr-disabled` の評価結果を含む）は表示後も維持されます。**
- 非表示分岐の内側に `data-attr-required="{{...}}"` を置いて制約を外す必要はありません。非表示のあいだ配下は再評価されないため、その方法では解除できません（`data-if` は表示へ戻った時点で配下をまとめて再評価します）。

> **0.29.0 以前の挙動**
>
> 非表示分岐の `required` が検証対象に残っていたため、表示中の分岐だけを入力しても送信できませんでした。`reportValidity()` は `display: none` の要素へフォーカスできないため、ブラウザは何も表示せずに止まり、原因が分からない状態になっていました。回避策として `fieldset` の `disabled` を併用する必要はもうありません。

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
- `data-each-key="キー名"`: 各項目を識別するための一意なキー（IDなど）。**値は配列の中で重複しないようにしてください。** 重複した場合、行と項目は出現順で対応するため表示は崩れませんが、キーによる行の識別（並べ替えでの行の再利用など）は働かず、開発モードで警告が出ます
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

### ページ件数サマリーを表示する（`haori.pageSummary`）

`haori.pageSummary(page, visibleCount?)` は、Spring Data の `Page` 相当のオブジェクトから「1 - 20 / 100 件」のような表示用サマリーを計算します。戻り値は `{start, end, total, empty}` です。

- `page`: `number`（0 始まりのページ番号）・`size`・`totalElements`（または `totalCount`）を持つオブジェクト。
- `visibleCount`: 省略可。末尾ページで端数になる場合の `end` 計算に使う表示件数。省略時は `page.numberOfElements` → `size` の順で採用します。
- 総件数が 0 のときは `{start: 0, end: 0, total: 0, empty: true}` を返します。

```html
<div data-bind='{"view":{"number":0,"size":20,"totalElements":100,"empty":false}}'>
  <span data-if="!view.empty">
    {{ haori.pageSummary(view).start }} - {{ haori.pageSummary(view).end }}
    / {{ view.totalElements }} 件
  </span>
</div>
```

**ブラウザでの表示結果**:
```
1 - 20 / 100 件
```

### 無限スクロールで「いま見えている行範囲」を出す（`data-each-visible`）

無限スクロールのフッタで「いま画面に見えている行範囲（例 `21 - 40 / 100 件`）」を出したいとき、`data-each` コンテナに `data-each-visible="<変数名>"` を付けると、可視行範囲を JavaScript なしで取得できます。各行を監視し、指定名の変数を**最近接の上位 `data-bind` スコープ**へ公開します。

```html
<div data-bind='{"page":{"totalElements":100}}'>
  <ul data-each="content" data-each-key="id"
      data-each-visible="vr" data-each-visible-root="#list-scroll">
    <li>{{name}}</li>
  </ul>
  <footer>
    {{vr.firstLabel}} - {{vr.lastLabel}} / {{ haori.pageSummary(page).total }} 件
  </footer>
</div>
```

- 公開される変数（上の例では `vr`）は `first` / `last`（0 始まりの可視行インデックス）、`firstLabel` / `lastLabel`（表示用に +1 した番号）、`count`（可視行数）、`total`（**読込済の行数**）、`empty`（可視 0 件で true）を持ちます。
- `data-each-visible-root` にスクロール枠のセレクタを指定します（省略時はビューポート）。1px でも見えていれば可視として扱います。
- `total` は読込済の行数です。サーバ側のグランド総数（例 100 件）は上の例のように `page` 情報と `haori.pageSummary(page).total` を併用して表示してください。
- 変数は初回スクロール/描画後に公開されるため、表示直後の一瞬は未定義になり得ます。フッタは `{{vr.firstLabel}}`（未定義時は空表示）か `data-if` でガードしてください。

> 性能上の理由から、可視範囲の公開では `data-bind` 属性への書き戻しと `haori:bindchange` イベントの発火を行いません（公開先要素でバインド変更通知は受け取れません）。値は `Haori.Core.getBindingData(...)` の in-memory 値として参照でき、式・表示には通常どおり反映されます。

### 配列から要素を探す（`haori.findBy`）

`haori.findBy(array, key, value)` は、配列から `item[key]` が `value` に一致する最初の要素を返します。比較は**文字列化**して行うため、数値 ID と文字列 ID の差を気にせず書けます。一致が無ければ `null` を返します。

```html
<!-- 選択中 ID の要素名を表示（見つからなければ先頭を使う） -->
{{ (haori.findBy(contracts || [], 'id', selectedId) ?? contracts[0])?.siteName }}
```

先頭要素をフォールバックにしたいときは `?? array[0]` を付けます（`findBy` 自体は一致が無いと `null` を返します）。

### 配列の重複排除・グルーピング（`haori.distinct` / `haori.groupBy`）

明細単位のレスポンスを一覧で「1 件 = 1 行」にまとめたり、見出しごとにグループ化したりする処理は、自前の JavaScript を書かずに組み込みヘルパーで宣言的に書けます。いずれも比較は**文字列化**して行い（数値 ID と文字列 ID の差を吸収）、元の順序を保ちます。

- `haori.distinct(array, key?)`: 重複を取り除いた新しい配列を返します。`key` を省略すると要素自体で、指定すると `item[key]` で重複を判定し、最初に出現した要素だけを残します。

```html
<!-- orderId が重複する明細を 1 行にまとめる -->
<ul data-each="haori.distinct(rows, 'orderId')" data-each-key="orderId">
  <li>{{orderId}}</li>
</ul>
```

- `haori.groupBy(array, key)`: `item[key]` ごとに `{key, items}` の配列へ分けます。`data-each` を入れ子にすると、グループ見出しと明細を宣言的に描画できます。

```html
<!-- 日付ごとにグループ化して見出し＋明細を表示 -->
<div data-each="haori.groupBy(rows, 'date')" data-each-key="key">
  <h3>{{key}}</h3>
  <ul data-each="items" data-each-arg="item">
    <li>{{item.name}}</li>
  </ul>
</div>
```

### 月次の選択肢・ナビゲーションを作る（`haori.monthRange` / `haori.monthAdd`）

月別ページの「月セレクト」や「前月・翌月」ナビゲーションは、`YYYY-MM` 形式の年月を扱う組み込みヘルパーで書けます。いずれも `Date` を介さず整数演算で計算するため、タイムゾーンの影響を受けません。

- `haori.monthRange(count, base?)`: 基準月から過去方向へ `count + 1` 個の `{targetMonth, label}`（`targetMonth` は `YYYY-MM`、`label` は `YYYY/MM`）を**降順**（新しい月が先頭）で返します。`base` を省略すると現在月が基準です。
- `haori.monthAdd(value, delta)`: `YYYY-MM` に `delta` ヶ月を加算して `YYYY-MM` で返します（負数で過去方向）。不正な入力は空文字です。

```html
<!-- 月セレクト（直近 24 ヶ月） -->
<select data-each="haori.monthRange(24)" data-each-arg="m" data-each-key="targetMonth">
  <option value="{{m.targetMonth}}">{{m.label}}</option>
</select>

<!-- 前月・翌月ナビゲーション -->
<div data-bind='{"targetMonth":"2026-06"}'>
  <button type="button" data-click-data="targetMonth={{haori.monthAdd(targetMonth, -1)}}">前月</button>
  <span>{{ haori.monthAdd(targetMonth, 0) }}</span>
  <button type="button" data-click-data="targetMonth={{haori.monthAdd(targetMonth, 1)}}">翌月</button>
</div>
```

> `haori.monthRange` を `base` 省略で呼ぶと現在月に依存するため、式の再評価で結果を固定したい場合は `haori.monthRange(24, '2026-06')` のように基準月を明示してください。

### 選択肢を描画したら既定選択で初期データを取得する（`data-each-rendered-change`）

API から取得した候補を `<select>` へ流し込み、「先頭の候補が選ばれた状態で明細を取得する」のはよくあるパターンです。`data-each-rendered-change` を付けると、描画確定後に `change` が発火するため、JavaScript を書かずに実現できます。

`<select>` はブラウザが先頭の `<option>` を自動選択するため、この `change` がそのまま既定選択の確定になります。

```html
<!-- 対象月の候補を取得 -->
<div data-fetch="/api/reward-months" data-fetch-arg="mv">
  <form id="reward-form">
    <select
      name="month"
      data-each="mv.months"
      data-each-arg="m"
      data-each-rendered-change
      data-change-fetch="/api/reward"
      data-change-form="#reward-form"
      data-change-bind="#reward-result"
      data-change-bind-arg="reward"
    >
      <option data-attr-value="{{m}}">{{m}}</option>
    </select>
  </form>
</div>

<div id="reward-result">
  <p>支給額: {{ haori.number(reward &amp;&amp; reward.total) }}</p>
</div>
```

動作の要点は次のとおりです。

- **既定は初回だけ発火**します。上例のように `change` の手続きが再描画を招く構成でも、発火がループしません。描画確定ごとに毎回発火させたい場合は `data-each-rendered-change="always"` を指定します。
- **描画行が 0 件のときは発火しません**。`data-fetch` の完了前の空描画では発火せず、候補が入った最初の描画で発火します（`if (this.options.length)` のようなガードを書く必要はありません）。
- `data-each-rendered-run` と併用した場合は、**`data-each-rendered-run` が先**に実行されます。外部ウィジェット（Choices.js 等）の再同期を済ませた状態で `change` が発火します。

> 初期表示のスキャン中に描画が確定した場合でも、手続きは初期化完了後に確実に実行されます（`setTimeout` で遅延させる必要はありません）。

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

### レシピ: 繰り返し行の中でラジオボタンを使う（`data-form-name`）

HTML のラジオボタンは「同じフォームの中の同名要素」で 1 グループになります。そのため `data-form-list` の行の中で同じ `name` を使うと、**行をまたいで排他**になり、行ごとに別の値を選べません（別の行を選ぶと前の行の選択が外れます）。

行ごとに独立して選ばせたいときは、`name` を書かずに `data-form-name` で収集キーを宣言します。DOM の `name` は Haori が行ごとに自動で振り分けます。

```html
<!-- ✅ 行ごとに独立して選ぶ -->
<form data-bind='{"rows":[{"title":"設計"},{"title":"実装"}]}'>
  <div data-form-list="rows" data-each="rows" data-each-arg="r">
    <div>
      <input name="title">
      <label><input type="radio" data-form-name="level" value="high">高</label>
      <label><input type="radio" data-form-name="level" value="low">低</label>
    </div>
  </div>
</form>
<!-- { rows: [{ title: "設計", level: "high" }, { title: "実装", level: "low" }] } -->
```

逆に「**複数行の中から 1 行だけ選ぶ**」（代表行の選択など）を表現したいときは、従来どおり `name` を書きます。この場合は行をまたぐ 1 グループになり、選択されていない行の値は `null` になります。

```html
<!-- ✅ 複数行から 1 行だけ選ぶ -->
<div data-form-list="rows" data-each="rows" data-each-arg="r">
  <div>
    <input name="title">
    <label><input type="radio" name="primary" value="yes">代表</label>
  </div>
</div>
<!-- { rows: [{ title: "…", primary: null }, { title: "…", primary: "yes" }] } -->
```

`data-form-name` は行の外でも使えます。DOM の `name` と収集キーを分けたいときの一般的な手段です（`data-attr-name` で DOM の `name` を変える方法では値が収集されません）。

### レシピ: フォーム外の単独チェックボックスでボタンを活性化する

「利用規約に同意したら送信ボタンを有効にする」のようなゲートは、`<form>` を用意せずに書けます。`change` の手続きは、フォームコンテナ（`<form>` / `data-form`）が祖先に無い場合、**その入力要素自身の `name` と値だけ**を送信データにします。

`value="true"` を付けたチェックボックスは boolean として扱われるため、ON で `true`、OFF で `false` が書き戻されます。

```html
<div id="gate" data-bind='{"agreed":false}'>
  <label>
    <input type="checkbox" name="agreed" value="true"
      data-change-bind="#gate" data-change-bind-merge>
    利用規約に同意します
  </label>

  <button data-attr-disabled="{{!agreed}}"
          data-click-fetch="/api/login" data-click-fetch-method="POST">
    ログイン
  </button>
</div>
```

> **`data-change-bind-merge` を付ける**
>
> `data-{event}-bind` は既定でバインド先を**全置換**します。上例のようにバインド先に他のキー（既定値や一覧データ）がある場合は `data-change-bind-merge` を付けて、指定キーだけを更新してください。
>
> なお `name` が無い入力では収集する値がありません。この場合は既存データを空オブジェクトで壊さないよう、Haori がバインドをスキップして警告を出します（`name` の付け忘れに気付けます）。

この収集値は bind だけでなく**送信データ全体**に入るため、`data-change-fetch` のクエリにも含まれます。フォームを用意せずに絞り込みを実装するときに便利です。

```html
<!-- フォーム外の select でも値がクエリに付く: /api/list?kind=B -->
<select name="kind" data-change-fetch="/api/list" data-change-bind="#list">
  <option value="A">A</option>
  <option value="B">B</option>
</select>
```

> 収集対象は `name` を持つ `<input>` / `<select>` / `<textarea>` **自身**に限られます。コンテナ要素で `change` を受けても配下の入力はまとめて収集されません（まとめたい場合は `<form>` か `data-form` を宣言してください）。

### レシピ: チェック状態は「バインドデータ」で操作する（手書き `.checked` を避ける）

`data-attr-checked="{{...}}"`（または `checked="{{...}}"`）で束縛したチェックボックスは、評価結果が `element.checked`（DOM プロパティ）まで同期されます。これにより、別要素の `change` などでフォームが再評価されると、チェック状態は**常にバインドデータ基準**へ戻ります。

このとき、JavaScript で `element.checked = true` のように DOM を直接書き換えると、次回の再評価で**バインドデータ基準に巻き戻り**ます。ユーザー編集の保護は `change` / `input` を通した操作だけが対象なので、スクリプトからの直接操作には効きません。これは宣言バインドと手書き DOM 操作の混在によるアンチパターンです。

連動（例: 「権限セット」をチェックすると対応する個別権限を一括で ON にする）も、**バインドデータ側を更新**すれば再評価をまたいで保持されます。集合演算（加算・他セット保持）も、配列をマージしてから `Core.setBindingData` で書き戻すだけで宣言的に表現できます。

```html
<div id="perm-state" data-bind='{"permissions":["DASHBOARD_VIEW"]}'>
  <!-- 個別権限: チェック状態はバインドデータ（permissions 配列）に従う -->
  <label>
    <input type="checkbox" name="permissions" value="DASHBOARD_VIEW"
      data-attr-checked="{{(permissions || []).includes('DASHBOARD_VIEW')}}">
    ダッシュボード閲覧
  </label>
  <label>
    <input type="checkbox" name="permissions" value="REPORT_VIEW"
      data-attr-checked="{{(permissions || []).includes('REPORT_VIEW')}}">
    レポート閲覧
  </label>

  <!-- 権限セット: change で個別権限を「加算」する（他セットの権限は解除しない） -->
  <label>
    <input type="checkbox" value="VIEWER_SET"
      data-change-run="window.applyPermissionSet(['DASHBOARD_VIEW','REPORT_VIEW'])">
    閲覧者セット
  </label>
</div>

<script>
  window.applyPermissionSet = added => {
    const el = document.getElementById('perm-state')
    // 現在の解決済みスコープから permissions を読み、集合加算してから書き戻す
    const current = Haori.Core.getBindingData(el, { resolved: true }) || {}
    const next = new Set([...(current.permissions || []), ...added])
    Haori.Core.setBindingData(el, { ...current, permissions: [...next] })
  }
</script>
```

ポイントは「`.checked` を直接いじらず、`permissions` 配列を更新する」ことです。`data-attr-checked` は配列を参照しているため、`setBindingData` 後の再評価で各チェックボックスの状態が正しく反映され、以降の再評価でも保持されます。読み取りには `Core.getBindingData(element, { resolved: true })`、書き込みには `Core.setBindingData(element, data)` を使います。

### レシピ: `name` 付き入力で「参照スコープ」と「書込スコープ」が違うとき

`name` を持つ入力は、フォームの双方向バインディングによって**バインドデータ ↔ 値・選択状態**が双方向に同期します。ここに `data-attr-selected` / `data-attr-checked` / `data-attr-value`（`value="{{式}}"` も同様）を**別のスコープ（キー）を参照する形で**併用すると、値の供給元が二つになります。

典型は「フォームは `name` で平坦なキー（例 `category`）に書き込むのに、`data-attr-selected` の式は別オブジェクト（例 祖先の `correspondenceItem.category`）を読む」構成です。

**0.29.0 以降、この構成でも確定した編集は失われません。** 利用者が `change` / `input` で確定した入力欄は、明示的な値の供給（`data-fetch` / `data-{event}-fetch` の応答反映、`data-{event}-reset`、`data-{event}-copy`、`Core.setBindingData()` の直接呼び出し）を受けるまで宣言バインドの再適用対象から外れます。0.16.0〜0.28.x では、フォーカスが外れた後の再評価で**選択や入力内容が評価結果へ巻き戻っていました**（`required` 検証も落ちました）。

入力要素自身に `data-change-bind` を付け、`data-change-bind-arg` で参照キーとは別のキーへ書き込む構成も同じです。フェッチを伴わない `data-{event}-bind` は「編集値をバインドデータへ写す双方向コミット」なので、値の供給として扱いません。

```html
<!-- 確定した編集は保持される（参照キー record.* ／ 書込キー draft） -->
<div id="state" data-bind='{"record":{"a":"","b":""}}'>
  <form>
    <input name="a" data-attr-value="{{record.a}}"
      data-change-bind="#state" data-change-bind-arg="draft">
    <input name="b" data-attr-value="{{record.b}}"
      data-change-bind="#state" data-change-bind-arg="draft">
  </form>
</div>
```

> **導出値の欄は `readonly` にする**
>
> 上の規則の裏返しとして、利用者が一度編集した欄は明示的な供給を受けるまで評価結果に追従しません。`data-attr-value="{{plan.kind === 'A' ? '100' : '200'}}"` のように他の入力から導出した値を入れる欄で、前提が変わったら常に入れ直したい場合は、その欄を `readonly` にしてください（編集できない欄には印が付かないため、常に追従します）。編集も許したい場合は、`data-{event}-fetch` の応答や `data-{event}-reset` を契機にしてください。

それでも、参照スコープと書込スコープを揃えたほうが素直です。揃えておくと次の利点があります。

- 再取得（`data-fetch`）の応答で編集前の値へ戻らない。応答は「編集より古い情報」として扱われるため、揃っていない構成では送信前の編集が応答の値へ更新されます
- 画面の表示とバインドデータが常に一致するため、他の式（`data-if` など）から同じキーを参照できる

```html
<!-- △ 書込先（form 自身の category）と読取先（祖先の correspondenceItem.category）が異なる -->
<div data-bind='{"correspondenceItem":{"category":""}}'>
  <form>
    <select name="category" required>
      <option value=""></option>
      <option value="BILLING_OTHER"
        data-attr-selected="{{correspondenceItem?.category === 'BILLING_OTHER' && 'selected'}}">請求その他</option>
    </select>
  </form>
</div>
```

揃える書き方は次のいずれかです。

**推奨①: `name` 束縛に選択状態を任せ、`data-attr-selected` を使わない。** `name` 付き select の選択は `name` のバインドデータで決まるため、`data-attr-selected` は不要です。初期値はフォームの `data-bind` / `data-fetch` で `category` を投入しておけば、初期表示も編集後の保持も両立します。

```html
<!-- ✅ 推奨①: 単一の真実源（name 束縛のみ） -->
<form data-bind='{"category":""}'>
  <select name="category" required>
    <option value=""></option>
    <option value="BILLING_OTHER">請求その他</option>
  </select>
</form>
```

**推奨②: `data-attr-selected` を残すなら、書込先と同じキーを読む。** select の `name`（= `category`）が書き込むキーと同じキーを式で参照します。

```html
<!-- ✅ 推奨②: 読取先 = 書込先（同じ category） -->
<form data-bind='{"category":""}'>
  <select name="category" required>
    <option value=""></option>
    <option value="BILLING_OTHER"
      data-attr-selected="{{category === 'BILLING_OTHER' && 'selected'}}">請求その他</option>
  </select>
</form>
```

**推奨③: レコードを祖先に置いたまま、`data-form-arg` でそのキーを編集する。** 祖先が持つレコード（例 `correspondenceItem`）をフォームへコピーせずに、そのキーを `data-form-arg` に指定します。入力欄には祖先のレコードの値が入り、`name` の書込先も同じキー配下（`correspondenceItem.category`）になります。

```html
<!-- ✅ 推奨③: 祖先がレコードを所有し、フォームがそのキーを編集する -->
<div id="state" data-bind='{"correspondenceItem":{"id":7,"category":"BILLING_OTHER"}}'>
  <form data-form-arg="correspondenceItem">
    <select name="category" required>
      <option value=""></option>
      <option value="BILLING_OTHER">請求その他</option>
    </select>
    <!-- 入力欄に無いフィールドもコミット後に参照できる -->
    <button data-click-fetch="/api/items/{{correspondenceItem.id}}"
      data-click-form>保存</button>
  </form>
</div>
```

一覧で選んだ行を編集フォームへ出す構成では、祖先（`#state`）の `correspondenceItem` を差し替えるだけで入力欄が入れ替わります。値が変わっていない更新では入力欄に触らないため、編集中の内容が同じ値で巻き戻ることもありません。対象は祖先の `data-bind` が持つキーで、`data-each` の行データは対象外です（行の編集は `data-form-list` を使います）。

いずれの書き方でも、要点は **`data-attr-selected` / `data-attr-checked` / `data-attr-value` の式が参照するキーと、その要素の `name` がフォームへ書き込むキーを一致させる**ことです。

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

> **`data-url-arg` を付けたほうがよい 2 つの理由**
>
> 1. **`data-bind` の既定値が消えない**。`data-url-arg` を省略した `data-url-param` は、バインドデータをクエリパラメータで**全置換**します。そのため同一要素に `data-bind` で既定値を書いても消えてしまいます。`data-url-arg` を付けるとそのキー配下へのマージになり、既定値が保持されます。
> 2. **キーの出所が明確になる**。`{{expired}}` のようにクエリ名をトップレベルで直接参照した場合、そのクエリが URL に無ければ未解決参照（表示は空・条件は偽）になります。エラーにはなりませんが、どこから来るキーなのかがマークアップから読み取れません。`data-url-arg` を付けて `{{params.expired}}` のようなプロパティ参照にすれば、クエリ由来であることが明示できます。
>
> ```html
> <!-- 避けたい書き方: 既定値が消え、キーの出所も分からない -->
> <div data-url-param data-bind='{"category":"all"}'>
>   <p data-if="expired">セッションが切れました。</p>
> </div>
>
> <!-- 推奨: 既定値が残り、クエリが無くてもエラーにならない -->
> <div data-url-param data-url-arg="params" data-bind='{"category":"all"}'>
>   <p data-if="params.expired">セッションが切れました。</p>
> </div>
> ```

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

#### 実用例: 共通マークアップ＋画面ごとの差分

取り込んだ断片は、取り込み先要素の通常の子要素と同じスコープで評価されます。取り込み先や祖先の `data-bind` を参照できるため、画面ごとに値だけが違う共通表示を 1 ファイルへ集約できます。ウィザードのステップインジケータのように「マークアップは共通、現在ステップだけが違う」表示が典型です。

**step-indicator.html**:
```html
<ol class="steps">
  <li data-attr-class="{{currentStep === 1 ? 'current' : ''}}">お客様情報</li>
  <li data-attr-class="{{currentStep === 2 ? 'current' : ''}}">ご契約内容</li>
  <li data-attr-class="{{currentStep === 3 ? 'current' : ''}}">確認</li>
</ol>
<p>ステップ {{currentStep}} / 3</p>
```

各画面では、取り込み先要素に差分だけを宣言します。

```html
<!-- 2 ページ目 -->
<div data-bind='{"currentStep":2}'
     data-import="/components/step-indicator.html"></div>
```

断片が参照するキーを取り込み側が持っていない場合は未解決参照になり、空表示になります（エラーにはなりません）。

---

## 繰り返し行の中で「その行の要素」を対象にする

`data-{event}-bind` や `data-{event}-copy` のようにセレクタで対象を指定する属性は、`{{}}` を評価した結果をセレクタとして扱います。行ごとに一意な `id` を組み立てれば、`data-each` の行の中から「その行の要素」だけを対象にできます。

### 行ごとのバインド先を指定する

```html
<div data-bind='{"rows":[{},{}]}'>
  <div data-each="rows" data-each-index="i">
    <div>
      <select name="area"
        data-change-fetch="/api/plans.json"
        data-change-bind="#plan-scope-{{i}}"
        data-change-bind-arg="plans">
        <option value="">未選択</option>
        <option value="tokyo">東京</option>
      </select>

      <!-- 取得結果はこの行の中だけに反映される -->
      <div id="plan-scope-{{i}}">
        <p>{{plans.name}}</p>
      </div>
    </div>
  </div>
</div>
```

### 「契約者住所と同じ」で行の住所欄へ複写する

コピー先も式で指定できます。コピー元は `data-{event}-copy-source` で指定します。

```html
<div id="owner" data-bind='{"zip":"1000001","city":"千代田区"}'></div>

<div data-bind='{"rows":[{},{}]}'>
  <div data-each="rows" data-each-index="i">
    <div>
      <form id="addr-{{i}}">
        <input name="zip">
        <input name="city">
      </form>
      <button
        data-click-copy="#addr-{{i}}"
        data-click-copy-source="#owner"
        data-click-copy-params="zip&city"
      >契約者住所と同じ</button>
    </div>
  </div>
</div>
```

コピー先がフォームなら、複写した値はそのまま入力欄へ反映されます。

### 編集可能な行（`data-form-list`）の入力欄へ複写する

上の例は行の中に `<form>` を置ける構成です。行を配列として送信する `data-form-list` を使う場合、外側に `<form>` が必要になるため入れ子の `<form>` は置けません（HTML の制約）。この構成では**行要素自身**をコピー先に指してください。行の入力欄の値は配列の要素データが権威なので、Haori が対応する配列要素へ複写して入力欄まで反映します。

```html
<form data-bind='{"contracts":[{"name":"東京本社"},{"name":"大阪支店"}]}'>
  <div id="owner" data-bind='{"zip":"1000001","city":"千代田区"}'></div>

  <div data-each="contracts" data-each-arg="c" data-each-index="i"
       data-form-list="contracts">
    <!-- 行要素に一意な id を振り、それをコピー先に指す -->
    <div id="addr-{{i}}">
      <input name="name">
      <input name="zip">
      <input name="city">
      <button type="button"
        data-click-copy="#addr-{{i}}"
        data-click-copy-source="#owner"
        data-click-copy-params="zip&city"
      >契約者住所と同じ</button>
    </div>
  </div>
</form>
```

他の行は変わらず、複写した値はそのまま送信データ（`contracts` の該当要素）になります。同じ書き方でフェッチ結果を行へ流し込めます（郵便番号から住所を引く処理など）。

```html
<input name="zip"
  data-change-fetch="/api/address"
  data-change-bind="#addr-{{i}}"
  data-change-bind-merge>
```

`data-{event}-bind` は既定で要素データを置き換えるため、応答に無いキーの入力欄は空になります。入力済みの項目を残したいときは上の例のように `data-{event}-bind-merge` を併記してください。

### 住所を編集したら「契約者住所と同じ」のチェックを外す

複写した値を利用者が書き換えたら、複写のチェックを自動で外す使い方です。行の入力欄の `change` で、行データの該当キーだけを書き戻します。

```html
<!-- チェックを外すための供給元。行の外に置く -->
<div id="copy-off" hidden data-bind='{"sameAsCustomerAddress":false}'></div>

<form data-form data-bind='{"contracts":[{"sameAsCustomerAddress":false}]}'>
  <div data-each="contracts" data-each-arg="c" data-each-index="i"
       data-form-list="contracts">
    <div id="addr-{{i}}">
      <label>
        <input type="checkbox" name="sameAsCustomerAddress" value="true"
          data-change-copy="#addr-{{i}}"
          data-change-copy-source="#customer"
          data-change-copy-params="zip&city">
        契約者住所と同じ
      </label>
      <input name="zip"
        data-change-copy="#addr-{{i}}"
        data-change-copy-source="#copy-off"
        data-change-copy-params="sameAsCustomerAddress">
      <input name="city"
        data-change-copy="#addr-{{i}}"
        data-change-copy-source="#copy-off"
        data-change-copy-params="sameAsCustomerAddress">
    </div>
  </div>
</form>
```

コピーは**明示的な値の供給**なので、利用者が操作したチェックボックスにも反映されます。同時に、コピーしないキー（`zip` / `city`）の編集値は保持されます。編集した住所が巻き戻ることはありません。

### 行の値を、行の外の共有パネルへ複写する

上の 2 例は「行の外の値 → 行へ」でした。逆向き（「行の値 → 行の外へ」）は、一覧の行の操作ボタンから共有のモーダルや詳細パネルへ対象を引き渡す使い方です。よくある画面ですが、**コピー元の指定を省くと何もコピーされません**。

コピー元のバインディングデータは、その要素**自身が持つ値**だけです。祖先から継承した値は含みません（含めると、祖先が持つ一覧の配列などまでコピー先へ焼き付き、以降の祖先の更新を隠してしまいます）。行の中のボタンは自分のバインディングデータを持たないため、暗黙のコピー元では空になります。

行に一意な `id` を組み立て、`data-{event}-copy-source` で行そのものを指してください。

```html
<div data-bind='{"members":[
  {"id":"M-01","name":"山田太郎"},
  {"id":"M-02","name":"佐藤花子"}
]}'>
  <table>
    <tbody data-each="members" data-each-key="id">
      <!-- コピー元として指せるように、行ごとに一意な id を組み立てる -->
      <tr id="member-row-{{id}}">
        <td>{{name}}</td>
        <td>
          <button type="button"
            data-click-copy="#member-detail"
            data-click-copy-source="#member-row-{{id}}"
            data-click-copy-params="id&name"
          >詳細へ写す</button>
        </td>
      </tr>
    </tbody>
  </table>
</div>

<!-- 共有パネルは 1 つだけ置く（行ごとに複製しない） -->
<div id="member-detail" data-bind="{}">
  <p>{{name}}（{{id}}）</p>
</div>
```

> **0.32.0 以前からの移行**: 0.32.0 以前はコピー元に祖先から継承した値も含めていたため、`data-{event}-copy-source` を書かなくても行の値が写っていました。0.33.0 でこの動作を変更したため、コピー元の指定を省いた画面は**エラーも警告も出さずに何もコピーしなくなります**。行の中のボタンから行の外へ複写している箇所は、上のように `data-{event}-copy-source` を追記してください。動く例は `demo/click/data-click-copy-demo.html` にあります。

### 気をつけること

- 対象はセレクタを値に取る属性です。`data-{event}-bind-arg` や `-copy-params` のようなキー名を並べる属性は評価されません。
- セレクタとして不正な値になった場合はログを出してその属性だけをスキップします。同じ手続きの後続のアクションは実行されます。
- `{{}}` が解決できなかった場合は「値の指定なし」として扱われます。`data-{event}-close` のように値を省略したときの既定動作がある属性では、その動作になります。
- 行の `id` は `data-each-index` の値などで一意にしてください。重複すると他の行にも反映されます。
- 行要素を対象にできるのは `data-each` と `data-form-list` を併用したコンテナの行です。行の**内側**の要素を指した場合は、その要素自身のバインディングデータが更新されます（行内のスコープ用要素へのバインドはこれまでどおり書けます）。
- 対象行が見つからない場合（応答を待つ間に行が削除された、`data-each-key` に一致する要素が無いなど）は警告ログを出して書き込みを捨てます。無関係な行を書き換えないためです。

---

## フィールド間の条件でボタンを止める（`data-validity` / `data-{event}-if`）

「連絡先はいずれか必須」「メールアドレスの一致」「合計 1 件以上」のようなフィールド間の条件は、`data-attr-disabled` で表示を切り替えるだけでは**押下を止められません**。属性の反映はキュー（`requestAnimationFrame`）で行われるため、最後の欄を直してそのまま次へを押すと、クリック時点の属性が 1 フレーム古いままです。

条件を実行時に評価する属性が 2 つあります。

### 入力欄に条件を宣言する（`data-validity`）

ネイティブ検証に相乗りする書き方です。エラーのバブル表示とフォーカス移動が付きます。

```html
<form data-bind='{"tel":"","mail":"","mail2":""}'>
  <!-- いずれか必須。グループの代表となる欄へ宣言する -->
  <input name="tel"
    data-validity="{{tel || mail}}"
    data-validity-message="電話番号かメールアドレスを入力してください">
  <input name="mail" type="email">

  <!-- 等値。確認欄へ宣言する -->
  <input name="mail2" type="email"
    data-validity="{{mail === mail2}}"
    data-validity-message="メールアドレスが一致しません">

  <button type="button"
    data-click-form
    data-click-validate
    data-click-fetch="/api/next">次へ</button>
</form>
```

`data-{event}-validate` と、対象フォームを決める `data-{event}-form`（値は省略可）が必要です。`setCustomValidity()` へ反映されるので CSS の `:invalid` でも装飾できます。

### 手続きに実行条件を付ける（`data-{event}-if`）

フォーム全体の条件や、ステップをまたぐ条件に向きます。条件が偽なら fetch もリダイレクトも実行されません。

```html
<button type="button"
  data-click-form
  data-click-if="{{power.length + gas.length > 0}}"
  data-click-fetch="/api/apply"
  data-click-redirect="/done">申込を確定する</button>

<p class="error" data-if="{{power.length + gas.length === 0}}">
  1 件以上選んでください
</p>
```

表示制御の `data-if` とは別物です。`data-if` は要素の表示、`data-{event}-if` は手続きの実行を決めます。メッセージは上のように `data-if` と併用してください。

### 気をつけること

- **`disabled` を押下のブロックに使わないでください。** 無効化されたボタンはクリックイベントを発火しないため、「直したのに押せない」状態は実行時の判定では救えません。合図として見せたいときは `data-attr-class` を使ってください。
- 条件は「収集値（入力欄の現在値）」を優先して評価されます。`data-if` で非表示になった欄は収集対象外なので、未入力として扱われます。
- 参照が解決できない条件（キー名の打ち間違いなど）は「満たしていない」と扱い、手続きを実行しません。警告ログにキー名が出ます。
- `data-{event}-if` が偽のときは静かに止まります。理由を伝えるメッセージは `data-if` で表示してください。

---

## 応答の値で遷移先やメッセージを決める

申込の確定のように「サーバーの返した内容によって次の画面が変わる」処理があります。`data-{event}-redirect` や `data-{event}-toast` は応答のバインドより**後**に実行されるため、属性の式はそのときのデータで評価されます。応答を式から参照できるよう、`data-{event}-bind` の対象を**ボタン自身か、その祖先**にしておくのがコツです。

```html
<!-- 応答の nextAction が pay なら決済ページ、それ以外は完了ページへ -->
<div id="state">
  <button type="button"
    data-click-form
    data-click-fetch="/api/apply"
    data-click-method="POST"
    data-click-bind="#state"
    data-click-toast="受付番号 {{no}} で受け付けました"
    data-click-redirect="{{nextAction === 'pay' ? redirectUrl : '/complete.html'}}"
  >申込を確定する</button>
</div>
```

同じ書き方で `data-{event}-dialog`（メッセージ）、`data-{event}-history`（履歴の URL）、`data-{event}-scroll`（スクロール先）にも応答の値を使えます。

### 気をつけること

- バインド先がボタンの**祖先でない**場合（兄弟要素など）は、応答が式のスコープに入らないため参照できません。バインド先を祖先にするか、ボタン自身を指してください。
- `data-{event}-bind` は既定で**全置換**です。遷移先の式が使っているキーが応答に無いと参照できなくなりますが、その場合は手続き開始時の値で遷移します（開発モードで警告が出ます）。キーを残したいときは `data-{event}-bind-merge` を使ってください。
- 参照が最初から解決できない式（キー名の打ち間違いなど）は「指定なし」として扱われ、遷移や表示は行われません。
- `data-store` の保存は遷移の前に完了しているため、受付番号を退避してから遷移する構成も属性だけで書けます。

---

## 行の中で候補から選択中の 1 件を引く

繰り返し行のそれぞれで候補を取得し、「選択したものの名称」を送信値や保存値として残したいことがあります。行の中で候補を取得する場合、**応答のバインド先はその式を書いた要素自身か祖先**でなければ参照できません。行全体で使うなら、行の内側のラッパへ `data-fetch-bind` で寄せます。

```html
<form data-form data-bind='{"rows":[{}]}'>
  <div data-form-list="rows" data-each="rows" data-each-arg="c" data-each-index="i">
    <div class="row">
      <!-- 応答のバインド先。行の内側のラッパなので行内のどの式からも見える -->
      <div id="row-body-{{i}}">
        <select name="area">…</select>

        <div data-fetch="{{c.area ? '/api/plans?area=' + c.area : null}}"
             data-fetch-arg="planCandidates"
             data-fetch-bind="#row-body-{{i}}">
          <select name="planId" data-each="planCandidates.content ?? []" data-each-arg="p">
            <option data-each-before value="">選択してください</option>
            <option value="{{p.id}}">{{p.planName}}</option>
          </select>
        </div>

        <!-- 選択中の 1 件の名称を hidden へ載せる（送信値・保存値として残る） -->
        <input type="hidden" name="planName"
               data-attr-value="{{haori.findBy(planCandidates.content ?? [], 'id', c.planId).planName}}">
      </div>
    </div>
  </div>
</form>
```

### 気をつけること

- **バインド先を fetch した要素のままにすると、兄弟要素の式からは参照できません。** `?? []` などで既定値を書いていると、エラーにならず既定値のまま表示され続けます。開発モードでは「別のスコープでは供給されている」旨の警告が出ます。
- **行要素自身をバインド先にしないでください。** `data-form-list` を併用したコンテナでは、行要素へのバインドは行データへの書き戻しになり、候補一覧そのものが収集値や保存値へ入ります。
- `data-attr-value` で値が決まる入力は、行の値反映で上書きされません。ただしバインディングデータ（`data-store` の保存内容）へ入るのは次の収集の時点です。送信値は収集時に入力欄から読み直すため、選択した直後の送信でも正しい値が送られます。
- 候補が届くまでは式が解決しないため、保存済みの値から復元した直後は行データの値が表示されます。候補が届いた後に評価結果へ切り替わります。

---

## 画面をまたいで入力を持ち回る（`data-store`）

複数画面にわたる申込フォームのように、入力を次の画面へ引き継ぎたいことがあります。`data-store` を宣言すると、バインドデータの指定キーがブラウザのストレージへ自動的に保存され、次の画面で自動的に復元されます。JavaScript は書きません。

### 保存と復元

`data-store` に保存場所の名前（ストレージキー）を指定し、`data-store-arg` または `data-store-params` で対象のキーを指定します。

```html
<!-- 1画面目: 入力を customer キーへ退避する -->
<form data-store="apply" data-store-arg="customer">
  <input name="name" placeholder="お名前">
  <input name="zip" placeholder="郵便番号">
</form>
<button data-click-redirect="/step2.html">次へ</button>
```

入力を確定した時点（フォーカスを外す、選択する）で保存されます。ボタン側に保存の宣言は要りません。

```html
<!-- 2画面目: 1画面目の入力が復元される -->
<div data-bind='{"customer":{}}' data-store="apply" data-store-params="customer">
  <p>お名前: {{customer.name}}</p>
</div>
```

復元された値は初期 `data-bind` と同じ扱いです。`data-if` の条件、`data-each` の配列、入力欄の初期値としてそのまま機能します。

```html
<!-- 復元した配列をそのまま行にできる -->
<div data-bind='{"contracts":[]}' data-store="apply" data-store-params="contracts">
  <div data-each="contracts">
    <p>{{no}}</p>
  </div>
</div>
```

### 入力欄へ戻すときはフォームに宣言する

保存されるのは、`data-store` を書いた要素**自身**のバインドデータです。フォームの入力値はフォーム要素自身に書き込まれるため、入力状態を保存したいときは `<form>` に宣言してください。

```html
<!-- OK: フォーム自身に宣言する -->
<form data-store="apply" data-store-arg="customer">
  <input name="name">
</form>

<!-- OK: data-form-arg のキーと同じ名前を指定する -->
<div data-bind='{"customer":{}}'>
  <form data-form-arg="customer" data-store="apply" data-store-params="customer">
    <input name="name">
  </form>
</div>

<!-- NG: 祖先に書いても入力値は保存されない（表示だけの用途になる） -->
<div data-bind='{"customer":{}}' data-store="apply" data-store-params="customer">
  <form><input name="name"></form>
</div>
```

### サーバー応答の一部を残す

バインド先の要素に `data-store` を宣言しておくと、フェッチ応答のうち必要なキーだけが保存されます。受付番号や確認済みフラグを次の画面へ渡すときに使います。

```html
<div id="state" data-bind='{"receipt":{}}'
  data-store="apply" data-store-params="receipt"></div>

<button
  data-click-fetch="/api/apply"
  data-click-form="#customerForm"
  data-click-bind="#state"
  data-click-bind-arg="receipt"
  data-click-redirect="/done.html"
>申込</button>
```

保存はバインドと同時に行われるため、同じクリックで画面遷移しても取りこぼしません。

### 送信本文を組み立てる

復元した状態はバインドデータに載っているので、`data-click-data` の JSON へ式で埋め込めます。ネストした本文も属性だけで作れます。

```html
<button
  data-click-fetch="/api/apply"
  data-click-data='{"customer":{{customer}},"contracts":{{contracts}}}'
>申込</button>
```

### 完了したら破棄する

`data-{event}-store-clear` でレコードを破棄します。復元は破棄より先に行われるため、保存した値を表示してから消せます。

```html
<html data-load-store-clear="apply">
  <body>
    <div data-bind='{"receipt":{}}' data-store="apply" data-store-params="receipt">
      <p>受付番号: {{receipt.no}}</p>
    </div>
  </body>
</html>
```

ボタンで破棄することもできます。

```html
<button data-click-store-clear="apply" data-click-redirect="/">最初から</button>
```

### 気をつけること

- 保存対象のキー（`data-store-params` か `data-store-arg`）は必須です。省略すると警告が出て無効になります（うっかり全部を保存しないための仕様です）。
- ファイル添付（`input[type=file]`）は復元できません。ファイル名だけが残るため、画面をまたいだら選び直しが必要です。
- `data-each` の行の中では使えません。行のデータは親要素側で配列のキーを指定して保存してください。
- 既定の保存先はタブを閉じると消える `session` です。`data-store-type="local"` にすると閉じても残るため、個人情報では避けてください。
- 保存先は同じサイトの他のスクリプトからも読めます。保存するキーは必要な範囲だけにしてください。
- 破棄する画面で対象キーを更新すると、レコードが作り直されます。破棄する画面では対象キーを触らない構成にしてください。
- 画面ごとに担当のキーだけを宣言すれば、他の画面が保存した内容は壊れません。

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

### `<title>` などページタイトルを実行時に変える

`<head>` も Haori のスキャン・監視対象です。`<title>` のテキストでも `{{}}` 補間が効くので、`<title>` 自身に `data-bind` / `data-fetch` を付ければ、会社名などを実行時に取得してタブのタイトルへ反映できます。

```html
<head>
  <!-- 応答 {"company":"..."} を <title> 自身にバインド -->
  <title data-fetch="/api/site">{{company}} - ログイン</title>
</head>
```

ネストしたキーで受けたいときは `data-fetch-arg` を使います。

```html
<title data-fetch="/api/site" data-fetch-arg="site">{{site.company}} - ログイン</title>
```

ポイントは次の通りです。

- スコープは **`<title>` 自身**に持たせます。`<meta data-bind>` のような**兄弟要素のスコープは `<title>` に継承されません**。
- 取得前の `{{company}}` は**未解決参照**として空文字になります。エラーにはならないため、`data-bind` でキーを宣言しておく必要はありません。
- `data-fetch-bind` や `data-click-copy` などの**対象セレクタは `<body>` 配下しか探さない**ため、別要素から `<head>` 内の `<title>` を狙ってバインドすることはできません。`<head>` への実行時バインドは必ず「対象要素自身に直接付与」してください。

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

### ファイルをアップロードする（`input[type=file]` + multipart）

`input[type=file]` で選択したファイルは、フォーム値として **File オブジェクトのまま**収集されます。`data-{event}-fetch-content-type="multipart/form-data"` と body を持つメソッド（POST 等）を組み合わせれば、JavaScript を書かずに送信できます。

```html
<form id="import-form">
  <input type="file" name="csvFile" accept=".csv">
  <input type="text" name="memo" placeholder="メモ">
</form>

<button
  data-click-form="#import-form"
  data-click-fetch="/api/customer-imports.json"
  data-click-fetch-method="POST"
  data-click-fetch-content-type="multipart/form-data"
  data-click-toast="取り込みを開始しました"
>
  決定
</button>
```

`multiple` を付けた場合は File の配列として収集され、同一キーの個別エントリとして送信されます。

```html
<input type="file" name="docs" multiple>
<!-- docs=1件目, docs=2件目, ... として送信される -->
```

選択の有無は式から判定できます（内部値には選択済みならファイル名、未選択なら `null` が入ります）。

未選択のうちは `csvFile` が未解決参照になりますが、`{{!csvFile}}` のような**判定する式は「無い＝偽」として結論が出る**ため、ボタンは初期状態で無効になります。`data-bind` による初期値の宣言は不要です。

```html
<form id="import-form">
  <input type="file" name="csvFile">
  <button data-click-form="#import-form"
          data-attr-disabled="{{!csvFile}}"
          data-click-fetch="/api/customer-imports.json"
          data-click-fetch-method="POST"
          data-click-fetch-content-type="multipart/form-data">決定</button>
</form>
```

> **注意**
>
> - `multipart/form-data` を指定しないと、ファイルは JSON では `{}`、クエリでは `[object File]` になり送信できません。この場合はコンソールに警告が出ます。
> - **ファイル入力は `data-form-object` / `data-form-list` コンテナの外（収集結果のトップレベル）に置いてください。** ネストした位置にあるファイルは JSON 文字列化されて送信できません（警告が出ます）。
> - `input[type=file]` はブラウザのセキュリティ制約により、任意の値を設定できません。バインドデータからの書き戻しは**クリアのみ**可能です（フォームのリセットで選択が解除されます）。

### 認証切れをログインページで知らせる（401 リダイレクト + メッセージ）

`data-unauthorized-redirect` は 401 応答時に即時リダイレクトします。「セッションが切れました」のようなメッセージを遷移先で出したい場合は、遷移先 URL に理由のクエリを埋め込み、ログインページ側で `data-url-param` と `data-if` で表示します。

```html
<!-- 保護されたページ -->
<body data-unauthorized-redirect="login.html?expired=1">
  ...
</body>
```

```html
<!-- login.html -->
<div data-url-param data-url-arg="params">
  <div data-if="params.expired" class="alert alert-warning" role="alert">
    セッションが切れました。再度ログインしてください。
  </div>

  <form>
    <!-- ログインフォーム -->
  </form>
</div>
```

> **`data-url-arg` を必ず付ける**
>
> - `data-url-arg` を省略すると `data-url-param` はバインドデータを**全置換**するため、同一要素の `data-bind` で書いた既定値が消えます。
> - `data-if="expired"` のようにクエリ名をトップレベルで直接参照しても、クエリが無ければ未解決参照として偽になるだけでエラーにはなりません。ただしキーの出所が分かりにくいため、`data-url-arg` 配下のプロパティ参照（`params.expired`）を推奨します。
>
> 詳細は「[URLパラメータをバインドする](#urlパラメータをバインドする)」を参照してください。

ログイン後に元のページへ戻したい場合は `data-unauthorized-redirect-return-param` を併用します。遷移先 URL に既存のクエリがあってもマージされるため、上記の `?expired=1` と同時に使えます。

```html
<body data-unauthorized-redirect="login.html?expired=1"
      data-unauthorized-redirect-return-param="return">
```

### フェッチの状態を画面に表示する（`data-fetch-state`）

`data-fetch` / `data-{event}-fetch` の進行状況（読み込み中・成功・失敗）を、画面個別の JavaScript を書かずに `data-if` や式から参照したいときは `data-fetch-state` を付けます。フェッチの状態が `_fetch` というキーで対象要素のバインディングデータに注入され、`data-if="_fetch.error"` のように宣言的に表示を出し分けられます。

`_fetch` の構造は次のとおりです。

| キー | 内容 |
|---|---|
| `_fetch.status` | `"loading"` / `"success"` / `"error"` のいずれか |
| `_fetch.loading` | 読み込み中なら `true` |
| `_fetch.success` | 成功なら `true` |
| `_fetch.error` | 失敗（HTTP エラー・ネットワーク断・タイムアウト）なら `true` |
| `_fetch.statusCode` | HTTP ステータスコード（取得できない場合は `null`） |
| `_fetch.message` | エラーメッセージ（HTTP の場合は `statusText`、ネットワーク断の場合は例外メッセージ。無い場合は `null`） |

```html
<!-- 取得先の領域自身に状態を注入する（値を省略すると自要素が対象） -->
<!-- _fetch はフェッチ前には存在しないが、未解決参照は正常系として扱われるため
     data-bind による宣言もオプショナルチェーンも要らない -->
<div data-fetch="/api/list" data-fetch-state>
  <!-- 読み込み中 -->
  <p data-if="_fetch.loading">読み込み中...</p>

  <!-- 失敗時はメッセージと再取得ボタンを表示 -->
  <div data-if="_fetch.error">
    <p>読み込みに失敗しました。再試行してください。</p>
    <!-- 同じ領域を再取得する（手動リトライ） -->
    <button data-click-fetch="/api/list">再取得</button>
  </div>

  <!-- 成功時 -->
  <ul data-if="_fetch.success" data-each="items">
    <li>{{name}}</li>
  </ul>
</div>
```

注入先は CSS セレクタで別要素を指定することもできます。状態表示用のパネルを取得領域の外に置きたい場合に使います。

```html
<div id="status">
  <p data-if="_fetch.loading">読み込み中...</p>
  <p data-if="_fetch.error">読み込みに失敗しました（{{_fetch.statusCode}}）。</p>
</div>
<div data-fetch="/api/list" data-fetch-state="#status" data-fetch-bind="#list"></div>
<ul id="list" data-each="items"><li>{{name}}</li></ul>
```

クリックなどのイベント起点のフェッチでは `data-{event}-fetch-state` を使います（例: `data-click-fetch-state`）。

> 補足:
> - `_fetch` はフェッチ後に注入されます。注入前の `_fetch.loading` などは未解決参照になるだけでエラーにはならないため、`data-bind` による宣言もオプショナルチェーンも不要です。
> - `_fetch` は表示制御のための内部状態で、`data-bind` 属性には書き出されません（送信ペイロードにも含まれません）。
> - 401/403 を認証ガードでリダイレクトする構成では、それらはこの仕組みの対象外です。500・ネットワーク断・タイムアウトなどクライアントに応答が返る失敗が `_fetch.error` になります。
> - 自動リトライは行いません。再取得は上記のように `data-click-fetch`（同じ URL）で手動導線を宣言してください。

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

### state の配列を追加・削除する（式 + `data-click-bind-merge`）

state に持った配列（編集中のルール一覧など）への要素追加・削除は、専用属性なしで**式と `data-click-bind-merge` の組み合わせ**で書けます。式はスプレッド `[...arr, x]` や `filter` を評価でき、`data-click-data` を **JSON 形式**で書けば配列値をそのまま渡せます（パラメータ形式だと配列が文字列化するため、配列・オブジェクト値は JSON 形式を使ってください）。`data-click-bind-merge` で対象キーだけをパッチするため、`editingIndex` など他の state は保持されます。

```html
<div id="state" data-bind='{"rules":[{"name":"A","displayOrder":10}],"editingIndex":null}'>
  <!-- 追加（push）: 既定値付きで末尾に1件足す -->
  <button type="button"
    data-click-data='{"rules": {{[...rules, {name:"", displayOrder:(rules.length+1)*10}]}} }'
    data-click-bind="#state" data-click-bind-merge>ルール追加</button>

  <!-- 削除（remove）: index 一致の行を除外（ruleI は data-each のインデックス想定） -->
  <ul data-each="rules" data-each-index="ruleI">
    <li>
      {{name}}
      <button type="button"
        data-click-data='{"rules": {{rules.filter((r, i) => i !== ruleI)}} }'
        data-click-bind="#state" data-click-bind-merge>削除</button>
    </li>
  </ul>
</div>
```

### state の配列とフォームを1つの payload にまとめて送信する

`data-click-form`（フォーム値）と `data-click-data`（インライン JSON）は**統合されて1つの送信ボディ**になります。これにより、別フォームの基本項目と state に持った配列を合成して送信できます。

```html
<form id="basic" data-bind='{"name":"","price":0}'>
  <input name="name"><input name="price" type="number">
</form>
<div data-bind='{"rules":[/* 編集中のルール配列 */],"id":"g1"}'>
  <button type="button"
    data-click-fetch="{{'../api/gas-plans/' + id + '.json'}}" data-click-fetch-method="PUT"
    data-click-form="#basic"
    data-click-data='{"rules": {{rules}} }'>保存</button>
</div>
```

送信ボディは `{ name, price, rules: [...] }` のように、フォーム値と `rules` が1つに統合されます。

### クリップボードへコピーする（`data-click-run` + `data-click-toast`）

クリップボードへのコピーは、独自のクリックハンドラを書かずに `data-click-run`（任意 JS 実行）で `navigator.clipboard.writeText(...)` を呼べます。コピー結果のフィードバックは `data-click-toast` で出すと、ボタン文言を一時的に差し替える（Haori の管理 DOM と競合しうる）必要がありません。

```html
<button type="button"
  data-click-run="navigator.clipboard.writeText('{{detail.id}}')"
  data-click-toast="コピーしました">
  <i class="bi bi-clipboard"></i> ID をコピー
</button>
```

- `navigator.clipboard` は**セキュアコンテキスト（https / localhost）でのみ**利用できます。
- **⚠️ セキュリティ**: `data-click-run` の `{{...}}` は実行コードへ結合されます。コピー対象は ID など**自分で管理する信頼値のみ**にしてください（API・ユーザー入力などの任意文字列は XSS リスク。詳細は前述の `data-click-run` の警告を参照）。

### 送信前にペイロードを加工する（`data-click-before-run`）

「フォームリストの空行を送信から除外する」といった**送信ボディの加工**は、`data-click-before-run` で行えます。`fetchOptions` を受け取り、加工した `fetchOptions` を返すと、その内容で送信されます。

```html
<button type="button"
  data-click-fetch="../api/demand-powers.json" data-click-fetch-method="POST"
  data-click-data='{"items": {{items}} }'
  data-click-before-run="const b=JSON.parse(fetchOptions.body); b.items=b.items.filter(r=>r.demandPowerKw!==''&&r.demandPowerKw!=null); return {fetchOptions:{...fetchOptions, body:JSON.stringify(b)}};"
  data-click-toast="保存しました。">保存</button>
```

`demandPowerKw` が空（空文字・null）の行を除外してから送信します。複数フィールドの条件も `filter` の条件式で自由に書けます。

### 入力欄クリックで外側のアクションを誤発火させない（`data-click-passive`）

クリック可能な要素（`data-click-*` を持つ行・パネルなど）の中に `input` / `select` を置くと、入力欄クリックが外側のアクションを発火させてしまうことがあります。入力欄を囲むコンテナに **`data-click-passive`** を付けると、その内側のクリックは外側へ伝播しません。

```html
<div data-click-fetch="/api/open" data-click-open="#dialog">
  <!-- この検索欄のクリックは上の data-click-fetch を発火しない -->
  <div class="search-condition-field" data-click-passive>
    <input name="keyword" />
    <select name="status">…</select>
  </div>
</div>
```

境界より内側に `data-click-*` を持つ要素（ボタン等）があれば、そちらは最近接優先で従来どおり発火します。

### フェッチ結果を変換してからバインドする（`data-click-bind-transform`）

取得したレスポンスを**バインド前に式変換**したいときは `data-click-bind-transform` を使います。式の中ではレスポンス全体を `response` として参照できます（`data-fetch-bind-transform` でも同様）。

```html
<!-- 既存プランのルールをコピー: 各要素の id を null にしてから rules キーへ入れる -->
<button type="button"
  data-click-fetch="{{'/api/plans/' + srcId + '/rules.json'}}"
  data-click-bind="#dialog-state"
  data-click-bind-arg="rules"
  data-click-bind-transform="response.map(item => ({...item, id: null}))">
  既存プランからコピー
</button>
```

`bind-arg` は対象自身の既存 binding を基底に該当キーだけを更新するため、`rules` 以外の状態（`editingRuleIndex` など）は保持されます。レスポンスをそのまま別キーへ入れたいだけなら `data-click-bind-transform` は不要で、`data-click-bind-arg` だけで実現できます。

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

## 一定間隔で処理を実行する（`data-poll-*`）

`data-poll-*` 属性を使うと、一定間隔でサーバへ問い合わせ続けられます。別端末や別プロセスでの操作完了を待って画面を進める「完了待ち」画面に向いています。

### 基本的な使い方

別端末で確認操作が完了したかを 5 秒間隔で問い合わせ、完了を検知したら画面を切り替える例です。15 分で打ち切ります。

```html
<div id="page-state" data-bind='{"approval":{}}'>
  <div
    data-poll-fetch="/api/approval-status.json"
    data-poll-data='{"approvalHash":"{{sms.approvalHash}}"}'
    data-poll-interval="5000"
    data-poll-timeout="900000"
    data-poll-until="{{approval.confirmed}}"
    data-poll-bind="#page-state"
    data-poll-bind-arg="approval"
    data-poll-bind-merge
    data-poll-state="#page-state"
  ></div>

  <div data-if="{{!approval.confirmed && !_poll.stopped}}">
    <p>別の端末で確認操作を行ってください。</p>
    <p>確認をお待ちしています…</p>
  </div>
  <div data-if="{{approval.confirmed}}">
    <p>確認が完了しました。</p>
  </div>
  <div data-if="{{_poll.timedOut}}">
    <p>時間内に確認が完了しませんでした。お手数ですが最初からやり直してください。</p>
  </div>
</div>
```

`data-poll-fetch` の取得結果は `data-poll-bind` でバインドされ、`data-poll-until` の条件が成立した時点でポーリングが停止します。取得・バインド・エラー表示の考え方は `data-click-*` と同じです。

**ポーリング要素はバインド先の内側に置いてください。** `data-poll-until` の式はその要素自身のバインドスコープで評価されるため、`data-poll-bind` の対象が祖先でないと `approval.confirmed` を参照できません。

### いつ止まるか

再開しない**恒久停止**は次の 4 つです。

- `data-poll-until` の条件が成立した
- `data-poll-timeout` に到達した
- `data-poll-error-limit` の連続失敗回数に達した
- 要素が DOM から外れた

条件が戻れば再開する**一時停止**は次の 2 つです。

- `data-if` で非表示になった（祖先が非表示になった場合も含む）
- `data-poll-disabled` が真になった

### `data-poll-*` の関連属性

#### `data-poll-interval`: 取得間隔

```html
<div data-poll-fetch="/api/status" data-poll-interval="5000"></div>
```

省略時は 5000 ミリ秒（5 秒）です。初回は間隔を待たずに即時実行し、2 回目以降は**前回の完了時点**から計測します。応答が間隔より遅い場合もリクエストは重なりません。

#### `data-poll-timeout`: 打ち切り時間

```html
<div data-poll-fetch="/api/status" data-poll-timeout="900000"></div>
```

開始からこの時間が経過したら停止します。省略時は無制限です。到達したことは `_poll.timedOut` または `haori:polltimeout` イベントで判定できます。

#### `data-poll-until`: 停止条件

```html
<div data-poll-fetch="/api/status" data-poll-until="{{approval.confirmed}}"></div>
```

条件が成立した時点で停止します。`{{...}}` を付けて指定してください。各リクエストの実行前とバインド反映後に評価するため、最初から条件が成立している場合は 1 回も通信しません。

#### `data-poll-error-limit`: 連続失敗で打ち切る

```html
<div data-poll-fetch="/api/status" data-poll-error-limit="3"></div>
```

省略時は失敗しても取得を続けます（回線の一時的な切断でポーリングが止まらないようにするため）。サーバ障害時に叩き続けたくない場合に指定してください。成功すると連続失敗回数は 0 に戻ります。

#### `data-poll-disabled`: 一時的に停止

```html
<div data-poll-fetch="/api/status" data-poll-disabled="{{!ready}}"></div>
```

真の間は実行しません。偽に戻れば次の周期から再開します。

#### `data-poll-state`: ポーリング状態を画面で使う

```html
<div id="page-state">
  <div data-poll-fetch="/api/status" data-poll-state="#page-state"></div>
  <p data-if="{{_poll.running}}">確認中…</p>
</div>
```

`_poll` として `running` / `paused` / `stopped` / `timedOut` / `stopReason` / `count` / `elapsedMs` が注入されます。値を省略すると自要素が対象で、CSS セレクタを指定すれば別要素へ注入できます。

**注入先は `_poll` を参照する要素の祖先にしてください。** 式は祖先方向へ辿って解決するため、値を省略して自要素へ注入すると、上の例の `<p>` のような兄弟要素からは参照できません。画面全体で使う場合は `data-poll-bind` と同じコンテナを指定するのが簡単です。

**`_poll` は初期表示の時点では存在しません。** `_fetch`（`data-fetch-state`）と同じく、注入前の `_poll.xxx` は未解決参照になるだけでエラーにはならないため、`data-bind` による宣言もオプショナルチェーンも不要です。

なお `false` はテキスト補間では空文字列になります。真偽の出し分けには `{{_poll.stopped}}` をそのまま表示するのではなく `data-if` を使ってください。

各リクエストの通信状態（`loading` / `success` / `error`）が必要な場合は `data-poll-fetch-state` を併用してください。

### 注意点

**バックグラウンドのタブでは指定した間隔が保証されません。** ブラウザが非表示タブのタイマーを抑制するためで、Chrome では数分後に 1 分あたり 1 回程度まで低下します。タブが表示に戻った時点で即時に取得し直す補正が入りますが、抑制中の検知遅延は避けられません。利用者が別のタブやアプリを見ている間に完了する可能性がある画面では、この遅延を前提に文言を設計してください。

`data-poll-confirm`、`data-poll-toast`、`data-poll-dialog`、`data-poll-history`、`data-poll-scroll` は間隔ごとに繰り返されるため使用を避けてください。`data-poll-redirect` は `data-poll-until` と組み合わせれば意図どおり動作します。

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
10. `data-click-row-add` / `data-click-row-remove`（`data-click-row-remove-empty`）/ `data-click-row-prev` / `data-click-row-next` - 行操作
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

行操作は `data-each` が参照している**配列そのもの**を書き換えます。DOM の行は再描画で追従するため、送信データと画面が食い違いません。

セレクタを指定すると、**行の外に置いたボタン**から末尾へ追加できます。行が 0 件のときも追加できるため、可変件数（0〜N 件）の入力に使えます。

```html
<button data-click-row-add="#list">行追加</button>
```

#### `data-click-row-remove`: 行を削除

```html
<button data-click-row-remove>この行を削除</button>
```

既定では**最後の 1 行は削除されません**。0 件まで削除したい場合は `data-click-row-remove-empty` を併用してください。

#### `data-click-row-remove-empty`: 0 件まで削除できるようにする

```html
<button data-click-row-remove data-click-row-remove-empty>この行を削除</button>
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

フォーム内に `data-each` で描いた選択肢がある場合、要素データがフォームの外側（祖先の `data-bind` など）にあれば、リセット後も選択肢は残り、選択状態だけが解除されます。`data-form-list` の複製行のようにフォーム自身のバインドデータから描いている行は、初期件数へ戻ります。

```html
<!-- 選択肢は #opts で取得し、フォーム内の <select> へ描く -->
<div id="opts" data-bind='{"plans":[]}'>
  <div data-fetch="/api/plans" data-fetch-bind="#opts" data-fetch-bind-arg="plans"></div>
  <form id="editForm">
    <select name="planIds" multiple data-each="plans" data-each-key="id" data-each-arg="p">
      <option value="{{p.id}}">{{p.name}}</option>
    </select>
  </form>
</div>

<!-- リセットしても選択肢は残る（選択だけ解除される） -->
<button data-click-reset-before="#editForm" data-click-open="#editDialog">
  新規追加
</button>
```

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
```

> `data-each` の描画完了を検知したい場合は、完了マーカー `data-each-done`
> （描画確定ごとに付与）や宣言フック `data-each-rendered-run` を利用してください。

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

### グローバル `Haori` の形

`<script src>` で読み込んだときのグローバル `Haori` は、`Haori` クラスそのものです。メッセージの付け外しなどのクラス API はそのまま呼び出せます。

```javascript
Haori.addErrorMessage(document.getElementById('tel'), '桁数が足りません')
Haori.clearMessages(document.getElementById('tel-field'))
```

`Core` や `Env` などのクラスは、同じグローバルのプロパティとして参照します。

```javascript
Haori.Core.dumpScope(element)
console.log(Haori.version)
```

`Haori.Haori` はグローバル自身への自己参照です。0.37.1 以前はグローバルがモジュールの名前空間オブジェクトだったため、クラス API を `Haori.Haori.addMessage(...)` と 2 段で取り出す必要がありました。その書き方も引き続き動作するため、既存のコードを直す必要はありません。

### 行ごとのイベント（rowadd / rowremove / rowmove）

`data-each` の差分更新では、リスト全体を 1 回で通知する `haori:eachupdate` に加えて、行ごとに `haori:rowadd` / `haori:rowremove` / `haori:rowmove` が発火します。いずれも**行要素**で発火し、伝播するため `data-each` コンテナや `document` でまとめて購読できます。

```javascript
listElement.addEventListener('haori:rowadd', (event) => {
  console.log('行が追加されました')
  console.log('キー:', event.detail.key)
  console.log('インデックス:', event.detail.index)
  console.log('データ:', event.detail.item)
  // event.target が追加された行要素。内容の描画は完了している。
})

listElement.addEventListener('haori:rowremove', (event) => {
  console.log('行が削除されました')
  console.log('キー:', event.detail.key)
  // 行が DOM から外れる前に発火するため、event.target をまだ参照できる。
})

listElement.addEventListener('haori:rowmove', (event) => {
  console.log(`行が移動: ${event.detail.from} → ${event.detail.to}`)
})
```

使い分けの目安は次のとおりです。

- リスト全体をまとめて扱いたい（描画完了の検知、件数表示の更新など）→ `haori:eachupdate`
- 行ごとに処理したい（行の要素を外部ライブラリへ渡す、行の消滅時に後片付けするなど）→ 行イベント

外部ライブラリの初期化が目的であれば、行イベントを自分で購読する代わりに `data-enhance` の宣言を使えます。新規行では `init`、描画確定では `refresh`、DOM から外れたときは `destroy` が自動で呼ばれます。

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

### 外部ライブラリを宣言で適用する（`data-enhance`）

DOM を走査して機能を付加する外部ライブラリは、`data-each` の行追加や `data-if` の再表示で DOM が入れ替わるたびに再適用が必要です。`data-enhance` を使うと、適用の契機・冪等性・インスタンスの保持を Haori が引き受けるため、画面ごとの JavaScript が不要になります。登録は 1 度だけです。

```javascript
// 登録スクリプト（画面ごとではなく、共通で 1 度だけ読み込む）
Haori.enhancers.register('choices', {
  init: element => new Choices(element, {removeItemButton: true}),
  refresh: (element, instance) => instance.refresh(),
  destroy: (element, instance) => instance.destroy(),
})
```

```html
<!-- 宣言はこれだけ。行が増えても、選択肢が再描画されても Haori が面倒を見る -->
<div data-external>
  <select
    name="planName"
    multiple
    data-enhance="choices"
    data-each="plans.content"
    data-each-key="id"
    data-each-arg="p"
  >
    <option value="{{p.planName}}">{{p.planName}}</option>
  </select>
</div>
```

呼ばれる契機は次のとおりです。

| 契機 | 呼び出し |
| ---- | -------- |
| 初期表示、後から追加された要素、`data-each` の新規行 | `init`（未適用の要素だけ） |
| `data-each` の描画確定、`data-if` の再表示 | `refresh`（未適用なら `init`） |
| 要素が DOM から外れたとき（行削除など） | `destroy` |

登録が後（外部ライブラリの読み込みが遅い場合など）でも、`register()` の時点で既に描画済みの要素へ遡って適用されるため、読み込み順を気にする必要はありません。

インスタンスの再同期が不要で、単にコンストラクタを呼べばよいライブラリは、登録なしの簡易形が使えます。値はドット区切りのグローバル参照だけを受け付け、対象要素を引数に渡します。

```html
<!-- 行が追加されるたびに、その行の要素で 1 度だけ new される -->
<div class="h-adr" data-enhance-new="YubinBango.MicroformatDom">
  <input type="text" class="p-postal-code" name="postalCode">
  <input type="text" class="p-region" name="region">
</div>
```

外部ライブラリが入力欄へ書き込んだ値（この例なら郵便番号から補完された住所）は、`change` を伴わなくても**そのまま収集・送信・保存されます**。値収集は画面の見たまま（DOM）を読むためで、補完のために画面へ JavaScript を戻す必要はありません。反映されるのは収集が走ったとき（送信時や他の欄の変更時）で、代入した瞬間ではありません。

### 気をつけること

- 適用は要素ごと・名前ごとに一度だけです。再描画で `init` は呼ばれません（再同期は `refresh` に書いてください）。
- 走査は宣言した要素の配下に限定されますが、引数を受け取らず自分で `document` 全体を走査するライブラリでは、Haori が保証できるのは呼び出し回数だけです。
- `data-enhance-new` には式やコードを書けません（属性値をコードとして実行しないためです）。対象のグローバルは Haori の初期表示より前に読み込んでください。
- 外部ライブラリが生成した DOM は `data-external` で監視対象から外してください。
- `init` の失敗はログに記録して先へ進みます。1 つの連携の失敗で画面が止まりません。

### select 拡張ライブラリ（Choices.js）との連携（`data-each-rendered-run` を使う書き方）

API から取得した選択肢を `data-each` で動的生成しつつ、検索可能なタグ型マルチセレクト（[Choices.js](https://github.com/Choices-js/Choices) など。MIT ライセンス）で表示するレシピです。任意の select 拡張ライブラリへ一般化できます。

ポイントは次の 3 点です。

- **`data-external`**: Choices.js は元の `<select>` を隠して独自 DOM を生成・随時更新します。外側コンテナに `data-external` を付け、その生成 DOM を Haori の自動監視から除外します（`data-each` による `<option>` 生成は監視除外下でも維持されます）。
- **`data-each-rendered-run`**: `data-each` で `<option>` を再生成した後、Choices.js を再同期する必要があります。描画確定ごとに一度だけ実行されるこのフックで `refresh()` を呼びます。
- **`<select multiple>` の配列値**: Choices.js での選択は native `<select>` を更新して `change` を発火するため、Haori は選択値を**配列**としてフォーム値に取り込みます。
- **空の初回描画では初期化しない**: 選択肢を `data-fetch` 等で非同期取得する場合、fetch 完了前の空 `<option>` 状態でも `data-each-rendered-run` は発火します。この時点で Choices.js を初期化すると、空の `<select>` を取り込んでしまい、後から選択肢を描画しても「No choices」のままになることがあります。初回初期化は `selectEl.options.length > 0` を確認してから行ってください。

```html
<!-- option は data-each で配列バインド、外部DOMは監視除外、描画確定で refresh -->
<div data-external>
  <select
    name="electricPlanName"
    multiple
    data-each="electricPlans.content"
    data-each-key="id"
    data-each-arg="ep"
    data-each-rendered-run="window.__choicesRefresh(this)"
  >
    <option value="{{ ep.planName }}">{{ ep.planName }}</option>
  </select>
</div>
```

```javascript
// select 要素ごとに Choices インスタンスを保持し、再同期できるようにする
const choicesMap = new WeakMap()

window.__choicesRefresh = (selectEl) => {
  let choices = choicesMap.get(selectEl)
  if (!choices) {
    // fetch 完了前の空描画では初期化しない（空のまま取り込むと「No choices」が固定化するため）
    if (selectEl.options.length === 0) return
    // 選択肢が揃った最初の描画で初期化（生成 DOM は data-external 配下なので Haori は無視する）
    choices = new Choices(selectEl, {removeItemButton: true})
    choicesMap.set(selectEl, choices)
  } else {
    // data-each による option 再生成後に Choices 側の表示を作り直す
    choices.refresh()
  }
}
```

選択結果は `electricPlanName` の配列として、`data-click-form` などの送信値に反映されます（例: `{"electricPlanName": ["プランA", "プランB"]}`）。

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
