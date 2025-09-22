# 第1章：はじめに - Haori-JSとは

## 1.1 Haori-JS の概要

**Haori-JS（ハオリ・ジェイエス）** は、HTML に特定の属性を追加するだけで、\*\*動的な UI（ユーザーインターフェース）\*\*を構築できる軽量ライブラリです。
JavaScript を記述することなく、`data-bind` 属性や `{{.}}` プレースホルダを利用して、**データの表示**、**フォームとの連動**、**条件による表示切替**、**繰り返し表示**などが実現できます。

> Haori の名前は、「既存の HTML に羽織るだけで機能が追加される」ことをイメージしています。

---

## 1.2 特徴

Haori-JS は次のような特徴を持っています：

- **HTML だけで UI が完結**
  JavaScript の記述は不要で、HTML 属性と簡単な構文だけで動的な UI が作れます。

- **軽量・最小構成で導入可能**
  ライブラリ自体が非常に軽く、1 行の `<script>` 追加で導入できます。

- **宣言的でわかりやすい**
  `{{message}}` のように、書いた通りに表示される直感的な構文です。

- **既存 HTML に組み込みやすい**
  完全な置き換えではなく、「必要なところだけに追加」することができます。

---

## 1.3 対象読者

この仕様書は、次のような方を対象にしています：

- HTML はわかるが、JavaScript やフレームワークにはまだ抵抗がある方
- テンプレートエンジンや React/Vue などの学習コストが高いと感じている方
- UI フレームワークに依存せず、シンプルに動く仕組みを求めている方
- ノーコード／ローコード開発を補助する HTML ベースの仕組みを探している方

---

## 1.4 Haori-JS でできること

Haori-JS を使えば、次のような UI を HTML だけで構築できます：

- データの表示とリアルタイムな更新
- 条件に応じた要素の表示・非表示
- 配列データの繰り返し展開
- フォームとの双方向バインディング（入力と出力の同期）
- ボタンを押して非同期にデータを取得・表示
- スクロールに応じた追加データの読み込み
- 外部 HTML の読み込みとコンポーネント化
- ダイアログやメッセージの表示制御

これらは、JavaScript の記述を一切せずに実現できます。

---

## 1.5 Haori-JS の記述例

以下は、Haori-JS の基本的な仕組みを体験できる最小構成のサンプルです。

### HTML記述例

```html
<form data-bind='{"message": "こんにちは"}'>
  <input type="text" name="message" />
  <p>{{message}}</p>
</form>
```

### 最終的なHTML構造

```html
<form data-bind='{"message": "こんにちは"}'>
  <input type="text" name="message" value="こんにちは" />
  <p>こんにちは</p>
</form>
```

### 表示結果

- 入力欄に「こんにちは」と表示されている
- 下の `<p>` にも「こんにちは」と表示
- 入力欄の文字を変更すると、下の表示もリアルタイムに更新される

> これが、Haori-JS による「データと UI の自動同期」です。

---

## 1.6 次章からの内容

次章では、Haori-JS の使い方を実際に体験しながら学んでいきます。
Haori-JS を HTML に組み込む方法と、最小構成での記述例から始めましょう。

本書のすべてのサンプルには以下を併記しています：

- **HTML記述例**
- **最終的なHTML構造**
- **表示結果**
- （通信がある場合は）**送信データ・受信データ**

---

# 第2章：Haori-JS の使い方（導入と基本構成）

この章では、Haori-JS を実際に HTML に導入して動かす方法を説明します。
必要な準備から、動作確認できる最小サンプル、書き方の基本スタイルまでを紹介します。

---

## 2.1 Haori の導入方法

Haori-JS は JavaScript ライブラリとして提供されており、HTML にスクリプトを 1 行追加するだけで使用できます。

### CDN 経由での読み込み（推奨）

以下のように `<head>` または `<body>` の末尾にスクリプトタグを追加します。

**HTML 記述例：**

```html
<script src="https://cdn.example.com/haori.min.js"></script>
```

※ インターネット接続がない場合はローカルに配置しても構いません。

---

## 2.2 最小構成のサンプル

まずは、Haori の基本動作を体験できる最小構成のサンプルを見てみましょう。

### HTML 記述例：

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Haori 入門</title>
    <script src="https://cdn.example.com/haori.min.js"></script>
  </head>
  <body>
    <form data-bind='{"message": "こんにちは"}'>
      <input type="text" name="message" />
      <p>{{message}}</p>
    </form>
  </body>
</html>
```

### 最終的な HTML 構造：

```html
<form data-bind='{"message": "こんにちは"}'>
  <input type="text" name="message" value="こんにちは" />
  <p>こんにちは</p>
</form>
```

### 表示結果：

- 「こんにちは」と書かれた入力欄
- その下に「こんにちは」と表示
- 入力欄に文字を打ち変えると、下の表示もリアルタイムで更新される

---

## 2.3 属性の書き方と基本ルール

Haori-JS は、次のような方針に従って HTML に属性を書くことで動作します。

| 条件                    | 内容                                                     |
| ----------------------- | -------------------------------------------------------- |
| 1. スクリプトの読み込み | `<script src="...haori.min.js">` を含めること            |
| 2. HTML 構文の正しさ    | `<html>` ～ `</html>` までの正しい構成が必要             |
| 3. JavaScript 不要      | ユーザーが JavaScript を書く必要はない（属性だけで動作） |

---

## 2.4 サンプルの構成スタイル

この仕様書では、以降のすべてのサンプルにおいて以下の形式で内容を提示します：

- **HTML 記述例**：実際に書く HTML コード
- **最終的な HTML 構造**：Haori が処理した後の DOM 構造
- **表示結果**：画面上でどのように見えるか、何が起こるか

この構成によって、どのようなマークアップがどのように変化するかを視覚的に理解しやすくしています。

---

## 2.5 より大きなサンプル（オプション）

以下は、`data-bind` で複数の項目を扱う例です。

### HTML 記述例：

```html
<form
  data-bind='{"user": {"name": "山田", "email": "test@example.com"}}'
  data-form-arg="user"
>
  <input name="name" placeholder="名前" />
  <input name="email" placeholder="メールアドレス" />
  <p>入力された名前：{{name}}</p>
  <p>入力されたメール：{{email}}</p>
</form>
```

### 最終的な HTML 構造：

```html
<form
  data-bind='{"user": {"name": "山田", "email": "test@example.com"}}'
  data-form-arg="user"
>
  <input name="name" placeholder="名前" value="山田" />
  <input name="email" placeholder="メールアドレス" value="test@example.com" />
  <p>入力された名前：山田</p>
  <p>入力されたメール：test@example.com</p>
</form>
```

### 表示結果：

- 入力欄には初期値「山田」「[test@example.com](mailto:test@example.com)」が表示される
- 入力を変更すると下の表示内容も連動して変化する

---

# 第3章：プレースホルダとバインディング

この章では、Haori の中心機能である**プレースホルダ構文（`{{}}`）**と、データとの**バインディング**の仕組みを解説します。
HTML の中にデータを埋め込む方法、ネストや式の評価、属性への展開、再評価のタイミング、エラー処理まで、基本から応用まで扱います。

---

## 3.1 プレースホルダの基本

`{{key}}` の形式で、`data-bind` に指定されたデータをそのままテキストとして表示できます。

### HTML記述例

```html
<div data-bind='{"name": "花子"}'>
  <p>{{name}}</p>
</div>
```

### 最終的なHTML構造

```html
<div data-bind='{"name": "花子"}'>
  <p>花子</p>
</div>
```

### 表示結果

```
花子
```

> ※ `{{}}` のように中身が空のプレースホルダは評価できないため使用禁止です。

---

## 3.2 ネストされたキーの参照

ドット記法により、オブジェクト内の値も参照可能です。

### HTML記述例

```html
<div data-bind='{"user": {"name": "佐藤", "job": "エンジニア"}}'>
  <p>{{user.name}}（{{user.job}}）</p>
</div>
```

### 最終的なHTML構造

```html
<div data-bind='{"user": {"name": "佐藤", "job": "エンジニア"}}'>
  <p>佐藤（エンジニア）</p>
</div>
```

### 表示結果

```
佐藤（エンジニア）
```

---

## 3.3 スコープの継承と上書き

親子関係のある `data-bind` が存在する場合、**スコープは親子でマージされ**ます。
このとき、親と子で同じキーが存在する場合は、**子の値が優先されます**。

さらに、同一キーにオブジェクトが設定されている場合でも、**プロパティ単位でのマージは行われず**、**子のオブジェクトで完全に上書きされます**。

---

### HTML記述例

```html
<div data-bind='{"user": {"name": "佐藤", "age": 30}}'>
  <section data-bind='{"user": {"name": "田中"}}'>
    <p>{{user.name}}（{{user.age}}歳）</p>
  </section>
</div>
```

---

### 最終的なHTML構造

```html
<div data-bind='{"user": {"name": "佐藤", "age": 30}}'>
  <section data-bind='{"user": {"name": "田中"}}'>
    <p>田中（歳）</p>
  </section>
</div>
```

---

### 表示結果

```
田中（歳）
```

> ※ `user.age` はスコープに存在しないため `undefined` となり、空文字列として表示されます。

---

このように、子スコープの `data-bind` に同じキー（ここでは `user`）が含まれていると、**親の内容は無視され、完全に置き換えられる**点に注意してください。
オブジェクトの中身がマージされるわけではありません。

---

## 3.4 式としての評価

`{{}}` の中では、JavaScript の簡易的な式が使用できます。三項演算子や文字列連結なども可能です。

### HTML記述例

```html
<div data-bind='{"name": "高橋", "isAdmin": true}'>
  <p>{{isAdmin ? name + "（管理者）" : name}}</p>
</div>
```

### 表示結果

```
高橋（管理者）
```

> ※ `this`, `window`, `eval` などの危険な識別子はセキュリティ上使用できません。

---

## 3.5 属性への展開

プレースホルダは属性値の中でも使用できます。

```html
<button class="btn btn-{{type}}">送信</button>
```

このような場合、`type = "primary"` であれば `class="btn btn-primary"` に展開されます。

- `null` や `undefined`、`NaN` を評価した場合は空文字 `""` に置き換えられます。
- 複数のプレースホルダを含む属性値も、それぞれの評価結果を結合して展開されます。

属性の値が単一のプレースホルダのみで構成され、そのプレースホルダの評価値が false、 undefined、 null、 Nan のいずれかの場合は属性名ごと除去されます。

### HTML記述例

```html
<div data-bind='{"button": {"active": true}}'>
  <button disabled="{{!button.active}}">決定</buttion>
</div>
```

---

### 最終的なHTML構造

```html
<div data-bind='{"button": {"active": true}}'>
  <button>決定</buttion>
</div>
```

---

## 3.6 プレースホルダの再評価タイミング

以下のいずれかの条件で再評価が行われます：

- 自身または親の `data-bind` の値が変更されたとき
- `data-if` によって非表示→表示に変化したとき
- `data-each` によって DOM が再生成されたとき

> プレースホルダの依存トラッキング（特定のキーの変化だけで再評価）などは行われず、**スコープ単位で一括再評価**されます。

---

## 3.7 `data-bind` の構文エラー処理

`data-bind` の値が不正な JSON の場合（例：`{name: '山田'}` など）、Haori は自動的に空のオブジェクト `{}` を代替として使用します。
このとき：

- スコープは正常に生成されます（ただし評価対象は空）
- 開発者モードでは `console.warn` にエラーメッセージが表示されます
- `{{name}}` などの評価式は `null` となり、空文字として表示されます

---

## 3.8 禁止事項と注意点

- `{{}}`（空のプレースホルダ）は使用禁止
- `data-each` に文字列配列を直接バインドし、`{{}}` で表示する構文も禁止（非オブジェクト形式）

---

この章では、Haori-JS のプレースホルダとバインディングの基本、および再評価の仕組み・エラー処理について説明しました。
次章では `data-if` や `data-each` を使った表示制御と繰り返しについて解説します。

---

# 第4章：条件分岐とループ

Haori-JS では、`data-if` や `data-each` といった属性を使って、表示する要素を動的に制御することができます。たとえば、条件によって表示・非表示を切り替えたり、配列の内容をもとに要素を繰り返し表示したりすることができます。

本章では、こうした属性の使い方や挙動について、実例を交えて詳しく解説します。

---

## 4.1 `data-if` による条件分岐表示

### 基本的な使い方

`data-if` 属性を使うと、指定された条件式が false と評価された場合に、対応する要素を非表示にすることができます。評価式は JavaScript の構文に準じて記述します。

```html
<div data-bind='{"visible": true}'>
  <div data-if="visible">表示される内容です</div>
</div>
```

この例では、`visible` の値が `true` であるため、「表示される内容です」というテキストが表示されます。

---

### 非表示になる条件

`data-if` の式が次のいずれかの値と評価された場合、その要素は非表示となります：

- `false`
- `0`
- `""`（空文字）
- `null`
- `undefined`
- `NaN`

これらの値はすべて JavaScript において「false とみなされる値」です。

---

### 非表示になるとどうなるか

式が false に評価されると、対象の要素は **非表示状態（`display: none`）** になります。
このとき、要素内にあった子要素やテキストノードはすべて削除され、要素の内部は空になります。

```html
<div data-bind='{"visible": false}'>
  <div data-if="visible">この内容は表示されません</div>
</div>
```

#### 最終的なHTML構造

```html
<div data-bind='{"visible": false}'>
  <div data-if="visible" data-if-false style="display: none;"></div>
</div>
```

#### 表示結果

画面上には何も表示されません。

---

### 条件が true に戻った場合

`data-if` の式が true に変化すると、非表示となっていた要素の内部が復元され、再び表示されます。
復元される内容は、最新の状態に基づいて再描画されます。

---

### 自動で付与される属性：`data-if-false`

式が false に評価された要素には、次の属性が自動で付与されます：

- `data-if-false`（値なし）
- `style="display: none;"`（元の表示状態を保持）

これにより、要素が非表示であることが明示され、条件が変化したときに再表示される仕組みが構成されています。

---

### 再評価のタイミング

以下のような操作により `data-if` の式が再評価され、表示状態が更新されます：

- 自身または親要素の `data-bind` の値が変更されたとき
- 通信（`data-fetch` など）によってデータが更新されたとき

---

### 注意点

- `data-if` が false のとき、要素の内部（子ノード）は削除されますが、要素本体は残り、画面には表示されません。
- 非表示状態の要素では、プレースホルダや属性の評価、イベント処理などは実行されません。
- `data-if` と `data-each` を同時に指定した場合、`data-if` の評価が false であれば `data-each` の繰り返し処理は行われません。

---

### 補足：非表示でも実行される処理について

`data-if` によって要素が非表示となっている場合、その要素では通常、評価や処理は行われません。
ただし一部の属性（たとえば `data-fetch`）では、**表示状態に関係なく処理を実行させる指定**が可能です。

> フェッチ処理を非表示状態でも実行したい場合は、`data-fetch-force` を使用できます。
> 詳しくは第6章「通信を使ってデータを取得する」を参照してください。

---

このように、`data-if` は表示状態を安全かつ動的に切り替えるための基本的な制御手段です。
次の節では、配列データを用いた繰り返し表示を実現する `data-each` について説明します。

---

## 4.2 繰り返し表示：`data-each`

`data-each` 属性は、配列データをもとに **子要素を複製して表示**するための属性です。
`data-each` 自体が付いた要素は繰り返されず、**その中の子要素が複製されます**。

複製された各要素には自動的に `data-row`（または `hor-row`）が付与され、独立した `data-bind` が設定されます。

---

### 使用例：オブジェクトの配列を表示

**HTML 記述例：**

```html
<div data-bind='{"fruits": [{"name": "りんご"}, {"name": "ばなな"}]}'>
  <div data-each="fruits">
    <p>{{name}}</p>
  </div>
</div>
```

**最終的な HTML 構造：**

```html
<div data-bind='{"fruits": [{"name": "りんご"}, {"name": "ばなな"}]}'>
  <div data-each="fruits">
    <p data-row data-bind='{"name": "りんご"}'>りんご</p>
    <p data-row data-bind='{"name": "ばなな"}'>ばなな</p>
  </div>
</div>
```

**表示結果：**

```
りんご
ばなな
```

---

### 注意：文字列配列と空の `{{}}` は使用禁止

以下のような使い方は無効です：

```html
<!-- 使用禁止 -->
<div data-bind='{"items": ["A", "B"]}'>
  <div data-each="items">
    <p>{{}}</p>
  </div>
</div>
```

理由：

- `{{}}` は空式で評価できない
- `"A"` や `"B"` はオブジェクトでないため、バインドできない

---

### 正しい書き方：`data-each-arg` を使う

**HTML 記述例：**

```html
<div data-bind='{"items": ["A", "B"]}'>
  <div data-each="items" data-each-arg="item">
    <p>{{item}}</p>
  </div>
</div>
```

**最終的な HTML 構造：**

```html
<div data-bind='{"items": ["A", "B"]}'>
  <div data-each="items" data-each-arg="item">
    <p data-row data-bind='{"item": "A"}'>A</p>
    <p data-row data-bind='{"item": "B"}'>B</p>
  </div>
</div>
```

**表示結果：**

```
A
B
```

---

## 4.3 インデックスの取得：`data-each-index`

行ごとの **インデックス番号（0 から始まる）** を取得したい場合は、`data-each-index` を使います。

**HTML 記述例：**

```html
<div data-bind='{"colors": [{"name": "赤"}, {"name": "青"}]}'>
  <div data-each="colors" data-each-arg="c" data-each-index="i">
    <p>{{c.i}}: {{c.name}}</p>
  </div>
</div>
```

**最終的な HTML 構造：**

```html
<div data-bind='{"colors": [{"name": "赤"}, {"name": "青"}]}'>
  <div data-each="colors" data-each-arg="c" data-each-index="i">
    <p data-row data-bind='{"c": {"i": 0, "name": "赤"}}'>0: 赤</p>
    <p data-row data-bind='{"c": {"i": 1, "name": "青"}}'>1: 青</p>
  </div>
</div>
```

**表示結果：**

```
0: 赤
1: 青
```

---

## 4.4 `data-each` 内でのスコープの継承と上書き

`data-each` による繰り返し表示では、各行が独立したスコープとして扱われますが、親の `data-bind` の値もスコープとして継承されます。

ただし、同じキーにオブジェクトが含まれる場合は、**親スコープとマージせず、子スコープの値で上書き**されます。

### オブジェクトが上書きされる例

```html
<div
  data-bind='{"user": {"name": "佐藤", "role": "管理者"}, "list": [{"user": {"name": "田中"}}]}'
>
  <div data-each="list" data-each-arg="row">
    <p>{{row.user.name}}</p>
    <!-- → "田中" -->
    <p>{{row.user.role}}</p>
    <!-- → undefined -->
  </div>
</div>
```

### オブジェクトでない値は継承される例

```html
<div data-bind='{"role": "管理者", "list": [{"name": "田中"}]}'>
  <div data-each="list" data-each-arg="row">
    <p>{{row.name}}</p>
    <!-- → "田中" -->
    <p>{{role}}</p>
    <!-- → "管理者"（親スコープから継承） -->
  </div>
</div>
```

> `data-each` により生成された `data-row` 内では、行ごとのデータ（`data-bind`）がスコープとして優先され、親のスコープは必要に応じて補完的に参照されます。

---

## 4.5 繰り返しの前後に 1 回だけ表示する要素

`data-each-before` / `data-each-after` を使うと、繰り返しの **前後に 1 回だけ表示される固定要素** を記述できます。

**HTML 記述例：**

```html
<div data-bind='{"list": [{"name": "A"}, {"name": "B"}]}' data-each="list">
  <p data-each-before>一覧</p>
  <p>{{name}}</p>
  <p data-each-after>以上</p>
</div>
```

**最終的な HTML 構造：**

```html
<div data-bind='{"list": [{"name": "A"}, {"name": "B"}]}' data-each="list">
  <p data-each-before>一覧</p>
  <p data-row data-bind='{"name": "A"}'>A</p>
  <p data-row data-bind='{"name": "B"}'>B</p>
  <p data-each-after>以上</p>
</div>
```

**表示結果：**

```
一覧
A
B
以上
```

---

## 4.6 差分パッチと `data-each-key` の指定

Haori では、`data-each` によって繰り返し表示された行に対し、**差分比較による最小限の再描画**を行う最適化が導入されています。

この最適化のために、識別子として `data-each-key` 属性を指定することができます。

**使用例：**

```html
<div data-each="items" data-each-key="id">
  <p>{{name}}</p>
</div>
```

#### 差分判定の仕様：

| 条件                           | 差分比較方法                                     |
| ------------------------------ | ------------------------------------------------ |
| `data-each-key` を指定した場合 | 指定されたキー（例：`id`）の値による識別         |
| 指定がない場合                 | 各行の `data-bind` の内容（JSON 構造）による比較 |

- `data-each-key` がない場合でも、構造が完全に一致していれば再描画は抑制されます。
- `data-bind` の比較は、オブジェクトの**順序に依存しない構造比較**が行われます。
- 差分が検出された行のみが更新・再構築され、それ以外は再利用されます。

> この仕組みにより、数百件のリストでも高速に再描画が可能です。更新頻度の高いリストでは `data-each-key` の指定が強く推奨されます。

#### `data-row` へのキー値の自動付与

`data-each-key` が指定されている場合、各行に自動的に付与される `data-row` 属性には、**そのキーの値が属性値としてセットされます**。

#### 使用例：

```html
<div data-each="items" data-each-key="id">
  <p>{{name}}</p>
</div>
```

データ：

```json
{
  "items": [
    {"id": 101, "name": "りんご"},
    {"id": 102, "name": "ばなな"}
  ]
}
```

最終的な HTML 構造：

```html
<div data-each="items" data-each-key="id">
  <p data-row="101" data-bind='{"id":101,"name":"りんご"}'>りんご</p>
  <p data-row="102" data-bind='{"id":102,"name":"ばなな"}'>ばなな</p>
</div>
```

> これにより、各行のキー値が DOM 上で明示され、JavaScript からの参照やデバッグが容易になります。

- キー値は文字列としてそのまま `data-row="..."` に設定されます。
- `data-each-key` を指定しない場合は、従来通り `data-row` は属性名のみ（値なし）として付与されます。

---

## 4.7 属性の併用について

`data-if`, `data-each`, `data-bind` は **同じ要素に同時に指定可能**です。

ただし、`data-if` の評価が false の場合は、**`data-each` は評価されません**。
つまり、表示条件が満たされなければ、繰り返し表示はスキップされます。

---

この章では、`data-if` と `data-each` の基本から応用までを学びました。
次章では、入力フォームとの連携方法を扱い、バインドされたデータの編集・送信について解説していきます。

---

# 第5章：入力フォームとの連携

Haori では、HTML フォームとデータオブジェクトを双方向に結びつけることで、ユーザーの入力に応じて UI を即時に更新したり、外部データの値をそのままフォームに表示することが可能です。

---

## 5.1 双方向バインディングの仕組み

Haori では、`form` 要素に `data-bind` を設定し、内部の `input` / `select` / `textarea` などに `name` 属性を指定することで、**データとフォームの内容が自動的に同期**されます。

- 入力欄の値を変更すると `data-bind` の値が更新されます。
- `data-bind` の値が更新されると、フォームの表示内容も即座に再設定されます。

このように、Haori ではフォームとデータが双方向に連動して動作します。

---

### HTML 記述例

```html
<form data-bind='{"message": "こんにちは"}'>
  <input type="text" name="message" />
  <p>{{message}}</p>
</form>
```

---

### 最終的な HTML 構造

```html
<form data-bind='{"message": "こんにちは"}'>
  <input type="text" name="message" value="こんにちは" />
  <p>こんにちは</p>
</form>
```

---

### 表示結果

- 入力欄に「こんにちは」と表示される。
- 入力内容を変更すると、下の `<p>` の表示も更新される。

> **補足**：`value="こんにちは"` は実際には **DOM プロパティ（`element.value`）** によって設定されています。HTML 上では `value` 属性が存在しなくても、ブラウザの表示では正しく反映されます。

---

### DOMプロパティによる値の制御

Haori-JS では、フォーム要素の値の設定・取得はすべて **DOMのプロパティ**（`value`, `checked`, `selectedIndex` など）を通じて行われます。
HTML 属性（例：`value="..."`, `checked`）は初期化のために使用されますが、Haori の処理中には再利用されません。

| 要素タイプ                | 使用する DOM プロパティ          |
| ------------------------- | -------------------------------- |
| `<input type="text">`     | `.value`                         |
| `<textarea>`              | `.value`（※内容＝`textContent`） |
| `<input type="checkbox">` | `.checked`                       |
| `<input type="radio">`    | `.checked`                       |
| `<select>`                | `.value`, `.selectedIndex`       |

> 特に `<textarea>` は `value` 属性を使用できず、初期値はタグの中身（`textContent`）で決まります。Haori は `.value` を使用して値の同期を行います。

---

### スコープの分離と `data-form-arg`

`data-form-arg` を使用すると、フォーム入力値の格納先をバインドデータ内の特定のキーに限定できます。
このとき、フォームの中ではそのキー以下のスコープが自動的に適用されます。

#### NG 例（評価されない）

```html
<form data-form-arg="user">
  <input name="email" />
  <p>{{email}}</p>
  <!-- 評価されない -->
</form>
```

#### OK 例（正しく評価される）

```html
<form data-form-arg="user">
  <input name="email" />
  <p>{{user.email}}</p>
</form>
```

> `data-form-arg` により、フォームの `data-bind` は `{ user: { email: "..." } }` という構造になります。

---

### スコープ継承とキーの上書き

Haori では、`form` 要素の中にさらに `data-bind` が存在する場合、**親スコープが継承されます**。
ただし、同じキーが子スコープにも存在する場合は、常に子の値が優先されます。

| 条件             | スコープの扱い             |
| ---------------- | -------------------------- |
| 同名キーがある   | 子スコープが上書きする     |
| オブジェクトでも | 親とはマージせず完全上書き |

> この仕様は `data-each` などのスコープでも共通です。

---

この節では、フォームと `data-bind` の間で自動的に同期が行われる仕組みと、DOMプロパティによる正しい値の制御方法について説明しました。
次節では、より複雑なオブジェクトの構造に対応するための `data-form-object` について解説します。

---

## 5.2 `data-form-object` でネスト構造に対応する

複数のフォーム入力値を 1 つのオブジェクトにまとめたい場合は、`data-form-object` を使用します。

### HTML 記述例

```html
<form
  data-bind='{"user": {"name": "山田太郎","email": "test@example.com"}}'
  data-form-object="user"
>
  <label>名前：<input name="name" /></label>
  <label>メール：<input name="email" /></label>
