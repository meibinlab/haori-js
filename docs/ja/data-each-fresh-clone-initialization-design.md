# data-each fresh clone 初期化ルート設計メモ

## 目的

- data-each の新規行追加で使っている `clone -> insert -> scan` のうち、full scan が担っている処理を局所化し、初回表示コストを下げる。
- ただし効果より安全性を優先し、既存の `scan` 契約を壊しやすい領域は段階的に残す。

## 対象範囲

- `src/core.ts`
  - `updateDiff`
  - `scan`
  - `evaluateAll`
- 新規 each 行の初期化経路

## 非対象

- MutationObserver 経由の後付けノード初期化
- `data-import` による任意断片の取り込み初期化
- 既存行の再利用時の更新経路

## 前提

- 直近で `updateDiff` の Map/Set 化、`referenceChild` 探索 1 回化は実装済み。
- `mounted` は DOM 接続状態だけでなく `evaluateIf` の scan 済み判定にも使われている。
- 新規 each 行は `template.clone()` 時点で Fragment 木が構築済みであり、DOM ノードと Fragment の対応自体は再生成不要。
- したがって最適化対象は「Fragment 生成」ではなく「full scan が実施する属性評価と子孫再帰の過剰部分」。

## 現状整理

### 現在の新規 each 行経路

1. `template.clone()` で行 Fragment を複製する
2. `updateRowFragment(...)` で行 binding と `data-row` を更新する
3. `parent.insertBefore(...)` で DOM に挿入する
4. `Core.scan(child.getTarget())` で行全体を full scan する
5. 必要時だけ `scheduleEvaluateAll(child)` を後追い実行する

### scan が現在担っている責務

`scan` は本来「未知の DOM 断片を初期化する汎用入口」であり、新規 each 行のような制御された fresh clone には責務が広い。

#### 新規 each 行にも必要な責務

1. 親の mounted 状態を踏まえて対象 fragment の mounted を確定する
2. 優先属性を既定順で評価する
   - `data-bind`
   - `data-url-param`
   - `data-derive-name`
   - `data-derive`
   - `data-if`
   - `data-each`
3. 通常属性を優先属性の後で評価する
   - `href="...{{...}}"` のような補間属性をここで反映する必要がある
4. 遅延属性を最後に評価する
   - 現状は `data-fetch`
5. `data-if` が偽なら子孫初期化を止める
6. `ElementFragment` 子には再帰、`TextFragment` 子には `evaluateText` を行う

#### 新規 each 行には不要または過剰な責務

1. `Fragment.get(element)` による未知ノード受け入れ
   - fresh clone では Fragment 木がすでに存在する
2. DOM 接続状態からの汎用 mounted 推定
   - 挿入直後は親 fragment と挿入位置が確定している
3. 「どの要素から入ってきたか分からない」前提の full subtree scan
   - each 行は template 由来で対象範囲が明確
4. `data-import` や observer 連携を含む一般断片初期化との共有責務
   - 新規 each 行ルートに混ぜると境界が曖昧になる

## 壊しやすい既存契約

### 1. mounted は単なる DOM 接続フラグではない

- `evaluateIf` は子 fragment の `isMounted()` を見て、未初期化なら `scan`、既初期化なら `evaluateAll` を選ぶ。
- そのため子孫へ先に一括で `mounted=true` を伝播すると、未初期化の枝に `evaluateAll` が流れて壊れる。
- fresh clone ルートでも、mounted は「その fragment の初期化完了地点」でのみ立てる必要がある。

### 2. 属性順序の契約

- `data-derive` は子孫の通常属性や text より先に確定している必要がある。
- `data-if` は子孫再帰前に確定している必要がある。
- 通常属性は `data-if` / `data-derive` 後に評価されるため、`href` などは row binding と派生値を見て展開できる。
- `data-each` は親要素で先に評価し、子行を自前で構築する。子孫の通常再帰と二重実行してはいけない。

