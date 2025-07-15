# Haori 式評価エンジン仕様

## 1. 概要

Haori では、`{{...}}` や `data-if="..."` などのプレースホルダや条件式を評価するために、JavaScript の `Function` を使った動的評価を行う。
ただし、セキュリティとパフォーマンスを両立させるため、以下の対策を講じる。

---

## 2. 技術的方針

### 2.1 評価方式

* `Function(...args, body)` を使用して式文字列を関数として実行する。
* `"use strict"` を指定して `this` などの予期しない参照を無効化する。

### 2.2 セキュリティ対策

以下の禁止識別子を `undefined` に上書きし、式中で使用不能にする。

```ts
[
  "window", "self", "globalThis", "frames", "parent", "top",
  "Function", "eval", "setTimeout", "setInterval", "requestAnimationFrame",
  "alert", "confirm", "prompt", "fetch", "XMLHttpRequest",
  "constructor", "__proto__", "prototype", "Object", "Object.constructor", "Function.constructor",
  "this", "document", "location", "navigator", "localStorage", "sessionStorage",
  "IndexedDB", "history"
]
```

### 2.3 ASTキャッシュ

* 同一式文字列に対しては、評価関数（AST）をグローバルにキャッシュして再利用する。
* キャッシュキーは式文字列、値は `Function` オブジェクトとする。

---

## 3. 評価エラー対策

* 構文エラーや実行エラー時には `try/catch` によって安全に補足する。
* エラー時の評価結果は `null`。
* エラー内容は `console.warn` に出力（開発中のデバッグ用途）。

---

# 式評価関数の実装コード（evaluateExpressionSafe.ts）

```ts
type Scope = Record<string, any>;

// 式 → 評価関数のグローバルキャッシュ
const expressionCache = new Map<string, Function>();

// Haoriで禁止すべき識別子一覧
const forbiddenNames = [
  // グローバルオブジェクト
  "window", "self", "globalThis", "frames", "parent", "top",
  // 危険な関数/オブジェクト
  "Function", "eval", "setTimeout", "setInterval", "requestAnimationFrame",
  "alert", "confirm", "prompt", "fetch", "XMLHttpRequest",
  // 脱出経路・プロトタイプ
  "constructor", "__proto__", "prototype", "Object", "Object.constructor", "Function.constructor",
  // その他
  "this", "document", "location", "navigator", "localStorage", "sessionStorage",
  "IndexedDB", "history"
];

/**
 * Haori 式評価関数（安全・高速・キャッシュ対応）
 * @param expression 評価対象の式文字列（例: "name + 'さん'"）
 * @param scope 評価スコープ（data-bindなどから渡される値）
 * @returns 評価結果、またはエラー時は null
 */
function evaluateExpressionSafe(
  expression: string,
  scope: Scope = {}
): any | null {
  try {
    if (typeof expression !== "string" || expression.trim() === "") {
      throw new Error("式が空です");
    }

    // キャッシュから評価関数を取得または生成
    let evaluator = expressionCache.get(expression);

    if (!evaluator) {
      const allKeys = [...new Set([...forbiddenNames, ...Object.keys(scope)])];
      const body = `"use strict"; return (${expression});`;
      evaluator = new Function(...allKeys, body);
      expressionCache.set(expression, evaluator);
    }

    // 禁止識別子を undefined に設定
    const context: Scope = Object.fromEntries(forbiddenNames.map(k => [k, undefined]));
    const finalScope: Scope = { ...context, ...scope };

    // 呼び出し時に一致する引数順の値リストを作成
    const argKeys = [...new Set([...forbiddenNames, ...Object.keys(scope)])];
    const argValues = argKeys.map(key => finalScope[key]);

    return evaluator(...argValues);
  } catch (err) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[Haori:式評価エラー]", expression, err);
    }
    return null;
  }
}
```

---

## 4. 使用例

```ts
evaluateExpressionSafe("name + 'さん'", { name: "花子" });
// → "花子さん"

evaluateExpressionSafe("alert('危険')", { name: "花子" });
// → null（禁止識別子によりブロック）

evaluateExpressionSafe("");
// → null（空式は評価不可）
```

---

# Haori スコープ設計仕様

## 1. 目的

Haori における `data-bind` は、DOM 要素にローカルなデータスコープを与える仕組みである。
DOM上の任意のノードに `data-bind` を付与することで、そのノード配下に存在する式（例：`{{name}}`、`data-if="isActive"` など）の評価対象となるスコープが決定される。

この仕様では、Haori におけるスコープ構造の設計とその最適な運用方法を定める。

---

## 2. スコープ構造：`BindingScope`

### 定義

Haori は各 `data-bind` を持つ要素ごとに、以下の構造体を割り当てる。

```ts
interface BindingScope {
  parent?: BindingScope;                            // 親スコープ（data-bind を持つ上位ノード）
  data: Record<string, any>;                        // パース済みの data-bind 内容
  node: Element;                                    // このスコープに対応する DOM ノード
  evaluators: Map<Node | Attr, () => any>;          // 対応プレースホルダや属性の再評価関数群
  visible: boolean;                                  // ← true: 表示中 / false: 非表示（data-if によって削除済み）
}
```

### 補足

* `astCache` はグローバルキャッシュ（式文字列 → 関数）として一元管理されるため、`BindingScope` には含まれない。
* `BindingScope` インスタンスは `scopeMap: Map<Element, BindingScope>` によって各 DOM ノードに紐づけられる。
* `evaluators` はスコープの再評価時に一括で式を再実行するために使用される。

---

## 3. スコープの構築と運用

### 3.1 スコープ構築

初期DOMスキャン時に `data-bind` を持つノードに対して `BindingScope` を構築し、親子関係を明示する。

```ts
const scopeMap = new Map<Element, BindingScope>();

function bindScope(el: Element, parentScope?: BindingScope): void {
  const attr = el.getAttribute("data-bind");
  if (!attr) return;

  let data: Record<string, any>;
  try {
    data = JSON.parse(attr);
  } catch {
    data = {};
  }

  const scope: BindingScope = {
    parent: parentScope,
    data,
    node: el,
    evaluators: new Map()
  };

  scopeMap.set(el, scope);
}
```

---

### 3.2 スコープチェーンの解決

Haori における式評価時には、現在のノードのスコープを起点に親スコープをたどり、最終的なスコープオブジェクトを合成する。

```ts
function mergeScopeChain(scope: BindingScope): Record<string, any> {
  const result: Record<string, any> = {};
  const chain: BindingScope[] = [];

  let current: BindingScope | undefined = scope;
  while (current) {
    chain.unshift(current);
    current = current.parent;
  }

  for (const s of chain) {
    Object.assign(result, s.data);
  }

  return result;
}
```

### スコープマージのルール

* 同一キーが存在する場合、**子スコープの値が優先される**。
* 値がオブジェクトであっても、**親とマージせず完全に上書きされる**。

---

## 4. スコープ評価と式の実行

### 式の安全な評価

Haori では `evaluateExpressionSafe()` を通じて式を評価する。
このとき、スコープは `mergeScopeChain()` によって合成される。

```ts
function evaluateFromNode(el: Element, expression: string): any {
  const scope = scopeMap.get(el);
  if (!scope) return null;

  const context = mergeScopeChain(scope);
  return evaluateExpressionSafe(expression, context);
}
```

* `evaluateExpressionSafe()` はグローバルキャッシュとセキュリティ対策を備えた式評価関数である。
* 式中で `window`, `alert`, `Function` などのグローバル識別子は無効化される。

---

## 5. スコープと再評価

Haori では、`data-bind` によるデータ更新時、以下の処理が行われる。

1. 該当ノードの `BindingScope.data` を更新する。
2. そのスコープに登録されている `evaluators` をすべて再実行する。

```ts
function updateBindingData(el: Element, newData: Record<string, any>) {
  const scope = scopeMap.get(el);
  if (!scope) return;

  scope.data = newData;

  for (const reeval of scope.evaluators.values()) {
    reeval();
  }
}
```

---

## 6. スコープの削除と管理

### スコープの明示的削除

再利用されないノードに対しては、`Haori.deleteNode(el)` を呼び出し、以下の処理を行う：

* `scopeMap` から `el` およびその子孫に対応するスコープを削除
* DOMツリーからノードを削除
* カスタムイベント `haori:removed` を発火（任意）

```ts
function deleteNode(el: Element): void {
  for (const child of Array.from(el.children)) {
    deleteNode(child as Element);
  }

  scopeMap.delete(el);
  el.dispatchEvent(new CustomEvent("haori:removed", { bubbles: true }));
  el.remove();
}
```

---

## 7. `data-if` や `data-fetch-force` との連携

* `data-if` により非表示になっていても、`BindingScope` によってスコープ情報は保持される。
* `data-fetch-force` が指定されていれば、`data-if-false` 状態でもスコープを用いたフェッチが実行できる。
* 式の安全評価と `BindingScope` の保持により、**DOMに依存しないスコープ継続が実現される**。

---

## 8. スコープ削除に関する補足

