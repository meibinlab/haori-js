# 回答：data-attr-selected / data-attr-checked のユーザーコミット値巻き戻り（earth-one-core）

- 対象要望: 「data-attr-selected / data-attr-checked のユーザーコミット値ガード」（2026-06-12）
- 回答日: 2026-06-12
- 結論: **コード変更（スティッキーガード）は行わず、レシピ提示で対応**します。実ブラウザで機序とレシピの有効性を確認済みです。

---

## 1. 機序（実ブラウザで確定）

巻き戻りの本質は、**`name` による双方向バインディングの「書込先」と、`data-attr-selected` の式の「読取先」が別のキーである**ことによる、選択状態の**二重の真実源の衝突**です。

報告構成では、

- フォームは `name="category"` でフォーム自身のスコープに **flat キー `category`** を書き込む。
- 一方 `data-attr-selected` の式は **別スコープ `correspondenceItem.category`**（親フラグメント）を読む。

ユーザーが select を変更して `change` が確定しても、読取先 `correspondenceItem.category` は更新されません。0.16.0 以降は `data-attr-selected` が `option.selected`（DOM ライブプロパティ）まで同期するため、フォーカスが外れた後の再評価で「読取先（空のまま）」基準に `option.selected = false` され、選択が `''` に巻き戻ります（`required` 検証も落ちます）。0.15.1 では属性のみ同期で live を戻さなかったため顕在化しませんでした。

実ブラウザ（Chromium）での検証結果（`selectOption` → フォーカス外し → 再評価）:

| 構成 | フォーカス中 | フォーカス外し後 |
|---|---|---|
| **アンチパターン**（書込 `category` / 読取 `correspondenceItem.category`） | 保持 | **`''` に巻き戻り** |
| **推奨①**（`name` 束縛のみ・`data-attr-selected` なし） | 保持 | **保持** |
| **推奨②**（`data-attr-selected` が書込先と同じ `category` を読む） | 保持 | **保持** |

→ haori 単体の `name` 双方向束縛は正しく保持します。巻き戻りはスコープ不一致が主因で、**レシピで確実に解消できます**。

## 2. スティッキーガードを採用しない理由

要望の第1案（「参照元が追従するまで／次のユーザー操作まで巻き戻さない」ガード）は、`value="{{}}"` のフォーカスガードと異なり、select / checkbox には自然な「編集セッション境界」が無く、**保持期間が無制限**になりがちです。その結果、`Form.reset` や別レコードの `data-fetch` 再読込といった**正当な再設定まで覆い隠す**恐れがあり、宣言バインドの一貫性を損ないます。レシピが実証済みで確実なため、レシピ提示を選択しました（先行の checked 連動レシピとも整合）。

## 3. 推奨レシピ（どちらも巻き戻りません）

要点は **`data-attr-selected` / `data-attr-checked` が参照するキーと、その要素の `name` がフォームへ書き込むキーを一致させる**ことです。

### 推奨①（最も簡潔）: `name` 束縛に選択状態を任せ、`data-attr-selected` を使わない

`name` 付き select の選択は `name` のバインドデータで決まるため、`data-attr-selected` は不要です。初期値はフォームの `data-bind` / `data-fetch` で `category` を投入しておけば、初期表示も編集後の保持も両立します。

```html
<form data-bind='{"category":""}'>
  <select name="category" required>
    <option value=""></option>
    <option value="BILLING_OTHER">請求その他</option>
  </select>
</form>
```

### 推奨②: `data-attr-selected` を残すなら書込先と同じキーを読む

```html
<form data-bind='{"category":""}'>
  <select name="category" required>
    <option value=""></option>
    <option value="BILLING_OTHER"
      data-attr-selected="{{category === 'BILLING_OTHER' && 'selected'}}">請求その他</option>
  </select>
</form>
```

### レコード（correspondenceItem 等）を編集するフォームの場合

- フォームの `data-bind` を対象オブジェクトのフィールドで初期化する（`category` に `correspondenceItem.category` を投入して束縛）か、フォームを対象オブジェクトへ束縛して `name` をそのフィールドへ対応させます。
- これで「初期表示（レコード値）」「編集（change での双方向反映）」「保存（required 含む）」が一貫します。

## 4. 移行の指針（330 箇所）

- `name` 付き select / checkbox に付いている `data-attr-selected` / `data-attr-checked` の多くは、**`name` 束縛があるため削除可能**です（推奨①）。まず「フォーム値が正しく初期化されているか」を確認し、初期化が `data-attr-*` 依存になっている箇所のみ、フォーム束縛側の初期化へ移します。
- 残す場合は、式の参照キーを `name` の書込キーへ揃えます（推奨②）。
- 一括置換が難しい箇所は、フォームを対象オブジェクトへ束縛して読取・書込スコープを物理的に一致させると、式の変更を最小化できます。

## 5. ドキュメント

- ガイド `docs/ja/guide.md`「レシピ: `name` 付き select / checkbox では参照スコープを書込スコープに揃える」に上記を追記しました。
- 実ブラウザの裏付けテスト `playwright/attr-selected-crossscope-repro.spec.cjs` を追加しました（推奨①/②は保持、アンチパターンは巻き戻ることを確認）。

## 6. バージョン

本対応はドキュメント（レシピ）であり、haori のコード変更・新規リリースはありません。**0.18.0 のままご利用いただけます**（要望 A/B/C は 0.18.0 で解消済み）。レシピ適用後、代理店・オペレータの残存 JS の宣言化に進めます。
