# Haori.js 利用ガイド

バージョン: 1.0.0

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
  <script src="https://cdn.jsdelivr.net/npm/haori@1.0.0/dist/haori.iife.js"></script>
</head>
<body>
  <!-- ここにコンテンツを書く -->
</body>
</html>
```

これだけで準備完了です！JavaScriptを書く必要はありません。

### npmでインストール（プロジェクトで使う場合）

```bash
npm install haori
```

```javascript
import Haori from 'haori'
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

---

## リストの表示と繰り返し

`data-each`属性を使うと、配列のデータを自動的に繰り返し表示できます。

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

---

## フォームとデータの双方向バインディング

フォームの入力内容を自動的にデータに反映できます。

### 基本的なフォーム

**記述するHTML**:
```html
<form data-bind='{"username":"","email":""}'>
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
- フォームの`name`属性と`data-bind`のキー名が対応しています

### チェックボックスとラジオボタン

```html
<form data-bind='{"agree":false,"plan":""}'>
  <!-- チェックボックス -->
  <label>
    <input type="checkbox" name="agree">
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

### セレクトボックス

```html
<form data-bind='{"country":""}'>
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
<form data-bind='{"price":1000,"quantity":3,"total":3000}'>
  <label>
    単価:
    <input type="number" name="price" value="{{price}}">
  </label>
  <label>
    数量:
    <input type="number" name="quantity" value="{{quantity}}">
  </label>
  <label>
    合計（送信されない）:
    <input type="number" name="total" value="{{total}}" data-form-detach readonly>
  </label>
</form>
```

フォームデータを取得すると、`total`は除外され、`{"price":1000,"quantity":3}`のみが取得されます。

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

#### 実用例: 共通ヘッダー・フッター

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>マイページ</title>
  <script src="https://cdn.jsdelivr.net/npm/haori@1.0.0/dist/haori.iife.js"></script>
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
```

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

#### `data-fetch-arg`: データをネストするキー名を指定

```html
<div data-fetch="/api/user" data-fetch-arg="user">
  <!-- データが {"name":"田中","email":"..."} の場合 -->
  <!-- user.name, user.email としてアクセスできる -->
  <p>{{user.name}}</p>
  <p>{{user.email}}</p>
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

---

## ボタンクリックで処理を実行する

`data-click-*`属性を使うと、ボタンクリック時の処理を定義できます。

**注意**: `data-click-*`の代わりに`data-change-*`（フォーム要素の変更時）、`data-load-*`（要素のロード時）も使えます。

### 処理の実行順序

イベント属性は以下の順序で実行されます：

1. `data-click-validate` - バリデーション
2. `data-click-confirm` - 確認ダイアログ
3. `data-click-data` / `data-click-form` - データ取得
4. `data-click-before-run` - 前処理スクリプト
5. `data-click-fetch` - サーバー通信
6. `data-click-after-run` - 後処理スクリプト
7. `data-click-bind` - データバインド
8. `data-click-adjust` - 値の増減
9. `data-click-row-add` / `data-click-row-remove` / `data-click-row-prev` / `data-click-row-next` - 行操作
10. `data-click-reset` - リセット
11. `data-click-refetch` - 再フェッチ
12. `data-click-click` - 別要素のクリック
13. `data-click-open` / `data-click-close` - ダイアログ操作
14. `data-click-dialog` / `data-click-toast` - メッセージ表示
15. `data-click-redirect` - リダイレクト

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
    data-click-method="POST"
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
  data-click-method="DELETE"
>
  削除
</button>
```

#### `data-click-data`: 送信データを指定

```html
<button
  data-click-fetch="/api/update"
  data-click-method="POST"
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
    data-click-method="POST"
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
  data-click-method="POST"
  data-click-dialog="保存が完了しました"
>
  保存
</button>
```

#### `data-click-toast`: トースト通知表示

```html
<button
  data-click-fetch="/api/save"
  data-click-method="POST"
  data-click-toast="保存しました"
>
  保存
</button>
```

トーストは3秒間表示されます。

#### `data-click-redirect`: リダイレクト

```html
<button
  data-click-fetch="/api/complete"
  data-click-method="POST"
  data-click-redirect="/success"
>
  完了
</button>
```

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
  <script src="https://cdn.jsdelivr.net/npm/haori@1.0.0/dist/haori.iife.js"></script>
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
          data-click-method="POST"
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
            data-click-method="DELETE"
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
  <script src="https://cdn.jsdelivr.net/npm/haori@1.0.0/dist/haori.iife.js"></script>
</head>
<body>
  <div>
    <h1>ユーザー検索</h1>

    <!-- 検索フォーム -->
    <form id="searchForm" data-bind='{"keyword":""}'>
      <input type="text" name="keyword" placeholder="名前で検索">
      <button
        data-click-fetch="/api/users/search"
        data-click-method="GET"
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
  <script src="https://cdn.jsdelivr.net/npm/haori@1.0.0/dist/haori.iife.js"></script>
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
              <input type="number" name="quantity" value="{{quantity}}" min="1">
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
        data-click-method="POST"
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

// リセット
await Form.reset(formFragment)
```

### ユーティリティメソッド

```javascript
import Haori from 'haori'

// ダイアログ表示
await Haori.dialog('処理が完了しました')

// トースト通知（3秒表示）
await Haori.toast('保存しました', 'info')     // info（青）
await Haori.toast('警告メッセージ', 'warning') // warning（黄）
await Haori.toast('エラー発生', 'error')       // error（赤）

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

```javascript
listElement.addEventListener('haori:eachupdate', (event) => {
  console.log('追加されたキー:', event.detail.added)
  console.log('削除されたキー:', event.detail.removed)
  console.log('最終的な順序:', event.detail.order)
})

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