* `scopeMap` に `WeakMap` は使用しない（`BindingScope` が `node` を強参照しているため）。
* 明示的な削除関数を通して `Map<Element, BindingScope>` を適切に管理する。
* `Haori.cloneNode()` で生成された新ノードには `bindScope()` を別途適用する。

---

# Haori `data-each` 差分描画仕様

## 1. 差分判定方式

* `data-each-key` が指定されている場合：

  * 各要素の `data-bind` に含まれる指定キー（例：`id`）の値を使って差分を判定する。
  * 同じキーの要素があれば、DOMノードを**再利用しつつ、プレースホルダのみ再評価する**。
  * 存在しないキーは行を新規に追加し、余分なキーの行は `Haori.deleteNode()` によって削除する。

* `data-each-key` が未指定の場合：

  * `data-bind` の内容（オブジェクト）全体を構造比較して差分を判定する。

---

## 2. DOMの順序変化対応

* `data-each-key` が一致していても、**配列内の順序が異なる場合はDOMノードを並び替える**。
* 並び替えには `Haori.appendBefore()` などを使用する。

---

## 3. 差分のない行は再評価しない

* キーおよび `data-bind` の内容に差分がない行は：

  * DOMノードの移動・削除を行わない
  * プレースホルダの再評価も行わない

---

## 4. DOM操作APIの拡張仕様

以下のすべての `Haori.append*()` 系関数は、**既存の子ノードであっても付け替え（再配置）として正しく処理する**。

### 対象APIと挙動

| 関数名                                 | 挙動                                                  |
| ----------------------------------- | --------------------------------------------------- |
| `Haori.appendBefore(target, newEl)` | `target` の直前に `newEl` を配置。すでに存在する場合は移動扱い。           |
| `Haori.appendAfter(target, newEl)`  | `target` の直後に `newEl` を配置。すでに存在する場合は移動扱い。           |
| `Haori.appendFirst(parent, child)`  | `parent.firstChild` の前に `child` を配置。すでに存在する場合は移動扱い。 |
| `Haori.appendLast(parent, child)`   | `parent.appendChild(child)` によって末尾に追加または移動。         |

---

## 5. 行の追加・削除におけるAPI使用

* 新規行追加時は `Haori.cloneNode()` を使用してテンプレートを複製。
* 不要になった行は `Haori.deleteNode()` によって削除。
* 並び替えは `Haori.appendBefore()` などで実施。

---

## 6. 差分描画エンジンの責務

* 行の追加・削除・並び替え・再評価の制御は差分描画エンジンが行う。
* `Haori.append*()` や `Haori.deleteNode()` は指示された通りに処理する低レベル操作として機能する。

---

# Haori `data-each` 差分描画アルゴリズム設計

## 1. 目的

Haori の `data-each` 属性は、配列の各要素を繰り返し表示するための機能である。
高い性能とユーザー体験を実現するため、Haori は差分描画（差分パッチ）を採用し、**変更のあった行のみを最小限のDOM操作で更新する**。

---

## 2. 差分判定方式

### 2.1 `data-each-key` の利用

* `data-each-key` 属性が指定されている場合、各要素のキー値（例：id）を使って差分を判定する。
* 同じキーを持つ行は**DOMノードを再利用**し、内部のプレースホルダのみ再評価する。
* 存在しないキーの行は削除、新しいキーの行は追加される。

### 2.2 未指定時の構造比較

* `data-each-key` が未指定の場合は、`data-bind` 内のオブジェクト内容を構造比較して差分を判定する。

---

## 3. DOMの順序変更への対応

* 配列内の順番が変更された場合、キーが同じでも**DOMノードを正しい順序に並べ替える**。
* 並べ替えには `Haori.appendBefore()` などを使用し、要素を再生成せずに順序だけ変更する。

---

## 4. 差分適用単位とルール

Haori は差分を次の3種類に分類して処理する：

| 操作タイプ    | 条件               | 処理内容                                    |
| -------- | ---------------- | --------------------------------------- |
| `insert` | 新しいキーが存在（既存行になし） | 行を `cloneNode()` → `bindScope()` で生成・挿入 |
| `remove` | 既存キーが不要になった      | `Haori.deleteNode()` で DOM とスコープを削除     |
| `move`   | 同じキーだが順序が異なる     | DOM ノードを並べ替え（再評価不要）                     |

---

## 5. 差分のない行は再評価しない

* キー・構造ともに差分がない行は**DOMもスコープも再利用され、再評価も行わない**。
* これにより、大規模なリスト変更でも最小限の描画処理に抑えられる。

---

## 6. 差分パッチの適用方法

### 6.1 非同期バッチ処理（`requestAnimationFrame` 使用）

* 差分適用は1フレーム内で **最大バッチ数（件数）ずつ実行**する。
* `requestAnimationFrame` によって UI 再描画との同期を維持し、フリーズを防止する。

### 6.2 バッチサイズの動的調整（自律制御）

* バッチ処理の所要時間に応じて、**処理件数（`batchSize`）を自動調整**する：

| 処理時間     | 調整内容                           |
| -------- | ------------------------------ |
| `< 8ms`  | `batchSize *= 1.5`（処理が軽いため増やす） |
| `> 16ms` | `batchSize *= 2/3`（処理が重いため減らす） |
| `8〜16ms` | 変化なし                           |

* `batchSize` の範囲は以下で制限される：

```ts
batchSize = Math.max(5, Math.min(100, batchSize));
```

---

## 7. 処理関数例

### 差分パッチ適用（非同期バッチ）

```ts
let batchSize = 20;

function applyDiffWithRAF(operations: RowOp[]) {
  let index = 0;

  function processFrame() {
    const start = performance.now();
    const end = Math.min(index + Math.floor(batchSize), operations.length);

    for (; index < end; index++) {
      applyOperation(operations[index]);
    }

    const duration = performance.now() - start;

    if (duration < 8) {
      batchSize *= 1.5; // 軽い：1.5倍
    } else if (duration > 16) {
      batchSize *= 2 / 3; // 重い：2/3倍
    }

    batchSize = Math.max(5, Math.min(100, batchSize)); // 範囲制限

    if (index < operations.length) {
      requestAnimationFrame(processFrame);
    }
  }

  requestAnimationFrame(processFrame);
}
```

### 単体操作実行

```ts
function applyOperation(op: RowOp): void {
  if (op.type === "remove") {
    Haori.deleteNode(op.element!);
  } else if (op.type === "insert") {
    const node = Haori.cloneNode(templateNode);
    node.setAttribute("data-row", op.key);
    Haori.appendLast(container, node);
    bindScope(node, scope);
    updateDataBind(node, { [argName]: op.data });
  } else if (op.type === "move") {
    Haori.appendBefore(op.target!, op.element!);
  }
}
```

---

## 8. その他の仕様要点

* 差分適用順は **配列のインデックス順（上から下）** に従って行う。
* 再描画された行には `data-row="key"` を必ず付与する（デバッグや追跡のため）。
* 差分適用の実行権限・責務は差分描画エンジンにある（`Haori` の DOM操作APIは命令通りに動作する）。

---

# Haori `data-if` 表示制御仕様

---

## 1. 概要

`data-if` は、与えられた式が `false` の場合に該当ノードを DOM から削除し、`true` の場合に再表示する表示制御属性である。
Haori ではこの動作に加えて、**各要素の `BindingScope` に `visible: boolean` フラグを保持し、スコープベースで表示状態を管理する**。

---

## 2. 表示制御の基本動作

### 2.1 `data-if` の評価が true のとき

* 要素は通常通り表示され、DOMツリーに存在する。
* `bindScope()` によって `BindingScope` が生成され、`visible: true` が設定される。

### 2.2 `data-if` の評価が false のとき

* 要素は DOM から削除される（`el.remove()`）。
* ただし `BindingScope` は `scopeMap` に残され、`visible: false` に更新される。
* ノード自体（`scope.node`）は保持されているが、DOMには存在しない。

---

## 3. `BindingScope.visible` の仕様

```ts
interface BindingScope {
  parent?: BindingScope;
  data: Record<string, any>;
  node: Element;
  evaluators: Map<Node | Attr, () => any>;
  visible: boolean; // true = 表示中, false = 非表示中
}
```

* `bindScope()` 実行時：`visible = true`
* `data-if` により非表示：`visible = false`
* `data-if` が再び true に変化：`visible = true` に戻し、DOMに再挿入

---

## 4. DOM削除と復元の処理

### 4.1 削除時（`data-if` = false）

* DOMからノードを除去：`el.remove()`
* `scope.visible = false` に設定
* 既存の `BindingScope` は削除されず保持される

### 4.2 再表示時（`data-if` = true）

* `scope.visible = true` に更新
* `scope.node` を親ノードに再挿入（例：`parent.insertBefore(scope.node, anchor)`）
* `evaluators` を通じて再評価を実行

---

## 5. 再評価のトリガー

以下のいずれかが発生したとき、Haori は `data-if` を再評価し、表示状態を更新する：

* 対象要素の `data-bind` の変更
* 親スコープの変更（親 `BindingScope.data` の更新）
* フェッチ結果によるスコープ再バインド

---

## 6. `data-if-false` 属性について