</form>
```

### 最終的な HTML 構造

```html
<form
  data-bind='{"user": {"name": "山田太郎","email": "test@example.com"}}'
  data-form-object="user"
>
  <label>名前：<input name="name" value="山田太郎" /></label>
  <label>メール：<input name="email" value="test@example.com" /></label>
</form>
```

### 表示結果

```
名前：[山田太郎]
メール：[test@example.com]
```

> ※ 送信時は `{"user":{"name":"...","email":"..."}}` の形式になります。
> ※ `data-form-object` の対象となるすべての入力要素の `.value` が空文字列である場合、そのオブジェクトは送信時に除外されます。

---

## 5.3 `data-list` による行バインディング

`data-list` 属性によって繰り返し描画される要素は、フォームとの双方向バインディングにおいて、配列としてマッピングされます。

### 特徴

- 行内に含まれる `input` や `select` などのフォーム要素は、`name` 属性に基づいてオブジェクト形式でバインディングされます。
- 各行の `data-bind` は、その行に対応する配列要素の内容（オブジェクト）になります。

---

### HTML 記述例

```html
<form data-bind='{"list":[{"id":1,"name":"山田"},{"id":2,"name":"佐藤"}]}'>
  <div data-each="list" data-list="list">
    <div>
      <input name="id" />
      <input name="name" />
    </div>
  </div>
</form>
```

---

### 最終的な HTML 構造

```html
<form data-bind='{"list":[{"id":1,"name":"山田"},{"id":2,"name":"佐藤"}]}'>
  <div data-each="list" data-list="list">
    <div data-row data-bind='{"id":1,"name":"山田"}'>
      <input name="id" value="1" />
      <input name="name" value="山田" />
    </div>
    <div data-row data-bind='{"id":2,"name":"佐藤"}'>
      <input name="id" value="2" />
      <input name="name" value="佐藤" />
    </div>
  </div>
</form>
```

---

### 表示結果

```
[1] [山田]
[2] [佐藤]
```

---

### 備考

- `data-row` は明示的に記述する必要はありません。`data-each` によって複製された行に自動で付与されます。
- `data-each-key` を指定している場合は、`data-row="keyの値"` のようにキー値が属性値として付与されます。
- `data-row` のある要素は、`data-row-remove` などの行操作にも使用されます。

---

### 空の `data-form-object` や `data-row` も除外される

- `data-form-object` 配下にあるすべての入力項目が空である場合、そのオブジェクトは `data-bind` の結果に含まれません。
- `data-row` により繰り返される各行についても、行内のすべての入力項目が空であれば、その行は配列から削除されます。

#### 例：

```html
<form data-bind='{"items":[{"name":"りんご"}]}'>
  <div data-each="items">
    <div data-row>
      <input name="name" />
    </div>
  </div>
</form>
```

このとき、ユーザーが「りんご」の行の入力を空にした状態で送信すると、`data-bind` は次のようになります：

```json
{
  "items": []
}
```

---

このように、空の値は意図的に省略されることで、送信されるデータを簡潔に保つことができます。

---

以下は、空行の削除を反映した上で再表示した「第5.4節 `data-row-*` 系属性の一覧と使い方」の全文です。

---

## 5.4 `data-row-*` 系属性の一覧と使い方

`data-each` によって繰り返し描画される各行（`data-row`）には、追加・削除・並び替えなどを行うための補助的な属性が用意されています。これらは `data-row-*` 系属性と呼ばれ、主にボタンなどの操作要素に設定して使用します。

### 属性一覧

| 属性名               | 機能概要                                                    |
| -------------------- | ----------------------------------------------------------- |
| `data-row-add`       | 行を1件追加します。通常は直前の行の内容をコピーします。     |
| `data-row-remove`    | 該当の行を削除します。行が1件のみの場合はリセットされます。 |
| `data-row-move-up`   | 該当の行を1つ上に移動します。                               |
| `data-row-move-down` | 該当の行を1つ下に移動します。                               |

### 使用例（`data-row-add`）

#### HTML記述例

```html
<form data-bind='{"items":[{"name":"りんご"}]}' data-each="items">
  <div data-row>
    <input name="name" />
    <button data-row-add>追加</button>
  </div>
</form>
```

#### 最終的なHTML構造（追加ボタン押下後）

```html
<form data-bind='{"items":[{"name":"りんご"}]}' data-each="items">
  <div data-row data-bind='{"name":"りんご"}'>
    <input name="name" value="りんご" />
    <button data-row-add>追加</button>
  </div>
  <div data-row data-bind="{}">
    <input name="name" value="" />
    <button data-row-add>追加</button>
  </div>
</form>
```

※ 空の値の行は data-bind に反映されません。

#### 表示結果

```
[りんご] [追加]
[      ] [追加]
```

### 使用例（`data-row-move-up`, `data-row-move-down`）

#### HTML記述例

```html
<form data-bind='{"items":[{"name":"A"},{"name":"B"}]}' data-each="items">
  <div data-row>
    <input name="name" />
    <button data-row-move-up>↑</button>
    <button data-row-move-down>↓</button>
  </div>
</form>
```

#### 表示結果（「B」の行で↑を押下）

```
[B] [↑] [↓]
[A] [↑] [↓]
```

※ 上下の行が入れ替わります。DOMの順序だけでなく `data-bind` の配列順も更新されます。

### 注意点

- いずれの属性も、**フォーム要素内かつ `data-row` 配下で使用する必要があります**。
- `data-row-add` により追加された行は、直前の行の構造をもとにテンプレートが生成されます。
- `data-row-remove` の動作詳細については、次節（5.5）を参照してください。
- `data-row` は、これらの属性が正しく動作するための目印として必要です。

---

## 5.5 行削除とリセットの仕様（data-row-remove）

行が1つしか存在しない場合、`data-row-remove` は行を削除せず、各入力項目をリセットします。
リセット時には、各入力要素の初期HTMLに記述された `value` / `checked` / `selected` が復元値として使用されます。

### HTML 記述例

```html
<div data-bind='{"list":[{"text":"A"}]}' data-each="list">
  <div>
    <input name="text" value="A" />
    <button data-row-remove>削除</button>
  </div>
</div>
```

### 最終的な HTML 構造（1 行のみ削除時）

```html
<div data-each="list">
  <div data-row data-bind='{"text":""}'>
    <input name="text" value="" />
    <button data-row-remove>削除</button>
  </div>
</div>
```

### 表示結果

```
[     ] [削除]
```

> 初期の `value` 属性がある場合は、その値に戻ります。なければ空欄になります。

---

## 5.6 入力エラーと `data-message` の表示

Haori はエラー時に `data-message` 属性を自動で付与します。
この属性だけでは画面に表示されないため、**CSS や JavaScript での補助表示が必要です**。

### HTML 記述例

```html
<form>
  <label>メール：<input name="email" /></label>
  <div class="error" data-message></div>
</form>
```

### 最終的な HTML 構造（エラー発生時）

```html
<form>
  <label>メール：<input name="email" /></label>
  <div class="error" data-message="メールアドレスが不正です">
    メールアドレスが不正です
  </div>
</form>
```

### 表示結果

```
メール：[           ]
[メールアドレスが不正です]
```

#### CSS 表示例

```css
.error[data-message]::before {
  content: attr(data-message);
  color: red;
  display: block;
}
```

---

## 5.7 フォームリセットの仕様（data-click-reset / data-change-reset）

`data-click-reset` や `data-change-reset` を指定すると、対象のエレメントや `<form>` は通常のリセット動作になります。

### 主な仕様

- `value`、`checked`、`selected` などのプロパティが **初期状態に戻る**
- `data-message` 属性が自動で削除される

### HTML 記述例

```html
<form>
  <input name="email" value="default@example.com" data-message="不正な入力" />
  <button type="button" data-click-reset>リセット</button>
</form>
```

### 最終的な HTML 構造（リセット後）

```html
<form>
  <input name="email" value="default@example.com" />
  <button type="button" data-click-reset>リセット</button>
</form>
```

### 表示結果

```
[email: default@example.com]
[リセット]
```

> `data-message` は削除され、入力値も初期値に戻ります。

---

必要に応じて、この章に索引や参照リンク（例：12 章の行操作）を加えることも可能です。続きを進めたい場合はお知らせください。

---

## 5.8 `data-each` による行の複製と入力値の構造化

Haori で `data-each` を使って配列を扱う場合、繰り返し要素は `data-row` 属性が自動付与され、**その 1 行ごとがオブジェクトとして扱われます**。

### HTML 記述例

```html
<form data-bind='{"items": []}' data-each="items">
  <div data-row>
    <input name="key1" />
    <input name="key2" />
  </div>
</form>
```

### 最終的な HTML 構造（入力値が追加されたと想定）

```html
<form data-bind='{"items": [...]}' data-each="items">
  <div data-row data-bind='{"key1":"a","key2":"b"}'>
    <input name="key1" value="a" />
    <input name="key2" value="b" />
  </div>
  <div data-row data-bind='{"key1":"x","key2":"y"}'>
    <input name="key1" value="x" />
    <input name="key2" value="y" />
  </div>
</form>
```

### 表示結果（バインドデータ）

```json
{
  "items": [
    {"key1": "a", "key2": "b"},
    {"key1": "x", "key2": "y"}
  ]
}
```

---

## 5.9 チェックボックスの同期

Haori では `checkbox` も双方向バインディング可能です。チェック状態は HTML の `checked` 属性ではなく、**DOM の `checked` プロパティ**で制御されます。

### HTML 記述例

```html
<form data-bind='{"agree": true}'>
  <input type="checkbox" name="agree" value="true" /> 同意する
</form>
```

### 最終的な HTML 構造

```html
<form data-bind='{"agree": true}'>
  <input type="checkbox" name="agree" value="true" checked />
</form>
```

### 表示結果

- チェック済みで表示される。
- チェックを外すと `agree` が `false` に更新される。

> **注意**：`checked` は属性ではなく、JavaScript により `element.checked = true` と設定されており、HTML には現れない場合もあります。

---

## 5.10 ラジオボタンの同期

複数のラジオボタンで 1 つの値を選ばせたい場合も、`name` と `value` によって正しくバインドされます。

### HTML 記述例

```html
<form data-bind='{"plan": "pro"}'>
  <input type="radio" name="plan" value="free" /> 無料
  <input type="radio" name="plan" value="pro" /> 有料
</form>
```

### 最終的な HTML 構造

```html
<form data-bind='{"plan": "pro"}'>
  <input type="radio" name="plan" value="free" />
  <input type="radio" name="plan" value="pro" checked />
</form>
```

---

## 5.11 `data-form-detach` による同期の無効化

特定の入力要素だけ、初期値の自動設定を防ぎたい場合は `data-form-detach` を使用します。

### HTML 記述例

```html
<form data-bind='{"token": "abc123"}'>
  <input type="hidden" name="token" data-form-detach />
</form>
```

### 最終的な HTML 構造

```html
<form data-bind="{}">
  <input type="hidden" name="token" data-form-detach />
</form>
```

### 表示結果

- `token` の初期値は設定されない。
- ただしユーザーが値を設定すれば、送信時には `token` に反映される。

---

## 5.12 テキストエリアを配列として扱う：`data-form-lines`

Haori では `<textarea>` に `data-form-lines` を付けることで、改行区切りの配列として扱うことができます。

### HTML 記述例

```html
<form data-bind='{"tags": ["本", "旅行", "音楽"]}'>
  <textarea name="tags" data-form-lines></textarea>
</form>
```

### 最終的な HTML 構造

```html
<form data-bind='{"tags": ["本", "旅行", "音楽"]}'>
  <textarea name="tags" data-form-lines>
本
旅行
音楽</textarea
  >
</form>
```

### 表示結果

- 各行が配列の要素として扱われる。
- 編集して「映画\n 写真」とすれば、`tags = ["映画", "写真"]` に更新される。

---

## 5.13 入力変更時の再評価とループ防止

Haori では、フォーム要素の値が変化すると、同一 `form` 要素の `data-bind` が更新され、それに依存する UI が自動再評価されます。

ただし、**再評価によるループを防ぐため、トリガーとなった要素自身は再評価の対象から除外されます。**

---

# 第6章：通信を使ってデータを取得する

Haori では、HTML に属性を追加するだけで、サーバーとの通信（フェッチ）を行い、取得したデータを画面に反映できます。フォームと組み合わせることで、検索機能や無限スクロールにも対応可能です。

この章では、`data-fetch` 系属性の使い方と挙動、通信メソッドや送信形式の指定方法、送信パラメータの構築ルールまでを含めて解説します。

---

## 6.1 ページ表示時にデータを取得する：`data-fetch`

### HTML 記述例

```html
<div data-fetch="/api/profile">
  <p>{{name}}</p>
  <p>{{email}}</p>
</div>
```

### レスポンスの JSON

```json
{
  "name": "田中一郎",
  "email": "ichiro@example.com"
}
```

### 最終的な HTML 構造

```html
<div
  data-fetch="/api/profile"
  data-bind='{"name":"田中一郎","email":"ichiro@example.com"}'
>
  <p>田中一郎</p>
  <p>ichiro@example.com</p>
</div>
```

### 表示結果

```
田中一郎
ichiro@example.com
```

### 通信前処理

対象のフォームが指定されている場合、通信開始時にそのフォーム内のすべての要素から `data-message` 属性が削除されます。
これにより、以前のエラー表示がクリアされ、再送信時の表示がリセットされます。

### data-fetch-force

#### 属性の意味

`data-fetch-force` は、対象の要素が `data-if` によって非表示状態（`data-if-false` が付与されている）であっても、**強制的にフェッチ処理を実行する**ための属性です。

#### 使用例

```html
<div data-if="false">
  <div data-fetch="/api/info" data-fetch-force>
    <!-- 非表示状態だが通信は行われる -->
  </div>
</div>
```

#### 挙動

- 通常、要素が `data-if` によって非表示（`data-if-false` 付き）になっている場合、その要素ではフェッチ処理（`data-fetch`、`data-click-fetch` など）は実行されません。
- しかし、`data-fetch-force` が付与されている場合は、**表示状態に関係なくフェッチが実行されます**。
- フェッチ結果は、対象要素の `data-bind` に反映され、`data-if` が再評価されることもあります。

#### 注意点

- DOM に非表示のままでもフェッチが走るため、画面に直接表示されない場合があります。
- 通信後に `data-if` の条件が true に変わると、要素が再挿入され、フェッチ結果が反映された状態で表示されます。

---

## 6.2 フォームの値を使って取得する：`data-fetch-form`

### HTML 記述例

```html
<form data-bind='{"id": 1}'>
  <button data-fetch="/api/detail.json" data-fetch-form>取得</button>
  <p>{{name}}</p>
</form>
```

### 送信パラメータ（GET）

```
/api/detail.json?id=1
```

### レスポンスの JSON

```json
{
  "name": "佐藤"
}
```

### 最終的な HTML 構造

```html
<form data-bind='{"id": 1}'>
  <button
    data-fetch="/api/detail.json"
    data-fetch-form
    data-bind='{"name":"佐藤"}'
  >
    取得
  </button>
  <p>{{name}}</p>
</form>
```

### 表示結果

```
佐藤
```

---

## 6.3 データを一覧で取得する：`data-fetch-arg` + `data-each`

### HTML 記述例

```html
<div data-fetch="/api/items" data-fetch-arg="items" data-each="items">
  <p>{{name}}</p>
</div>
```

### レスポンスの JSON

```json
{
  "items": [{"name": "りんご"}, {"name": "みかん"}, {"name": "ぶどう"}]
}
```

### 最終的な HTML 構造

```html
<div
  data-fetch="/api/items"
  data-fetch-arg="items"
  data-each="items"
  data-bind='{"items":[{"name":"りんご"},{"name":"みかん"},{"name":"ぶどう"}]}'
>
  <p data-row data-bind='{"name":"りんご"}'>りんご</p>
  <p data-row data-bind='{"name":"みかん"}'>みかん</p>
  <p data-row data-bind='{"name":"ぶどう"}'>ぶどう</p>
</div>
```

### 表示結果

```
りんご
みかん
ぶどう
```

---

## 6.4 バインド先を指定する：`data-fetch-bind`, `data-fetch-bind-arg`

### HTML 記述例

```html
<form id="target" data-bind='{"id": 1}'></form>

<button
  data-fetch="/api/user.json"
  data-fetch-bind="#target"
  data-fetch-bind-arg="user"
>
  詳細を取得
</button>
```

### レスポンスの JSON

```json
{"name": "加藤"}
```

### 最終的な HTML 構造

```html
<form id="target" data-bind='{"id":1,"user":{"name":"加藤"}}'></form>

<button
  data-fetch="/api/user.json"
  data-fetch-bind="#target"
  data-fetch-bind-arg="user"
>
  詳細を取得
</button>
```

### data-fetch-bind-arg

#### 属性の意味

`data-fetch-bind-arg` は、`data-fetch-bind` と組み合わせて使用し、**バインド先の要素の `data-bind` の一部キーだけを更新する**ための属性です。

#### 使用例

```html
<!-- 通信結果全体を items に代入する -->
<div id="target" data-bind='{"items": []}'>...</div>

<!-- ボタン押下時に通信し、target の items に結果を反映 -->
<button
  data-click-fetch="/api/items"
  data-fetch-bind="#target"
  data-fetch-bind-arg="items"
  data-click-form
>
  データ取得
</button>
```

#### 挙動

- `data-fetch-bind` が指定された場合、通信結果（JSON）は、その対象要素の `data-bind` に反映されます。
- `data-fetch-bind-arg` が指定されている場合は、通信結果がそのキーにのみ代入されます。
  - 例：通信結果が `[{"id":1},{"id":2}]`、`data-fetch-bind-arg="items"` の場合は：

    ```js
    target.dataBind.items = [{id: 1}, {id: 2}];
    ```

#### 注意点

- `data-fetch-bind-arg` を指定しない場合、通信結果全体が `data-bind` に置き換わります。
- `data-fetch-bind` に複数の要素が一致する場合、最初の1つだけが対象になります。
- `data-fetch-bind-arg` に指定する値は、JavaScript のオブジェクトキーとして解釈されます（ドット記法や配列添字などはサポートしません）。

---

## 6.5 特定キーにバインドする：`data-fetch-bind-arg`

`data-fetch-bind-arg` を使うと、フェッチで取得したデータをバインド対象の **特定のキー** の中に格納できます。
これは `data-fetch-bind` と組み合わせて使用します。

これにより、既存の `data-bind` に複数のデータがある場合でも、**フェッチ結果を特定のキーに限定して挿入**できます。

---

### HTML 記述例

```html
<div data-bind='{"user": {}}'>
  <button
    data-fetch="/api/profile"
    data-fetch-bind="[data-bind]"
    data-fetch-bind-arg="user"
  >
    読み込み
  </button>

  <p>{{user.name}}</p>
  <p>{{user.email}}</p>
</div>
```

---

### フェッチレスポンス（例）

```json
{
  "name": "田中一郎",
  "email": "ichiro@example.com"
}
```

---

### 最終的な HTML 構造

```html
<div data-bind='{"user": {"name": "田中一郎", "email": "ichiro@example.com"}}'>
  <button
    data-fetch="/api/profile"
    data-fetch-bind="[data-bind]"
    data-fetch-bind-arg="user"
    data-bind='{"name": "田中一郎", "email": "ichiro@example.com"}'
  >
    読み込み
  </button>

  <p>田中一郎</p>
  <p>ichiro@example.com</p>
</div>
```

---

### 表示結果

```
田中一郎
ichiro@example.com
```

---

> `data-fetch-bind-arg="user"` により、レスポンス全体が `user` キーの下に格納されます。
> これにより、他のキーや状態を保持したまま、部分的にフェッチで更新する構成が可能になります。

---

## 6.6 非表示の要素でも取得する：`data-fetch-force`

### HTML 記述例

```html
<div data-if="false" data-fetch="/api/data.json" data-fetch-force>
  <p>{{value}}</p>
</div>
```

### レスポンスの JSON

```json
{
  "value": "この要素は非表示ですが通信されます"
}
```

### 最終的な HTML 構造

```html
<!-- data-if-false により削除されるため、DOM上には存在しない -->
```

### 表示結果

なし（非表示だが通信は実行され、データは `data-bind` に反映される）

---

## 6.7 スクロールに応じて取得する：`data-scroll-fetch`

### HTML 記述例

```html
<form id="searchForm" data-form-arg="query">
  <input type="text" name="keyword" value="果物" />
  <input type="hidden" name="page" value="1" id="page" />
</form>

<div
  id="resultList"
  data-scroll-fetch="/api/load"
  data-scroll-fetch-key="page"
  data-scroll-fetch-step="1"
  data-fetch-form="#searchForm"
  data-fetch-arg="items"
  data-each="items"
>
  <div>{{name}}</div>
</div>
```

### レスポンスの JSON（2 ページ目）

```json
{
  "items": [{"name": "マンゴー"}, {"name": "パイナップル"}]
}
```

### 表示結果

```
マンゴー
パイナップル
```

---

## 6.8 通信メソッドと送信形式の仕様

### 通信メソッドのデフォルト

- `data-fetch-method` / `data-click-method` を省略した場合、**GET**が使用されます。

### 送信形式のルール

| メソッド | パラメータの送信先 | Content-Type（デフォルト） |
| -------- | ------------------ | -------------------------- |
| GET      | URL のクエリ文字列 | なし（クエリ）             |
| POST     | リクエストボディ   | `application/json`         |
| PUT      | リクエストボディ   | `application/json`         |
| DELETE   | リクエストボディ   | `application/json`         |

### Content-Type の変更

- `data-fetch-content-type` / `data-click-content-type` を指定すると、送信形式を変更できます。
  その場合、リクエストパラメータは Content-Type に応じたデータ形式になります。
  - 例：`application/x-www-form-urlencoded`

---

## 6.9 ヘッダーの追加：`data-fetch-headers`

### HTML 記述例

```html
<div
  data-fetch="/api/submit"
  data-fetch-method="POST"
  data-fetch-content-type="application/json"
  data-fetch-headers='{"X-Token": "abc123"}'
  data-bind='{"score": 95}'
></div>
```

### リクエスト内容

- メソッド：POST
- Content-Type：application/json
- ヘッダー：`X-Token: abc123`
- ボディ：`{"score":95}`

---

## 6.10 フォームバインドとリクエスト構築の仕様

- `data-fetch-form` がある場合、その要素が属する `<form>` の `data-bind` の内容が送信されます。
- `data-fetch-form` の属性値を省略した場合、**先祖の `<form>` 要素が自動的に対象**となります。
- GET の場合は `data-bind` の内容が URL クエリに変換され、POST の場合はボディに入ります。
- `data-fetch-arg` によってレスポンスから指定キーを抽出し、`data-each` と組み合わせてリスト展開できます。

---

## 6.11 通信エラー時の挙動

- 通信に失敗した場合、その要素の `data-bind` は更新されず、表示は変化しません。
- より高度なエラー処理（例：`haori:fetch-error` でメッセージを出すなど）は**第 15 章「イベントとフック機構」**で解説します。

---

この章では、Haori の通信機能とフェッチ属性の使い方を体系的に学びました。
次章では、これらをボタン操作やフォームイベントと組み合わせて、より動的な UI を構築する方法を学びます。

---

## 6.12 バリデーションチェック：`data-fetch-validate`

`data-fetch-validate` を使用すると、フェッチ通信を実行する前に、**HTML 標準の入力バリデーション**を実行させることができます。
これにより、`required` や `type="email"` などの属性による入力制限を適用し、**不正な値のまま送信されることを防止**できます。

---

### 属性の役割

| 属性名                | 型             | 説明                                                                                                 |
| --------------------- | -------------- | ---------------------------------------------------------------------------------------------------- |
| `data-fetch-validate` | なしまたは任意 | この属性が指定されている場合、フェッチ送信前にバリデーションを実行します。失敗時は通信を行いません。 |

> この属性は `data-fetch`、`data-click-fetch`、`data-change-fetch` のいずれにも適用できます。

---

### バリデーション対象のフォーム

バリデーションを行うフォーム要素は以下のルールで決定されます：

1. `data-fetch-form` が指定されている場合：そのセレクタに一致する `<form>` 要素
2. 指定が省略されている場合：該当のボタンや要素の **親要素の中で最も近い `<form>`**

---

### HTML記述例

```html
<form id="searchForm">
  <input name="email" type="email" required />
</form>

<button
  data-fetch="/api/search"
  data-fetch-form="#searchForm"
  data-fetch-validate
>
  送信
</button>
```

---

### 最終的なHTML構造

```html
<form id="searchForm">
  <input name="email" type="email" required />
</form>

<button
  data-fetch="/api/search"
  data-fetch-form="#searchForm"
  data-fetch-validate
>
  送信
</button>
```

---

### 表示結果・動作結果

- 入力が空欄や不正な形式である場合：通信はキャンセルされ、ブラウザの標準エラーメッセージが表示されます。
- 入力が正しい形式であれば、通常どおりフェッチ通信が実行されます。

---

### 対応するHTMLバリデーション（例）

- `required`
- `type=email`, `type=number`, `type=url`
- `min`, `max`
- `pattern`
- `maxlength`, `minlength`

> これらはブラウザの `form.checkValidity()` および `form.reportValidity()` を使用して評価されます。

---

### 注意点

- バリデーションに失敗すると、Haoriは**通信イベントを一切発生させません**。
- JavaScriptによる追加バリデーションや独自のエラー表示は、Haoriの外側で制御する必要があります。

---

# 第7章：ボタン操作で UI を動かす

この章では、Haori の `data-click-*` や `data-change-*` 属性を使って、ユーザー操作に応じて画面を動かす方法を学びます。
JavaScript の記述なしで、ボタンのクリックや入力値の変更による通信、表示の切り替え、エラー表示などが可能になります。

各サンプルでは以下を明記します：

- HTML 記述例
- 最終的な HTML 構造
- 表示結果
- 通信がある場合はリクエストパラメータとレスポンス JSON も記載

---

## 7.1 メッセージを表示する：`data-click-message`

ボタンのクリックで通知メッセージ（alert）を表示します。

### HTML 記述例

```html
<form>
  <button data-click-message="保存が完了しました">保存</button>
</form>
```

### 最終的な HTML 構造

```html
<form>
  <button data-click-message="保存が完了しました">保存</button>
</form>
```

### 表示結果

クリックすると `保存が完了しました` という alert が表示される。

---

## 7.2 データを送信して反映する：`data-click-fetch` + `data-click-bind`

フォームの `data-bind` を送信し、レスポンス結果を画面に反映します。

### HTML 記述例

```html
<form data-bind='{"user": {"name": ""}}' data-form-arg="user">
  <input name="name" />
  <button
    data-click-form
    data-click-fetch="/api/greet"
    data-click-method="POST"
    data-click-bind="#result"
  >
    送信
  </button>
