# data-derive / data-derive-name 仕様

本仕様は、親子関係を持つプルダウン UI を宣言的に構成するために、`data-derive` および `data-derive-name` を定義するものである。

本仕様では、派生値の供給と反復描画の責務を分離する。

- `data-derive` / `data-derive-name` は、派生値をローカルスコープへ供給する
- `data-each` は、親要素に対する反復描画を担う
- `select` に対しても、既存の `data-each` 一般規則をそのまま適用する

この構成により、既存の `data-each` 契約を維持したまま、親子プルダウンに必要な候補導出と描画を安定して扱うことを目的とする。

## 目的

本仕様の目的は、親の現在値から子候補を宣言的に導出し、その候補を子プルダウンで利用できるようにすることである。

特に、次の 3 点を重視する。

- `option` 要素での安定した繰り返し描画
- 親値変更時の `data-derive` 再評価
- 導出値のスコープ明確化

## 設計方針

本仕様では、次の方針を採用する。

1. `data-derive` は値の導出のみを担う
2. `data-each` は描画のみを担う
3. `select` / `option` に対しても、既存の `data-each` 一般規則をそのまま適用する
4. 導出値のスコープは当該要素の配下に限定する
5. 再評価はフォーム値更新および `data-bind` 更新に追従させる

## 属性定義

### `data-derive`

`data-derive` は、親の選択値または既存のバインディングデータをもとに、派生値を計算する属性である。

`data-derive` は少なくとも次のタイミングで評価または再評価されなければならない。

- 初回の scan / mount 時
- フォーム値更新時
- `data-bind` 更新時

また、対象要素の `data-derive` は、子要素の `data-if` および `data-each` が評価される前に確定しなければならない。

### `data-derive-name`

`data-derive-name` は、`data-derive` で導出した結果を、その要素配下で参照するための名前を定義する属性である。

`data-derive-name` の有効範囲は次のとおりとする。

- 当該要素の配下だけで有効である
- 子要素から参照できる
- 兄弟要素からは参照できない
- 祖先要素からは参照できない
- 定義した要素自身からは参照できない
- ネストした場合は、内側の同名定義が外側を上書きする

## 記述例

親で契約を選び、子でオプションを選ぶ場合の記述例を以下に示す。

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

この例では、親プルダウンの `contractId` の値をもとに `optionList` を導出し、子プルダウンは既存の `data-each` を `select` に付与して `optionList` を描画する。

ここで重要なのは、`option` 自身に `data-each` を付けるのではなく、繰り返し対象の親要素である `select` に `data-each` を付ける点である。これは `select` 専用ルールではなく、既存の `data-each` が親要素に付くという一般規則の適用である。

## 仕様


### `data-derive` の評価順

- `data-derive` は親から子への順で評価する
- 対象要素の `data-derive` を確定してから、子孫の `data-if`、`data-each`、通常属性、テキスト評価へ進む

### `data-each` の適用規則

- `data-each` は常に親要素に付けるものとする
- 子要素が `option` である場合も、最初の通常子要素をテンプレートとする一般規則をそのまま適用する
- 固定の先頭 `option` は `data-each-before`、固定の末尾 `option` は `data-each-after` で表現する
- `option` 自身に `data-each` を付ける書き方は、本仕様では採用しない。これは `option` だけを禁止する特例ではなく、`data-each` が繰り返し対象の親要素に付くという一般規則による
- `selected` 制御は `option` ごとではなく、`select` の value 同期に委ねる

### 未解決参照時の扱い

- `data-derive` の式に未解決参照がある評価サイクルでは、その導出名は未供給として扱う
- 直前の導出値を保持し続けてはならない
- `data-each` が未供給、`null`、`undefined`、`false` を受けた場合は空配列相当として扱う
- 配列用途の `data-derive` は、式末尾に `?? []` を付ける書き方を推奨する

### 名前衝突時の扱い

- 名前解決は近いスコープを優先する
- `data-derive` を定義した要素の子孫に対しては、その要素自身の `data-bind` や form バインド値より `data-derive-name` を優先する
- ただし、さらに内側の子要素や form が同名の binding key を持つ場合は、その内側の値が外側の派生値を上書きする

### `data-derive-name` 未指定時の扱い

- `data-derive-name` が未指定、空文字、空白のみの場合、その `data-derive` は無効として扱う
- この場合は子孫へ値を公開しない
- 直前に公開していた派生値があっても残さない

## 今回の案では対象外と考えていること

本仕様は、候補一覧をどのように導出し、どのように安定描画するかを対象とする。以下は本仕様の対象外とする。

- 親変更時に子の選択値を自動クリアするかどうか
- 親変更時に子を disabled にするかどうか
- 非同期 API 呼び出しを伴う候補取得
- `optgroup` を含む複合的な候補生成
- 1 要素で複数の導出値をまとめて定義する拡張
- 同一要素自身から導出名を参照する拡張

親変更後に無効な子値が残る問題は、本仕様とは分離して扱うが、将来的に検討が必要な論点である。

## 留意点

- 現行の `data-each` 契約を崩さないため、既存実装と説明のズレが小さい
- `select` / `option` に対しても一般規則を適用するため、要素種別ごとの例外が増えにくい
- `data-derive` の責務を値供給に限定できる
- スコープが子孫限定であるため、名前解決が追いやすい
- 未解決時に古い候補を残さないため、親変更後の表示が不安定になりにくい

## 実装前確認事項

- `select` 配下での `data-each-before` / `data-each-after` の挙動を、主要ブラウザで確認する必要がある
- 親変更後に現在の `optionId` が候補外になったとき、DOM 上の見え方と内部値の整合をどう扱うかを別途決める必要がある
- フォーム変更のたびに広い範囲の `data-derive` を再評価すると、画面規模によってはコストが出る可能性がある

## 今後の検討事項

必要に応じて、次の事項を追加で明文化する。

1. `data-derive` の評価順序の詳細
2. `select` / `option` に対する `data-each` の正式な記述例
3. 実装前提のテスト観点