* Haori は内部的に非表示ノードに `data-if-false` を記録することがある。
* 表示制御の主判定は `scope.visible` で行い、DOM属性では判断しない。
* `data-if-false` はデバッグやテンプレート復元のために一時的に使用される。

---

## 7. 使用例

```html
<div data-bind='{"visible": false}'>
  <div data-if="visible">表示される内容</div>
</div>
```

* 初期表示では `visible = false` → 内部的に `scope.visible = false`、DOMは削除
* `visible = true` に変更 → 再評価により `scope.visible = true`、DOMに再挿入

---

## 8. 開発上の利点

| 項目           | 内容                                              |
| ------------ | ----------------------------------------------- |
| 表示状態の即時判定    | `scope.visible` を参照するだけでOK                      |
| 差分描画と連携しやすい  | `data-each` や `data-fetch-force` などと共通ロジックで制御可能 |
| スコープ再利用の最適化  | 再生成なしでバインディングや再評価を高速に実行可能                       |
| 再帰評価にも対応しやすい | 非表示要素も `scope` が残るため再評価対象になる                    |

---

## 9. 明示的な削除

* ノードとスコープを完全に削除したい場合は `Haori.deleteNode(el)` を使用する。
* この場合は `scopeMap.delete(el)` により `BindingScope` も解放される。
* 例外的に `data-row-remove` による行削除などで使用される。

---

## 10. まとめ：`data-if` の正しい扱い

| 状態                 | DOMに存在 | BindingScope | scope.visible |
| ------------------ | ------ | ------------ | ------------- |
| 表示中 (`true`)       | ✅ あり   | ✅ 保持         | `true`        |
| 非表示 (`false`)      | ❌ 削除済  | ✅ 保持         | `false`       |
| 完全削除（`deleteNode`） | ❌ 削除済  | ❌ 解放         | -             |

---

# Haori 再評価とスコープ依存設計仕様

（`BindingScope` 拡張版・2025年7月）

---

## 1. 概要

Haori は、`data-bind` によって生成されるスコープ単位で評価処理を行う宣言的UIエンジンである。
この仕様では、**どのスコープに属する式（プレースホルダ・属性）をいつ・どのように再評価するか**、およびそのための `BindingScope` 構造と管理方法を定義する。

---

## 2. BindingScope の構造（拡張後）

```ts
interface EvaluatedAttribute {
  attr: Attr;                 // 対象の属性ノード
  originalValue: string;      // プレースホルダ付きの元の文字列
  evaluator: () => any;       // 再評価関数
}

interface BindingScope {
  parent?: BindingScope;                 // 親スコープ（ネスト元）
  children: BindingScope[];             // 子スコープ（ネスト先）
  node: Element;                        // 対象のDOMノード
  visible: boolean;                     // 表示状態（data-if制御）
  data: Record<string, any>;            // このスコープのデータ（data-bind）
  evaluators: Map<Node | Attr, () => any>; // プレースホルダ再評価関数
  evaluatedAttrs: EvaluatedAttribute[];    // 属性評価に関する情報
}
```

---

## 3. 再評価のトリガと適用ルール

### 3.1 自スコープの `data-bind` が変更されたとき

* `evaluators` に登録されている全式を再評価する。
* さらに、`children` に含まれるスコープも再帰的に再評価する。

```ts
function rebind(scope: BindingScope) {
  if (!scope.visible) return;

  for (const fn of scope.evaluators.values()) {
    fn();
  }
  for (const child of scope.children) {
    rebind(child);
  }
}
```

---

### 3.2 親スコープの `data-bind` が変更されたとき

* 親スコープの変化は、子スコープにとっても評価式の変更要因となるため、
* すべての `children` を再評価する。

※ Haori は式の依存関係をトラッキングしない設計のため、安全側に倒して全評価。

---

### 3.3 `data-if` によって非表示になった場合

* `scope.visible = false` となる。
* この状態では再評価を行わない。
* ただし `data-if` の式だけは再評価される。
* `data-if` が true に変われば、DOM を復元し、`visible = true` に戻して再評価が行われる。

---

## 4. 属性評価（evaluatedAttrs）

* `class="{{type}}"` など、属性内のプレースホルダ式は `EvaluatedAttribute` として記録される。
* 再評価時に `originalValue` に基づいてプレースホルダ展開を行い、`setAttribute()` によって更新される。
* 式評価結果が空文字/undefined/null などであれば、属性を削除することもある。

---

## 5. スコープの生成・構造管理

### スコープ生成時（bindScope）

* DOMノードごとに `BindingScope` を構築
* 親スコープがあれば `.children.push(childScope)` によって階層関係を構築
* `scopeMap.set(node, scope)` により管理

### スコープ削除時（deleteNode）

* 該当スコープと `.children` をすべて再帰的に削除
* DOMノードを物理的に削除し、`scopeMap.delete(node)` を実行
* `BindingScope` のメモリも解放対象となる

---

## 6. 再評価対象の除外ルール

| 条件                        | 対象                       | 再評価されるか                 |
| ------------------------- | ------------------------ | ----------------------- |
| `scope.visible === true`  | 表示中                      | ✅ 評価対象                  |
| `scope.visible === false` | `data-if` により非表示中        | ❌ 評価対象外（`data-if` 式は評価） |
| ノード削除済                    | `Haori.deleteNode()` 実行済 | ❌ 完全除外                  |

---

## 7. メリットと拡張性

| 項目         | 内容                                      |
| ---------- | --------------------------------------- |
| 再評価コストの最小化 | 非表示・不要スコープは除外される                        |
| ツリー構造の明確化  | `children` により依存構造を明示                   |
| 差分適用と連携可能  | `visible` 状態に応じて `data-if` による復元・削除を効率化 |
| 属性再評価も統合   | `evaluatedAttrs` によって完全なDOM更新が可能        |

---

## 8. まとめ：スコープ評価仕様

| イベント                  | 再評価対象           | 条件付き                |
| --------------------- | --------------- | ------------------- |
| 自スコープの `data-bind` 更新 | 自 + 子スコープすべて    | `visible = true` のみ |
| 親スコープの `data-bind` 更新 | 子スコープすべて        | 同上                  |
| `data-if` = false     | 対象スコープ評価なし      | 式のみ評価               |
| `data-if` = true に変化  | 対象スコープ再評価＋DOM復元 | 即反映                 |
| スコープ削除                | 評価・DOM・メモリから削除  | 明示的操作が必要            |

---

## MutationObserver による動的要素の初期化処理

### 1. 監視対象とトリガー

* DOM に **新しいノードが追加された場合（childList + subtree）**、MutationObserver によって検知する。

---

### 2. 初期化処理の流れ（scanNodeTree）

追加されたノードとその子孫に対し、**以下の順序で再帰的に処理**を行う：

1. `data-bind` を持つ場合は `bindScope()` を実行（親スコープを自動検出）
2. `data-if` を持つ場合は `evaluateDataIf()` を即時実行し、評価が false の場合はノードを DOM から削除（ただしスコープは保持）
3. `data-each` を持つ場合は `evaluateDataEach()` により行描画を開始（テンプレートの初期化と `data-bind` の展開を行う）
4. ノード内または属性に `{{...}}` を含む場合は `registerPlaceholders()` によって評価関数を登録
5. 子ノードにも同様の処理を再帰的に適用

```ts
function scanNodeTree(el: Element): void {
  if (el.hasAttribute("data-bind")) {
    bindScope(el, findParentScope(el));
  }
  if (el.hasAttribute("data-if")) {
    evaluateDataIf(el);
  }
  if (el.hasAttribute("data-each")) {
    evaluateDataEach(el);
  }
  if (el.innerHTML.includes("{{") || [...el.attributes].some(attr => attr.value.includes("{{"))) {
    registerPlaceholders(el);
  }
  for (const child of el.children) {
    scanNodeTree(child as Element);
  }
}
```

---

### 3. 補足仕様

* **構文エラーがある `data-bind`**（例：不正なJSON文字列）は `try/catch` によりフォールバックし、空オブジェクト `{}` を使用。開発者モード時は `console.warn` を出力。
* `data-if` により削除されたノードも、`BindingScope` は保持され `visible: false` とする。
* `data-each` の行追加では `Haori.cloneNode()` と `bindScope()` によって行を初期化する。

---

### 4. 今後の実装タスクに反映すべき内容

* MutationObserver の `callback` 関数で `scanNodeTree(node)` を必ず実行
* `bindScope()` が重複して実行されないよう、`scopeMap` の存在チェックを導入
* 復元ノード（`data-if` true 化など）にも `scanNodeTree()` を適用可能とする

---

## 決定仕様：`data-fetch` 系の失敗時の挙動

### 1. スコープおよびバインド処理

| 項目                    | 挙動                                                                      |
| --------------------- | ----------------------------------------------------------------------- |
| フェッチ失敗時               | `data-fetch`, `data-click-fetch`, `data-change-fetch` のいずれであっても共通の処理とする |
| `data-bind` 更新        | 行わない（既存の `BindingScope.data` は保持され、変更されない）                              |
| プレースホルダ再評価            | 行わない（評価トリガが存在しないため）                                                     |
| `data-fetch-bind` 指定時 | 成功時のみ有効。失敗時は、対象要素が存在しても処理を一切行わない（更新も再評価もしない）                            |