</form>

<div id="result">{{message}}</div>
```

### 送信パラメータ（例）

```json
{
  "user": {
    "name": "太郎"
  }
}
```

### レスポンス JSON（例）

```json
{
  "message": "こんにちは、太郎さん！"
}
```

### 最終的な HTML 構造（例）

```html
<form data-bind='{"user": {"name": "太郎"}}' data-form-arg="user">
  <input name="name" value="太郎" />
  <button
    data-click-form
    data-click-fetch="/api/greet"
    data-click-method="POST"
    data-click-bind="#result"
  >
    送信
  </button>
</form>

<div id="result" data-bind='{"message": "こんにちは、太郎さん！"}'>
  こんにちは、太郎さん！
</div>
```

### 表示結果

```
こんにちは、太郎さん！
```

### 通信前処理

対象のフォームが指定されている場合、通信開始時にそのフォーム内のすべての要素から `data-message` 属性が削除されます。
これにより、以前のエラー表示がクリアされ、再送信時の表示がリセットされます。

### 通信失敗時のエラーメッセージ処理

#### 対象

- `data-click-fetch` を使用し、かつ同じボタンに `data-click-form` が付いている場合
- または `data-fetch-form` によってフォームが指定されている場合

#### 動作仕様

サーバーから以下のような形式のエラーレスポンスが返された場合：

```json
[
  {
    "key": "email",
    "message": "メールアドレスは必須です"
  },
  {
    "key": "password",
    "message": "8文字以上で入力してください"
  }
]
```

Haori-JS は次のように処理を行います。

1. `key` が一致する `name` 属性を持つ要素を、対象フォームの中から探す。
2. 該当の要素が存在すれば、その要素に `data-message` 属性を追加し、エラーメッセージを設定する。
3. 該当要素が存在しない場合は、対応する `<form>` 要素に `data-message` を設定する。

#### 振り分けの例

以下のようなフォームの場合：

```html
<form>
  <input name="email" />
  <input name="password" />
</form>
```

上記のエラーレスポンスを受け取ると、次のように変化します：

```html
<form>
  <input name="email" data-message="メールアドレスは必須です" />
  <input name="password" data-message="8文字以上で入力してください" />
</form>
```

#### ネストされたキーについて

- `key` が `"address.zip"` のようにドット区切りの場合：
  - `name="address.zip"` を持つ要素が対象となります。

- 配列の場合（例：`users[0].email`）も同様に、`name="users[0].email"` の形式で一致を判定します。

#### 注意点

- `data-message` 属性を画面に表示させるには、CSSなどでスタイル表示を行う必要があります。
- 通信開始前には、対象フォーム内のすべての `data-message` 属性が削除され、前回のエラーはリセットされます。

---

## 7.3 ダイアログを開く・閉じる：`data-click-open` / `data-click-close`

### HTML 記述例

```html
<form>
  <button data-click-open="#dialog">詳細を見る</button>
</form>

<dialog id="dialog">
  <p>これはダイアログです</p>
  <button data-click-close="#dialog">閉じる</button>
</dialog>
```

### 表示結果

「詳細を見る」を押すと `<dialog>` が開き、閉じるボタンで閉じられる。

---

## 7.4 値の変更で送信：`data-change-fetch`

セレクトボックスや入力値の変更をトリガーに通信を実行します。

### HTML 記述例

```html
<form>
  <select
    name="theme"
    data-change-fetch="/api/theme"
    data-change-method="POST"
    data-change-message="テーマが変更されました"
  >
    <option value="light">ライト</option>
    <option value="dark">ダーク</option>
  </select>
</form>
```

### 表示結果

選択肢を切り替えると通信が行われ、「テーマが変更されました」が alert 表示される。

---

## 7.5 フォームをリセット：`data-click-reset`

ボタンクリックで `<form>` を初期状態に戻します。

### HTML 記述例

```html
<form id="resetForm">
  <input name="email" value="test@example.com" />
  <button data-click-reset="#resetForm">リセット</button>
</form>
```

### 表示結果

入力欄に変更を加えた後、リセットボタンを押すと `email` フィールドが `"test@example.com"` に戻る。

---

## 7.6 別のボタンを自動クリック：`data-click-click`

通信後に他の要素を `.click()` で実行します。

### HTML 記述例

```html
<form>
  <button id="finalBtn" data-click-message="完了しました">最終処理</button>

  <button
    data-click-fetch="/api/process"
    data-click-click="#finalBtn"
    data-click-form
  >
    処理開始
  </button>
</form>
```

### 表示結果

「処理開始」を押すと通信が行われ、成功後に「最終処理」ボタンが自動でクリックされて「完了しました」が表示される。

---

## 7.7 自動クリックを発生させる：`data-change-click`

`data-change-click` を使用すると、指定した要素の値が変更された際に、**他の要素のクリック処理を自動的に発生**させることができます。
これは `data-click-click` の `change` イベント版です。

主に次のような用途に利用できます：

- セレクトボックスの選択に応じて自動で次のステップに進める
- チェック状態に応じて確認モーダルを開く
- 値が変わったタイミングで別のボタンを押したのと同じ処理を実行する

---

### HTML 記述例

```html
<form data-bind='{"flag": false}'>
  <select name="flag" data-change-click="#next">
    <option value="false">いいえ</option>
    <option value="true">はい</option>
  </select>

  <button id="next" data-click-message="次へ進みます">次へ</button>
</form>
```

---

### 最終的な HTML 構造

```html
<form data-bind='{"flag": false}'>
  <select name="flag" data-change-click="#next">
    <option value="false">いいえ</option>
    <option value="true">はい</option>
  </select>

  <button id="next" data-click-message="次へ進みます">次へ</button>
</form>
```

---

### 表示結果

- セレクトボックスを「はい」に変更すると、
- 自動的に `#next` ボタンがクリックされたのと同じ処理が実行され、
- 「次へ進みます」というメッセージが表示される。

---

> `data-change-click` は、**入力値の変更時**に別要素の `click` イベントを自動で発火させる属性です。
> フェッチ処理とは無関係で、単なる連鎖操作や自動化に便利です。

---

## 7.8 エラーを入力欄に表示する：`data-message` と自動マッピング

`data-click-fetch` によるエラー時、以下の形式のレスポンスに対応します。

### レスポンス JSON（例）

```json
[
  {"key": "user.email", "message": "メールアドレスを入力してください"},
  {"key": "items[0].name", "message": "1つ目の名前が未入力です"},
  {"key": "items[2].price", "message": "3つ目の価格が不正です"}
]
```

### HTML 記述例

```html
<form
  data-bind='{
  "user": { "email": "" },
  "items": [
    { "name": "", "price": 100 },
    { "name": "商品B", "price": 200 },
    { "name": "商品C", "price": null }
  ]
}'
  data-form-arg="form"
>
  <div data-form-object="user">
    <label>メール<input name="email" /></label>
  </div>

  <div data-each="items" data-each-index="i">
    <div data-row>
      <input name="name" />
      <input name="price" type="number" />
    </div>
  </div>

  <button data-click-fetch="/api/validate" data-click-form>送信</button>
</form>
```

### CSS で `data-message` を表示する

```html
<style>
  input[data-message]::after {
    content: attr(data-message);
    display: block;
    font-size: 0.9em;
    color: red;
    margin-top: 4px;
  }

  input[data-message] {
    border-color: red;
  }
</style>
```

### 表示結果

- `user.email` → `<input name="email">` に赤文字で「メールアドレスを入力してください」
- `items[0].name` → 1 つ目の商品名入力欄に「未入力」
- `items[2].price` → 3 つ目の価格欄に「価格が不正です」、該当エレメントがなければ `<form>` に `data-message` 追加

---

## 7.9 通信に関する補足：送信形式と注意点

- `data-click-form` は **属性値を省略可能**ですが、**属性自体は必須**です。省略すると送信対象フォームが検出されません。
- `data-click-method` を省略した場合、**デフォルトは `GET`** です。
- `GET` の場合、送信データは URL のクエリパラメータとして送られます。
- `POST` の場合、送信データはリクエストボディに格納され、**Content-Type は `application/json`** がデフォルトです。
- 送信形式を変更したい場合は `data-click-content-type` や `data-fetch-content-type` を使用します。

---

## 7.10 まとめ

この章では次のような操作をすべて HTML 属性だけで実現できることを確認しました：

- メッセージ表示（`data-click-message`）
- フォームの送信と通信（`data-click-fetch`, `data-click-form`）
- 通信結果の反映（`data-click-bind`）
- ダイアログ開閉（`data-click-open`, `data-click-close`）
- 値変更による送信（`data-change-fetch`）
- フォーム初期化（`data-click-reset`）
- 自動クリック連鎖（`data-click-click`）
- エラーメッセージの自動挿入（`data-message`）

JavaScript なしで高度な UI 処理が可能になるのが Haori の強みです。

---

# 第8章：よくあるパターン集（逆引きリファレンス）

この章では、「○○ したいときにはどう書くか？」をすぐに参照できるように、目的別に実用的なコード例を示します。
Haori の基本構文をある程度理解していることを前提とし、**簡潔で再利用しやすい構成**で提示します。

---

## 8.1 値を表示したい（プレーンな表示）

### HTML 記述例：

```html
<div data-bind='{"user": {"name": "佐藤"}}'>
  <p>{{user.name}}</p>
</div>
```

### 最終的な HTML 構造：

```html
<div data-bind='{"user": {"name": "佐藤"}}'>
  <p>佐藤</p>
</div>
```

### 表示結果：

```
佐藤
```

---

## 8.2 条件によって表示を切り替えたい

### HTML 記述例：

```html
<div data-bind='{"isAdmin": true}'>
  <p data-if="isAdmin">管理者モードです</p>
</div>
```

### 最終的な HTML 構造：

```html
<div data-bind='{"isAdmin": true}'>
  <p>管理者モードです</p>
</div>
```

### 表示結果：

```
管理者モードです
```

---

## 8.3 配列をループで表示したい

### HTML 記述例：

```html
<div data-bind='{"items": [{"label": "A"}, {"label": "B"}]}'>
  <div data-each="items">
    <span>{{label}}</span>
  </div>
</div>
```

### 最終的な HTML 構造：

```html
<div data-bind='{"items": [{"label": "A"}, {"label": "B"}]}'>
  <div data-each="items">
    <span data-row data-bind='{"label": "A"}'>A</span>
    <span data-row data-bind='{"label": "B"}'>B</span>
  </div>
</div>
```

### 表示結果：

```
A B
```

---

## 8.4 入力フォームとリアルタイム連携したい

### HTML 記述例：

```html
<form data-bind='{"comment": "初期値"}'>
  <textarea name="comment"></textarea>
  <p>{{comment}}</p>
</form>
```

### 最終的な HTML 構造：

```html
<form data-bind='{"comment": "初期値"}'>
  <textarea name="comment">初期値</textarea>
  <p>初期値</p>
</form>
```

### 表示結果：

```
初期値
```

（テキストエリアを変更すると、下の表示も更新されます）

---

## 8.5 ボタンで API を叩き、結果を表示したい

### HTML 記述例：

```html
<form id="searchForm" data-bind='{"query": "apple"}' data-form-arg="search">
  <input name="query" />
  <button
    type="button"
    data-click-fetch="/api/search"
    data-click-form="#searchForm"
    data-click-bind="#result"
  >
    検索
  </button>
</form>

<div id="result">
  <p>{{message}}</p>
</div>
```

### フェッチ時のレスポンス JSON（例）：

```json
{
  "message": "apple に一致する商品は3件見つかりました"
}
```

### 最終的な HTML 構造（成功時）：

```html
<div
  id="result"
  data-bind='{"message": "apple に一致する商品は3件見つかりました"}'
>
  <p>apple に一致する商品は3件見つかりました</p>
</div>
```

### 表示結果：

```
apple に一致する商品は3件見つかりました
```

---

## 8.6 入力後に `.reset()` してフォームを初期化したい

### HTML 記述例：

```html
<form
  id="contactForm"
  data-bind='{"name": "", "message": ""}'
  data-form-arg="form"
>
  <input name="name" value="山田" />
  <textarea name="message">こんにちは</textarea>
  <button
    type="button"
    data-click-fetch="/api/contact"
    data-click-method="POST"
    data-click-message="送信しました"
    data-click-reset="#contactForm"
  >
    送信
  </button>
</form>
```

### フェッチ時のレスポンス JSON：

```json
{"status": "ok"}
```

### 最終的な HTML 構造（送信直後）：

```html
<form id="contactForm" data-bind='{"name": "", "message": ""}'>
  <input name="name" value="山田" />
  <textarea name="message">こんにちは</textarea>
</form>
```

→ `.reset()` により、`value` 属性に従って再初期化されます。

### 表示結果：

送信前に入力した値がリセットされ、初期状態に戻ります。

---

## 8.7 URL のクエリパラメータを初期値にしたい

### HTML 記述例（例：`?q=apple&page=2`）：

```html
<form data-url-param data-url-param-arg="query">
  <input name="q" />
  <input name="page" />
</form>
```

### 最終的な HTML 構造：

```html
<form
  data-url-param
  data-url-param-arg="query"
  data-bind='{"query": {"q": "apple", "page": "2"}}'
>
  <input name="q" value="apple" />
  <input name="page" value="2" />
</form>
```

### 表示結果：

入力欄に `"apple"` および `"2"` が事前に入力された状態で表示される。

---

## 8.8 ボタンで他の要素をクリックさせたい（`data-click-click`）

`data-click-click` を使うと、ボタンをクリックした際に、指定したセレクタの要素を自動でクリックさせることができます。

### HTML記述例

```html
<button data-click-click="#confirm">次へ</button>

<button id="confirm" style="display:none">確認ダイアログ</button>
```

### 最終的なHTML構造

```html
<button data-click-click="#confirm">次へ</button>

<button id="confirm" style="display:none">確認ダイアログ</button>
```

### 表示結果

- 「次へ」ボタンを押すと、非表示の `#confirm` ボタンがクリックされる（イベントが発火する）
- `#confirm` は hidden であっても `click()` は有効

> `data-change-click` も同様の動作で、値変更時に発動します。

---

## 8.9 入力値のリセットをしたい（`data-click-reset`）

フォームや一部の要素を元の初期状態に戻したいときは、`data-click-reset` を使用します。

### HTML記述例

```html
<form>
  <input name="email" value="sample@example.com" data-message="エラー" />
  <button type="button" data-click-reset>リセット</button>
</form>
```

### 最終的なHTML構造（リセット後）

```html
<form>
  <input name="email" value="sample@example.com" />
  <button type="button" data-click-reset>リセット</button>
</form>
```

### 表示結果

- 入力欄が初期値 `sample@example.com` に戻る
- `data-message` 属性も削除される

> `data-change-reset` を使用すれば、チェックボックス変更に応じてリセットさせることも可能です。

---

## 8.10 行追加時に初期値を設定したい（`data-click-data`）

行を追加した際に、入力欄の初期値を指定するには `data-click-data` を使用します。

### HTML記述例

```html
<form data-bind='{"items": []}'>
  <div data-each="items">
    <div data-row>
      <input name="name" />
    </div>
  </div>
  <button type="button" data-row-add data-click-data='{"name": "新規"}'>
    追加
  </button>
</form>
```

### 最終的なHTML構造（追加後）

```html
<div data-row data-bind='{"name": "新規"}'>
  <input name="name" value="新規" />
</div>
```

### 表示結果

```
[新規] [追加]
```

> `data-click-data` はクエリ形式（例：`name=新規`）でも記述できます。

---

## 8.11 バリデーションエラーを送信前に検出したい（`data-fetch-validate`）

`data-fetch-validate` を使用すると、HTML標準のバリデーションをフェッチ前に適用できます。

### HTML記述例

```html
<form id="myForm">
  <input name="email" type="email" required />
</form>

<button data-fetch="/api/check" data-fetch-form="#myForm" data-fetch-validate>
  送信
</button>
```

### 最終的なHTML構造

```html
<form id="myForm">
  <input name="email" type="email" required />
</form>

<button data-fetch="/api/check" data-fetch-form="#myForm" data-fetch-validate>
  送信
</button>
```

### 表示結果

- 入力が空または不正な場合、送信は中止され、HTMLの標準エラー表示が出る
- 正しい入力があれば、フェッチが実行される

> このバリデーションは `form.reportValidity()` を使用しています。

---

## 8.12 ページ切り替えを使いたい（プレースホルダによる fetch）

ページネーションのような UI を構成する場合、ページ番号を `data-bind` に含めて、プレースホルダで切り替える構成が使えます。

### HTML記述例

```html
<form data-bind='{"query": {"page": 1}}' data-form-arg="query">
  <button type="submit" data-click-form data-click-data="page={{query.page-1}}">
    前へ
  </button>
  <span>ページ {{query.page}}</span>
  <button type="submit" data-click-form data-click-data="page={{query.page+1}}">
    次へ
  </button>
</form>

<div data-fetch="/api/items" data-fetch-form></div>
```

### 最終的なHTML構造（例：`page = 2` のとき）

```html
<form data-bind='{"query": {"page": 2}}' data-form-arg="query">
  <button type="submit" data-click-form data-click-data="page=1">前へ</button>
  <span>ページ 2</span>
  <button type="submit" data-click-form data-click-data="page=3">次へ</button>
</form>
```

### 表示結果

```
[前へ] ページ 2 [次へ]
```

> この構成では、フォーム内のページ番号が状態として維持され、fetch の送信内容にも含まれます。

---

# 第9章：属性一覧リファレンス

この章では、Haori で使用できる HTML 属性を分類ごとに整理し、それぞれの使用例・展開結果・動作結果を示します。
すべての属性は `data-*` 形式と `hor-*` 形式のどちらでも使用可能です（機能は同一です）。

---

## 9.1 データバインディング関連属性

### `data-bind` / `hor-bind`

要素にデータをバインドし、配下のプレースホルダ `{{...}}` で参照可能にします。

#### HTML 記述例：

```html
<div data-bind='{"user": {"name": "田中"}}'>
  <p>{{user.name}}</p>
</div>
```

#### 最終的な HTML 構造：

```html
<div data-bind='{"user": {"name": "田中"}}'>
  <p>田中</p>
</div>
```

#### 表示結果：

```
田中
```

---

### `data-url-param` / `hor-url-param`

### `data-url-param-arg` / `hor-url-param-arg`

表示中の URL に含まれるクエリパラメータを `data-bind` に設定します。

#### URL 例：

```
https://example.com/?q=apple&page=2
```

#### HTML 記述例：

```html
<form data-url-param data-url-param-arg="search">
  <input name="q" />
  <input name="page" />
</form>
```

#### 最終的な HTML 構造：

```html
<form
  data-url-param
  data-url-param-arg="search"
  data-bind='{"search": {"q": "apple", "page": "2"}}'
>
  <input name="q" />
  <input name="page" />
</form>
```

#### 表示結果：

`input[name="q"]` に `apple`、`input[name="page"]` に `2` が表示される。

---

### `data-form-arg`

フォーム入力の値を、`data-bind` 上の特定キーの下にまとめて格納します。

#### HTML 記述例：

```html
<form data-form-arg="user">
  <input name="email" value="test@example.com" />
</form>
```

#### 最終的な HTML 構造：

```html
<form data-bind='{"user": {"email": "test@example.com"}}' data-form-arg="user">
  <input name="email" value="test@example.com" />
</form>
```

#### 表示結果：

バインドデータは `{ user: { email: "test@example.com" } }`

---

### `data-form-detach`

フォームの `data-bind` から初期値を反映させない。ユーザー入力値は `data-bind` に反映される。

#### HTML 記述例：

```html
<form data-bind='{"token": "abc123"}'>
  <input type="hidden" name="token" data-form-detach />
</form>
```

#### 最終的な HTML 構造：

```html
<form data-bind="{}">
  <input type="hidden" name="token" data-form-detach />
</form>
```

#### 表示結果：

HTML 上に初期値は表示されないが、送信時には入力値が反映される。

---

### `data-form-lines`

`<textarea>` の各行を配列としてバインドします。

#### HTML 記述例：

```html
<form data-bind='{"tags": ["赤", "青", "緑"]}'>
  <textarea name="tags" data-form-lines></textarea>
</form>
```

#### 最終的な HTML 構造：

```html
<form data-bind='{"tags": ["赤", "青", "緑"]}'>
  <textarea name="tags" data-form-lines>
赤
青
緑</textarea
  >
</form>
```

#### 表示結果：

テキストエリアの内容が複数行で表示され、`tags` は配列として保持される。

---

## 9.2 表示制御・ループ

### `data-if` / `hor-if`

指定された式が false のとき、その要素を非表示（空）にします。

#### HTML 記述例：

```html
<div data-bind='{"visible": false}'>
  <p data-if="visible">表示される条件付きテキスト</p>
</div>
```

#### 最終的な HTML 構造：

```html
<div data-bind='{"visible": false}'>
  <p data-if="visible" data-if-false></p>
</div>
```

#### 表示結果：

（何も表示されない）

---

### `data-each` / `hor-each`

指定された配列をもとに、子要素を繰り返し表示します。

#### HTML 記述例：

```html
<div data-bind='{"items": [{"name": "A"}, {"name": "B"}]}' data-each="items">
  <p>{{name}}</p>
</div>
```

#### 最終的な HTML 構造：

```html
<div data-bind='{"items": [{"name": "A"}, {"name": "B"}]}' data-each="items">
  <p data-row data-bind='{"name": "A"}'>A</p>
  <p data-row data-bind='{"name": "B"}'>B</p>
</div>
```

#### 表示結果：

```
A
B
```

---

### `data-each-key` / `hor-each-key`

繰り返し表示の差分更新時に、各行を識別するためのキーを指定します。

#### HTML 記述例：

```html
<div
  data-bind='{"items":[{"id":1,"name":"A"},{"id":2,"name":"B"}]}'
  data-each="items"
  data-each-key="id"
>
  <p>{{name}}</p>
</div>
```

#### 最終的な HTML 構造（省略可）：

```html
<div
  data-bind='{"items":[{"id":1,"name":"A"},{"id":2,"name":"B"}]}'
  data-each="items"
  data-each-key="id"
>
  <p data-row="1" data-bind='{"id":1,"name":"A"}'>A</p>
  <p data-row="2" data-bind='{"id":2,"name":"B"}'>B</p>
</div>
```

#### 表示結果：

```
A
B
```

#### 挙動：

- `data-each-key="id"` を指定すると、各行の `id` の値をもとに差分を判定します。
- 指定がない場合は、各行の `data-bind` の中身（JSON 構造）を比較して差分を判定します。
- 構造比較ではプロパティの順序には依存せず、値がすべて一致すれば同一と見なされます。
- 差分がある行のみが再描画され、それ以外は DOM を再利用します。

#### 補足：

- キーに指定できるのは `data-bind` 内のトップレベルキー名（例：`id`, `key`, `code` など）。
- ネストされたスコープの場合は `data-each-arg` と併用して `item.id` のようにプレースホルダで参照可能です。
- 高頻度で更新されるリストや、ページネーションなどで同一項目が再表示される場合に、パフォーマンスの面で有効です。

> 差分描画によるパフォーマンス向上のために、`data-each-key` の指定を強く推奨します。

#### `data-row` 属性への反映：

- `data-each-key` を指定した場合、各行に付与される `data-row` 属性の値として、指定キーの値が文字列としてセットされます。
- これにより、次のような構造が生成されます：

```html
<div data-each="items" data-each-key="id">
  <p data-row="1" data-bind='{"id":1,"name":"A"}'>A</p>
  <p data-row="2" data-bind='{"id":2,"name":"B"}'>B</p>
</div>
```

- `data-each-key` を指定しない場合は、従来通り `data-row` は属性名のみで付与され（例：`<p data-row>`）、値は持ちません。

> `data-row` の値が設定されていることで、各行を JavaScript から容易に特定でき、デバッグやクリックイベント処理に便利です。

---

### `data-each-arg` / `hor-each-arg`

繰り返しの各要素に任意の名前をつけてスコープとして参照します。

#### HTML 記述例：

```html
<div
  data-bind='{"fruits": ["りんご", "ばなな"]}'
  data-each="fruits"
  data-each-arg="fruit"
>
  <p>{{fruit}}</p>
</div>
```

#### 最終的な HTML 構造：

```html
<div
  data-bind='{"fruits": ["りんご", "ばなな"]}'
  data-each="fruits"
  data-each-arg="fruit"
>
  <p data-row data-bind='{"fruit": "りんご"}'>りんご</p>
  <p data-row data-bind='{"fruit": "ばなな"}'>ばなな</p>
</div>
```

#### 表示結果：

```
りんご
ばなな
```

---

### `data-each-index` / `hor-each-index`

各行にインデックス（0 始まり）を与えるために使用します。

#### HTML 記述例：

```html
<div
  data-bind='{"colors": [{"name": "赤"}, {"name": "青"}]}'
  data-each="colors"
  data-each-arg="item"
  data-each-index="i"
>
  <p>{{item.i}}: {{item.name}}</p>
</div>
```

#### 最終的な HTML 構造：

```html
<div
  data-bind='{"colors": [{"name": "赤"}, {"name": "青"}]}'
  data-each="colors"
  data-each-arg="item"
  data-each-index="i"
>
  <p data-row data-bind='{"item": {"i": 0, "name": "赤"}}'>0: 赤</p>
  <p data-row data-bind='{"item": {"i": 1, "name": "青"}}'>1: 青</p>
</div>
```

#### 表示結果：

```
0: 赤
1: 青
```

---

### `data-each-before` / `data-each-after`

繰り返しの前後に一度だけ表示したい要素に使用します。

#### HTML 記述例：

```html
<div data-bind='{"names": ["佐藤", "鈴木"]}' data-each="names">
  <p data-each-before>名簿一覧</p>
  <p>{{}}</p>
  <p data-each-after>以上です</p>
</div>
```

※ `{{}}` は空式のため **使用禁止** です。以下のように修正してください：

```html
<p>{{.}}</p>
<!-- ドット構文や data-each-arg 推奨 -->
```

#### 表示結果：

```
名簿一覧
佐藤
鈴木
以上です
```

---

## 9.3 入力フォーム操作

### `data-form-arg`

フォーム内の入力値を、`data-bind` の指定したキーの下にまとめて格納します。

#### HTML 記述例：

```html
<form data-form-arg="user">
  <input name="email" value="test@example.com" />
</form>
```

#### 最終的な HTML 構造：

```html
<form data-bind='{"user": {"email": "test@example.com"}}' data-form-arg="user">
  <input name="email" value="test@example.com" />
</form>
```

#### 表示結果：

`user.email` に `test@example.com` が格納される。

