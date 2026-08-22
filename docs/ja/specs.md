# Haori.js 技術仕様書

バージョン: 0.45.2
最終更新: 2026-08-21

## 目次

1. [概要](#概要)
2. [アーキテクチャ](#アーキテクチャ)
3. [ディレクトリ構造](#ディレクトリ構造)
4. [コアモジュール](#コアモジュール)
5. [HTML属性仕様](#html属性仕様)
6. [式評価構文](#式評価構文)
7. [イベントシステム](#イベントシステム)
8. [パブリックAPI](#パブリックapi)
9. [内部実装詳細](#内部実装詳細)
10. [セキュリティ](#セキュリティ)
11. [パフォーマンス最適化](#パフォーマンス最適化)

---

## 概要

Haori.jsは、**HTML-First**の設計思想に基づく軽量なリアクティブUIライブラリです。JavaScriptコードをほとんど記述せずに、HTML属性のみで複雑なUIロジックを実装できます。

### 主な特徴

- **HTML属性ベース**: データバインディング、条件分岐、繰り返し処理などをHTML属性で宣言
- **仮想DOM実装**: 効率的なDOM更新と無限ループ防止機構
- **リアクティブシステム**: MutationObserverによる自動的なDOM監視と更新
- **式評価**: 表示の自動エスケープと、禁止識別子・禁止プロパティの遮断を備えた式評価エンジン（前提は「[XSS対策](#xss対策)」の脅威モデルを参照）
- **非同期キュー**: requestAnimationFrameベースの効率的なDOM操作
- **双方向バインディング**: フォーム要素との自動同期
- **ゼロ依存**: ピュアブラウザAPIのみで実装

### 対応ブラウザ

モダンブラウザ（ES6+、MutationObserver、Fetch API、Popover APIをサポート）

---

## アーキテクチャ

### 設計思想

Haori.jsは以下の設計原則に基づいて構築されています：

1. **宣言的UI**: UIの状態をHTMLで宣言的に記述
2. **プログレッシブエンハンスメント**: JavaScriptなしでも基本的な機能が動作
3. **最小限のAPI**: 学習コストを下げるシンプルなAPI設計
4. **パフォーマンス重視**: 差分更新とキャッシング戦略による高速化
5. **安全側の既定**: 表示は自動エスケープ、遷移先は同一オリジンのローカルパス検証を既定にする（式テキストの扱いは「[XSS対策](#xss対策)」の脅威モデルを参照）
6. **内部状態優先**: `visible` や binding data を正とし、DOM 上の表示状態は非同期で追随する

### アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────┐
│                        HTML (View)                          │
│  data-bind / data-if / data-each / data-fetch / etc.        │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                      Observer Layer                         │
│  MutationObserver → Core.setAttribute() → Fragment更新      │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                     Fragment Layer (仮想DOM)                │
│  ElementFragment / TextFragment / CommentFragment          │
│  - バインディングデータ管理                                   │
│  - 属性評価とキャッシング                                     │
│  - 子要素ツリー管理                                          │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                    Expression Engine                        │
│  式評価 (許可構文検証 + Proxyラップ + Function生成)          │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                      Queue System                           │
│  requestAnimationFrame ベースの非同期実行キュー              │
│  (1フレーム最大8ms、優先度制御)                              │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                       DOM (実DOM)                           │
└─────────────────────────────────────────────────────────────┘
```

### データフロー

```
ユーザー操作 / 属性変更
        ↓
  MutationObserver検知
        ↓
  Core.setAttribute()
        ↓
  Fragment更新 (バインディングデータ更新)
        ↓
  Expression評価 ({{ }} 式の計算)
        ↓
  Queue経由でDOM更新 (非同期)
        ↓
  イベント発火 (haori:*)
```

---

## ディレクトリ構造

```
src/
├── index.ts              - メインエントリーポイント、API公開
├── haori.ts             - ユーティリティメソッド (dialog, toast, confirm等)
├── core.ts              - コア機能 (Fragment管理、属性処理)
├── fragment.ts          - 仮想DOM実装 (ElementFragment, TextFragment等)
├── expression.ts        - 式評価エンジン ({{ }} の評価と遮断)
├── observer.ts          - DOM監視機能 (MutationObserver)
├── event.ts             - イベント発火ユーティリティ (haori:* イベント)
├── event_dispatcher.ts  - イベント振り分け (click, change, load)
├── procedure.ts         - 手続き的処理管理 (data-*-fetch等の実行)
├── form.ts              - フォーム双方向バインディング
├── queue.ts             - 非同期キュー管理 (requestAnimationFrame)
├── import.ts            - HTMLインポート機能
├── selector.ts          - セレクタ属性の解決 (テンプレート式の評価と安全な照会)
├── store.ts             - ブラウザストレージ連携 (data-store)
├── url.ts               - URLパラメータ取得
├── log.ts               - ログ出力管理
├── env.ts               - 環境検出 (prefix, 開発モード)
└── dev.ts               - 開発モードフラグ管理
```

### モジュール依存関係

```
index.ts (公開API)
  ├─ core.ts
  ├─ env.ts
  ├─ fragment.ts
  ├─ form.ts
  ├─ haori.ts
  ├─ log.ts
  ├─ queue.ts
  └─ observer.ts (副作用インポート: 自動初期化)

core.ts (中心的なオーケストレーター)
  ├─ env.ts
  ├─ form.ts
  ├─ fragment.ts
  ├─ procedure.ts
  ├─ store.ts
  ├─ url.ts
  ├─ import.ts
  └─ event.ts

fragment.ts (仮想DOM)
  ├─ queue.ts
  ├─ expression.ts
  └─ env.ts

observer.ts (DOM監視)
  ├─ core.ts
  ├─ event_dispatcher.ts
  ├─ intersect.ts (data-intersect-* の交差監視)
  ├─ poll.ts (data-poll-* の定期取得)
  └─ visible_range.ts (data-each-visible の可視範囲)

poll.ts (定期取得トリガー)
  ├─ core.ts
  ├─ fragment.ts
  ├─ procedure.ts
  └─ event.ts

procedure.ts (イベント処理)
  ├─ core.ts
  ├─ form.ts
  ├─ haori.ts
  ├─ selector.ts
  ├─ store.ts
  └─ event.ts

selector.ts (セレクタ属性の解決)
  ├─ fragment.ts
  └─ log.ts

store.ts (ブラウザストレージ連携)
  ├─ core.ts
  ├─ env.ts
  ├─ fragment.ts
  └─ log.ts
```

---

## コアモジュール

### 1. Core (core.ts)

**役割**: Fragment管理、属性評価、条件分岐・繰り返し処理などの中心機能

#### 主要メソッド

```typescript
class Core {
  // Fragment初期化
  static scan(element: HTMLElement): Promise<void>

  // 属性処理
  static setAttribute(element: HTMLElement, name: string, value: string | null): Promise<void>

  // バインディングデータ
  static setBindingData(element: HTMLElement, data: Record<string, unknown>, options?: SetBindingDataOptions): Promise<void>
  static getBindingData(element: HTMLElement, options?: {resolved?: boolean}): Record<string, unknown> | null
  static parseDataBind(data: string): Record<string, unknown>

  // DOM操作
  static addNode(parentElement: HTMLElement, node: Node): void
  static removeNode(node: Node): void
  static changeText(node: Text | Comment, text: string): void
  static changeValue(element: HTMLElement, value: string): Promise<void>

  // 評価
  static evaluateAll(fragment: ElementFragment): Promise<void>
  static evaluateText(fragment: TextFragment): Promise<void>
  static evaluateIf(fragment: ElementFragment): Promise<void>
  static evaluateEach(fragment: ElementFragment): Promise<void>
}
```

#### 属性処理の優先順位

Core.setAttributeは以下の優先順位で属性を処理します：

1. **優先属性** (この順で処理)
  - `data-bind`: バインディングデータ設定
  - `data-store`: ブラウザストレージからの復元
  - `data-url-param`: URLパラメータバインド
  - `data-if`: 条件分岐評価
  - `data-each`: 繰り返し処理評価

2. **通常属性**: その他のすべての属性

3. **遅延属性** (優先属性・通常属性の後に処理)
   - `data-fetch`: Procedure実行
  - `data-import`: HTML読み込み

#### data-if の動作

- 判定の基準は内部状態であり、`style.display` や `data-if-false` は追随結果として扱う
- 追随結果は**宣言として取り込みません**。`data-if-false` と、非表示のあいだの `style` は、DOM を監視して内部状態へ取り込む対象から外します。取り込むと属性の再適用（下の「未スキャンの子は `scan` で初期化する」）が非表示の状態を書き戻し、表示へ戻した分岐を非表示へ引き戻します
- 評価値が `false`, `null`, `undefined`, `NaN` の場合、要素を非表示化
- 非表示時:
  - `style.display = 'none'` を設定
  - `data-if-false` 属性を付与
  - **要素と子要素は DOM に残る**（削除しない）
  - 配下のフォームコントロールへ `disabled` を付与し、制約検証の対象から外す（エンジンが付けた印は `data-haori-if-disabled`）
  - `haori:hide` イベント発火
  - 自要素および配下の入力は `Form.getValues()`（`data-click-form` 等のフォーム値収集）と**バリデーション**の対象外となる。詳細は[フォーム送信での扱い](#data-if-false-分岐とフォーム送信)を参照
  - 配下は再評価しない（`data-attr-*` も評価されない）。表示へ戻った時点でまとめて再評価する
- 表示時:
  - 非表示時に付けた `disabled` を、印がある要素だけ解除する（子要素の再評価より前に行う）
  - `style.display` を復元
  - `data-if-false` 属性を削除
  - `haori:show` イベント発火
  - 子要素を再評価 (evaluateAll)。未スキャンの子は `scan` で初期化する

#### data-each の差分更新アルゴリズム

```typescript
// 1. リストキー生成
newList.forEach((item, index) => {
  const key = item[keyProperty] ?? crypto.randomUUID()
  newKeys.push(key)
  keyDataMap.set(key, { item, index })
})

// 2. 不要な要素を削除
existingChildren.forEach(child => {
  if (!newKeys.includes(child.getListKey())) {
    child.remove()  // haori:rowremove イベント発火
  }
})

// 3. 新規要素を挿入、既存要素を再配置
newKeys.forEach((key, targetIndex) => {
  let child = existingChildren.find(c => c.getListKey() === key)

  if (!child) {
    child = template.clone()  // 初回にテンプレート化した要素を複製
    // haori:rowadd イベント発火
  } else {
    // 既存要素の移動チェック
    if (currentIndex !== targetIndex) {
      // haori:rowmove イベント発火
    }
  }

  // データ更新
  // data-each-arg 指定時は要素データをそのキーで包み、指定が無ければ展開する。
  // data-each-index は「包んだ外側」＝行スコープの直下へ置く。
  child.setBindingData(
    argKey
      ? {[argKey]: item, ...(indexKey ? {[indexKey]: targetIndex} : {})}
      : {...item, ...(indexKey ? {[indexKey]: targetIndex} : {})}
  )
  child.setAttribute('data-row', key)

  // 正しい位置に挿入
  parent.insertBefore(child, parent.getChildren()[targetIndex])
})

// 4. イベント発火
HaoriEvent.eachUpdate(parent, addedKeys, removedKeys, allKeys)
```

**テンプレート管理**:
- 初回評価時: 最初の子要素をテンプレート化してDOMから削除
- `data-each-before` 属性を持つ要素: テンプレート化せず、ループ前に表示
- `data-each-after` 属性を持つ要素: テンプレート化せず、ループ後に表示
- 判定は**ループコンテナの直接の子**に対して行います。テンプレート行の内側へ書いた `data-each-before` / `data-each-after` は固定要素として扱われず、行と一緒に複製されます

**行外データの更新への追従**:

一覧（`data-each` の配列）が同値なら、行の追加・削除・移動は不要なので差分更新そのものは行いません。ただしそれだけでは、**行の中から行の外を参照している式**が更新されません。行内で別の一覧を `data-each` で描画する構成（行ごとの外部キー選択肢など）や、行内で親スコープの値を参照する構成（`{{row.amount}}{{unit}}`）が該当します。

そこで、テンプレートが参照している名前を静的に調べ、**行スコープの名前だけを参照している場合に限り**行の再評価を省略します。行スコープの名前とは `data-each-arg` と `data-each-index` で公開されるものです。判定できない場合はすべて「行の外を参照している」とみなして再評価します。具体的には次のとおりです。

- テンプレートが未確定
- `data-each-arg` を指定していない（要素データのキーが行スコープへ直接展開されるため、参照名を静的に決められない）
- 解析できない式
- 既知でない `data-*` 属性（値が式かどうか判断できないため）

この判定はテンプレート単位で不変なので、一度求めた結果をフラグメントへ保存して再利用します。

### 2. Fragment (fragment.ts)

**役割**: 仮想DOM実装、DOM操作の抽象化

#### クラス階層

```typescript
abstract class Fragment {
  protected parent: ElementFragment | null
  protected readonly target: Node
  protected mounted: boolean
  protected skipMutationNodes: boolean

  abstract clone(): Fragment
  remove(unmount: boolean): Promise<void>
  mount(): Promise<void>
  unmount(): Promise<void>
  getTarget(): Node
  getParent(): ElementFragment | null
  setParent(parent: ElementFragment | null): void

  // WeakMapキャッシュ
  static get(node: Node): Fragment | null
}

class ElementFragment extends Fragment {
  private readonly children: Fragment[]
  private readonly attributeMap: Map<string, AttributeContents>
  private bindingData: Record<string, unknown> | null
  private bindingDataCache: Record<string, unknown> | null
  private visible: boolean
  private display: string | null
  private template: ElementFragment | null
  private listKey: string | null
  private value: string | number | boolean | null

  // 子要素管理
  getChildren(): Fragment[]
  pushChild(child: Fragment): void
  removeChild(child: Fragment): void

  // 属性管理
  setAttribute(name: string, value: string | null): Promise<void>
  getAttribute(name: string): string | false | unknown | null
  getRawAttribute(name: string): string | null
  hasAttribute(name: string): boolean

  // バインディングデータ
  getBindingData(): Record<string, unknown>
  setBindingData(data: Record<string, unknown>): void

  // 値管理 (input/select/textarea)
  getValue(): string | number | boolean | null
  setValue(value: string | number | boolean | null): Promise<void>

  // 表示制御
  isVisible(): boolean
  show(): Promise<void>
  hide(): Promise<void>

  // DOM操作
  insertBefore(newChild: Fragment, referenceChild: Fragment | null): Promise<void>
  insertAfter(newChild: Fragment, referenceChild: Fragment | null): Promise<void>
}

class TextFragment extends Fragment {
  private text: string
  private contents: TextContents

  setContent(text: string): Promise<void>
  evaluate(): Promise<void>  // {{ }} 式の評価
}

class CommentFragment extends Fragment {
  setContent(text: string): Promise<void>
}
```

#### AttributeContents (属性内容の管理)

```typescript
class TextContents {
  protected static readonly PLACEHOLDER_REGEX = /\{\{\{([\s\S]+?)\}\}\}|\{\{([\s\S]+?)\}\}/g

  protected contents: Content[]

  evaluate(bindingValues: Record<string, unknown>): unknown[]
  static joinEvaluateResults(contents: unknown[]): string
}

class AttributeContents extends TextContents {
  isForceEvaluation(): boolean  // data-if, data-each は常に評価
}

enum ExpressionType {
  TEXT,            // 通常テキスト
  EXPRESSION,      // {{ }} 評価式 (エスケープあり)
  RAW_EXPRESSION   // {{{ }}} 生評価式 (innerHTML用)
}

interface Content {
  text: string
  type: ExpressionType
}
```

#### バインディングデータの継承

```typescript
getBindingData(): Record<string, unknown> {
  if (this.bindingDataCache) {
    return this.bindingDataCache
  }

  this.bindingDataCache = {}

  // 親のバインディングデータを継承
  if (this.parent) {
    Object.assign(this.bindingDataCache, this.parent.getBindingData())
  }

  // 自身のバインディングデータをマージ
  if (this.bindingData) {
    Object.assign(this.bindingDataCache, this.bindingData)
  }

  return this.bindingDataCache
}
```

#### 無限ループ防止機構

```typescript
// 例: setAttribute での無限ループ防止
setAttribute(name: string, value: string | null): Promise<void> {
  this.skipMutationAttributes = true

  return Queue.enqueue(() => {
    this.target.setAttribute(name, value)
  }).finally(() => {
    this.skipMutationAttributes = false
  })
}

// MutationObserver側で skipMutationAttributes をチェック
if (fragment.skipMutationAttributes) {
  return  // DOM更新をスキップ
}
```

### 3. Expression (expression.ts)

**役割**: 式評価エンジン（禁止識別子・禁止プロパティの遮断を含む。前提は「[XSS対策](#xss対策)」の脅威モデルを参照）

#### 主要メソッド

```typescript
class Expression {
  private static readonly EXPRESSION_CACHE = new Map<string, Function>()

  static evaluate(expression: string, bindedValues: Record<string, unknown>): unknown
  protected static containsDangerousPatterns(expression: string): boolean
  private static hasAllowedSyntax(expression: string): boolean
  private static wrapBoundValues(bindedValues: Record<string, unknown>): Record<string, unknown>
  private static withBlockedPropertyAccess<T>(callback: () => T): T
  protected static containsForbiddenKeys(obj: unknown): boolean
}
```

#### 禁止識別子リスト

```typescript
private static readonly FORBIDDEN_NAMES = [
  // グローバルオブジェクト
  'window', 'self', 'globalThis', 'frames', 'parent', 'top',

  // 危険な関数
  'Function', 'setTimeout', 'setInterval', 'requestAnimationFrame',
  'alert', 'confirm', 'prompt', 'fetch', 'XMLHttpRequest', 'Reflect',

  // プロトタイプチェーン
  'constructor', '__proto__', 'prototype', 'Object',

  // DOM/ブラウザAPI
  'document', 'location', 'navigator', 'localStorage', 'sessionStorage',
  'IndexedDB', 'history'
]

// strict モード専用の禁止識別子
private static readonly STRICT_FORBIDDEN_NAMES = ['eval', 'arguments']
```

`Object` も禁止識別子のため、`Object.assign({}, a, b)` のような式は使えません（`Object` が `undefined` になり `TypeError` で失敗します）。オブジェクトの合成はスプレッド構文 `{...a, ...b}` を使ってください。式がこれらの禁止識別子を独立した識別子として参照して評価に失敗した場合、コンソールに「`blocked identifier(s): …`」という警告が出力され、原因を特定できます（`foo.Object` のようなプロパティアクセスは誤検出しません）。

##### バインドのトップレベルキーと予約名

バインド対象オブジェクトの**トップレベルキー**が予約名（禁止識別子）と衝突する場合の扱いは、名前の種類で 2 つに分かれます。

- **再バインド可能な名前**（`location` / `history` / `document` / `navigator` / `localStorage` / `sessionStorage` / `IndexedDB`）: 名前空間衝突はするが「実行系・プロトタイプ脱出」ではないデータ／ナビゲーション／ストレージ系の名前です。これらは**トップレベルのバインドキーとして利用でき**、式中ではバインド値が同名のグローバルを遮蔽します（関数引数として渡されるため実グローバルへは到達しません）。例えば `{ "history": [ … ] }` をバインドして `data-each="history"` で繰り返せます。

  ```typescript
  private static readonly REBINDABLE_FORBIDDEN_NAMES = new Set([
    'location', 'history', 'document', 'navigator',
    'localStorage', 'sessionStorage', 'IndexedDB',
  ])
  ```

- **実行系・プロトタイプ脱出名**（`window` / `self` / `globalThis` / `frames` / `parent` / `top` / `Function` / `Object` / `eval` / `arguments` / `constructor` / `__proto__` / `prototype` / `Reflect` / `setTimeout` 等）: トップレベルのバインドキーとしては**使えません**。これらのキーは**そのキーだけが無視**され（引数から除外され、式中では `undefined` に遮蔽）、**残りの正常なキーはそのまま評価・描画されます**（バインド全体は破棄しません）。無視したキーがある場合は、原因特定のためコンソールに **`error`** ログで該当キー名を明示します（`Binding keys are reserved and ignored: …`）。

> ネストしたオブジェクトや配列要素の中のプロパティ名（例 `{ project: { location: '…' } }` の `location`）は識別子として評価されないため、**どの名前でも制約なく**利用できます。制約はトップレベルキーにのみ適用されます。

#### 評価メカニズム

```typescript
evaluate(expression: string, bindedValues: Record<string, unknown>): unknown {
  // 1. 空式と危険パターンをチェック
  if (expression.trim() === '' || this.containsDangerousPatterns(expression)) {
    return null
  }

  // 2. トップレベルキーの予約名衝突を検査。再バインド不可の禁止キーがあっても
  //    バインド全体は破棄せず、該当キー名を error ログに出して続行する
  //    （該当キーは後段で引数から除外・undefined 遮蔽される）。
  const forbiddenKeys = this.collectForbiddenKeys(bindedValues)
  if (forbiddenKeys.length > 0) {
    Log.error('[Haori]', `Binding keys are reserved and ignored: ${...}`)
  }

  // 3. 再バインド不可の禁止識別子を除外したバインドキーでキャッシュキーを作成
  const bindKeys = Object.keys(bindedValues)
    .filter(key => !FORBIDDEN_BINDING_NAMES.has(key))
    .sort()
  const cacheKey = `${expression}:${bindKeys.join(',')}`

  // 4. 評価関数をキャッシュまたは生成
  let evaluator = EXPRESSION_CACHE.get(cacheKey)

  if (!evaluator) {
    // 5. strict mode と禁止識別子の無効化を入れた評価関数を生成
    const assignments = FORBIDDEN_NAMES
      .map(name => `const ${name} = undefined`)
      .join(';\n')

    const body = `"use strict";\n${assignments};\nreturn (${expression});`

    evaluator = new Function(...bindKeys, body)
    EXPRESSION_CACHE.set(cacheKey, evaluator)
  }

  // 6. バインド値を Proxy でラップし、評価中のみ prototype 系アクセスを遮断して実行
  const wrappedValues = this.wrapBoundValues(bindedValues)
  const argValues = bindKeys.map(key => wrappedValues[key])
  return this.withBlockedPropertyAccess(() => evaluator(...argValues))
}
```

**セキュリティレイヤー**:
1. トークン解析で許可された式構文かどうかを検証
2. 正規表現で `eval()` や `arguments` 参照などの危険パターンを検出
3. 禁止識別子を `undefined` で上書きし、strict モードで `eval` と `arguments` を抑止
4. トップレベルキーが再バインド不可の予約名と衝突する場合は**該当キーのみ無視**（引数から除外＋`undefined` 遮蔽）し、`error` ログにキー名を明示。バインド値を再帰的にチェックし、実ホストオブジェクト等の**危険な値**を含む入力は拒否
5. plain object / array / function を Proxy でラップし、`constructor`、`__proto__`、`prototype` へのアクセスを遮断
6. 評価中のみ prototype 系プロパティの生アクセスを一時的に遮断（`Object.prototype` と `Function.prototype` の `constructor`、`Object.prototype.__proto__`）
7. 計算プロパティ名（`obj[式]`）は評価時にプロパティ名を検査し、`constructor` / `__proto__` / `prototype` のときは名前を `undefined` へ差し替え
8. バインドに無い識別子を関数スコープへ引き込み、グローバルへ解決されないよう遮蔽（後述）

3・5・6・7 で遮断されたアクセスは、[暗黙のオプショナルチェーン](#暗黙のオプショナルチェーン)により例外ではなく `undefined` になります。遮断は同じですが原因が見えにくくなるため、遮断された識別子を参照している式には開発モードで警告を出力します。

**7 は名前の書き方に依存しません。** 1 の構文検証は文字列リテラルのトークンを 1 個ずつ照合するため、`obj["con" + "structor"]` のように**式で組み立てた名前**は検出できません（`String.fromCharCode`・`join`・Unicode エスケープなど作り方は無数にあります）。名前が確定するのは評価時なので、そこで検査します。

#### バインドに無い識別子の扱い

式の識別子は、バインディングデータのキーとして解決します。**バインドに無い識別子はグローバルへ解決しません**。

遮蔽しない場合、生成した評価関数のスコープチェーンを通って `window` まで到達し、次のように「値のある参照」に化けてしまいます。

- `id="agencyCode"` の要素があると、`{{agencyCode}}` がその要素オブジェクトへ解決される（HTML の named access on window）。`data-attr-value` に書くと入力欄へ `[object HTMLInputElement]` が書き込まれ、`required` の必須検証も通ってしまう
- `{{name}}` `{{status}}` `{{length}}` `{{origin}}` のような `window` の既存プロパティが、その値（多くは空文字や数値）へ解決される

そのため、式に現れる識別子のうちバインドに無いものは評価関数のスコープ内へ宣言し、グローバルへ到達しないようにします。挙動は「バインドに無いキーを参照した」場合と同じです。

**バインドに無いキーの参照は正常系です。エラーにはしません。** 初期表示ではまだ値が届いていないことが普通であり、それを避けるためにキーを `data-bind` へ宣言（種まき）する必要はありません。

- 参照された識別子がバインドに無い場合は**未解決参照**とし、評価結果は `undefined` になります
- `?.` / `??` / `||` / `&&` を含む式では、従来どおり `undefined` として評価を続けます（`{{agencyCode ?? ''}}` は空文字になります）
- 短絡評価や三項演算子で**参照されなかった**識別子は、未解決参照になりません（`{{flag ? missing : 5}}` は `flag` が偽なら `5`）
- 診断は[未解決参照の診断](#未解決参照の診断)を参照してください（既定では `error` を出しません）

**式から参照できる標準組み込み**は遮蔽の対象外です。以下は従来どおり利用できます。

| 分類 | 識別子 |
| ---- | ------ |
| 名前空間 | `Math` / `JSON` / `Intl` / `Atomics` |
| コンストラクタ | `Array` / `String` / `Number` / `Boolean` / `Date` / `RegExp` / `Symbol` / `BigInt` / `Map` / `Set` / `WeakMap` / `WeakSet` / `WeakRef` / `FinalizationRegistry` / `Promise` / `Proxy` |
| エラー | `Error` / `AggregateError` / `EvalError` / `RangeError` / `ReferenceError` / `SyntaxError` / `TypeError` / `URIError` |
| バイナリ | `ArrayBuffer` / `SharedArrayBuffer` / `DataView` / 各 TypedArray |
| 関数 | `parseInt` / `parseFloat` / `isNaN` / `isFinite` / `encodeURI` / `encodeURIComponent` / `decodeURI` / `decodeURIComponent` |

`Object` / `Function` / `Reflect` / `window` / `document` などは従来どおり禁止識別子として `undefined` に遮断されます。

#### 暗黙のオプショナルチェーン

**メンバーアクセスは、式の中では常にオプショナルチェーンとして評価します。** テンプレート側で `?.` を書く必要はありません。

| 記述 | 実際の評価 |
| ---- | ---------- |
| `a.b` | `a?.b` |
| `a[i]` | `a?.[i]` |
| `a.b()` | `a?.b?.()` |

- 途中の値が `null` / `undefined` でも `TypeError` にはならず、結果は `undefined` になります
- `{{view.totalCount}}` のように、値が届く前でもそのまま書けます（`{{view?.totalCount}}` や `data-bind='{"view":{}}'` は不要）
- すでに `?.` を書いてある式はそのまま動作します（二重には適用しません）
- 解決できる場合の結果は従来と同じです。`items.map(i => i.v)` や `Math.max(...scores)` のような呼び出しも変わりません
- 変換はメンバーアクセスに限られます。アロー関数の引数リストやグループ化の丸括弧は呼び出しとみなしません

なお、値が存在しても**呼び出せない**場合（`a.b` が数値なのに `a.b()` と書いた場合など）は従来どおり `TypeError` となり、`error` ログを出力します。

#### 未解決参照の診断

未解決参照は正常系であるため、**既定では `error` ログを出力しません**。

| 実行環境 | 出力 |
| -------- | ---- |
| 本番（開発モード無効） | 出力しない |
| 開発モード | 描画完了後に集約した `warn` を 1 回 |
| `data-strict-bind` 指定時 | 検出時点で `error` |

開発モードの集約警告は、次のように「タイポだけが残る」ようにしています。

- 評価のたびには出力せず、レンダリングキューが安定した時点でまとめて 1 回出力します
- その時点までに `data-fetch` や `data-bind` の更新で**一度でも供給されたキーは報告しません**。初期表示の一過性の未解決参照では警告が出ません
- 報告対象はスコープ横断の識別子名です。同名キーが別スコープで解決していると検出できないため、タイポ検出はベストエフォートです
- [判定する式](#判定する式と値を求める式)として結論が出た場合は報告しません（`data-if="!missing"` は「無い」ことが結果そのものであり、異常ではないため）

開発モードでは、**別のスコープでは供給されているキー**を参照している式も、描画完了後に 1 回だけ警告します。

- `??` や `?.` で既定値を書いた式は値のある結果になるため未解決参照になりません。そのため、応答のバインド先を兄弟要素にしてしまった宣言（バインドは対象要素とその子孫にしか見えません）が、無言で既定値のまま表示され続けます
- 同じ式でキーが解決した評価があれば報告しません。行ごとに応答を取得する構成では、ある行が先に解決している間だけ別の行が一時的にスコープ外になるためです（誤検知より見落としを選びます）
- 同じ式とキーの組は一度だけ報告します
- **式の中で束縛される名前（アロー関数の引数）は報告しません**。`items.find(p => p.id === target)` の `p` はバインドで解決されるべき名前ではないため、同じ名前を `data-each-arg` に使う兄弟要素があるだけで警告になっては困ります。括弧付きの引数リスト（`(a, b) => …`）と分割代入（`({a}) => …`）も対象です。引数の既定値の中で呼び出す関数の引数（`(a = f(b)) => …` の `b`）は束縛ではないため、従来どおり報告対象です
- **行スコープの名前（`data-each-arg` / `data-each-index`）は報告しません**。`data-each` はコンテナが未マウント（または非表示）のあいだ差分更新を待つため、その間は行テンプレートが**コンテナのスコープ**で評価され、行スコープの名前は必ずスコープ外になります。行が描画されれば供給されるので、そのまま扱うと正常な構成（行の中で `data-fetch` の URL を `data-each-arg` のキーで組み立てるなど）に警告が出てしまいます。行スコープの名前は、この診断が狙っているバインド先の取り違えでは供給されない名前です

厳格に運用したい場合は、読み込み時に `data-strict-bind` を指定します。

```html
<script src="haori.js" data-strict-bind></script>
```

#### 判定する式と値を求める式

未解決参照を「表示する」ときは空になりますが、「判定する」ときは結論を出せます。そのため、バインドに無いキーを `undefined` とみなして評価し直した結果が**真偽値になる場合だけ**、その値を採用します。

| 式 | 結果 | 未解決参照 |
| -- | ---- | ---------- |
| `{{missing}}` | `undefined` | ○ |
| `{{'x' + missing}}` | `undefined` | ○（`'xundefined'` にしない） |
| `{{a + b}}` | `undefined` | ○（`NaN` にしない） |
| `{{!_fetch.status}}` | `true` | × |
| `{{count > 0}}` | `false` | × |

これにより、`data-if="!_fetch.status"` のような「まだ何も起きていないとき」の表示が、宣言もオプショナルチェーンも書かずに成立します。

#### 組み込みヘルパー（予約名前空間 `haori`）

式評価エンジンは、純粋関数の組み込みヘルパー（`builtins.ts`）を予約名前空間 `haori` として式スコープへ注入します。実装は `src/builtins.ts`、注入は `Expression.evaluateDetailed` 内で行います。

- **注入条件**: 式が `haori` を独立した識別子として参照する場合のみ注入します（`/(^|[^\w$.])haori(?![\w$])/`）。参照しない式には引数も Proxy ラップも追加しません。`foo.haori` のようなプロパティアクセスは注入対象外です。
- **優先順位**: `data-bind` に `haori` キーがあっても、式中では組み込みが優先されます（バインド値は無視。開発モードでは `Log.warn` で警告）。
- **凍結との関係**: 公開 API 用の `Builtins` は `Object.freeze` 済みですが、凍結オブジェクトをそのまま注入すると評価時の Proxy ラップが Proxy 不変条件（read-only プロパティに別値を返せない）に違反するため、注入には非凍結の浅いコピーを用います。
- **提供関数**（公開 API `Haori.date` / `Haori.now` / `Haori.today` / `Haori.number` / `Haori.range` / `Haori.pages` / `Haori.monthAdd` / `Haori.monthRange` / `Haori.pageSummary` / `Haori.findBy` / `Haori.sum` / `Haori.distinct` / `Haori.groupBy` としても同一実装を提供。`now` / `today`、および `monthRange` を `base` 省略で呼ぶ場合は現在時刻・現在月に依存して非冪等。それ以外は副作用なし・冪等）:
  - `haori.date(value, format?, timeZone?)`: ISO 文字列・エポックミリ秒・`Date` を整形（既定 `yyyy/MM/dd HH:mm`）。トークン `yyyy yy MM M dd d HH H mm ss`。空・不正値は空文字。`timeZone` を省略するとブラウザのローカル時刻で整形し、IANA タイムゾーン名（例 `Asia/Tokyo`）を指定するとそのタイムゾーンの時刻で整形する（`Intl.DateTimeFormat` を利用、24 時間表記）。`timeZone` が不正な名前の場合は空文字を返す。**トークンに使う英字（`y M d H m s`）はフォーマット中のどこにあってもトークンとして解釈される**ため、リテラルとして出したい英字はシングルクォートで囲む（例 `yyyy-MM-dd'T'HH:mm`、`''` はシングルクォート1文字）。`/ : -`・日本語などトークン外の文字はそのまま出力。
  - `haori.now(format?, timeZone?)`: 評価時点の現在日時を `haori.date` と同じ規則で整形する（既定 `yyyy/MM/dd HH:mm`）。トークン・`timeZone`・不正値の扱いは `haori.date` に準拠（不正な `timeZone` 名は空文字）。**現在時刻に依存するため冪等ではなく、式の再評価ごとに最新時刻へ更新される**。
  - `haori.today(offsetDays?, format?, timeZone?)`: 現在日付に `offsetDays` 日を加減して整形する（既定 `offsetDays` 0、既定フォーマット `yyyy-MM-dd` ＝ `input[type=date]` 互換、時刻成分は常に 00:00:00）。日付の加減算は UTC 基準のカレンダー演算で行うため**月跨ぎ・年跨ぎを自動処理し DST の影響を受けない**。`timeZone` 指定時はそのゾーンの「現在日付」を起点に加減算する（例 UTC 23:30 でも `Asia/Tokyo` では翌日扱い）。`offsetDays` が非有限なら 0、`timeZone` が不正な名前なら空文字。**現在日付に依存するため冪等ではなく、式の再評価ごとに最新日付へ更新される**。一覧の絞り込み初期値などに利用するが、`data-attr-value` は初期値ではなく再評価されるため（下記注意参照）日跨ぎや再描画で値が変わりうる。
  - `haori.number(value, decimals?)`: 桁区切り付きで数値を整形（`Intl.NumberFormat`、`en-US`）。非数値・null・空文字・空白のみは空文字（数値文字列は前後空白を無視）。`en-US` ロケールは区切り文字（カンマ・ドット）を決めるだけで、小数桁は固定しません。`decimals` を指定するとその桁数で固定します（末尾ゼロ埋めあり。例 `number(1000, 2) → "1,000.00"`）。`decimals` を省略した場合は `Intl.NumberFormat` の既定に従い、整数はそのまま・小数は末尾ゼロ埋めなしで表示し、**小数は最大 3 桁まで（`maximumFractionDigits = 3`）に丸められます**（例 `number(1234.56789) → "1,234.568"`）。4 桁以上をそのまま出したい場合は `decimals` を明示してください。
  - `haori.range(start, end?, step?)`: 整数配列を生成（終端排他）。`range(n)`＝`[0..n-1]`。負の `step` で降順。要素数は上限で打ち切り。
  - `haori.pages(totalPages, current, {window?, boundary?})`: 省略記号付きの番号ページ列。`current` は 0 始まり。要素は `{page, label, active, ellipsis}`（`page` は 0 始まり、`label` は `page + 1`、省略記号は `{page: null, label: '…', active: false, ellipsis: true}`）。既定 `window: 2` / `boundary: 1`。**隠れるページが 1 つだけの場合は省略記号ではなくその番号を表示**する（ギャップが 2 のとき。例 `pages(5, 2, {window: 0})` → `1 2 [3] 4 5`）。
  - `haori.monthAdd(value, delta)`: `YYYY-MM` 形式の年月に月数を加算して `YYYY-MM` で返す。`Date` を介さず整数演算で計算するため**タイムゾーンの影響を受けない**。不正な入力（非 `YYYY-MM`・月が 1〜12 外）は空文字。`delta` が 0 のときは正規化（ゼロ埋め）して返す（例 `monthAdd('2026-12', 1) → '2027-01'`）。
  - `haori.monthRange(count, base?)`: 基準月から過去方向へ `count + 1` 個の `{targetMonth, label}`（`targetMonth` は `YYYY-MM`、`label` は `YYYY/MM`）を**降順**（新しい月が先頭）で返す。`base` 省略時は現在月（ローカル時刻）を基準にする。月セレクトや月次ナビゲーションの選択肢生成向け。要素数は上限（約 100 年分）で打ち切り。**`base` 省略時は現在月に依存する**ため、式の再評価で結果を固定したい場合は `base` を明示する。
  - `haori.pageSummary(page, visibleCount?)`: Spring Data の `Page` 相当（`number`・`size`・`totalElements`／`totalCount`）から表示サマリー `{start, end, total, empty}` を返す。`number` は 0 始まり。末尾ページの端数は `visibleCount`（指定時）→ `page.numberOfElements` → `size` の順で算出。総件数 0・非オブジェクトは `{start: 0, end: 0, total: 0, empty: true}`。`1 - 20 / 100 件` のような表示の算出元（例 `haori.pageSummary(view).start`）。
  - `haori.findBy(array, key, value)`: 配列から `item[key]` が `value` に一致する最初の要素を返す。比較は**文字列化**して行うため数値 ID と文字列 ID の差を吸収する。一致が無ければ `null`（非配列・空配列も `null`）。先頭フォールバックは式側で `haori.findBy(items, 'id', sel) ?? items[0]` と書く。
  - `haori.sum(array, key?)`: 配列の数値合計を返す。`key` 省略時は要素自体、指定時は `item[key]` を合計。数値化できない値（`null`・`undefined`・空文字・非数値・`NaN`）は無視し、数値文字列（例 `'12'`）は数値として扱う。非配列は `0`。集計行は `{{haori.number(haori.sum(rows, 'total'))}}` のように書く。
  - `haori.distinct(array, key?)`: 配列から重複を取り除いた新しい配列を返す。`key` 省略時は要素自体、指定時は `item[key]` で重複を判定する。比較は **`findBy`・`sum` と同様に文字列化**して行い、数値 ID と文字列 ID の差を吸収する（例 `1` と `'1'` は同一）。同じキーは**最初に出現した要素だけ**を残し、元の順序を保つ。非配列は空配列。明細レスポンスを「1 件 = 1 行」にまとめる用途（例 `data-each="haori.distinct(rows, 'orderId')"`）。
  - `haori.groupBy(array, key)`: 配列を `item[key]` ごとのグループへ分け、`{key, items}` の配列を返す。グループは**最初の出現順**、各グループ内の要素も元の順序を保つ。グループ判定は**文字列化**して行うが、`key` には最初に出現した要素の**生値**を格納する。非配列は空配列。`data-each` でグループ見出しと明細を宣言的に描画できる（外側 `data-each="haori.groupBy(rows, 'date')"`、内側 `data-each="items"`）。

`haori.date` / `now` / `today` / `number` / `range` / `pages` / `monthAdd` / `monthRange` / `pageSummary` / `findBy` / `sum` / `distinct` / `groupBy` は `Haori.date(...)` のように静的メソッドとしても公開されます。

- `haori.data`: そのスコープの解決済み要素データを保持するオブジェクト。**識別子として書けないキーを読むための経路**です（例 `haori.data['customer.email']`）。ドットや記号を含む `name` 由来のキー、非 ASCII のキーが該当します。存在しないキーは `undefined` になるため、`haori.data['no.such'] || ''` のように既定値を添えて書きます。読み取り専用の用途を想定した浅いコピーで、書き込んでもバインドデータは変わりません。

#### バインドキーと識別子（`name` の命名）

式は `new Function(...バインドキー, 本体)` として組み立てるため、**バインドキーは関数の引数名になります**。引数名にできないキーは式のスコープへ載せません。

| キーの例 | 扱い |
| --- | --- |
| `plainKey`、`_ok`、`$x` | 引数として載せる（式から直接参照できる） |
| `customer.email`、`a-b`、`1st`、`foo bar`、`class`（予約語） | 載せない（式から直接参照できない） |
| `a,b`、`{a}`、`a=1`（引数リストの構造を壊す形） | 載せない |
| `氏名` などの非 ASCII | 載せるが、式の検証で非 ASCII 識別子は使えないため実質参照できない |

- 載せなかったキーを式が参照した場合は**未解決参照**として扱います（表示は空、`data-attr-*` は属性削除）。値は `haori.data['キー']` または `Core.getBindingData(element, {resolved: true})` から読めます。
- 収集値・送信形式は変わりません。`name="customer.email"` はフラットなキー `customer.email` として収集され、クエリでも `customer.email=...` として送られます（サーバ側のネストパラメータ束縛に合わせた命名をそのまま使えます）。入れ子の構造で送りたい場合は `data-form-object` / `data-form-list` を使います。
- 開発モードでは、載せなかったキーをキーごとに一度だけ警告します。
- 判定は実際に `new Function` へ通して行うため、予約語も将来の識別子規則も取りこぼしません。結果はキー単位でキャッシュします。

> **`data-attr-value` と再評価について**: `<input data-attr-value="{{ haori.today(-1) }}">` のような記述は「初期値」ではなく、バインドスコープの変化のたびに**再評価**されます。`haori.now` / `haori.today` は非冪等なため、日跨ぎや再描画でユーザーが編集した値が上書きされる場合があります。一度だけ設定したい場合は、初期スコープを `data-bind` でシードする（例 `data-bind` に算出済みの日付文字列を入れる）か、再描画で再適用されてよい用途に限定してください。

#### `Core.setBindingData(element, data, options?)`

対象要素のバインドデータを更新し、配下を再評価するバインドデータの公式書き込み API です。`Haori.Core.setBindingData(...)` として利用できます。第 3 引数は省略できます。

| 指定 | 既定 | 内容 |
| --- | --- | --- |
| `kind` | `'supply'` | この更新の種別。`'supply'`（明示的な値の供給）／`'edit'`（利用者の編集の確定）／`'nonSupply'`（値の供給ではない内部更新）。供給は前の編集を上書きし、後の編集に負けます |
| `sequence` | 呼び出し時点で発番 | この更新を起こした**操作**の通し番号。操作と呼び出しが非同期に離れる経路（応答の反映など）で、操作が起きた時点の番号を渡すために使います |
| `editedPaths` | なし | この更新のうち、利用者が実際に編集した経路と、**その編集が起きた時点**の通し番号。フォーム全体の収集値を運ぶ更新で、未編集の欄まで編集の権威を得ないようにします。通し番号を経路ごとに持つのは、`change` の発火時点ではなく編集の時点で権威を決めるためです（後述の「ユーザー編集と宣言バインドの権威」） |
| `clearUserEdits` | 供給なら解除する | 供給でユーザー編集の印を解除するか（後述の「ユーザー編集と宣言バインドの権威」） |
| `skipFragments` | なし | 再評価をスキップするフラグメント集合 |
| `reentrant` | `false` | 直列化中の再帰呼出で即時実行するか |
| `reflectToAttribute` | `true` | `data-bind` 属性へミラーするか |

**どの値が残るかを呼び出し側が選ぶことはありません。** 適用の可否は宛先（入力欄とバインドデータの経路）ごとに、最後に適用された通し番号と種別との比較で決まります。`sequence` を省略した呼び出しは「呼び出し時点が操作の時点である」と解釈し、他のスクリプトが直前に書き換えた `data-bind`（監視の通知は非同期にしか届きません）を先に番号付けしてから発番します。これにより、外部が書き換えた直後に `Core.setBindingData()` を呼んだ場合も**後から来たこの呼び出しの値が残ります**。

#### `Core.getBindingData(element, options?)`

`setBindingData` の対となるバインドデータの公式読み取り API です。既定では対象要素**自身**に設定された生のバインドデータ（`data-bind` の宣言・更新値そのもの。無ければ `null`）を返します。`options.resolved` を `true` にすると、DOM のネストを解決済みのスコープ（内側が外側を上書きし、`data-each` の行データ・派生データを含む、式評価で実際に見える値）を返します。返り値は内部状態への参照のため直接書き換えず、更新は `setBindingData` を使います。`Haori.Core.getBindingData(...)` として利用できます。

### 4. Observer (observer.ts)

**役割**: MutationObserverを使用したDOM監視

```typescript
class Observer {
  static async init(): Promise<void>
  static observe(root: HTMLElement | Document): void
}
```

#### 監視対象

- **attributes**: 属性の変更 → `Core.setAttribute()`
- **childList**: ノードの追加・削除 → `Core.addNode()`, `Core.removeNode()`
- **characterData**: テキストノードの変更 → `Core.changeText()`

属性変更とノードの追加・削除では、専用トリガーの登録状態も同期します（`IntersectObserver` / `PollObserver` / `VisibleRangeObserver` の `syncElement()` / `syncTree()` / `cleanupTree()`）。これによって `data-import` などで後から挿入された `data-intersect-*` / `data-poll-*` も監視対象になり、DOM から除去された要素の監視・タイマーは確実に破棄されます。

#### 初期化フロー

```typescript
async init(): Promise<void> {
  // 1. EventDispatcher の購読を「保留モード」で開始する。
  //    リスナー登録だけを先に行い、手続きの実行は release() まで保留する。
  const dispatcher = new EventDispatcher(document)
  dispatcher.startDeferred()

  // 2. document.head と document.body をスキャン（初期フェッチを含む）
  await Promise.allSettled([
    Core.scan(document.head),
    Core.scan(document.body)
  ])

  // 3. Queue に積まれた DOM 操作をすべて完了させる
  await Queue.wait()

  // 4. 初期化完了を示す属性を body に付与
  document.body.setAttribute('data-haori-ready', '')

  // 5. それぞれに MutationObserver を設定
  Observer.observe(document.head)
  Observer.observe(document.body)

  // 6. IntersectObserver / VisibleRangeObserver でツリーを同期
  IntersectObserver.syncTree(document.body)
  VisibleRangeObserver.syncTree(document.body)

  // 7. 保留していた手続きを発火順に実行する
  dispatcher.release()
}

// DOMContentLoaded または即座に実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Observer.init)
} else {
  Observer.init()
}
```

#### data-haori-ready 属性

`Observer.init()` が完了すると `<body>` タグに `data-haori-ready=""` が付与されます。この属性を CSS セレクタとして利用することで、初期化前のプレースホルダ（`{{name}}` など）が表示されるちらつきを防げます。

```css
/* 初期化完了前はコンテンツを隠す */
body:not([data-haori-ready]) .page-content {
  visibility: hidden;
}
```

- 付与タイミング: `Core.scan()` による全要素のスキャンと初期フェッチ、および `Queue.wait()` によるすべての DOM 操作の完了後
- MutationObserver 開始前に付与されるため、observer が余分に反応しない
- 属性値は常に空文字列

#### 初期スキャン中に発火したイベントの扱い

イベントリスナーの登録は初期スキャンより**前**に行われますが、手続きの実行は `data-haori-ready` の付与後まで保留され、そのあと発火順に実行されます。

これにより、初期スキャン中に発火したイベント（`data-each-rendered-run` や `data-each-rendered-change` から発火する `change`、外部ウィジェットの初期化に伴う `change` など）でも `data-{event}-fetch` などの手続きが確実に実行されます。リスナー登録が初期スキャン後だった 0.25.0 以前は、この経路のイベントが警告もなく失われていました。

保留の対象は `click` / `change` / `input` / `load`（ページ全体の `load` を含む）と、初期 HTML に宣言済みの `data-on` カスタムイベントです。

制約と仕様上の注意:

- `preventDefault`（`data-{event}-prevent`）と対象要素の解決は**イベント発生時に同期で**行われるため、保留の影響を受けません。
- 保留中に DOM から外れた要素のイベントは再生されません（その要素の状態は既に失われているため）。この判定は再生時のみで、通常のイベント処理では行いません（他ライブラリのハンドラが同一イベント中に対象要素を差し替える構成でも手続きが実行されます）。
- 再生時に参照される入力値は「イベント発生時の値」ではなく「再生時点の DOM 値」です。初期化中に同一要素で複数回変更した場合、同じ最終値で複数回手続きが走ります。
- 初期スキャン中に `data-import` 等で**後から追加された** `data-on` 宣言は、初期化完了時にまとめて購読されます。そのためスキャン中に発火したその宣言向けのカスタムイベントは取りこぼします（初期スキャン中の大量ノード追加に対する走査コストを避けるための割り切りです）。

### 5. Procedure (procedure.ts)

**役割**: イベントベースの手続き的処理管理

#### ProcedureOptions

```typescript
interface ProcedureOptions {
  targetFragment?: ElementFragment          // イベント発火元
  valid?: boolean                           // バリデーション実行
  confirmMessage?: string | null            // 確認ダイアログメッセージ
  data?: Record<string, unknown> | null     // 送信データ
  beforeCallback?: Function                 // フェッチ前コールバック
  formFragment?: ElementFragment | null     // フォーム要素
  selfValueFragment?: ElementFragment | null // フォーム外 change/input の値収集対象
  fetchUrl?: string | null                  // フェッチURL
  fetchOptions?: RequestInit | null         // フェッチオプション
  bindFragments?: ElementFragment[] | null  // バインド先
  bindParams?: string[] | null              // 抽出パラメータ
  bindArg?: string | null                   // バインドキー名
  afterCallback?: Function                  // フェッチ後コールバック
  adjustFragments?: ElementFragment[] | null // 値調整対象
  adjustValue?: number | null               // 調整値
  rowAdd?: boolean | null                   // 行追加
  rowRemove?: boolean | null                // 行削除
  rowMovePrev?: boolean | null              // 前の行へ移動
  rowMoveNext?: boolean | null              // 次の行へ移動
  resetFragments?: ElementFragment[] | null // リセット対象
  copyFragments?: ElementFragment[] | null  // コピー先
  copyParams?: string[] | null              // コピー対象パラメータ
  refetchFragments?: ElementFragment[] | null // 再フェッチ対象
  clickFragments?: ElementFragment[] | null  // クリック対象
  openFragments?: ElementFragment[] | null   // ダイアログオープン対象
  closeFragments?: ElementFragment[] | null  // ダイアログクローズ対象
  dialogMessage?: string | null              // ダイアログメッセージ
  toastMessage?: string | null               // トーストメッセージ
  historyUrl?: string | null                 // history pushState URL
  historyData?: Record<string, unknown> | null // history pushState クエリパラメータ
  historyFormFragment?: ElementFragment | null // history pushState フォーム
  redirectUrl?: string | null                // リダイレクトURL
  redirectReplaceUrl?: string | null         // 履歴を置き換えるリダイレクトURL
  redirectReturnParam?: string | null        // 戻り先リダイレクトのクエリ名
  scrollOnError?: boolean | null             // エラー時に最初のエラー要素へスクロール
  scrollTarget?: string | null               // 成功時にスクロールする要素のCSSセレクター
  // バインド先・コピー先のうち編集可能な行と、その data-each コンテナの対応
  // （値が null の要素は data-each-before / -after の固定要素）
  rowWriteTargets?: Map<ElementFragment, ElementFragment | null> | null
  // バインドより後で使うアクション属性の、手続き開始時の読み取り結果
  // （キーはアクション名。属性名と開始時の未解決参照の有無を控える）
  lateAttributes?: Map<string, LateAttributeRecord> | null
}
```

`rowWriteTargets` は属性を読んだ時点で記録します。応答が届くまでに行が削除されると親子関係が失われ、後から「行だったか」を判定できないためです（判定できないと、消えた行への書き込みを別の場所へ書いてしまいます）。

#### 実行フロー

```typescript
async run(): Promise<void> {
  // 1. バリデーション
  if (this.valid && !this.validate(this.formFragment)) {
    return
  }

  // 2. 確認ダイアログ
  if (this.confirmMessage) {
    if (!await Haori.confirm(this.confirmMessage)) {
      return
    }
  }

  // 3. データ取得
  let payload = { ...this.data }
  if (this.formFragment) {
    Object.assign(payload, Form.getValues(this.formFragment))
  }

  // 4. before コールバック
  if (this.beforeCallback) {
    const result = this.beforeCallback(this.fetchUrl, this.fetchOptions)
    if (result === false || result?.stop) {
      return
    }
    if (result?.fetchUrl) this.fetchUrl = result.fetchUrl
    if (result?.fetchOptions) this.fetchOptions = result.fetchOptions
  }

  // 5. フェッチまたはローカルデータ処理
  let response: Response | Record<string, unknown>

  if (this.fetchUrl) {
    // Content-Type に応じて body を作成
    const finalOptions = this.buildFetchOptions(payload)

    HaoriEvent.fetchStart(target, this.fetchUrl, finalOptions, payload)

    response = await fetch(this.fetchUrl, finalOptions)

    HaoriEvent.fetchEnd(target, this.fetchUrl, response.status, startedAt)

    // エラー処理
    if (!response.ok) {
      await this.handleError(response)
      HaoriEvent.fetchError(target, this.fetchUrl, error, response.status)
      return
    }
  } else {
    // フェッチURLがない場合はローカルデータをレスポンスとして使用
    response = payload
  }

  // 6. after コールバック
  if (this.afterCallback) {
    const result = this.afterCallback(response)
    if (result === false || result?.stop) {
      return
    }
    if (result?.response) response = result.response
  }

  // 7. バインド
  if (this.bindFragments) {
    await this.bindResult(response)
  }

  // 8. その他のアクション (並列実行)
  await Promise.all([
    this.adjust(),
    this.addRow(),
    this.removeRow(),
    this.movePrev(),
    this.moveNext(),
    this.reset()
  ])

  // 9. コピー
  await this.copy()

  // 10. 後続アクション
  await Promise.all([
    this.refetch(),
    this.click(),
    this.openDialogs(),
    this.closeDialogs()
  ])

  // 11. UI表示（resolveLateAttribute で属性を使用直前に評価し直す）
  const dialogMessage = this.resolveLateAttribute('dialog', this.dialogMessage)
  if (dialogMessage) {
    await Haori.dialog(dialogMessage)
  }
  const toastMessage = this.resolveLateAttribute('toast', this.toastMessage)
  if (toastMessage) {
    await Haori.toast(toastMessage, 'info')
  }

  // 12. スクロール（成功時）
  const scrollTarget = this.resolveLateAttribute('scroll', this.scrollTarget)
  if (scrollTarget) {
    document.querySelector(scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  // 13. リダイレクト（redirectReturnParam があれば安全なローカルパスのみ採用）
  const redirectUrl = this.resolveLateAttribute('redirect', this.redirectUrl)
  const redirectReplaceUrl = this.resolveLateAttribute('redirect-replace', this.redirectReplaceUrl)
  if (redirectUrl && redirectReplaceUrl) {
    Log.warn('Haori', '-redirect と -redirect-replace の両方が指定されています。履歴を置き換える方を採用します。')
  }
  const destinationUrl = redirectReplaceUrl || redirectUrl
  if (destinationUrl) {
    let destination = destinationUrl
    const returnParam = this.resolveLateAttribute('redirect-return-param', this.redirectReturnParam)
    if (returnParam) {
      const raw = new URLSearchParams(window.location.search).get(returnParam)
      if (raw !== null) {
        const trimmed = raw.trim()
        if (Url.isSafeLocalPath(trimmed)) {
          destination = trimmed
        } else {
          Log.warn('Haori', `戻り先パスが安全なローカルパスではないため、既定の遷移先へフォールバックします: ${raw}`)
        }
      }
    }
    if (redirectReplaceUrl) {
      window.location.replace(destination)
    } else {
      window.location.href = destination
    }
  }
}
```

#### Content-Type別の処理

```typescript
buildFetchOptions(payload: Record<string, unknown>): RequestInit {
  const method = this.fetchOptions?.method || 'GET'
  const contentType = this.fetchOptions?.headers?.['Content-Type'] || this.getDefaultContentType(method)

  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
    // URLパラメータ化
    const params = new URLSearchParams()
    Object.entries(payload).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(v => params.append(key, String(v)))
      } else if (typeof value === 'object') {
        params.append(key, JSON.stringify(value))
      } else {
        params.append(key, String(value))
      }
    })
    this.fetchUrl += `?${params.toString()}`
  } else if (contentType.includes('multipart/form-data')) {
    // FormData（配列要素が Blob / File の場合も実体のまま個別エントリとして追加）
    const formData = new FormData()
    Object.entries(payload).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(item =>
          formData.append(key, item instanceof Blob ? item : String(item))
        )
      } else {
        formData.append(key, value instanceof Blob ? value : String(value))
      }
    })
    return { ...this.fetchOptions, body: formData }
  } else if (contentType.includes('application/x-www-form-urlencoded')) {
    // URLSearchParams
    const params = new URLSearchParams()
    Object.entries(payload).forEach(([key, value]) => {
      params.append(key, String(value))
    })
    return { ...this.fetchOptions, body: params.toString() }
  } else {
    // application/json (デフォルト)
    return { ...this.fetchOptions, body: JSON.stringify(payload) }
  }
}
```

#### エラーハンドリング

```typescript
async handleError(response: Response): Promise<void> {
  const contentType = response.headers.get('Content-Type')

  if (contentType?.includes('application/json')) {
    const data = await response.json()

    // 標準形式のサポート
    const entries: Array<{key?: string, message: string}> = []

    // { message: "..." }
    if (data.message) {
      entries.push({ message: data.message })
    }

    // { messages: ["...", "..."] }
    if (Array.isArray(data.messages)) {
      entries.push(...data.messages.map(m => ({ message: m })))
    }

    // { errors: { field1: "...", field2: [...] } }
    // 配列は改行で連結し、1 フィールドにつき 1 エントリにまとめる
    if (data.errors) {
      Object.entries(data.errors).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          entries.push({ key, message: value.join('\n') })
        } else {
          entries.push({ key, message: String(value) })
        }
      })
    }

    // トップレベルが配列 [{ "key": "field", "message": "..." }] の場合:
    // 各要素を errors と同等に扱い、key へ振り分ける（同一 key は改行連結、
    // key 省略要素は全体エラー）。配列も typeof === 'object' のため最初に判定する。
    // （擬似コードでは簡略化。実装は src/procedure.ts handleFetchError を参照）

    // 上記いずれにも該当しない場合のフォールバック（簡略化のため擬似コードでは省略）:
    // message/messages/errors を除くトップレベルの key:値 を field エラーとして拾い、
    // それでも空なら `${status} ${statusText}` を全体メッセージにする。

    // メッセージを適切な要素に設定
    entries.forEach(({ key, message }) => {
      if (key && this.formFragment) {
        // フィールド名からフラグメントを検索
        const fragments = Form.findFragmentsByKey(this.formFragment, key)
        fragments.forEach(fragment => {
          Form.addErrorMessage(fragment, key, message)
        })
      } else {
        // 全体エラー
        const target = this.formFragment?.getTarget() || this.targetFragment?.getTarget()
        if (target instanceof HTMLElement) {
          Haori.addErrorMessage(target, message)
        }
      }
    })
  } else {
    // テキストとして処理
    const text = await response.text()
    const target = this.formFragment?.getTarget() || this.targetFragment?.getTarget()
    if (target instanceof HTMLElement) {
      Haori.addErrorMessage(target, text)
    }
  }
}
```

サーバが `{ "errors": { "code": "メッセージ", "email": ["...", "..."] } }`（または `message` / `messages` を除くトップレベルの `key: 値`）形式で 4xx を返すと、`key` は `Form.addErrorMessage(baseFragment, key, message)` 経由で**対応する `name` のフィールドへ自動的に振り分け**られます（`name`・`data-form-object`・`data-form-list` のドット区切りキーで解決）。haori-bootstrap を併用している場合は、対象フィールド直後（checkbox/radio は `.form-check` 末尾）に `invalid-feedback` 要素を自動生成し、`is-invalid` クラスを付与します。したがって**フィールド側に `data-message-key` のような対応付け属性を書く必要はありません**。`key` を持たないエントリ（`message` / `messages`）はフォーム全体のエラーとして表示されます。

トップレベルが配列の `[{ "key": "code", "message": "..." }]` 形式（一部のサーバ実装が返す例外ハンドラ／バリデーションメッセージ等）にも対応します。各要素を `errors` と同等に扱い、`key` を持つ要素は対応するフィールドへ振り分け、`key` を持たない（または空の）要素はフォーム全体エラーとします。同一 `key` が複数あれば改行で連結します。`key` は `name`・`data-form-object`・`data-form-list` のドット区切りキーで解決します。

これらの振り分けは**ステータスコードに依存しません**（`400` だけでなく、業務エラーの `409` などカスタムステータスでも同様に振り分けます）。応答ボディが `application/json` 以外（プレーンテキスト等）の場合は、ボディ全文をフォーム全体エラーとして表示します（空の場合は `${status} ${statusText}`）。

エラーメッセージの描画を始める前に、**フェッチ単位で対象スコープの既存メッセージを 1 度だけクリア**します。これにより、同じボタンを複数回押してエラー応答が繰り返されても表示は**常に最新の 1 応答分へ置き換わり**、再試行のたびにメッセージが積み増される（累積する）ことはありません。1 応答内に複数のフィールドエラーや全体エラーが含まれる場合は、クリア後にまとめて追加されるため**同一応答内のメッセージは従来どおり並んで表示**されます。クリア対象は、フォーム／対象フラグメントが特定できる場合はそのスコープ、特定できない場合は `document.body`（ページ全体の管理メッセージ）です。`Haori.clearMessages(parent)` は対象配下のフォーム全体エラーとフィールド別フィードバックの双方を除去します。

### 6. Form (form.ts)

**役割**: フォーム双方向バインディング

#### 双方向バインディングの自動更新

フォーム要素（`<form>`タグ）内の入力要素で`change`イベントが発火すると、以下の処理が自動的に実行されます：

1. **フォーム値の取得**: `Form.getValues()`でフォーム内のすべての入力値を取得
2. **`data-bind`属性の更新**: フォーム要素の`data-bind`属性にフォーム値のJSONを設定
3. **バインディングデータの更新**: フラグメントのバインディングデータを更新
4. **DOM更新**: `Core.setBindingData()`で関連する要素（`{{variable}}`、`data-if`など）を自動更新

これにより、`data-bind`属性を明示的に記述しなくても、フォーム要素内の入力変更が自動的にバインディングデータとして反映され、リアクティブな更新が実現されます。

**収集値は現在のバインドデータへ重ねます（置き換えません）。** 収集値は**入力欄が表す部分だけ**なので、そのまま置き換えると、レコードの他のフィールド（`id`、表示専用のラベル、`data-attr-value` へ渡す送信値など）が失われます。失うと、行の表示が空になったり、保存に必要なキーが送られなくなったりします。

重ね合わせは入れ子のオブジェクトまで及びます。

```html
<form data-bind='{"rows":[{"id":1,"name":"あ","label":"表示用"}]}'>
  <div data-form-list="rows" data-each="rows" data-each-arg="r" data-each-key="id">
    <input name="name">
    <span>{{r.label}}</span>
  </div>
</form>
<!-- name を編集して確定しても、行の id と label は残る -->
```

プロトタイプ汚染につながるキー（`__proto__` / `constructor` / `prototype`）は重ね合わせで読み飛ばします。入力欄の `name` はサーバ側の値から組み立てられることがあるためです。式評価もこれらをバインドキーとして受け付けないため、読み飛ばしても参照できる値は減りません。

**`data-if` が偽の分岐で収集から除外されたキーは、土台からも落とします。** 重ね合わせが引き継ぐのは「どの入力欄も表していないキー」だけです（`id`、表示専用のラベル、`data-attr-value` へ渡す送信値など）。表示条件から外れた項目は**値を持たない**扱いになり、保存値・送信データに残りません（[`data-if-false` 分岐とフォーム送信](#data-if-false-分岐とフォーム送信)）。宣言のある収集キーは収集値を正とし、宣言の無いキーだけ土台から引き継ぐ、という区別です（条件式の評価スコープが使う区別と同じ）。

落とす単位は、除外された部分木が宣言している**最上位の収集キー**です。`data-form-object` / `data-form-list` に囲まれている場合はそのキーごと落ちます。`data-form-object` 自身は表示されたままで、その配下の宣言がすべて非表示になった場合も同じです。

落ちるのは**収集が行われた時点**です。分岐を隠す操作そのものの収集は `data-if` の再評価より前に走るため、その時点ではまだ表示中の値を集めます。次の収集（送信、別の欄の確定、保存など）で落ちます。

分岐が**表示へ戻る**方向も同じで、戻す操作そのものの収集はまだ非表示として扱い、キーはその 1 回のあいだ落ちたままです。次の収集で、その分岐の入力欄の値（非表示のあいだも DOM に残っています）とともに戻ります。送信データは押した時点で収集するため、表示へ戻した直後の送信でも値は含まれます。

###### 行の対応付けと `data-each-key`

`data-form-list` の行（配列）は、`data-each` が行へ付けたリストキーで配列要素へ対応付けます。**編集可能な行リストでは `data-each-key` を宣言してください。**

- **`data-each-key` あり**: 行はキーの値で対応します。配列に無いキーの行は「配列から消えた行が画面に残っているもの」として取り込みません（行の増減は必ず配列を先に更新するため、配列に無い行は常に古い画面です）。
- **`data-each-key` なし**: リストキーがインデックス由来（`__index_N`）になるため、対応付けは**出現順**と同じになります。行数のずれは解消されますが、どの行が消えたかは判別できません。
- **`data-each` で描いていない行**（静的に書いた行）: リストキーを持たないため、従来どおり**出現順**で対応します。
- **`data-each-key` の値が重複しているとき**: 同じキーを持つ行と配列要素は、その範囲の中で**出現順**に対応します（1 番目の行は 1 番目の要素、2 番目の行は 2 番目の要素）。キーが一意な部分の対応付けは変わりません。この規則は行への書き込み（仕様「編集可能な行への書き込み」）にも同じく適用します。重複は仕様「`data-each`」の前提に反するため、開発モードで警告します。
- **取得元と収集先が別の配列のとき**: リストキーは `data-each` の**取得元**の要素から作るため（`data-each-key` は取得元の項目名です）、収集先の配列の要素は識別できません。`data-each-key` を宣言しても**出現順**で対応します。候補一覧を繰り返して選択結果を別のキーへ集める構成（`data-each="candidates.content"` と `data-form-list="options"`）がこれに当たります。判定は宣言だけで行い、`data-each` の式の経路の末尾が `data-form-list` の名前と一致するかを見ます（`items` / `dialog.items` / `r.items` は一致、`candidates.content` と `options` は不一致）。経路として読めない式（関数呼び出しなど）は判定できないため、リストキーで対応付けます。この構成では、行の生成・更新時に**要素データを行の入力欄へ反映することもしません**（要素データは取得元の候補であって入力欄を表さないため、反映すると取得元に無い `name` の欄が空になります）。

  **制限: この構成では、収集先の配列に保存済みの値があっても、新しく生成された行の入力欄へは復元されません。** 入力欄への書き戻しは行の生成より前に走るため、生成された時点の行には値が入らず、行の生成時の反映も上の理由で行いません。復元が必要な場合は、行の入力欄を宣言バインド（`data-attr-value` / `data-attr-checked`）で組み立てて、収集先の配列を式で参照してください。取得元と収集先が同じ配列の構成には、この制限はありません。

同じ対応付けを**入力欄への書き戻し**（逆方向同期）にも使います。書き戻しは `data-each` の行生成より**前**に走るため、行を挿入・削除した直後は「配列の要素数と画面の行数が食い違う」状態で走ります。位置で組み合わせると、挿入・削除位置より後の行がひとつずつずれた値を受け取ります（挿入なら後続の行が手前の行の値になります）。対応する配列要素が無い行（これから取り除かれる古い行）は値を触りません。行がまだ無い配列要素は、行の生成時に行単位の反映が拾います。

出現順の対応は「配列と画面の行数・並びが一致している」ことを前提にします。行の削除は配列を先に更新して画面を描き直すため、描き直しの前に収集や書き戻しが走ると前提が崩れ、残った行が消えた行の値を受け取ったり、`id` を持たない行が増えたりします。`data-each-key` はこの崩れを防ぎます。

対応付けが出現順へ退いた場合は、開発モードで理由ごとに一度だけ警告します（静的な行と、入力要素へ付けた `data-form-list` が集めるスカラの配列は、出現順が正しい構成なので警告しません）。

```html
<!-- 削除ボタンを押した直後に別の行を編集して確定しても取り違えない -->
<form data-bind='{"rows":[{"id":1,"title":"a"},{"id":2,"title":"b"},{"id":3,"title":"c"}]}'>
  <div data-form-list="rows" data-each="rows" data-each-arg="r" data-each-key="id">
    <input name="title">
    <button type="button" data-click-row-remove></button>
  </div>
</form>
```

##### `data-if-false` 分岐とフォーム送信

`data-if` が `false` の要素は DOM から削除されず、`style.display: none` と `data-if-false` 属性が付いた状態で残ります。そのため、同一 `name` の入力を設定型ごとに `data-if` で出し分けると、非表示分岐の入力も DOM 上に同名で共存します。

`Form.getValues()`（`data-click-form`・双方向バインド・履歴フォーム収集を含むすべてのフォーム値収集経路）は、`data-if-false` 属性を持つ要素とその配下を**収集対象から除外**します。これにより、表示中の分岐の入力値だけが直列化され、非表示分岐の値との競合は発生しません。

```html
<form data-bind='{"mode":"fixed"}'>
  <!-- mode が fixed のときだけ収集される -->
  <div data-if="mode === 'fixed'">
    <input name="value" value="100">
  </div>
  <!-- mode が ratio のとき以外は data-if-false となり収集されない -->
  <div data-if="mode === 'ratio'">
    <input name="value" value="0.5">
  </div>
</form>
```

- 除外はサブツリー全体に及び、`data-form-object` / `data-form-list` 配下の入力も非表示分岐なら丸ごと除外されます。
- `data-if` が `true` に切り替わって表示されれば、その分岐の入力は通常どおり収集対象になります。
- **バリデーションも同じ基準で除外されます。** 非表示のあいだ、配下のフォームコントロールにはエンジンが `disabled` を付与するため、`required` などの制約検証の対象から外れます（`data-{event}-validate`・`form.checkValidity()`・ネイティブ送信のいずれも通ります）。除外しないと、非表示分岐の `required` が常に送信をブロックし、`reportValidity()` は `display: none` の要素へフォーカスできないため画面には何も表示されません。
  - 付与した `disabled` にはエンジン管理の印（`data-haori-if-disabled`）が付き、表示へ戻すときに**印がある要素だけ**が復帰します。利用者が指定した `disabled`（`data-attr-disabled` の評価結果を含む）は表示後も維持されます。
  - 入れ子の `data-if` が偽の分岐へは踏み込みません。外側が表示に戻っても、内側が偽のままなら内側の入力は検証対象外です。
  - 非表示分岐の内側で `data-attr-required` / `data-attr-disabled` を使って制約を解除する必要はありません（そもそも非表示のあいだ配下は再評価されないため、この方法では解除できません）。
- 同名入力の DOM 上の共存自体（セレクタの strict mode 違反など）は解消されません。DOM に1要素だけ存在させたい場合は、入力を1つに統一し `type` / `step` / `max` 等を `{{}}` 式で切り替えてください。

また、フォーム要素自身に対して `Core.setBindingData()` や `data-fetch` が実行された場合は、フォーム配下の入力要素へ無イベントで逆方向同期します。このとき text input / textarea / select は `value` を更新し、checkbox / radio は `Form.setValues()` と同じ規則で checked 状態を反映します。フォーム自身ではなく**祖先**が更新された場合も、そのフォームが `data-form-arg` で指定したキーを祖先が所有していれば同様に反映します（後述の「祖先が所有するレコードの反映」）。

##### 初期 `data-bind` からの入力欄復元

`<form>` に `data-bind` を指定した場合、初期スキャンの完了時に**一度だけ**逆方向同期を適用します。これにより `name` と `data-bind` のキーが一致する `<select>` やチェックボックスは、`value="{{...}}"` や `data-attr-selected` / `data-attr-checked` を書かなくても初期表示で選択状態になります。

```html
<!-- select は "gas"、checkbox はチェック済みで初期表示される -->
<form data-bind='{"kind":"gas","active":true}'>
  <select name="kind">
    <option value="">未選択</option>
    <option value="power">電力</option>
    <option value="gas">ガス</option>
  </select>
  <input type="checkbox" name="active" value="true">
</form>
```

- **`data-bind` に含まれないキーの入力欄は、HTML の `value` 属性で与えた初期値がそのまま保たれます**（「未指定のキーは既存の入力値を維持する」規則）。
- **チェック状態は送信値との一致で決まります。** checkbox / radio へ値を反映するときは、その要素の送信値（`value`）と与えられた値（配列の場合は要素のいずれか）が一致すればチェックし、しなければ外します。送信値は `value` 属性を宣言していればその評価値、宣言が無ければ DOM の `value` を使います。したがって `data-each` の行ごとに `data-attr-value` で送信値を与える構成（同名チェックボックス群で複数選択する画面など）でも解決できます。`value` 属性も `data-attr-value` も無い checkbox の送信値は、HTML の既定どおり `"on"` です。
- 復元は「そのフォームを初めてスキャンしたとき」だけです。`data-if` の表示切替などで再スキャンされても繰り返しません（利用者の編集を初期値へ巻き戻さないため）。
- 対象は `<form>` 要素です。`data-form` 属性によるフォームコンテナは、`Core.setBindingData()` の逆方向同期と同様に対象外です。
- `data-bind` に空文字を置きつつ HTML の `value` 属性を初期値として使っていた構成では、入力欄が空になります。初期値は `data-bind` 側へ寄せてください。

##### 祖先が所有するレコードの反映（`data-form-arg`）

`data-form-arg="detail"` を指定した `<form>` は、**祖先の `data-bind` が持つ `detail` キー**を入力欄へ反映します。祖先がレコードを所有し、フォームがそのキーを編集する構成（一覧で選んだ行を編集フォームへ出す、など）が、`data-attr-value` を使わずに書けます。参照キー（式が読むキー）と書込キー（`name` が書き込むキー）がどちらも `detail.*` になり、構造的に一致します。

```html
<div id="state" data-bind='{"detail":{"id":7,"name":"あかね","category":"b"}}'>
  <form data-form-arg="detail">
    <input name="name">           <!-- "あかね" が入る -->
    <select name="category">      <!-- "b" が選択される -->
      <option value="a">A</option>
      <option value="b">B</option>
    </select>
    <span>{{detail.id}}</span>    <!-- 7 -->
  </form>
</div>
```

反映するのは次の 2 つのタイミングです。

- 初期スキャンの完了時（フォーム自身に `data-bind` が無くても対象）
- 祖先のバインドデータが更新され、**そのキーの値が実際に変わった**とき

- **値が変わっていない更新では入力欄に触りません**（同じ祖先の別キーだけを更新した場合など）。同じ値でも書き戻すと、利用者が確定した編集を巻き戻してしまうためです。
- **対象は祖先の `data-bind`（バインドデータ）が持つキーだけです。** `data-each` の行データと `data-derive` の派生データは対象外です。どちらも描画のたびに作り直される仮想スコープで、行単位の書き戻しは `data-form-list` が担います。
- 同じキーを持つ祖先が複数ある場合は、**最も近い祖先**が権威です。外側の更新は届きません（式の識別子解決と同じシャドーの規則）。
- 双方向コミット（`change` / `input`）の書き込み先は従来どおり**フォーム自身**のバインドデータです。このコピーは祖先をシャドーしますが、祖先が当該キーを更新したときに解除して入れ直すため、以降の更新が届かなくなることはありません。
- コミット時は**祖先の値を土台に収集値を重ねます**。入力欄に対応しないフィールド（`id` など）が残るため、コミット後も `{{detail.id}}` を URL などに使えます。
- リセット（`data-{event}-reset`）は、祖先が所有するレコードの内容へ戻します（フォーム自身に初期 `data-bind` 宣言が無い場合）。空にはなりません。**編集の有無によらず戻します**。一度も編集していないフォームには双方向コミットが作るコピーが無いため、リセットは再評価の後に祖先のレコードを入力欄へ流し込み直します（`data-each` で流し込む候補はこの再評価で描き直されるため、候補付きの `<select>` でも選択が戻ります）。

##### `data-each` で生成された行への値反映

`Core.setBindingData()` の逆方向同期は `data-each` の行生成より**前**に走るため、その更新で新しく生成された行には値が入りません。そこで `data-each` と `data-form-list` を同一要素へ指定した「編集可能な繰り返し行」では、**行単位でも値を反映**します。

- 反映するのは「新規生成した行」と「要素データが変化した再利用行」だけです。変化していない行へ再適用すると、描画待ちの間に利用者が編集した入力欄を古い値で巻き戻すためです。
- 行単位の反映では、**要素データに無いキーの入力欄は空になります**。要素データが行全体を規定するため、行の途中への挿入や並べ替えで担当する要素が変わったときに前の行の入力値が残らないようにするためです（フォーム全体への逆方向同期では、未指定のキーは既存値を維持します）。
- ただし**宣言バインドで値や状態が決まる入力は空にしません**。その値・状態の権威はバインドの評価結果にあるため、要素データにキーが無くても維持します。URL パラメータ由来の値を行ごとの hidden へ載せる構成などが該当します。
- **宣言バインドの評価が解決している場合は、要素データにキーがあっても上書きしません。** 行単位の反映は行の再評価（`Core.evaluateAll`）の直後に走るため、上書きすると評価したばかりの値を収集値（多くは空文字）で潰します。潰れた空値は次の収集で要素データへ焼き付くため、以後ずっと空になります（行の中で取得した候補から選択中の 1 件を引いて hidden へ載せる構成が該当します）。
- **評価が未解決の場合は、従来どおり要素データを反映します。** 保存済みレコードから復元した直後は候補が届くまで式が解決しないため、ここで宣言バインドを権威にすると復元した値を失います。
- 反映した値がバインディングデータ（および `data-store` のミラー）へ入るのは、**次の収集**（`change` / `input`、または収集値を伴う手続き）の時点です。送信値は収集時に入力欄から読み直すため、選択した直後の送信でも評価結果が送られます。
- 行ごとに違う値を要素データで配りたい入力には、宣言バインドを書かないでください。宣言バインドがある入力では評価結果が勝つため、要素データの値は表示されません（式を `{{c.キー}}` のように要素データ参照へ変えれば行ごとの値になります）。
  - 判定する属性は要素の種類で変わります。

    | 対象 | 判定する属性 |
    | --- | --- |
    | テキスト系 input / `type="hidden"` / textarea / select | `value="{{式}}"` または `data-attr-value` |
    | checkbox / radio | `checked="{{式}}"` または `data-attr-checked` |
    | `<option>` を持つ select | 配下の `<option>` の `selected="{{式}}"` または `data-attr-selected` |

  - checkbox / radio では `value` を見ません。これらの `value` は**送信値**であってチェック状態ではないため、`value` で判定すると「送信値をテンプレート式で決めているだけのチェックボックス」が空化の対象から外れ、前の行のチェック状態が残ります。

##### 送信後に行われた編集の保護

フェッチの応答は**リクエストを組み立てた時点の内容**を反映したものなので、その後に行われた編集より古い情報です。応答をそのままフォームへバインドすると、送信中に利用者が入力した値が画面からも収集値からも静かに消えます（応答が遅いほど起こりやすく、画面表示だけ正しくても送信値が古くなることがあります）。

これを防ぐため、応答を `<form>` へバインドする直前に、**送信データを確定した後に編集された入力欄の値だけをバインドデータへ上書きし直します**。

- 判定は入力欄ごとの「ユーザー編集の通し番号」で行います。番号は **DOM で `change` / `input` が発火した時点**に発番します。`input` は `data-input-*` の宣言が無い入力欄でも発番します。イベントを伴って値を反映した場合（`Form.setValues()` など）も、その発火を通じて発番します。`Core.setBindingData()` やイベントを伴わない書き戻しでは発番しません。
- **発番は内部値を進めません。** 発番だけを行い、DOM の値を内部値へ取り込むのは、値がバインドデータへ載る契機と同じ時点に限ります（[収集は DOM を真とする](#収集は-dom-を真とする)の「収集は読み取りに徹し、内部値は書き換えません」と同じ理由です）。
- 上書きは**バインドデータの段階**で行います。入力欄への書き戻し（`Form.syncValues`）と宣言バインドの再評価（`data-attr-selected` など）はどちらもバインドデータを基準にするため、この 1 か所で両方が整合します。
- 上書きするのは編集された入力欄のキーだけです。編集していない項目には応答の値がそのまま反映されるため、サーバが計算した合計や整形済みコードなどの派生値は失われません。
- `data-form-list` の行は位置合わせで対応付けます。応答が返した行数が変わっている場合、対応する位置が無い編集は反映されません。
- ラジオボタンは、排他で未チェックになった同名の兄弟もまとめて保護対象にします。起点要素だけを保護すると、グループの一部だけが巻き戻ってチェック状態が食い違います。
- 送信のきっかけになった編集はリクエストに含まれているため、**応答の値が権威**です（サーバ側での正規化がそのまま反映されます）。
- 対象は `<form>` へのバインドと、配下に `data-form-arg` フォームを持つ要素へのバインドです。後者は祖先が所有するレコードがそのフォームの入力欄へ流し込まれるためで、`<form>` へのバインドと同じ扱いになります。それ以外のバインドでは入力欄への書き戻しが起きないため、上書きは不要です。

**処理フロー**:
```
ユーザー入力 (change event)
  ↓
EventDispatcher → Procedure('change').run()
  ↓
Form.getValues() → フォーム値取得
  ↓
formElement.setAttribute('data-bind', JSON.stringify(values))
  ↓
Core.setBindingData() → DOM更新
  ↓
data-if / data-each / {{variable}} などが自動更新
```

`value="true"` を持つ checkbox は boolean モードとして扱います。

- checked: `true`
- unchecked: `false`

`value="false"` を指定した場合は反転指定として扱い、checked で `false`、unchecked で `true` を返します。

それ以外の checkbox は従来どおり `value` 属性の文字列値を返し、未チェック時は `null` を返します。

##### 収集は DOM を真とする

値収集は、内部値（`ElementFragment` が保持する値）ではなく **DOM を真として**行います。**画面に表示されている内容がそのまま送信・保存される**、という原則です。

- チェック状態（checkbox / radio、boolean モードの checkbox を含む）: DOM の `checked`。チェック済みの送信値は `value` 属性そのもの
- `input[type=file]`: DOM の `files`
- 値を持つ入力（テキスト系 `input` / `type="hidden"` / `<textarea>` / `<select>`）: `element.value`（`<select multiple>` は選択済み `<option>`）を読んで収集（`ElementFragment.getValueForCollection()`）

内部値は、バインドからの書き戻しで先に更新されて DOM 反映が描画キュー待ちになる場合や、ラジオの排他制御で未チェックになった同名要素に `change` が発火しない場合など、DOM と食い違う瞬間があります。そこで収集すると「画面はチェック済みなのに送信値は `false`」という見た目と送信値の不一致が起こるため、常に画面の見たままを送ります。

**イベントを伴わない値の変更にも追随します。** 外部ライブラリ（郵便番号からの住所補完、`<select>` の拡張ウィジェットなど）やブラウザの自動入力は `element.value` へ直接代入するため `change` / `input` が発火せず、内部値は更新されません。収集が DOM を読むことで、こうした値も送信・保存の対象になります（[外部ライブラリ連携](#外部ライブラリ連携) を参照）。値がバインドデータへ載るのは収集の契機（`change` による双方向コミット、`data-{event}-form` での送信など）を通じてであり、**代入した瞬間に反映されるわけではありません**。

**収集は読み取りに徹し、内部値は書き換えません。** 収集は「バインドデータへ反映しない目的」でも走ります（`data-validity` / `data-{event}-if` の条件評価は、バインド更新のたびに収集値でスコープを組み立てます）。ここで内部値を書き換えると、**バインドデータには載っていないのに内部値だけが新しい**状態が生まれ、続く逆方向同期（フォーム配下の入力欄への書き戻し）が古いバインドデータと不一致とみなして入力欄を上書きします。その結果、利用者が入力した値が表示からも収集値からも消えます。DOM の値が内部値・バインドデータへ入るのは、収集結果がバインドへコミットされ、そこから書き戻される経路だけです。

**同じ理由で、ユーザー編集の通し番号の発番も内部値を進めません。** 番号は `change` を待たず打鍵ごとに発番しますが（[ユーザー編集と宣言バインドの権威](#ユーザー編集と宣言バインドの権威)）、DOM から内部値へ取り込むのは、値がバインドデータへ載る契機（`change` による双方向コミット、`data-{event}-form` での送信、`data-input-*` を宣言した要素の手続き）と同じ時点だけです。取り込みを打鍵の時点へ早めると、貼り付けや IME 確定のように 1 回の `input` で値が確定する入力手段で、まだバインドデータへ載っていない値が内部値だけに載ります。そこへ古いバインドデータの逆方向同期（`data-each` 行への書き戻しなど）が届くと「不一致」と判定されて入力欄が上書きされ、入力した値が表示からも収集値からも消えます。

ただし次の 2 つの場合は DOM を読まず、内部値を収集します。DOM が内部値より古い、または内部値を表現できない状態で読むと、供給された値を失うためです。

- Haori 自身の書き戻しが描画キュー待ちの間
- 直近の書き込みを DOM が受け付けなかった場合。`<select>` は該当する `<option>` が無いと代入が無視されます（候補を `data-each` で流し込む構成では、入力欄への書き戻しが行生成より前に走るため起こり得ます）。この状態で DOM を読むと、ブラウザが自動選択した先頭 `<option>` の値へ化けてしまいます。**候補が揃った時点（行生成の直後）で書き込みを再試行する**ため、画面にも供給された値が載ります。候補にその値が無い場合は書き込まず（現在の選択を消さないため）、収集値だけが供給された値を保ちます。再試行はリセット（[`data-{event}-reset`](#data-event-reset)）をまたぎません。またぐと、クリアしたはずの選択がリセット後に復元されてしまうためです

外部からの代入は**ユーザー編集としては扱いません**（[ユーザー編集と宣言バインドの権威](#ユーザー編集と宣言バインドの権威)の通し番号を発番しません）。代入の時点を観測できず、発番すると「いつの編集か」を比較できないためです。したがって、送信中に外部ライブラリが書き込んだ値は、応答の書き戻しで上書きされることがあります。

あわせて、宣言バインド（`checked="{{式}}"` / `data-attr-checked` / `data-attr-selected`）でチェック状態を書き換えたときは、DOM の書き込みに合わせて内部値も同期します（`data-attr-selected` は所属する `<select>` の内部値を同期します）。これにより宣言バインドで変更したチェック状態が、式評価から参照する内部値にも反映されます。ただしフォーカス中の要素は従来どおり再適用をスキップするため、内部値の同期も行いません。

`type="number"` の `<input>` は値を**数値型**として収集・バインドします。HTML の `input.value` は常に文字列ですが、DTO が `Double` / `Integer` 等を期待する場合に文字列で送られるのを避けるため、内部値を数値へ正規化します（`ElementFragment.normalizeValueForElement`）。正規化は DOM の値を読むすべての経路で行われます。すなわち `syncValue()`（DOM→内部値。`change` と構築時）、`getValueForCollection()`（収集時の読み取り）、`applyValue()`（バインド→内部値）、および `value` 属性の評価（`value="{{...}}"` / `data-attr-value`）で正規化され、`Form.getValues()` の結果や JSON 送信ボディに数値として現れます。

**数値として採用するのは、ブラウザが `<input type="number">` の値として受け付ける文字列だけです。** 省略可の `-`、数字列、省略可の小数部、省略可の指数部という形（先頭が `.` の小数も可）で、それ以外は `null` になります。ブラウザは受け付けない文字列を入力欄へ入れると空表示にするため、この規則をそろえないと**画面には出ていない値が送信される**ことになります（原則「[収集は DOM を真とする](#収集は-dom-を真とする)」）。

| 例 | 収集値 | 理由 |
| --- | --- | --- |
| `"12"` / `"-3"` / `"2.5"` / `".5"` | `12` / `-3` / `2.5` / `0.5` | 受理する形 |
| `"1e5"` / `"1.5e-3"` | `100000` / `0.0015` | 指数表記は受理する |
| 空文字・`null` | `null` | 値が無い |
| `"abc"` / `"0x10"` / `"+5"` / `"5."` / `"1_000"` / `"  12  "` | `null` | ブラウザも受け付けない |
| `"Infinity"` / `"-Infinity"` / `"NaN"` | `null` | 有限の数値でない（`JSON.stringify` でも `null` に潰れる） |

- 数値型の値をバインドした場合も、有限でない値（`Infinity` / `NaN`）は `null` になります
- 真偽値は数値として扱いません（`true` / `false` はいずれも `null`）
- `type="number"` 以外の入力（`text` 等）は従来どおり文字列のまま。型を宣言して収集したい場合は [`data-value-type`](#data-value-type) を使います（`type="hidden"` に真偽値・数値を載せる場合など）

> 互換性に関する注意: 0.13.0 より前は `type="number"` も文字列で収集していました。0.13.0 以降は数値型になります。文字列のまま扱いたい場合は `type="text"` を使用してください。

#### 主要メソッド

```typescript
class Form {
  // 値の取得
  static getValues(form: ElementFragment): Record<string, unknown>

  // 値の設定
  static setValues(form: ElementFragment, values: Record<string, unknown>, force?: boolean): Promise<void>

  // bindingData からの無イベント同期
  static syncValues(form: ElementFragment, values: Record<string, unknown>, force?: boolean): Promise<void>

  // リセット
  static reset(fragment: ElementFragment): Promise<void>

  // エラーメッセージ
  static addErrorMessage(fragment: ElementFragment, key: string, message: string): Promise<void>
  static clearMessages(fragment: ElementFragment): Promise<void>

  // フラグメント検索
  static findFragmentsByKey(fragment: ElementFragment, key: string): ElementFragment[]
  static getFormFragment(fragment: ElementFragment): ElementFragment | null
}
```

#### 値の取得構造

```typescript
// 通常のフィールド (name属性)
{ name: value }

// data-form-list (入力要素)
{ name: [value1, value2, ...] }

// data-form-object
{ objectName: { childName: value } }

// data-form-list (コンテナ)
{ listName: [{ childName: value }, ...] }
```

**例**:

```html
<!-- 通常フィールド -->
<input name="username" value="Taro">
<!-- { username: "Taro" } -->

<!-- リスト (入力要素) -->
<input name="tags" value="javascript" data-form-list>
<input name="tags" value="typescript" data-form-list>
<!-- { tags: ["javascript", "typescript"] } -->

<!-- オブジェクト -->
<div data-form-object="address">
  <input name="city" value="Tokyo">
  <input name="zip" value="100-0001">
</div>
<!-- { address: { city: "Tokyo", zip: "100-0001" } } -->

<!-- リスト (コンテナ) -->
<div data-form-list="items">
  <div>
    <input name="name" value="Item1">
    <input name="price" value="1000">
  </div>
  <div>
    <input name="name" value="Item2">
    <input name="price" value="2000">
  </div>
</div>
<!-- { items: [
  { name: "Item1", price: "1000" },
  { name: "Item2", price: "2000" }
] } -->
```

#### `input[type=file]` の値収集

`input[type=file]` は選択されたファイルを **File オブジェクトとして**収集します。`element.value` は `C:\fakepath\...` の擬似パスにしかならず送信に使えないため、DOM の `files` から直接取得します。

| 状態 | 収集される値 |
| ---- | ------------ |
| 単一選択・選択済み | `File` |
| 単一選択・未選択 | `null` |
| `multiple`・選択済み | `File[]` |
| `multiple`・未選択 | `[]`（空配列） |

送信時は `data-{event}-fetch-content-type="multipart/form-data"` と body を持つメソッド（POST 等）を併用してください。`multiple` の `File[]` は同一キーの個別エントリとして FormData へ追加されます。`data-form-list` と `multiple` を併用した場合も 1 次元配列として収集されます。

**File は収集結果のトップレベルに置いてください。** `data-form-object` / `data-form-list` コンテナ配下の file input は、FormData 構築時に JSON 文字列化され `{}` になるため送信できません。この構成を検出した場合は警告を出力します。

multipart 以外（JSON・`application/x-www-form-urlencoded`・GET のクエリ）で File を含む送信を行おうとした場合も、`[object File]` や `{}` になって原因が分かりにくいため**警告を出力**します。

内部値（`data-if` 等の式から参照される値）には File 自体ではなく、選択済みならファイル名、未選択なら `null` を保持します。選択有無の判定に利用できます。双方向バインディングでバインドデータへ反映される値も同様にファイル名へ正規化されます（File をそのまま入れると `JSON.stringify` で `{}` に潰れ `data-bind` 属性が壊れるため）。history クエリ（`data-{event}-history-form`）や `data-{event}-copy` のコピー先でも同様に正規化されます。

選択有無を式で参照する場合、未選択のうちは未解決参照になりますが、`{{!csvFile}}` のような[判定する式](#判定する式と値を求める式)は「無い＝偽」として結論が出ます。初期値の宣言は不要です。

##### テキストで送る経路での入れ子データ

クエリ・`application/x-www-form-urlencoded`・`multipart/form-data` は 1 つの値が 1 つの文字列になるため、入れ子の構造をそのままの形では送れません。オブジェクトと配列は **JSON 文字列**にして送ります。配列の場合は要素ごとに JSON 文字列化し、同名キーを繰り返します。

```
materials=%7B%22material%22%3A%7B%22id%22%3A%22a%22%7D%2C%22amount%22%3A1%7D
&materials=%7B%22material%22%3A%7B%22id%22%3A%22b%22%7D%2C%22amount%22%3A2%7D
```

スカラーの配列（`data-form-list` を付けた同名入力など）は従来どおり値をそのまま同名キーの繰り返しで送ります（`tags=js&tags=ts`）。`null` と `undefined` は空文字になります。

入れ子の構造を素直に送りたい場合は **JSON body（既定の POST）**を使ってください。

なお `input[type=file]` はセキュリティ上、任意の値を設定できません（非空文字を代入するとブラウザが例外を投げます）。バインドデータからの書き戻しは**クリア（`null` / 空文字）のみ**反映し、それ以外の値は静かに無視します（`Fragment.setValue` で直接設定した場合のみ警告します）。

#### フォームコンテナを持たない入力の値収集

`change` / `input` イベントの手続きは、既定でフォームコンテナ（`<form>` または `data-form` を持つ要素）の値をまとめて収集します。

フォームコンテナが祖先に存在しない場合は、**イベント発生元の入力要素自身**を収集対象とし、その `name` と値だけを送信データにします。これにより、`<form>` の外に置いた単独の入力（同意チェックボックス等）でも値をバインドへ書き戻せます。

- 対象は `name` 属性を持つ `<input>` / `<select>` / `<textarea>` **自身**に限ります。コンテナ要素で `change` が発生した場合は収集しません（`data-form` を宣言していない要素の配下を意図せず収集しないため）。
- 収集値は bind だけでなく**送信データ全体**に反映されます。したがって `data-change-fetch` のクエリやボディにも含まれます（例: フォーム外の `<select name="kind">` の change で `/api/list?kind=B` になる）。フォーム内の入力と同じ扱いに揃えたものです。

```html
<div id="gate" data-bind='{"agreed":false,"keep":"KEEP"}'></div>

<!-- フォーム外の単独 boolean チェックボックス -->
<input type="checkbox" name="agreed" value="true"
  data-change-bind="#gate" data-change-bind-merge>
<!-- ON  → { agreed: true }  を #gate へマージ -->
<!-- OFF → { agreed: false } を #gate へマージ -->
```

> `data-{event}-bind` は既定でバインド先を**全置換**します。上例のように既存キーを保持したい場合は `data-{event}-bind-merge` を併用してください。

この経路で収集値が空になる場合（`name` の付け忘れなど）、バインド先を空オブジェクトで全置換して既存データを破壊することを避けるため、**キー指定（`data-{event}-bind-arg`）もマージ指定（`data-{event}-bind-merge`）も無い全置換のみ**、警告を出してバインドをスキップします。

この抑止はフォームコンテナを持たない `change` / `input` に限定されます。`data-click-bind` などで意図的にバインド先を空オブジェクトへクリアする使い方は従来どおり有効です。

#### キー検索アルゴリズム

```typescript
findFragmentsByKey(fragment: ElementFragment, key: string): ElementFragment[] {
  const parts = key.split('.')
  return this.findFragmentByKeyParts(fragment, parts)
}

private findFragmentByKeyParts(fragment: ElementFragment, parts: string[]): ElementFragment[] {
  const key = parts[0]

  // 通常フィールド
  if (parts.length === 1 && fragment.getAttribute('name') === key) {
    return [fragment]
  }

  // オブジェクト
  if (fragment.hasAttribute('data-form-object')) {
    if (fragment.getAttribute('data-form-object') === key) {
      return fragment.getChildren()
        .flatMap(child => this.findFragmentByKeyParts(child, parts.slice(1)))
    }
  }

  // 配列 (例: items[0].name)
  if (fragment.hasAttribute('data-form-list')) {
    const match = key.match(/^(.+)\[(\d+)\]$/)
    if (match && fragment.getAttribute('data-form-list') === match[1]) {
      const index = Number(match[2])
      const rows = fragment.getChildren()
        .filter(child => child.hasAttribute('data-row'))
      if (index < rows.length) {
        return this.findFragmentByKeyParts(rows[index], parts.slice(1))
      }
    }
  }

  // 子要素を再帰検索
  return fragment.getChildren()
    .flatMap(child => this.findFragmentByKeyParts(child, parts))
}
```

### 7. Queue (queue.ts)

**役割**: requestAnimationFrameベースの非同期キュー

```typescript
class Queue {
  static enqueue(task: () => unknown, prepend?: boolean): Promise<unknown>
  static wait(): Promise<void>
}

class AsyncQueue {
  private queue: QueueItem[] = []
  private processing = false

  async enqueue(task: () => unknown, prepend?: boolean): Promise<unknown>
  async wait(): Promise<void>
}

interface QueueItem {
  task: () => unknown | Promise<unknown>
  timestamp: number
  promise: Promise<unknown>
  resolve: (value: unknown | PromiseLike<unknown>) => void
  reject: (reason?: unknown) => void
}
```

#### 処理アルゴリズム

```typescript
private async processQueue(): Promise<void> {
  if (this.processing) return
  this.processing = true

  await new Promise<void>(resolve => {
    requestAnimationFrame(() => {
      const startTime = performance.now()
      const MAX_FRAME_TIME = 8  // 1フレームあたり最大8ms

      while (this.queue.length > 0) {
        if (performance.now() - startTime > MAX_FRAME_TIME) {
          break  // 次のフレームへ
        }

        const item = this.queue.shift()!

        try {
          const result = item.task()
          if (result instanceof Promise) {
            result.then(item.resolve).catch(item.reject)
          } else {
            item.resolve(result)
          }
        } catch (error) {
          item.reject(error)
        }
      }

      resolve()
    })
  })

  this.processing = false

  // まだキューが残っている場合は次のフレームで処理
  if (this.queue.length > 0) {
    this.processQueue()
  }
}
```

#### DOM 書き込みの判定時点と優先実行の関係

`prepend` による優先実行は、**キューへ積んだ順と実行順が一致しない**ことを意味します。優先実行のタスク（`Haori.addMessage` / `clearMessages` など）は、すでに待機している通常タスクより先に実行されます。このため、DOM を書き換えるタスクは次の規則に従います。

- **積む時点で DOM を確認し、書き込みが不要なら積まない**。フラグメントの属性設定（`setAttributeInternal`）と属性削除（`removeAttribute` / `removeAliasedAttribute`）は、現在の DOM が目的の状態と一致していればタスクを積みません。
- とくに `MutationObserver` 経由の反映は、**すでに DOM で起きた変更を内部状態へ写す**ためのものなので、DOM への書き込みは本来不要です。ここで無条件にタスクを積むと、実行を待つ間に優先実行のタスクが書き込んだ値を、あとから走る書き込みが上書き・削除してしまいます（例: フェッチエラー再試行時のメッセージ消失）。

### 8. Haori (haori.ts)

**役割**: アプリケーション全体で使用するユーティリティメソッド

```typescript
class Haori {
  // ダイアログ
  static async dialog(message: string): Promise<void>

  // トースト (Popover API使用)
  static async toast(message: string, level?: 'info' | 'warning' | 'error' | 'success'): Promise<void>

  // 確認ダイアログ
  static async confirm(message: string): Promise<boolean>

  // <dialog> 要素の制御
  // openDialog は開く前に対象内のメッセージ属性をクリアする
  static async openDialog(element: HTMLElement): Promise<void>
  static async closeDialog(element: HTMLElement): Promise<void>

  // メッセージ
  static async addErrorMessage(target: HTMLElement | HTMLFormElement, message: string): Promise<void>
  static async addMessage(target: HTMLElement | HTMLFormElement, message: string, level?: 'info' | 'warning' | 'error' | 'success'): Promise<void>
  static async clearMessages(parent: HTMLElement): Promise<void>
}
```

#### 実装例

```typescript
// トースト (3秒表示。level 省略時は 'info'。error は aria-live="assertive")
static async toast(message: string, level: 'info' | 'warning' | 'error' | 'success' = 'info'): Promise<void> {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.className = `haori-toast haori-toast-${level}`
  toast.setAttribute('popover', 'manual')
  toast.setAttribute('role', 'status')
  toast.setAttribute('aria-live', level === 'error' ? 'assertive' : 'polite')

  document.body.appendChild(toast)
  toast.showPopover()

  setTimeout(() => {
    try {
      toast.hidePopover()
    } finally {
      toast.remove()
    }
  }, 3000)
}

// レベル付きメッセージ設定
static async addMessage(
  target: HTMLElement | HTMLFormElement,
  message: string,
  level?: 'info' | 'warning' | 'error' | 'success',
): Promise<void> {
  return Queue.enqueue(() => {
    // 入力要素は親要素に、フォームはフォーム自身に付与する
    const recipient =
      target instanceof HTMLFormElement ? target : (target.parentElement ?? target)
    recipient.setAttribute('data-message', message)
    if (level !== undefined) {
      recipient.setAttribute('data-message-level', level)
    } else {
      recipient.removeAttribute('data-message-level')
    }
  })
}

// エラーメッセージ設定 (addMessage('error') への委譲)
static async addErrorMessage(target: HTMLElement | HTMLFormElement, message: string): Promise<void> {
  return Haori.addMessage(target, message, 'error')
}

// メッセージクリア (再帰的。data-message-level も削除する)
static async clearMessages(parent: HTMLElement): Promise<void> {
  return Queue.enqueue(() => {
    Haori.clearMessagesSync(parent)
  })
}

// メッセージクリアの同期処理 (clearMessages / openDialog の共通処理)
private static clearMessagesSync(parent: HTMLElement): void {
  parent.removeAttribute('data-message')
  parent.removeAttribute('data-message-level')
  parent.querySelectorAll('[data-message]').forEach(el => {
    el.removeAttribute('data-message')
    el.removeAttribute('data-message-level')
  })
}

// ダイアログを開く (showModal の前に対象内のメッセージ属性をクリアする)
static async openDialog(element: HTMLElement): Promise<void> {
  return Queue.enqueue(() => {
    if (element instanceof HTMLDialogElement) {
      Haori.clearMessagesSync(element)
      element.showModal()
    } else {
      Log.error('[Haori]', 'Element is not a dialog: ', element)
    }
  })
}
```

### 9. Store (store.ts)

**役割**: `data-store` によるブラウザストレージとバインディングデータのミラー

```typescript
class Store {
  // 保存済みの値をバインディングデータへ復元する（優先属性 data-store の処理）
  static restore(fragment: ElementFragment): Promise<void>

  // バインディングデータをレコードへ書き出す（Core.setBindingData から同期で呼ぶ）
  static mirror(fragment: ElementFragment): void

  // レコードを破棄する（data-{event}-store-clear の処理）
  static clear(key: string, kind: StoreKind): void
}
```

#### 呼び出し位置

| 処理 | 呼び出し元 | 位置づけ |
| ---- | ---------- | -------- |
| 復元 | `Core.setAttribute()` の優先属性処理 | `data-bind` の後、`data-url-param` の前 |
| 保存 | `Core.setBindingData()` | 内部バインドデータの確定直後（同期） |
| 破棄 | `Procedure.run()` | `data-{event}-history` の直前 |

保存を `Queue`（`requestAnimationFrame`）へ遅延させず同期で行うのは、`data-{event}-redirect` による遷移や背面タブで次フレームが来ず、遷移直前の保存を取りこぼすためです。書き込みの間引きは「直前の書き出し内容と変わらなければ書かない」だけで行い、まずキーごとの参照同一性で比較して直列化そのものを省きます（`_fetch` / `_poll` などの高頻度更新で直列化が繰り返されないようにするためです）。

なお `localStorage` / `sessionStorage` は式の[禁止識別子](#禁止識別子リスト)であり、式から直接読み書きすることはできません。ストレージへのアクセスは `data-store` 系の属性に限られます。

---

## HTML属性仕様

### データバインディング

#### `data-bind`

バインディングデータを設定します。JSONまたはURLSearchParams形式で指定できます。親要素のバインディングデータと結合されます。

**構文**:
```html
data-bind="{JSON | URLSearchParams形式}"
```

**例**:
```html
<!-- JSON形式 -->
<div data-bind='{"name":"Taro","age":25}'>
  <p>名前: {{name}}</p>
  <p>年齢: {{age}}</p>
</div>

<!-- URLSearchParams形式 -->
<div data-bind="name=Taro&age=25">
  <p>名前: {{name}}</p>
  <p>年齢: {{age}}</p>
</div>

<!-- 親からの継承 -->
<div data-bind='{"user":{"name":"Taro"}}'>
  <div data-bind='{"user":{"age":25}}'>
    <!-- user.name と user.age が両方利用可能 -->
    <p>{{user.name}} ({{user.age}}歳)</p>
  </div>
</div>
```

**イベント**: `haori:bindchange` (バインディングデータ変更時)

**実行中の書き換え**:

`data-bind` は宣言と実行時データの両方を担う属性で、Haori 自身も更新のたびに最新の in-memory 値をこの属性へミラーします。他のスクリプトやライブラリがこの属性を書き換えた場合も、監視（MutationObserver）経由で取り込み、`Haori.Core.setBindingData()` と同じ経路で**配下を再評価します**（テキスト・通常属性・`data-attr-*`・`data-if`・`data-each`・入力欄への書き戻し）。属性を取り除くと、そのバインディングデータは空になります。

- 外部からの書き換えは「明示的な値の供給」として扱い、配下の入力欄からユーザー編集の印を解除します（[ユーザー編集と宣言バインドの権威](#ユーザー編集と宣言バインドの権威)）。利用者が編集した欄も、書き換えた値へ更新されます。
- **要求した時点は、監視（`MutationObserver`）が変更を観測した時点です。** 属性へ代入した瞬間は観測できないため、そこを要求時点にはできません。観測はマイクロタスクで届くので、**同じマイクロタスクの中で行われた編集は「要求より前の編集」**として扱い、供給が上書きします（[反映待ちの間に起きた変化](#反映待ちの間に起きた変化)）。利用者の打鍵は必ず別のタスクで起きるため、実際の操作がこの扱いになることはありません。スクリプトが属性を書き換えた直後に同期的に `input` を発火させる構成だけが該当します。
- Haori 自身の書き戻しは自己書き込みとして記録するため、そのエコーを取り込んで往復することはありません。
- 属性を取り除いた場合は、空のデータを属性へミラーし直しません（取り除いた属性が `{}` として復活しないため）。この経路では `haori:bindchange` も発火しません。
- `data-validity` / `data-{event}-if` / `data-store` は宣言を静的なものとして扱うため、実行中に外部から書き換えても反映されません。`data-bind` はこれらとは異なります。

#### プレースホルダ解決規則

プレースホルダは、属性やノードの種類に応じて以下の共通規則で扱います。

**用語**:
- **プレースホルダ単体**: 値全体が 1 つの `{{ ... }}` で構成されるケースです。式の型を保持します。
- **文字列埋め込み**: 固定文字列と `{{ ... }}` が混在するケースです。最終結果は文字列として扱います。
- **未解決参照**: 式評価時に参照先が存在せず解決できない状態です。`null`、`false` とは区別します。式の評価結果が `undefined` になる参照（バインドに無いキー、`null` を経由したメンバーアクセスなど）はすべて未解決参照として扱います。

**評価順**:
1. `data-bind`、`data-store`、`data-url-param` のような入力系属性を先に反映します（この順に重ねます）。
2. `data-if`、`data-each` のような制御属性を評価します。
3. 通常属性とテキストノードを評価します。
4. `data-fetch`、`data-import` のような副作用属性を最後に評価します。

**副作用属性** (`data-fetch`, `data-import`):
- 単体プレースホルダは、評価結果が空でない文字列のときだけ実行します。
- 文字列埋め込みは、すべての埋め込み式が解決して最終文字列が空でないときだけ実行します。
- 未解決参照、`false`、`null`、`undefined`、空文字は未実行として扱います。

**制御属性** (`data-if`, `data-each`):
- 単体プレースホルダは通常の式として評価します。
- 未解決参照は `false` 相当として扱います。
- `data-each` は `false` を受け取った場合、空配列として扱います。
- 文字列埋め込みは非推奨ですが、未解決参照が 1 つでも含まれる場合は `false` 相当として扱います。

**通常属性**:
- 文字列属性 (`title`, `placeholder`, `aria-*`, `data-*`, `class` など)
  - 単体プレースホルダは、評価結果が文字列のとき設定し、`false`、`null`、`undefined`、未解決参照は属性削除とします。
  - 文字列埋め込みは、未解決参照部分を空文字として連結し、最終結果が空文字なら属性削除とします。
- 真偽属性 (`disabled`, `checked`, `selected`, `hidden`, `required` など)
  - 単体プレースホルダは、`true` で付与し、`false`、`null`、`undefined`、未解決参照で削除します。
  - 文字列埋め込みは非推奨とし、未解決参照を含む場合は削除します。
  - `checked`（radio / checkbox）と `selected`（option）は、属性の付与・削除に加えて DOM プロパティ（`element.checked` / `option.selected`）も同期します。`checked="{{式}}"`・`data-attr-checked`・`data-attr-selected` でチェック状態・選択状態を宣言的にバインドできます。なお `false` 以外の falsy 値（`0`・空文字など）は属性付与（チェック）扱いとなるため、真偽でバインドする場合は式側で真偽へ正規化してください（例: `checked="{{!!flag}}"`）。
- ブラウザ先行解釈属性 (`src`, `value` など)
  - `data-attr-*` で扱うことを正道とします。
  - 単体プレースホルダは、妥当な文字列のときだけ反映し、`false`、`null`、`undefined`、未解決参照は属性削除とします。
  - 文字列埋め込みは、未解決参照が 1 つでもあれば属性全体を未反映とします。

**テキストノード**:
- 単体プレースホルダは、`null`、`undefined`、`false`、未解決参照を空文字として扱います。
- 文字列埋め込みは、未解決参照部分だけを空文字として連結し、固定文字列は保持します。

#### `data-attr-*`

ブラウザが HTML 解析時に先に解釈する通常属性を、安全に更新するための属性です。`data-attr-src` は `src` 属性、`data-attr-value` は `value` 属性のように、`data-attr-` の後ろに付けた属性名へ評価結果を反映します。

**構文**:
```html
data-attr-{attributeName}="template string"
```

**例**:
```html
<div data-bind='{"id":42,"pageId":"help","count":3}'>
  <img data-attr-src="img/{{id}}.jpg" alt="商品画像">
  <iframe data-attr-src="/preview/{{pageId}}"></iframe>
  <input type="number" data-attr-value="{{count}}" readonly>
</div>
```

`src` や `type="number"` の `value` のように、ブラウザが Haori より先に読む属性へ `{{...}}` を直接書くと、警告や不要なアクセスが発生することがあります。そのような属性では `data-attr-*` を使います。

`data-attr-*` は対応する HTML 属性を更新します。加えて、入力欄の表示・状態と DOM の食い違いを防ぐため、次の対象は DOM property も同期します。

- `value`（テキスト系 input / `type="hidden"` / textarea / select）: `input.value` を同期します。`type="hidden"` は利用者が編集できず、送信される値を持つため常に同期対象です（`value` 属性の反映だけでは、値収集や式評価が参照する内部値が更新されません）。`<textarea>` と `<select>` は `value` 属性を持たないため、属性の反映だけでは値が変わりません。
- `checked`（radio / checkbox）・`selected`（option）: それぞれ `element.checked` / `option.selected` を同期します。

いずれも**操作中（フォーカス中）の要素には再適用しません**。別要素起因の再評価や `data-fetch` 完了で、ユーザーの未コミット入力・選択が巻き戻るのを防ぐためです。`value` は対象入力自身、`checked` はその input 自身、`selected` は所属する `<select>` がフォーカス中かで判定します。

これは `value="{{式}}"` のように属性へ直接 `{{...}}` を書いた場合も同様です。

**ただし `readonly` の入力欄（`<input>` / `<textarea>`）は保護の対象外で、フォーカス中でも `value` を再適用します。** `readonly` の欄は打鍵で値が変わらないため、守るべき未コミットの入力を持ちません。一方で `readonly` の欄も**タブ移動の対象になります**（`disabled` と違い、フォーカスは当たります）。保護の対象にすると、他項目から算出した値を入れた欄がタブ移動の行き先になっただけで評価結果に追従しなくなり、送信される値も古いまま残ります。同じ理由から、確定済みのユーザー編集の印（下記「ユーザー編集と宣言バインドの権威」）も `readonly` の欄では再適用を抑止しません。

- `<select>` には `readonly` がありません。算出専用の値を送信したい場合は `type="hidden"` の入力欄を使ってください（利用者が編集できず、フォーカスも当たらないため常に評価結果に追従します）。

`value` の同期対象に checkbox / radio は含みません。これらの `value` は送信値であってチェック状態ではないため、状態は `checked` の同期で扱います。

**確定済みのユーザー編集も、明示的な値の供給を受けるまで再適用しません**（下記「ユーザー編集と宣言バインドの権威」を参照）。`readonly` の欄はここでも例外で、編集できたうちに付いた印が残っていても評価結果を反映します。

未解決参照の扱いは、上記「プレースホルダ解決規則」のブラウザ先行解釈属性に従います。特に文字列埋め込みで未解決参照が 1 つでも含まれる場合は、属性全体を未反映とします。**この規則は `src` / `href` に限らず、`data-attr-` の後ろに書いたすべての属性（`value` / `disabled` / `selected` など）に適用されます。**

なお `?.` / `??` / `||` / `&&` を含む式では、バインドに無い識別子を `undefined` として評価を続けます。`{{detail?.id || dialog?.id || id || ''}}` のように短絡で値が確定する式は未解決参照になりません（結果は `''`）。未解決参照になるのは、フォールバックの無い式（`{{detail.id}}` など）で参照が解決できなかった場合です。

**開発モードでは、未解決参照により反映を見送った宣言を警告します。** 属性名とテンプレートを名指しで報告するため、「なぜか空になる」状態の原因に辿り着けます。同じ宣言は一度だけ報告します（再評価ごとには出しません）。

**開発モードでは、型の食い違う厳密比較を警告します。** `{{opt.id === m.material.id}}` のように `===` の両辺の型が違うと、値が同じでも比較は必ず偽になります。API 由来の数値の `id` と、フォームの収集値（文字列）を比べる宣言で起きやすく、`data-attr-selected` / `data-attr-checked` では「選択やチェックが付かない」、その他の `data-attr-*` では「属性が消える」という形でしか現れません。属性名・テンプレート・両辺の型を名指しで報告します。同じ宣言は一度だけ報告します。

報告するのは次のすべてを満たす場合だけです。

- 属性値が**単体の `{{式}}`** で、評価結果が `false` になった
- 式が**単一の `===` の比較**である。`{{a === b && 'selected'}}` のように `&& 追加` が続く形も対象です（`&&` の左側が偽なら全体が偽になるため）。`||`・三項演算・算術演算・別の比較を含む式は、全体の結果を比較だけでは決められないため対象外です。`!==` も対象外です（型が違えば常に真になり、この警告の条件である「偽になった」に当てはまりません）
- 両辺に**未解決参照が無い**（値の無いキーを含む比較は上記の未解決参照の警告が報告します）
- 両辺の**型が違い**、かつ**緩い比較（`==`）なら真になる**（値そのものが違って偽になるのは宣言どおりなので報告しません）

型を揃える手段は [`data-value-type`](#data-value-type) の宣言（収集値を数値・真偽値にする）か、式の中で `String()` などを通して揃えることです。

**属性削除となる場合は値も空へ揃えます。** 評価結果が `false` / `null` / `undefined`、または未解決参照のときは属性を削除しますが、同期対象の入力では併せて `element.value` と内部値（値収集や式評価が参照する値）も空にします。属性だけを削除すると内部値に旧値が残り、画面と送信内容が食い違うためです。フォーカス中の要素には適用しません（`readonly` の欄は上記の例外どおり適用します）。

- `type="hidden"` の `value` プロパティは HTML 仕様で content attribute へ反映されるため、値を空へ揃えると `value` 属性は削除ではなく `value=""` として残ります。送信される値は空で、収集値と一致します。

#### ユーザー編集と宣言バインドの権威

宣言バインド（`value="{{式}}"` / `data-attr-value` / `checked="{{式}}"` / `data-attr-checked` / `option` の `selected="{{式}}"` / `data-attr-selected`）は、再評価のたびに評価結果を入力欄へ反映します。一方、`name` を持つ入力は `change` / `input` で値をバインドデータへ書き戻します。両方を併用すると値の供給元が二つになるため、どちらを優先するかを次のように定めます。

**利用者が `change` / `input` で確定した入力欄には「編集済みの印」が付き、その欄への宣言バインドの再適用を抑止します。** 印がある間も属性の反映は行われますが、DOM の値・チェック状態と内部値（収集値）は編集値のまま保たれます。

印は打鍵ごと（`input`）に付きます。`data-input-*` を宣言していない入力欄も対象です（宣言のオプトインは手続きの起動にだけ効きます。上記「イベント属性」を参照）。`change` を待たないのは、`change` はフォーカスを外すまで発火せず、それまでの打鍵が保護されないためです。**印を付けるだけで、内部値は同期しません**（[収集は DOM を真とする](#収集は-dom-を真とする)を参照）。

**編集の時点は「値が変わった時点」です。`change` の発火はそれ自体では編集の時点になりません。** `change` はフォーカスを外したときにしか発火しないため、打鍵から遅れて届きます。そこで編集の時点を打ち直すと、**打鍵の後・`change` の前に要求された供給**（クリアなど）よりも新しい編集に見え、その供給が「要求より後の編集」として棄却されてしまいます。したがって直前の `change` より後に打鍵があれば、その**打鍵の時点**を編集の時点とします。打鍵の無い `change`（外部ライブラリが `<select>` の値を差し替えたときなど）は、値が変わったことをそこで初めて知るため、その `change` の時点を編集の時点とします。

この違いは、**ボタンを押してもフォーカスが移らない環境**で表に出ます。フォーカスが移る環境ではボタンを押した時点でブラーが起き、`change` はクリックより前に処理されます。移らない環境（Safari の `<button>` のクリック、スクリプトからの `click()`）では、その後に別の欄へ移った時点で初めて `change` が発火します。編集の時点を打鍵の時点に保つことで、どちらの環境でも同じ結果になります。

同じ理由から、双方向コミットが運ぶ値の権威も**経路ごとにその編集の時点**で判定し（`editedPaths`）、コミットの入力欄への書き戻しも**その入力欄の編集の時点**を基準に初期化と突き合わせます（[`data-{event}-reset`](#data-event-reset)の「進行中のバインドデータ更新は書き戻しません」）。

印は**明示的な値の供給**、または**行と要素データの対応が変わる操作**で解除され、以降の再評価では評価結果が反映されます。解除する操作は次のとおりです。

| 操作 | 解除範囲 |
| --- | --- |
| `data-fetch` / `data-{event}-fetch` の応答反映、およびそれに伴う `data-{event}-bind` | リクエストを組み立てた時点までの編集。それより後の編集は保持されます（応答は編集より古い情報のため） |
| `data-{event}-reset` / `data-{event}-reset-before` | 対象配下のすべての編集 |
| `data-{event}-copy` | コピー先配下のすべての編集。コピー先が**編集可能な行**の場合は、その行のうち**書き戻す要素データと画面の状態が食い違うキー**に属する入力欄の編集だけ（要素データが変わったかどうかには依りません） |
| `data-{event}-row-add` / `-row-remove` / `-row-prev` / `-row-next` で、**別のレコードを受け取る行**が出たとき | その行の中のすべての編集（`data-each-key` を指定していない場合だけ。指定している場合はキーと一緒にレコードが移動するため、どの行も別のレコードを受け取りません） |
| `Core.setBindingData()` の直接呼び出し | 対象配下のすべての編集 |

**`data-each` の差分更新そのものは印を解除しません。** 行の要素データが入れ替わったことだけを条件に解除すると、行内の入力を編集した瞬間に**そのコミット自身が保護を外します**（コミットが要素データを書き換えるため）。宣言バインドの評価が要素データと食い違う構成（数値の `id` とフォームの収集値である文字列を厳密比較する `data-attr-selected` など）では、確定した編集が画面と収集値から静かに消え、バインドデータだけが編集値を持つ状態になります。解除するのは上の表の操作だけで、いずれもその操作の側が解除します。

解除の範囲は共通の規則で決まります。**供給は、その供給を起こした操作が起きた時点までの編集を解除し、それより後の編集は残します。** 表の「すべての編集」は、その操作の時点までに確定していた編集を指します。呼び出し側が範囲を数値で選ぶことはありません。

次の更新は「値の供給」ではないため、印を解除しません（解除すると編集値が評価結果へ巻き戻ります）。

- `change` / `input` による双方向バインディングのコミット。フェッチを伴わない `data-{event}-bind` でバインド先を明示した場合も含みます（バインドされるデータは入力欄から収集した編集値そのものなので、権威を譲る相手がいません）。**コミットが `data-each` の行の要素データを書き換える場合も同じです**（`data-form-list` の行の入力欄はこの形になります）
- `data-url-param` の再評価（再評価ごとに走るため）
- `data-poll` の応答反映。利用者が要求していない自動取得なので、これまでの編集をすべて応答の上へ載せ直します（**編集が残ります**。数秒ごとの自動取得で、入力してしばらく置いた値が静かに消えるのを防ぐためです）
- `_poll` / `_fetch` / 可視範囲などエンジン管理変数の更新

この規則により、参照するキー（式のスコープ）と `name` が書き込むキーが別であっても、確定した編集が再評価で失われません。入力要素自身に `data-{event}-bind` を付け、`data-{event}-bind-arg` で参照キーとは別のキーへ書き込む構成も同じです。

なお、印がある欄は「明示的な供給を受けるまで」評価結果に追従しません。式で導出した値を欄に入れつつ、導出の前提が変わったら常に入れ直したい場合は、次のいずれかにしてください。

- その欄を `readonly` にする。`readonly` の欄では、**印の有無にもフォーカスにも関わらず再適用を抑止しません**（上記「`data-attr-*`」）。タブ移動でその欄へ入っていても、編集できたうちに付いた印が残っていても、評価結果に追従します。
- 表示が不要なら `type="hidden"` の入力欄にする。利用者が編集できず、フォーカスも当たりません。
- `data-{event}-fetch` や `data-{event}-reset` のような明示的な供給を契機にする。

##### 反映待ちの間に起きた変化

入力欄への値の反映は描画キューを経由するため、要求してから DOM へ載るまでに間があります。この間に起きた変化は次のように扱います。

- **別の値の反映が要求されたら、後から来た値が載ります**（後勝ち）。先の書き込みの完了を待ってから改めて反映するため、最後に供給された値が画面とバインドデータの双方に残ります。
- **利用者が入力を確定したら、待っていた書き込みは行いません**。反映を要求した時点より後の編集は、上記の「編集済みの印」と同じ理由で保護します（要求より前の編集は、明示的な供給が権威なので上書きします）。
- 保護の対象は**打鍵 1 文字ごと**です。`change` の発火（フォーカスを外す・選択の確定）を待ちません。外部ライブラリが値を入れた欄をクリックしてすぐ打ち始めた場合など、要求から着弾までの数十ミリ秒の間に打った文字も残ります。
- **同名チェックボックス・ラジオの群は、欄ごとではなく群単位で保護します。** 群の値は 1 つのキーに対する選択の集合なので、操作された欄だけを取り出すと集合が壊れます（3 つ選択済みのうち 1 つを操作した瞬間に、その 1 つだけが残った集合になってしまいます）。**群のいずれかの欄が要求より後に操作されていれば、その群の現在の選択集合をそのまま保護します。** 集合の形は仕様「同名チェックボックス・ラジオの収集値の形」のとおりで、選択を 0 個にする操作（すべて外す）も保護の対象です（`name` のみなら `null`、`data-form-list` 併記なら `[]` として保護します）。
  - **群の範囲は、収集値の同じ階層です。** 同じキーへ集まる欄だけを 1 つの群として数えます。具体的には `data-form-list` の**行**、`data-form-object`、最近傍のフォーム（`<form>` または `data-form`）のうち最も内側の範囲です。別の行や別の `data-form-object` の同名の欄は、収集値では別のキーなので群に含めません（行ごとに同名のチェックボックスを並べた表で、ある行の操作が他の行の選択を書き換えることはありません）。
  - 収集の対象外である部分木の欄も群に含めません。`data-form-detach`（仕様「`data-form-detach`」）と非表示分岐（仕様「`data-if-false` 分岐とフォーム送信」）の配下は、収集されないため保護すべき選択も持ちません。
  - 群の同一性は**収集キー**で判断します。`data-form-name` で収集キーを宣言した場合は、`name` 属性ではなくそのキーが一致する欄が同じ群です。

---

### 条件分岐

#### `data-if`

条件式を評価し、結果が `false`, `null`, `undefined`, `NaN` の場合は要素を非表示にします。未解決参照は `false` 相当として扱います。

**構文**:
```html
data-if="expression"
```

**例**:
```html
<div data-bind='{"isLoggedIn":true,"age":20}'>
  <!-- 真偽値 -->
  <p data-if="isLoggedIn">ログイン中</p>

  <!-- 比較演算 -->
  <p data-if="age >= 18">成人です</p>

  <!-- 論理演算 -->
  <div data-if="isLoggedIn && age >= 18">
    成人のログインユーザー
  </div>
</div>
```

**関連属性**:
- `data-if-false`: 非表示時に自動付与 (手動変更禁止)
- `data-haori-if-disabled`: 非表示分岐で `disabled` を付与した入力への印 (手動変更禁止)

**イベント**:
- `haori:show` (表示時)
- `haori:hide` (非表示時)

非表示から表示へ遷移した要素が `data-load-*` を宣言している場合は、その手続きを 1 回実行します（[イベント属性](#イベント属性)を参照）。

---

### 繰り返し処理

#### `data-each`

配列を繰り返し処理し、各要素を表示します。差分検出により効率的な更新を実現します。未解決参照は `false` 相当として扱い、`false` は空配列として評価します。

**構文**:
```html
data-each="arrayExpression"
```

**配置ルール**: `data-each` は繰り返しの「コンテナ要素」に付与し、その**最初の子要素がテンプレート**として配列の要素数ぶん複製されます。繰り返したい要素そのものに付けるのではありません。

- 正しい: `<ul data-each="items"><li>…</li></ul>` → `<li>` が複製される。
- テーブルは `<tbody data-each="rows"><tr>…</tr></tbody>` のように `<tbody>` に付与し、`<tr>` をテンプレートにします。
- 誤り: `<tr data-each="rows"><td>…</td></tr>` … 子の `<td>` が複製され、行が増えません（Vue の `v-for` のように「その要素自身」を繰り返す挙動ではありません）。

**関連属性**:
- `data-each-arg`: 各要素のバインド名 (プリミティブ配列では必須)
- `data-each-key`: 一意キープロパティ名 (差分検出用)。**値は配列の中で一意である必要があります。** 重複した場合、行と配列要素の対応付けは同じキーの中で**出現順**へ退きます（行の生成・入力欄への書き戻し・収集・行への書き込みのいずれも同じ規則です）。行の数・並び・各行の要素データは配列どおりになりますが、キーによる行の識別（差分更新での行の再利用、行イベントのキー）は働きません。重複を検出すると、開発モードで項目名ごとに一度だけ警告します
- `data-each-index`: インデックスのバインド名。`data-each-arg` と併用した場合も**行スコープの直下**（`{{i}}`）で解決します。要素データの内側（`{{arg.i}}`）には入りません
- `data-each-before`: ループ前に表示する要素をマーク（**ループコンテナの直接の子**に置きます）
- `data-each-after`: ループ後に表示する要素をマーク（**ループコンテナの直接の子**に置きます）
- `data-row`: 各行に自動付与されるキー (手動変更禁止)
- `data-each-visible`: スクロール追従の可視行範囲を組み込み変数として公開（後述）
- `data-each-done`: 全行の描画が安定して完了したときに **Haori が自動付与**するマーカー（手動指定不可）。新しい描画サイクルの開始時に外され、完了時に再付与されます。E2E テスト等で `[data-each-done]` の出現を待って描画完了を検知できます。**発火保証**: 初回描画・再 fetch・再バインドなど描画サイクルが走るたびに、コンテナ単位で「除去 → 再付与」が必ず一度行われます。差分更新で実際の DOM 変更がない場合でも、サイクルが安定した時点で再付与されます。これにより外部ウィジェットの再同期契機として利用できます
- `data-each-rendered-run`: 描画が確定し `data-each-done` が付与されるたびに、**コンテナ単位で一度だけ**実行する任意の JS（`data-{event}-run` と同じ式評価）。本体内の `this` は対象コンテナ要素に束縛されます。外部の select 拡張ライブラリ（Choices.js 等）の再同期フック（例: `data-each-rendered-run="window.__choicesRefresh(this)"`）として利用できます。適用の冪等性やインスタンスの保持まで宣言に寄せる場合は [`data-enhance`](#data-enhance) を使ってください（`data-enhance` の再同期はこのフックより前に実行されます）
- `data-each-rendered-change`: 描画確定後に、対象コンテナ要素へ `change` イベント（バブリングあり）を発火します。API から取得した候補を `data-each` で流し込んだ `<select>` について、「既定選択を確定して初期データを取得する」パターンをインライン JS なしで宣言できます。`<select>` はブラウザが先頭 `<option>` を自動選択するため、描画確定後の `change` がそのまま既定選択の確定になります。`data-each-rendered-run` より後に実行されるため、外部ウィジェットの再同期を先に済ませた状態で発火します
  - 属性値を省略、または `once`: 描画行が 1 件以上ある**最初の描画確定時のみ**発火します（既定）
  - `always`: 描画確定ごとに毎回発火します
  - 描画行が 0 件のときは発火しません（確定すべき既定値が存在しないため）。この場合は初回発火の判定も消費しないため、行が入った最初の描画で発火します
  - 既定を `once` にしているのは、`change` の手続きが `data-each` の取得元を再バインドする構成（候補取得 → 選択確定 → 明細取得 → 再描画）で、毎回発火させると再帰的な発火ループになり得るためです

**例**:

```html
<!-- オブジェクト配列 (キー指定あり) -->
<div data-bind='{"users":[{"id":1,"name":"Taro"},{"id":2,"name":"Hanako"}]}'>
  <ul data-each="users" data-each-key="id">
    <li>{{name}}</li>
  </ul>
</div>
<!-- 結果:
<ul>
  <li data-row="1">Taro</li>
  <li data-row="2">Hanako</li>
</ul>
-->

<!-- プリミティブ配列 (data-each-arg必須) -->
<div data-bind='{"tags":["JavaScript","TypeScript"]}'>
  <div data-each="tags" data-each-arg="tag">
    <span>{{tag}}</span>
  </div>
</div>

<!-- インデックス付き -->
<div data-bind='{"items":["A","B","C"]}'>
  <div data-each="items" data-each-arg="item" data-each-index="i">
    <p>{{i}}: {{item}}</p>
  </div>
</div>
<!-- 結果:
<div>
  <p>0: A</p>
  <p>1: B</p>
  <p>2: C</p>
</div>
-->

<!-- before/after要素 -->
<div data-bind='{"items":[1,2,3]}'>
  <div data-each="items" data-each-arg="item">
    <p data-each-before>--- 開始 ---</p>
    <span>{{item}}</span>
    <p data-each-after>--- 終了 ---</p>
  </div>
</div>
<!-- 結果:
<div>
  <p>--- 開始 ---</p>
  <span>1</span>
  <span>2</span>
  <span>3</span>
  <p>--- 終了 ---</p>
</div>
-->
```

**イベント**:
- `haori:eachupdate` (リスト更新時)
- `haori:rowadd` (行追加時)
- `haori:rowremove` (行削除時)
- `haori:rowmove` (行移動時)

#### `data-each-visible`（スクロール追従の可視行範囲）

無限スクロールなどで「いまビューポートに見えている行範囲（x - y）」を、JavaScript なしで宣言的に表示するための仕組みです。`data-each` コンテナに付与すると、各行を `IntersectionObserver` で監視し、可視行範囲を**指定名の組み込み変数**として**最近接の上位 `data-bind` スコープ**へ公開します。実装は `src/visible_range.ts`。

**属性**:
- `data-each-visible="<変数名>"`: 機能を有効化し、公開する変数名を指定（必須。値が無い場合は警告して無視）。
- `data-each-visible-root`: スクロール枠（`IntersectionObserver` の root）のセレクタ。省略時はビューポート。
- `data-each-visible-margin`: rootMargin。省略時は `0px`。

**公開される変数の形**（変数名 `vr` の場合 `vr.first` 等で参照）:

| プロパティ | 内容 |
|---|---|
| `first` | 可視先頭行の **0 始まり**論理インデックス（可視 0 件のとき `-1`） |
| `last` | 可視末尾行の **0 始まり**論理インデックス（可視 0 件のとき `-1`） |
| `firstLabel` | 表示用の先頭番号（`first + 1`。可視 0 件のとき `0`） |
| `lastLabel` | 表示用の末尾番号（`last + 1`。可視 0 件のとき `0`） |
| `count` | 可視行数 |
| `total` | **読込済（描画済み）の行数**（＝現在 DOM に存在する行数。グランド総数ではない） |
| `empty` | 可視行が 0 件のとき `true` |

> **注意**: `total` は「読込済行数」であり、サーバ側の総件数（グランド総数）ではありません。`1 - 20 / 100 件` のような**総件数 100** を出すには、`page` 情報と `haori.pageSummary(page).total` を併用してください。

**仕様の要点**:
- **可視判定**: しきい値 `0`（1px でも見えていれば可視）。
- **公開先**: 最近接の**上位** `data-bind` スコープ（一覧本体とフッタの共通祖先）。上位に無い場合のみコンテナ自身へフォールバックし、見つからなければ警告して公開しません。
- **行インデックス**: 描画順（`content` 配列の添字、`data-each-index` と一致）。
- **更新の合体**: 多発する交差イベントは `requestAnimationFrame` で 1 回にまとめて集計し、前回と異なるときだけ公開します。
- **性能**: 公開は in-memory スコープのみ更新し、`data-bind` 属性への全データ直列化（`JSON.stringify`）は**抑止**します（`Core.setBindingData(..., {reflectToAttribute: false})`）。これにより公開先スコープが `content` などの大配列を保持していても、スクロールのたびに大配列が再直列化されることはありません。再評価は一覧本体フラグメントを `skipFragments` で枝刈りするため、コストはフッタ側（行数非依存）のみです。監視コールバックは境界を跨いだ行のみ発火（スクロール停止中はゼロ）。各行を監視するため監視登録メモリは描画済み行数に比例し、極端な大量行では行仮想化の併用を推奨します。
- **属性ミラー・通知**: 可視範囲変数は実行時の一時値のため `data-bind` 属性には反映されません（`Haori.Core.getBindingData(...)` の in-memory 値では参照可能）。属性は次回の通常バインド更新時に最新 in-memory から反映されます。また高頻度更新による通知の氾濫を避けるため、公開時に **`haori:bindchange` イベントは発火しません**（公開先要素で `data-on` 等のバインド変更通知は受け取れません）。
- **初期値**: 変数は初回フレームで公開されるため、最初の描画直後の一瞬は未定義になり得ます。フッタ式は `{{vr.firstLabel}}`（未定義時は空表示）か `data-if` でガードしてください。

**例**:

```html
<div data-fetch="/api/items?page={{page}}">
  <ul data-each="content" data-each-key="id"
      data-each-visible="vr" data-each-visible-root="#list-scroll">
    <li>{{name}}</li>
  </ul>
  <footer>
    {{vr.firstLabel}} - {{vr.lastLabel}} / {{haori.pageSummary(page).total}} 件
  </footer>
</div>
```

#### `data-derive` / `data-derive-name`

以下は、親の現在値から子候補を導出するような UI を宣言的に構成するための仕様です。`data-derive` は派生値の供給、`data-each` は描画を担当します。

**目的**:

- 親の現在値から子候補を宣言的に導出できるようにする
- 派生値の供給と反復描画の責務を分離する
- `select` / `option` に対しても既存の `data-each` 一般規則をそのまま適用する

**属性**:

- `data-derive`: 派生値を計算する式
- `data-derive-name`: 派生値を子孫要素から参照するための名前

**評価タイミング**:

- 初回の scan / mount 時
- フォーム値更新時
- `data-bind` 更新時
- `data-derive` / `data-derive-name` の属性追加・変更・削除時
- 子要素の `data-if` / `data-each` より前に再評価

**動的属性変更時の扱い**:

- `data-derive` または `data-derive-name` が実行中に追加・変更・削除された場合、その要素の派生値を直ちに再計算する
- 派生値の公開状態が変わった場合は、その要素の子孫を再評価し、テキスト、通常属性、`data-if`、`data-each` を新しい公開状態へ追従させる
- `data-derive-name` の変更時は旧名での公開を残さず、新しい名前だけを有効にする

**スコープ**:

- `data-derive-name` は当該要素の配下だけで有効
- 子要素から参照可能
- 兄弟、祖先、定義した要素自身からは参照不可
- ネスト時は内側の同名定義が外側を上書き

**名前衝突時の優先順位**:

- 名前解決は近いスコープを優先する
- `data-derive` を定義した要素の子孫から見た同一スコープでは、`data-derive-name` がその要素の `data-bind` や form バインド値より優先される
- より内側の子要素や form が同名の binding key を持つ場合は、その内側の値が外側の派生値を上書きする

**`data-each` との関係**:

- `data-each` は繰り返し対象の親要素に付くという一般規則を維持する
- `select` も他要素と同様に `data-each` を付ける対象になる
- 子要素が `option` の場合も、最初の通常子要素をテンプレートにする一般規則を適用する
- 固定の先頭 `option` は `data-each-before`、固定の末尾 `option` は `data-each-after` で表現する
- `option` 自身に `data-each` を付ける書き方は採用しない

**複数選択（`<select multiple>`）**:

- `multiple` を指定した `select` の値は、選択済み `option` の値を集めた**文字列配列**として扱う
- フォーム値収集では `name` のキーに配列がそのまま格納される（例: `{"electricPlanName": ["A", "B"]}`）
- `data-bind` 側に配列を与えると、各 `option` の選択状態へ反映される
- 外部ウィジェット（Choices.js 等）が native `<select>` を更新して `change` を発火した場合も、上記の配列として収集・双方向同期される

**未解決参照時**:

- `data-derive` の式に未解決参照があるサイクルでは、その導出名は未供給として扱う
- 直前の導出値を保持し続けない
- `data-each` が `null`、`undefined`、`false`、未供給を受けた場合は空配列相当として扱う

**`data-derive-name` 未指定時**:

- `data-derive-name` が未指定、空文字、空白のみの場合、その `data-derive` は子孫へ値を公開しない
- この場合は無効な定義として扱い、直前の派生値を残さない
- 後から `data-derive-name` が削除された場合も同様に、既存の公開を停止する

**記述例**:

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

---

### 外部ライブラリ連携

#### `data-external`

指定した要素とその子孫で発生した DOM 変更を、Haori の自動監視（MutationObserver）対象から除外します。外部の select 拡張ライブラリ（Choices.js 等）が「元の要素を隠して独自 DOM を生成・随時更新する」場合に、その生成 DOM へ Haori が干渉しないようにするための宣言属性です。

**構文**:
```html
<div data-external> ... </div>
```

**挙動**:

- `data-external` を持つ要素の配下で起きた属性変更・ノード追加削除・テキスト変更を、Haori は無視する
- `data-each` による `<option>` の配列バインドは Haori のバインド評価パイプラインが駆動するため、監視除外下でも維持される
- Choices.js のように元 `<select>` を生成コンテナの内側へ**再配置**するライブラリでも、その移動や再生成が Haori に破壊されない

**付与位置**:

- 外部ライブラリが生成する DOM とバインド対象の要素（`<select>` 等）の**両方を内側に含む外側コンテナ**へ付与することを推奨する
- 元の要素自身に付けても、ライブラリが生成する親側 DOM までは除外できないため、外側コンテナでの宣言を基本とする

**最小例（Choices.js）**:
```html
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

`<option>` は `data-each` で配列バインドし、外部生成 DOM は `data-external` で監視除外、描画確定のたびに `data-each-rendered-run` で外部ウィジェットを再同期します。選択結果は `<select multiple>` の配列値としてフォーム送信値（`data-click-form` 等）に反映されます。任意の select 拡張ライブラリへ一般化できます。

#### `data-enhance`

登録した外部ライブラリ連携を、宣言した要素へ適用します。適用・再適用・破棄の契機を Haori が与えるため、画面ごとの JavaScript（適用対象の判定、冪等性の管理、インスタンスの保持）が不要になります。

**構文**:
```html
<select data-enhance="choices" data-each="items" data-each-arg="it">…</select>
<div data-enhance="choices tooltip">…</div>
```

**登録**（1 度だけ。iife グローバルは `Haori.enhancers`、ESM は `import {enhancers} from 'haori'`）:
```js
Haori.enhancers.register('choices', {
  init: element => new Choices(element),           // 必須。戻り値をインスタンスとして保持
  refresh: (element, instance) => instance.refresh(),  // 省略可
  destroy: (element, instance) => instance.destroy(),  // 省略可
});
```

**契機**:

| 契機 | 対象 | 呼び出し |
|---|---|---|
| 初期スキャン、後から追加されたノード、`data-each` の新規行 | 追加された部分だけ | `init`（未適用の要素だけ） |
| `data-each` の描画確定（`data-each-done` の付与時） | そのコンテナの配下 | `refresh`（未適用なら `init`） |
| `data-if` の非表示 → 表示 | その分岐の配下 | `refresh`（未適用なら `init`） |
| 要素が DOM から外れたとき（行削除など） | 外れた部分の配下 | `destroy` |

`init` が走るのは**未適用の要素だけ**です（行の追加・並べ替えで既存行が作り直されることはありません）。一方 `refresh` は描画が確定したコンテナ配下の適用済み要素すべてに対して呼ばれるため、**軽く・何度呼ばれても同じ結果になる実装**にしてください（`data-each-rendered-run` と同じ粒度です）。`data-if` の非表示では `destroy` を呼ばず、インスタンスを保持したまま再表示で `refresh` します。

**挙動**:

- 適用は**要素ごと・名前ごとに一度だけ**です。再スキャンや再描画で `init` を繰り返しません（外部ライブラリは冪等でないものが多いため）。
- 走査は宣言した要素の**配下に限定**されます（`document` 全体を走査し直しません）。ただし引数を受け取らず自分で `document` を走査するライブラリでは、Haori が担保できるのは呼び出し回数だけです。
- 空白区切りで複数の連携を宣言できます。属性値は**評価しません**（登録名をそのまま使います。`{{式}}` は展開されません）。
- **登録はスクリプトの読み込み順に依存しません。** 未登録の名前は適用を保留し、`register()` の時点で `document.body` 配下を遡って適用します（開発モードでは保留を一度だけ警告します）。
- `init` / `refresh` / `destroy` の例外は `error` ログに記録して続行します。1 つの連携の失敗で描画や他の要素の適用を止めません。
- `data-each` の描画確定では `data-enhance` の `refresh` を `data-each-rendered-run` より**前**に実行します（外部ウィジェットの再同期を先に済ませてから任意の JS を動かすため）。
- 外部ライブラリが生成した DOM を監視対象外にする場合は [`data-external`](#data-external) を併用してください（生成 DOM とバインド対象を含む外側のコンテナへ宣言します）。**対象要素を生成コンテナの内側へ再配置するライブラリ（Choices.js など）では併用が必須です。** `data-external` が無いと、移動が「削除 → 追加」として観測されて `destroy` と再 `init` が走ります。

#### `data-enhance-new`

登録なしで、**グローバル参照を `new` するだけ**の簡易形です。JavaScript ファイルを持たずに宣言だけで完結させたい場合に使います。

**構文**:
```html
<div class="h-adr" data-enhance-new="YubinBango.MicroformatDom">…</div>
```

**挙動**:

- 値は**ドット区切りのグローバル参照だけ**を許します（識別子とドット以外を含む値はエラーログを出して何もしません）。属性値をコードとして実行しません。
- `new 参照(対象要素)` を**要素ごとに一度だけ**呼びます。引数を受け取らない実装でも害はありません。
- 再同期（`refresh`）と後始末（`destroy`）はありません。インスタンスの再同期が必要なライブラリ（Choices.js など）は `data-enhance` を使ってください。
- 対象のグローバルは、Haori の初期スキャンより前に定義されている必要があります（解決できない場合は開発モードで一度だけ警告します）。

#### 外部ライブラリが書き込んだ入力値

外部ライブラリが `element.value` へ直接代入した値（郵便番号からの住所補完など）は、`change` / `input` を伴わなくても**収集・送信・保存の対象になります**。値収集は DOM を真として行うためです（[収集は DOM を真とする](#収集は-dom-を真とする)を参照）。連携の宣言（`data-enhance` / `data-enhance-new`）だけで、補完結果を含めた入力内容が保存されます。

```html
<!-- 郵便番号を入力すると YubinBango が都道府県・市区町村・町域へ代入する。
     代入は change を伴わないが、次の収集でそのまま送信値へ載る。 -->
<form id="customer-form" data-form-object="customer">
  <div class="h-adr" data-enhance-new="YubinBango.MicroformatDom">
    <span class="p-country-name" style="display:none;">Japan</span>
    <input name="postalCode" class="p-postal-code">
    <select name="prefecture" class="p-region">…</select>
    <input name="municipality" class="p-locality">
    <input name="town" class="p-street-address">
  </div>
  <button data-click-fetch="/api/save" data-click-fetch-method="POST"
          data-click-form>次へ</button>
</form>
```

反映の契機は**収集が走ったとき**です。代入した瞬間にバインドデータや `data-store` の保存値が更新されるわけではありません（送信時・他の欄の `change` 時などに揃います）。

---

### フェッチとインポート

#### `data-fetch`

指定URLからデータを取得し、レスポンスを `data-bind` に設定します。

**構文**:
```html
data-fetch="url"
```

**関連属性**:
- `data-fetch-method`: HTTPメソッド (デフォルト: GET)
- `data-fetch-content-type`: Content-Type
- `data-fetch-headers`: リクエストヘッダー (JSON or URLSearchParams)
- `data-fetch-data`: 送信データ（テンプレート式の埋め込み規則は [`data-{event}-data`](#data-event-data) と同じ）
- `data-fetch-form`: フォーム要素のセレクタ
- `data-fetch-bind`: バインド先セレクタ (デフォルト: 自要素)。セレクタは `document.body` 配下を探すため、`<head>` 内の要素（`<title>` など）はバインド先に指定できない
- `data-fetch-arg`: バインドキー名（**推奨**。後述「バインドキー名の指定」）
- `data-fetch-bind-arg`: バインドキー名（`data-fetch-arg` の別名。**非推奨**。`data-fetch-arg` が無い場合に参照）
- `data-fetch-bind-params`: 抽出パラメータ (&区切り)
- `data-fetch-bind-merge`: バインド先の既存キーを保持して浅くマージ（**バインドキー名を指定した場合は無視**。後述）
- `data-fetch-bind-append`: 配列を追記するキー（[`data-fetch-bind-append` / `data-{event}-bind-append` / `data-intersect-bind-append`](#data-fetch-bind-append--data-event-bind-append--data-intersect-bind-append)）
- `data-fetch-bind-transform`: 応答の変換（[`data-{event}-bind-transform`（非イベント: `data-fetch-bind-transform`）](#data-event-bind-transform非イベント-data-fetch-bind-transform)）
- `data-fetch-state`: フェッチ状態 `_fetch` の注入先セレクタ（省略時は自要素）

**バインドキー名の指定**:

応答に名前を付けてバインドする属性は 2 つありますが、**推奨は `data-fetch-arg`** です。`data-fetch-bind-arg` は同義の別名で、両方ある場合は `data-fetch-arg` を採用します。新しく書く宣言では `data-fetch-arg` を使ってください（`data-fetch-bind-arg` は非推奨ですが、既存の宣言のために解釈は続けます）。イベント版は `data-{event}-bind-arg` だけで、`data-{event}-arg` はありません。

- **キー名を指定した場合**は、そのキーの配下だけを更新し、**バインド先の他のキーは保持します**。したがって `data-fetch-bind-merge` を併記する必要はありません（併記しても**無視されます**）。
- **キー名を指定しない場合**は、応答でバインド先を**全置換**します。バインド先が持っていた他のキー（別の `data-fetch` が寄せた結果など）は**消えます**。消えたキーを供給していた `data-fetch` は実行シグネチャが変わらないため再取得されず、参照側の式は[未解決参照](#未解決参照の診断)のまま復帰しません。既存のキーを残したい場合は、キー名を指定するか `data-fetch-bind-merge` を併用してください。

```html
<!-- 推奨: キー名を指定する（#state の他のキーは保持される） -->
<div data-fetch="/api/auth/me" data-fetch-bind="#state" data-fetch-arg="me"></div>

<!-- 非推奨: 別名。上と同じ意味 -->
<div data-fetch="/api/auth/me" data-fetch-bind="#state" data-fetch-bind-arg="me"></div>

<!-- 注意: キー名が無いので #state は応答で全置換され、me なども消える -->
<div data-fetch="/api/detail" data-fetch-bind="#state"></div>
```

**未解決参照と再評価**:
- プレースホルダ単体では、評価結果が空でない文字列のときだけ実行します。`false`、`null`、`undefined`、空文字、未解決参照は未実行とします。
- 文字列埋め込みでは、`data-fetch`、`data-fetch-method`、`data-fetch-content-type`、`data-fetch-data` の評価に未解決参照が 1 つでも含まれる場合、その評価サイクルでは `data-fetch` は無効扱いとなり実行しません。
- bind 更新後は `data-fetch` を専用ルートで再評価します。
- 再実行判定は、評価後の URL、HTTP メソッド、ヘッダー、body から組み立てた実行シグネチャで行います。
- 実行シグネチャが前回と同じ場合は再実行しません。
- 前回が未解決参照により未実行で、後続の bind 更新で解決した場合は、その時点で初回実行します。

**例**:

```html
<!-- 基本的な使用 -->
<div data-fetch="/api/user">
  <p>名前: {{name}}</p>
</div>

<!-- バインド先を指定 -->
<div data-fetch="/api/users" data-fetch-bind="#userList"></div>
<div id="userList" data-each="users" data-each-key="id">
  <p>{{name}}</p>
</div>

<!-- バインドキー名を指定 -->
<div data-fetch="/api/user" data-fetch-arg="user">
  <p>{{user.name}}</p>
</div>

<!-- 行の中で候補を取得し、行内のどの式からも参照する -->
<div data-form-list="rows" data-each="rows" data-each-arg="c" data-each-index="i">
  <div class="row">
    <!-- 応答のバインド先は行の内側のラッパ（式を書く要素の祖先） -->
    <div id="row-body-{{i}}">
      <div data-fetch="/api/plans?area={{c.area}}" data-fetch-arg="planCandidates"
           data-fetch-bind="#row-body-{{i}}">
        <select name="planId" data-each="planCandidates.content ?? []" data-each-arg="p">
          <option value="{{p.id}}">{{p.planName}}</option>
        </select>
      </div>
      <input type="hidden" name="planName"
             data-attr-value="{{haori.findBy(planCandidates.content ?? [], 'id', c.planId).planName}}">
    </div>
  </div>
</div>

<!-- POSTリクエスト -->
<div
  data-fetch="/api/create"
  data-fetch-method="POST"
  data-fetch-data='{"name":"Taro"}'
>
</div>

<!-- テンプレート式で既存バインディングを参照 -->
<div
  data-bind='{"page":2,"q":"term"}'
  data-fetch="/api/search"
  data-fetch-method="POST"
  data-fetch-data="page={{page + 1}}&q={{q}}"
>
</div>

<!-- フォームデータを送信 -->
<form id="myForm">
  <input name="username">
  <input name="email">
</form>
<button data-fetch="/api/submit" data-fetch-form="#myForm" data-fetch-method="POST">
  送信
</button>
```

**イベント**:
- `haori:importstart` (開始時)
- `haori:importend` (終了時)
- `haori:importerror` (エラー時)

**レスポンスのバインド挙動**:

- バインド先（`data-fetch-bind` 等）を指定しなかった場合は、既定で**自要素**をバインド先に補います（既定 self-bind）。
- 応答ボディの解釈は `Content-Type` で決まります。`application/json` のときは JSON として解析し、それ以外は文字列として扱います。
- **2xx で空ボディ**（`204 No Content`、本文なしの `200` 等）の場合は、**バインド対象なしとして正常にスキップ**します。バインドエラーにはならず、後続アクション（`*-toast` / `*-close` / `*-click` / 再取得など）は通常どおり実行されます。REST 慣習で空応答を返す削除・更新系（`DELETE` 等）でも、`*-toast` や再取得を問題なく併用できます。
- バインド先を**明示指定**したうえで、JSON オブジェクトでない文字列応答が返り、かつ `data-fetch-arg` / `data-fetch-bind-arg`（バインドキー名）が無い場合は、バインドできないため**エラーとして停止**します（バインドキー名を指定するか、応答を JSON オブジェクトにしてください）。
- 一方、**既定 self-bind**（バインド先を明示していない）で同様の文字列応答が返った場合は、バインドを意図していないものとみなして**警告にとどめてスキップ**し、後続アクションは実行されます。

**`<head>` / `<title>` への実行時バインド**:

`<head>` も初期化時に `Core.scan(document.head)` でスキャンされ、`MutationObserver` で監視されます。`<title>` のテキストも他のテキストノードと同様に `{{...}}` 補間の対象となるため、`<title>` 自身に `data-bind` / `data-fetch` を付与すればスコープが確立され、テキストが実行時に更新されます。

```html
<head>
  <!-- 応答 {"company":"..."} を title 自身へ self-bind -->
  <title data-fetch="/api/site">{{company}} - ログイン</title>
</head>
```

- スコープは `<title>` 自身（または同一サブツリーの祖先）に持たせる必要があります。兄弟要素（例: `<meta data-bind>`）のスコープは `<title>` に継承されません。
- 取得前の `{{company}}` は[未解決参照](#未解決参照の診断)として空文字になります。エラーにはならないため、`data-bind` でキーを宣言しておく必要はありません。
- ネストキーで受けたい場合は `data-fetch-arg` を併用します（例: `data-fetch-arg="site"` → `{{site.company}}`）。
- **応答は、バインド先の要素とその子孫からしか参照できません。** 兄弟要素に置いた `{{式}}` や `data-attr-*` からは参照できず、`??` などで既定値を書いていると既定値のまま表示され続けます（開発モードでは[未解決参照の診断](#未解決参照の診断)が「別のスコープでは供給されている」旨を警告します）。行の中で取得した候補を行全体で使う場合は、`data-fetch-bind` で**行の内側のラッパ**へ寄せてください。行要素自身を指すと、`data-form-list` を併用したコンテナでは[行データへの書き戻し](#編集可能な行への書き込み)になり、候補が収集値・保存値へ入ります。
- `data-fetch-bind` や `data-{event}-copy` の対象セレクタは `document.body` 配下のみを探索するため、これらで `<head>` 内の要素（`<title>` 等）を対象にすることはできません。`<head>` への実行時バインドは「対象要素自身への直接付与」で行ってください。

#### `data-import`

指定URLのHTML (`<body>` タグ内容) を要素の `innerHTML` として挿入します。

**構文**:
```html
data-import="url"
```

**例**:
```html
<div data-import="/components/header.html"></div>
```

**評価スコープ**:

取り込んだ断片は、取り込み先要素の**通常の子要素と同じ**スコープ解決になります。断片の中の `{{式}}`・`data-if`・`data-attr-*` などは、取り込み先要素自身とその祖先の `data-bind`（`data-each` の行の中なら行スコープも）を参照できます。「共通マークアップ＋画面ごとの差分」を 1 ファイルへ集約する書き方ができます。

```html
<!-- 断片（components/step-indicator.html） -->
<p>現在のステップ: {{currentStep}} / {{totalSteps}}</p>
<p data-if="currentStep === 2">ステップ 2 の説明</p>

<!-- 取り込み側。取り込み先要素自身の data-bind も参照できる -->
<div data-bind='{"currentStep":2,"totalSteps":4}'
     data-import="components/step-indicator.html"></div>
```

- 断片の中で `data-bind` や `data-fetch` を宣言した場合は、そこから下だけのスコープになります（通常の要素と同じです）。
- 断片が参照するキーを取り込み側が持っていない場合は[未解決参照](#未解決参照の診断)になります（空表示。エラーにはなりません）。

**読み込み中の属性**:

読み込みが進行中の間、対象要素に `data-importing` 属性が付与されます。読み込み完了（成功・失敗いずれも）後に除去されます。これを利用して、読み込み中のレイアウト崩れを防ぐことができます。

```css
/* 読み込み完了まで非表示にする */
[data-importing] {
  visibility: hidden;
}
```

**未解決参照と再評価**:
- プレースホルダ単体では、評価結果が空でない文字列のときだけ読み込みを実行します。`false`、`null`、`undefined`、空文字、未解決参照は未実行とします。
- 文字列埋め込みでは、`data-import` の評価に未解決参照が 1 つでも含まれる場合、その評価サイクルでは読み込みを実行しません。
- bind 更新後は `data-import` を専用ルートで再評価します。
- 再実行判定は評価後 URL の比較で行います。
- 評価後 URL が前回と同じ場合は再読み込みしません。
- 前回が未解決参照により未実行で、後続の bind 更新で URL が確定した場合は、その時点で初回読み込みを実行します。

#### 認証ガード（`data-unauthorized-redirect` / `data-forbidden-redirect`）

Haori の fetch 応答が認証エラーのとき、指定 URL へ遷移するグローバル設定です。`<body>` または `<html>`（`<body>` 優先）に宣言します。

- `data-unauthorized-redirect="URL"`: **401 Unauthorized** 応答時の遷移先。
- `data-forbidden-redirect="URL"`: **403 Forbidden** 応答時の遷移先。

```html
<body data-unauthorized-redirect="/login.html">
```

- **全 fetch 経路**に適用します（イベント発火の fetch・宣言的 `data-fetch`・`data-import`）。
- 属性値は `{{...}}` 式で記述できます（例 `data-unauthorized-redirect="{{loginUrl}}"`）。
- **ステータス別オプトイン**: 属性を宣言したステータスでのみ遷移します。401 と 403 は意味が異なる（403 は「認証済みだが権限なし」のことがある）ため、必要なものだけ宣言します。
- 現在ページ自身への遷移は無限ループ防止のため行いません（判定は後述の戻り先クエリ付与後の最終 URL に対して行います）。
- アクションは遷移（redirect）のみで、`data-unauthorized-fetch` のような他の手続きはサポートしません（これらはイベントファミリーではなく専用属性です）。

##### 戻り先クエリの自動付与（`*-return-param`）

ログイン後に元のページへ復帰させるため、遷移直前に「現在の遷移元 URL」を遷移先へクエリとして自動付与できます。ステータス別のオプトイン属性で、遷移先 URL を宣言したのと同じ要素（`<body>`／`<html>`、`<body>` 優先）から読み取ります。

- `data-unauthorized-redirect-return-param="クエリ名"`: 401 遷移先へ付与。
- `data-forbidden-redirect-return-param="クエリ名"`: 403 遷移先へ付与。

```html
<body data-unauthorized-redirect="/login.html"
      data-unauthorized-redirect-return-param="href">
<!-- 401 時: /login.html?href=%2Fapp%2Fpage.html%3Fa%3D1%23sec へ遷移 -->
```

- 付与する値は現在ページの **`pathname + search + hash`** で、`encodeURIComponent` によりパーセントエンコードされます（半角空白は `%20`）。宣言された遷移先 URL の形式（相対／絶対）は保持し、フラグメント（`#...`）があればその手前へクエリを挿入します。
- 遷移先 URL に**既存のクエリがあれば保持**してマージします。ただし**同名クエリが既にある場合は宣言された遷移先 URL 側を優先**し、自動付与は行いません。
- 属性が無い、または値が空の場合は付与しません（純粋なオプトイン）。
- **オープンリダイレクト対策**: 本機能が付与する戻り先値は常に現在ページの `pathname + search + hash`（スキーム・ホストを含まない同一オリジン相対）であり、外部 URL を埋め込むことはありません。遷移先（ログインページ等）でこの戻り先クエリを使って復帰遷移する受け手側は、`data-{event}-redirect-return-param`（[`data-{event}-redirect-return-param`](#data-event-redirect-return-param) 参照）を用いれば、安全な同一オリジンのローカルパスのみへ遷移する検証込みで宣言的に実現できます（手書き JS でのオープンリダイレクト検証は不要）。`*-return-param`（送り手）と同名のクエリを使えば、付与 → 消費が対称になります。

---

### URLパラメータ

#### `data-url-param`

URLクエリパラメータをバインディングデータに設定します。

同一要素に `data-fetch`、`data-import`、通常属性、テキストノード評価が共存する場合でも、`data-url-param` はそれらより先に反映される前提とします。

**構文**:
```html
data-url-param
data-url-arg="argName"  <!-- オプション: ネストするキー名 -->
```

**例**:

```html
<!-- URL: /page?name=Taro&age=25 -->

<!-- 直接バインド -->
<div data-url-param>
  <p>名前: {{name}}</p>
  <p>年齢: {{age}}</p>
</div>

<!-- キー名を指定してネスト -->
<div data-url-param data-url-arg="params">
  <p>名前: {{params.name}}</p>
  <p>年齢: {{params.age}}</p>
</div>
```

**`data-url-arg` の有無による違い（重要）**:

| 指定 | バインディングデータへの反映 |
| ---- | ---------------------------- |
| `data-url-arg` なし | クエリパラメータで**全置換**する |
| `data-url-arg="キー名"` | 既存のバインディングデータへ、そのキー配下として**マージ**する |

`data-url-arg` を省略すると全置換になるため、**同一要素の `data-bind` で宣言した既定値は消えます**。既定値と併用する場合は `data-url-arg` を指定してください。

```html
<!-- NG: data-bind の defaultKey が data-url-param の全置換で消える -->
<div data-url-param data-bind='{"defaultKey":"DEF"}'>
  <p>{{defaultKey}}</p>  <!-- 空になる -->
</div>

<!-- OK: data-url-arg 配下へマージされるため既定値が保持される -->
<div data-url-param data-url-arg="params" data-bind='{"defaultKey":"DEF"}'>
  <p>{{defaultKey}}</p>      <!-- DEF -->
  <p>{{params.name}}</p>
</div>
```

**未定義キーの参照**:

クエリに含まれないパラメータを `{{name}}` のようにトップレベル識別子として直接参照した場合は[未解決参照](#未解決参照の診断)となり、値は `undefined`、表示は空になります。コンソールエラーにはなりません。

`data-url-arg` を指定してプロパティ参照（`{{params.name}}`）にすると、キーの出所がクエリであることがマークアップ上で明確になります。クエリの有無が不定なパラメータを扱う場合は `data-url-arg` の使用を推奨します。

なお、バインドに無い識別子が[グローバルへ解決されることはありません](#バインドに無い識別子の扱い)。`{{name}}` が `window.name` になったり、`{{agencyCode}}` が `id="agencyCode"` の要素になったりはせず、常に未解決参照として扱われます。

---

### ブラウザストレージ

#### `data-store`

バインディングデータの指定キーを、ブラウザストレージのレコードと双方向にミラーします。画面をまたいで入力状態を持ち回るウィザードなどを、`<script>` を書かずに宣言できます。

**構文**:
```html
data-store="storageKey"          <!-- ストレージキー（レコードの名前）。式は使用できない -->
data-store-params="a&b"          <!-- 対象トップレベルキー（& 区切り） -->
data-store-arg="argName"         <!-- レコード内のネストキー -->
data-store-type="session|local"  <!-- ストレージ種別。既定は session -->
```

`data-store-params` と `data-store-arg` は**どちらか一方が必須**です。両方を省略した場合は警告ログを出して無効になります（意図しないキーの保存を防ぐため）。

**例**:

```html
<!-- 1画面目: 契約者フォームの入力状態を customer キーへ退避する -->
<form data-store="apply" data-store-arg="customer">
  <input name="name">
  <input name="zip">
</form>

<!-- 2画面目: 退避した内容を初期表示に使い、配列は data-each で描画する -->
<div data-bind='{"customer":{},"contracts":[]}'
  data-store="apply" data-store-params="customer&contracts">
  <p>{{customer.name}}</p>
  <div data-each="contracts"><span>{{no}}</span></div>
</div>
```

**レコードの構造**:

1 つのストレージキーに 1 つの JSON オブジェクト（レコード）を保存します。書き込みは宣言したキーだけを置換し、レコード内の他のキーは保持します。そのため画面ごと・要素ごとに担当キーだけを宣言でき、他の画面が保存した値は壊れません。

| 宣言 | レコードの形 |
| ---- | ------------ |
| `data-store-params="customer"` | `{"customer": ...}` |
| `data-store-arg="customer"` | `{"customer": {要素のバインディングデータ全体}}` |
| `data-store-arg="step2"` + `data-store-params="contracts"` | `{"step2": {"contracts": ...}}` |

`data-store-arg` を単独で指定した場合は、その要素のバインディングデータの**全キー**（予約キーを除く）が対象になります。収集値だけを持つ `<form>` 向けの用法で、作業用のデータを `data-bind` で持つ要素では `data-store-params` を併用してください。

**復元（ストレージ → バインディングデータ）**:

- 優先属性として `data-bind` の直後に処理されるため、復元値は `data-if` の条件・`data-each` の配列・入力欄の初期値として機能します（初期 `data-bind` と同じ扱いです）。
- キー単位の差し替えで、深いマージは行いません。レコードに無いキーは `data-bind` で宣言した既定値をそのまま保ちます。
- 復元は**その要素を初めてスキャンしたとき**だけです。`data-if` の表示切替などで再評価されても繰り返しません（利用者の編集を初期値へ巻き戻さないため）。
- `<form>` に宣言した場合は、[初期 `data-bind` からの入力欄復元](#初期-data-bind-からの入力欄復元)と同じ経路で入力欄へ反映されます。`<select>` の選択状態やチェック状態も含みます。
- 復元対象が 1 つも無い場合はバインディングデータを作りません（不要なシャドーイングを増やさないためです）。

**保存（バインディングデータ → ストレージ）**:

- 対象キーの値が変わったときに自動で書き出します（明示的な保存指定は不要です）。フォームの双方向コミット・`data-{event}-bind`・`data-fetch` の応答反映はいずれも同じ導線を通るため、**フェッチ応答の一部の退避**も宣言だけで行えます。
- 書き出しはバインディングデータの確定と**同期**で行います。`requestAnimationFrame` を待たないため、`data-{event}-redirect` による遷移の直前や背面タブでも取りこぼしません。
- 直前に書き出した内容と同じ場合は書き込みません。
- 宣言したキーがその要素のバインディングデータに**存在しない**場合、レコードは変更しません。削除は `data-{event}-store-clear` だけが行います。
- `_fetch` / `_poll` などの予約キー（先頭が `_`）は常に対象外です。
- 復元より前には書き出しません（`data-bind` の既定値で保存済みの値を潰さないためです）。

**対象は宣言した要素自身のバインディングデータです（重要）**:

フォームの双方向コミットは**フォーム要素自身**のバインディングデータへ書き込みます。そのため、入力状態を保存する場合は `<form>` に `data-store` を宣言します。祖先要素に宣言しても入力値は保存されません。

```html
<!-- OK: フォーム自身に宣言する -->
<form data-store="apply" data-store-arg="customer">
  <input name="name">
</form>

<!-- OK: data-form-arg のキーと同名を指定する -->
<div data-bind='{"customer":{}}'>
  <form data-form-arg="customer" data-store="apply" data-store-params="customer">
    <input name="name">
  </form>
</div>

<!-- NG: 祖先に宣言しても入力値は保存されない（表示のみの用途になる） -->
<div data-bind='{"customer":{}}' data-store="apply" data-store-params="customer">
  <form><input name="name"></form>
</div>
```

**制約**:

- `data-each` の行の内側では使用できません（同一のレコードへ全行が書き込むため）。警告ログを出して無効になります。行データは親要素側で配列キーを指定して保存します。
- `input[type=file]` の内容は復元できません。バインディングデータにはファイル名だけが入るため（[`input[type=file]` の値収集](#inputtypefile-の値収集)）、添付は画面をまたぐと再選択が必要です。
- 属性値に式（`{{}}`）は使用できません。`{{` を含む場合は警告ログを出して無効になります。
- 他のタブとの同期（`storage` イベントの追従）は行いません。
- 同一のストレージキーで同一のキーを複数の要素が宣言した場合、後から書き込んだ内容が残ります（競合の検出は行いません）。
- ストレージが無効な環境、容量超過、保存済み JSON の破損、オブジェクトでないレコードは、警告ログを出して継続します（画面は壊しません）。
- `allow-same-origin` の無い `sandbox` iframe や、サイトデータをブロックした状態のクロスサイト iframe では、`localStorage` / `sessionStorage` は**参照しただけで** `SecurityError` になります。この場合は種別ごとに一度だけ警告を出し、保存・復元を行いません。`data-store` 以外の機能（式の評価を含む）は通常どおり動作します。

**`data-url-param` との併用**:

処理順は `data-bind`（既定値）→ `data-store` → `data-url-param` で、URL クエリが最優先です。`data-url-arg` を省略した `data-url-param` は要素のバインディングデータを**全置換**するため、復元値も消えます。併用する場合は `data-url-arg` を指定してください（省略時は警告ログを出します）。

**セキュリティ**:

- 既定の `session` はタブを閉じると消えます。個人情報を含む状態では `local` を避け、破棄の導線（`data-{event}-store-clear`）を必ず宣言してください。
- ストレージは同一オリジンの他のスクリプトから読み取れます。保存対象は `data-store-params` / `data-store-arg` で必要な範囲に限定してください。

---

### フォーム属性

#### `name`

フォーム値のキー名を指定します。

```html
<input name="username">
```

#### `data-form-object`

子要素をオブジェクトとしてネストします。

```html
<div data-form-object="address">
  <input name="city" value="Tokyo">
  <input name="zip" value="100-0001">
</div>
<!-- { address: { city: "Tokyo", zip: "100-0001" } } -->
```

#### `data-form-list`

子要素を配列としてネストします。入力要素に付与した場合は値の配列になります。

```html
<!-- 値の配列 -->
<input name="tags" value="js" data-form-list>
<input name="tags" value="ts" data-form-list>
<!-- { tags: ["js", "ts"] } -->

<!-- オブジェクトの配列 -->
<div data-form-list="items">
  <div><input name="name" value="Item1"></div>
  <div><input name="name" value="Item2"></div>
</div>
<!-- { items: [{ name: "Item1" }, { name: "Item2" }] } -->
```

行が 0 件の場合も**キーは空配列として出力されます**（`{ items: [] }`）。キーを落とすと、サーバ側で「0 件」と「そのフィールドが未送信」を区別できず、全件削除を表現できないためです。

入力要素へ付ける場合、キーは `name` が決めるため**属性値は省略できます**（`data-form-list` / `data-form-list="tags"` のどちらでも同じ）。値の配列を入力欄へ書き戻すときは、**同じ収集キーの出現順**に配列の要素を配ります。出現順は収集時の並びと同じなので、収集 → 書き戻しで値の対応が保たれます。要素数より入力欄が多い場合、余りの入力欄は空になります。出現順は `values` が切り替わる単位（`data-form-object` の中、`data-form-list` の行ごと）で数え直します。

チェックボックスグループと複数選択 `<select>` は例外で、`data-form-list` を併記していても配列そのものを選択状態として解釈します（位置で配ると選択状態を決められないため）。

##### 同名チェックボックス・ラジオの収集値の形

同名のチェックボックス・ラジオ（`value="true"` / `value="false"` の真偽値チェックボックスを除く）は、チェック済みの送信値だけを集めます。集約結果の形は宣言で決まります。

| 宣言 | チェック 0 個 | 1 個 | 2 個以上 |
| --- | --- | --- | --- |
| `name` のみ | `null` | スカラー（`"a"`） | 配列（`["a","c"]`） |
| `name` ＋ `data-form-list` | `[]` | 配列（`["a"]`） | 配列（`["a","c"]`） |

**サーバ側の型を選択数によらず配列へ固定したい場合は `data-form-list` を併記します。** 併記時、未チェックの欄は詰めて出力し、位置合わせのための `null` は入れません（選択状態は位置ではなく集合で決まるため、同じ収集キーの出現順に配る規則の対象外です）。真偽値チェックボックスは単一の真偽値なので、この規則の対象外です。

#### `data-form-name`

値収集のキーを宣言します。`name` 属性の代わりに、または `name` と併記して使います。収集・逆方向同期・サーバのエラー応答の振り分けのすべてで、`data-form-name` があればそちらを収集キーとし、無ければ `name` を使います。

```html
<input data-form-name="code" value="abc">
<!-- { code: "abc" }（DOM の name は無くても収集される） -->

<input name="codeDom" data-form-name="code" value="abc">
<!-- { code: "abc" }（DOM の name は収集キーに影響しない） -->
```

**主な用途は、`data-form-list` の行内のラジオボタンです。** HTML のラジオグループは「同じフォームオーナー内の同名要素」で構成されるため、行内で同じ `name` を使うと**行をまたいで排他**になり、1 行しか選択を保持できません（利用者が別の行を選ぶと前の行の選択が外れ、初期 `data-bind` からの復元も最後の 1 行しか反映されません）。

`data-form-name` を指定して `name` を書かなかったラジオボタンには、**DOM の `name` を行ごとにユニークな値へ自動生成**します。これによりグループが行単位に分かれ、行ごとに独立して選択できます。

```html
<!-- 行ごとに独立して選ぶ -->
<div data-each="rows" data-form-list="rows" data-each-arg="r">
  <div>
    <input name="title">
    <input type="radio" data-form-name="plan" value="p1">
    <input type="radio" data-form-name="plan" value="p2">
  </div>
</div>
<!-- { rows: [{ title: "A", plan: "p1" }, { title: "B", plan: "p2" }] } -->
```

- 生成する `name` は同じ行の同じ収集キーで同一、行をまたぐと別の値になります。値の形式は内部仕様のため依存しないでください。
- 生成対象は `input[type="radio"]` だけです。ほかの入力では DOM の `name` に意味がないため生成しません。
- **`name` を書いた場合は尊重し、生成しません。** 行をまたぐ 1 グループになるため、「複数行の中から 1 行を選ぶ」構成（代表行の選択など）はこちらで表現します。選択されていない行の値は `null` になります。
- スコープは最近傍の `data-form-list` コンテナ直下の要素（= 行）です。`data-form-object` などを間に挟んでも行が単位になります。行の外では最近傍のフォーム（`<form>` または `data-form`）単位となり、通常の HTML と同じ排他になります。
  - `data-form-list` コンテナの直下がラジオボタン自身の場合（1 行 1 ラジオ）は、そのラジオが行になるため 1 つずつ別グループになります。複数行から 1 つを選ぶ構成では `name` を使ってください。
- 収集キーが空になる指定（`data-form-name=""`、評価結果が空文字・`false`・`null`、未解決参照）は、`name` があればそちらへフォールバックし、無ければ**その入力は値収集の対象外**になります。原因が追いにくいため、開発モードでは警告を出します（テンプレート式がまだ解決していない初回評価でも警告が出ます）。
- `data-attr-name` で DOM の `name` を行ごとに変える方法では**値が収集されません**（収集キーは属性マップの `name` を見るため）。収集キーを変えたい場合は `data-form-name` を使ってください。

#### `data-form-detach`

バインディングから除外します。

```html
<input name="password" data-form-detach>
<!-- getValues() で取得されない -->
```

**除外は両方向です。** 収集されないため、その `name` はバインドデータにも送信ボディにも載りません。逆に、バインドデータからの**書き戻し（逆方向同期）も受けません**。画面だけで使う値（送信しないパスワード欄、確認用の再入力欄など）を宣言だけで切り離すための属性です。

**属性値は取りません。** `data-form-detach` と書くだけで有効です（`data-form-detach="true"` のように値を書いても同じ扱いです）。

**入力欄でもコンテナでも宣言できます。** 入力欄以外の要素へ付けた場合は、**その配下すべて**が収集と書き戻しの対象から外れます。確認用の再入力欄をまとめて切り離す場合などに、1 箇所の宣言で済みます。`data-form-object` / `data-form-list` を併記した要素へ付けた場合は、そのキー自体が収集値に現れません。

```html
<form>
  <input name="username">
  <div data-form-detach>
    <!-- 配下は収集されず、書き戻しも受けない -->
    <input name="password">
    <input name="passwordConfirm">
  </div>
</form>
<!-- getValues() の結果: { username: "..." } -->
```

#### `data-form-arg`

フォーム値をバインドするキー名を指定します。

```html
<form data-form-arg="formData">
  <input name="username">
</form>
<!-- バインディングデータ: { formData: { username: "..." } } -->
```

指定したキーは、`change` / `input` による双方向バインディングのコミット先にもなります。フォーム自身のバインドデータは `{ formData: {...} }` の形で更新され、フォーム内の式が同じキーを参照できます（`data-form-arg` を指定しない場合は平坦なキーで更新します）。`data-{event}-data` で追加したキーもコミット時は同じキー配下へ入ります（送信ペイロードの構造とは別で、こちらは入力欄と対応するスコープを揃えるための扱いです）。

コミットで更新するのは**フォーム自身の**バインドデータだけです。祖先から継承したキーはコピーされません。コピーすると、以降その祖先を更新してもフォーム自身の古いコピーにシャドーされて届かなくなるためです。

指定したキーを**祖先の `data-bind` が持っている**場合は、その値が入力欄へ反映されます（初期表示時と、祖先で値が変わったとき）。祖先がレコードを所有し、フォームがそのキーを編集する構成が書けます。この場合のコミットは祖先の値を土台に収集値を重ねるため、入力欄に対応しないフィールド（`id` など）も保たれます。詳細は「[祖先が所有するレコードの反映（`data-form-arg`）](#祖先が所有するレコードの反映data-form-arg)」を参照してください。

#### `data-value-type`

入力欄の**収集値の型**を宣言します。宣言した型へ正規化した値が、内部値・収集値・バインドデータ・送信ボディに現れます。

```html
<div data-bind='{"agree":true,"count":12}'>
  <form>
    <!-- 送信ボディ: {"agree": true, "count": 12} -->
    <input type="hidden" name="agree" data-value-type="boolean"
           data-attr-value="{{agree}}">
    <input type="hidden" name="count" data-value-type="number"
           data-attr-value="{{count}}">
  </form>
</div>
```

利用者に見せない項目（別の画面から引き継いだ真偽値など）を hidden へ載せる場合、`input.value` は常に文字列のため、API が真偽値・数値を期待していても文字列で送られます。この属性は、その入力欄だけ収集の型を宣言して食い違いを解消します。真偽値を「表示しないチェックボックス」で代用する必要はありません。

**宣言できる型**:

| 値 | 収集値 |
| --- | --- |
| `boolean` | `true` / `false`（判定できない場合は `null`） |
| `number` | 数値（判定できない場合は `null`） |
| `string` | 文字列（数値・真偽値をバインドしても文字列へそろえます） |

- `boolean` は `"true"` / `"false"` を大文字小文字の区別なく判定します。**空文字と値なしは `null`** です（未入力を `false` として送らないため）。それ以外の文字列（`"1"` / `"on"` / `"はい"` など）も `null` です。判定を緩めると、画面に出ていない値が送信されます（[収集は DOM を真とする](#収集は-dom-を真とする)）。真偽値がそのまま渡された場合はその値を使います。
- `number` の規則は `type="number"` と同じです（[収集は DOM を真とする](#収集は-dom-を真とする)の表を参照）。ブラウザが `<input type="number">` の値として受け付ける形だけを数値とし、空文字・受け付けない文字列・有限でない数値は `null` になります。
- 上記以外の値（`"bool"` / `"int"` など）を書いた場合は**宣言が無いものとして扱い**、開発モードで警告します。

**値は従来どおり DOM から読みます。** 正規化するのは読み取った後で、DOM の値を読むすべての経路（`change` での取り込み、収集、バインドから内部値への反映、`value="{{式}}"` / `data-attr-value` の評価）で同じ規則が適用されます。`type="number"` と同じ扱いです（原則「[収集は DOM を真とする](#収集は-dom-を真とする)」）。

**`boolean` を宣言した入力欄では、`false` も値として書きます。** `data-attr-value` / `value="{{式}}"` は評価結果が `false` のとき通常は属性を削除しますが（[`data-attr-*`](#data-attr-)）、この宣言がある入力欄では `"false"` を書きます。`false` は「値が無い」ではなく送信すべき値だからです。`null` / `undefined` / 未解決参照は従来どおり空になり、収集値は `null` です。

**対象は値を持つ入力です。** `<input>`（`checkbox` / `radio` / `file` を除く）、`<textarea>`、単一選択の `<select>` で有効です。それ以外（`checkbox` / `radio` / `file` / `<select multiple>`）へ宣言した場合は**無視し**、開発モードで警告します。チェック状態は `value="true"` の boolean モードで真偽値になります（[値の取得構造](#値の取得構造)）。

**`type` より宣言が優先されます。** `type="number"` に `data-value-type="string"` を宣言した場合は文字列で収集します。

**宣言しない限り従来どおりです。** 既存の入力欄の収集値は変わりません。

```html
<!-- 選択肢の値を数値で収集する -->
<select name="planId" data-value-type="number">
  <option value="1">A</option>
  <option value="2">B</option>
</select>
```

#### `data-message` / `data-message-level`

メッセージの文字列を保持します。フェッチエラー時に自動設定されます。
`data-message-level` でメッセージのレベルを表します（CSS でのスタイリングに使用）。

ライブラリが行うのは属性の付け外しだけで、**表示はページの CSS が担います**（属性セレクタと `attr()` で組み立てます）。スクリプトからの付け外しは `Haori.addMessage()` / `Haori.addErrorMessage()` / `Haori.clearMessages()` です。入力要素を渡した場合は**その親要素**へ付きます（フォーム要素を渡した場合はその要素自身）。

```css
[data-message]::after { content: attr(data-message); display: block; }
[data-message-level="error"]::after { color: #c62828; }
```

```html
<input name="email">
<!-- エラー時に親要素に自動設定: -->
<div data-message="メールアドレスが不正です" data-message-level="error">
  <input name="email">
</div>
```

---

### イベント属性

イベント属性は `data-{event}-*` の形式で指定します。`{event}` には以下が使用できます:

- `click`: クリック時
- `change`: 変更時（フォーカスを外した・選択を確定した等）
- `input`: 逐次入力時（テキスト入力1文字ごと）
- `load`: ロード時
- `on`: 任意（カスタム）イベント時（`data-on` でイベント名を指定）

**`load` は `data-if` による表示でも発火します。** `data-load-*` を宣言した要素が `data-if` で**非表示から表示へ遷移した**時点で、`load` の手続きを 1 回実行します。ボタンや `<div>` のようにネイティブの `load` が起きない要素でも、条件で出し入れするパネルやタブを**開いたときの**取得や既定値の設定を宣言だけで書けます。

- 発火は**遷移のたびに 1 回**です。表示のままの再評価では発火しません（毎回の再評価で発火させると、取得を繰り返して止まらなくなります）。いったん非表示へ戻って再び表示された場合は、改めて 1 回発火します。
- **初期表示は遷移に当たりません。** 最初の描画で表示された要素（条件が最初から真の要素、`data-if` を宣言していない要素）では発火しません。**読み込み時に取得したい場合は `data-fetch` を宣言してください。** ページの読み込みで走る `data-load-*` は、`<html>` へ宣言したもの（`window` の `load`）と、`<img>` などネイティブの `load` イベントを発火する要素**自身**へ宣言したものだけです。
- 表示処理は手続きの完了を**待ちません**。表示が手続きの応答でブロックされないようにするためで、`haori:show` は手続きの結果と無関係に発火します。

`input` は逐次（1文字ごと）に発火するため、**手続きを実行するのは `data-input-*` を明示した要素のみ**です（オプトイン）。`change` と同様に、`data-input-form` の指定がなくても自動的に先祖フォームを検出して入力値を双方向バインディングへ反映します。検索欄の逐次絞り込みなどに利用できます。

**このオプトインが決めるのは手続きを起動するかどうかだけです。** `data-input-*` を宣言していない入力欄でも、打鍵は「利用者の編集」として記録します（編集の通し番号を発番します。下記「ユーザー編集と宣言バインドの権威」を参照）。記録しないと、`change` が発火する前の打鍵が編集として扱われず、反映待ちの書き込みが打った文字を消します。記録するのは通し番号だけで、**内部値は同期しません**（内部値を DOM から取り込むのは、値がバインドデータへ載る契機と同じ時点に限ります。[収集は DOM を真とする](#収集は-dom-を真とする)を参照）。

```html
<!-- 入力1文字ごとに q をバインドへ反映し、一覧を逐次絞り込む -->
<form data-bind='{"q":""}'>
  <input name="q" data-input-form>
</form>
```

#### カスタムイベント `data-on`

`data-on="イベント名"` を指定すると、`window` または `document` へ dispatch された**任意のカスタムイベント**を契機に `data-on-*`（`data-on-run` / `data-on-fetch` / `data-on-bind` …）の手続きを実行します。アクション語彙は `data-{event}-*` と共通です。

- **イベント名は属性値で指定**します（属性名は小文字化されるため、`appReady` のような大文字小文字を含む名前を属性名へ埋め込めないため）。
- `window` のキャプチャ購読1本で、`window` / `document` いずれへ dispatch されたイベントも**二重発火なく**一度だけ受け取ります。
- `data-import` 等で後から挿入された `data-on` 要素も購読対象に追加されます。
- **カスタムイベント専用**です。`click` / `change` / `input` / `load` を `data-on` に指定すると警告ログを出し、購読しません（組み込みイベントは `data-{event}-*` を使用）。
- 注意: Haori が購読を開始する前に発火したイベントは受け取れません（過去のイベントは再生されません）。準備完了通知などは、Haori 初期化後に発火する設計にしてください。

```html
<!-- ネイティブ橋の準備完了で初期化フェッチを実行 -->
<body data-on="appReady"
  data-on-fetch="/api/init.json" data-on-bind="#app"></body>
```

#### セレクタを値に取る属性の解決

バインド先やコピー先を CSS セレクタで指定する属性は、**テンプレート式（`{{}}`）を評価した結果**をセレクタとして扱います。評価は手続きの実行時に、その要素のバインディングデータで行われます。これにより `data-each` の行の中から「その行の要素」を対象にできます（行ごとに一意な `id` を組み立てる）。

対象の属性:

| 分類 | 属性 |
| ---- | ---- |
| バインド | `data-{event}-bind` / `data-fetch-bind` / `data-{event}-fetch-state` / `data-fetch-state` |
| フォーム | `data-{event}-form` / `data-fetch-form` / `data-{event}-history-form` |
| 要素操作 | `data-{event}-copy` / `data-{event}-copy-source` / `data-{event}-reset` / `data-{event}-reset-before` / `data-{event}-refetch` / `data-{event}-click` / `data-{event}-open` / `data-{event}-close` / `data-{event}-adjust` / `data-{event}-scroll` |
| 行操作 | `data-{event}-row-add` / `data-{event}-row-remove` / `data-{event}-row-prev` / `data-{event}-row-next` |
| トリガー | `data-intersect-root` / `data-each-visible-root` / `data-poll-state` |

```html
<!-- 行ごとのバインド先・コピー先を指定する -->
<div data-each="rows" data-each-index="i">
  <div>
    <select name="area"
      data-change-fetch="/api/plans.json"
      data-change-bind="#plan-scope-{{i}}"
      data-change-bind-arg="plans">
      <option value="">未選択</option>
    </select>
    <div id="plan-scope-{{i}}">{{plans.name}}</div>

    <!-- 契約者住所をこの行の住所欄へ複写する -->
    <form id="addr-{{i}}">
      <input name="zip">
      <input name="city">
    </form>
    <button
      data-click-copy="#addr-{{i}}"
      data-click-copy-source="#owner"
      data-click-copy-params="zip&city">契約者住所と同じ</button>
  </div>
</div>
```

**解決できない場合の扱い**:

- CSS セレクタとして**不正**な値は、`Log.error` でログ出力してその属性をスキップします。例外にしないため、同じ手続きの後続のアクションは実行されます。
- 単体プレースホルダが[未解決参照](#未解決参照の診断)になった場合は、**値の指定が無い**ものとして扱います（通常属性の未解決参照を属性削除として扱う規則に合わせます）。値を省略したときの既定動作（`data-{event}-form` なら先祖のフォーム、`data-{event}-close` なら最も近い `<dialog>` など）になります。
- 文字列埋め込みの一部が未解決参照の場合は、その部分が空文字として連結されます（`#plan-` のように一致しないセレクタになり、従来どおり「要素が見つからない」ログになります）。
- セレクタに一致する要素が無い場合は従来どおり `Log.error` でログ出力してスキップします。

**注意**: `data-{event}-bind-arg` / `-bind-params` / `-copy-params` のようなキー名を並べる属性は評価の対象外です（セレクタ属性のみが対象）。

上の例のように行の中へ `<form>` を置ける構成では、コピー先のフォームの入力欄へ直接同期されます。`data-form-list` を持つ外側の `<form>` が必要な構成では入れ子の `<form>` が置けないため、行要素自身をセレクタで指してください（[編集可能な行への書き込み](#編集可能な行への書き込み)）。

#### 処理順序

イベント属性は以下の順序で実行されます:

1. `data-{event}-validate`: バリデーション実行（`data-validity` の同期評価を含む）
2. `data-{event}-if`: 手続きの実行条件の判定（偽なら以降を実行しない）
3. `data-{event}-confirm`: 確認ダイアログ表示
4. `data-{event}-reset-before`: 送信前のリセット処理実行
5. `data-{event}-data` / `data-{event}-form`: データ取得
6. `data-{event}-before-run`: フェッチ前スクリプト実行
7. `data-{event}-fetch`: HTTP通信実行
8. `data-{event}-after-run`: フェッチ後スクリプト実行
9. `data-{event}-bind`: データバインド実行
10. `data-{event}-adjust`: 値調整実行
11. `data-{event}-row-add` / `data-{event}-row-remove`（`data-{event}-row-remove-empty`）/ `data-{event}-row-prev` / `data-{event}-row-next`: 行データの変更
12. `data-{event}-reset`: リセット処理実行
13. `data-{event}-copy` / `data-{event}-copy-params`: 別要素へバインディング値をコピー
14. `data-{event}-refetch`: 再フェッチ実行
15. `data-{event}-click`: クリック実行
16. `data-{event}-open` / `data-{event}-close`: ダイアログ操作
17. `data-{event}-dialog` / `data-{event}-toast`: メッセージ表示
18. `data-{event}-store-clear`: ストレージレコードの破棄
19. `data-{event}-history`: 履歴 pushState 実行
20. `data-{event}-redirect` / `data-{event}-redirect-replace`: リダイレクト実行（後者は履歴を置き換える）

17 以降（および 19 の後のスクロール）の属性値は、手続きの開始時ではなく**使用する直前**に評価します（[バインド後に実行するアクションの評価タイミング](#バインド後に実行するアクションの評価タイミング)）。

なお `data-{event}-run`（フェッチを伴わない任意 JS 実行）は、`event.preventDefault()` を有効にするため、上記 3（confirm）より前の**同期タイミング**で実行されます。ただし 2（`data-{event}-if`）より後なので、条件が偽のときは `run` も実行されません。`data-{event}-fetch` と併用した場合は run → fetch の順になります。

また `data-{event}-prevent` は上記の手続き順序とは独立に、イベントの委譲（`EventDispatcher.delegate`）の**最初の同期段**で `event.preventDefault()` を呼びます。手続き本体（fetch 等）の成否や `await` に依存せずネイティブのデフォルト動作を抑止するためで、`data-{event}-defer` で手続きを遅延させても抑止は確実に効きます。

#### バインド後に実行するアクションの評価タイミング

処理順 9（`data-{event}-bind`）より後で実行するアクションの属性値は、**そのアクションを実行する直前**に、その時点のバインディングデータで評価します。手続きの開始時に評価した文字列を使うと、応答をバインドしても遷移先やメッセージへ反映できないためです。

対象は次の属性です。

| 属性 | 処理順 | 評価する時点 |
|---|---|---|
| `data-{event}-dialog` / `data-{event}-toast` | 17 | 表示直前 |
| `data-{event}-history` | 19 | `history.pushState()` 直前 |
| `data-{event}-scroll` | 19 の後 | スクロール直前 |
| `data-{event}-redirect` / `data-{event}-redirect-replace` / `data-{event}-redirect-return-param` | 20 | 遷移直前 |

**評価スコープ**: 属性を宣言した要素のバインディングデータ（祖先からの継承を含む）です。`data-each` の行の中にある要素は行スコープで評価されます。応答を参照するには、`data-{event}-bind` の対象を**その要素自身または祖先**にしてください。兄弟要素などへバインドした応答は評価スコープに入らないため参照できません。

```html
<!-- 応答の nextAction で遷移先を切り替える -->
<div id="state">
  <button
    data-click-fetch="/api/apply"
    data-click-bind="#state"
    data-click-redirect="{{nextAction === 'pay' ? redirectUrl : '/complete.html'}}"
    data-click-toast="受付番号 {{no}} で受け付けました"
  >申込を確定する</button>
</div>
```

**未解決参照の扱い**: 手続きをブロックする目的の宣言ではないため、開始時と使用直前の評価結果を次のように組み合わせます。

| 手続き開始時 | 使用直前 | 採用する値 |
|---|---|---|
| 未解決 | 解決 | 使用直前の値（応答で決まる遷移先やメッセージ） |
| 解決 | 解決 | 使用直前の値（応答に同名のキーがあれば値が変わります） |
| 解決 | 未解決 | **開始時の値**（開発モードで警告します） |
| 未解決 | 未解決 | 指定が無いものとして扱う（遷移や表示を行いません） |

3 行目は、`data-{event}-bind` の全置換で参照していたキーが消える構成の保護です。使用直前の評価結果（空）をそのまま採ると、遷移や表示そのものが静かに止まります。

**対象外**:

- `data-{event}-confirm` / `-fetch` / `-data` / `-form` など、バインドより前に使う属性は従来どおり手続きの開始時に評価します。
- `data-{event}-store-clear` / `-store-clear-type` / `-toast-level` は式を使えない生値です。
- `data-{event}-scroll-error` は検証失敗時（前段）に使うため対象外です。
- `data-{event}-history-data` / `-history-form` は従来どおり実行時に解決し、`data-{event}-reset-before` を指定した場合はそのリセット直後のスナップショットを使います。

**注意**:

- 反映されるのは、その手続き自身が完了させた更新です。`data-{event}-refetch` / `-click` が起動した**別の手続き**の完了は待たないため、その結果が反映されるとは限りません。
- `data-store` のミラーはバインディングデータの確定と同期で行うため、遷移の前に必ず完了しています。破棄と遷移は `-store-clear`（18）→ `-history`（19）→ `-redirect` / `-redirect-replace`（20）の順です。
- `data-{event}-dialog` の `
` 表記は、使用直前に評価した値でも改行へ復元されます。
- 属性の描画では DOM 上の値が評価結果へ置き換わりますが、再評価は宣言（テンプレート）に対して行うため、同じ要素を続けて操作しても毎回その時点のデータで評価されます。
- 属性を伴わない経路（`ProcedureOptions` を直接渡す内部 API）では再評価せず、渡された値をそのまま使います。

#### 交差監視トリガー (`data-intersect-*`)

`data-intersect-*` は `IntersectionObserver` によって発火する専用トリガー属性です。`click` / `change` / `load` の DOM イベントとは別に、要素が監視領域へ入ったことをきっかけに Procedure を実行します。主な用途は無限スクロール、一覧の先読み、遅延読み込みです。

`data-intersect-*` では次の属性を使用します。

1. `data-intersect-fetch`: 交差時に HTTP 通信を開始
2. `data-intersect-fetch-method`: HTTP メソッドを指定
3. `data-intersect-fetch-headers`: リクエストヘッダーを指定
4. `data-intersect-fetch-content-type`: Content-Type を指定
5. `data-intersect-data` / `data-intersect-form`: 送信データを構築（`data-{event}-data` / `data-{event}-form` と同じ命名で、`-fetch-` は入りません）
6. `data-intersect-before-run`: 実行前コールバック
7. `data-intersect-after-run`: 実行後コールバック
8. `data-intersect-bind`: バインド先要素を指定
9. `data-intersect-bind-arg`: レスポンスをネストしてバインド
10. `data-intersect-bind-params`: レスポンスの一部だけをバインド
11. `data-intersect-bind-append`: 指定した配列キーだけを追記
12. `data-intersect-copy`: 別要素へバインディング値をコピー
13. `data-intersect-copy-params`: コピー対象キーを絞り込む
14. `data-intersect-root`: 監視対象のスクロールコンテナを指定
15. `data-intersect-root-margin`: 監視領域の余白を指定
16. `data-intersect-threshold`: 発火に必要な可視率を指定
17. `data-intersect-disabled`: 真の間は実行を抑止
18. `data-intersect-once`: 初回成功後に監視を解除

##### `data-intersect-fetch`

監視対象の要素が `root` と交差し、かつ `threshold` を満たした時点で通信処理を開始します。

```html
<div data-intersect-fetch="/api/posts"></div>
```

##### `data-intersect-root`

監視に使うスクロールコンテナを CSS セレクタで指定します。省略時はビューポートを使用します。

```html
<div class="panel">
  <div data-intersect-fetch="/api/posts" data-intersect-root=".panel"></div>
</div>
```

##### `data-intersect-root-margin`

`IntersectionObserverInit.rootMargin` に相当する値です。既定値は `0px` です。無限スクロールでは下方向に正の値を指定して、画面に入る前に先読みする用途を想定します。

```html
<div data-intersect-fetch="/api/posts" data-intersect-root-margin="0px 0px 300px 0px"></div>
```

##### `data-intersect-threshold`

`0` から `1` の数値で、ターゲット要素がどの程度監視領域内に入ったら発火するかを表します。既定値は `0` です。

- `0`: 1px でも交差した時点で発火
- `0.5`: 要素の半分以上が見えた時点で発火
- `1`: 要素全体が見えた時点で発火

```html
<div data-intersect-fetch="/api/posts" data-intersect-threshold="0.5"></div>
```

##### `data-intersect-disabled`

真と評価された間は、交差しても Procedure を開始しません。`loading` 中の多重実行抑止や `hasMore === false` の停止に使用します。

```html
<div
  data-intersect-fetch="/api/posts"
  data-intersect-disabled="{{loading || !hasMore}}"
></div>
```

##### `data-intersect-once`

初回の成功後に監視を解除します。1 回だけ読み込みたいセクションに使用します。

```html
<div data-intersect-fetch="/api/hero" data-intersect-once></div>
```

#### 定期取得トリガー (`data-poll-*`)

`data-poll-*` はタイマーによって発火する専用トリガー属性です。`click` / `change` / `load` の DOM イベントとは別に、一定間隔で繰り返し Procedure を実行します。主な用途は、別端末や別プロセスでの状態変化をサーバへ問い合わせ続ける「完了待ち」画面です。

アクション語彙は `data-{event}-*` と共通で、`data-poll-fetch` / `data-poll-data` / `data-poll-bind` / `data-poll-bind-arg` / `data-poll-bind-merge` / `data-poll-fetch-method` / `data-poll-fetch-headers` / `data-poll-fetch-state` などがそのまま使えます。バインドの適用規則もエラーメッセージの振り分けも通常のイベント属性と同一です。

`data-poll-*` 固有の設定属性は次の 6 つです。

1. `data-poll-interval`: 取得間隔（ミリ秒）
2. `data-poll-timeout`: 開始からの打ち切り時間（ミリ秒）
3. `data-poll-until`: 条件が成立した時点で停止
4. `data-poll-error-limit`: 連続失敗回数の上限に達したら停止
5. `data-poll-disabled`: 真の間は実行を抑止
6. `data-poll-state`: ポーリング状態 `_poll` の注入先セレクタ

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

  <p data-if="{{_poll.running}}">確認をお待ちしています…</p>
  <p data-if="{{_poll.timedOut}}">時間内に確認が完了しませんでした。</p>
</div>
```

トリガーとして機能するのは、上記の設定属性以外の `data-poll-*` を 1 つ以上持つ場合です。`data-poll-interval` や `data-poll-timeout` だけを指定した要素はポーリングを開始しません。

##### 実行タイミング

- 初回は間隔を待たずに**即時実行**します（非イベント `data-fetch` と同じ扱い）。
- 2 回目以降の間隔は、**前回の手続きが完了した時点**から計測します。応答が間隔より遅い場合でもリクエストは多重化しません。
- タブが非表示から表示へ戻った時点（`visibilitychange`）で、待機中の間隔を打ち切って即時実行します。バックグラウンドのタブではブラウザがタイマーを大きく抑制するため（Chrome では数分後に 1 分あたり 1 回程度まで低下）、復帰直後の検知遅延を抑えるための補正です。**指定した間隔はバックグラウンドでは保証されません。**

##### `data-poll-interval`

取得間隔をミリ秒で指定します。省略時は `5000`（5 秒）です。下限は `100` ミリ秒で、これを下回る値と数値として解釈できない値は補正し、開発モードで警告を出します。

```html
<div data-poll-fetch="/api/status" data-poll-interval="5000"></div>
```

##### `data-poll-timeout`

ポーリング開始からの打ち切り時間をミリ秒で指定します。省略時は無制限です。打ち切りは間隔タイマーとは独立に計測するため、バックグラウンドタブでタイマーが抑制されていても指定時刻に到達します。

到達時は `_poll.timedOut` が真になり、`haori:polltimeout` に続いて `haori:pollstop` が発火します。

```html
<div data-poll-fetch="/api/status" data-poll-timeout="900000"></div>
```

##### `data-poll-until`

条件が成立した時点でポーリングを恒久停止します。**`{{...}}` 記法で指定してください**（`data-if` / `data-each` / `data-derive` 以外の属性は、テンプレート式でなければ式として評価されません）。

式は**その要素自身のバインドスコープ**で評価されます。`data-poll-bind` で別要素へ結果を書き込む場合、その要素が `data-poll-*` 要素の祖先でなければ参照は解決できません。上の例のように、ポーリング要素をバインド先の内側に配置してください。

評価は次の 2 か所で行います。

1. 各リクエストの**実行前**。初期状態で既に条件が成立している場合、一度もリクエストを出さずに停止します。
2. 取得成功後の**バインド反映後**。取得結果によって条件が成立した時点で停止します。

未解決の参照を含む場合は「成立していない」として扱い、停止しません（バインドが届く前の初回評価で即停止しないため）。属性名の綴り誤りなどに気づけるよう、開発モードでは警告を出します。

```html
<div data-poll-fetch="/api/status" data-poll-until="{{approval.confirmed}}"></div>
```

##### `data-poll-error-limit`

連続して失敗した回数がこの値に達したらポーリングを恒久停止します。省略時は**無制限**で、失敗しても `data-poll-timeout` まで取得を続けます（モバイル回線の一時的な切断でポーリングが死なないようにするため）。成功した時点で連続失敗回数は 0 に戻ります。

HTTP エラー応答（4xx / 5xx）とネットワーク断のどちらも失敗として数えます。

```html
<!-- 3 回連続で失敗したら打ち切る -->
<div data-poll-fetch="/api/status" data-poll-error-limit="3"></div>
```

##### `data-poll-disabled`

真と評価された間は手続きを実行しません。**一時停止**であり、偽に戻れば次の周期から再開します。`data-poll-timeout` の経過時間は抑止中も進み、`data-poll-until` は抑止中に評価しません。

```html
<div data-poll-fetch="/api/status" data-poll-disabled="{{!ready}}"></div>
```

##### `data-poll-state`

ポーリングの状態を `_poll` として指定要素のバインディングデータへ注入します。値を CSS セレクタとして解決し、値を省略した場合は自要素が対象になります。属性そのものが無い場合は注入しません。`data-fetch-state` と同様に `data-bind` 属性は汚しません。

| キー | 内容 |
| ---- | ---- |
| `running` | ポーリングが稼働中かどうか（恒久停止で偽） |
| `paused` | 一時停止中（非表示または `data-poll-disabled`）かどうか |
| `stopped` | 恒久停止済みかどうか |
| `timedOut` | 打ち切り時間に到達したかどうか |
| `stopReason` | 恒久停止の理由。`'until'` / `'timeout'` / `'error'` / `'detached'` |
| `count` | 手続きの実行回数 |
| `elapsedMs` | ポーリング開始からの経過時間（ミリ秒） |

**注入先は `_poll` を参照する要素の祖先（またはその要素自身）にしてください。** 式は要素を起点に祖先方向へバインドを辿って解決するため、値を省略して自要素へ注入すると、兄弟要素の `data-if="{{_poll.timedOut}}"` などからは参照できません。画面全体で状態を使う構成では、上の例のように `data-poll-bind` と同じコンテナを指定します。

**`_poll` は初期表示の時点では存在しません。** ポーリングの登録（`PollObserver.syncTree()`）は初期スキャンの完了後に行われるため、最初の評価では未定義です。`_fetch`（`data-fetch-state`）と同様に、注入前の `_poll.xxx` は[未解決参照](#未解決参照の診断)になるだけでエラーにはならないため、`data-bind` による宣言もオプショナルチェーンも不要です。

注入は**状態が遷移した時点だけ**行います。取得ごとに注入すると `data-each` を含む画面では間隔ごとに再評価が走るためです。リクエスト単位の `loading` / `success` / `error` は `data-poll-fetch-state`（`_fetch`）が担います。

**`_poll` は内部バインディングデータにのみ設定し、`data-bind` 属性へは書き出しません。** `_fetch`（[`data-fetch-state` / `data-{event}-fetch-state`](#data-fetch-state--data-event-fetch-state)）と同じ扱いです。エンジンが管理する実行時の一時値であり、属性へ直列化すると数秒ごとの状態遷移で `data-bind` 属性が書き換わり続けるためです。`haori:bindchange` も発火しません。

`false` はテキスト補間（`{{_poll.stopped}}`）では空文字列として描画されます。真偽の出し分けには `data-if` を使用してください。

`data-poll-bind` は既定でバインド先を全置換するため、注入先が bind 先と同じ要素になる構成では `data-poll-bind-merge` を併用してください（併用しない場合も `_poll` は書き戻されますが、bind 先の他のキーは保持されません）。

##### 停止と一時停止

**恒久停止**（再開しません）は次の 4 つです。停止時に `haori:pollstop` が発火します。

| 契機 | `stopReason` |
| ---- | ------------ |
| `data-poll-until` の条件成立 | `'until'` |
| `data-poll-timeout` への到達 | `'timeout'` |
| `data-poll-error-limit` への到達 | `'error'` |
| 対象要素が DOM から外れた | `'detached'` |

**一時停止**（条件が戻れば再開します）は次の 2 つです。`_poll.paused` が真になります。

- `data-if` によって非表示になった（自要素または祖先のいずれか）
- `data-poll-disabled` が真になった

`data-if` は要素を DOM から削除せず `display: none` と `data-if-false` 属性を付与するため（[data-if の動作](#data-if-の動作)）、非表示の判定は祖先方向を毎周期確認して行います。タブの出し入れのように `data-if` を切り替える構成でも、表示に戻った時点から再開します。

停止はリクエストを中断しません。`data-poll-timeout` に到達した時点で通信中のリクエストがあった場合、その応答は通常どおりバインドまで処理されます。そのため `_poll.timedOut` が真になった直後に取得結果が反映されることがあります。打ち切り後の反映を避けたい場合は、`data-poll-until` 側で停止させる設計にしてください。

##### 定期実行と相性の悪い修飾子

`data-{event}-*` の全修飾子が技術的に動作しますが、次のものは間隔ごとに繰り返されるため実用になりません。使用は避けてください。

- `data-poll-confirm`: 間隔ごとに確認ダイアログが出ます
- `data-poll-toast` / `data-poll-dialog`: 間隔ごとにメッセージが表示されます
- `data-poll-history`: 間隔ごとに履歴が積まれます
- `data-poll-scroll` / `data-poll-scroll-error`: 間隔ごとにスクロールします

`data-poll-redirect`（条件成立時の遷移）は、`data-poll-until` と組み合わせれば意図どおり動作します。

#### バリデーションと確認

##### `data-{event}-validate`

フォームバリデーションを実行します。バリデーション失敗時は処理を中断します。

対象フォームは `data-{event}-form` で解決したものです（値を省略すると自要素または祖先のフォーム）。**フォームが解決できない手続きでは検証は行われません**。検証の直前に `data-validity` の条件を同期評価して `setCustomValidity()` へ反映します（[フィールド間の条件](#フィールド間の条件)を参照）。

```html
<form id="myForm">
  <input name="email" type="email" required>
</form>
<button data-click-validate data-click-form="#myForm">送信</button>
```

検証に失敗した場合は、DOM 順で最初の不正な欄にフォーカスを移し、ネイティブの検証 UI（バブル）を表示します。表示のタイミングは対象の欄が画面内にあるかどうかで変わります。

- 対象の欄が**全体とも**画面内に収まっている場合は、その場で検証 UI を表示します。
- 対象の欄が**一部でも画面の外に出ている場合は、先に画面内へスクロールし、スクロールが止まってから**検証 UI を表示します。1 ピクセルでも外に出ていれば、`reportValidity()` 自身がバブルを見せるためにスクロールする余地が残るためです。表示してからスクロールすると、バブルが画面外の位置に固定されたまま要求され、ブラウザがアンカーを見失って表示を取り消すため、`scroll-behavior: smooth` を指定したページではメッセージが見えません。
- このスクロールは `data-{event}-scroll-error` の指定に関わらず行います。指定が無い場合もブラウザ自身が検証 UI の表示に伴って画面内へスクロールするため、移動の回数は増えません。整列は `behavior: smooth` / `block: nearest` です（ブラウザ任せの場合と着地点が数十ピクセル異なることがあります）。
- スクロールの静止は対象の欄の表示位置が変化しなくなったことで判定します。スムーズスクロールの所要時間はブラウザによって変わるため、1 秒を過ぎた場合は静止を待たずに表示します。
- 待機中に別の検証が失敗した場合は、**後から始まった検証の欄だけ**を表示します。
- 検証 UI はブラウザが描くものです。`<form>` のネイティブ送信による検証（`data-{event}-validate` を経由しない検証）には介入しません。

##### `data-{event}-if`

手続きの**実行条件**です。条件が偽のときは、その手続きの以降のアクション（`data-{event}-run` / `-confirm` / `-reset-before` / `-before-run` / `-fetch` / `-bind` / `-store-clear` / `-history` / `-redirect` / `-redirect-replace` など）をすべて実行しません。非イベントの場合は `data-fetch-if` です。

表示制御の `data-if` とは別物です。`data-if` は要素の表示を切り替え、`data-{event}-if` は手続きを実行するかどうかを決めます。

- 条件は手続きの実行時に**同期評価**します。属性値の再描画（`requestAnimationFrame`）を待たないため、直前に変更した入力を含めて判定できます。
- 評価は `data-{event}-validate` の**後**、`data-{event}-run` の**前**に行います。必須欄が空のようなネイティブ検証で表現できるエラーは先にバブル表示し、それ以外の条件でここで止めます。
- 偽のときは停止するだけです（メッセージ表示は `data-if` / `data-message` と併用します）。開発モード（読み込み時の `<script data-dev>`）でのみ中断のログを出します。
- 参照が解決できない場合は「条件を満たしていない」と扱い実行しません（ブロック目的の宣言なので安全側に倒します）。この場合は警告ログを出します。
- 評価スコープは[フィールド間の条件](#フィールド間の条件)と同じです。

```html
<button
  data-click-form
  data-click-if="{{agreed}}"
  data-click-fetch="/api/apply"
  data-click-redirect="/done"
>申込を確定する</button>

<p class="error" data-if="{{!agreed}}">同意が必要です</p>
```

`data-fetch-if` は自動取得（`data-fetch`）の再取得判定にも参加します。条件の真偽が変わると再取得の対象になるため、「条件を満たしたら取得する」構成が書けます。

```html
<div data-fetch="/api/summary" data-fetch-if="{{customerId}}"></div>
```

##### `data-{event}-confirm`

確認ダイアログを表示します。キャンセル時は処理を中断します。

```html
<button data-click-confirm="本当に削除しますか?" data-click-fetch="/api/delete">
  削除
</button>
```

#### データ取得

##### `data-{event}-data`

送信データを指定します (JSON or URLSearchParams)。

```html
<button data-click-fetch="/api/create" data-click-data='{"type":"user"}'>
  作成
</button>
```

**テンプレート式の埋め込み**

属性値には `{{...}}` を書けます。JSON 形式では、式が **JSON の値の位置**にあるか**文字列リテラルの中**にあるかで埋め込み方が変わります。この規則は `data-fetch-data` / `data-intersect-data` にも同じく適用します。

- **値の位置**（`{"n": {{count}}}`）: 評価結果を JSON の値として埋め込みます。数値・真偽値・配列・オブジェクトはその型のまま送られ、文字列は引用符付きの JSON 文字列になります（属性側に引用符を書く必要はありません）。`null` は `null` のままです。数値にならない計算（`NaN`）は `null` になります。
- **文字列リテラルの中**（`{"s": "id-{{count}}"}`）: 評価結果を文字列にしたうえで、JSON 文字列として安全な形（`"` や改行のエスケープ）へ変換して埋め込みます。配列やオブジェクトは JSON 表記の文字列になります。`null` と `NaN` は空文字になります。
- **パラメータ形式**（`page={{page + 1}}&q={{q}}`）: 評価結果を文字列にして値へ入れます。
- **属性値の全体が 1 つの式**（`data-click-data="{{payload}}"`）: 評価結果のオブジェクトをそのまま送信データにします。
- 式に[未解決参照](#未解決参照の診断)が含まれる場合は、送信そのものを行いません（`data-fetch` と同じ扱いです）。

```html
<div data-bind='{"count":3,"tags":["a","b"]}'>
  <!-- 送信される JSON: {"n":3,"list":["a","b"],"label":"id-3"} -->
  <button
    data-click-fetch="/api/save"
    data-click-fetch-method="POST"
    data-click-data='{"n": {{count}}, "list": {{tags}}, "label": "id-{{count}}"}'
  >
    保存
  </button>
</div>
```

##### `data-{event}-form`

フォーム要素を指定します。値が空の場合は自要素または先祖の `<form>` を使用します。

```html
<form id="userForm">
  <input name="username">
  <button data-click-fetch="/api/save" data-click-form>送信</button>
</form>

<button data-click-fetch="/api/save" data-click-form="#userForm">送信</button>
```

#### コールバック

##### `data-{event}-before-run`

フェッチ前に実行するスクリプトを指定します。

**引数**:
- `arguments[0]`（`fetchUrl`）: 送信先 URL。未確定の場合は `null`
- `arguments[1]`（`fetchOptions`）: 送信オプション（`RequestInit`）。未確定の場合は `null`

**戻り値**:
- `false` または `{ stop: true }`: 処理を中断
- `{ fetchUrl, fetchOptions }`: フェッチ設定を上書き

**`this`**: 起点要素では**ありません**（内部のオプションオブジェクトが渡ります。将来変わる可能性があるため依存しないでください）。`this` が起点要素になるのは `data-{event}-run` だけです。起点要素を参照する場合は `document.querySelector` などで取得してください。

**上書き時の注意**:
- `fetchUrl` を上書きすると、`data-{event}-form` / `data-{event}-data` から組み立てたクエリ文字列は引き継がれません。必要なクエリは上書きする URL に自分で含めてください。
- `fetchOptions` の `body` を上書きすると、`data-{event}-form` / `data-{event}-data` から組み立てた送信データは置き換わります。両方を送る場合は上書きする `body` に自分で含めてください。
- `data-runtime="demo"` では、上書き後の設定に対しても[クエリ付き GET への正規化](#demo-ランタイムでの通信の正規化)が再適用されます。

```html
<button
  data-click-fetch="/api/data"
  data-click-before-run="console.log('フェッチ開始', arguments[0]); return true"
>
  取得
</button>
```

##### `data-{event}-after-run`

フェッチ後に実行するスクリプトを指定します。

**引数**:
- `arguments[0]`（`response`）: **解析前の `Response` オブジェクト**です。解析済みのデータではありません。

**本文を読む場合は `clone()` が必要です**。`Response` の本文は一度しか読めないため、ここで直接読むと後続のバインド処理が本文を読めなくなります。

```html
<button
  data-click-fetch="/api/data"
  data-click-after-run="arguments[0].clone().json().then(d => console.log(d))"
>
  取得
</button>
```

**戻り値**:
- `false` または `{ stop: true }`: 以降の処理を中断
- `{ response }`: バインド対象レスポンスを上書き

**`this`**: `before-run` と同じく起点要素ではありません。

```html
<button
  data-click-fetch="/api/data"
  data-click-after-run="console.log('取得完了', arguments[0].status)"
>
  取得
</button>
```

##### `data-{event}-run`

フェッチを伴わないイベント時に、任意の JavaScript を実行します。`data-click-run` / `data-change-run` などイベント種別ごとに利用できます。クライアント側の状態操作や関数呼び出しのために、`document.addEventListener('click', ...)` 等の独自ハンドラを書かずに済ませるための属性です。

- **実行方式**: 属性値を本体として `new Function('event', "use strict"; body)` で実行します（`before-run` / `after-run` と同じ実 JS 実行。サンドボックス式評価ではありません）。`this` は起点要素、引数 `event` は起点の DOM イベントです。
- **戻り値の捕捉**: 属性値が**単一式**として評価できる場合（例: `save()`、`Foo.bar('#x')`）は、`return` を書かなくても**式の値が戻り値として捕捉**されます。これにより素の async 関数呼び出しでも戻り値の Promise が後述の await 対象になり、同期的な `false` で `preventDefault()` が働きます。複数文・`if` 文・明示的な `return` を含む本体は単一式として扱えないため**従来どおりの文ブロック**として実行され、その場合の戻り値は本体内に書いた**明示的な `return` に従います**（戻り値が必要なら `return <値>` を明示してください）。
- **`{{...}}` の展開**: 属性値に含まれる `{{...}}` は、他の属性と同様にレンダリング時に評価・展開され、展開後の文字列が本体として実行されます（`{{...}}` 部分のみバインディングスコープを参照できます）。
- **戻り値による既定動作の抑止**: 本体が**同期的に `false` を返したときだけ `event.preventDefault()`** を呼びます（`onclick="return false"` / jQuery と同じ慣習）。`<a href>` や `type="submit"` の既定動作を抑止したい場合は `return false` を返してください。`type="button"` など既定動作が無い要素では不要です。
  - **挙動差の注意**: 上記「戻り値の捕捉」により、本体が単一式で**その式自体が同期的に `false` を評価する場合**（例: `data-click-run="checkSomething()"` が `false` を返す）は、`return` を書かなくても `preventDefault()` が働きます。素の `onclick="checkSomething()"`（`return` 無し）が既定動作を抑止しないのとは異なる点に注意してください。意図せぬ抑止を避けたい場合は、戻り値が `false` になり得る式を単独で置かないか、`void` で包んでください。
  - **⚠️ async ハンドラでの注意**: `async` 関数や Promise を返すハンドラは戻り値が**常に Promise（truthy）**になるため、`return false` では `preventDefault()` できません（`preventDefault()` はクリックイベント処理中の同期段でしか効かず、await 後では既定動作が既に走っています）。async ハンドラで既定動作を抑止する場合は、ハンドラの**先頭で同期的に `event.preventDefault()` を呼ぶ**か、`data-{event}-prevent` を併用してください。
- **実行タイミング**: 手続きの同期実行中（`await` を挟む前）に実行されるため、`event.preventDefault()` が間に合います。`data-click-fetch` と併用した場合は **run を実行してから fetch** を継続します（run の同期的な `false` は preventDefault のみを制御し、fetch は中止しません。fetch を中止する場合は `data-{event}-before-run` を使用）。
- **戻り値が Promise の場合（多重実行防止）**: 本体が **Promise（thenable）を返した場合は、その完了まで `await`** します。`click` 手続きでは await の間も多重実行防止ロック（対象要素の `disabled` 付与・`RUNNING_CLICK_TARGETS` 登録）を保持するため、**async ハンドラ（保存 POST 等）でも 2 度押しによる重複送信を防げます**。`data-click-fetch` と併用した場合は **run の完了後に fetch** が直列実行されます。単一式の本体（例: `data-click-run="save()"`）は前述の「戻り値の捕捉」により `return` を書かなくても Promise が await されますが、**複数文の本体では `return <promise>` を明示**しないと await されません。
  - **多重実行防止ロックは `click` のみ**です（`data-change-run` などクリック以外のイベントにはロックがありません）。クリック以外でも await による run → fetch の直列化は行われますが、同一イベントの多重実行そのものは防止しません。
  - **⚠️ 必ず settle する Promise を返すこと**: 返した Promise が解決も拒否もしない（`new Promise(() => {})`、タイムアウトの無いハング fetch、発火しないイベント待ち等）と、await が終わらず**ボタンが `disabled` のままになります**。run が返す Promise は必ず settle するようにしてください（これは `data-{event}-fetch` でハングする endpoint を指定した場合と同じ性質です）。
  - 拒否（reject）された場合は `Log.error` でコンソールに報告し、例外は外へ投げません。後続処理は継続します。
- **エラー時**: 評価・実行エラーは `Log.error` でコンソールに報告し、例外は外へ投げません。
- **注意**: `data-click-defer` と併用すると手続きが次フレームへ遅延し同期実行でなくなるため、`return false` による `preventDefault()` は間に合いません。
- **⚠️ セキュリティ（重要）**: `{{...}}` の展開結果は**実行コードへ文字列結合**されます。他属性の `{{...}}` は結果を「データ」として扱いますが、本属性は結果を「コード」として再実行するため、**`{{...}}` に入れた値が JavaScript として実行されます**。例えば `data-click-run="greet('{{name}}')"` で `name` が信頼できない文字列（`'); evilCode(); ('` 等）の場合、`greet(''); evilCode(); ('')` となり任意コードが実行されます（XSS）。`{{...}}` には**自分で制御する信頼できる値（数値 index・自前採番 ID など）のみ**を入れ、**API レスポンスやユーザー入力などの信頼できない文字列を差し込まないでください**。信頼できない値は `{{...}}` で結合せず、`data-bind` でスコープに置いて呼び出す関数の内部で参照する構成にします。

```html
<!-- 関数呼び出し（type=button では preventDefault 不要） -->
<button type="button"
  data-click-run="Plans.addElectricTemplateRule('#ept-dialog-state', '#ept-rule-form')">
  ルール追加
</button>

<!-- {{...}} をレンダリング時に展開（ruleI = 2 なら editRule('#ep', 2, '#form') を実行） -->
<button type="button"
  data-click-run="Plans.editRule('#ep-dialog-state', {{ruleI}}, '#ep-rule-form')">
  編集
</button>

<!-- 確認のうえ実行（confirm はブラウザ標準。実 JS なので利用可） -->
<button type="button"
  data-click-run="if (confirm('このルールを削除しますか？')) Plans.removeRule('#ept-dialog-state', {{ruleI}})">
  削除
</button>

<!-- リンクの既定遷移を抑止したい場合は false を返す -->
<a href="/fallback"
  data-click-run="openInApp(); return false">
  アプリで開く
</a>
```

##### `data-{event}-prevent`

そのイベントでブラウザのネイティブなデフォルト動作を抑止します（`data-click-prevent` が主用途）。`type="submit"` ボタンのフォーム送信や `<a href>` の遷移を止めたい場合に使います。

- **指定方法**: 真偽属性（存在＝有効）。値は将来の条件指定用に予約しており、現状は無視します。
- **実行方式**: `EventDispatcher.delegate` の最初の同期段で `event.preventDefault()` を呼びます。手続き（fetch 等）の有無・成否に依存せず常に抑止します。
- **`data-{event}-defer` との関係**: prevent は同期段で確定するため、`defer` で手続きを遅延させても抑止は有効です（`data-{event}-run` の `return false` が defer と併用できないのとは異なります）。
- **伝播**: `stopPropagation()` は呼びません。他ライブラリのイベントハンドラへは伝播し続けます。

```html
<!-- type="submit" のまま、ページ再読込なしにフェッチ・トーストを実行する -->
<form>
  <button type="submit" data-click-prevent data-click-fetch="/api/save">保存</button>
</form>

<!-- リンクの既定遷移だけを抑止する（onclick="return false" 相当） -->
<a href="#" data-click-prevent>何もしないリンク</a>
```

#### フェッチ

##### `data-{event}-fetch`

フェッチURLを指定します。

`click` イベントでは、起点要素に処理中だけ `disabled` 属性を付与します。
起点要素がすでに `disabled` の場合は処理を開始しません。
この属性は `button` 以外の要素にも付与されるため、CSS で実行中スタイルを切り替えられます。
（他ライブラリと併用して `disabled` 付与が問題になる場合は `data-click-no-disabled` を参照。）

```html
<button data-click-fetch="/api/user">取得</button>
```

##### `data-{event}-fetch-method`

HTTPメソッドを指定します (デフォルト: GET)。

```html
<button data-click-fetch="/api/create" data-click-fetch-method="POST">作成</button>
```

##### `data-{event}-fetch-headers`

リクエストヘッダーを指定します (JSON or URLSearchParams)。

```html
<button
  data-click-fetch="/api/data"
  data-click-fetch-headers='{"Authorization":"Bearer token"}'
>
  取得
</button>
```

##### `data-{event}-fetch-content-type`

Content-Typeを指定します。

デフォルト値:
- GET/HEAD/OPTIONS: `application/x-www-form-urlencoded`
- その他: `application/json`

```html
<button
  data-click-fetch="/api/upload"
  data-click-fetch-method="POST"
  data-click-fetch-content-type="multipart/form-data"
>
  アップロード
</button>
```

#### バインド

##### `data-{event}-bind`

バインド先要素をセレクタで指定します。

```html
<button data-click-fetch="/api/user" data-click-bind="#userView">取得</button>
<div id="userView">
  <p>名前: {{name}}</p>
</div>
```

`data-{event}-fetch` を指定しない場合、バインドの入力には `data-{event}-data`（インライン JSON）とフォーム値を統合した payload がそのまま使われます。これは内部的に payload から生成した擬似レスポンスを bind 処理へ流すためで（`Procedure` の fetch なし経路）、**フェッチを伴わずに任意の JSON を state（対象要素の `data-bind`）へ反映**できます。`data-{event}-bind-arg` でキー指定、`data-{event}-bind-merge` で既存 binding への浅いマージも併用できます。

```html
<!-- フェッチなしで #page-state を初期化してからモーダルを開く -->
<button
  data-click-data='{"detail": {}, "users": []}'
  data-click-bind="#page-state"
  data-click-bind-merge
  data-click-open="#agency-modal"
>新規追加</button>
```

##### `data-{event}-bind-arg`

バインドキー名を指定します。

```html
<button
  data-click-fetch="/api/user"
  data-click-bind="#view"
  data-click-bind-arg="user"
>
  取得
</button>
<div id="view">
  <p>{{user.name}}</p>
</div>
```

##### `data-{event}-bind-params`

バインドするパラメータを `&` 区切りで指定します。

```html
<button
  data-click-fetch="/api/user"
  data-click-bind-params="name&age"
>
  取得
</button>
<!-- レスポンス全体ではなく name と age のみバインド -->
```

##### `data-fetch-bind-append` / `data-{event}-bind-append` / `data-intersect-bind-append`

指定したキーの値が配列である場合、既存の配列に追記してからバインドします。`&` 区切りで複数指定できます。指定されていないキーは通常どおり上書きします。

無限スクロールでは `items` のみを追加し、`cursor` や `hasMore` は更新する、という用途を想定します。

```html
<div
  data-intersect-fetch="/api/posts?cursor={{cursor}}"
  data-intersect-bind="#feed"
  data-intersect-bind-params="items&cursor&hasMore"
  data-intersect-bind-append="items"
></div>
```

追記対象キーについて、既存値と新規値の両方が配列である場合は `existing.concat(incoming)` 相当で結合します。いずれかが配列でない場合は新規値で上書きします。

##### `data-fetch-state` / `data-{event}-fetch-state`

フェッチの進行状況を `_fetch` というキーで対象要素のバインディングデータへ注入します。画面個別の JavaScript を書かずに、`data-if` や式からフェッチ状態（読み込み中・成功・失敗）を参照するための属性です。

**構文**:
```html
data-fetch-state            <!-- 非イベント data-fetch 用。値省略で自要素が対象 -->
data-fetch-state="#panel"   <!-- CSS セレクタで別要素を対象にできる -->
data-click-fetch-state      <!-- イベント起点の場合は data-{event}-fetch-state -->
```

**注入される `_fetch` の構造**:

| キー | 型 | 内容 |
|---|---|---|
| `status` | string | `"loading"` / `"success"` / `"error"` |
| `loading` | boolean | 読み込み中なら `true` |
| `success` | boolean | 成功なら `true` |
| `error` | boolean | 失敗なら `true` |
| `statusCode` | number \| null | HTTP ステータスコード。取得できない場合は `null` |
| `message` | string \| null | エラーメッセージ。HTTP エラー時は `statusText`、ネットワーク断時は例外メッセージ。無い場合は `null` |

**注入タイミング**:
- フェッチ開始直前に `status="loading"`
- HTTP エラー応答（4xx/5xx）で `status="error"`（`statusCode` に HTTP ステータス、`message` に `statusText`）
- ネットワーク断・タイムアウト等の例外で `status="error"`（`statusCode` は `null`、`message` に例外メッセージ）
- バインド反映後に `status="success"`（`statusCode` に HTTP ステータス）

**仕様**:
- 値を省略した場合は自要素、CSS セレクタを指定した場合は該当要素群を注入先とします。
- `_fetch` は最初のフェッチが行われるまで存在しません。注入前の `_fetch.loading` は[未解決参照](#未解決参照の診断)になるだけでエラーにはならないため、`data-bind` による宣言もオプショナルチェーンも不要です。
- `_fetch` は内部バインディングデータにのみ設定し、`data-bind` 属性へは書き出しません（`bindchange` イベントも発火しません）。注入先要素の再評価（`data-if` 等）は実行されます。
- 自動リトライは行いません。再取得は `data-click-fetch` 等で手動導線を宣言します。

#### その他のアクション

##### `data-{event}-adjust`

値を調整する要素をセレクタで指定します。

```html
<input type="number" value="10" id="quantity">
<button data-click-adjust="#quantity" data-click-adjust-value="1">+1</button>
<button data-click-adjust="#quantity" data-click-adjust-value="-1">-1</button>
```

##### `data-{event}-adjust-value`

調整値を指定します。

##### 行操作の共通仕様（`data-{event}-row-*`）

`data-{event}-row-add` / `-row-remove` / `-row-prev` / `-row-next` は、`data-each` が参照している**配列そのもの**を書き換えます。DOM の行は差分更新で再描画されるため、DOM とバインディングデータが常に一致します。

- **対象の決定**: 値を省略した場合は対象要素が属する行（`data-row`）です。CSS セレクタを指定した場合は、そのセレクタが指す `data-each` コンテナの**末尾の行**を対象とします。行の外に置いたボタンや、行が 0 件で複製元が存在しない状態からの追加に使用します。
- **配列の所有者**: `data-each` の式を単純な識別子パス（`contracts` / `form.contracts` など）とみなし、根の識別子を持つ最も近い祖先（自身を含む）のバインディングデータを所有者とします。関数呼び出しや演算を含む式（`items.filter(...)` など）は書き戻し先を一意に決められないため、エラーログを出して何もしません。
- **行スコープ名を根に持つ `data-each`**: 入れ子の `data-each` で外側の行スコープ名を根に持つ式（`data-each="g.rules"`）も対象です。行データは描画のたびに親配列から作り直す仮想スコープなので、行自身のバインディングデータへ書き戻しても次の描画で消えます。そのため外側の `data-each` をたどって**行データの実体である配列要素**（`groups[i].rules`）まで遡り、そこへ書き戻します。入れ子は何段でも遡ります。行の位置は `data-each-key` を指定していればキーで、指定していなければ描画順で対応付けます（[編集可能な行への書き込み](#編集可能な行への書き込み)と同じ規則）。外側が派生配列で書き戻せない場合は、内側の行の位置も一意に決まらないため何もしません（**行データへ書き戻して画面だけを動かすことはしません**）。
- **行の値**: 追加した行には空のオブジェクト（`{}`）を挿入します。`data-form-list` を併用している場合、行内の入力欄は要素データのキーと `name` で対応するため空の状態で描画されます。
- **ユーザー編集の印**: `data-each-key` を指定していない場合、行と要素データはインデックスで対応するため、増減・並べ替えで**別のレコードを受け取る行**が出ます。その行の中のユーザー編集の印を解除し、宣言バインドが評価結果を取り戻せるようにします（解除しないと、宣言バインドで値が決まる入力欄が前のレコードの値を表示したまま残ります）。`data-each-key` を指定している場合は、キーと一緒にレコードが移動するのでどの行も別のレコードを受け取らず、解除しません（消えた行は差分更新が印ごと取り除きます）。

```html
<form data-bind='{"contracts":[{"name":"A"}]}'>
  <div id="list" data-form-list="contracts" data-each="contracts"
    data-each-arg="c" data-each-index="i">
    <div>
      <span>{{i}}</span>
      <input name="name">
      <button data-click-row-add>行追加</button>
      <button data-click-row-remove>削除</button>
      <button data-click-row-prev>↑</button>
      <button data-click-row-next>↓</button>
    </div>
  </div>
  <!-- 行の外から追加する（0 件の状態からでも追加できる） -->
  <button data-click-row-add="#list">行追加</button>
</form>
```

##### `data-{event}-row-add`

対象要素が属する行の**直後**に新しい行を追加します。セレクタで対象コンテナを指定した場合は末尾へ追加します。追加された行の入力欄は空の状態になります。

```html
<button data-click-row-add>行追加</button>
<button data-click-row-add="#list">行追加（末尾）</button>
```

##### `data-{event}-row-remove`

対象要素が属する行を削除します。ただし**リスト内に 1 行しか存在しない場合は削除しません**。0 件まで削除したい場合は `data-{event}-row-remove-empty` を併用してください。

```html
<button data-click-row-remove>削除</button>
```

##### `data-{event}-row-remove-empty`

`data-{event}-row-remove` の「最後の 1 行を残す」動作を解除し、0 件まで削除できるようにします。可変件数（0〜N 件）の入力に使用します。

```html
<button data-click-row-remove data-click-row-remove-empty>削除</button>
```

##### `data-{event}-row-prev`

対象要素が属する行と前の行を入れ替えます。配列の順序が入れ替わり、DOM の行順も追従します。

```html
<button data-click-row-prev>↑</button>
```

##### `data-{event}-row-next`

対象要素が属する行と次の行を入れ替えます。配列の順序が入れ替わり、DOM の行順も追従します。

```html
<button data-click-row-next>↓</button>
```

##### `data-{event}-reset`

対象要素をリセットします (値の初期化、複製削除、メッセージ除去)。

リセットでは次を行います。

1. 進行中のバインドデータ更新の書き戻しを無効化する（後述）
2. ユーザー編集の印を解除する（「ユーザー編集と宣言バインドの権威」を参照）
3. 内部値をクリアし、メッセージと `data-each` の複製を削除する。削除した行は 6 の再評価で現在のデータから描き直されるため、描画済み判定（要素データの署名）も破棄する
4. DOM の値を既定値へ戻す。`<form>` 要素は `form.reset()`、それ以外の要素は配下の入力欄を同じ既定値（`defaultValue` / `defaultChecked` / `defaultSelected`。既定の選択が無い単一選択の `<select>` は先頭の選択できる `<option>`）へ戻す。宣言バインドで値・状態が決まる入力は、評価結果が `value` / `checked` / `selected` 属性（= 既定値）へ書かれているため、併せて DOM 側も空へ揃える
5. フォーム自身のバインドデータを初期 `data-bind` 宣言（宣言がなければ空）へ戻す。自身のバインドデータを持たないフォームは、祖先を参照しているためここでは何もしない（不要なシャドーイングを作らないため）
6. 再評価して `data-each` の行と宣言バインドの現在の評価結果を入力欄へ入れ直す。続いて、自身のバインドデータを持たない `data-form-arg` フォームへ祖先のレコードを流し込み直し、その結果を含むフォーム値でバインドデータを更新する

4 と 5 により、リセット前の編集やコミット済みの値がリセット後に復元されることはありません。

**`name` を持つ入力欄には、5 で戻したバインドデータが逆方向同期で書き戻されます。** そのため宣言バインド（`value="{{式}}"` / `data-attr-value` など）の有無によらず、リセット後の値は**初期 `data-bind` 宣言の値**になります。6 の「宣言バインドの現在の評価結果を入力欄へ入れ直す」は宣言バインドを持つ欄の話で、`name` だけを持つ欄が 4 の直後の空のまま残るという意味ではありません。[初期 `data-bind` からの入力欄復元](#初期-data-bind-からの入力欄復元)と同じ規則で、初期表示とリセット後の値が一致します。

```html
<form id="f" data-bind='{"keyword":"初期"}'>
  <input name="keyword">        <!-- 初期表示もリセット後も "初期"（空ではない） -->
</form>
```

- 対象は逆方向同期の対象と同じ範囲です。`<form>` 要素と、祖先が所有するキーを `data-form-arg` で参照するフォームが対象で、**`data-form` 属性によるフォームコンテナは対象外**です。
- 初期宣言そのものが無いフォームでは 5 で空へ戻るため、リセット後の値も空になります。

**対象の要素を DOM から出し入れしません（4）。** `<form>` でない要素（バインドホストの `<div>` など）を対象にした場合も、DOM の構造は変えずに配下の入力欄を既定値へ戻します。要素を外すとその時点でフラグメントと**実行時のバインドデータ**が破棄され、同じ操作の後段の書き込み（`data-{event}-bind` など）が空のバインドデータを土台にしてしまいます。その結果、`data-fetch-bind` で同じホストへ寄せておいた取得結果が `data-bind` 属性から消え、URL が変わらない `data-fetch` は[再実行判定](#data-fetch)で「同じ内容」と判断されるため再取得もされません（参照側の式は[未解決参照](#未解決参照の診断)のまま復帰しません）。

```html
<div id="host" data-bind='{"dialog":{}}'>
  <div hidden data-fetch="/api/auth/me" data-fetch-bind="#host" data-fetch-arg="me"></div>
  …
</div>
<!-- リセットの対象と書き込み先が同じホストでも、me は保たれる -->
<button data-click-reset-before="#host" data-click-data="id=1"
        data-click-bind="#host" data-click-bind-arg="dialog">編集</button>
```

**進行中のバインドデータ更新は書き戻しません（1）。** バインドデータの更新は「`data-bind` 属性の反映 → 入力欄への書き戻し → 再評価（行生成）→ 載らなかった書き込みの載せ直し」を非同期に行うため、呼び出しの後もしばらく DOM を書き換え続けます。入力欄を離れた直後にクリアを押すと、その `change` による双方向コミットがまだ走っているので、後段の書き戻しがリセットの途中へ割り込み、クリアしたはずの値が戻ってしまいます。

そこでリセットは開始時に**通番**を発番し、対象部分木の各要素へ記録します。バインドデータの更新は開始時点の通番を控えておき、入力欄へ書き戻す直前に宛先の記録と突き合わせて、その後に初期化された宛先へは書き込みません。**双方向コミットだけは、突き合わせる基準が呼び出しの時点ではなく「その入力欄の編集の時点」になります**（`change` はフォーカスを外した時点で発火するため呼び出しは編集よりずっと後になり、呼び出しの時点で比べると初期化より後に始まった更新と見なされてしまいます。[ユーザー編集と宣言バインドの権威](#ユーザー編集と宣言バインドの権威)を参照）。判定は入力欄ごとなので、初期化より後に行われた編集はこの判定に掛からず、そのまま残ります。判定は宛先ごとに行うため、次の 3 経路すべてが対象です。

- 自フォームの入力欄への書き戻し（`Form.syncValues()`）
- 祖先の更新から `data-form-arg` フォームへの流し込み（`Form.syncAncestorArgForms()`）
- 候補が揃った後の載せ直し（`ElementFragment.retryUnappliedValueWrites()`）

**逆に、リセットを要求した後に行われた編集はリセットを越えて残ります**（[反映待ちの間に起きた変化](#反映待ちの間に起きた変化)の「反映を要求した時点より後の編集は…保護します」）。`change` の発火は待ちません（同節の「保護の対象は**打鍵 1 文字ごと**です」）。クリアを押してから完了までは非同期の段が続くため、その途中で打った文字・貼り付けた値もそのまま残ります。4 のネイティブのフォームリセット（`form.reset()`）は DOM を直接書き戻して入力欄ごとの判定を経由しないため、要求より後に編集された欄の状態を控えて戻します。

データの更新と再評価は抑止しません。またリセットの後に始まった更新（フェッチ応答の反映など）は通常どおり反映されます。

**リセットも 1 つの値の供給として、他の供給と後勝ちで解決します。** リセットは「初期 `data-bind` 宣言の値を供給する 1 つの操作」で、通番は**リセットを起こした操作の時点**（クリックのハンドラ内）で発番し、上に挙げた各段がその同じ通番を運びます。したがって次のいずれも「後から来た方が残る」で決まります。

- リセットの**後**に他のスクリプトが `data-bind` 属性を書き換えた／`Haori.Core.setBindingData()` を呼んだ場合は、その値が残ります。リセットは複数の段に分かれて非同期に進むため完了はリセットの方が後になりますが、通番が古いので初期値では上書きしません。
- リセットの**前**に始まった供給が、リセットの後に宛先へ届いた場合は、リセットの初期値が残ります。

判定は宛先（入力欄とバインドデータの経路）ごとに行うため、リセットが触らない経路は影響を受けません。呼び出し側が「どちらを優先するか」を選ぶことはありません。

とくに候補を `data-each` で流し込む `<select>` では、この割り込みが「クリアしても選択が戻る」形で現れます。書き戻した時点では候補の行がまだ無いため代入が無視され、行が描かれた後に**載せ直し**が働いてクリア前の値を復元してしまうためです。内部値のクリア（3）は、載せ直し待ちの書き込みも併せて破棄します。

`data-each` で描画した行の扱いは、要素データの置き場所で決まります。フォームの外側（祖先の `data-bind` など）から供給された選択肢はリセットの影響を受けないため 5 で描き直され、選択状態だけが解除されます。フォーム自身のバインドデータから描いている行（`data-form-list` の複製行など）は 4 でデータが初期宣言へ戻るため、件数も初期状態へ戻ります。

`data-{event}-copy` と併用した場合、コピー元がフォームならリセット後の値をコピーします。

```html
<form id="myForm">
  <input name="username">
</form>
<button data-click-reset="#myForm">リセット</button>
```

##### `data-{event}-reset-before`

確認ダイアログを通過した後、`data-{event}-before-run` や `data-{event}-data` / `data-{event}-form` の前に対象要素をリセットします。以降の `data-{event}-data`、`data-{event}-form`、`data-{event}-history-data`、`data-{event}-history-form`、`data-{event}-copy` は、リセット後の値を基準に評価します。

```html
<form id="searchForm">
  <input name="keyword" value="haori">
</form>
<button
  data-click-reset-before="#searchForm"
  data-click-form="#searchForm"
  data-click-fetch="/api/search"
>
  検索
</button>
```

##### `data-{event}-copy`

指定した要素へバインディング値をコピーします。

- `data-{event}-form` が指定されている場合は、そのフォームの現在値をコピー元に使用
- `data-{event}-form` がない場合は、イベント発火元要素**自身の**バインディングデータをコピー元に使用
- コピー先の既存バインディング値は保持しつつ、同名キーだけを上書き
- コピー先が `<form>` の場合は `data-bind` 更新後に入力要素へも同期
- コピー先が**編集可能な行**（`data-each` と `data-form-list` を併用したコンテナの行）の場合は、行に対応する配列要素へマージして所有者へ書き戻す（[編集可能な行への書き込み](#編集可能な行への書き込み)を参照）
- `data-{event}-copy-params` で指定したキーがコピー元に存在しない場合も、コピー先の既存値は保持

コピー元・コピー先のバインディングデータは、いずれも**その要素自身が持つ値**（`data-bind` で宣言・更新された値）です。祖先から継承した値は含みません。含めると、祖先が持つ無関係なキー（一覧の配列など）までコピーされ、コピー先へ焼き付いて以降の祖先の更新をシャドーします。

```html
<button
  data-click-form="#search-form"
  data-click-copy="#search-committed"
>
  検索
</button>

<form id="search-form">
  <input name="keyword" value="haori">
</form>

<form id="search-committed">
  <input name="keyword">
</form>
```

##### `data-{event}-copy-params`

`data-{event}-copy` で転送するキーを `&` 区切りで指定します。通常のキーは include、先頭に `!` を付けたキーは exclude として扱います。include がある場合はそのキー群を候補にし、exclude はその中から差し引きます。exclude だけを指定した場合は、コピー元の全キーを候補にしたうえで、指定したキーだけを除外します。省略時または空文字の場合は全件コピーです。

指定されていないキーはコピー先の既存値を保持し、コピー元に存在しないキーは無視します。`!` で始まるキー名は exclude 記法と衝突するため、include としては使用できません。

```html
<button
  data-click-form="#search-form"
  data-click-copy="#search-state"
  data-click-copy-params="keyword&page"
>
  検索条件を確定
</button>

<button
  data-click-form="#search-form"
  data-click-copy="#search-state"
  data-click-copy-params="!page&!sort"
>
  ページ情報を除外してコピー
</button>
```

##### `data-{event}-copy-source`

`data-{event}-copy` のコピー元要素を明示的に指定します（単一セレクタ）。指定しない場合のコピー元は「`data-{event}-form` があればそのフォーム → なければイベント発火元要素の binding」ですが、本属性を指定するとその要素を優先します。

- コピー元が `<form>` の場合は、そのフォームの現在の入力値を使用します。
- それ以外の要素の場合は、その要素**自身の**バインディングデータを使用します（祖先から継承した値は含みません）。
- 値を省略した場合は自要素を対象にします。
- 指定セレクタが見つからない、または Haori 管理外の要素の場合はログ出力してスキップします。

```html
<!-- 別要素の binding をコピー元にして #state へ転送 -->
<button
  data-click-copy="#state"
  data-click-copy-source="#source-row"
>
  反映
</button>
```

**`data-each` の行から行の外へ転送する場合は本属性が必須です。** 行の中のボタンは
自分のバインディングデータを持たないため、コピー元を省くと（祖先の行の値は継承分
として除外されるため）何もコピーされません。行に一意な `id` を組み立てて、行その
ものをコピー元に指定します。

```html
<tbody data-each="members" data-each-key="id">
  <!-- コピー元として指せるように、行ごとに一意な id を組み立てる -->
  <tr id="member-row-{{id}}">
    <td>{{name}}</td>
    <td>
      <button
        data-click-copy="#member-detail"
        data-click-copy-source="#member-row-{{id}}"
        data-click-copy-params="id&name"
      >詳細へ写す</button>
    </td>
  </tr>
</tbody>
```

> **0.32.0 以前からの移行**: 0.32.0 以前はコピー元に祖先から継承した値も含めていた
> ため、本属性を省いても行の値が写っていました。0.33.0 の変更後は、コピー元の指定を
> 省いた箇所がエラーも警告も出さずに何もコピーしなくなります。該当箇所には本属性を
> 追記してください。

#### フィールド間の条件

`data-attr-required` / `data-attr-disabled` と `data-if` はフィールド間の条件を**表示**できますが、押下の**ブロック**には使えません。属性値の反映はキュー（`requestAnimationFrame`）で行われるため、「最後の欄を直してそのまま次へを押す」操作ではクリック時点の属性が 1 フレーム古く、条件を満たしていない状態で手続きが走ります（逆に、直した直後は `disabled` が残っていてクリックが無視されます）。

**`disabled` を押下のブロックに使わないでください。** HTML 仕様上、無効化されたフォーム部品はクリックイベントを発火しないため、「直したのに押せない」方向は実行時の判定では救えません。ブロックは `data-validity` または `data-{event}-if` で行い、`data-attr-disabled` は視覚的な合図としてのみ使うか `data-attr-class` に置き換えます。

##### `data-validity` / `data-validity-message`

入力要素（`input` / `select` / `textarea`）へ付ける宣言的な検証です。条件が偽のとき `setCustomValidity()` にメッセージを設定し、真のとき解除します。ネイティブ検証に相乗りするため、`data-{event}-validate` のバブル表示・フォーカス移動・`data-{event}-scroll-error` がそのまま働き、CSS の `:invalid` でも装飾できます。

- 条件は `data-{event}-validate` の検証直前に**同期評価**します。属性の再描画を待たないため、直前に変更した入力を含めて判定できます。
- `data-validity-message` を省略した場合は「入力内容を確認してください」を使います。メッセージは `{{}}` を評価できます。
- 参照が解決できない場合は「条件を満たしていない」と扱い、メッセージを設定します（警告ログを出します）。
- `data-{event}-validate` が無い手続きでは検証されません。開発モードではその状況を警告します。
- `data-if` が偽の分岐配下は検証対象外です（配下の入力欄はエンジンが `disabled` にするため制約検証から外れます）。
- 条件の評価結果は属性へ書き戻しません（属性には宣言したテンプレートが残ります）。そのため属性値を実行中に外部から書き換えても反映されません（`data-store` と同じく、宣言は静的なものとして扱います）。

```html
<form id="contact" data-bind='{"tel":"","mail":"","mail2":""}'>
  <!-- いずれか必須: グループの代表となる欄へ宣言する -->
  <input name="tel"
    data-validity="{{tel || mail}}"
    data-validity-message="電話番号かメールアドレスを入力してください">
  <input name="mail" type="email">
  <!-- 等値: 確認欄へ宣言する -->
  <input name="mail2" type="email"
    data-validity="{{mail === mail2}}"
    data-validity-message="メールアドレスが一致しません">
  <button data-click-form data-click-validate
          data-click-fetch="/api/next">次へ</button>
</form>
```

##### 条件の評価スコープ

`data-validity` と `data-{event}-if` は同じスコープで評価します。バインディングデータ（継承込み）を土台に、**フォーム内で宣言されている収集キーを収集値で置き換えた**値です。

- クリック時点で最新なのは**収集値**です。属性の再描画はキュー経由で、バインドデータへの双方向コミットも非同期のため、どちらもクリック時点では古いことがあります。収集は DOM を真として行う（[収集は DOM を真とする](#収集は-dom-を真とする)）ため、`change` / `input` を伴わない外部ライブラリの代入も含めて、収集値は常に最新です。
- 収集値に現れないキーは**未定義**として扱います。`data-if` が偽の分岐配下の入力欄は収集対象外なので、バインドデータや祖先に残った古い値で条件が誤判定されるのを防ぎます。
- 置き換えの単位は**最上位の収集キー**です。`data-form-object` / `data-form-list` に囲まれた入力欄は、囲んでいる方のキーがまとめて置き換わります。宣言をフォームコンテナ自身に書いた場合（`<form data-form-object="customer">`）も同じで、置き換わるのはそのキー（`customer`）です。条件式も収集値と同じ形（`customer.email` のように入れ子）で書きます。
- 収集値の取得元は、`data-{event}-form` の指定があればそのフォーム、`data-form-list` の行の中ではその行、それ以外は祖先のフォームコンテナです。`data-form-arg` / `data-each-arg` の指定があるときは、そのキー配下へ収集値を重ねます（既存の式の書き方と揃えます）。
- `data-form-list` を伴わない `data-each` の行では、入力欄と要素データが対応しないため行を取得元にしません（フォームコンテナへ遡ります）。

#### 編集可能な行への書き込み

`data-each` と `data-form-list` を併用したコンテナの行では、入力欄の値は**配列の要素データ**が権威です（行要素のバインディングデータは描画のたびに作り直される一時スコープで、そこへ書いても入力欄には届かず、次の再描画で消えます）。そのため `data-{event}-copy` / `data-{event}-bind` / `data-fetch-bind` のセレクタが行要素に解決した場合は、行に対応する配列要素を書き換えて所有者へ書き戻します。書き戻し後は `data-each` の差分更新から行の入力欄へ反映されるため、画面と収集値（送信データ）が常に一致します。

対象になるのは、コンテナが `data-each` と `data-form-list` の**両方**を持ち、セレクタが解決した要素がそのコンテナの**行要素自身**である場合だけです。行の内側の要素を指した場合は従来どおりその要素自身のバインディングデータを更新します（行内のスコープ用要素へのバインドを保つため）。`data-form-list` を持たない `data-each` の行も従来どおりです。

行ごとに一意なセレクタは `data-each-index` または `data-each-key` の値で組み立てます。

```html
<form data-bind='{"contracts":[{"name":"東京本社"},{"name":"大阪支店"}]}'>
  <div id="owner" data-bind='{"zip":"1000001","city":"千代田区"}'></div>
  <div data-each="contracts" data-each-arg="c" data-each-index="i"
       data-form-list="contracts">
    <div id="addr-{{i}}">
      <input name="name">
      <input name="zip">
      <input name="city">
      <button type="button"
        data-click-copy="#addr-{{i}}"
        data-click-copy-source="#owner"
        data-click-copy-params="zip&city">契約者住所と同じ</button>
    </div>
  </div>
</form>
```

書き込み内容は指定に応じて次のとおりです。

| 指定 | 配列要素への書き込み |
| --- | --- |
| `data-{event}-copy` | `-copy-params` 適用後の値を浅くマージ |
| `data-{event}-bind`（既定） | 応答で置換（要素データに無いキーの入力欄は空になる） |
| `data-{event}-bind-merge` | 浅くマージ |
| `data-{event}-bind-arg="k"` | 要素データの `k` キーへ入れる（行内の `data-form-object="k"` と対応） |

`data-each-arg` の包みは付けません。入力欄の `name` は要素データのキーと対応するためです。

以下の規則で整合性を保ちます。

- **配列は書き戻す直前に読み直す**。手続きの開始時点のコピーを使うと、送信から応答までの間に他の行で確定した編集を巻き戻します。
- 同一コンテナの複数行が対象のときは、1 回の書き戻しにまとめる（行ごとに書き戻すと後の書き込みが前の書き込みを消します）。
- **要素データの内容が変わらないときは書き戻さない**。書き戻すと所有者の再評価が走り、行の中の `data-fetch` が再発火して往復が止まりません（同じ値を書く二度目のコピーで無用な再描画を起こさないためでもあります）。ただし**行の入力欄へは反映します**（後述）。反映しないと、要素データが変わった場合との結果が食い違います。
- **行の描画中に起動された処理からの書き戻しは、完了を待たずに次へ進む**。行の中の `data-fetch` のように行の初期化から起動された処理では、描画ループ側がその初期化の完了を待っているため、書き戻しの完了（＝描画の完了）を待つと相互に待ち合って止まります。バインディングデータは同期で確定し、描画は進行中のループが再実行で拾います。この場合 `haori:bindcomplete` は入力欄への反映より前に発火します。
- `data-each-key` を指定している場合は、位置ではなく**キー**で配列要素を特定する（応答を待つ間の並べ替えや行の増減で別のレコードへ書かないため）。キーが重複していた場合は、同じキーの中で**出現順**に対応させる（仕様「`data-each`」）。
- ユーザー編集の印は所有者への書き戻しでは解除しない。書き戻しは配列の一部の要素だけを対象にするため、所有者の部分木を丸ごと供給の宛先にはしない。`data-{event}-copy` は対象行の印を書き戻しの側で解除する（差分更新は解除しない。上記「ユーザー編集と宣言バインドの権威」）。
- `data-{event}-bind` では、送信後に行った行の編集を応答へ上書きし直す（フォームへのバインドと同じ扱い）。
- **書き戻す土台は、読み直した要素データを「行の入力欄の現在の状態」まで進めたものにする**（`data-{event}-copy` と `data-{event}-bind-merge`）。読み直した要素データをそのまま土台にすると、書き込まないキーの編集値が旧値へ巻き戻ります。`change` を起点にした手続きでは、起点になった入力の編集がまだ要素データへ確定していないことがあるためです（`data-fetch` を伴う手続きでは所有者への暗黙のコミットが走らず、収集の宣言を持つ `<form>` が外側に無い構成では確定の機会そのものがありません）。巻き戻りは画面表示だけでなく収集値・保存値にも及びます。行の中で郵便番号から住所を引く構成では、入力した郵便番号そのものが消えることになります。重ね方は入れ子を含めた再帰マージで、行の中の `data-form-object` や値リストのうち編集していない部分は元の要素データを保ちます。`data-{event}-bind` の全置換では、要素データに無いキーを空にするのが仕様なので土台を使いません。
- **`data-{event}-copy` はコピーしたキーについては利用者の編集より優先し、行の入力欄へ必ず反映する**。コピーは明示的な値の供給なので、利用者が操作したチェックボックスを宣言で外す使い方が成立します（`data-{event}-bind` の「送信後の編集を保護する」扱いとは別の経路です）。要素データが変わった場合も変わらない場合も、対象行の入力欄については編集の印を解除して値を反映します（差分更新は更新が供給かどうかを判定できないため解除しません）。宣言バインドで値が決まる入力欄は行データ由来の書き戻しの対象外なので、印の解除と再評価だけが反映の経路になります。**解除するのは、書き戻す要素データと画面の状態が食い違うキーに属する入力欄だけです。** コピーしたキーは値が変わるため必ず含まれ、コピーしていないキーの編集は保たれます（行を丸ごと解除すると、宣言バインドの評価が要素データと食い違う欄でその編集が失われます）。
- **要素データが変わらない場合の入力欄への反映は、`data-{event}-copy` と `data-{event}-bind` の両方で行う**。反映する内容は書き戻す予定だったものそのものなので、要素データが変わった場合に差分更新が行う反映と結果は同じです。反映しないと、行の入力欄の状態が要素データへ確定していない構成で、応答が返した値に画面が戻らず収集値と食い違ったまま残ります（行の中で「再取得」ボタンを押しても、手で書き換えた欄が元に戻らない）。両者の違いは編集の印の扱いだけで、`data-{event}-copy` は解除し、`data-{event}-bind` は解除しません（送信時点を基準にした解除は上の規則で済んでおり、重ねて解除すると送信後の編集の保護、およびポーリングの編集保護が壊れます）。
- 実際の書き込み先は所有者なので、`haori:bindchange` は**所有者要素**で発火する（`haori:bindcomplete` は従来どおりバインド先の行で発火）。

次の場合は警告ログを出してスキップします（手続きは止めません）。

- `data-each` の式が単純な識別子パスでない、または配列の所有者が解決できない
- 要素データがオブジェクトでない（プリミティブの配列）
- 応答が届くまでに対象行が削除された、または `data-each-key` に一致する配列要素が無い（キーが重複していて、その出現順に対応する要素が無い場合も含みます）
- `data-each-before` / `data-each-after` の固定要素を指している

`input[type=file]` へは値を流し込めません（ブラウザの制約）。`data-if` が false の行へ書いた値は配列には入りますが、非表示分岐配下は値収集の対象外なので送信されません。

##### `data-{event}-refetch`

対象要素の `data-fetch` を再実行します。

```html
<div id="userList" data-fetch="/api/users"></div>
<button data-click-refetch="#userList">再読み込み</button>
```

##### `data-{event}-click`

対象要素をクリックします。セレクタは `document.body.querySelectorAll()` で解決するため、**複数要素**にもマッチできます。各対象に対して `Core.evaluateAll()`（最新バインドの反映）を行ってから実 `click()` を発火し、それが委譲経由で対象の `data-click-*` 手続きを起動します。複数対象は直列にクリックされますが、起動された手続き（fetch 等）は**非同期**で、呼び出し元はその完了を待ちません。

```html
<button id="submitBtn">送信</button>
<button data-click-click="#submitBtn">送信 (間接)</button>
```

**複数エンドポイントの取得と単一 state への統合**: 連番属性を使わず、複数の隠し要素のクリックを発火し、それぞれが `data-click-bind-arg` で同じ要素の別キーへマージする構成にできます。`data-click-bind-arg` は対象自身の最新 binding を基底に当該キーだけを更新するため、複数の取得を1つの state にまとめられます。

```html
<!-- 編集: 2 本の取得を起動してからモーダルを開く（処理順 14:click → 15:open） -->
<button data-click-click=".agency-loaders" data-click-open="#agency-modal">編集</button>

<!-- 同じバインドスコープ（行内など）に置き、{{id}} を解決させる -->
<span hidden class="agency-loaders"
  data-click-fetch="{{'../api/agencies/' + id + '.json'}}"
  data-click-bind="#page-state" data-click-bind-arg="detail"></span>
<span hidden class="agency-loaders"
  data-click-fetch="{{'../api/agencies/' + id + '/users.json'}}"
  data-click-bind="#page-state" data-click-bind-arg="users"></span>
```

注意点:

- 呼び出し元は子の取得完了を待たないため、モーダルは取得前に開き、`#page-state` への反映で**リアクティブに**中身が埋まります。「両方の取得完了後に処理」が必要な用途には向きません。
- トリガーは同じバインドスコープに置くこと（`{{id}}` 等の解決のため）。`<button disabled>` は `click()` が無反応になるため、`data-click-fetch` を持つ `<span>` 等を用いるのが安全です（委譲は最も近い `data-click-*` 要素を拾います）。

##### `data-{event}-open`

対象ダイアログを開きます。

```html
<dialog id="myDialog">
  <p>ダイアログ内容</p>
</dialog>
<button data-click-open="#myDialog">開く</button>
```

- 値を省略した場合は、自要素の祖先方向で最も近い `<dialog>`（`closest('dialog')` 相当）を対象にします。祖先に `<dialog>` が無い場合はログ出力してスキップします。
- ダイアログを開く際、対象ダイアログ自身とその子孫に残った `data-message` / `data-message-level`（`clearMessages` 相当）を除去してから開きます。これにより、エラー表示後に閉じたダイアログを再度開いても前回のメッセージが残りません。

##### `data-{event}-close`

対象ダイアログを閉じます。

```html
<dialog id="myDialog">
  <p>ダイアログ内容</p>
  <button data-click-close="#myDialog">閉じる</button>
</dialog>
```

- 値を省略した場合は、自要素の祖先方向で最も近い `<dialog>`（`closest('dialog')` 相当）を対象にします。ダイアログ内の閉じるボタンに値なしで付与すれば、ボタン自身ではなくダイアログ本体が閉じます。祖先に `<dialog>` が無い場合はログ出力してスキップします。

```html
<!-- 値を省略するとボタンを囲む <dialog> が対象になる -->
<dialog id="myDialog">
  <p>ダイアログ内容</p>
  <button data-click-close>閉じる</button>
</dialog>
```

##### `data-{event}-dialog`

ダイアログメッセージを表示します。メッセージは**表示直前**に評価するため、応答の値を埋め込めます（[バインド後に実行するアクションの評価タイミング](#バインド後に実行するアクションの評価タイミング)）。`
` は改行として表示します。

```html
<button data-click-fetch="/api/save" data-click-dialog="保存しました">
  保存
</button>

<!-- 応答の受付番号を埋め込む（応答は自要素または祖先へバインドする） -->
<div id="state">
  <button data-click-fetch="/api/apply" data-click-bind="#state"
          data-click-dialog="受付番号 {{no}} で受け付けました">申込</button>
</div>
```

##### `data-{event}-toast`

トーストメッセージを表示します (3秒表示)。メッセージは**表示直前**に評価するため、応答の値を埋め込めます（[バインド後に実行するアクションの評価タイミング](#バインド後に実行するアクションの評価タイミング)）。`data-{event}-toast-level` は式を使えない生値です。

```html
<button data-click-fetch="/api/save" data-click-toast="保存しました">
  保存
</button>
```

##### `data-{event}-store-clear`

`data-store` で保存したレコードを破棄します。属性値はストレージキーで、式は使用できません。

**構文**:
```html
data-{event}-store-clear="storageKey"
data-{event}-store-clear-type="session|local"  <!-- 既定は session -->
```

- 非イベントの `data-fetch` では `data-fetch-store-clear` を使用します。
- 破棄後もミラーは停止しません。破棄した時点の値をすぐ書き戻さないよう、そのレコードを宣言している要素の書き出し基準を現在値へ更新し、以後は**値が変わったとき**だけ再保存します。そのため、破棄する画面で対象キーを更新する構成（定期取得やフェッチ）ではレコードが復活します。破棄する画面では対象キーを更新しない構成にしてください。
- 復元は優先属性として破棄より先に済むため、保存した値を表示してから破棄できます。

```html
<!-- 完了画面: 受付番号を復元して表示し、ページ読み込み時に下書きを破棄する -->
<html data-load-store-clear="apply">
  <body>
    <div data-bind='{"receipt":{}}' data-store="apply" data-store-params="receipt">
      <p>受付番号: {{receipt.no}}</p>
    </div>
  </body>
</html>

<!-- ボタン操作で破棄する -->
<button data-click-store-clear="apply" data-click-redirect="/">最初へ戻る</button>
```

##### `data-{event}-history`

`history.pushState()` を実行してブラウザの履歴を追加します。

**構文**:
```html
data-{event}-history="url"
data-{event}-history-data="param=value&..."  <!-- オプション: クエリに追記するパラメータ -->
data-{event}-history-form="#selector"        <!-- オプション: フォームの入力値をクエリに追記 -->
```

**URL 組み立て規則**:
- `data-{event}-history` が指定されている場合、その値をベース URL にする（相対パス可）。値は `pushState()` の**直前**に評価するため、応答の値を埋め込める（[バインド後に実行するアクションの評価タイミング](#バインド後に実行するアクションの評価タイミング)）
- 省略時は現在の `window.location.pathname` をベースにする
- `data-{event}-history-data` / `data-{event}-history-form` の値をクエリパラメータとして追記する
- `data-{event}-history-form` は明示指定した場合のみフォーム値を追記する。`data-{event}-form` からの自動補完は行わない
- `data-{event}-history-data` と `data-{event}-history-form` は独立して動作し、`data-{event}-fetch-form` / `data-{event}-data` とは別に指定する

**エラー時の挙動**:
- 不正 URL / 異なるオリジン / `pushState` 例外（SecurityError 等）は `Log.error('Haori', ...)` でログ出力してスキップし、後続処理（`redirect` 等）は継続する

**例**:

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

<!-- history-url 省略、クエリだけ更新 -->
<button data-click-history-data="tab=list">一覧タブ</button>
<!-- → pushState({}, '', '/current/path?tab=list') -->

<!-- フォームの入力値をクエリに追記 -->
<button
  data-click-fetch="/api/search"
  data-click-history="/search"
  data-click-history-form="#searchForm"
>
  検索
</button>

<!-- redirect と併用（history → redirect の順で実行） -->
<button
  data-click-history="/checkout/confirm"
  data-click-redirect="/checkout/complete"
>
  注文確定
</button>
```

`data-{event}-redirect-replace` とは併用しないでください。ここで追加した履歴項目が置き換えられるだけで、遷移前のページは履歴に残ります（[`data-{event}-redirect-replace`](#data-event-redirect-replace)）。

---

##### `data-{event}-redirect`

指定URLにリダイレクトします。遷移先は**遷移直前**に評価するため、応答の値で切り替えられます（[バインド後に実行するアクションの評価タイミング](#バインド後に実行するアクションの評価タイミング)）。応答を参照するには `data-{event}-bind` の対象をその要素自身または祖先にしてください。

```html
<button
  data-click-fetch="/api/create"
  data-click-redirect="/success"
>
  作成
</button>

<!-- 応答の nextAction で遷移先を振り分ける -->
<div id="state">
  <button
    data-click-fetch="/api/apply"
    data-click-bind="#state"
    data-click-redirect="{{nextAction === 'pay' ? redirectUrl : '/complete.html'}}"
  >申込を確定する</button>
</div>
```

##### `data-{event}-redirect-replace`

指定 URL にリダイレクトし、**現在の履歴項目を置き換えます**（`location.replace()` 相当）。`data-{event}-redirect` が履歴を 1 つ積むのに対し、こちらは**遷移前のページを履歴に残しません**。したがって遷移後に「戻る」を押しても、そのページへは戻りません。

遷移先の評価タイミング・`{{...}}` 式の扱い・処理順（20）・`data-{event}-redirect-return-param` との併用は `data-{event}-redirect` と同じです。違いは履歴の扱いだけです。

```html
<!-- 確定した申込の確認画面を履歴に残さない。完了画面で「戻る」を押しても、
     確認画面ではなくその前のページへ戻る -->
<button
  data-click-fetch="/api/apply"
  data-click-method="POST"
  data-click-redirect-replace="/apply/complete.html"
>
  申込を確定する
</button>
```

- **一度きりの操作を終えた画面を履歴から外す**用途を想定しています。確定・送信の後に残った画面へ「戻る」で到達できると、同じ操作をもう一度実行できてしまうためです。
- `data-{event}-redirect` と**両方を宣言した場合は本属性を採用**し、`Log.warn('Haori', ...)` で警告します。どちらを優先するかを宣言側が選べる仕様にはしていません。
- `data-{event}-redirect-return-param` は本属性にも適用されます（同属性は `data-{event}-redirect` と本属性のいずれかがある場合だけ有効です）。
- 履歴項目を**追加**する `data-{event}-history`（処理順 19）とは**併用しないでください**。置き換えの対象は「その時点の履歴項目」であり、`data-{event}-history`（19）が先に項目を追加するため、本属性（20）が置き換えるのは**追加された項目**になります。結果として `data-{event}-history` の URL は履歴に残らず、**遷移前のページは履歴に残ります**（履歴から外す目的は達成できません）。

##### `data-{event}-redirect-return-param`

手続きの成功後リダイレクト先を、URL クエリパラメータから**安全に**解決します。認証ガードの戻り先クエリ自動付与（`*-return-param`、送り手）と**対称な受け手側**で、ログイン後に元のページへ復帰させる用途を宣言的に実現します。

```html
<!-- 保護ページ: 401 で /login.html?href=<元URL> へ -->
<body data-unauthorized-redirect="/login.html"
      data-unauthorized-redirect-return-param="href">

<!-- ログインページ: 成功後、href が安全なら復帰、無ければ /dashboard.html -->
<button
  data-click-fetch="/api/login" data-click-method="POST"
  data-click-form="#login" data-click-validate
  data-click-redirect="/dashboard.html"
  data-click-redirect-return-param="href"
>
  ログイン
</button>
```

- **`data-{event}-redirect` または `data-{event}-redirect-replace` と併用**し、その既定遷移先を「安全な戻り先で上書きする」修飾子として動作します。**どちらも無い場合は本属性を無視**します（オプトイン。属性が無ければ従来どおり遷移の指定のみが動作し、既存挙動は不変）。
- 手続きが**成功**したとき、現在ページ URL から指定クエリ名の値を `URLSearchParams.get()` で**1回だけ**デコードして読み取ります（二重デコードによる検証回避を防ぐため、追加のデコードは行いません）。
- 読み取った値を**こちら側で `trim()`** したうえで、**安全な同一オリジンのローカルパス**であればそこへ遷移します。安全でない／値が無い場合は `data-{event}-redirect`（既定遷移先）へフォールバックします。
- クエリ名は**遷移直前**に評価するため、応答の値で決めることもできます（[バインド後に実行するアクションの評価タイミング](#バインド後に実行するアクションの評価タイミング)）。
- **「安全なローカルパス」の判定（ライブラリ内蔵）**: `trim()` 後の値が**単一の `/` で始まる**こと。`//`・`/\`（ともにプロトコル相対と解釈され得る）、スキームやオーソリティを含むものは拒否します（さらに現在オリジンを基準に解決したオリジンが一致することも確認します）。判定 NG の場合は `Log.warn('Haori', ...)` で警告してフォールバックします。
- 許可は**同一オリジンの相対パスのみ**（外部遷移は常に不可）とし、オープンリダイレクトをライブラリ側で構造的に防ぎます。
- 全 `{event}`（click / submit / change 等）と全 fetch 経路で一貫して利用できます。`data-{event}-history` と併用する場合の実行順は既存 redirect と同様です。

#### クリック実行制御

以下は `click` イベント専用の制御属性です。

##### `data-click-no-disabled`

`click` 手続きの実行中、起点要素に `disabled` 属性を**付与しない**ようにします。

通常、`click` 手続きの実行中は起点要素に `disabled` 属性が付与され、二重実行を防ぎます。しかし Bootstrap など他ライブラリの click ハンドラや CSS は `disabled` 要素を無視するため、トグル系の機能が動かなくなることがあります。本属性を付けると `disabled` を付与せず、Haori 内部のマーカーで多重実行のみを防止します（CSS による実行中スタイルの切り替えは行えません）。

**「実行中」は手続きが終わるまでです。** フェッチを伴う手続きでは**応答が返り、その反映（バインド・メッセージ表示など）が終わるまで**ロックを保持します。したがって保存ボタンを素早く 2 回押しても POST は 1 回だけです。フェッチを伴わない手続き（`data-click-reset` / `data-click-copy` など）も、反映が複数のタスクにまたがるため、その完了までロックを保持します。

```html
<button
  data-bs-toggle="collapse"
  data-bs-target="#detail"
  data-click-copy="#state"
  data-click-no-disabled
>
  詳細検索
</button>
```

##### `data-click-defer`

`click` 手続きを、クリックイベントの同期実行中ではなく**次フレーム（`requestAnimationFrame`、無ければ `setTimeout(0)`）へ遅延**して実行します。Bootstrap の `data-bs-toggle="collapse"` のように、同一クリックイベント中に同期実行される他ライブラリのハンドラを先に完了させたい場合に使います。

- 遅延後の手続きは元のクリック `event` を参照しないため、`preventDefault()` 等でブラウザのデフォルト動作を抑止できません。`<a href>` や `type="submit"` への併用は避けてください（遅延前にリンク遷移・送信が発生します）。
- 他ライブラリが命令的に付与したクラス（Bootstrap の `.show` など）が、Haori の再描画で上書きされる別要因の競合は本属性では解消しません。

```html
<button
  data-bs-toggle="collapse"
  data-bs-target="#detail"
  data-click-reset-before="#state"
  data-click-copy="#state"
  data-click-no-disabled
  data-click-defer
>
  詳細検索
</button>
```

##### `data-click-passive`

クリックの祖先探索における**境界**を宣言します。`click` の委譲は、クリック地点から最も近い `data-click-*` を持つ祖先まで遡って発火しますが、`data-click-passive` を持つ要素に到達した時点で**それより外側へは遡上しません**（その内側のクリックは外側のクリックアクションを発火させない）。

- フォーム入力欄（`input` / `select` 等）を囲むコンテナに付けると、入力欄クリックが外側のクリック可能要素を誤って発火させるのを防げます。
- `data-click-passive` 自体はトリガーではありません。境界より**内側**に `data-click-*` を持つ要素があれば、最近接優先でそちらが先に拾われるため、内側のボタン等は従来どおり動作します。
- 影響するのは `click` の祖先委譲のみ（`change` 等は元々祖先委譲しません）。既定では無効で、付けた要素にだけ作用します（後方互換）。

```html
<div data-click-fetch="/api/open" data-click-open="#dialog">
  <!-- この検索欄のクリックは上の data-click-fetch を発火しない -->
  <div class="search-condition-field" data-click-passive>
    <input name="keyword" />
    <select name="status">…</select>
  </div>
</div>
```

##### `data-{event}-bind-transform`（非イベント: `data-fetch-bind-transform`）

バインド前に、フェッチ／取得結果へ**式を適用して変換**します。式の中ではレスポンス全体を `response` として参照でき、戻り値がバインド対象データになります。`bind-params` / `bind-arg` / `bind-append` より**前**に適用されます。

- 配列レスポンスの各要素を加工する用途（例: ID を null 化してコピー）に使えます。
- 式は `map` / `filter` / スプレッドなどの安全な構文を利用できます。

```html
<!-- レスポンス配列の各要素の id を null にしてから rules キーへ入れる -->
<button
  data-click-fetch="{{'/api/plans/' + srcId + '/rules.json'}}"
  data-click-bind="#dialog-state"
  data-click-bind-arg="rules"
  data-click-bind-transform="response.map(item => ({...item, id: null}))"
>
  既存プランからコピー
</button>
```

---

## 式評価構文

### プレースホルダ

#### `{{ expression }}`

評価結果をエスケープして表示します (XSS対策)。

```html
<div data-bind='{"name":"<script>alert(1)</script>"}'>
  <p>{{name}}</p>
  <!-- 結果: &lt;script&gt;alert(1)&lt;/script&gt; -->
</div>
```

#### `{{{ expression }}}`

評価結果をHTMLとして表示します (innerHTML)。

```html
<div data-bind='{"html":"<strong>太字</strong>"}'>
  <p>{{{html}}}</p>
  <!-- 結果: <strong>太字</strong> -->
</div>
```

**警告**: `{{{ }}}` は信頼できるデータのみに使用してください。

### 使用可能な式

```javascript
// 変数参照
{{ userName }}

// プロパティアクセス
{{ user.name }}
{{ user.address.city }}

// 配列アクセス
{{ items[0] }}
{{ items[index] }}
{{ items[index + 1] }}
{{ user["name"] }}

// 算術演算
{{ price * quantity }}
{{ total + tax }}
{{ count - 1 }}

// 比較演算
{{ age >= 18 }}
{{ status === 'active' }}
{{ count > 0 }}

// 論理演算
{{ isActive && isValid }}
{{ hasError || hasWarning }}
{{ !isHidden }}

// 三項演算子
{{ count > 0 ? 'あり' : 'なし' }}
{{ isLoggedIn ? user.name : 'ゲスト' }}

// optional chaining
{{ user?.name }}
{{ user?.[key] }}

// メソッド呼び出し
{{ text.toUpperCase() }}
{{ price.toFixed(2) }}
{{ items.join(', ') }}
{{ when.getTime() }}
{{ mapping.get("name") }}

// 複雑な式
{{ (price * 1.1).toFixed(2) }}
{{ items.filter(item => item.active).length }}
{{ items.map(x => x * 2) }}
{{ Math.max(...scores) }}
```

### 禁止事項

セキュリティのため、以下は使用できません:

```javascript
// 危険な関数
eval()
Function()
setTimeout()
setInterval()
Reflect

// グローバルオブジェクト
window
document
globalThis
location
navigator
localStorage
sessionStorage
fetch

// プロトタイプチェーン
constructor
__proto__
prototype

// その他
arguments (strict モードで禁止)
```

直接参照は `undefined` になり、危険パターンや評価失敗時は `null` を返します。`constructor` はドット記法、ブラケット記法、変数経由の computed access、`Reflect` 経由の取得もブロックされます。

---

## イベントシステム

Haori.jsは以下のカスタムイベントを発火します。すべてのイベントは `bubbles: true`, `composed: true` です。

### ライフサイクル

#### `haori:ready`

Haori.js初期化完了時に `document` で発火します。発火するのは、初期スキャンと
初期フェッチが終わり、`<body>` へ [`data-haori-ready`](#data-haori-ready-属性) を
付与し、DOM 監視と表示範囲の同期を整え、初期化中に保留していた手続きを解除した
**後**です。そのため購読側から Haori の機能をその場で呼び出せます。初期化が
失敗した場合は発火しません。

購読は**ライブラリの読み込みより前**に登録してください（`<script src>` より前の
インラインスクリプトなど）。読み込み後に登録すると、初期化が先に完了していた
場合に取りこぼします。CSS で初期表示のちらつきを防ぐだけなら、イベントではなく
`data-haori-ready` 属性を使うほうが取りこぼしがありません。

```javascript
document.addEventListener('haori:ready', (event) => {
  console.log('Haori.js準備完了', event.detail.version)
})
```

**detail**:
```typescript
{ version: string }  // ライブラリのバージョン（例: '0.45.2'）
```

> **補足**: `data-each` の描画完了を検知したい場合は、専用の完了マーカー
> `data-each-done`（描画確定ごとに付与）や宣言フック `data-each-rendered-run`
> を利用してください。詳細は「`data-each`」の関連属性を参照してください。

### バインディング

#### `haori:bindchange`

バインディングデータが変更された時に発火します。

```javascript
element.addEventListener('haori:bindchange', (event) => {
  console.log('前の値:', event.detail.previous)
  console.log('新しい値:', event.detail.next)
  console.log('理由:', event.detail.reason)
})
```

**detail**:
```typescript
{
  previous: Record<string, unknown> | null
  next: Record<string, unknown>
  reason: string  // 'data-bind' | 'form-change' | 'fetch-response' など
}
```

#### `haori:bindcomplete`

手続きによるバインドの処理を終えた時点で、**バインド先の要素**で発火します。バブリングします。

**発火時点は「バインドの反映と、対象配下の再評価が終わった後」です。** `data-if` の表示・非表示の切り替えと `data-each` の行の生成が DOM へ載った状態で発火するため、リスナーの中で行数や表示状態をそのまま読めます（描画キューの完了を自分で待つ必要がありません）。

- 対象は `data-{event}-bind` / `data-{event}-bind-arg`（`data-fetch-bind` などの非イベント版を含む）と、**バインド先を指定しない `data-fetch` / `data-{event}-fetch`** です。後者は応答を自要素へバインドするため、その要素で発火します。
- 発火するのは**手続き経由のバインド**だけです。`Core.setBindingData()` を直接呼んだ場合は発火しません（そちらは `haori:bindchange` を使います）。
- 書き込み先が所有者要素へ移る構成（[編集可能な行への書き込み](#編集可能な行への書き込み)）でも、`haori:bindcomplete` は**バインド先として指定した要素**で発火します（`haori:bindchange` は所有者要素で発火します）。
- **行の中から起動された処理の書き戻しは待ちません。** 行内の `data-fetch` のように行の初期化から起動された処理は、描画側が完了を待たずに次へ進みます（[編集可能な行への書き込み](#編集可能な行への書き込み)）。行内の取得結果を前提にするリスナーでは、その要素の `haori:bindcomplete` を待ってください。
- バインド先が**行として解決できなかった**場合（`data-each-before` / `data-each-after` の固定要素を指した、応答を待つ間に行が削除された）は、書き込みを見送ったうえで発火します。文字列の応答を `bind-arg` 無しでバインドしようとした場合は、バインド自体を行わないため発火しません。

```javascript
element.addEventListener('haori:bindcomplete', (event) => {
  // この時点で data-each の行はすべて DOM に存在する
  console.log('行数:', element.querySelectorAll('tbody tr').length)
  console.log('bind-arg のキー:', event.detail.bindArg)
})
```

**detail**:
```typescript
{
  bindArg: string | null  // data-{event}-bind-arg のキー。指定が無ければ null
  reason: string          // 予約。現在は常に 'other'
}
```

### 表示制御

#### `haori:show`

要素が表示された時に発火します (`data-if` による)。

```javascript
element.addEventListener('haori:show', () => {
  console.log('表示されました')
})
```

#### `haori:hide`

要素が非表示になった時に発火します (`data-if` による)。

```javascript
element.addEventListener('haori:hide', () => {
  console.log('非表示になりました')
})
```

### リスト更新

#### `haori:eachupdate`

`data-each` のリストが更新された時に発火します。

```javascript
element.addEventListener('haori:eachupdate', (event) => {
  console.log('追加:', event.detail.added)
  console.log('削除:', event.detail.removed)
  console.log('順序:', event.detail.order)
})
```

**detail**:
```typescript
{
  added: string[]    // 追加されたキー
  removed: string[]  // 削除されたキー
  order: string[]    // 最終的な順序
  total: number      // 最終的な行数
}
```

**`added` / `removed` はリストキーの集合です。** したがって `data-each-key` の値が重複している場合（仕様「`data-each`」の「値は配列の中で一意である必要があります」に反する場合）、増減をキーでは表せないため **`added` / `removed` は正確になりません**（同じキーの行が 1 行増えても、キーの集合は変わらないため空のままになります）。`order` と `total` は重複していても行の並びと行数のとおりです。行単位の増減が必要な場合は `haori:rowadd` / `haori:rowremove` を購読してください。

#### 行イベントの共通仕様

`haori:rowadd` / `haori:rowremove` / `haori:rowmove` は、`data-each` の差分更新で行ごとに発火します。共通の仕様は次のとおりです。

- 発火対象は**行要素**（`data-row` が付いた要素）です。`bubbles: true` のため、`data-each` コンテナや `document` でまとめて購読できます。
- `key` は差分更新で使うリストキーです（`data-each-key` を指定した場合はそのプロパティの値、指定しない場合は内部生成のキー）。
- インデックスは `data-each-before` / `data-each-after` の固定要素を除いた、**行だけの並び**で数えます。
- リスト全体を 1 回で受け取りたい場合は `haori:eachupdate` を使います。行イベントは行数だけ発火するため、大きなリストでは購読側の処理量に注意してください。
- 外部ライブラリの初期化・後片付けが目的であれば、行イベントを購読する代わりに `data-enhance` の宣言を使えます。

#### `haori:rowadd`

行が追加された時に発火します。行の内容（`{{...}}` の補間や入れ子の `data-each`）の描画と、`data-form-list` 配下の入力欄への値の反映を終えてから発火するため、購読側から行内の DOM をそのまま参照できます。

```javascript
element.addEventListener('haori:rowadd', (event) => {
  console.log('キー:', event.detail.key)
  console.log('インデックス:', event.detail.index)
  console.log('データ:', event.detail.item)
})
```

**detail**:
```typescript
{
  key: string
  index: number  // 新しい配列でのインデックス
  item: unknown  // 行の要素データ
}
```

#### `haori:rowremove`

行が削除された時に発火します。行が DOM から外れる**前**に発火します（外れた後では祖先へ伝播せず、コンテナで購読できないためです）。`event.target` から削除される行要素を参照できます。

```javascript
element.addEventListener('haori:rowremove', (event) => {
  console.log('キー:', event.detail.key)
  console.log('インデックス:', event.detail.index)
})
```

**detail**:
```typescript
{
  key: string
  index: number  // 削除前の並びでのインデックス
}
```

#### `haori:rowmove`

行が移動した時に発火します。差分更新で行の位置が実際に変わった場合だけ発火し、位置が変わらない行では発火しません。

```javascript
element.addEventListener('haori:rowmove', (event) => {
  console.log('キー:', event.detail.key)
  console.log('移動元:', event.detail.from)
  console.log('移動先:', event.detail.to)
})
```

**detail**:
```typescript
{
  key: string
  from: number  // 移動前のインデックス（削除の反映後・追加の反映前）
  to: number    // 新しい配列でのインデックス
}
```

### フェッチ

#### `haori:fetchstart`

フェッチ開始時に発火します。

```javascript
element.addEventListener('haori:fetchstart', (event) => {
  console.log('URL:', event.detail.url)
  console.log('オプション:', event.detail.options)
  console.log('ペイロード:', event.detail.payload)
  console.log('実行モード:', event.detail.runtime)
  console.log('要求メソッド:', event.detail.requestedMethod)
  console.log('実行メソッド:', event.detail.effectiveMethod)
})
```

**detail**:
```typescript
{
  url: string
  options?: RequestInit
  payload?: Record<string, unknown>
  runtime?: 'embedded' | 'demo'
  requestedMethod?: string
  effectiveMethod?: string
  transportMode?: 'http' | 'query-get'
  queryString?: string
}
```

`payload` は `data-{event}-data` / `data-{event}-form` から**収集した**送信データです。`data-{event}-before-run` が `fetchOptions` の `body` を上書きした場合、実際に送信される内容は上書き後の `body`（demo ランタイムでは `queryString`）であり、`payload` とは一致しません。実送信内容を見る場合は `options` と `queryString` を参照してください。

#### `haori:fetchend`

フェッチ終了時に発火します。

```javascript
element.addEventListener('haori:fetchend', (event) => {
  console.log('URL:', event.detail.url)
  console.log('ステータス:', event.detail.status)
  console.log('所要時間:', event.detail.durationMs)
})
```

**detail**:
```typescript
{
  url: string
  status: number
  durationMs: number  // ミリ秒
}
```

#### `haori:fetcherror`

フェッチエラー時に発火します。

```javascript
element.addEventListener('haori:fetcherror', (event) => {
  console.log('URL:', event.detail.url)
  console.log('エラー:', event.detail.error)
  console.log('ステータス:', event.detail.status)
  console.log('所要時間:', event.detail.durationMs)
})
```

**detail**:
```typescript
{
  url: string
  error: unknown
  status?: number
  durationMs?: number  // ミリ秒
}
```

### インポート

#### `haori:importstart`

HTMLインポート開始時に発火します。

```javascript
element.addEventListener('haori:importstart', (event) => {
  console.log('URL:', event.detail.url)
})
```

**detail**:
```typescript
{
  url: string
}
```

#### `haori:importend`

HTMLインポート終了時に発火します。

```javascript
element.addEventListener('haori:importend', (event) => {
  console.log('URL:', event.detail.url)
  console.log('バイト数:', event.detail.bytes)
  console.log('所要時間:', event.detail.durationMs)
})
```

**detail**:
```typescript
{
  url: string
  bytes: number
  durationMs: number  // ミリ秒
}
```

#### `haori:importerror`

HTMLインポートエラー時に発火します。

```javascript
element.addEventListener('haori:importerror', (event) => {
  console.log('URL:', event.detail.url)
  console.log('エラー:', event.detail.error)
})
```

**detail**:
```typescript
{
  url: string
  error: unknown
}
```

### 定期取得

#### `haori:polltimeout`

`data-poll-timeout` に到達した時に発火します。続けて `haori:pollstop` が発火します。

```javascript
element.addEventListener('haori:polltimeout', (event) => {
  console.log('実行回数:', event.detail.count)
  console.log('経過時間:', event.detail.elapsedMs)
})
```

**detail**:
```typescript
{
  count: number      // それまでの実行回数
  elapsedMs: number  // ポーリング開始からの経過時間（ミリ秒）
}
```

#### `haori:pollstop`

ポーリングが恒久停止した時に発火します。一時停止（`data-if` による非表示・`data-poll-disabled`）では発火しません。対象要素が DOM から外れた場合（`reason` が `'detached'`）は、要素が既に切り離されているため発火しません。

```javascript
element.addEventListener('haori:pollstop', (event) => {
  console.log('停止理由:', event.detail.reason)
})
```

**detail**:
```typescript
{
  reason: 'until' | 'timeout' | 'error' | 'detached'
  count: number      // 実行回数
  elapsedMs: number  // ポーリング開始からの経過時間（ミリ秒）
}
```

`data-on` で宣言的に受け取ることもできます。

```html
<div data-on="haori:polltimeout"
  data-on-data='{"expired":true}' data-on-bind="#page-state" data-on-bind-merge></div>
```

---

## パブリックAPI

### エクスポート (index.ts)

```typescript
// クラス
export {
  Core,      // コア機能
  Enhance,   // 外部ライブラリ連携（data-enhance）
  Env,       // 環境管理
  Fragment,  // Fragment基底クラス + ElementFragment, TextFragment
  Form,      // フォーム操作
  Haori,     // ユーティリティ
  Log,       // ログ出力
  Queue      // 非同期キュー
}

// 型
export type {HaoriRuntime} from './env'
export type {Enhancer} from './enhance'

// 関数: すべてのレンダリングタスク（追従投入分を含む）の完了を待つ
export const waitForRenders: () => Promise<void>

// 外部ライブラリ連携の登録窓口
export const enhancers: typeof Haori.enhancers

// デフォルトエクスポート
export default Haori

// バージョン
export const version: string
```

### ブラウザのグローバル (`window.Haori`)

`<script src=".../haori.iife.js">` で読み込んだ場合、グローバル `Haori` は
**`Haori` クラスそのもの**です。したがってクラスの静的メソッドを直接呼べます。

```javascript
Haori.addErrorMessage(element, '入力が不正です')
Haori.clearMessages(element)
await Haori.waitForRenders()
Haori.enhancers.register('choices', {init, refresh, destroy})
```

名前空間側のエクスポート（`Core` / `Enhance` / `Env` / `Form` / `Fragment` /
`Log` / `Queue` / `version`）は、同じグローバルのプロパティとして参照します。

```javascript
Haori.Core.dumpScope(element)
Haori.version // '0.45.2'
```

`Haori.Haori` と `Haori.default` はグローバル自身への自己参照です
（`Haori.Haori === Haori`）。0.37.1 以前のグローバルはモジュールの名前空間
オブジェクトで、クラス API を `Haori.Haori.addMessage(...)` のように 2 段で
取り出す必要がありました。その書き方は自己参照によって引き続き動作します。

ES Module（`import`）では名前空間の形が変わらないため、クラスは
`import Haori from 'haori'`、個別のクラスは
`import {Core, Env} from 'haori'` で取り出します。

### Core クラス

```typescript
class Core {
  // 初期化
  static scan(element: HTMLElement): Promise<void>

  // 属性処理
  static setAttribute(element: HTMLElement, name: string, value: string | null): Promise<void>

  // バインディング
  static setBindingData(element: HTMLElement, data: Record<string, unknown>, options?: SetBindingDataOptions): Promise<void>
  static getBindingData(element: HTMLElement, options?: {resolved?: boolean}): Record<string, unknown> | null
  static parseDataBind(data: string): Record<string, unknown>

  // DOM操作
  static addNode(parentElement: HTMLElement, node: Node): void
  static removeNode(node: Node): void
  static changeText(node: Text | Comment, text: string): void
  static changeValue(element: HTMLElement, value: string): Promise<void>

  // 評価
  static evaluateAll(fragment: ElementFragment): Promise<void>
  static evaluateText(fragment: TextFragment): Promise<void>
  static evaluateIf(fragment: ElementFragment): Promise<void>
  static evaluateEach(fragment: ElementFragment): Promise<void>

  // デバッグ（スコープ解決の確認）
  static dumpScope(element: HTMLElement): {
    resolved: Record<string, unknown>
    sources: Record<string, {value: unknown; source: string; kind: 'bind' | 'derive'; depth: number}>
  }
}
```

`dumpScope` は対象要素に解決されるスコープ（`resolved`）と、各キーがどの要素・種類（`bind` / `derive`）に由来するか（`sources`）を返します。開発モード（`Dev.enable()`）時はコンソールにも出力します。ブラウザのグローバルからは `Haori.Core.dumpScope(element)` で利用できます。なお、フォームの入力値（`name` 属性）は変更（change）や明示的な同期まで binding に反映されないため、初期表示時点では同名の識別子は外側のスコープにフォールバックして解決されます。

### Fragment クラス

```typescript
class Fragment {
  static get(node: Node): Fragment | null

  clone(): Fragment
  remove(unmount?: boolean): Promise<void>
  mount(): Promise<void>
  unmount(): Promise<void>
  isMounted(): boolean
  setMounted(mounted: boolean): void
  getTarget(): Node
  getParent(): ElementFragment | null
  setParent(parent: ElementFragment | null): void
}

class ElementFragment extends Fragment {
  // 子要素管理
  getChildren(): Fragment[]
  getChildElementFragments(): ElementFragment[]
  pushChild(child: Fragment): void
  removeChild(child: Fragment): void
  getPrevious(): ElementFragment | null
  getNext(): ElementFragment | null

  // 属性管理
  setAttribute(name: string, value: string | null): Promise<void>
  removeAttribute(name: string): Promise<void>
  getAttribute(name: string): string | false | unknown | null
  getRawAttribute(name: string): string | null
  hasAttribute(name: string): boolean
  getAttributeNames(): string[]
  closestByAttribute(name: string): ElementFragment | null

  // バインディングデータ
  getBindingData(): Record<string, unknown>
  getRawBindingData(): Record<string, unknown> | null
  setBindingData(data: Record<string, unknown>): void
  clearBindingDataCache(): void

  // 値管理
  getValue(): string | number | boolean | null
  setValue(value: string | number | boolean | null): Promise<void>
  clearValue(): void

  // 表示制御
  isVisible(): boolean
  show(): Promise<void>
  hide(): Promise<void>

  // テンプレート管理
  getTemplate(): ElementFragment | null
  setTemplate(template: ElementFragment | null): void

  // リストキー管理
  getListKey(): string | null
  setListKey(key: string): void

  // DOM操作
  insertBefore(newChild: Fragment, referenceChild: Fragment | null): Promise<void>
  insertAfter(newChild: Fragment, referenceChild: Fragment | null): Promise<void>
}
```

### Form クラス

```typescript
class Form {
  static getValues(form: ElementFragment): Record<string, unknown>
  static setValues(form: ElementFragment, values: Record<string, unknown>, force?: boolean): Promise<void>
  static reset(fragment: ElementFragment): Promise<void>
  static addErrorMessage(fragment: ElementFragment, key: string, message: string): Promise<void>
  static addMessage(fragment: ElementFragment, key: string, message: string, level?: 'info' | 'warning' | 'error' | 'success'): Promise<void>
  static clearMessages(fragment: ElementFragment): Promise<void>
  static findFragmentsByKey(fragment: ElementFragment, key: string): ElementFragment[]
  static getFormFragment(fragment: ElementFragment): ElementFragment | null
}
```

### Haori クラス

```typescript
class Haori {
  static dialog(message: string): Promise<void>
  static toast(message: string, level?: 'info' | 'warning' | 'error' | 'success'): Promise<void>
  static confirm(message: string): Promise<boolean>
  static openDialog(element: HTMLElement): Promise<void>
  static closeDialog(element: HTMLElement): Promise<void>
  static addErrorMessage(target: HTMLElement | HTMLFormElement, message: string): Promise<void>
  static addMessage(target: HTMLElement | HTMLFormElement, message: string, level?: 'info' | 'warning' | 'error' | 'success'): Promise<void>
  static clearMessages(parent: HTMLElement): Promise<void>

  // 初期化・描画の完了待ち（テスト等で利用）
  static waitForRenders(): Promise<void>
}
```

`waitForRenders` は、初期化・進行中のフェッチ・キューに積まれた描画タスクがすべて落ち着くまで待機します。E2E テスト等で描画完了を待つのに使います（例: `await page.evaluate(() => Haori.waitForRenders())`）。ESM では `import {waitForRenders} from 'haori'` でも利用できます。

### Queue クラス

```typescript
class Queue {
  static enqueue(task: () => unknown, prepend?: boolean): Promise<unknown>
  static wait(): Promise<void>
}
```

### Log クラス

```typescript
class Log {
  static info(message: string, ...args: unknown[]): void   // 開発モードのみ
  static warn(message: string, ...args: unknown[]): void   // 開発モードのみ
  static error(message: string, ...args: unknown[]): void  // 常に出力
}
```

### Env クラス

```typescript
class Env {
  static detect(): void
  static get runtime(): 'embedded' | 'demo'
  static setRuntime(runtime: string): void
  static get prefix(): string  // デフォルト: 'data-'
}
```

---

## 内部実装詳細

### WeakMapキャッシュ

Haori.jsはNode→Fragmentのマッピングに `WeakMap` を使用します。これにより:

- メモリリーク防止 (DOMノード削除時に自動ガベージコレクション)
- 高速なFragment取得
- 同じノードに対して常に同じFragmentインスタンスを返す

```typescript
protected static readonly FRAGMENT_CACHE = new WeakMap<Node, Fragment>()

static get(node: Node): Fragment | null {
  return Fragment.FRAGMENT_CACHE.get(node) ?? null
}
```

### 式評価のキャッシング

式評価関数は `Map` にキャッシュされます。キャッシュキーは「式 + バインドキーのソート済みリスト」です。

```typescript
private static readonly EXPRESSION_CACHE = new Map<string, Function>()

// キャッシュキー例: "user.name:user,config,items"
const cacheKey = `${expression}:${bindKeys.sort().join(',')}`
```

これにより、同じ式とバインドキーの組み合わせでは関数を再生成せず、パフォーマンスが向上します。

### 差分検出アルゴリズム

`data-each` の差分検出は以下のステップで行われます:

1. **キー生成**: `data-each-key` で指定されたプロパティ、または `crypto.randomUUID()`
2. **削除検出**: 既存キーが新リストに存在しない → 削除
3. **追加検出**: 新キーが既存リストに存在しない → テンプレートから複製
4. **移動検出**: キーは存在するが位置が異なる → 移動
5. **データ更新**: 各行のバインディングデータを更新
6. **DOM反映**: `insertBefore()` で正しい位置に配置

このアルゴリズムにより、最小限のDOM操作で効率的に更新できます。

### フレーム単位の処理制限

`Queue` は1フレームあたり最大8msの処理時間制限を設けています:

```typescript
const startTime = performance.now()
const MAX_BUDGET = 8  // 1フレームあたりの最大処理時間(ms)

while (queue.length > 0) {
  if (performance.now() - startTime > MAX_BUDGET) {
    break  // 次のフレームへ
  }

  // タスク実行...
}
```

これにより:
- 60fpsを維持 (1フレーム = 16.67ms、うち8msをHaori.jsに割り当て)
- ブラウザの描画をブロックしない
- ユーザー操作のレスポンス性を維持

---

## セキュリティ

### XSS対策

#### 0. 脅威モデル（前提）

**式のテキストは、開発者が書くコードです。** `{{ }}` や `data-if` などの属性へ書いた式は信頼境界の**内側**にあり、Haori は式テキストを悪意ある入力から守る境界ではありません。前提は次の 3 点です。

- **値は安全側です。** 利用者入力や API 応答を `data-bind` の**値**として渡す限り、式はそれをデータとして扱います。値からコードにはなりません。
- **式テキストへ差し込まないでください。** サーバ側テンプレートで利用者入力を Haori の属性値へ埋め込み、その結果を式として評価する構成は、任意コード実行になり得ます。**HTML エスケープは式のエスケープではありません**。`'` を `&#39;` にしても HTML パーサが属性値を読む時点で `'` に戻すため、式の文字列リテラルの外へ出られます。利用者入力は `data-bind` の値として渡し、式からはキーで参照してください。
- **以下のレイヤーは多層防御です。** 事故（開発者の書き間違い、意図しない値の流入）を難しくするための遮断であり、**単独の防御境界として依存しないでください**。式は最終的に `new Function` で評価されるため、遮断は許可リストではなく禁止リストによる緩和です。同じ理由で、Haori を使うページの CSP は `unsafe-eval` を必要とします。

同じ前提は `data-{event}-run` / `-before-run` / `-after-run` にも当てはまります（こちらは遮断すらせず、書いたコードをそのまま実行します。後述の「6. 実 JS 実行属性」を参照）。

#### 1. 式評価の制限

禁止識別子を `undefined` で上書き:

```typescript
const assignments = FORBIDDEN_NAMES.map(name => `const ${name} = undefined`).join(';\n')
const body = `"use strict";\n${assignments};\nreturn (${expression});`
```

#### 2. strict モード

`eval` と `arguments` の使用を禁止:

```typescript
"use strict";
// eval() は使用不可
// arguments[] は使用不可
```

#### 3. 危険パターンの検出

正規表現で危険なパターンを検出:

```typescript
private static containsDangerousPatterns(expression: string): boolean {
  return /\beval\s*\(/.test(expression) || /\barguments\s*\[/.test(expression)
}
```

#### 4. バインドキーのフィルタリング

禁止識別子名のキーを除外:

```typescript
const bindKeys = Object.keys(bindedValues)
  .filter(key => !FORBIDDEN_NAMES.includes(key))
```

#### 5. HTMLエスケープ

`{{ }}` 式はデフォルトでエスケープ:

```typescript
if (type === ExpressionType.EXPRESSION) {
  const div = document.createElement('div')
  div.textContent = String(value)
  return div.innerHTML  // エスケープされたHTML
}
```

`{{{ }}}` を使用する場合は、**信頼できるデータのみ**に限定してください。

#### 6. 実 JS 実行属性（escape hatch）の注意

`data-{event}-before-run` / `data-{event}-after-run` / `data-{event}-run` は、サンドボックス式評価ではなく **`new Function` による実 JavaScript 実行**です。これらの属性値は上記の式評価の制限（禁止識別子・危険パターン検出など）の対象外であり、記述したコードがそのまま実行されます。

特に **`data-{event}-run` は `{{...}}` の展開結果を実行コードへ文字列結合**します（`before-run` / `after-run` は生の値を使うため `{{...}}` 展開は行いません）。そのため `data-{event}-run` の `{{...}}` に入れた値は JavaScript として実行されます。

```html
<!-- 危険: name が信頼できない文字列の場合に任意コード実行（XSS） -->
<button data-click-run="greet('{{name}}')">...</button>
<!-- name = "'); evilCode(); ('" → greet(''); evilCode(); ('') -->
```

- `data-{event}-run` の `{{...}}` には**自分で制御する信頼できる値のみ**（数値 index・自前採番 ID 等）を入れる。
- **API レスポンスやユーザー入力などの信頼できない文字列を `{{...}}` で差し込まない**。必要な場合は `data-bind` でスコープに置き、`data-{event}-run` から呼ぶ関数の内部で参照する。
- `before-run` / `after-run` / `run` の本体自体（コード部分）は静的なテンプレートに書き、動的な値はコードへ結合せずデータとして渡す。

### Content Security Policy (CSP)

Haori.jsは `new Function()` を使用するため、CSPで `unsafe-eval` が必要です:

```html
<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-eval';">
```

将来的には WebAssembly ベースの式評価への移行を検討中です。

---

## パフォーマンス最適化

### 1. 仮想DOM

DOMツリーを `Fragment` ツリーとして管理し、DOM操作を最小化:

- 属性の変更をキャッシュ
- 差分検出により不要な更新を回避
- バインディングデータの継承によりメモリ効率向上

### 2. 非同期キュー

`requestAnimationFrame` で描画タイミングに合わせて実行:

- フレームあたり8ms制限でUI応答性を維持
- タスクの優先度制御 (`prepend` オプション)
- 複数の変更をバッチ処理

### 3. キャッシング

- **式評価関数**: `Map` でキャッシュ
- **属性内容**: `AttributeContents` でキャッシュ
- **バインディングデータ**: `bindingDataCache` でキャッシュ
- **Fragment**: `WeakMap` でキャッシュ

### 4. 差分更新

`data-each` はキーベースの差分検出:

- 既存要素を可能な限り再利用
- 追加・削除・移動を最小限のDOM操作で実現
- テンプレートの複製により要素生成を効率化

### 5. 遅延評価

属性の評価優先順位:

1. 入力系属性 (`data-bind`, `data-url-param`)
2. 制御属性 (`data-if`, `data-each`)
3. 通常属性とテキストノード
4. 遅延属性 (`data-fetch`, `data-import`)

これにより、必要な順序で効率的に評価できます。

### パフォーマンス測定

開発モードでは、式評価の所要時間を要素・宣言ごとに集計できます。**集計は明示的に開始するまで行いません。** 集計は宣言 1 つごとに要素の識別子を組み立てる（祖先をたどり各段で兄弟の位置を数える）ため、常に集計すると宣言の多い画面で再描画のコストを押し上げます。

```javascript
window.__HAORI_EVALUATION_PROFILE__.start() // 集計を開始
// 計測したい操作を行う
window.__HAORI_EVALUATION_PROFILE__.snapshot() // 集計結果を取得
window.__HAORI_EVALUATION_PROFILE__.stop() // 集計を停止
window.__HAORI_EVALUATION_PROFILE__.reset() // 集計結果を破棄
```

各操作の所要時間はイベントでも取得できます:

```javascript
document.addEventListener('haori:fetchend', (event) => {
  console.log(`フェッチ所要時間: ${event.detail.durationMs}ms`)
})

document.addEventListener('haori:importend', (event) => {
  console.log(`インポート所要時間: ${event.detail.durationMs}ms`)
})
```

### スコープ診断（開発モード）

開発モードでは、`data-if` 式が falsy（非表示）と評価されたときに、その式と参照しているトップレベル識別子の解決値・由来（`dumpScope` の `sources`）をコンソールへ自動出力します。**出力するのは非表示へ切り替わった時点だけです。** `data-if` は再描画のたびに評価されるため、非表示のまま毎回出力すると、スコープ全体の解決と出力が再描画の回数だけ積み上がり、開発モードの再描画コストを支配してしまいます（開発モードはローカルホストで自動的に有効になります。[環境検出](#環境検出)を参照）。表示へ戻ってまた非表示になった場合は、状態が変わったので再度出力します。**新しく作られた要素は別の要素として扱います**（`data-each` の行を追加した場合など）。行の再利用（差分更新）では要素が変わらないため再出力しません。任意の時点のスコープは `Core.dumpScope(element)` で確認できます。`data-if="!(dialog?.id || id)"` が想定外に非表示になる場合に、`id` がどの要素（例: フォームの `name="id"` 入力）の値で解決されているかをそのまま確認でき、スコープ競合のデバッグに役立ちます。任意のタイミングでスコープを確認するには `Core.dumpScope(element)`（ブラウザからは `Haori.Core.dumpScope(element)`）を使います。

---

## 付録

### 環境検出

Haori.jsは以下のロジックで環境を検出します:

```typescript
// <script> タグから設定を取得
const scriptTag = document.querySelector('script[src*="haori"]')
const prefix = scriptTag?.getAttribute('data-prefix') || 'data-'
const devAttribute = scriptTag?.getAttribute('data-dev')
const strictBind = scriptTag?.hasAttribute('data-strict-bind')

// data-dev があればその値で決まる（false / off / 0 で無効、それ以外は有効）
// 無ければホスト名で判定する
const isDev = devAttribute !== null
  ? !['false', 'off', '0'].includes(devAttribute.trim())
  : ['localhost', '127.0.0.1', '::1'].includes(location.hostname) ||
    location.hostname.endsWith('.local')
```

**使用例**:

```html
<!-- プレフィックスをカスタマイズ -->
<script src="haori.js" data-prefix="haori-"></script>

<!-- デモ表示時の挙動を明示 -->
<script src="haori.js" data-runtime="demo"></script>

<!-- 開発モードを強制 -->
<script src="haori.js" data-dev></script>

<!-- 開発モードを明示的に無効化（ローカルホストでも無効になる） -->
<script src="haori.js" data-dev="false"></script>

<!-- 未解決参照を即時エラーとして報告する -->
<script src="haori.js" data-strict-bind></script>
```

開発モードは**ローカルホストでは既定で有効**です。開発モードの診断（[スコープ診断（開発モード）](#スコープ診断開発モード)など）は再描画のコストに乗るため、ローカルで本番相当の性能を測る場合は `data-dev="false"` を指定してください。

`data-strict-bind` は[未解決参照の診断](#未解決参照の診断)を厳格化するオプトインです。既定では未解決参照は正常系として扱い、開発モードで集約警告のみを出力します。

### demo ランタイムでの通信の正規化

`data-runtime="demo"` は、静的ファイルサーバ上でデモを動かすための実行モードです。body を伴うメソッドは静的ファイルサーバが受け付けられない（`405 Method Not Allowed` になる）ため、送信内容を**クエリ付き GET へ正規化**します。

| 項目 | 正規化の内容 |
| ---- | ------------ |
| メソッド | `GET` / `HEAD` / `OPTIONS` 以外を `GET` へ変更 |
| 送信データ | body ではなく URL のクエリ文字列へ載せる |
| `Content-Type` | 削除する |

- 対象は `data-runtime="demo"` のときだけです。既定の `embedded` では正規化しません。
- 正規化を行った場合、開発モードでは `Haori demo fetch normalization` の情報ログを出力します。`haori:fetchstart` の `requestedMethod` / `effectiveMethod` / `transportMode`（`query-get`）/ `queryString` でも確認できます。
- **`data-{event}-before-run` が `fetchOptions` を返してメソッドや body を上書きした場合も、送信直前に正規化を再適用します**。上書きが正規化を打ち消すと静的ファイルサーバへ実 POST が飛んで失敗するため、demo ランタイムでは常に正規化が優先されます。実際のメソッドで送る必要がある場合は `embedded` ランタイムを使用してください。
- 上書きされた body は、クエリ化できる形式であればクエリへ移します。JSON オブジェクト文字列・`application/x-www-form-urlencoded` 形式の文字列・`URLSearchParams`・`FormData`（文字列値のみ）が対象です。`Blob` や `File` などクエリ化できない内容は破棄し、開発モードで警告します。
- **上書きの body は送信データの「置き換え」です**。`data-{event}-data` / `data-{event}-form` から正規化でクエリへ移した値は引き継がず、上書きした body の内容だけがクエリになります（`embedded` ランタイムで body ごと差し替わるのと同じ扱い）。`data-{event}-fetch` の URL にもともと書いてあるクエリは残ります。ヘッダーだけを差し替えるなど body を伴わない上書きでは、正規化済みのクエリをそのまま保ちます。

### ブラウザ互換性

Haori.jsは以下のブラウザAPIを使用します:

- **必須**:
  - ES6+ (class, arrow function, Promise, async/await)
  - MutationObserver
  - WeakMap
  - requestAnimationFrame
  - Fetch API
  - URLSearchParams
  - DOMParser
  - CustomEvent

- **オプション**:
  - Popover API (`showPopover()`, `hidePopover()`) - トースト機能用
  - Dialog API (`<dialog>`, `showModal()`) - ダイアログ機能用

Popover APIが使用できない場合、`Haori.toast()` は動作しません。Polyfillまたは代替実装を検討してください。

### ライセンス

MIT License

---

## バージョン履歴

> 最新の変更履歴は、リポジトリ直下の [`CHANGELOG.md`](../../CHANGELOG.md) を参照してください（こちらが正典です）。以下は初期リリースの抜粋です。

### 0.1.5 (2026-04-23)

### Changed
- `data-bind` 更新や `data-each` 再利用時に、{{...}} を含む通常属性も再評価されるよう改善

### Library
- `evaluateAll` の通常属性再評価と、false / null 評価時の属性削除を確認する回帰テストを追加

### 0.1.4 (2026-04-22)

- data-click-data / data-fetch-data のテンプレート式評価を改善
- data 属性解釈を event / non-event で共通化し、テンプレート式と object 直返しの扱いを改善

### 0.1.3 (2026-04-21)

- data-each の tbody 描画と再描画の安定性を改善
- Bootstrap モーダル連携時の open / close 委譲を改善
- フォームメッセージ連携と関連テストを補強

### 0.1.2 (2026-04-09)

- 式評価の安全性改善
- DOM 挿入とテスト安定性の改善
- ドキュメントと版表記の整合
- ESLint 設定解決の改善

### 0.1.1 (2025-12-04)

- 全デモHTMLのhead/body構造を修正し、HTML構造を統一
- fetch / bind / each 系デモを中心に構成を整理
- 一部属性のテンプレート解釈・バインディング仕様を調整
- 内部ロジックのリファクタリングと軽微なバグ修正

### 0.1.0 (2025-11-21)

初回公開リリース

- HTML-First設計
- 仮想DOM実装
- リアクティブバインディング
- セキュアな式評価
- 差分検出による効率的な更新
- フォーム双方向バインディング
- イベント駆動アーキテクチャ

---

**End of Document**