---

### 2. エラー通知とログ出力

* フェッチ失敗時、`console.warn("[Haori:fetch error] ...")` を開発者モードにおいてのみ出力する。
* `data-fetch-bind` の指定がある場合でも、失敗時には対象要素に何の変更も行わない。

---

### 3. フォームとのエラー連携（補足）

* `data-click-form` や `data-fetch-form` が併用されており、レスポンスが以下のような形式でエラー情報を含んでいる場合：

```json
[
  { "key": "email", "message": "メールアドレスが不正です" },
  { "key": "password", "message": "必ず入力してください" }
]
```

* 各 `name` 属性に一致するフォーム要素に `data-message` を付与し、存在しない場合は `<form>` 要素に設定される。

---

### 4. 仕様書記述案（抜粋）

> フェッチ通信が失敗した場合（例：ネットワークエラーやステータスコードが 4xx/5xx の場合）、`data-bind` は更新されず、DOMの表示内容も変化しません。
> `data-fetch-bind` を指定していても、失敗時は一切の処理を行いません。成功時にのみ、指定したバインド先が更新され、必要な再評価が行われます。

---

## 3. `data-bind` の JSON 構文エラー処理

### 確認すべきテーマ

> `data-bind` に不正な JSON 文字列が記述されていた場合、どう扱うか？
> 例：`data-bind="{name: '山田'}"`（JSON ではなく JavaScript 風）

---

### 現在の実装方針（確認済み）

* \[`実装メモ.md`] に記載の `bindScope()` 関数では、`data-bind` の JSON パースに失敗した場合、以下のように処理しています：

```ts
let data: Record<string, any>;
try {
  data = JSON.parse(attr);
} catch {
  data = {};
}
```

* また、開発者モードが有効な場合は `console.warn` によって警告を出力する実装もあります。

---

### 提案する仕様（現行方針の明文化）

| 項目         | 内容                                                              |
| ---------- | --------------------------------------------------------------- |
| パースエラー時の対応 | `data-bind` の値が不正なJSON形式であれば、空オブジェクト `{}` を使用する                 |
| スコープの生成    | `bindScope()` は正常に実行し、`scope.data = {}` とする                     |
| ログ出力       | 開発者モード時に限り、 `console.warn("[Haori:data-bind構文エラー]", ...)` を出力する |
| 評価の継続      | `data-bind` が空でも、式評価（`{{name}}` など）はエラーなく継続される（ただし評価結果は null）   |

---

### 仕様書への記述案（抜粋）

> `data-bind` に不正な JSON 文字列が記述されていた場合（例：`{name: '山田'}` など）、Haori はそのノードに対して空のオブジェクト `{}` をスコープとして割り当てます。
> 開発者モードが有効な場合には、構文エラーを警告として `console.warn` に出力します。
> 式評価は継続されますが、指定された変数が未定義のため `null` が返される場合があります。

---

## 4. スコープの再生成／再利用の境界

### 検討テーマ

> ある要素に対して、すでに `BindingScope` が存在している場合、再度 `bindScope()` を実行すべきか？
> 特に以下のようなケースで判断が必要となる：

* `data-bind` の値が変更された場合（手動またはフェッチ結果で上書き）
* 親エレメントが再評価された場合
* 再描画処理の中でノードが再利用される場合（`data-each` の差分描画など）

---

### 現状仕様と基礎知識

* スコープは `scopeMap: Map<Element, BindingScope>` により、DOMノードと1対1に紐づけられる。
* `bindScope()` は、対象ノードにスコープがまだ存在しないときに実行される。
* `data-bind` の内容を変更する際は、スコープ再生成ではなく `updateBindingData()` を使う。
* 差分描画では、既存のノードをそのまま再利用し、スコープも再生成しない。
* テンプレートから新たに生成されたノードには、必ず新しい `bindScope()` が必要となる。

---

### スコープの再生成／再利用に関する判断基準

| ケース                              | 処理内容                                                 |
| -------------------------------- | ---------------------------------------------------- |
| `data-bind` の内容を更新したい            | `updateBindingData(el, newData)` を使ってスコープを更新（再生成しない） |
| 差分描画で既存ノードを再利用する場合               | `scopeMap` にスコープがあれば再利用（再生成しない）                      |
| `cloneNode()` によりテンプレートから新ノードを複製 | 新しい要素に `bindScope()` を実行する（スコープ未登録）                  |
| 削除されたノードを復元する                    | 必要に応じて `bindScope()` を再実行（`scopeMap` に登録されていない場合）    |

---

### 実装上の制御例

```ts
function ensureScope(el: Element, parentScope?: BindingScope): void {
  if (!scopeMap.has(el)) {
    bindScope(el, parentScope);
  }
}
```

```ts
function updateBindingData(el: Element, newData: Record<string, any>) {
  const scope = scopeMap.get(el);
  if (!scope) return;
  scope.data = newData;

  for (const reeval of scope.evaluators.values()) {
    reeval();
  }

  for (const child of scope.children) {
    rebind(child);
  }
}
```

---

### 仕様書記述案（抜粋）

> `bindScope()` によるスコープの生成は、対象ノードにまだスコープが存在しない場合にのみ行われます。
> すでにスコープが存在するノードに対して `bindScope()` を再実行することは想定されていません。
> `data-bind` の内容を変更する場合は、スコープを再生成するのではなく `updateBindingData()` によって値を更新し、再評価を行ってください。
> 差分描画によってノードが再利用される際も、スコープはそのまま再利用され、再生成は行われません。

---

## 5. 再評価対象ノードの明示的なクラス付与（開発者モード）

### 概要

Haori では、開発者モードが有効な場合、再評価が行われた DOM 要素に一時的に `haori-evaluated` クラスを付与し、視覚的に再評価の発生を確認できるようにします。

---

### 決定仕様

| 項目   | 内容                                           |
| ---- | -------------------------------------------- |
| 対象   | `BindingScope` の `evaluators` に登録された要素すべて    |
| クラス名 | `haori-evaluated`                            |
| 付与条件 | 開発者モードが有効なときのみ                               |
| 表示方法 | CSS により枠線や背景色でハイライト表示（任意にカスタマイズ可能）           |
| 自動削除 | **5秒（5000ミリ秒）後** に `setTimeout` によってクラスを削除する |

---

### 実装例

```ts
function markEvaluated(el: Element): void {
  if (!isDevMode()) return;
  el.classList.add("haori-evaluated");
  setTimeout(() => el.classList.remove("haori-evaluated"), 5000);
}
```

```css
.haori-evaluated {
  outline: 2px dashed #00f;
  background-color: rgba(0, 0, 255, 0.05);
  transition: outline 0.2s ease;
}
```

---

### 仕様書記述案（開発者向け節）

> Haori では、開発者モードが有効なとき、スコープやプレースホルダが再評価されると、対象ノードに `haori-evaluated` クラスが一時的に付与されます。
> このクラスは5秒後に自動的に除去され、ユーザーに影響を与えることはありません。デバッグ時に再評価の範囲を可視化する目的で使用されます。

---

## 6. 属性プレースホルダが複数ある場合のエラーハンドリング

### 検討テーマ

属性値に複数の `{{...}}` プレースホルダが含まれている場合、**その一部の式が評価エラーを起こしたときに、属性全体をどう扱うか**を定めます。

#### 例：

```html
<div class="status {{type}} color-{{level}}">
```

ここで `type` の評価に失敗した場合、`"status null color-3"` のように `null` が文字列化されてしまうと、意図しない表示になります。

---

### 決定仕様

#### 属性内プレースホルダの評価

1. 属性値に複数のプレースホルダが含まれる場合、**各プレースホルダは個別に評価される**。
2. 各式の評価は `evaluateExpressionSafe()` を通じて行われ、構文エラーや禁止識別子の使用時には `null` が返る。
3. **評価結果が以下のいずれかであれば、空文字列 `""` に変換する**：

   * `null`
   * `undefined`
   * `NaN`
4. 空文字とされたプレースホルダも含めて、属性値全体の文字列として再構築される。
5. **属性全体の出力はキャンセルせず、そのまま反映する**。
6. 開発者モードが有効な場合、評価エラーは `console.warn("[Haori:式評価エラー]", ...)` に出力される。

---

### 実装処理例（属性評価時）

```ts
const val = evaluateExpressionSafe(expression, scope);
return val == null || Number.isNaN(val) ? "" : String(val);
```

---

### 表示例

#### 入力：

```html
<div class="status {{type}} color-{{level}}">
```

#### スコープ：

```js
{ type: null, level: 3 }
```

#### 評価結果：

```html
<div class="status  color-3">
```

---

### 仕様書記述案（抜粋）

> 属性値に複数のプレースホルダ（`{{...}}`）が含まれている場合、それぞれの式は独立して評価されます。
> 評価結果が `null`、`undefined`、または `NaN` のいずれかであった場合、そのプレースホルダは **空文字列 `""`** として扱われます。
> 属性全体はそのまま出力され、評価不能なプレースホルダによって属性が欠落したり無効化されたりすることはありません。
> 開発者モードが有効なときは、式評価エラーが `console.warn` に出力されます。