---

### `data-form-detach`

入力欄に対して `data-bind` から値を反映させず、逆方向（入力 → データ）だけ反映させたいときに使用します。

#### HTML 記述例：

```html
<form data-bind='{"token": "abc123"}'>
  <input type="hidden" name="token" data-form-detach />
</form>
```

#### 最終的な HTML 構造：

```html
<form data-bind="{}">
  <input type="hidden" name="token" data-form-detach />
</form>
```

#### 表示結果：

- `input` に `"abc123"` は表示されない。
- 入力欄に新しい値があれば `token` として送信される。

---

### `data-form-lines`

`<textarea>` の各行を配列の 1 要素としてバインドします。

#### HTML 記述例：

```html
<form data-bind='{"tags": ["赤", "青", "緑"]}'>
  <textarea name="tags" data-form-lines></textarea>
</form>
```

#### 最終的な HTML 構造：

```html
<form data-bind='{"tags": ["赤", "青", "緑"]}'>
  <textarea name="tags" data-form-lines>
赤
青
緑</textarea
  >
</form>
```

#### 表示結果：

テキストエリアに複数行で表示され、各行は `tags` 配列の要素に対応する。

---

### `data-each` による配列入力

フォーム配下に `data-each` がある場合、内部の入力欄は配列として扱われます。

#### HTML 記述例：

```html
<form
  data-bind='{"emails": [{"value": "a@example.com"}, {"value": "b@example.com"}]}'
  data-each="emails"
>
  <input type="email" name="value" />
</form>
```

#### 最終的な HTML 構造：

```html
<form
  data-bind='{"emails": [{"value": "a@example.com"}, {"value": "b@example.com"}]}'
  data-each="emails"
>
  <input
    type="email"
    name="value"
    data-row
    data-bind='{"value": "a@example.com"}'
    value="a@example.com"
  />
  <input
    type="email"
    name="value"
    data-row
    data-bind='{"value": "b@example.com"}'
    value="b@example.com"
  />
</form>
```

#### 表示結果：

2 つの入力欄が表示され、それぞれ `emails[0].value`, `emails[1].value` に対応する。

---

### チェックボックスとラジオボタン

`type="checkbox"` または `type="radio"` の場合、`value` によってチェック状態を制御します。

#### HTML 記述例：

```html
<form data-bind='{"agree": true}'>
  <label><input type="checkbox" name="agree" value="true" /> 同意する</label>
  <p>{{agree ? "同意済み" : "未同意"}}</p>
</form>
```

#### 最終的な HTML 構造：

```html
<form data-bind='{"agree": true}'>
  <label
    ><input type="checkbox" name="agree" value="true" checked /> 同意する</label
  >
  <p>同意済み</p>
</form>
```

#### 表示結果：

チェックが入っており、「同意済み」と表示される。

---

## 9.4 非同期通信（フェッチ・スクロール）

### `data-fetch`

ページ表示時または再評価時に自動でデータを取得し、対象要素の `data-bind` にバインドします。

#### HTML 記述例：

```html
<div data-fetch="/api/items" data-each="items">
  <p>{{name}}</p>
</div>
```

#### レスポンスの JSON：

```json
{
  "items": [{"name": "リンゴ"}, {"name": "バナナ"}]
}
```

#### 最終的な HTML 構造：

```html
<div
  data-fetch="/api/items"
  data-each="items"
  data-bind='{"items": [{"name": "リンゴ"}, {"name": "バナナ"}]}'
>
  <p data-row data-bind='{"name": "リンゴ"}'>リンゴ</p>
  <p data-row data-bind='{"name": "バナナ"}'>バナナ</p>
</div>
```

#### 表示結果：

```
リンゴ
バナナ
```

---

### `data-fetch-method`

HTTP メソッドを指定します。GET 以外に POST なども指定可能です。

```html
<div data-fetch="/api/items" data-fetch-method="POST"></div>
```

---

### `data-fetch-headers`

通信時の HTTP ヘッダーを JSON 形式で指定します。

```html
<div data-fetch="/api/items" data-fetch-headers='{"X-Token": "abc123"}'></div>
```

---

### `data-fetch-content-type`

Content-Type ヘッダーを明示します。

```html
<div data-fetch="/api/items" data-fetch-content-type="application/json"></div>
```

---

### `data-fetch-arg`

レスポンスデータのうち、特定キーのみを使用します。

#### レスポンスの JSON：

```json
{
  "status": "ok",
  "items": [{"name": "りんご"}, {"name": "みかん"}]
}
```

#### HTML 記述例：

```html
<div data-fetch="/api/items" data-fetch-arg="items" data-each="items">
  <p>{{name}}</p>
</div>
```

#### 表示結果：

```
りんご
みかん
```

---

### `data-fetch-form`

データ取得時に、指定されたフォームの `data-bind` を送信パラメータとして使用します。

```html
<form id="searchForm" data-form-arg="query">
  <input name="keyword" value="fruit" />
</form>

<div data-fetch="/api/search" data-fetch-form="#searchForm"></div>
```

---

### `data-fetch-bind`

取得結果を他の要素にバインドするためのセレクタを指定します。

```html
<div id="target"></div>
<div data-fetch="/api/info" data-fetch-bind="#target"></div>
```

---

### `data-fetch-bind-arg`

取得結果を他要素の `data-bind` の特定キーにネストして格納します。

```html
<div id="profile"></div>
<div
  data-fetch="/api/user"
  data-fetch-bind="#profile"
  data-fetch-bind-arg="user"
></div>
```

---

### `data-fetch-force`

非表示状態や `data-if-false` でも強制的にデータ取得を実行します。

```html
<div data-if="false" data-fetch="/api/info" data-fetch-force></div>
```

---

### `data-scroll-fetch`

要素が画面内に入ったときに、指定 URL から追加データを取得します。

#### HTML 記述例：

```html
<div id="resultList" data-scroll-fetch="/api/more" data-each="items">
  <p>{{name}}</p>
</div>
```

#### レスポンスの JSON：

```json
{
  "items": [{"name": "桃"}, {"name": "ぶどう"}]
}
```

#### 最終的な HTML 構造：

```html
<div
  id="resultList"
  data-scroll-fetch="/api/more"
  data-each="items"
  data-bind='{"items": [{"name": "桃"}, {"name": "ぶどう"}]}'
>
  <p data-row data-bind='{"name": "桃"}'>桃</p>
  <p data-row data-bind='{"name": "ぶどう"}'>ぶどう</p>
</div>
```

#### 表示結果：

```
桃
ぶどう
```

---

### `data-scroll-fetch-key` / `data-scroll-fetch-step`

ページネーションや件数を制御します。

```html
<div data-scroll-fetc
```

### `data-fetch-validate`

フェッチ送信前に HTML バリデーションを実行します。バリデーションに失敗した場合、通信は行われません。
`data-fetch-form` と併用することで、対象の <form> を明示的に指定できます。指定がない場合はボタン要素の親フォームが対象になります。

---

## 9.5 イベントトリガ（クリック／変更）

Haori では、ボタンのクリックやフォーム値の変更に応じて、通信・画面更新・バインディング・履歴操作などを行うための属性を用意しています。

### 共通の仕様

- `data-click-*` はクリック時、`data-change-*` は値の変更時に処理される。
- `data-click-*` 系と `data-change-*` 系の属性は、多くが対応している（例：`data-click-fetch` ⇔ `data-change-fetch`）。

---

### `data-click-fetch` / `data-change-fetch`

クリック（または変更）時に指定 URL に通信を行います。

#### HTML 記述例：

```html
<button data-click-fetch="/api/greet">挨拶</button>
```

#### 最終的な HTML 構造：

```html
<button data-click-fetch="/api/greet">挨拶</button>
```

#### 表示結果（クリック時）：

通信が行われ、結果は該当要素の `data-bind` に反映される（例：`{ message: "こんにちは" }`）。

#### フェッチ結果の JSON（例）：

```json
{
  "message": "こんにちは"
}
```

---

### `data-click-form` / `data-change-form`

リクエスト送信時に、対象フォームの `data-bind` の値をパラメータとして使用します。

#### HTML 記述例：

```html
<form id="form1" data-bind='{"q": "りんご"}'>
  <input name="q" />
</form>

<button data-click-fetch="/api/search" data-click-form="#form1">検索</button>
```

#### 最終的な HTML 構造：

```html
<form id="form1" data-bind='{"q": "りんご"}'>
  <input name="q" />
</form>

<button data-click-fetch="/api/search" data-click-form="#form1">検索</button>
```

#### 表示結果：

ボタンクリック時に `{ q: "りんご" }` が送信される。

---

### `data-click-data` / `data-change-data`

送信するデータ（または `data-click-fetch` がない場合は擬似レスポンス）を指定します。

#### HTML 記述例（疑似レスポンス）：

```html
<button data-click-data='{"msg": "保存完了"}' data-click-bind="#result">
  保存
</button>
<div id="result">{{msg}}</div>
```

#### 最終的な HTML 構造：

```html
<button data-click-data='{"msg": "保存完了"}' data-click-bind="#result">
  保存
</button>
<div id="result">{{msg}}</div>
```

#### 表示結果：

クリックすると `保存完了` が表示される。

---

### `data-click-bind` / `data-change-bind`

レスポンスデータを指定要素の `data-bind` に反映します。

#### HTML 記述例：

```html
<button data-click-data='{"count": 1}' data-click-bind="#target">更新</button>
<div id="target">{{count}}</div>
```

#### 表示結果：

クリックで `count` が `1` に更新され、画面表示も変わる。

---

### `data-click-bind-arg` / `data-change-bind-arg`

バインド時に特定キーでラップします。

#### HTML 記述例：

```html
<button
  data-click-data='{"name": "田中"}'
  data-click-bind="#form"
  data-click-bind-arg="user"
>
  セット
</button>
<form id="form">
  <input name="name" />
</form>
```

#### 表示結果：

クリックすると `{ user: { name: "田中" } }` が `form` にバインドされる。

---

### `data-click-message` / `data-change-message`

操作後に通知を表示します。

#### HTML 記述例：

```html
<button data-click-message="登録が完了しました">送信</button>
```

#### 表示結果：

クリック後に `"登録が完了しました"` という通知が表示される。

---

### `data-click-alert` / `data-change-alert`

モーダルアラートを表示します。

#### HTML 記述例：

```html
<button data-click-alert="この操作は元に戻せません">警告</button>
```

#### 表示結果：

クリック時にブラウザ標準またはカスタムのアラートが表示される。

---

### `data-click-confirm` / `data-change-confirm`

確認ダイアログを表示し、OK を押した場合のみ処理を続行します。

#### HTML 記述例：

```html
<button
  data-click-confirm="本当に削除しますか？"
  data-click-fetch="/api/delete"
  data-click-message="削除されました"
>
  削除
</button>
```

#### 表示結果：

- OK → 削除処理が実行され、メッセージ表示
- キャンセル → 処理中断

---

### `data-click-open` / `data-change-open`

### `data-click-close` / `data-change-close`

ダイアログや指定要素を開閉します。

#### HTML 記述例：

```html
<button data-click-open="#dialog1">開く</button>
<dialog id="dialog1">
  <p>内容</p>
  <button data-click-close="#dialog1">閉じる</button>
</dialog>
```

#### 表示結果：

「開く」ボタンでモーダルが表示され、「閉じる」で非表示になる。

---

### `data-click-reset` / `data-change-reset`

フォームを `.reset()` により初期状態に戻します。

#### HTML 記述例：

```html
<form id="f1">
  <input name="name" value="山田" />
</form>
<button data-click-reset="#f1">リセット</button>
```

#### 表示結果：

クリックでフォームの値が `"山田"` に戻る。

---

### `data-click-history` / `data-change-history`

フォームのパラメータやクリック値を URL 履歴として保存します。

#### HTML 記述例：

```html
<form id="f2" data-bind='{"q": "みかん"}' data-form-arg="search">
  <input name="q" />
</form>
<button data-click-history data-click-form="#f2">検索</button>
```

#### 表示結果：

クリック後、URL に `?q=みかん` のようなクエリが履歴として追加される。

---

### `data-click-refetch` / `data-change-refetch`

指定セレクタの `data-fetch` を再実行させます。

#### HTML 記述例：

```html
<div id="list" data-fetch="/api/items" data-each="items">
  <p>{{name}}</p>
</div>
<button data-click-refetch="#list">再取得</button>
```

#### 表示結果：

ボタンを押すと `/api/items` に再アクセスされ、データが更新される。

---

### `data-click-click` / `data-change-click`

クリックまたは変更時に、指定要素を自動的に `.click()` します。

#### HTML 記述例：

```html
<button id="hiddenBtn" style="display: none" onclick="alert('実行されました')">
  実行
</button>
<select data-change-click="#hiddenBtn">
  <option value="1">選択</option>
</select>
```

#### 表示結果：

`<select>` の値が変更されると、非表示のボタンが自動クリックされアラートが表示される。

---

以上が、Haori が提供するクリックおよび変更イベント用の属性一覧です。
これらの属性を組み合わせることで、JavaScript を記述せずに多様な UI 操作が可能になります。

## 9.6 行操作（data-row）

Haori では、`data-each` によって複製された各行に対して、追加・削除・並べ替えといった操作を行うための属性が用意されています。これらの属性は、`data-row`（自動付与）を基準として動作します。

---

### `data-row`

`data-each` によって生成された各要素には、自動的に `data-row` 属性が付与されます。

#### HTML 記述例：

```html
<div data-bind='{"items": [{"name":"A"}]}' data-each="items">
  <p>{{name}}</p>
</div>
```

#### 最終的な HTML 構造：

```html
<div data-bind='{"items": [{"name":"A"}]}' data-each="items">
  <p data-row data-bind='{"name":"A"}'>A</p>
</div>
```

#### 表示結果：

```
A
```

---

### `data-row-add`

現在の行を複製して、直後に追加します。

#### HTML 記述例：

```html
<div data-bind='{"items":[{"name":"A"}]}' data-form-arg="items">
  <div data-each="items">
    <div>
      <input name="name" />
      <button data-row-add>追加</button>
    </div>
  </div>
</div>
```

#### 最終的な HTML 構造（初期状態）：

```html
<div data-bind='{"items":[{"name":"A"}]}' data-form-arg="items">
  <div data-each="items">
    <div data-row data-bind='{"name":"A"}'>
      <input name="name" value="A" />
      <button data-row-add>追加</button>
    </div>
  </div>
</div>
```

#### 表示結果：

「追加」ボタンを押すと、同じ構造の行が 1 つ下に追加され、値は初期化される。

---

### `data-row-remove`

現在の行を削除します。1 行しか存在しない場合は、値が初期化されます。

#### HTML 記述例：

```html
<div data-bind='{"items":[{"name":"A"},{"name":"B"}]}' data-form-arg="items">
  <div data-each="items">
    <div>
      <input name="name" />
      <button data-row-remove>削除</button>
    </div>
  </div>
</div>
```

#### 表示結果：

「削除」ボタンを押すと、該当の行がフォームデータごと削除される。

---

### `data-row-prev`

現在の行をひとつ上に移動します。

#### HTML 記述例：

```html
<div data-bind='{"items":[{"name":"A"},{"name":"B"}]}' data-form-arg="items">
  <div data-each="items">
    <div>
      <input name="name" />
      <button data-row-prev>↑</button>
    </div>
  </div>
</div>
```

#### 表示結果：

「↑」ボタンを押すと、現在の行が 1 つ上に移動し、フォームデータの順序も更新される。

---

### `data-row-next`

現在の行をひとつ下に移動します。

#### HTML 記述例：

```html
<div data-bind='{"items":[{"name":"A"},{"name":"B"}]}' data-form-arg="items">
  <div data-each="items">
    <div>
      <input name="name" />
      <button data-row-next>↓</button>
    </div>
  </div>
</div>
```

#### 表示結果：

「↓」ボタンを押すと、現在の行が 1 つ下に移動し、フォームデータの順序も更新される。

---

これらの操作はすべて `data-each` の配列と同期して動作し、送信されるデータ構造にも正しく反映されます。行の順序、追加・削除状態を正しく扱いたい場合に有効です。

## 9.7 DOM 補助・インポート

この節では、Haori の UI 構成や初期動作の自動化に関わる属性を紹介します。動的な DOM の拡張や、読み込み後の自動操作などに用いられます。

---

### `data-import` / `hor-import`

指定した URL から外部 HTML ファイルを読み込み、要素の中に挿入します。コンポーネントのように使えます。

#### HTML 記述例：

```html
<div data-import="/parts/sidebar.html"></div>
```

#### 最終的な HTML 構造：

```html
<div data-import="/parts/sidebar.html">
  <!-- /parts/sidebar.html の <body> 部分の内容がここに挿入される -->
</div>
```

#### 表示結果：

サイドバーなどの外部部品が表示される。

#### 補足：

- `data-import` の値が動的に変化すると、再読み込みされます。
- 通常のブラウザキャッシュが使用されます。

---

### `data-ready-click` / `hor-ready-click`

DOM 構築直後に、自動的に `.click()` を発火させます。初期フェッチや初期アクションの自動化に使用します。

#### HTML 記述例：

```html
<button id="loadButton" data-ready-click data-click-fetch="/api/init">
  自動取得
</button>
```

#### 最終的な HTML 構造：

```html
<button id="loadButton" data-ready-click data-click-fetch="/api/init">
  自動取得
</button>
```

#### 表示結果：

ページ読み込み後にボタンが自動的にクリックされ、`/api/init` に通信が発生する。

#### フェッチ結果の JSON（例）：

```json
{
  "status": "ok",
  "message": "初期化完了"
}
```

---

### `data-message` / `hor-message`

通知用の出力先となる要素に付ける属性です。`data-click-message` や `data-fetch` のエラー表示先として使用されます。

#### HTML 記述例：

```html
<div id="notice" data-message></div>
<button data-click-message="保存しました" data-click-bind="#notice">
  送信
</button>
```

#### 最終的な HTML 構造：

```html
<div id="notice" data-message></div>
<button data-click-message="保存しました" data-click-bind="#notice">
  送信
</button>
```

#### 表示結果：

クリック時に「保存しました」というメッセージが `#notice` に表示される。

---

これらの属性は、Haori で構成されたページをより柔軟かつ動的に制御するために便利です。外部ファイルの読み込みや自動クリックの活用により、コードの重複を減らし、ユーザー体験を向上させることができます。

## 9.8 特殊属性（自動付与・非推奨）

この節では、Haori の動作によって自動的に付与される属性や、現在は非推奨とされている属性について説明します。

---

### `data-row` / `hor-row`

`data-each` によって複製された行に **自動的に付与される属性** です。
これにより、`data-row-add` や `data-row-remove` などの行操作が有効になります。

#### HTML 記述例：

```html
<div data-bind='{"items": [{"name": "A"}]}' data-each="items">
  <p>{{name}}</p>
</div>
```

#### 最終的な HTML 構造：

```html
<div data-bind='{"items": [{"name": "A"}]}' data-each="items">
  <p data-row data-bind='{"name": "A"}'>A</p>
</div>
```

#### 表示結果：

```
A
```

#### 補足：

- 明示的に `data-row` を書く必要はありません。
- `data-each` の子要素に自動付与されます。

---

### `data-if-false` / `hor-if-false`

`data-if` の評価結果が `false` となったときに自動付与される属性です。

#### HTML 記述例：

```html
<div data-bind='{"show": false}'>
  <p data-if="show">表示する</p>
</div>
```

#### 最終的な HTML 構造：

```html
<div data-bind='{"show": false}'>
  <p data-if="show" data-if-false></p>
</div>
```

#### 表示結果：

表示されない（空の要素となる）

#### 補足：

- `data-if-false` は値を持たない属性として追加されます（`data-if-false=""` とはなりません）。
- `data-fetch` 等はこの要素には評価されません。

---

# 第10章：動的 UI 構成：外部 HTML・自動クリック

この章では、Haori を用いてより柔軟な UI 構成を行うための属性として、
以下の 2 つの主要機能を紹介します：

- 外部 HTML の読み込み（`data-import`）
- 自動的なクリック操作の発火（`data-ready-click`）

これらを組み合わせることで、**動的に UI を構成したり、ページ表示直後に処理を自動開始したり**することができます。

---

## 10.1 外部 HTML の読み込み：`data-import`

`data-import` 属性を指定すると、該当の要素内に **外部 HTML ファイルの `<body>` 内部が挿入**されます。

### HTML 記述例：

```html
<div data-import="/parts/sidebar.html"></div>
```

### 最終的な HTML 構造（例）：

```html
<div data-import="/parts/sidebar.html">
  <nav>
    <ul>
      <li><a href="/">Home</a></li>
      <li><a href="/about">About</a></li>
    </ul>
  </nav>
</div>
```

### 表示結果：

- サイドバーが動的に挿入されて表示される。

### 補足仕様：

- 読み込まれるのは `<body>` タグの中身のみです。
- 読み込み完了時には `haori:import-load` イベントが発火します。
- `data-import` の属性値が変化した場合は再読み込みされます。
- 通常のブラウザキャッシュが適用されます。

---

## 10.2 自動クリックの実行：`data-ready-click`

`data-ready-click` を指定すると、該当要素が DOM に追加されたタイミングで **自動的に `.click()` が実行**されます。

これは、ページ読み込み時に何らかの初期処理を実行したい場合に便利です。

### HTML 記述例：

```html
<button id="loadButton" data-click-fetch="/api/list" data-ready-click>
  データを読み込む
</button>
```

### 最終的な HTML 構造：

```html
<button id="loadButton" data-click-fetch="/api/list" data-ready-click>
  データを読み込む
</button>
```

### 表示結果：

- ページ読み込み直後にボタンが自動的にクリックされ、`/api/list` にリクエストが送信される。

### レスポンスの JSON（例）：

```json
[{"name": "商品A"}, {"name": "商品B"}]
```

### 応用例：

外部 HTML と組み合わせた例：

```html
<div data-import="/parts/auto-search.html"></div>
```

`/parts/auto-search.html` に次のような内容があると仮定：

```html
<button id="autoSearch" data-click-fetch="/api/search" data-ready-click>
  自動検索
</button>
```

この場合、読み込み完了後に `#autoSearch` ボタンがクリックされ、検索処理が即時に始まります。

---

## 10.3 値を固定して送信する：`data-click-data`

`data-click-data` 属性を使うと、ボタンをクリックしたときに **固定の値を指定して送信**することができます。
この値はフォームの `data-bind` には依存せず、**ボタン単体で送信パラメータを定義**する目的で使用します。

値の形式は以下の 2 種類に対応しています：

- **オブジェクト形式**（JSON）
- **リクエストパラメータ形式**（`key=value&key2=value2`）

いずれの形式でも、送信時には JavaScript オブジェクトとして解釈されます。

---

### HTML 記述例（オブジェクト形式）

```html
<form>
  <button
    data-click-fetch="/api/switch"
    data-click-method="POST"
    data-click-data='{"mode":"preview"}'
  >
    プレビュー表示
  </button>
</form>
```

### 送信データ（POST）

```json
{
  "mode": "preview"
}
```

---

### HTML 記述例（リクエストパラメータ形式）

```html
<form>
  <button
    data-click-fetch="/api/switch"
    data-click-method="POST"
    data-click-data="mode=preview&type=quick"
  >
    プレビュー表示
  </button>
</form>
```

### 送信データ（POST）

```json
{
  "mode": "preview",
  "type": "quick"
}
```

---

> `data-click-data` に **クエリパラメータ形式（mode=preview\&type=quick）** を指定すると、
> Haori は自動的に JavaScript オブジェクトに変換して送信します。
>
> 特定の操作ごとに固定値を送信したい場合に便利です。

---

このように、形式の違いによる使用例を併記しておくことで、ユーザーの誤解や実装ミスを防ぐことができます。

この追記を含めて、第 10 章全体の再構成をご希望でしたらお知らせください。

## 10.4 注意事項と推奨パターン

- `data-ready-click` は通常のボタンにしか使えません。`<div>` や `<p>` などには `.click()` を適用しても効果がありません。
- `data-import` によって挿入された要素にも `data-ready-click` は有効です。
- 組み込み先の HTML では Haori の初期化が完了している前提となるため、必ず `<script src="haori.min.js">` は親 HTML で読み込んでください。

---

## まとめ

| 機能                 | 属性               | 主な用途                                   |
| -------------------- | ------------------ | ------------------------------------------ |
| 外部 HTML の読み込み | `data-import`      | コンポーネントのような再利用部品の読み込み |
| 自動クリック         | `data-ready-click` | 初期表示直後の処理実行（フェッチなど）     |

これらを活用することで、Haori を使った画面構成をより柔軟かつ自動化されたものにできます。

---

# 第11章：フェッチと履歴・URL 同期

Haori では、`data-fetch` や `data-click-fetch` を使って外部 API と通信し、取得したデータを表示やフォームに反映できます。さらに、URL との連携により、状態を保持したままページ遷移や戻る操作が可能になります。

---

## 11.1 `data-fetch`：初期表示でデータ取得

ページ表示時に自動で API からデータを取得し、対象要素に表示します。

### HTML 記述例

```html
<div data-fetch="/api/user" data-each="items">
  <p>{{name}}</p>
</div>
```

### レスポンス（JSON）

```json
{
  "items": [{"name": "山田"}, {"name": "田中"}]
}
```

### 最終的な HTML 構造

```html
<div data-fetch="/api/user" data-each="items">
  <p data-row data-bind='{"name":"山田"}'>山田</p>
  <p data-row data-bind='{"name":"田中"}'>田中</p>
</div>
```

### 表示結果

```
山田
田中
```

---

## 11.2 `data-fetch-bind`：取得データの反映先を指定

`data-fetch` 自体の要素ではなく、別の要素にデータを反映したい場合に使用します。

### HTML 記述例

```html
<div id="target">
  <p>{{name}}（{{age}}歳）</p>
</div>

<div data-fetch="/api/detail" data-fetch-bind="#target"></div>
```

### レスポンス（JSON）

```json
{
  "name": "佐藤",
  "age": 28
}
```

### 最終的な HTML 構造

```html
<div id="target" data-bind='{"name":"佐藤","age":28}'>
  <p>佐藤（28歳）</p>
</div>

<div data-fetch="/api/detail" data-fetch-bind="#target"></div>
```

### 表示結果

```
佐藤（28歳）
```

---

## 11.3 `data-fetch-bind-arg`：データをキーでネストして反映

取得データをネストして渡したい場合に使用します。

### HTML 記述例

```html
<div id="userBox">
  <p>{{user.name}}（{{user.age}}歳）</p>
</div>

<div
  data-fetch="/api/user"
  data-fetch-bind="#userBox"
  data-fetch-bind-arg="user"
></div>
```

### レスポンス（JSON）