### 3. hidden 分岐は未初期化のまま保持される契約

- `data-if=false` の枝では子孫をまだ初期化せず、表示時に初めて初期化する前提がある。
- fresh clone ルートでも、`data-if=false` の subtree を深掘りしてはいけない。

### 4. fetch/import は fresh clone 最適化の初手に含めない方が安全

- これらは非同期副作用を伴い、実行シグネチャや再実行制御を持つ。
- each 行の初期化高速化と責務が異なり、先に混ぜると切り戻しが難しくなる。

## 設計方針

- `scan` は汎用入口として残す。
- 新規 each 行だけに使う `fresh clone` 専用ルートを追加し、`updateDiff` の新規行分岐からのみ呼ぶ。
- 初期化は「fragment 単位の局所完結」を保ち、親から子孫へ mounted を広域伝播しない。
- 特殊属性評価は既存の `Core.setAttribute(...)` / `evaluateIf(...)` / `evaluateEach(...)` / `evaluateDerive(...)` を再利用し、最適化対象を traversal と分岐制御に限定する。
- 最初の段階では `scan` と同じ属性順序を守るが、対象ノードの探索方法だけを each 行専用に狭める。

## 新メソッド案

### 最小構成

#### `initializeFreshEachRow(row: ElementFragment): Promise<void>`

- `updateDiff` の新規行追加分岐から呼ぶ入口。
- 行 root の mounted 確定、属性初期化、子孫初期化、必要なら遅延再評価の予約まで担当する。
- `scan` を置き換える単位はここだけにする。

#### `initializeFreshElement(fragment: ElementFragment): Promise<void>`

- fresh clone subtree 用の再帰本体。
- `scan(element)` の ElementFragment 向け局所版。
- 役割:
  - 対象 fragment 自身の mounted を必要地点で確定する
  - 優先属性、通常属性、遅延属性を既存順序で評価する
  - `data-if=false` なら子孫へ降りない
  - `data-each` を持つ場合はそこで処理を打ち切る
  - 子要素へ再帰する

#### `initializeFreshAttributes(fragment: ElementFragment): Promise<InitializeResult>`

- 自身の属性評価だけを行う。
- 戻り値で以降の再帰可否を返す。

```ts
type InitializeResult = {
  shouldVisitChildren: boolean;
  shouldScheduleEvaluateAll: boolean;
};
```

- `shouldVisitChildren`
  - `data-if=false` や `data-each` により子孫再帰を止めるかどうか
- `shouldScheduleEvaluateAll`
  - mount-sensitive な未初期化子孫を残した場合に限って後続予約を行う

### mounted を立てる場所

- `parent.insertBefore(child, ...)` の時点で root row には親の mounted がコピーされる。
- ただし子孫は clone 時点で `mounted=false` のままなので、fresh clone ルートでも子孫へ自動伝播しない。
- `initializeFreshElement(fragment)` の先頭で、その fragment 自身だけを以下の条件で確定する。
  - 親 fragment が mounted なら `true`
  - そうでなく DOM 未接続なら `false`
- つまり mounted は「訪問した fragment にだけ立つ」。

この方針だと、`data-if=false` で未訪問の子孫は `mounted=false` のまま残るため、後続の `evaluateIf` が既存通り `scan` 相当の初期化判定に使える。

### 属性評価順

fresh clone ルートでも順序は既存 `scan` と一致させる。

1. 優先属性
2. 通常属性
3. 遅延属性
4. `data-if` 偽判定なら停止
5. `data-each` を持つ子は親評価済み前提で再帰停止
6. 子要素再帰 / text 評価

補足:

- 実装上は `setAttribute` が `data-if` / `data-each` を即時評価するため、`initializeFreshAttributes` は順序を守るだけでよい。
- `data-each` 要素については、属性評価後に通常子孫再帰をしない契約を明示しておく必要がある。

## scan を完全代替すべきでない理由