---

## 8. `data-each` におけるネストスコープのスキャン

### 検討テーマ

> `data-each` によって要素が繰り返し描画される場合、**その配下に `data-bind` を含む要素が存在するとき、それぞれの行でスコープが正しく生成・初期化されるかどうか**を仕様として明確にする。

---

### 背景と前提

* `data-each` による繰り返し処理では、Haori はテンプレート要素（子ノード）を複製し、配列要素ごとに `data-bind` を設定して描画する。
* 各描画行には `data-row` が自動的に付与される。
* `data-each-arg` によりスコープ内の識別子（変数名）を制御できる。
* ネストされた構造（例：繰り返しの中にさらに `data-bind` や `data-each`）がある場合、**スコープの継承・上書きのルール**が重要になる。

---

### 検討ポイント

| 項目                              | 説明                                                    |
| ------------------------------- | ----------------------------------------------------- |
| 各行ごとに `bindScope()` を実行するか      | 行複製時に `data-bind` を持つ要素がある場合に対応できるか                   |
| ネストスコープの構造                      | 親の `data-bind` と子の `data-bind` がどう影響し合うか（スコープの継承と上書き） |
| 再評価時の正確な再構築                     | `data-each` の差分適用時、再評価に失敗しない構造となっているか                 |
| 子に `data-if`, `data-each` を含む場合 | 再帰的な評価とスコープ構築が正しく行われるかどうか                             |

---

### 提案仕様

#### 【仕様案】ネストスコープの初期化と継承

1. `data-each` によって複製された各要素（`data-row`）に対して、**独立した `BindingScope` を生成する（`bindScope()` を実行）**。
2. 複製された子要素の中に `data-bind` が存在する場合、そのスコープは**親の `BindingScope` を継承しつつ、定義されたキーで上書きされる**。

   * 同じキーが存在する場合は、**完全に上書き（マージしない）**
3. 子要素に `data-each` や `data-if` があれば、再帰的にスキャンし、適切に `bindScope()` および描画処理を実行する。
4. それぞれのスコープは、親スコープと `BindingScope.parent` によって接続され、スコープチェーンとして評価される。

---

### スコープの継承ルール（再掲）

* スコープは**親 → 子**の順で参照される。
* `data-bind` によるキーの衝突がある場合、**子スコープの値で完全に上書き**される。
* オブジェクトの場合もマージせず、**子の値で差し替え**。

---

### 表示例（2重の data-each）

#### HTML記述例

```html
<div data-bind='{"users":[{"name":"田中","tags":["A","B"]}]}' data-each="users" data-each-arg="user">
  <div>{{user.name}}</div>
  <ul data-each="user.tags" data-each-arg="tag">
    <li>{{tag}}</li>
  </ul>
</div>
```

#### 最終的なHTML構造（簡略）

```html
<div data-each="users" data-each-arg="user">
  <div data-row data-bind='{"user":{"name":"田中","tags":["A","B"]}}'>
    <div>田中</div>
    <ul data-each="user.tags" data-each-arg="tag">
      <li data-row data-bind='{"tag":"A"}'>A</li>
      <li data-row data-bind='{"tag":"B"}'>B</li>
    </ul>
  </div>
</div>
```

---

### 仕様書記述案（抜粋）

> `data-each` によって要素が複製される際、それぞれの行（`data-row`）には独立した `BindingScope` が生成されます。
> 複製された行内に `data-bind` を持つ要素がある場合、その要素は親スコープを継承した上で、自身の `data-bind` によって定義されたスコープを使用します。
> 同一キーが存在する場合、子スコープの値が親を完全に上書きし、マージは行われません。
> ネストされた `data-each` や `data-if` も、スコープチェーンに基づいて再帰的に処理されます。

---

## 9. 差分パッチ適用時の描画順制御（top-down 描画）

### 検討テーマ

`data-each` によって複製された複数の行要素に対し、Haori が差分パッチ（行の追加・削除・並び替えなど）を適用する際、**どの順序で描画・再評価を行うべきか**を明確にする。

---

### 決定仕様

#### 1. 差分適用の描画順序

* 差分パッチは常に **先頭から末尾へ向かう top-down 順** で適用される。
* これにより、DOM 操作が安定し、入れ子構造や再評価処理との整合性が保たれる。
* 削除・並び替え・挿入の各処理も top-down で行われる。

#### 2. 差分比較の基準

* `data-each-key` が指定されている場合：

  * 各行データの該当キー（例：`id`）の値を文字列化し、それをキーとして比較・追跡する。
  * キーの値が未定義・null でも、`"__undefined__{index}"` のような仮キーで処理される。
  * この場合でも **警告は表示しない**（特に `data-row-add` の初期行はキー未定が通常であるため）。

* `data-each-key` が指定されていない場合：

  * **各行の `data-bind` 属性の文字列値を比較対象**とする。
  * 同じ内容のオブジェクトでも異なるインスタンスであれば、`JSON.stringify` の結果に違いが出る可能性があるため、**属性文字列が完全一致する場合のみ「同一」とみなされる**。
  * この比較は構造比較ではなく、**属性値としての文字列一致比較**である。

#### 3. ネスト構造への対応

* `data-each` の中にさらに `data-each` がある場合、**親 → 子の順に再帰的に差分適用**する。
* 各行内のプレースホルダや属性再評価も、DOMの並び順（top-down）に従って順に実行される。

---

### 仕様書記述案（抜粋）

> `data-each` による複数行の描画において、差分パッチの適用は常に top-down（上から下）順に行われます。
> これにより、入れ子構造やプレースホルダ評価の整合性が保たれ、描画が安定します。
> `data-each-key` が指定されていれば、各行データの該当キー値に基づいて差分比較が行われます。
> キーが指定されていない場合は、行ごとの `data-bind` 属性の値（文字列）を比較基準とし、完全一致する場合のみ行が再利用されます。
> 差分比較の精度を高めたい場合は、`data-each-key` の明示的な指定を推奨します。

---

## 10. `data-row-add` による初期値の指定方法と削除動作

### 検討テーマ

`data-row-add` によって行を追加したとき、どのような初期値が設定されるか、および `data-row-remove` によって削除されたときに行が1件しか残っていない場合の動作を仕様として明確に定める。また、リセット処理におけるエラーメッセージ表示の扱いも含めて統一する。

---

### 決定仕様

#### 1. `data-row-add` の初期値指定

* `data-row-add` による行の追加時、初期値は `data-click-data` または `data-change-data` で指定することができる。
* 属性値が省略された場合、空オブジェクト `{}` を使用する。
* 追加された行は `data-each-key` が指定されていてもキーを持たない状態で問題なく扱われる（警告などは出さない）。

#### 2. `data-row-remove` の削除動作

* 複数行が存在する場合：対象行を DOM から削除する。
* 行が1件しか存在しない場合：削除は行わず、その行の内容を初期状態にリセットする。

#### 3. リセット処理の方式

* Haoriのすべてのリセット処理は、**HTML標準の `<form>.reset()` を使用して行う**。
* 対象が `<form>` 要素そのものである場合は、直接 `.reset()` を呼び出す。
* それ以外の要素（例：`<div data-row>`）が対象である場合、**一時的な仮想 `<form>` を生成し、対象ノードをその中に挿入して `.reset()` を呼び出す**：

```ts
const tempForm = document.createElement("form");
tempForm.appendChild(targetNode);
tempForm.reset();
```

#### 4. `data-message` の削除

* 上記のリセット処理において、対象ノードおよびその子孫に付与されている `data-message` 属性をすべて削除する。
* これにより、バリデーションエラーの表示が確実にクリアされる。

---

### 補足：要素別の初期値復元

* `<input>`：`defaultValue` に戻る
* `<select>`：`defaultSelected` に戻る
* `<input type="checkbox">`, `<input type="radio">`：`defaultChecked` に戻る
* `<textarea>`：`textContent` を `value` に戻す（ブラウザが自動処理）

---

### 表示例

#### HTML記述例

```html
<form data-bind='{"items":[{"name":"サンプル"}]}'>
  <div data-each="items">
    <div data-row>
      <input name="name" value="初期値">
      <div class="error" data-message></div>
      <button type="button" data-row-remove>削除</button>
    </div>
  </div>
  <button type="button" data-row-add data-click-data="{}">追加</button>
</form>
```

#### 操作結果

| 操作        | 結果                                                   |
| --------- | ---------------------------------------------------- |
| 「追加」クリック  | 空オブジェクト `{}` を初期値とする行が追加される                          |
| 行削除（複数行）  | 対象行が削除される                                            |
| 行削除（1行のみ） | 行は削除されず、仮想フォームでリセットされて「初期値」に戻る／`data-message` も削除される |

---

### 仕様書記述案（抜粋）