```json
{
  "name": "川村",
  "age": 42
}
```

### 最終的な HTML 構造

```html
<div id="userBox" data-bind='{"user":{"name":"川村","age":42}}'>
  <p>川村（42歳）</p>
</div>

<div
  data-fetch="/api/user"
  data-fetch-bind="#userBox"
  data-fetch-bind-arg="user"
></div>
```

### 表示結果

```
川村（42歳）
```

---

## 11.4 `data-fetch-form`：フォームの値を送信する

対象フォームの `data-bind` を取得し、パラメータとして API に送信します。

### HTML 記述例

```html
<form id="searchForm" data-bind='{"keyword": "りんご"}'>
  <input name="keyword" />
</form>

<div data-fetch="/api/search" data-fetch-form="#searchForm" data-each="items">
  <p>{{name}}</p>
</div>
```

### 送信されるパラメータ

```json
{
  "keyword": "りんご"
}
```

### レスポンス（JSON）

```json
{
  "items": [{"name": "青りんご"}, {"name": "赤りんご"}]
}
```

### 最終的な HTML 構造

```html
<form id="searchForm" data-bind='{"keyword": "りんご"}'>
  <input name="keyword" value="りんご" />
</form>

<div data-fetch="/api/search" data-fetch-form="#searchForm" data-each="items">
  <p data-row data-bind='{"name":"青りんご"}'>青りんご</p>
  <p data-row data-bind='{"name":"赤りんご"}'>赤りんご</p>
</div>
```

### 表示結果

```
青りんご
赤りんご
```

---

## 11.5 `data-url-param`：URL のクエリを初期値に使う

ページ URL のクエリパラメータを自動で `data-bind` に反映します。
この属性は **値を持たない記述（属性名だけ）** で構いません。

### URL の例

```
/search.html?keyword=バナナ&page=2
```

### HTML 記述例

```html
<form data-url-param data-url-param-arg="query">
  <input name="keyword" />
  <input name="page" />
</form>
```

### 最終的な HTML 構造

```html
<form
  data-url-param
  data-url-param-arg="query"
  data-bind='{"query":{"keyword":"バナナ","page":"2"}}'
>
  <input name="keyword" value="バナナ" />
  <input name="page" value="2" />
</form>
```

### 表示結果

```
keyword: バナナ
page: 2
```

---

## 11.6 `data-click-history`：検索条件を URL に反映する

Haori では、検索ボタンなどに `data-click-history` を指定することで、**現在のフォームの入力内容を URL のクエリパラメータとして追加** できます。
これにより、**検索結果の状態を URL として共有したり、ブラウザの戻るボタンで状態を復元したり** することができます。

この機能は `history.pushState()` を使って履歴を追加します。

---

### HTML 記述例

```html
<form id="searchForm" data-bind='{"q": "ぶどう"}'>
  <input name="q" />
</form>

<button
  data-click-fetch="/api/search"
  data-click-form="#searchForm"
  data-click-history
>
  検索
</button>
```

---

### クリック時の動作

1. フォーム `#searchForm` の `data-bind` 値（例：`{ "q": "ぶどう" }`）を取得
2. `/api/search` にデータを送信（`data-click-fetch` により）
3. 現在のページ URL に `?q=ぶどう` を追加
   - 例：`/search.html` → `/search.html?q=ぶどう`

4. `history.pushState()` によってこの状態を履歴に追加

---

### 最終的な HTML 構造

```html
<form id="searchForm" data-bind='{"q": "ぶどう"}'>
  <input name="q" value="ぶどう" />
</form>

<button
  data-click-fetch="/api/search"
  data-click-form="#searchForm"
  data-click-history
>
  検索
</button>
```

---

### 表示結果・動作

- ユーザーが「ぶどう」と入力し、「検索」ボタンをクリック
- URL が `/search.html?q=ぶどう` に変化
- 検索結果が画面に表示される（`data-click-bind` 等と併用することで）
- ブラウザの戻るボタンで **検索前のフォーム状態に戻ることが可能**

---

### 補足

- `data-click-form` により、フォームから取得した値が URL クエリに変換されます。
- ボタンをクリックしたタイミングで履歴が追加されます。
- 通信の有無に関係なく、履歴だけ追加したい場合にも使用可能です。

---

## 11.7 `data-fetch-force`：非表示でも通信を強制する

Haori-JS では、通常 `data-if` により非表示状態（`data-if-false`）になっている要素では、`data-fetch` や `data-click-fetch` などの通信処理は実行されません。
しかし、`data-fetch-force` 属性を追加することで、**非表示の状態であっても通信処理を強制的に実行**することができます。

---

### 利用シーンの例

- 非表示のセクションであってもバックグラウンドでデータ取得を行いたいとき
- **フェッチ結果によって `data-if` の評価を変化させ、要素を表示させたいとき**

---

### HTML記述例

```html
<div data-if="user.active" data-fetch="/api/user/123" data-fetch-force>
  <p>{{user.name}}</p>
</div>
```

---

### 最終的なHTML構造（初期状態：`user.active = false`）

```html
<div
  data-if="user.active"
  data-if-false
  style="display: none"
  data-fetch="/api/user/123"
  data-fetch-force
></div>
```

---

### フェッチレスポンスの内容

```json
{
  "user": {
    "name": "佐藤",
    "active": true
  }
}
```

---

### 表示結果

- 初期状態では `<div>` は非表示
- フェッチ成功により `data-bind` が更新され、`user.active = true` に変化
- `data-if="user.active"` の評価が true になるため、要素が表示され、内部の内容がレンダリングされる

```
佐藤
```

---

### 補足仕様

- `data-fetch-force` は、非表示中でも強制的に `data-fetch` を実行します。
- フェッチ結果はその要素自身の `data-bind` に設定されます。
- その結果、`data-if` の条件が true に変われば、DOMが再表示され、プレースホルダも再評価されます。
- `data-fetch-form` や `data-fetch-bind` と組み合わせることも可能です。

---

### 使用上の注意

- `data-if` によって非表示となっていても、スコープは保持されており、`data-fetch-force` によってスコープの `data` が更新されます。
- これにより、**`data-if` の条件式が変化して true になると、DOMが復元・表示されます。**
- この仕組みを活用することで、「表示されていないが条件が満たされたら出現するUI」を構成できます。

---

# 第12章：配列と行操作の深掘り

この章では、`data-each` による繰り返し表示と、`data-row-add`、`data-row-remove` などを使った **配列の動的な行操作**について詳しく説明します。
フォームとの連携を前提に、**実際にデータを増減・並び替えるための技術的な要素**を順に解説していきます。

---

## 12.1 `data-row` とは何か

`data-each` によって繰り返される各行には、自動的に `data-row` または `hor-row` が付与されます。
これは「この要素は 1 行分の入力（または表示）を担当する」というマークであり、行操作系の属性の対象になります。

---

## 12.2 行の追加：`data-row-add`

`data-row-add` をクリックすると、そのボタンが属している `data-row` を複製して、**新しい行が直後に追加されます**。
複製された行は **初期化された状態**になり、`input` や `textarea` は空欄になります。ただし `value` 属性がある場合は、その値が初期値として適用されます。

### HTML 記述例：

```html
<form data-form-arg="items">
  <div data-each="items">
    <div data-row>
      <input name="name" />
      <button type="button" data-row-add>追加</button>
    </div>
  </div>
</form>
```

### 最終的な HTML 構造（初期状態）：

```html
<form data-bind='{"items":[{"name":"りんご"}]}'>
  <div data-each="items">
    <div data-row data-bind='{"name":"りんご"}'>
      <input name="name" value="りんご" />
      <button type="button" data-row-add>追加</button>
    </div>
  </div>
</form>
```

### 表示結果：

```
[りんご] [追加]
```

（「追加」ボタンを押すと、もう 1 行、空の初期値を持つ空行が追加される）

---

## 12.3 行の削除：`data-row-remove`

`data-row-remove` をクリックすると、その行が削除されます。ただし、**その `data-each` に属する行が 1 つしかない場合は削除されず、内容がリセット** されます。
このときも、`value` 属性が指定されていればその値に戻され、なければ空欄になります。

### HTML 記述例：

```html
<form data-form-arg="items">
  <div data-each="items">
    <div data-row>
      <input name="name" value="みかん" />
      <button type="button" data-row-remove>削除</button>
    </div>
  </div>
</form>
```

### 最終的な HTML 構造（初期状態）：

```html
<form data-bind='{"items":[{"name":"みかん"}]}'>
  <div data-each="items">
    <div data-row data-bind='{"name":"みかん"}'>
      <input name="name" value="みかん" />
      <button type="button" data-row-remove>削除</button>
    </div>
  </div>
</form>
```

### 表示結果：

```
[みかん] [削除]
```

（「削除」ボタンを押すと、`value` が `"みかん"` に戻る）

---

## 12.4 行の並べ替え：`data-row-prev`, `data-row-next`

- `data-row-prev`：行を 1 つ上へ移動します。
- `data-row-next`：行を 1 つ下へ移動します。

行の順番が変わると、バインドされた配列の順番も変更されます。

### HTML 記述例：

```html
<form data-form-arg="tasks">
  <div data-each="tasks">
    <div data-row>
      <input name="label" />
      <button type="button" data-row-prev>↑</button>
      <button type="button" data-row-next>↓</button>
    </div>
  </div>
</form>
```

### 表示結果（データが `[{"label": "A"}, {"label": "B"}]` のとき）：

```
[A] [↑] [↓]
[B] [↑] [↓]
```

（ボタンで並び順を自由に変更可能）

---

## 12.5 複数の入力項目を含む行

1 つの `data-row` の中に複数の `input`, `select`, `textarea` を含めることができます。
その行は **1 つのオブジェクト**として構成され、`name` 属性の値がキーになります。

### HTML 記述例：

```html
<form data-form-arg="users">
  <div data-each="users">
    <div data-row>
      <input name="name" value="佐藤" />
      <input name="email" value="sato@example.com" />
    </div>
  </div>
</form>
```

### 表示結果：

```
[佐藤] [sato@example.com]
```

（送信時のデータは `{ name: "佐藤", email: "sato@example.com" }`）

---

## 12.6 初期値の指定方法

フォーム部品の初期値は、次の HTML 属性で指定できます：

| 要素の種類                                        | 初期値の指定方法    |
| ------------------------------------------------- | ------------------- |
| `<input>`, `<textarea>`                           | `value="..."`       |
| `<input type="checkbox">`, `<input type="radio">` | `checked`           |
| `<select>` + `<option>`                           | `selected` を付ける |

行の複製（`data-row-add`）やリセット（`data-row-remove`）のときには、これらの値が自動的に反映されます。

---

## 12.7 配列が空のときに 1 行だけ表示する

`data-each` の対象配列が空のとき、空欄の 1 行だけをあらかじめ表示させたい場合は、初期バインド値に空のオブジェクトを 1 つ含めておきます。

### HTML 記述例：

```html
<form data-form-arg="items">
  <div data-each="items">
    <div data-row>
      <input name="name" placeholder="商品名" />
    </div>
  </div>
</form>
```

（初期バインド：`{"items":[{}]}`）

### 表示結果：

```
[（空欄）]
```

---

## 12.8 行操作に関するイベント

Haori は、行の追加・削除・移動時に以下のカスタムイベントを自動的に発火します。

| イベント名         | 説明                   |
| ------------------ | ---------------------- |
| `haori:row-add`    | 行が追加されたとき     |
| `haori:row-remove` | 行が削除されたとき     |
| `haori:row-move`   | 行が並び替えられたとき |

### `detail` オブジェクトの内容：

```ts
{
  form: HTMLFormElement,
  row: HTMLElement,
  index: number,
  action: "add" | "remove" | "move-prev" | "move-next"
}
```

これらを使うことで、追加や削除のタイミングでカスタム処理を挿入することができます。

---

## 12.9 `data-each-key` による差分追跡

`data-each-key` 属性は、`data-each` によって繰り返し描画される要素において、**差分描画を正確に行うための一意なキー**を指定するものです。
配列の変更に対して、キーに基づいた差分比較が行われ、最小限の DOM 操作で再描画が実行されます。

---

### 基本仕様

- `data-each-key="id"` のように指定すると、各行の `data-bind` に含まれるキー（例：`id`）の値をもとに、行の同一性を判定します。
- DOM の並び順が変わった場合でも、**キーが一致していればノードを再利用**し、プレースホルダのみ再評価されます。
- キーが一致しない行は削除され、新しい行はテンプレートから再生成されます。

---

### HTML記述例

```html
<div
  data-bind='{"items":[{"id":1,"name":"A"},{"id":2,"name":"B"}]}'
  data-each="items"
  data-each-key="id"
>
  <p>{{name}}</p>
</div>
```

---

### 最終的なHTML構造

```html
<div data-each="items" data-each-key="id">
  <p data-row="1" data-bind='{"id":1,"name":"A"}'>A</p>
  <p data-row="2" data-bind='{"id":2,"name":"B"}'>B</p>
</div>
```

---

### 表示結果

```
A
B
```

---

### 差分判定と `data-row` の付与

- `data-each-key` が指定されている場合、差分描画時に自動で `data-row="キーの値"` が付与されます。
- この属性により、開発者は描画された行とデータの対応関係を簡単に確認できます。

---

### キーが指定されていない場合

- `data-each-key` がない場合、Haori は各行の `data-bind` 属性値（JSON文字列）をもとに構造比較を行い、差分を判定します。
- オブジェクトの順序や構造が微妙に異なると、同じ行でも別物とみなされるため、**不必要な再描画が発生する可能性があります**。

---

### 差分適用の順序

- 差分描画は常に **DOMの上から下（top-down）順** に適用されます。
- 親要素の描画後に、子要素の `data-each` が再帰的に処理されます。

---

### 注意点

- キー値は文字列として扱われ、`data-row="1"` のようにDOM上に反映されます。
- `data-row` はプレースホルダ評価にも影響しませんが、差分追跡とデバッグの助けになります。
- `data-each-key` の値が重複していると、描画が不安定になる可能性があります（キーは一意であるべきです）。

---

### 開発上の推奨

- 配列内のオブジェクトに一意なキー（`id` など）がある場合は、**必ず `data-each-key` を指定**してください。
- 特に差分更新や並び替えがある UI では、描画の最適化と正確性のために不可欠です。

---

## 12.10 差分描画の順序と再評価

Haori-JS において `data-each` を用いた繰り返し表示では、配列の変更に応じて差分描画（差分パッチ）が適用されます。この節では、**その描画・再評価の順序やスコープとの連携**について解説します。

---

### 差分描画の順序：top-down 処理

差分パッチは常に **上から下（top-down）** の順で適用されます。
これにより、描画中の依存関係（入れ子構造やプレースホルダ評価）が安定し、表示の順序が保たれます。

```text
親 data-each → 各行の処理 → 子 data-each（再帰的に処理）
```

> 行の削除 → 並び替え → 挿入の順で行われます。

---

### プレースホルダの再評価順序：DOM順

- 各行内のプレースホルダ（`{{...}}`）は、**DOM に登場する順に順次評価され、即座に反映されます**。
- 属性内のプレースホルダも含め、評価順はそのエレメント内の並びに従います。

> これにより、上から下へ順に再評価が行われ、UIの安定表示が実現されます。

---

### ネスト構造への対応

- `data-each` の中にさらに `data-each` が存在する場合、Haori は **親の `data-each` が描画完了してから、子の `data-each` を再帰的に評価**します。
- 親スコープ → 子スコープ の順に `bindScope()` と `evaluateDataEach()` が実行されます。

---

### 再評価と `data-if` の影響

- 非表示（`data-if="false"`）となっている行は、**`visible = false` のため再評価対象外**になります。
- プレースホルダ・属性・子の `data-each` なども評価されません。
- `data-if` の条件が true に変化して再表示されると、その時点で評価・描画が行われます。

---

### スコープとの関係

- 差分描画において行が再利用される場合、その行の `BindingScope` も引き続き使用されます。
- 差分によって新規行が追加された場合は、`cloneNode()` の後に `bindScope()` によって新しいスコープが生成されます。

---

### 補足：依存トラッキングは使用しない

- Haori-JS はプレースホルダの依存キーを自動追跡する機構（依存トラッキング）を持ちません。
- 代わりに、**スコープ単位で一括再評価**を行う設計になっています。

---

### 表示例（ネストされた data-each）

```html
<div
  data-bind='{"rows":[{"items":[1,2]},{"items":[3,4]}]}'
  data-each="rows"
  data-each-arg="row"
>
  <div data-each="row.items" data-each-arg="item">
    <span>{{item}}</span>
  </div>
</div>
```

この例では以下の順序で描画・再評価が行われます：

1. rows\[0].items → 1, 2
2. rows\[1].items → 3, 4

---

### まとめ

| 項目                            | 挙動                                                       |
| ------------------------------- | ---------------------------------------------------------- |
| 差分適用の順序                  | 上から下（top-down）                                       |
| プレースホルダ評価順            | DOM 順（属性・テキストノードを含む）                       |
| ネストされた `data-each` の評価 | 親が終わってから子を再帰的に処理                           |
| 非表示中（`data-if="false"`）   | 再評価されない。条件が true になったタイミングで評価される |
| 依存トラッキング                | 使用しない（スコープ単位で再評価）                         |

---

## 12.11 手動編集とバインドの上書き

Haori-JS においては、`data-each` によって繰り返し表示された行に対してユーザーが手動で編集・追加した場合でも、**親の `data-bind` が更新されると、その行は再描画され、変更内容が破棄される可能性がある**点に注意が必要です。

---

### 基本方針

- Haori-JS は `data-bind` を UI 状態の唯一の正とみなし、外部フェッチや操作によって `data-bind` が変更されると、**その内容で画面が再構成されます**。
- 手動入力された値や動的に追加された行は、更新後のバインドデータに含まれない限り、**DOMから消去されます**。

---

### HTML記述例（修正済）

```html
<form data-bind='{"items":[{"name":"りんご"}]}' data-form-object="items">
  <div data-each="items">
    <div data-row>
      <input name="name" />
    </div>
  </div>
  <button type="button" data-row-add data-click-data='{"name": "新規"}'>
    追加
  </button>
</form>

<button data-click-fetch="/api/items" data-click-form data-click-bind="form">
  更新
</button>
```

---

### 操作と結果の例

1. ユーザーが「追加」を押して行を追加し、「ばなな」と入力
2. 「更新」をクリック → `/api/items` から新しい配列が返る
3. `form` 要素にある `data-bind` が上書きされ、全行が再評価・再描画

→ 結果：フォームに表示されていた「ばなな」の行は消去され、サーバーから取得した行に差し替えられる

---

### 表示結果（フェッチ前後）

**フェッチ前（手動追加済）**：

```json
{
  "items": [
    { "name": "りんご" },
    { "name": "ばなな" } ← 手動入力
  ]
}
```

**フェッチ後のレスポンス例**：

```json
[{"name": "みかん"}, {"name": "ぶどう"}]
```

**更新後の表示**：

```
[みかん]
[ぶどう]
```

「ばなな」の行は失われています。

---

### 対応策（任意）

- 編集内容を維持したい場合、送信前にバインド値を一時保存してからマージする処理を行う必要があります。
- `data-each-key` を適切に指定しておけば、同一キーの行は再利用されるため、編集内容が保持されることもあります（ただし保証はされません）。

---

### 注意点のまとめ

| 状況                                                | 結果                                                   |
| --------------------------------------------------- | ------------------------------------------------------ |
| `data-click-fetch` + `data-click-bind` による上書き | 対象の `data-bind` が強制的に上書きされる              |
| 手動で入力・追加した行                              | 上書き結果に含まれていなければ削除される               |
| `data-each-key` がない                              | 差分追跡ができず、すべての行が再生成される可能性が高い |

---

## 12.12 開発者モードでの差分可視化

Haori-JS では、開発者向けの機能として、`data-each` による差分描画が行われた際に、**新しく挿入された行の要素に一時的なクラスを付与**して視覚的に確認できる仕組みが用意されています。

---

### クラス名：`haori-patched`

- `data-each` の評価結果として DOM に新たに追加されたノードには、`haori-patched` というクラスが一時的に付与されます。
- このクラスは、**開発者モードが有効なときのみ**付与されます。
- 約5秒後、自動的にこのクラスは削除されます。

---

### 開発者モードの有効化条件

以下のいずれかの条件を満たすと、開発者モードが有効になります：

1. `<script data-dev>` 属性が付いた `<script>` タグが存在する場合
2. 現在のページ URL に `localhost` が含まれている場合

---

### CSSによる視覚化例

以下のような CSS を使用することで、差分描画された行を強調表示できます。

```css
.haori-patched {
  outline: 2px dashed orange;
  background-color: #fff8e1;
  transition: background-color 0.5s ease;
}
```

---

### 表示例

```html
<div data-each="items">
  <div data-row class="haori-patched">ぶどう</div>
</div>
```

このように差分適用された行に `haori-patched` が付き、背景色や枠線などで一時的に目立たせることができます。

---

### 補足：他の開発支援クラス

- 再評価されたノードには一時的に `haori-evaluated` クラスが付与されます（→ 第15章 参照）

---

### 注意事項

- 本機能はデバッグ・検証を目的としており、**本番環境では自動的に無効**になります。
- クラスは自動的に削除されるため、スタイルは一時的な効果にとどまります。

---

# 第13章：属性の評価とセキュリティ

Haori では、`{{...}}` プレースホルダを使って HTML の属性値やテキストにデータを展開しますが、この処理にはいくつかの評価ルールやセキュリティ制限が設けられています。
この章では、属性の評価方法や危険なコードの遮断、そして HTML 挿入の際の注意点について解説します。

---

## 13.1 プレースホルダの評価仕様

#### 評価失敗時の扱い

Haori では、式の評価結果が `null`、`undefined`、または `NaN` であった場合、プレースホルダの評価結果は空文字列 `""` として扱われます。  
また、式の構文エラーや実行時エラーが発生した場合も、該当プレースホルダは空として処理され、アプリケーションの動作には影響しません。  
※ 開発者モードが有効な場合、エラー内容は `console.warn` に出力されます。

Haori のプレースホルダは、`{{...}}` や `{{{...}}}` の形式で記述され、**JavaScript 式として評価**されます。

### 使用できる構文の例

- ドット記法：`user.name`
- 配列アクセス：`items[0]`
- 三項演算：`flag ? "有効" : "無効"`
- 関数呼び出し：`format(date)`
- 論理演算：`a && b`, `a || b`

> プレースホルダ内は `Function("return (...)")` により安全に評価されます。

---

## 13.2 禁止されている識別子と保護対象

#### 補足：評価時に使用できない識別子の一覧

以下の識別子はセキュリティ上の理由から使用できず、すべて `undefined` として扱われます：

```js
(this,
  window,
  globalThis,
  global,
  self,
  document,
  eval,
  Function,
  alert,
  constructor,
  __proto__);
```

セキュリティ上の理由から、以下のような危険な識別子や構文は使用できません。

### 禁止されている識別子の例

- `window`
- `document`
- `eval`
- `Function`
- `constructor`
- `__proto__`
- `this`

### 結果：

```html
<p>{{window.alert("危険")}}</p>
```

→ 評価エラーになり、何も表示されません。

---

## 13.X data-bind の構文エラー時の挙動

`data-bind` 属性に指定された JSON が構文的に不正（例：`{name: '山田'}` など）であった場合、Haori は空のオブジェクト `{}` を代替として使用します。  
この場合、スコープは正常に生成されますが、内部変数はすべて未定義となり、関連するプレースホルダは空になります。  
開発者モード時には、エラー内容を `console.warn` に出力します。

## 13.3 空のプレースホルダ構文は禁止

以下のような記述は**無効な式**とみなされ、評価できないため**禁止されています**。

### 使用禁止の例

```html
<p>{{}}</p>
```

→ 式が存在しないため、レンダリングエラーとなります。

---

## 13.4 属性値内でのプレースホルダ評価

Haori では、属性値の中にも `{{...}}` を含めることができます。

### HTML 記述例：

```html
<div data-bind='{"type": "primary"}'>
  <button class="btn btn-{{type}}">送信</button>
</div>
```

**最終的な HTML 構造：**

```html
<div data-bind='{"type": "primary"}'>
  <button class="btn btn-primary">送信</button>
</div>
```

**表示結果：**

「送信」ボタン（クラスによりスタイル変化）

---

## 13.5 属性の自動削除と復元の仕様

属性値がプレースホルダのみで構成されている場合、**評価結果が false になると属性そのものが削除**されます。

### 削除の条件：

```html
<button disabled="{{isDisabled}}">送信</button>
```

- `isDisabled = true` → `<button disabled>送信</button>`
- `isDisabled = false` → `<button>送信</button>`（属性が削除される）

### 削除される条件となる値（JavaScript の false 相当）：

- `false`
- `0`
- `""`（空文字）
- `null`
- `undefined`
- `NaN`

### 混在時の処理：

```html
<button class="btn-{{state}} btn-default">...</button>
```

- `state = null` → `class="btn- btn-default"`（空文字に置換され、属性は残る）

---

## 13.6 HTML として展開する：三重括弧構文

安全なデータに限り、HTML をそのまま挿入することも可能です。
トリプル波かっこ構文（`{{{...}}}`）は、要素の中身が「これだけ」の場合にだけ使えます。

- 他の文字やタグ、改行と一緒に混ぜて使うことはできません。
- 属性値の中でも使えません。
- もし他の文字やタグと一緒に使った場合や、属性値で使った場合は、通常のプレースホルダ（{{...}}）として扱われ、HTMLとしては展開されません。

### HTML 記述例：

```html
<div data-bind='{"html": "<b>強調</b>文"}'>
  <p>{{{html}}}</p>
</div>
```

**最終的な HTML 構造：**

```html
<div data-bind='{"html": "<b>強調</b>文"}'>
  <p><b>強調</b>文</p>
</div>
```

**表示結果：**

強調文（太字で表示）

> `{{{...}}}` を使う場合は、**HTML がサーバーでサニタイズ済であることを保証してください。**

---

## 13.7 プレースホルダ評価の再実行タイミング

### 補足：`data-if` による非表示状態のスコープは再評価されない

`data-if` によって表示条件が false になっているノード（`data-if-false` が付与されているノード）は、スコープ上 `visible: false` として扱われ、再評価や再描画の対象にはなりません。  
ただし、再び `data-if` の評価が true となって表示状態に復帰した場合は、そのタイミングでスコープが復元され、プレースホルダも再評価されます。

プレースホルダは、以下の条件で再評価され、DOM が更新されます。

- 該当エレメントの `data-bind` が更新されたとき
- 親の `data-bind` が更新されたとき（スコープ継承）
- 親の `data-if` の評価結果が変わったとき
- `data-each` によって行が再生成されたとき
- 属性値の中の `{{...}}` に影響する値が変わったとき