1. `scan` は未知 DOM を受け入れる汎用入口であり、MutationObserver や import 後断片の初期化がぶら下がっている
2. fresh clone は template 由来で構造が既知だが、一般 DOM 追加はそうではない
3. `scan` を each 専用最適化に寄せると、observer/import 側の契約まで巻き込みやすい
4. `evaluateIf` の未初期化枝再開ロジックは現状 `scan` に依存しており、全面置換すると hidden subtree の再開経路まで同時変更になる

したがって、推奨は「`scan` を残し、新規 each 行だけ `initializeFreshEachRow` に分岐する」。

## 段階導入案

### 段階 1: traversal 置換のみ

- `updateDiff` の新規行だけ `Core.scan(child.getTarget())` を `initializeFreshEachRow(child)` へ置換
- `initializeFreshElement` 内部では既存 `Core.setAttribute` と `Core.evaluateText` を使う
- 対象:
  - text
  - 通常属性
  - `data-if`
  - `data-each`
  - `data-derive`
- 目的:
  - full scan の汎用入口を通らず、fresh clone subtree だけを局所初期化する

この段階では属性評価ロジックは既存実装を再利用し、差分を traversal に限定する。

### 段階 2: priority / normal / deferred の反復を共通化

- `scan` と `initializeFreshElement` の属性走査部分を共通 helper に寄せる
- 例: `applyInitialAttributes(fragment, options)`
- 目的:
  - `scan` と fresh clone の順序差異を防ぐ
  - 後続変更で一方だけ壊れるリスクを下げる

### 段階 3: scheduleEvaluateAll の縮小検証

- fresh clone ルートで `shouldScheduleEvaluateAll` を明示的に返し、現状の `needsScheduledEvaluateAll` 依存を局所化する
- nested `if` / `each` / `derive` で本当に後追いが必要なケースだけ残す

### 初手で見送るもの

- `data-fetch`
- `data-import`
- observer 経由ノード
- `scan` の全面差し替え

## 主要リスク

| 観点 | 重要度 | 対象箇所 | 対応仕様 | 提案内容 | 根拠 |
| ---- | ------ | -------- | -------- | -------- | ---- |
| mounted 契約 | 高 | `src/core.ts` の `evaluateIf` / `updateDiff` | hidden subtree は表示時に初期化される | 子孫へ mounted を一括伝播しない | 未初期化子に `evaluateAll` が走ると順序が崩れるため |
| 属性順序 | 高 | `scan` / 新初期化ルート | `derive` と `if` が通常属性より先 | `scan` と同一順序を helper で固定する | `href` 展開や派生値の参照が壊れやすいため |
| nested each | 高 | fresh row 内の `data-each` | 親要素で each を評価する | `data-each` 属性評価後は通常子孫再帰を止める | 行内で二重初期化しやすいため |
| hidden 分岐 | 高 | `data-if=false` subtree | 非表示中は未初期化を許容する | `shouldVisitChildren=false` を返して停止する | 表示後初期化テストと整合させるため |
| fetch/import 副作用 | 中 | `data-fetch` / `data-import` | 非同期副作用の既存契約 | 初手では fresh clone ルート対象外に近い扱いにする | each 最適化と責務が異なり切り戻しが難しいため |
| 実装重複 | 中 | `scan` と新ルート | 同じ属性順を保つ | 2 段階目で共通 helper 化する | 片方だけ順序がずれる回帰を防ぐため |

## 優先テスト

### 最優先

1. `tests/core.test.ts`
   - data-each 配下の a タグに `data-if` と `href` 補間が共存するケース
   - 理由: 行 binding、通常属性、nested if の順序崩れを最も検出しやすい
2. `tests/data-derive.test.ts`
   - フォーム更新で派生値を再評価し、select の `data-each` を更新するケース
   - 理由: `derive -> each` 順序を検証できる
3. `tests/data-derive.test.ts`
   - `data-if` が false の枝では `data-derive` 子孫を評価せず、表示後に初期化するケース
   - 理由: mounted と hidden subtree 契約の安全網になる