> `data-row-add` による行の追加では、初期値を `data-click-data` または `data-change-data` 属性で指定できます。属性がなければ `{}` が使用されます。
> 一方 `data-row-remove` による行の削除では、行が1件のみの場合には削除せず、その内容をリセットします。
> Haori はこのリセット処理を HTML 標準の `<form>.reset()` を使って行います。対象が `<form>` 自身でない場合には仮想的な `<form>` を生成し、その中でリセット処理を行います。
> また、リセット時には対象ノードとその配下に存在する `data-message` 属性をすべて削除し、エラー表示も初期化されます。

---

## 11. 初期HTMLにおける `value` 属性と DOM プロパティの関係

### 検討テーマ

フォーム要素において、HTML記述時に指定される属性（`value`, `checked`, `selected`, `textContent` 等）と、JavaScript DOM上で操作されるプロパティ（`.value`, `.checked`, `.selectedIndex` など）の関係を明確にし、Haori がそれらをどう扱うかを仕様として定める。

---

### 決定仕様

#### 1. 値の設定は DOMプロパティで行う

Haori の `data-bind` によるバインディングやフォーム反映は、すべて**DOMプロパティ**を通じて行う。

| 要素タイプ                     | Haoriが設定するプロパティ               |
| ------------------------- | ----------------------------- |
| `<input>`                 | `.value`, `.checked`（typeによる） |
| `<textarea>`              | `.value`                      |
| `<select>`                | `.value`, `.selectedIndex`    |
| `<input type="checkbox">` | `.checked`                    |
| `<input type="radio">`    | `.checked`                    |

> HTML上の `value` 属性や `checked` 属性は、Haori による動的処理では一切使用されず、**初期状態の生成にのみ影響する**。

#### 2. 初期値の構築も DOMプロパティから取得する

Haori が `<form>` 要素から初期の `data-bind` 値を構築する際も、**属性ではなく DOMプロパティの値を使用する**。
これにより、ブラウザの初期化処理（例：`value` 属性→`.value`、`textContent`→`.value`）が反映された実際の初期状態を正しく取得できる。

#### 3. `<textarea>` の特殊性と対応

* `<textarea>` には `value` 属性が存在しない（使用できない）。
* 初期値は HTML の `<textarea>初期値</textarea>` における **`textContent` によって決定される**。
* Haori は `.value` を設定／取得するが、リセット時には `.value = .textContent` を行う必要がある。

→ ただし、Haori はリセット処理を `form.reset()` に委ねるため、この処理はブラウザ側で自動的に行われる。

#### 4. リセット時の `data-message` 削除

* `form.reset()` の呼び出しと同時に、対象ノードおよびその配下に存在する `data-message` 属性をすべて削除する。
* これにより、バリデーションやエラー表示が完全に初期化される。

---

### 要素別の初期値に関するまとめ

| 要素                        | 初期HTML              | 初期DOMプロパティ                           | 備考                         |
| ------------------------- | ------------------- | ------------------------------------ | -------------------------- |
| `<input>`                 | `value="A"`         | `.value === "A"`                     | `.defaultValue` も `"A"`    |
| `<textarea>`              | `あいうえお`（タグ内）        | `.textContent`, `.value === "あいうえお"` | `value` 属性は使えない            |
| `<select>`                | `<option selected>` | `.value`, `.selectedIndex`           | `selected` 属性が初期状態を決定      |
| `<input type="checkbox">` | `checked` 属性あり      | `.checked === true`                  | `.defaultChecked === true` |

---

### 仕様書記述案（抜粋）

> Haori ではフォーム要素の値の取得・設定は、すべて DOM プロパティ（例：`.value`, `.checked`）を通じて行います。
> 初期HTMLにおける `value`, `checked`, `selected` 属性は、ブラウザによって初期状態として DOM に反映され、その後 Haori がバインディングや再設定の対象とするのはこの DOM プロパティの値です。
> 特に `<textarea>` においては、`value` 属性は存在せず、タグ内に記述されたテキスト（`textContent`）が `.value` の初期値になります。
> Haori のリセット処理では HTML 標準の `form.reset()` を使用し、これにより `<textarea>` も含めたすべての要素が自動的に初期状態に復元されます。
> また、リセット時には対象要素およびその子孫に付与された `data-message` 属性もすべて削除され、エラー表示もリセットされます。

---

## 12. `data-bind` の再評価に関する仕様（スコープと影響範囲）

### 検討テーマ

Haori において `data-bind` によるスコープが更新された場合、**どのエレメントが再評価されるか**、また再評価対象のスコープの範囲・優先順位・抑制条件を明確にする。
同時に、**依存トラッキング（部分再評価）の導入可否**についても方針を定める。

---

### 決定仕様

#### 1. `data-bind` の変更時に再評価される対象

* `data-bind` が変更された要素（自身）と、その配下にあるすべてのノードが再評価される。
* 再評価には以下が含まれる：

  * テキストノードの `{{...}}` プレースホルダ
  * 属性値中の `{{...}}` プレースホルダ
  * `data-if`, `data-each` 等の構造属性

#### 2. 子要素に `data-bind` がある場合

* 子要素に別の `data-bind` がある場合、その要素は**独立スコープ**とみなされ、**親スコープの再評価では対象外**となる。
* ただしスコープ自体は親を継承しており、親の `data-bind` 更新後に手動で再評価されることはある。

#### 3. `data-if` によって非表示中の要素

* `data-if="false"` により `data-if-false` が付与されているエレメントは、**DOM上に存在しないため再評価されない**。
* 再評価されるのは、`data-if` の条件が true になり、再表示された瞬間。

#### 4. プレースホルダの再評価タイミング

以下のいずれかに該当した場合に、該当スコープのプレースホルダが再評価される：

* 親または自身の `data-bind` の値が変更されたとき
* 親の `data-if` の評価が変化して非表示→表示になったとき

#### 5. 依存トラッキングは採用しない

* 各プレースホルダが「どのキーに依存しているか」を追跡し、必要最小限の再評価だけを行う**依存トラッキング機構**は導入しない。
* Haori は**スコープ単位での一括再評価**を採用し、実装の簡潔さ・動作の予測可能性・安定性を優先する。
* 将来的に依存トラッキングを導入する余地はあるが、初期実装には含めない。

---

### 表示例

#### HTML記述例

```html
<div data-bind='{"user":{"name":"田中"}}'>
  <p>{{user.name}}</p>
  <div data-bind='{"name":"上書き"}'>{{name}}</div>
</div>
```

#### `user.name` を「佐藤」に変更したとき：

* `<p>{{user.name}}</p>` は再評価されて「佐藤」になる。
* `<div data-bind='{"name":"上書き"}'>{{name}}</div>` は再評価されない（子スコープなので対象外）。

---

### 仕様書記述案（抜粋）

> `data-bind` によって形成されるスコープの値が更新された場合、Haori はそのノード自身と配下のノードすべてを再評価します。
> プレースホルダ、属性値、`data-if`、`data-each` などの評価も含まれます。
> ただし、配下に別の `data-bind` を持つ要素がある場合、その要素は独立スコープとして扱われ、親スコープの再評価では対象外になります。
> `data-if` によって非表示となったエレメントも再評価の対象外です。再表示された場合にのみ評価が行われます。
> Haori の初期実装では、依存トラッキングによる部分最適化は行わず、スコープ単位での再評価を基本とします。これにより、実装の安定性と予測可能性を確保します。

---

## 13. `data-each` における差分適用と `data-each-key` の仕様

### 検討テーマ

> `data-each` によるリスト描画において、**配列データの変更時にどのように差分パッチ（追加・削除・並び替え）を適用するか**を明確にする。
> また、要素の再利用や描画順の保持に関わる `data-each-key` の仕様も定義する。

---

### 背景と必要性

* Haori は `data-each` によって配列をもとにテンプレートを複製し、行を描画する。
* このとき、配列が変更された場合には**差分比較を行って最小限のDOM更新（パッチ）を適用**する必要がある。
* 差分を正確に適用するためには、行の\*\*識別子（キー）\*\*が必要であり、それを提供するのが `data-each-key`。

---

### 決定仕様

#### 1. 差分適用の目的と単位

* 配列の変更（要素追加・削除・並び替え）に対し、Haoriは**既存の DOM 行（`data-row`）との比較を行い、差分を適用する**。
* 行は `<div data-row>` 等として複製され、それぞれに対応するバインドデータが割り当てられる。

#### 2. `data-each-key` の役割と適用ルール

* `data-each-key="id"` のように指定された場合、各行データの `id` の値をキーとして比較を行う。
* キーが一意であれば、**同じ行を再利用し、必要に応じて並び替える**。
* キーがないデータが存在する場合、その行には `__undefined__{index}` のような仮キーが自動的に付与される。

  * この場合も警告などは出さず、描画は継続される。

#### 3. `data-each-key` がない場合の比較方法

* `data-each-key` が指定されていない場合、Haori は **各行に付与された `data-bind` の属性値（文字列）を比較**する。

  * JSONオブジェクトの構造ではなく、属性値の文字列が完全一致する場合のみ「同じ行」と見なす。
  * これにより、再利用ができない場合はすべての行が再生成される。

#### 4. 差分の適用順序

* 差分パッチは常に **上から下（top-down）** の順序で適用される。

  * 親スコープ → 子スコープ の順に再帰的に差分処理を行う。