---

## 13.8 まとめ

| 特徴      | 内容                                           |
| --------- | ---------------------------------------------- |
| 安全性    | `window`, `eval` など危険な構文は評価不可      |
| 空構文    | `{{}}` は無効で禁止                            |
| 属性削除  | `{{key}}` 単独かつ false 評価で属性ごと削除    |
| HTML 展開 | `{{{key}}}` により innerHTML 挿入（要信頼性）  |
| 再評価    | `data-bind`, `data-if`, `data-each` などに連動 |

---

以上が、Haori における属性評価とセキュリティに関する仕様です。
テンプレートの自由度を保ちながら、セキュリティ上の安全性も確保できるように設計されています。

---

# 第14章：ハイブリッド属性設計と `hor-*` のルール

Haori では、すべての機能属性を `data-*` 形式だけでなく `hor-*` 形式でも記述できます。
これは、他のライブラリとの属性名競合を回避しつつ、HTML 属性による機能制御の柔軟性を保つための仕組みです。
本章では、このハイブリッド構文の意図と設計ルールを解説します。

---

## 14.1 `hor-*` 属性とは何か

### 基本の考え方

- Haori では、`data-bind` や `data-fetch` など、あらゆる機能属性を `hor-*` に置き換えることができます。
- `hor-bind`, `hor-fetch` などは `data-bind`, `data-fetch` と**完全に同等**に動作します。

### 使用目的

- `data-*` の命名衝突を避けたいとき（例：Vue や Alpine.js との併用）
- Haori 専用属性を視覚的に明示したいとき

---

## 14.2 使用例：`data-*` と `hor-*` の等価性

### HTML 記述例（data-\*）：

```html
<div data-bind='{"name": "山田"}'>
  <p>{{name}}</p>
</div>
```

### HTML 記述例（hor-\*）：

```html
<div hor-bind='{"name": "山田"}'>
  <p>{{name}}</p>
</div>
```

### 最終的な HTML 構造（data-\*）：

```html
<div data-bind='{"name": "山田"}'>
  <p>山田</p>
</div>
```

### 最終的な HTML 構造（hor-\*）：

```html
<div hor-bind='{"name": "山田"}'>
  <p>山田</p>
</div>
```

### 表示結果：

```
山田
```

---

## 14.3 自動的に付与される属性のプレフィックスルール

---

### 14.3 自動的に付与される属性のプレフィックスルール

Haori-JS では、条件分岐や繰り返し処理などの結果に応じて、自動的に属性が付与されることがあります。これらの自動付与属性も、元の属性が `data-*` であれば `data-*` プレフィックス、`hor-*` であれば `hor-*` プレフィックスで出力されます。

以下は代表的な自動付与属性の一覧です。

| 元の属性        | 自動付与される属性（data-\* 使用時） | hor-\* 使用時      |
| --------------- | ------------------------------------ | ------------------ |
| `data-if`       | `data-if-false`                      | `hor-if-false`     |
| `data-each`     | `data-row`                           | `hor-row`          |
| `data-each-key` | `data-row="キー値"`                  | `hor-row="キー値"` |

> 例：`<div hor-each="list" hor-each-key="id">` の場合、各行には `hor-row="1"` や `hor-row="2"` のような属性が付与されます。

#### 差分描画におけるクラス付与

差分描画（例：`data-each` による再評価）によって新しく DOM 要素が挿入された場合、**開発者モードが有効であれば**その要素には `haori-patched` クラスが一時的に付与されます。これにより、CSS で強調表示などの視覚的な確認が可能になります。

```css
/* 例：差分適用された要素を赤枠で表示 */
.haori-patched {
  outline: 2px solid red;
  animation: fadeOut 5s forwards;
}
```

このクラスは数秒後に自動的に削除されるため、ユーザーに影響を与えることはありません。

---

### 14.4 `data-*` と `hor-*` の併用ルール

Haori-JS では、すべての `data-*` 属性は `hor-*` 属性としても指定可能です。両者は完全に同等の機能を持ち、同じ動作をします。ただし、以下のような**併用ルール**が存在します。

#### 属性の混在は可能

同じ要素内で `data-*` 属性と `hor-*` 属性を**併用すること自体は可能**です。ただし、それぞれの属性が**異なる機能**である必要があります。

```html
<!-- OK：異なる機能を併用 -->
<div data-if="show" hor-each="list"></div>
```

#### 同一機能の併用は禁止

同じ機能を提供する属性（例：`data-if` と `hor-if`）を**同一の要素に併用することは禁止**されています。Haori-JS の動作が不定になる恐れがあるため、必ずどちらか一方に統一してください。

```html
<!-- NG：同じ機能を併用 -->
<div data-if="isOpen" hor-if="isVisible"></div>
```

#### 開発者モードでの警告

開発者モード（`<script data-dev>` がある、または `localhost` 上で実行）では、**このような同一機能の併用が検出された場合に `console.warn()` による警告が出力されます**。

```txt
[Haori warning] 同一要素に data-if と hor-if を併用しないでください。動作が不定になります。
```

この警告は開発中のミスを防ぐためのものであり、本番環境では出力されません。ただし、**併用自体がサポートされていない仕様である点に変わりはない**ため、常に片方に統一してください。

---

## 14.5 推奨される記述スタイル

Haori では、属性の接頭辞をプロジェクト内で揃えることを推奨しています。

### 推奨スタイル

- 小規模・シンプルな記述 → `data-*` に統一
- 他ライブラリとの併用／テンプレート管理 → `hor-*` に統一
- 明示的に「Haori 固有機能」と示したい場合 → `hor-*` 推奨

### スタイル統一のメリット

- チーム内での可読性向上
- CSS や JS による対象指定が容易
- バグの混入リスクの低下（混在による処理ミス防止）

---

## 14.6 活用例：Vue.js などとの併用

以下のように、他のライブラリの属性と `data-*` が衝突する場合には `hor-*` に切り替えることで安全に共存できます。

```html
<!-- Vueのv-ifと衝突しないように hor-if を使う -->
<div v-if="ready" hor-bind='{"msg":"こんにちは"}'>
  <p>{{msg}}</p>
</div>
```

---

## 14.7 FAQ：`hor-*` に関するよくある質問

### Q. `hor-*` は HTML 標準属性ですか？

いいえ、HTML の標準ではなく、Haori が独自に解釈・処理する拡張属性です。

---

### Q. `data-*` と `hor-*` どちらを選ぶべきですか？

- **他のライブラリを使わない場合** → `data-*` で問題ありません
- **競合や名前衝突が懸念される場合** → `hor-*` の使用をおすすめします

---

### Q. `hor-*` 属性は後方互換がありますか？

はい。`data-*` 形式のすべての属性は `hor-*` に変えても**同じように動作**します。

---

## まとめ

- `hor-*` は Haori の `data-*` 属性の代替表記であり、機能は同等
- 自動付与される属性も、元の接頭辞に従って生成される
- `data-*` と `hor-*` は同時使用可能だが、**同じ機能の併用は禁止**
- スタイルは `data-*` または `hor-*` のいずれかに統一することが推奨される

---

# 第15章：イベントとフック機構

Haori では、DOM の初期化や通信処理など、ライブラリの内部動作に応じて**独自のカスタムイベント**が発火されます。
これにより、開発者は Haori の処理と連動して**追加のロジックを外部から差し込む**ことができます。
この章では、Haori が発火するイベント一覧と、代表的なイベントの活用方法を説明します。

---

## 15.1 イベントの概要

Haori が発火するイベントはすべて、プレフィックスとして `haori:` を持つカスタムイベントです。
イベントには、追加情報（`event.detail`）が含まれており、対象の要素やバインドデータなどを参照できます。

---

## 15.2 主なカスタムイベント一覧

| イベント名                                                                            | タイミング・用途                                         |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `haori:ready`                                                                         | ページ全体で Haori の初期化が完了したとき（1 回のみ）    |
| `haori:init`                                                                          | 各要素の初期処理（バインド・表示制御など）が完了したとき |
| `haori:bind-update`                                                                   | `data-bind` の内容が更新されたとき                       |
| `haori:fetch-start` / `haori:fetch-success` / `haori:fetch-error` / `haori:fetch-end` | 通信処理の開始／成功／失敗／完了時                       |
| `haori:dialog-open` / `haori:dialog-close`                                            | ダイアログが開かれた・閉じられたとき                     |
| `haori:row-add` / `haori:row-remove` / `haori:row-move`                               | 行の追加／削除／移動が行われたとき                       |
| `haori:message-update`                                                                | `data-message` にメッセージが設定されたとき              |
| `haori:import-load`                                                                   | `data-import` による外部 HTML の読み込み完了時           |

---

## 15.3 イベント使用例：バインドの更新を検知

`data-bind` の内容が変化した際に発火される `haori:bind-update` を使って、更新を監視します。

**HTML 記述例：**

```html
<form id="userForm" data-bind='{"name": "花子"}'>
  <input name="name" />
</form>

<script>
  document
    .getElementById('userForm')
    .addEventListener('haori:bind-update', e => {
      console.log('更新されたデータ：', e.detail.newBind);
    });
</script>
```

**最終的な HTML 構造：**

```html
<form id="userForm" data-bind='{"name": "花子"}'>
  <input name="name" value="花子" />
</form>
```

**動作結果：**

- 入力欄を変更するたびに `haori:bind-update` が発火
- コンソールに以下のように出力される：

```
更新されたデータ： { name: "入力値" }
```

---

## 15.4 イベント使用例：フェッチ成功時に処理を追加

通信成功後に何かしらの処理を追加したい場合は、`haori:fetch-success` を使用します。

**HTML 記述例：**

```html
<div id="result" data-fetch="/api/user"></div>

<script>
  document
    .getElementById('result')
    .addEventListener('haori:fetch-success', e => {
      console.log('取得成功：', e.detail);
    });
</script>
```

**最終的な HTML 構造：**

```html
<div id="result" data-fetch="/api/user"></div>
```

**レスポンスの JSON（例）：**

```json
{
  "name": "田中",
  "age": 42
}
```

**動作結果：**

```
取得成功： { data: { name: "田中", age: 42 }, url: "/api/user", status: 200 }
```

---

## 15.5 イベント使用例：通信エラーを検知する

通信に失敗した場合、Haori は対象エレメントに対して `haori:fetch-error` というカスタムイベントを発火します。

このイベントを使うことで、独自のエラーハンドリングやログ記録、通知メッセージの表示などを柔軟に実装することが可能です。
`data-fetch` や `data-click-fetch` など、すべてのフェッチ系処理に共通して利用できます。

---

### HTML 記述例

```html
<div id="result" data-fetch="/api/error"></div>

<script>
  const el = document.getElementById('result');

  el.addEventListener('haori:fetch-error', e => {
    console.error('通信エラー:', e.detail);
    alert('サーバーに接続できませんでした');
  });
</script>
```

---

### 最終的な HTML 構造

```html
<div id="result" data-fetch="/api/error"></div>
```

---

### 表示結果

- `/api/error` への通信に失敗すると `haori:fetch-error` が自動的に発火される。
- イベントの `detail` に含まれる情報を元に、エラー通知やログ記録を行える。
- この例では `alert` によって「サーバーに接続できませんでした」と表示される。

---

### イベントオブジェクトの内容

`haori:fetch-error` の `event.detail` には、以下のような情報が格納されます：

```ts
{
  url: string,         // 通信先URL
  status: number,      // HTTPステータスコード（0の場合はネットワークエラーなど）
  message?: string,    // サーバーから返されたエラーメッセージ（存在すれば）
  error?: any          // その他のエラー情報（例外オブジェクトなど）
}
```

---

> `haori:fetch-error` は、ネットワークエラーだけでなく、サーバーからの 400 番台や 500 番台のレスポンスにも対応します。
> フォールバック処理やユーザーへの通知を行いたい場合に活用できます。

---

## 15.6 イベント使用例：行の追加を検知する

`data-row-add` による複製操作のあとには `haori:row-add` が発火します。行の検知や制御に活用できます。

**HTML 記述例：**

```html
<form data-bind='{"list": [{"name": "A"}]}' data-form-arg="list">
  <div data-each="list">
    <div data-row>
      <input name="name" />
      <button type="button" data-row-add>追加</button>
    </div>
  </div>
</form>

<script>
  document.querySelector('form').addEventListener('haori:row-add', e => {
    console.log('行が追加されました。インデックス：', e.detail.index);
  });
</script>
```

**最終的な HTML 構造（ボタンを押した直後）：**

```html
<form data-bind='{"list": [{"name": "A"}, {"name": ""}]}'>
  <div data-each="list">
    <div data-row data-bind='{"name": "A"}'>
      <input name="name" value="A" />
      <button type="button" data-row-add>追加</button>
    </div>
    <div data-row data-bind='{"name": ""}'>
      <input name="name" value="" />
      <button type="button" data-row-add>追加</button>
    </div>
  </div>
</form>
```

**表示結果：**

- 新しい入力欄が 1 つ追加される
- コンソールに `行が追加されました。インデックス：1` と出力

---

## 15.7 イベントの `detail` 情報一覧

以下はイベントで提供される `event.detail` オブジェクトの例です。

| イベント名            | `event.detail` 内容              |
| --------------------- | -------------------------------- |
| `haori:init`          | `{ element, bind }`              |
| `haori:bind-update`   | `{ element, newBind, oldBind? }` |
| `haori:fetch-success` | `{ data, url, status }`          |
| `haori:row-add` 等    | `{ form, row, index, action }`   |
| `haori:import-load`   | `{ url, success, error? }`       |

---

## 15.8 注意点と補足

- 各イベントは **カスタムイベント（CustomEvent）** として発火されます
- 通常の `addEventListener` で監視可能です
- イベント伝播を活用した親要素での一括監視も可能です
- `haori:*` イベントは仕様として安定しており、**今後も互換性が保たれます**

---

## 15.9 再評価ノードの可視化：`haori-evaluated`

Haori-JS は、`data-bind` の変更や外部フェッチなどによって DOM の再評価が発生した際、**再評価されたノードに `haori-evaluated` クラスを一時的に付与**することで、開発者が動作を視覚的に追跡できるように支援しています。

---

### 機能の概要

- 任意のノードが再評価されると、そのノードの `classList` に `haori-evaluated` クラスが追加されます。
- このクラスは約5秒間保持された後、自動的に削除されます。
- **開発者モードが有効な場合のみ**適用されます。

---

### 開発者モードの条件（再掲）

開発者モードは次のいずれかで有効になります：

1. `<script data-dev>` 属性が存在する
2. URL に `localhost` を含む

---

### 視覚強調の例（CSS）

以下の CSS を設定することで、再評価されたノードを強調表示できます。

```css
.haori-evaluated {
  outline: 1px solid #4caf50;
  background-color: #e8f5e9;
  transition: background-color 0.5s ease;
}
```

---

### 使用例

```html
<div class="haori-evaluated">合計：3200円</div>
```

このように、再評価されたラベルやエリアが一時的に強調されることで、更新処理の視認性が向上します。

---

### 注意事項

- この機能は **自動的に削除される一時的なクラス付与**であり、本番環境では発生しません。
- DOMの構造には影響せず、表示のみに限定されます。
- 繰り返し再評価されるたびに、クラスは再付与されます。

---

# 第16章：拡張実装ガイドライン

この章では、Haori を**JavaScript から拡張・制御する方法**について解説します。
属性だけでは実現できない動作や、外部 UI ライブラリとの連携を行う際に必要となる知識をまとめています。

主に以下の場面で活用されます：

- Bootstrap や独自モーダルと連携したアラート・ダイアログ制御
- カスタム通知（トースト）の実装
- DOM ノードの複製（内部状態含む）
- イベントハンドラによる外部連携やデバッグ

---

## 16.1 Haori API の一覧

Haori はグローバル変数 `Haori` に以下の関数を提供しています：

| 関数名                          | 概要                                  | 戻り値             |
| ------------------------------- | ------------------------------------- | ------------------ |
| `Haori.alert(message)`          | モーダルアラートを表示                | `Promise<void>`    |
| `Haori.confirm(message)`        | 確認モーダルを表示                    | `Promise<boolean>` |
| `Haori.message(message, type?)` | 通知メッセージを表示                  | `void`             |
| `Haori.dialogOpen(selector)`    | 指定要素を開く                        | `void`             |
| `Haori.dialogClose(selector)`   | 指定要素を閉じる                      | `void`             |
| `Haori.cloneElement(element)`   | DOM 要素を Haori の内部状態込みで複製 | `Element`          |

---

## 16.2 API の使用例

### アラートの表示

```javascript
await Haori.alert('保存が完了しました');
```

---

### 確認ダイアログの表示と分岐処理

```javascript
const confirmed = await Haori.confirm('本当に削除しますか？');
if (confirmed) {
  Haori.message('削除されました', 'success');
}
```

---

### トースト通知の表示

```javascript
Haori.message('データを更新しました', 'info');
```

---

### ダイアログの開閉制御

```javascript
Haori.dialogOpen('#myDialog');
Haori.dialogClose('#myDialog');
```

---

### DOM ノードの複製

```javascript
const original = document.querySelector('.template');
const clone = Haori.cloneElement(original);
document.body.appendChild(clone);
```

---

## 16.3 API のオーバーライド（カスタム実装）

以下は Bootstrap モーダルを使った例です：

```javascript
Haori.alert = async message => {
  const modal = document.getElementById('customAlert');
  modal.querySelector('.alert-message').textContent = message;

  await new Promise(resolve => {
    modal.querySelector('.btn-ok').onclick = () => resolve();
    bootstrap.Modal.getOrCreateInstance(modal).show();
  });
};
```

---

## 16.4 イベント連携・フックの活用

### 例：バインド更新を検知して処理する

```javascript
document.addEventListener('haori:bind-update', e => {
  console.log('データが更新されました', e.detail.newBind);
});
```

---

### 例：モーダルが開いた時の処理

```javascript
document.addEventListener('haori:dialog-open', e => {
  console.log('ダイアログが開かれた', e.detail.selector);
});
```

---

## 16.5 DOM 複製に関する注意点

### ⚠ cloneNode() は使用しないでください

Haori は、DOM 要素の構造だけでなく、内部のバインディング状態やイベントハンドラなども保持しています。
JavaScript 標準の `element.cloneNode(true)` を使用すると、**内部状態が複製されず、Haori の動作が失われます**。

#### NG 例：

```javascript
// これはNG：Haoriのバインディングが壊れる
const clone = document.querySelector('.template').cloneNode(true);
document.body.appendChild(clone);
```

#### OK な方法：

```javascript
const clone = Haori.cloneElement(document.querySelector('.template'));
document.body.appendChild(clone);
```

`Haori.cloneElement()` を使用すると、**Haori が内部的に保持している状態やバインディングも含めて安全に複製**できます。

---

## 16.6 API と属性の組み合わせ例

以下は、ボタンを押すと確認ダイアログを出し、OK なら API を呼び出してメッセージを表示する例です。

### HTML 記述例：

```html
<button id="deleteButton">削除</button>
<div id="resultArea">{{message}}</div>
```

### JavaScript：

```javascript
document.getElementById('deleteButton').onclick = async () => {
  const ok = await Haori.confirm('本当に削除しますか？');
  if (!ok) return;

  const response = await fetch('/api/delete', {method: 'POST'});
  const json = await response.json();

  document
    .getElementById('resultArea')
    .setAttribute('data-bind', JSON.stringify({message: json.message}));
  Haori.message('削除しました', 'success');
};
```

### フェッチレスポンス例：

```json
{
  "message": "削除が完了しました"
}
```

### 最終的な HTML 構造：

```html
<div id="resultArea" data-bind='{"message": "削除が完了しました"}'>
  削除が完了しました
</div>
```

### 表示結果：

```
削除が完了しました
```

---

## 16.7 `data-if` による非表示処理の制御

Haori-JS における `data-if` の条件表示は、2025年の仕様変更により、従来の「DOMから完全に削除し、コメントノードで復元位置を管理する方式」から、**DOM上に要素を残したまま `style.display` で制御する方式**へと変更されました。

#### 非表示時の挙動

- `data-if` の評価結果が false の場合、該当エレメントは **DOMに残されたまま**、`style.display = "none"` が適用されて非表示になります。
- 子要素（内部ノード）は DOM から削除され、復元時にはテンプレートノードから再生成されます。
- DOMには `data-if-false` 属性が自動的に付与され、エレメントが非表示状態であることを示します（属性値はなし）。

#### 復元時の処理

- `data-if` の評価が true に戻ると、エレメントの `display` スタイルは元に戻され（事前に保存されていた場合）、削除されていた子要素が再構築されます。
- 元の `display` 状態は `style` 属性で明示されていた値を `BindingScope.originalDisplayStyle` に保持し、復元に使用されます。
- CSSにより表示されていた場合（例：`div` の初期表示 `block`）でも、`style=""` がなければ空文字として保持され、そのまま復元されます。

#### スコープと再評価の扱い

- 非表示状態のスコープでは `visible = false` として扱われ、内部のプレースホルダや子スコープは再評価対象から除外されます。
- ただし、`data-if` の条件式自体は再評価対象であり、親の `data-bind` の更新などにより評価結果が変化した場合、再表示されます。

#### 備考

- `data-if-false` は単なるフラグ属性であり、次のように出力されます：

```html
<div data-if="..." data-if-false></div>
```

- 本方式により、属性（例：`data-bind-force`）の維持や開発者デバッグが容易になっています。

---

## まとめ

Haori は属性ベースのシンプルな UI 構築を可能にする一方で、JavaScript API を活用することで**柔軟で拡張性の高い動的 UI**を実現できます。
Haori の内部仕様を意識して適切に拡張することで、外部ライブラリやプロダクトに自然に統合できます。

---

# 第17章：Haori 内部構造とレンダリングモデル

Haori は HTML 属性による宣言的な記述に基づいて、UI を動的に構築・再評価するシステムを備えています。本章では、Haori の内部構造や評価モデルの基本動作について説明します。特に、DOM の初期スキャン、プレースホルダの評価、スコープ管理、再描画のトリガーなど、Haori の根幹を支える仕組みを対象とします。

以下が、初期スキャンと `MutationObserver` を踏まえた正式な **第 17 章 17.1 節「DOM 解析と初期スキャン」** の全文です：

---

## 17.1 DOM 解析と初期スキャン

Haori の初期化時には、対象となるルート要素以下の DOM をスキャンし、`data-bind` や `data-if`、`data-each` などの属性に基づいて、スコープ構造および評価ロジックを構築します。これにより、各エレメントがどのデータスコープに依存しているかを把握し、効率的な再評価と差分描画が可能となります。

### 初期スキャンの処理内容

1. **対象ノードの決定**
   ルート要素以下を深さ優先で走査し、`data-bind`、`data-if`、`data-each`、`{{...}}` などのプレースホルダを含むノードを検出します。

2. **バインドスコープの構築**
   `data-bind` が存在する各エレメントを起点に、スコープが構築されます。このスコープはその要素配下の式評価に用いられ、親スコープとの独立性が保たれます。

3. **プレースホルダの抽出とパース**
   `textContent` や属性値中の `{{...}}` プレースホルダを検出し、式としてパースして評価関数を生成します。これらは内部的にキャッシュされ、再評価時に使用されます。

4. **制御属性の登録**
   `data-if`、`data-each`、`data-form-*` などの属性が定義されたノードは、再描画やバインディングの対象として登録されます。

### DOM 変更の監視

初期スキャンの完了後、Haori は `MutationObserver` を用いて DOM の変化を監視します。これにより、JavaScript によって動的に追加された要素や、外部スクリプトによって挿入された DOM 構造も検出され、自動的にスキャンと評価処理が実行されます。

ただし、`MutationObserver` はページ読み込み時点の静的な DOM には反応しないため、初期化時には必ず明示的なスキャン処理が必要です。

---

## 17.2 プレースホルダの評価とキャッシュ

Haori では、`{{...}}` 構文によって記述されたプレースホルダを評価し、HTML 内の要素に表示します。これらのプレースホルダは、JavaScript のオブジェクトを元に動的に評価される式であり、バインディングスコープに属するデータを参照することで描画内容が決定されます。

### プレースホルダの検出

Haori は、以下のような場所から `{{...}}` 構文を検出します：

- エレメントの `textContent`（テキストノード）
- 属性値（例：`title="{{user.name}}"`）
- 一部のフォーム値（`value="{{...}}"` など）

検出されたプレースホルダは正規表現により抽出され、構文的に空の式（例：`{{}}`）は評価できないためエラーとして処理されます。

### AST の構築とキャッシュ

プレースホルダの中身は JavaScript の簡易的な式と見なされ、Haori はそれを解析して\*\*抽象構文木（AST）\*\*を構築します。これにより、文字列の結合、論理演算、条件式、オブジェクト参照などの基本的な式を安全に評価可能とします。

一度解析されたプレースホルダ式は、同一スコープ内でキャッシュされます。これにより、再評価のたびに再パースされることを防ぎ、パフォーマンスの向上に寄与します。

### 評価タイミングとトリガー

プレースホルダの評価は、以下のいずれかのタイミングで発生します：

- 親または自身の `data-bind` に変更があったとき
- プレースホルダが含まれる要素の `data-if` の評価結果が変わり、再表示されたとき
- 繰り返し構造（`data-each`）の再描画により、その要素が再生成されたとき

なお、Haori はプレースホルダごとの依存トラッキング（例：`user.name` のみ変化した場合に限って再評価）を初期バージョンでは行わず、スコープ単位で一括評価を行います。

---

## 17.3 スコープ階層と再評価トリガ

Haori のデータバインディングは、HTML 構造に対応した**スコープ階層**を構築することで、効率的なデータの適用と再評価を実現しています。本節では、`data-bind` を基点としたスコープの構造と、再評価が発生する条件（トリガ）について説明します。

### スコープの階層構造とマージ

- `data-bind` 属性を持つエレメントは、その位置を起点として**新たなスコープ**を形成します。
- 子スコープに `data-bind` が存在する場合は、親スコープと**マージ**されて評価されます。
- **ただし、同じキーにオブジェクトが含まれる場合は、マージせず子スコープの値で上書きされます。**
- このマージは評価時に動的に行われ、子スコープの式からは親のデータも参照可能です（オブジェクトで上書きされていない限り）。

#### 例（オブジェクトは上書きされる）：

```html
<div data-bind='{"user": {"name": "佐藤", "age": 30}}'>
  <div data-bind='{"user": {"name": "田中"}}'>
    <p>{{user.name}}</p>
    <!-- → "田中" -->
    <p>{{user.age}}</p>
    <!-- → undefined（user が上書きされている） -->
  </div>
</div>
```

#### 例（キー単位の上書き）：