### 次点

4. `tests/data-derive.test.ts`
   - `data-each` 配下では各行の `data-derive` が独立し、兄弟行へ漏れないケース
   - 理由: row ごとの binding キャッシュ汚染を検出できる
5. `playwright/data-each-pagination-repro.spec.cjs`
   - `data-each` と `data-if` の組み合わせ回帰
   - 理由: jsdom では拾いにくいブラウザ実挙動の回帰を補完できる
6. `tests/data-each-browserlike.test.ts`
   - 基本の複数行生成
   - 理由: 新規ルートの最小正常系確認に向く

## 疑似コード

### updateDiff の新規行追加部分

```ts
if (reusedChild) {
  await Core.updateRowFragment(...);
  if (changed) {
    await Core.evaluateAll(reusedChild);
  }
} else {
  const child = template.clone();
  await Core.updateRowFragment(child, ...);

  const referenceChild = insertTargets[currentInsertIndex] ?? null;
  await parent.insertBefore(child, referenceChild);
  insertTargets.splice(currentInsertIndex, 0, child);

  await Core.initializeFreshEachRow(child);
}
```

### 新規メソッド群

```ts
private static initializeFreshEachRow(
  row: ElementFragment,
): Promise<void> {
  return Core.initializeFreshElement(row).then(result => {
    if (result.shouldScheduleEvaluateAll) {
      Core.scheduleEvaluateAll(row);
    }
  });
}

private static initializeFreshElement(
  fragment: ElementFragment,
): Promise<InitializeResult> {
  Core.markFreshFragmentMounted(fragment);

  return Core.initializeFreshAttributes(fragment).then(async result => {
    if (!result.shouldVisitChildren) {
      return result;
    }

    let shouldSchedule = result.shouldScheduleEvaluateAll;
    for (const child of fragment.getChildren()) {
      if (child instanceof TextFragment) {
        await Core.evaluateText(child);
        continue;
      }

      const childResult = await Core.initializeFreshElement(child);
      shouldSchedule ||= childResult.shouldScheduleEvaluateAll;
    }

    return {
      shouldVisitChildren: true,
      shouldScheduleEvaluateAll: shouldSchedule,
    };
  });
}

private static initializeFreshAttributes(
  fragment: ElementFragment,
): Promise<InitializeResult> {
  await Core.applyPriorityAttributes(fragment);
  await Core.applyNormalAttributes(fragment);
  await Core.applyDeferredAttributes(fragment);

  if (Core.isIfFalse(fragment)) {
    return {
      shouldVisitChildren: false,
      shouldScheduleEvaluateAll: false,
    };
  }

  if (fragment.hasAttribute(`${Env.prefix}each`)) {
    return {
      shouldVisitChildren: false,
      shouldScheduleEvaluateAll: Core.needsScheduledEvaluateAll(fragment),
    };
  }

  return {
    shouldVisitChildren: true,
    shouldScheduleEvaluateAll: false,
  };
}
```

## 推奨案

- 推奨は「`scan` を温存しつつ、新規 each 行だけ `initializeFreshEachRow` に分岐する案」。
- 初手は traversal 置換に限定し、属性評価ロジックは既存 `setAttribute` 群を使う。
- これなら性能改善余地を取りにいきつつ、壊しやすい契約は `mounted` と属性順序の 2 点へ局所化できる。

## 未解決事項

1. `data-fetch` を持つ row を fresh clone ルート初期化の対象に含めるか
2. `needsScheduledEvaluateAll` を将来的に縮小できるか
3. `scan` と fresh clone の属性走査 helper をいつ共通化するか

## 根拠にした資料

- `README.md`
- `docs/ja/guide.md`
- `src/core.ts`
- `src/fragment.ts`
- `tests/core.test.ts`
- `tests/data-derive.test.ts`
- `tests/data-each-browserlike.test.ts`
- `playwright/data-each-pagination-repro.spec.cjs`