* 削除 → 並び替え → 追加の順に処理される。

#### 5. `data-row` 属性の付与

* `data-each` により複製された要素には、必ず `data-row` が自動で付与される。
* `data-each-key` がある場合、その値が `data-row="1"` のようにキー値として付与される。
* `data-each-key` がない場合は `data-row` 属性は値なしで付与される。

---

### 表示例

#### HTML記述例

```html
<div data-bind='{"items":[{"id":1,"name":"A"},{"id":2,"name":"B"}]}' data-each="items" data-each-key="id" data-each-arg="item">
  <div>{{item.name}}</div>
</div>
```

#### 最終的なHTML構造

```html
<div data-each="items" data-each-key="id" data-each-arg="item">
  <div data-row="1" data-bind='{"item":{"id":1,"name":"A"}}'>A</div>
  <div data-row="2" data-bind='{"item":{"id":2,"name":"B"}}'>B</div>
</div>
```

---

### 仕様書記述案（抜粋）

> `data-each` によるリスト描画では、配列データの変更時に差分パッチが適用され、DOMの最小更新が行われます。
> 行の識別には `data-each-key` が使用され、指定されたキーの値をもとに既存行との一致を判定します。
> `data-each-key` がない場合は、`data-bind` 属性の文字列値が一致するかどうかで比較されます。
> 差分適用は top-down（上から下）で行われ、削除 → 並び替え → 追加の順に処理されます。
> 各行には自動的に `data-row` 属性が付与され、キー値がある場合はその値が属性値として使用されます。

---

## 14. スコープ継承と `data-bind` のマージルール

### 検討テーマ

> `data-bind` を入れ子に定義した場合、**親スコープと子スコープの値がどのように継承・マージされるか**、またキーの競合やオブジェクトの上書きに対して**どのような動作になるのか**を明確に定める。

---

### 背景

* Haoriでは、`data-bind` はスコープを形成するため、親スコープの値を引き継ぎながら、子スコープが独自のデータを定義することができる。
* ただし、以下のようなケースではマージ方法が問題となる：

```html
<div data-bind='{"user":{"id":1,"name":"田中"}}'>
  <div data-bind='{"user":{"name":"佐藤"}}'>
    {{user.id}} / {{user.name}}
  </div>
</div>
```

---

### 決定仕様

#### 1. スコープは**マージされる**

* 子の `data-bind` は親のスコープを **継承した上で、子に定義されたキーでマージされる**。
* 親と子に同じキー（`user` など）が存在する場合、そのキーは以下のルールで扱う：

#### 2. **同名キーがプリミティブ値の場合は子の値で上書き**

```json
親: {"value": 1}  
子: {"value": 2}  
結果: {"value": 2}
```

#### 3. **同名キーがオブジェクトの場合は完全に上書き（マージしない）**

```json
親: {"user": {"id":1, "name":"田中"}}  
子: {"user": {"name":"佐藤"}}  
結果: {"user": {"name":"佐藤"}}（`id` は失われる）
```

> これはオブジェクトの部分マージ（deep merge）ではなく、キー単位での上書きを行うため。

---

### 理由と利点

* スコープの評価が予測しやすく、**子の定義が常に優先される**ことが明確。
* `data-each-arg` や `data-bind='{"item": row}'` のように、明示的にラップして再構築できる。
* deep merge を採用すると副作用が大きく、テンプレートの読みやすさが損なわれる。

---

### 表示例

#### HTML記述例

```html
<div data-bind='{"user":{"id":1,"name":"田中"}}'>
  <div data-bind='{"user":{"name":"佐藤"}}'>
    <p>{{user.id}}</p>
    <p>{{user.name}}</p>
  </div>
</div>
```

#### 表示結果

```
（空欄）  
佐藤
```

#### 理由：

* `user.name` は子スコープの `"佐藤"`。
* `user.id` は子スコープの `user` に `id` が存在しないため、評価不能（undefined → 空欄）。

---

### 仕様書記述案（抜粋）

> `data-bind` によるスコープは、親のスコープを継承して構築されます。
> 子のスコープで定義されたキーは、親の同名キーを上書きします。
> ただし、同じキーがオブジェクトであった場合、Haori はそのオブジェクトをマージせず、**子のオブジェクトで完全に上書き**します。
> この仕様により、テンプレートの記述結果が明確になり、意図しない継承や部分マージを防止できます。

---

## 15. `data-each` における行操作と差分再描画の仕様

### 検討テーマ

> `data-row-add` / `data-row-remove` によって行を操作した場合に、**どのようにフォームデータに反映されるか**、また **差分再描画時にその行がどう扱われるか**を明確にする。
> 手動で追加・編集した行と、`data-fetch` などで更新された配列の競合についても扱う。

---

### 背景

* Haori の `data-each` は、フォームデータとDOMを双方向に同期するため、行追加・削除の操作により配列 (`data-bind`) が動的に変化する。
* 同時に、外部からのデータ更新（例：フェッチ）によって `data-bind` が置き換えられた場合、DOMとの整合性が必要になる。

---

### 決定仕様

#### 1. `data-row-add` / `data-row-remove` による配列更新

* `data-each` がフォーム内にある場合、行の追加・削除は双方向バインディングにより `data-bind` の配列に反映される。

  * `data-row-add`：新しいオブジェクトが配列末尾に追加される。
  * `data-row-remove`：該当の行のオブジェクトが配列から削除される。
* `data-each` がフォーム外にある場合、DOM上の操作のみが行われ、`data-bind` は変更されない。

#### 2. 行が1件しか存在しないときの `data-row-remove`

* 仕様10に従い、削除ではなく **リセット処理**を行う。
* 初期HTMLの `value` 属性や `textContent` に基づき、フォーム状態を復元する。

#### 3. `data-each-key` の有無による差分描画

* `data-each-key` がある場合：キー値を用いた差分適用（再利用・並び替え）。
* `data-each-key` がない場合：`data-bind` の文字列を比較し、完全一致した行のみ再利用。

#### 4. 手動で追加・編集された行は、親の `data-bind` が更新された場合に上書きされる

* 例：`data-fetch` によって `data-bind` が新しい配列で上書きされると、手動追加・編集行は **失われる**。
* 差分適用は `data-bind` の新しい内容を**唯一の真実の状態**（single source of truth）として扱う。

---

### 表示例（競合と再描画）

#### 状況：

1. ユーザーが「行追加」で1行追加
2. ユーザーがその行を編集
3. `data-fetch` によって `data-bind` が新しい配列で上書きされた

→ 結果：ユーザーが編集した行は消え、フェッチで得られたデータが表示される。

---

### 仕様書記述案（抜粋）

> `data-each` による行の操作は、フォーム内で使用する場合に `data-bind` の配列として双方向に同期されます。
> 行の追加 (`data-row-add`) や削除 (`data-row-remove`) は `data-bind` を直接変更し、DOMにも反映されます。
> ただし、フォーム外での使用では `data-bind` は変化せず、DOM上の一時的な表示変更にとどまります。
> また、フェッチなどにより `data-bind` が新しい配列で上書きされた場合、手動で編集・追加された行は破棄され、**新しいバインド内容が最優先されます**。
> 差分描画は、`data-each-key` がある場合はキー比較、ない場合は `data-bind` 属性値の文字列一致により行の再利用可否が決定されます。

---

## 16. `data-each` 内部の描画順・ネスト構造に関する仕様

### 検討テーマ

> `data-each` 内で複数のプレースホルダや `data-each` のネストが存在する場合、**描画・再評価の順序はどうなるか？**
> 特にプレースホルダ評価順と再帰的描画の処理順、DOMの安定性に関する仕様を明確にする。

---

### 背景

* `data-each` の中にさらに `data-each` が存在する（ネスト構造）。
* 行の中に複数の `{{...}}` プレースホルダがある場合、**DOM 上の出現順で順に評価されるのか**。
* 差分再描画時に順番が不安定だと、ユーザー体験やテスト結果に影響を与える。

---

### 決定仕様

#### 1. 差分描画は DOM の上から下（top-down）順に行う

* `data-each` の中の行は **上から順に**比較・更新・挿入される。
* 差分パッチ適用の順序も、出現順（index順）に一致する。

#### 2. ネストされた `data-each` は再帰的に評価される

* 親の `data-each` の描画が完了した後に、子の `data-each` を再帰的に処理する。
* これにより、親のスコープが子に確実に渡るタイミングが保証される。

#### 3. プレースホルダの評価は DOM の並び順に従う

* 同一ノード内に複数の `{{...}}` がある場合でも、**DOM に登場する順番に評価し、その都度反映する**。

#### 4. `data-bind` 変更後の再描画も同様

* `data-bind` の更新による差分再描画も、**DOM順に正確に処理され、描画順の安定性が保たれる**。
* 再評価順や順番の乱れによる視覚的ちらつきを防止する。

---

### 表示例：ネスト構造の描画順

#### HTML記述例

```html
<div data-bind='{"rows":[{"items":[1,2]},{"items":[3,4]}]}' data-each="rows" data-each-arg="row">
  <div data-each="row.items" data-each-arg="item">
    <span>{{item}}</span>
  </div>
</div>
```