```html
<div data-bind='{"name": "佐藤", "age": 30}'>
  <div data-bind='{"name": "田中"}'>
    <p>{{name}}</p>
    <!-- → "田中" -->
    <p>{{age}}</p>
    <!-- → 30（親から引き継がれる） -->
  </div>
</div>
```

このように、キー単位でマージされるが、値がオブジェクトである場合は完全に置き換えられます。

---

## 17.4 DOM への反映手順

Haori は、`data-bind` の値やスコープ内の式に応じて、HTML 要素の内容や属性を動的に更新します。本節では、プレースホルダや属性値がどのように DOM に反映されるか、またフォーム要素や HTML 埋め込みの特殊な処理について説明します。

---

### プレースホルダの反映（`{{...}}`, `{{{...}}}`）

#### 通常のプレースホルダ（`{{...}}`）

評価結果は、次の対象に応じて DOM に即時反映されます：

| 対象           | 処理内容                         |
| -------------- | -------------------------------- |
| テキストノード | `textContent` に文字列として反映 |
| 属性値         | HTML 属性に文字列として設定      |

※ `{{}}` のように中身が空のプレースホルダは評価できないため、**無効と見なされます（エラー）**。

---

#### HTML 挿入プレースホルダ（`{{{...}}}`）

波かっこを三重にした `{{{...}}}` を使用すると、評価結果は**HTML 文字列として解釈**され、対象ノードの `innerHTML` に挿入されます。

##### 使用例：

```html
<div>{{{user.description}}}</div>
```

- `user.description = "<b>太字</b>"` の場合、
  → `<div><b>太字</b></div>` のように描画されます

##### 注意点：

- `{{{...}}}` の使用は **信頼できるデータに限定**する必要があります。
- 挿入される HTML はブラウザによって解釈され、**XSS の危険性**があるため、ユーザー入力値をそのまま渡すことは推奨されません。

---

### フォーム要素のプロパティ反映

フォーム関連要素（`<input>`、`<select>`、`<textarea>` など）においては、DOM 属性ではなく DOM **プロパティ**として値を反映します。これにより、実際のユーザー入力と一致した内部状態が維持されます。

#### 例：

- `<input value="{{user.name}}">`
  → `input.value = "山田"` のように反映されます

- `<input type="checkbox" checked="{{user.agree}}">`
  → `input.checked = true` のように反映されます（※属性ではなくプロパティ）

---

### 補足：属性が存在しない場合の初期値

Haori は、フォーム要素に `value` や `checked` 属性が記述されていなくても、`data-bind` の値が存在すれば、**対応する DOM プロパティに自動的に反映**します。これにより、HTML 側に初期値を明示的に書かなくても、`data-bind` によって画面に値が表示されます。

#### 例：

```html
<form data-bind='{"name": "山田"}'>
  <input name="name" />
</form>
```

この場合、`<input>` に `value` 属性がなくても、`input.value = "山田"` と設定され、画面には「山田」と表示されます。

同様に：

```html
<form data-bind='{"agree": true}'>
  <input type="checkbox" name="agree" />
</form>
```

この場合、`checked` 属性がなくても `input.checked = true` となり、チェックされた状態になります。

#### 属性がある場合との優先順位

- 静的な `value=""` や `checked` 属性が存在しても、`data-bind` によるバインド値が優先されて DOM プロパティが上書きされます。
- したがって、初期値を HTML 属性で指定する必要はありません。

---

### 反映のタイミング

- 初回描画時（スキャン後の初期反映）
- `data-bind` の再評価時
- 親スコープの変更に伴うスコープ更新時
- `data-if` の表示切り替えによる再表示時

すべての反映処理はプレースホルダの評価により決定され、DOM への反映は即座に行われます。

---

このように、Haori はプレースホルダの評価結果を DOM に即時反映することで、データの状態と表示の同期を保証します。特にフォーム要素の `.value` や `.checked` など、**属性ではなくプロパティを通じて制御すること**が重要です。また、HTML 挿入プレースホルダ（`{{{...}}}`）は高度な用途向けであり、**使用には十分な注意が必要です**。

---

## 17.5 バインド状態の保持とクリーンアップ

Haori は、各 `data-bind` スコープの評価結果やプレースホルダの構文解析結果を内部的に保持し、効率的な再評価と差分更新を可能にします。本節では、こうした評価状態の保持（キャッシュ）と、不要になった要素に対するクリーンアップの仕組みについて説明します。

---

# 第18章：差分描画と `data-each` 最適化

Haori では、`data-each` を用いた繰り返し表示において、DOM 構築を最小限に抑える差分描画処理を行います。本章では、差分パッチの形式と適用ルール、その他の最適化方針について記載します。

---

### 評価キャッシュの保持

Haori は以下の情報をスコープ単位で保持します：

| 保持対象                | 内容例                                 |
| ----------------------- | -------------------------------------- |
| プレースホルダ式の AST  | `{{user.name}}` → 構文解析済みツリー   |
| 評価関数                | スコープと依存関係に基づく再評価用関数 |
| バインド対象 DOM ノード | プレースホルダが属するノード、属性など |
| フォーム要素の同期状態  | `.value` / `.checked` の対応マッピング |

これらのキャッシュは再評価処理を高速にし、冗長な DOM 操作を回避するために使用されます。

---

## 18.1 差分パッチの形式

Haori では、`data-each` を用いた繰り返し表示の際、データの更新が行われたときに、DOM 全体を再構築するのではなく、必要最小限の変更だけを適用する「差分描画」の仕組みを採用しています。
その差分を記述するために用いられるのが「差分パッチ（Patch）」です。

Haori の差分パッチは、以下のような TypeScript 型で表現されます。

```ts
type Patch =
  | {type: 'insert'; index: number; key?: string; data: object}
  | {type: 'update'; index: number; key?: string; data: object}
  | {type: 'remove'; index: number; key?: string}
  | {type: 'move'; from: number; to: number; key?: string}
  | {type: 'clear'}
  | {type: 'replace'; list: Array<{key?: string; data: object}>};
```

---

### パッチ形式の一覧

| type      | 説明                                                                                   |
| --------- | -------------------------------------------------------------------------------------- |
| `insert`  | 指定された位置に新しい行を挿入します。                                                 |
| `update`  | 指定された位置の行を更新（再バインド）します。                                         |
| `remove`  | 指定された位置の行を削除します。                                                       |
| `move`    | 既存の行を別の位置へ移動します（DOM ノードを再利用）。                                 |
| `clear`   | 全行を削除します。                                                                     |
| `replace` | 行全体を再構築し、指定されたリストで置き換えます。差分計算が不要な場合に使用されます。 |

---

### 各パッチの詳細と使用例

#### `insert`

```ts
{ type: "insert", index: 2, key: "u5", data: { id: 5, name: "新しい行" } }
```

- index = 2 の位置に新しい行を挿入します。
- `key` があれば `data-each-key` の比較に使用されます。

#### `update`

```ts
{ type: "update", index: 1, key: "u3", data: { id: 3, name: "変更された行" } }
```

- index = 1 の行の内容を更新（data-bind 再評価）します。
- DOM ノードは再生成されず、バインドデータのみが差し替えられます。

#### `remove`

```ts
{ type: "remove", index: 4 }
```

- index = 4 の行を削除します。

#### `move`

```ts
{ type: "move", from: 3, to: 1, key: "u2" }
```

- index = 3 にあった行を index = 1 の位置へ移動します。
- ノードの物理的な移動により描画順を修正します。

#### `clear`

```ts
{
  type: 'clear';
}
```

- すべての行を削除します。
- フォームの初期化や強制リセット時に使われます。

#### `replace`

```ts
{ type: "replace", list: [
  { key: "u1", data: { id: 1, name: "A" } },
  { key: "u2", data: { id: 2, name: "B" } }
] }
```

- 現在の行をすべて破棄し、与えられたリストで全体を再生成します。
- 差分判定を行う必要がない場合に使用されます。

---

### 差分パッチの適用方針

- 差分パッチは `index` の昇順に適用されます。
- ネストされた `data-each` 構造では、親の差分が適用された後に子の差分が適用されます。
- `key` が指定されている場合は、インデックスではなくキーの一致を優先して一致判定が行われます（move 判定や update 判定に使用）。

---

### 備考

- `key` は必須ではありませんが、`data-each-key` が指定されている場合は必ず含まれます。
- `insert` と `update` における `data` オブジェクトは `data-bind` に直接使用されるバインド値です。
- `replace` は開発ツールやデバッグ用途でも使われることがあります。

---

### 差分再描画との連携

`data-each` などで繰り返し構造が変更された場合（追加・削除・移動）、バインド状態は次のように扱われます：

- **削除された行の情報は、完全に破棄**されます。
- **追加された行は、新規にスキャンされ、評価関数が構築**されます。
- **移動された行は、再評価対象に含まれますが、バインド状態は引き継がれます。**

Haori は、行ごとのスコープ・ノード・プレースホルダ情報を個別に管理しているため、差分適用時に効率的な描画が可能です。

---

### 非表示要素のバインド状態保持

Haori では、`data-if` により非表示状態となったエレメント（`data-if-false` が付与された要素）についても、**メモリ上ではバインド状態が保持**されます。該当ノードは DOM 上からは削除されますが、評価関数・スコープ・プレースホルダ情報は破棄されず、**再評価対象として維持されます**。

そのため、`data-if` の評価結果が `false → true` に変化した際には、**保持されていたノード構造が復元され、再評価・描画が即座に行われます**。

この挙動により、Haori は非表示状態にあるコンテンツのバインド情報を効率よく管理し、再表示時に再構築を不要とする高速な復元処理を実現しています。

---

### クリーンアップの契機と処理

バインド状態が不要になった場合、以下の条件でクリーンアップ処理が行われます。ただし、`data-if` によって一時的に非表示となった要素は再評価の対象となるため、クリーンアップされません。

| クリーンアップの契機                               | 処理内容                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `data-if` の式が変化し、要素が完全に削除された場合 | 該当要素とその配下のスコープ・関数を破棄します（ただし `false` による非表示では破棄されません） |
| `data-each` の行削除                               | 削除対象の行スコープ・関数を破棄します                                                          |
| DOM ノードが明示的に削除された場合                 | 今後の仕様により検出され次第、該当バインド状態を破棄します                                      |

この仕組みにより、不要なノードに対して再評価処理が実行され続けることはありません。

---

このように、Haori は構文解析と評価キャッシュを通じて、**動的な UI 更新とパフォーマンスの両立**を図っています。特に条件分岐や繰り返し構造が複雑になる場面でも、不要なノードのバインド状態を的確に破棄または保持することで、軽量かつ信頼性の高い描画更新を実現しています。

---

## 18.2 `data-each-key` による行識別

Haori の `data-each` による繰り返し処理では、バインドされた配列データの変化に対して効率的な差分描画を行うために、**各行が何に対応するか**を識別する必要があります。

これを補助するのが、`data-each-key` 属性です。

---

### 基本仕様

- `data-each-key` を指定すると、各行のデータ内からそのキーの値を抽出し、\*\*行の一意な識別子（キー）\*\*として扱います。
- 差分パッチ生成時には、前回の表示内容と今回の内容をキー単位で比較し、どの行を **挿入・削除・更新・移動**すべきかを判断します。

#### 例：

```html
<div data-each="list" data-each-key="id">
  <div>{{item.name}}</div>
</div>
```

```js
data-bind = {
  list: [
    { id: "u1", name: "Alice" },
    { id: "u2", name: "Bob" }
  ]
}
```

→ この場合、行の識別には `id` の値（"u1", "u2"）が使われます。

---

### キーが指定されていない場合

- `data-each-key` を省略した場合は、**各行の `data-bind` の中身を構造的に比較**して差分を判定します。
- このときは、順序非依存の `deepEqual` により、
  - オブジェクトの内容が等しいかどうかを評価します。
  - 比較にはコストがかかるため、大量データの場合は `data-each-key` を指定するほうが高速です。

---

### 構造比較の注意点

- 比較対象がプリミティブ型（例：文字列や数値）の場合、
  - `"りんご"` と `"りんご"` のように文字列同士の比較になります。

- ただし、Haori では**文字列や数値の配列だけを `data-each` に使用することは推奨していません**（データバインド構造が不安定になるため）。

---

### `data-row` へのキー属性付与

- `data-each-key` が指定されている場合、Haori は繰り返し生成された各行に以下のような `data-row` 属性を自動で付与します：

```html
<div data-row="u1">...</div>
<div data-row="u2">...</div>
```

- `data-each-key` が指定されていない場合は、`data-row` は値を持たない属性（`data-row`）として付与されます。

---

### まとめ

| 条件                 | 行の識別方法 | `data-row` の形式    |
| -------------------- | ------------ | -------------------- |
| `data-each-key` あり | キーの値     | `data-row="key"`     |
| `data-each-key` なし | 構造比較     | `data-row`（値なし） |

`data-each-key` を使用することで、パフォーマンスの高い差分適用が可能になります。大量データや頻繁な変更が想定される箇所では、明示的にキーを指定することが推奨されます。

---

## 18.3 `data-bind` の変更による再評価

Haori では、DOM 上の任意の要素に `data-bind` 属性を付与することで、その要素および配下のノードに対するスコープが定義されます。
このスコープにバインドされているプレースホルダや制御構文（`data-if`, `data-each` など）は、`data-bind` の値が変更されたときに自動的に再評価されます。

---

### 再評価の範囲

`data-bind` の値が変更されたとき、**再評価の対象となるのはその要素自身とその配下のノードすべて**です。

#### 例：

```html
<div data-bind='{"user": {"name": "佐藤"}}'>
  <p>{{user.name}}</p>
  <!-- ← 再評価対象 -->
</div>
```

- `data-bind` の値が `{ user: { name: "田中" } }` に変わると、`{{user.name}}` が再評価されて `"田中"` に更新されます。

---

### 子スコープが存在する場合

- `data-bind` を持つ子要素は**独立したスコープ**を形成します。
- 親の `data-bind` の変更によって子スコープ内のプレースホルダが再評価されることは**ありません**。

#### 例：

```html
<div data-bind='{"user": {"name": "佐藤", "age": 30}}'>
  <div data-bind='{"user": {"name": "田中"}}'>
    <p>{{user.name}}</p>
    <!-- → "田中"（親の変更では変わらない） -->
  </div>
</div>
```

このように、子スコープの `data-bind` が存在する場合は、親からの再評価の影響を受けません。

---

### `data-if` による非表示要素

- `data-if` の評価結果が `false` となっているエレメントは、その時点で DOM 上に存在せず、**再評価対象から除外されます**。
- ただし、その `data-if` 式の評価に変化があった場合には、再度表示され、**再評価されながら描画されます**。

---

### プレースホルダの再評価タイミング

`{{...}}` のようなプレースホルダは、以下のいずれかの条件で再評価されます：

- 自身または親の `data-bind` の値が変更されたとき
- 自身を含むスコープが `data-if` により非表示 → 表示に変化したとき
- 自身を含むスコープが `data-each` により再生成されたとき

---

### 最適化に関する注意

- プレースホルダごとの依存関係トラッキング（「user.name が変わったときだけ再評価」など）は行われません。
- Haori は **スコープ単位で全プレースホルダを一括で再評価**します。
- これにより仕組みは単純化されますが、頻繁な変更が予想される場合は `data-bind` の粒度を適切に設計することが推奨されます。

---

### まとめ

| 状況                            | 再評価されるか                        | 備考 |
| ------------------------------- | ------------------------------------- | ---- |
| `data-bind` が変更された        | ✅ 対象スコープと配下を再評価         |      |
| 子要素に別の `data-bind` がある | ❌ 子スコープは独立扱い               |      |
| `data-if` により非表示          | ❌ 評価結果が変わるまで再評価されない |      |
| `data-if` により再表示された    | ✅ 再描画と同時に再評価される         |      |

---

この設計により、Haori は動的なデータ変更に対して高速かつ安定した描画更新を提供しています。

---

## 18.4 差分の描画順と適用順

Haori では、`data-each` によって繰り返し表示される行に対し、差分パッチ（Patch）を適用することで、DOM の更新量を最小限に抑えています。
差分の適用は、**描画の順序性**を維持しつつ、**ネスト構造にも対応可能な処理順**で実行されます。

---

### 描画順序の基本方針

- 差分パッチは **DOM構造の上から下（top-down）** に向かって適用されます。
- 1つの `data-each` に対応する要素群は、**定義された順番通りに表示されるよう保証**されます。
- 差分適用後の DOM 構造が、バインドされた配列と同じ順序になるように調整されます。

---

### ネストされた `data-each` の処理順

Haori は `data-each` の入れ子にも対応しており、以下の順序で差分を適用します：

1. 最も外側（親）の `data-each` に対する差分パッチを先に適用する。
2. 親の行の構築が完了した後に、その行内に存在する子の `data-each` に対して再帰的に差分を適用する。

このように、**親から順に再帰的に適用されることで、正しい構造と順序が保たれます**。

---

### 行内プレースホルダの適用順

1つの行の中に複数の `{{...}}` プレースホルダが存在する場合、それらの評価と反映は以下の順で行われます：

- DOM 上のノードの並び順に従って左から右へ評価されます。
- 各プレースホルダは即時に評価され、評価結果がテキストノードや属性に反映されます。

---

### index による描画順の明示

各差分パッチ（`insert`, `update`, `move`）には `index` または `from`/`to` などのインデックス情報が含まれます。

- `index` は描画順の基準であり、DOM挿入の正確な位置を指定します。
- `move` の場合、元の位置（`from`）と移動先（`to`）が明示されます。
- Haori はこの情報を元に、**描画順の不整合が発生しないように制御**します。

---

### プレースホルダの即時反映と順序保証

Haori はプレースホルダを非同期に遅延評価するのではなく、差分適用の直後に即座に評価・反映します。
これにより、DOM の見た目と内部状態の同期が保証されます。

---

### まとめ

| 項目                 | 処理順と内容                                 |
| -------------------- | -------------------------------------------- |
| 差分の適用順         | 親から子へ、上から下へ再帰的に適用           |
| 行内のプレースホルダ | DOM ノードの並び順で評価                     |
| 描画順の制御         | 差分パッチの `index` / `to` により明示       |
| ネスト構造の差分適用 | 各階層で順に適用され、構造と順序が保証される |
| プレースホルダの反映 | 差分適用直後に即時反映される                 |

---

このように、Haori の差分描画は順序の整合性を保ちながら効率的に行われるよう設計されています。
大量データやネストされた構造でも、DOM構築の無駄を最小限に抑えることができます。

---

## 18.5 行追加・削除と `data-bind` の整合性

Haori では、`data-each` を用いて表示された行に対して、ユーザー操作などで行の追加・削除が行われる場合、**その変更が `data-bind` にどのように反映されるか**が明確に定義されています。
この節では、`data-row-add` および `data-row-remove` の動作と、`data-bind` との関係について説明します。

---

### フォーム内における行操作

#### `data-row-add`

- 対象がフォーム内で `data-each` 配下にある場合、`data-bind` 配列に **空のオブジェクト `{}`** が追加されます。
- この変更により、差分パッチが発生し、新たな行が描画されます。

#### `data-row-remove`

- 行を削除するボタンに `data-row-remove` が指定されている場合、該当行が削除され、対応する `data-bind` の要素も配列から除外されます。
- ただし、**対象の行が1件のみ存在する場合**は、削除されず内容がリセットされます（空文字、チェック解除、選択解除など）。

---

### フォーム外における行操作

- フォーム外にある `data-each` に対して `data-row-add` や `data-row-remove` を行っても、`data-bind` 配列には変更は加えられません。
- 表示上の行だけが変化し、データには反映されないため、**双方向バインディングは行われません**。

---

### 手動変更と上書きの関係

- `data-bind` の配列をサーバからフェッチした結果などで上書きした場合、**手動で追加・編集された行はすべて破棄されます**。
- つまり、`data-bind` の値が変更されると、それまでの編集内容は保持されません。

---

### 行の初期値

- 新規に追加された行には、初期HTMLに `value` 属性や `checked` 属性があれば、それが初期値として使用されます。
- これらは `reset` や `data-row-remove` によるリセット時にも適用されます。

---

### まとめ

| 条件                        | `data-bind` への反映          | 備考                   |
| --------------------------- | ----------------------------- | ---------------------- |
| フォーム内での `add`        | 配列に `{}` を追加            | 差分パッチが発生       |
| フォーム内での `remove`     | 配列から削除／1件ならリセット | リセットは初期値に戻る |
| フォーム外での `add/remove` | 反映されない                  | 表示のみ変化           |
| フェッチ等で配列を更新      | 手動変更は失われる            | 上書き扱い             |
| 初期HTMLに値あり            | 新規追加行に反映される        | `reset` 時も有効       |

---

この設計により、Haori はフォームデータの状態と画面表示の整合性を保ちながら、行の追加・削除処理を柔軟かつ効率的に実現しています。

---

## 18.6 開発者モードとデバッグ補助

Haori では、差分描画処理やバインディングの不整合を開発中に検知・確認しやすくするため、\*\*開発者モード（開発支援機能）\*\*を備えています。
このモードでは、実行中の差分パッチや警告メッセージをブラウザの `console` に出力するほか、特定の属性によって差分の視覚的表示も可能になります。

---

### 開発者モードの判定条件

以下のいずれかに該当する場合、Haori は開発者モードとして動作します：

1. HTML 内に存在する `<script>` 要素のいずれかに `data-dev` 属性が付与されている。
2. 現在のページのホスト名（`location.hostname`）が以下のいずれかに該当する：
   - `localhost`
   - `127.0.0.1`（IPv4 ローカルループバック）
   - `::1`（IPv6 ローカルループバック）
   - `localhost` を含むサブドメイン（例：`dev.localhost`, `test.localhost.localdomain` など）

#### 判定例：

| アクセス URL                   | 判定結果        |
| ------------------------------ | --------------- |
| `http://localhost:3000/`       | ✅ 開発者モード |
| `http://127.0.0.1:8080/`       | ✅ 開発者モード |
| `http://[::1]/`                | ✅ 開発者モード |
| `https://dev.localhost.test/`  | ✅ 開発者モード |
| `https://example.com/`         | ❌ 通常モード   |
| `https://staging.example.com/` | ❌ 通常モード   |

---

### 出力されるログの内容

開発者モードでは、次のような情報が `console.log()` や `console.warn()` を通じて出力されます：

| 種別                       | 内容例                                   |
| -------------------------- | ---------------------------------------- |
| 差分パッチの適用ログ       | `Patch applied: insert @ index 2` など   |
| プレースホルダの構文エラー | `Invalid expression: {{user.}}`          |
| 未定義のバインドキー警告   | `Warning: key 'name' not found in scope` |
| `data-each-key` の重複警告 | `Duplicate key "u1" detected` など       |

これにより、表示上では確認しづらいバインディングの失敗や評価エラーを、開発中にすばやく検出できます。

---

### `data-row-debug` による差分表示

差分パッチ適用時に、以下の条件で **行要素に `data-row-debug` 属性** が自動的に付与されます：

- `insert` や `update` のパッチが適用された行
- `move` によって移動された行

開発者はこの属性に対して CSS を定義することで、差分適用された行を視覚的にハイライトすることができます。

#### 例：差分行のハイライト表示

```css
[data-row-debug] {
  outline: 2px dashed orange;
  background-color: #fffbe6;
}
```

---

### 致命的エラーの出力

以下のような致命的な実行エラーは、開発者モードに関係なく常に `console.error()` に出力されます：

- プレースホルダ構文の重大な構文エラー（例：波かっこの未対応）
- 無効な JSON による `data-bind` 値の解析失敗
- DOM構造の破壊（存在しないノードへのバインドなど）

---

### まとめ

| 機能             | 内容                                                        |
| ---------------- | ----------------------------------------------------------- |
| 判定方法         | `<script data-dev>` または `localhost` 判定（詳細条件あり） |
| ログ出力         | 差分パッチ、評価エラー、スコープ警告など                    |
| `data-row-debug` | 差分行に属性付与、CSSで可視化可能                           |
| 致命的エラー     | モードに関係なく常に出力される                              |

---

このように、開発者モードを有効にすることで、Haori のバインディングや描画処理の流れを視認性高く把握でき、デバッグや検証作業を効率的に進めることができます。

---

# 第19章：評価エンジンと依存戦略

Haori は、テンプレート内のプレースホルダや制御属性の式を評価するために、軽量な評価エンジンを内部に持ちます。本章では、評価処理の基本的な流れと、評価結果の再利用・最適化に関する方針を説明します。

---

## 19.1 プレースホルダの構文解析とキャッシュ

- `{{...}}` や `{{{...}}}` によって記述された式は、初回スキャン時に構文解析され、AST（抽象構文木）としてキャッシュされます。
- 同一スコープ内に同じ式が複数存在する場合は、ASTが再利用されます。
- 解析エラーがある場合は、初回スキャン時または評価時に `console.error` を出力します（致命的エラー）。

---

## 19.2 評価関数とスコープ

- 式の評価には、事前にコンパイルされた関数が使用されます。
- 評価関数にはバインドスコープが引数として渡され、JavaScript の `with` 文などは使用しません。
- プレースホルダが属するスコープは、`data-bind` の階層構造により自動的に決定されます。

---

## 19.3 スコープのマージと上書きルール

- 子スコープの `data-bind` は、親スコープとマージされて評価されます。
- 同じキーが存在する場合は子スコープの値が優先されます。
- ただし、同一キーにオブジェクトが存在する場合はマージされず、子スコープの値で完全に上書きされます。

---

## 19.4 再評価の単位とタイミング

- プレースホルダごとの依存追跡は行わず、再評価はスコープ単位で行われます。
- 再評価は以下のタイミングで発生します：

| トリガ条件                         | 説明                                               |
| ---------------------------------- | -------------------------------------------------- |
| `data-bind` の値が変更されたとき   | スコープ内の式・属性がすべて再評価されます         |
| `data-if` の判定が変化したとき     | 非表示⇔表示が切り替わるときに限って再評価されます  |
| `data-each` の配列が変更されたとき | 差分パッチの適用と同時に、各行の再評価が行われます |

- `data-if` により非表示状態（`data-if-false`）となっている要素は、`data-if` の評価結果に変化がない限り再評価されません。

### `data-fetch-force` による強制評価

- 非表示状態の要素（`data-if-false`）に対しても、`data-fetch-force` 属性が指定されている場合は、フェッチ処理が実行されます。
- フェッチ結果は通常通り `data-bind` に反映され、`data-if` が再評価されます。

---

## 19.5 評価結果の反映と省略最適化

- 再評価によって得られた値が前回と同一である場合、DOM操作はスキップされます。
- `textContent` や `.value` などのプロパティは、差分がある場合のみ更新されます。
- この最小化により、不要な再描画が抑制され、パフォーマンスが向上します。