#### 描画順序

* `rows[0].items`: 1 → 2
* `rows[1].items`: 3 → 4
  → 上から順に評価・描画され、DOM 上でも順序通りに表示される。

---

### 仕様書記述案（抜粋）

> `data-each` による複製要素の描画順は、**常に上から下（top-down）** となり、差分適用時もこの順序が保持されます。
> また、`data-each` の入れ子構造がある場合は、**親の `data-each` が描画された後に子の `data-each` を再帰的に処理**します。
> プレースホルダの評価も DOM の出現順に従って順に行われ、評価結果は即時反映されます。
> これにより、描画の安定性と順序性が保証され、ユーザーにとって予測しやすいUI構築が可能となります。

---

## 17. 開発者モードと視覚デバッグ

### 検討テーマ

Haori による DOM 処理やバインディング、差分描画の内容を開発者が確認できるよう、**開発者モードの導入と、視覚的またはコンソールによるデバッグ機能**を明確に定義する。

---

### 決定仕様

#### 1. 開発者モードの判定条件

以下のいずれかを満たす場合、Haori は「開発者モード」を有効とする：

* `<script>` タグに `data-dev` 属性が付与されている

  ```html
  <script src="haori.js" data-dev></script>
  ```

* 現在のページの URL に `localhost` を含んでいる

---

#### 2. `haori-evaluated` クラスの付与

* Haori によって初回評価されたノードには、**クラス `haori-evaluated`** を自動的に付与する。
* このクラスは開発者モードに関係なく、常に付与される。
* 再評価時に二重処理を避ける目的などにも使用される。

```html
<div class="haori-evaluated">...</div>
```

---

#### 3. 差分パッチ時のクラス `haori-patched` の付与

* `data-each` による差分描画で **新たに追加された行（`data-row`）** には、クラス `haori-patched` を付与する。
* このクラスは、開発者モードに関係なく常に付与されるが、**5秒後に自動で削除される**。

```ts
el.classList.add("haori-patched");
setTimeout(() => el.classList.remove("haori-patched"), 5000);
```

* 目的は、**視覚的・一時的なデバッグ表示**を行うため。

```html
<div data-row class="haori-patched">追加行</div>
```

（5秒後）

```html
<div data-row>追加行</div>
```

---

#### 4. コンソールログの出力（開発者モード時のみ）

開発者モードが有効なとき、以下のイベントに関するログを `console.log` / `console.warn` に出力する：

* `data-bind` のスコープ変更
* `data-each` における差分パッチ内容（追加・削除・並び替え）
* 構文エラー（例：不正な `{{` プレースホルダや `data-bind` JSON パースエラー）
* 禁止されている構文（例：空の `{{}}`）などの検出

#### 5. 本番モードでは出力しない

* 開発者モードが有効でない場合、上記ログ出力は一切行わない。
* ただし、**致命的エラー（構文破壊・DOM破損等）のみ `console.error` に出力する。**

---

### 補足：CSSでの視覚化例（開発者用）

開発者は次のような CSS を定義することで、`haori-patched` を視覚化可能：

```css
.haori-patched {
  outline: 1px dashed red;
  background-color: rgba(255, 0, 0, 0.05);
}
```

---

### 仕様書記述案（まとめ）

> Haori には開発者向けの「開発者モード」が存在し、`<script data-dev>` または `localhost` 上で有効になります。
> 開発者モードが有効なときには、`data-bind` の変更や `data-each` の差分描画に関する情報が `console.log` で出力され、デバッグが容易になります。
> また、描画済みノードには `haori-evaluated` クラスが、差分描画で追加されたノードには `haori-patched` クラスが付与されます。
> `haori-patched` は追加から5秒後に自動で削除され、視覚的な差分確認に使用できます。

---

# 追加仕様

---

## 7.X `data-fetch-validate`：フェッチ前にフォームのHTMLバリデーションを行う

### 概要

`data-fetch-validate` 属性を付与することで、Haoriがフェッチ処理を行う前に、対象のフォームに対して **HTML5 標準のバリデーション（`required`, `type=email` など）** を実行します。バリデーションに失敗した場合、通信は行われず、該当フィールドにブラウザ標準のエラー表示が行われます。

この機能は `data-fetch` 系属性（`data-click-fetch`, `data-change-fetch` 含む）と組み合わせて使用します。

---

### 属性仕様

| 属性名                   | 型       | 説明                                                                                                     |
| --------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `data-fetch-validate` | なし / 任意 | この属性が付いている場合、フェッチ前に対象フォームのバリデーションを実行する。バリデーションに失敗した場合は通信を行わず、`form.reportValidity()` により標準エラーUIが表示される。 |

* `data-fetch-form` が指定されている場合はそのフォームがバリデーション対象となります。
* `data-fetch-form` が省略されている場合は、**自ノードの祖先にある `<form>` 要素**が対象となります。

---

### HTML記述例

```html
<form id="searchForm">
  <input name="keyword" required />
</form>

<button
  data-fetch="/api/search"
  data-fetch-form="#searchForm"
  data-fetch-validate
>
  検索
</button>
```

---

### 最終的なHTML構造

```html
<form id="searchForm">
  <input name="keyword" required />
</form>

<button
  data-fetch="/api/search"
  data-fetch-form="#searchForm"
  data-fetch-validate
>
  検索
</button>
```

※ `data-fetch-validate` は削除されず、常に属性として残ります。

---

### 表示結果・動作結果

1. 入力欄 `keyword` が空の場合、ボタンを押すとHTML標準のエラーメッセージが表示され、フェッチは実行されません。
2. 入力欄に値を入力すると、通常どおりフェッチが実行され、指定URLにリクエストが送信されます。

---

### 対応するバリデーション例（HTML標準）

* `required`
* `type=email`, `type=number`, `type=url` など
* `min`, `max`, `pattern`, `maxlength`, `minlength` など

※ Haoriはブラウザの `form.checkValidity()` および `form.reportValidity()` を使用するため、各ブラウザの標準バリデーションに準じます。

---

### 補足仕様

* `data-click-fetch`, `data-change-fetch` にも共通で使用可能です。
* バリデーションに失敗した場合、Haoriは通信処理を**中断し、イベントも発火しません**。
* 開発者がバリデーション失敗に応じて追加処理をしたい場合は、独自に `invalid` イベントや `form.reportValidity()` の結果を監視してください。

---

# 仕様変更

---

### 1. ライブラリ名の変更

* **変更内容**：ライブラリ名を `Haori` から **`Haori-JS`** に変更。
* **影響範囲**：

  * ドキュメント上の表記（タイトル・本文・図解など）
  * HTML属性名やコード上の構文（例：`data-bind`）には影響なし

---

### 2. フェッチ時のエラーメッセージクリア

* **変更内容**：`data-fetch-form`（または `data-click-form` / `data-change-form`）が指定されている場合、
  **フェッチ開始時にフォーム内のすべてのエレメントから `data-message` 属性を削除**する。
* **目的**：前回表示されたエラーメッセージをリセットし、最新の検証結果を表示するため。

---

### 3. DOM変更の処理方式を「キュー」化

* **変更内容**：Haori-JSにおける**DOM操作はすべて非同期で行い、専用のキューに蓄積して順次処理**する。
* **対象操作**：バインド評価・要素の表示非表示・差分描画・行追加/削除・フェッチ結果反映など。
* **備考**：

  * 処理は `requestAnimationFrame` 単位でまとめて実行。
  * **「スタック」ではなく「キュー（FIFO）」方式**とする。

---

## 4.X `data-if` による非表示制御の挙動（詳細仕様）

### 非表示時の処理

`data-if` の評価が `false` になった場合、対象要素は以下のように扱われます：

* **対象要素そのものはDOMから削除されず残ります。**
* 子要素はすべてDOMから削除されます。
* 該当要素に `data-if-false` 属性が追加されます（属性値はなし）。
* 該当要素の `style.display` に `"none"` が設定され、非表示状態となります。

#### 元のスタイルの復元

* 初めて `false` と評価されたタイミングで、対象要素の `style.display` の値を `originalDisplayStyle` として内部に保持します。
* `style.display` が空文字列（つまり何も設定されていない）であれば、そのまま空として保存します。
* この値は `true` に戻ったときにそのまま `style.display` に復元されます。
* `getComputedStyle()` は使用せず、意図しない表示状態の変化を防ぎます。

### 表示切り替えの例

#### 初期状態（`data-if` が true のとき）：

```html
<div data-if="visible" style="display: inline-block">
  <span>表示中</span>
</div>
```

#### `visible` が false に評価されたときの最終的なHTML構造：

```html
<div data-if="visible" data-if-false style="display: none">
  <!-- 子要素は削除される -->
</div>
```

#### 再び `visible` が true に戻ったとき：

```html
<div data-if="visible" style="display: inline-block">
  <span>表示中</span> <!-- 子要素が再生成される -->
</div>
```

このように、`style.display` の元の値が復元され、外部CSSや継承に依存しない安定した切り替えが可能です。

---