---

# 第20章：MutationObserverと動的ノードの監視

Haori は初期化時にDOMをスキャンしてバインド構造を構築するが、それに加えて、ページ描画後にJavaScriptによって挿入・変更されたノードに対しても対応する必要がある。本章では、Haoriにおける `MutationObserver` を用いた動的なDOM変化への対応方針について説明する。

## 20.1 初期化と監視の併用

- ページ読み込み時または `init()` 呼び出し時に、対象範囲のDOMをスキャンして初期構造を構築する。
- 初期化後は `MutationObserver` を用いて、対象範囲のDOMツリーに追加・変更されたノードを自動的に監視する。
- 監視はルート要素単位で行われる。通常は `<body>` または指定したルート要素配下全体が対象となる。

## 20.2 監視対象と再スキャンの条件

以下のようなDOM変化が発生した場合に、Haoriは新たな要素を再スキャンして必要な初期化処理を行う：

- ノードが追加された場合（childList の追加）
- 追加されたノードが以下のいずれかの属性を含んでいる場合：
  - `data-bind`
  - `data-if`
  - `data-each`
  - `{{...}}` を含むテキストノードまたは属性値
  - `data-form-*`、`data-click-*` などの制御属性

再スキャン対象は、**追加されたノードそのものとその配下全体**である。

## 20.3 MutationObserver の設計上の注意点

- 初期描画済みのDOMに対しては、MutationObserverはトリガとならないため、**最初のスキャンは必須**である。
- `MutationObserver` による監視は変更の粒度が粗いため、必要な属性やノード構造を検出する軽量なフィルタリング処理を通じて再スキャン対象を限定する。
- 無関係なDOM変化（スタイル、クラス名の変更など）には反応しない。

## 20.4 パフォーマンスと制限事項

- 追加されたノードに対して再スキャンが発生するが、Haoriは内部的にバインド済みノードを記録しており、**二重初期化は回避される**。
- 高頻度で大量のノードが挿入されるケースでは、複数変更をまとめて処理するバッチ最適化が将来的に検討される。
- `MutationObserver` の使用により、開発者が明示的に `init()` を再実行する必要は基本的にない。

---

# 第21章：イベントと通知機構

Haori-JS では、動的な表示更新や通信、フォーム操作、行操作などに応じて、特定のカスタムイベント（`haori:*`）を発火します。これらのイベントを活用することで、UI の補助処理や外部スクリプトとの連携が可能になります。

---

## 21.1 評価・描画に関する通知

UI が再評価・再描画された際に発火されるイベントを以下に示します。

| イベント名       | 発火対象                       | 同期性 | 説明                                                           |
| ---------------- | ------------------------------ | ------ | -------------------------------------------------------------- |
| `haori:updated`  | 再評価により描画更新された要素 | 非同期 | プレースホルダや属性が再評価され、実際に変更があった場合に発火 |
| `haori:inserted` | 新たに追加された `data-row`    | 非同期 | 差分描画により DOM に挿入された要素直後に発火                  |
| `haori:removed`  | 削除された要素                 | 非同期 | 差分描画により DOM から削除された直後に発火                    |

### イベント設定（共通）

```ts
new CustomEvent("haori:updated", {
  bubbles: false,
  composed: false,
  cancelable: false,
  detail: { ... } // イベントごとの追加情報
});
```

### 使用例：描画更新の検知

```js
document.addEventListener('haori:updated', e => {
  console.log('更新対象:', e.target);
});
```

---

## 21.2 ユーザー操作に関する通知

ユーザーの操作（行の追加・削除・移動・送信）に応じて、以下のイベントが発火されます。

| イベント名          | 発火対象                   | 同期性 | 説明                                                    | キャンセル可能 |
| ------------------- | -------------------------- | ------ | ------------------------------------------------------- | -------------- |
| `haori:row-added`   | 追加された `data-row` 要素 | 非同期 | `data-row-add` により行が複製された直後                 | ❌             |
| `haori:row-removed` | 削除された `data-row` 要素 | 非同期 | `data-row-remove` によって DOM から削除された直後に発火 | ❌             |
| `haori:row-moved`   | 並び替え後の `data-row`    | 非同期 | 上下移動操作直後に発火                                  | ❌             |
| `haori:form-submit` | `<form>` 要素              | 同期   | 自動・手動送信時に送信直前で発火                        | ✅             |

### イベント設定（例：キャンセル可能）

```ts
new CustomEvent('haori:form-submit', {
  bubbles: false,
  composed: false,
  cancelable: true,
  detail: {
    form: HTMLFormElement,
    params: any, // 送信予定のデータ
  },
});
```

### 使用例：行削除の確認

```js
document.addEventListener('haori:row-removed', e => {
  console.log('行が削除されました:', e.target);
});
```

---

## 21.3 通信に関する通知

`data-fetch` や `data-click-fetch` による通信処理では、次のイベントが順に発火されます。

| イベント名             | 発火対象       | 同期性 | 説明                               | キャンセル可能 |
| ---------------------- | -------------- | ------ | ---------------------------------- | -------------- |
| `haori:fetch-start`    | 通信対象の要素 | 同期   | 通信開始直前に発火                 | ✅             |
| `haori:fetch-success`  | 通信対象の要素 | 非同期 | 通信成功・`data-bind` 反映後       | ❌             |
| `haori:fetch-error`    | 通信対象の要素 | 非同期 | 通信失敗時に発火                   | ❌             |
| `haori:fetch-complete` | 通信対象の要素 | 非同期 | 通信成功・失敗に関係なく最後に発火 | ❌             |

### 使用例：ローディング制御

```js
document.addEventListener('haori:fetch-start', e => {
  e.target.classList.add('loading');
});

document.addEventListener('haori:fetch-complete', e => {
  e.target.classList.remove('loading');
});
```

---

## 21.4 使用上の注意

### 1. 同期イベントはキャンセル可能

`haori:form-submit` など、**同期的に発火されるイベントは `preventDefault()` により処理を中止できます。**

### 2. 非同期イベントは描画・通信完了後に通知

`haori:updated` や `haori:fetch-success` などは **非同期に発火**され、DOM 操作との競合を避ける設計になっています。

### 3. `haori:updated` は差分がない場合は発火されない

DOM に変更がない場合、再評価が行われても `haori:updated` は発火されません。

### 4. リスナは削除前に明示的に解除推奨

`data-row` のように動的に追加・削除される要素では、`addEventListener()` を使う場合は **削除時にリスナの解除**を行うか、**イベントデリゲーション**の活用が推奨されます。

### 5. `event.detail` は将来的に拡張される可能性あり

`event.detail` のプロパティ構造は今後追加・変更される可能性があるため、厳密な型依存を避け、存在チェック付きで使用してください。

---

このように、Haori-JS のカスタムイベントは処理の前後を安全かつ柔軟にフックできる仕組みです。同期・非同期の使い分けに注意しつつ、適切な処理設計を行うことが重要です。

---

# 付録 A：FAQ（よくある質問）

この付録では、Haori を利用する際に多くのユーザーが直面する疑問や混乱しやすいポイントについてまとめています。  
それぞれの質問に対して、正しい使い方やトラブル解決のためのヒントを明示し、実装時の参考となる情報を提供します。

開発時に「おかしいな」と感じたら、まずこの FAQ を参照してみてください。

---

## A. よくある質問（FAQ）

### Q1. `{{key}}` を書いたのに何も表示されません

**原因：**

- `data-bind` の中に `key` が存在しない、もしくは `undefined` です。
- または、`data-if` により該当要素が非表示になっています。

**対応：**

- 該当する `key` を含むデータがバインドされているか確認してください。
- `console.log()` で `data-bind` の値を確認するか、`haori:bind-update` イベントを利用して調査可能です。

---

### Q2. チェックボックスやラジオボタンの状態が反映されない

**原因：**

- `checked` 属性ではなく `checked` **プロパティ**で制御されているため、HTML の静的な属性とは連動しません。

**対応：**

- `value` 属性とバインド値が一致するようにしてください。
- `true`/`false` の場合は `value="true"` を指定すると制御しやすくなります。

---

### Q3. `data-row-add` で追加した行が空欄になります

**原因：**

- 行の複製時に `input`, `select`, `textarea` などのフォーム要素は初期化されるためです。

**対応：**

- `value` 属性（または `checked`, `selected`）で初期値を明示するようにしてください。

---

### Q4. プレースホルダで関数を呼び出すとエラーになります

**原因：**

- `data-bind` の中に関数を直接書くことはできません。
- 一部の識別子（`window`, `constructor` 等）はセキュリティ上ブロックされています。

**対応：**

- `window.myUtil.format()` のように、グローバル関数を定義して呼び出してください。
- `data-bind` の中には関数定義を書かないようにしてください。

---

# 付録 B：禁止事項と誤用例

この付録では、Haori を使用するうえで**明示的に禁止されている記述**や、**誤動作や意図しない挙動につながる非推奨な使い方**をまとめています。  
特にテンプレート構文やフォーム連携に関する誤用は、エラーの原因となることが多いため注意が必要です。

**意図したとおりに表示されない、送信されない、挙動が不安定**などの問題が発生した場合は、まず本付録に該当する誤用がないかを確認してください。

### B1. `{{}}` のように空のプレースホルダを使用する

**禁止理由：**

- 空の式は評価できず、内部的にエラーとなります。

**正しい書き方：**

```html
<!-- 間違い -->
<p>{{}}</p>

<!-- 正しい -->
<p>{{name}}</p>
```

---

### B2. 文字列配列を `data-each` で直接繰り返して `{{}}` を使う

**禁止理由：**

- プレースホルダに使える変数が存在せず、`"りんご"` のような単体文字列は展開できません。

**正しい書き方：**

```html
<!-- 間違い -->
<div data-bind='{"items": ["りんご", "ばなな"]}'>
  <p data-each="items">{{}}</p>
</div>

<!-- 正しい -->
<div data-bind='{"items": ["りんご", "ばなな"]}'>
  <p data-each="items" data-each-arg="fruit">{{fruit}}</p>
</div>
```

---

### B3. `data-bind` に関数定義を含める

**禁止理由：**

- `data-bind` は JSON として解析されるため、関数などの非シリアライズ可能な値はエラーになります。

**正しい対応：**

- 関数は外部で `window` オブジェクトに定義してください。

---

### B4. `data-if` が false の状態で `data-each` を併用する

**制限事項：**

- `data-if` の評価が false の場合、その要素以下は描画も評価もされません。`data-if` と同じエレメントで定義されている `data-fetch-force` のみ実行されます。

**補足：**

- `data-if` の評価によって `data-each` がスキップされることを理解した上で使ってください。

---

### B5. 同じ要素に `data-*` と `hor-*` を混在させる

**非推奨：**

- `data-if` と `hor-if` など、同じ役割の属性を 1 つの要素に両方使うことは挙動が不明確になります。

**対応：**

- `data-*` か `hor-*` のいずれかに統一して使用してください。

---

この付録は今後の仕様追加や変更にあわせて随時更新される予定です。
正しい構文を守り、安全で再利用可能なマークアップを目指しましょう。

---

# 付録 C：クックブック（実用サンプル集）

この付録では、Haori を使ってよくある UI パターンを構築するための**具体的なサンプル**を紹介します。
各サンプルには以下を必ず記載します：

- HTML 記述例
- 最終的な HTML 構造
- 表示結果
- 送信値（またはレスポンス JSON）
- 補足解説

**初期 HTML ではできるだけ `data-bind` を使わず、双方向バインディングで構築される前提とします。**

---

## C.1 `data-bind-arg` と `data-form-arg` によるデフォルト値の設定と送信分離

### 概要

このサンプルでは、フォームに入力される値とは別に、**表示用のデフォルト値を埋め込む**方法を紹介します。
送信対象となる値は `data-form-arg` によって `current` キーに格納され、`defaults` の値は送信されません。

---

### HTML 記述例

```html
<div data-bind='{"defaults":{"foo":"初期値A","bar":"初期値B"}}'>
  <form data-form-arg="current">
    <input name="foo" value="{{defaults.foo}}" />
    <textarea name="bar">{{defaults.bar}}</textarea>
  </form>
</div>
```

---

### 最終的な HTML 構造

```html
<div data-bind='{"defaults":{"foo":"初期値A","bar":"初期値B"}}'>
  <form data-form-arg="current">
    <input name="foo" value="初期値A" />
    <textarea name="bar">初期値B</textarea>
  </form>
</div>
```

---

### 表示結果

- `<input>` に「初期値 A」が表示される
- `<textarea>` に「初期値 B」が表示される

---

### 送信時のデータ

```json
{
  "current": {
    "foo": "（ユーザーが入力した値）",
    "bar": "（ユーザーが入力した値）"
  }
}
```

---

### 解説

- `data-bind` によって定義された `defaults` オブジェクトをプレースホルダで参照し、初期値を表示します。
- `form` に `data-form-arg="current"` を指定することで、送信データは `current` キーにまとめられます。
- 入力欄から `data-bind` への反映は双方向バインディングによって自動的に行われます。
- この構成により、**表示と送信のスコープを分離**した柔軟な UI が構築できます。

---

## C.2 チェックボックスによってフォーム内の入力項目を表示する方法

### 概要

このサンプルでは、チェックボックスの状態によって**フォーム内の追加入力項目を表示・非表示に切り替える**方法を紹介します。
`data-if` を使って条件に応じて表示内容を切り替えます。

---

### HTML 記述例

```html
<div data-bind='{"user":{"hasDetail":false}}'>
  <form data-form-arg="user">
    <label>
      <input type="checkbox" name="hasDetail" value="true" /> 詳細を入力する
    </label>

    <div data-if="user.hasDetail">
      <label>電話番号: <input type="tel" name="phone" /></label>
      <label>郵便番号: <input type="text" name="zipcode" /></label>
    </div>
  </form>
</div>
```

---

### 最終的な HTML 構造（チェックオフ時）

```html
<div data-bind='{"user":{"hasDetail":false}}'>
  <form data-form-arg="user">
    <label>
      <input type="checkbox" name="hasDetail" value="true" /> 詳細を入力する
    </label>

    <div data-if="user.hasDetail" data-if-false></div>
  </form>
</div>
```

---

### 最終的な HTML 構造（チェックオン時）

```html
<div data-bind='{"user":{"hasDetail":true}}'>
  <form data-form-arg="user">
    <label>
      <input type="checkbox" name="hasDetail" value="true" checked />
      詳細を入力する
    </label>

    <div data-if="user.hasDetail">
      <label>電話番号: <input type="tel" name="phone" /></label>
      <label>郵便番号: <input type="text" name="zipcode" /></label>
    </div>
  </form>
</div>
```

---

### 表示結果

- チェックを入れない状態では入力欄は表示されない
- チェックを入れると電話番号と郵便番号の欄が表示される

---

### 送信されるデータ（チェックオン時）

```json
{
  "user": {
    "hasDetail": true,
    "phone": "090-1234-5678",
    "zipcode": "123-4567"
  }
}
```

### 送信されるデータ（チェックオフ時）

```json
{
  "user": {
    "hasDetail": false
  }
}
```

---

### 解説

- `data-if="user.hasDetail"` は `data-bind` のルートにある `user.hasDetail` を評価して表示制御を行います。
- チェックボックスには `value="true"` を指定しており、チェック状態に応じて `true` / `false` が `user.hasDetail` に反映されます。
- `data-if` の評価が `false` のとき、該当要素は `data-if-false` として非表示（DOM から除去）され、送信対象にも含まれません。
- `data-form-arg="user"` により、送信されるデータのトップレベルは `user` オブジェクトになります。

---

このパターンは、**任意の追加情報入力欄を動的に表示する**際に便利です。
次節では、チェックボックスでボタンの有効・無効を制御する方法を紹介します。

---

## C.3 チェックボックスによって送信ボタンを有効化する方法

### 概要

このサンプルでは、**利用規約の同意チェックなどに応じて送信ボタンの有効・無効を切り替える**方法を紹介します。
`disabled="{{...}}"` によってボタンの状態を制御します。

---

### HTML 記述例

```html
<form data-form-arg="form">
  <label>
    <input type="checkbox" name="agree" value="true" /> 利用規約に同意する
  </label>

  <button type="submit" disabled="{{!form.agree}}">送信</button>
</form>
```

---

### 最終的な HTML 構造（チェックオフ時）

```html
<form data-bind='{"form":{"agree":false}}' data-form-arg="form">
  <label>
    <input type="checkbox" name="agree" value="true" /> 利用規約に同意する
  </label>

  <button type="submit" disabled>送信</button>
</form>
```

---

### 最終的な HTML 構造（チェックオン時）

```html
<form data-bind='{"form":{"agree":true}}' data-form-arg="form">
  <label>
    <input type="checkbox" name="agree" value="true" checked />
    利用規約に同意する
  </label>

  <button type="submit">送信</button>
</form>
```

---

### 表示結果

- チェックを入れる前：送信ボタンは無効（グレーアウトされ押せない）
- チェックを入れると：送信ボタンが有効化される

---

### 送信されるデータ（チェックオン時）

```json
{
  "form": {
    "agree": true
  }
}
```

---

### 解説

- `data-form-arg="form"` により、フォーム全体のバインド先が `form` になります。
- チェックボックスの状態は `form.agree` に反映されます。
- ボタンに `disabled="{{!form.agree}}"` を指定することで、「同意していないときにだけ無効」となります。
- `value="true"` を指定することで、チェック時に `true` が代入されるように制御しています。

---

このパターンは、**ユーザーの同意や確認を前提にした操作の制御**に広く使われる基本的な構成です。
次節では、ダイアログを用いた検索 UI の構築方法を紹介します。

---

## C.4 検索ダイアログを備えたテーブル

### 概要

このサンプルでは、**検索フォームをダイアログとして表示し、結果をテーブルに出力する**構成を紹介します。
検索条件は `form` に入力され、`data-click-fetch` によって結果を取得し、テーブルに反映されます。

---

### HTML 記述例

```html
<!-- 検索ボタン（ダイアログを開く） -->
<button data-click-open="#searchDialog">検索条件を指定</button>

<!-- 検索フォーム（ダイアログ） -->
<dialog id="searchDialog">
  <form id="searchForm" data-form-arg="query">
    <label>
      キーワード：
      <input type="text" name="keyword" />
    </label>
    <button
      type="button"
      data-click-fetch="/api/search"
      data-click-form="#searchForm"
      data-click-bind="#resultTable"
      data-click-close="#searchDialog"
    >
      検索
    </button>
  </form>
</dialog>

<!-- 結果表示テーブル -->
<table id="resultTable" data-each="items">
  <thead>
    <tr>
      <th>商品名</th>
      <th>価格</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>{{name}}</td>
      <td>{{price}}円</td>
    </tr>
  </tbody>
</table>
```

---

### 最終的な HTML 構造（検索後）

```html
<table id="resultTable" data-each="items">
  <thead>
    <tr>
      <th>商品名</th>
      <th>価格</th>
    </tr>
  </thead>
  <tbody>
    <tr data-row data-bind='{"name":"りんご","price":120}'>
      <td>りんご</td>
      <td>120円</td>
    </tr>
    <tr data-row data-bind='{"name":"ばなな","price":180}'>
      <td>ばなな</td>
      <td>180円</td>
    </tr>
  </tbody>
</table>
```

---

### 表示結果（例）

| 商品名 | 価格   |
| ------ | ------ |
| りんご | 120 円 |
| ばなな | 180 円 |

---

### フェッチレスポンス JSON（例）

```json
{
  "items": [
    {"name": "りんご", "price": 120},
    {"name": "ばなな", "price": 180}
  ]
}
```

---

### 解説

- `data-click-open="#searchDialog"` により、検索条件フォームをモーダルとして表示します。
- `<form id="searchForm">` は `data-form-arg="query"` によって `query.keyword` の形で送信されます。
- `data-click-fetch="/api/search"` により API へリクエストを送り、レスポンスを `data-click-bind="#resultTable"` でテーブルにバインドします。
- テーブルは `data-each="items"` によりレスポンスの `items` 配列を展開して構成されます。
- 検索ボタンに `data-click-close="#searchDialog"` を指定しているため、検索実行と同時にダイアログが閉じられます。

---

この構成により、**入力と結果の表示が分離され、UX に優れた検索 UI**を構築できます。
次節では、ページ番号によって結果を切り替える**ページネーション付きのテーブル**を紹介します。

---

## C.5 ページネーション付きテーブル

### 概要

このサンプルでは、**ページ番号を指定して結果を切り替えるページネーション付きのテーブル**を構築します。
ページ番号はフォームの中で管理され、ボタンを押すことでページ状態を更新して再取得を行います。

---

### HTML 記述例

```html
<form id="pagerForm" data-form-arg="query">
  <!-- ページ番号の管理 -->
  <input type="hidden" name="page" id="pageInput" value="1" />

  <!-- テーブル本体 -->
  <table
    id="paginatedTable"
    data-fetch="/api/products"
    data-fetch-form="#pagerForm"
    data-fetch-arg="items"
    data-each="items"
  >
    <thead>
      <tr>
        <th>ID</th>
        <th>商品名</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>{{id}}</td>
        <td>{{name}}</td>
      </tr>
    </tbody>
  </table>

  <!-- ページ番号切り替え -->
  <div class="pagination">
    <button
      type="button"
      data-click-reset="#pageInput"
      data-click-bind="#pagerForm"
      data-click-bind-arg="query"
      data-click-refetch="#paginatedTable"
      data-click-data="page=1"
    >
      1
    </button>

    <button
      type="button"
      data-click-reset="#pageInput"
      data-click-bind="#pagerForm"
      data-click-bind-arg="query"
      data-click-refetch="#paginatedTable"
      data-click-data="page=2"
    >
      2
    </button>
  </div>
</form>
```

---

### 最終的な HTML 構造（ページ 2 を選択した状態）

```html
<form id="pagerForm" data-bind='{"query":{"page":2}}' data-form-arg="query">
  <input type="hidden" name="page" id="pageInput" value="2" />

  <table id="paginatedTable" ...>
    <thead>
      ...
    </thead>
    <tbody>
      <tr data-row data-bind='{"id":201,"name":"パイナップル"}'>
        <td>201</td>
        <td>パイナップル</td>
      </tr>
      <tr data-row data-bind='{"id":202,"name":"キウイ"}'>
        <td>202</td>
        <td>キウイ</td>
      </tr>
    </tbody>
  </table>

  <div class="pagination">
    <button ...>1</button>
    <button ...>2</button>
  </div>
</form>
```

---

### 表示結果（例：ページ 2）

| ID  | 商品名       |
| --- | ------------ |
| 201 | パイナップル |
| 202 | キウイ       |

---

### フェッチレスポンス JSON（ページ 2 の例）

```json
{
  "items": [
    {"id": 201, "name": "パイナップル"},
    {"id": 202, "name": "キウイ"}
  ]
}
```

---

### 解説

- `pageInput` の値はボタン押下によって `data-click-data` で更新されます。
- `data-click-reset` は事前に値をリセットし、`data-click-bind` で `query.page` に反映します。
- `data-click-refetch` によりテーブルが再取得され、最新のデータで更新されます。
- ページ番号が固定されている（1 や 2 など）ため、**ボタン自体は動的に変化せず常に同じページに遷移**します。

---

> **補足：**
> この構成ではページ番号を `"page=1"` や `"page=2"` のように固定値で記述しているため、
> 現在のページ状態に追従しません。現在ページに基づいて表示を切り替えたい場合は、
> `page={{page+1}}` のようにプレースホルダを用いた構成（C.6）を参照してください。

---

# 付録 D：ChatGPT での利用方法

この付録では、Haori 仕様書を ChatGPT に読み込ませて活用する方法を紹介します。  
ChatGPT に本仕様書の要点を伝えることで、**記憶機能（メモリ）を使わなくても**仕様に沿った一貫した回答を得ることができます。

---

## D.1 ChatGPT に仕様を読み込ませる方法

ChatGPT を使用して Haori の設計や使い方、バグの原因調査、コードの補助などを行いたい場合、最初に以下のテンプレートを貼り付けてください。

### 使用手順

1. ChatGPT（https://chat.openai.com） にアクセス
2. 新しいチャットを開始
3. 以下のテンプレートを最初に貼り付ける
4. 以降、Haori に関する質問やコード相談を行う

---

## D.2 テンプレート（2025 年 7 月版仕様書対応）

```
以下は Haori の完全な仕様です。この仕様に従って、HTMLテンプレートやフォーム連携、動的UI制御、フェッチ通信、行操作、バインディング、条件分岐などすべての動作を判断してください。

仕様書の要点：

1. Haori は data-* 属性によってUIを動的に構成するライブラリであり、プレースホルダ {{key}} によってデータを表示する。
2. プレースホルダ、data-bind、data-if、data-each は組み合わせ可能であり、data-if が false のときは配下が削除される。
3. フォーム入力値は data-form-object や data-form-arg によってオブジェクトとして構成される。バインディングは name 属性に基づく。
4. data-form-arg を指定した場合、条件式やプレースホルダ内で member.agree のように指定されたキー名込みで参照する必要がある。
5. data-fetch、data-click-fetch などは自身にフェッチ結果がバインドされる。data-fetch-bind と data-fetch-bind-arg によって外部に出力できる。
6. data-click-data はオブジェクト形式とクエリ形式の両方に対応しており、クリック送信時に固定値を送るために使う。
7. data-change-click は、対象要素の変更時に別要素の click を自動的に発火する。fetch とは無関係。
8. data-row-remove は複数行の場合は削除するが、1行だけのときはリセットされる。初期値は value や checked に基づく。
9. reset 処理（data-click-reset / data-change-reset）は HTML 標準の reset と同じ動作であり、data-message 属性も削除される。
10. フェッチエラーが発生した場合は haori:fetch-error カスタムイベントが発火され、イベント.detail にエラー情報が含まれる。

仕様書にはすべてのサンプルに「HTML記述例」「最終的なHTML構造」「表示結果」が併記されている。

これらのルールを前提として、Haoriの仕様・設計・構文・使い方について質問に答えてください。
```

---

## D.3 利用例

- **「data-each のスコープがうまく参照されないのはなぜ？」**
- **「1 行だけのときに data-row-remove で削除されないのは仕様ですか？」**
- **「data-fetch-bind-arg を使うと他のデータが消えるように見えます」**

→ 上記のような相談にも、テンプレートを読み込ませてから質問すれば、正確な理由や対処法を ChatGPT から得ることができます。

---

## D.4 補足：テンプレートの更新

本テンプレートは Haori 仕様書（2025 年 7 月版）に準拠しています。  
Haori のバージョンアップに伴い仕様が更新された場合は、テンプレートも更新してください。
