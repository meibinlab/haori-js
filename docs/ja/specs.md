# Haori.js 技術仕様書

バージョン: 0.11.1
最終更新: 2026-06-03

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
- **セキュアな式評価**: XSS対策を施した安全な式評価エンジン
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
5. **セキュリティファースト**: XSS対策を標準で組み込み
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
│  セキュアな式評価 (許可構文検証 + Proxyラップ + Function生成) │
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
├── expression.ts        - 式評価エンジン (セキュアな {{ }} 評価)
├── observer.ts          - DOM監視機能 (MutationObserver)
├── event.ts             - イベント発火ユーティリティ (haori:* イベント)
├── event_dispatcher.ts  - イベント振り分け (click, change, load)
├── procedure.ts         - 手続き的処理管理 (data-*-fetch等の実行)
├── form.ts              - フォーム双方向バインディング
├── queue.ts             - 非同期キュー管理 (requestAnimationFrame)
├── import.ts            - HTMLインポート機能
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
  ├─ url.ts
  ├─ import.ts
  └─ event.ts

fragment.ts (仮想DOM)
  ├─ queue.ts
  ├─ expression.ts
  └─ env.ts

observer.ts (DOM監視)
  ├─ core.ts
  └─ event_dispatcher.ts

procedure.ts (イベント処理)
  ├─ core.ts
  ├─ form.ts
  ├─ haori.ts
  └─ event.ts
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
  static setBindingData(element: HTMLElement, data: Record<string, unknown>): Promise<void>
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
  - `data-url-param`: URLパラメータバインド
  - `data-if`: 条件分岐評価
  - `data-each`: 繰り返し処理評価

2. **通常属性**: その他のすべての属性

3. **遅延属性** (優先属性・通常属性の後に処理)
   - `data-fetch`: Procedure実行
  - `data-import`: HTML読み込み

#### data-if の動作

- 判定の基準は内部状態であり、`style.display` や `data-if-false` は追随結果として扱う
- 評価値が `false`, `null`, `undefined`, `NaN` の場合、要素を非表示化
- 非表示時:
  - `style.display = 'none'` を設定
  - `data-if-false` 属性を付与
  - 子要素をDOMから除去 (unmount)
  - `haori:hide` イベント発火
- 表示時:
  - `style.display` を復元
  - `data-if-false` 属性を削除
  - 子要素をDOMに追加 (mount)
  - `haori:show` イベント発火
  - 子要素を再評価 (evaluateAll)

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
  child.setBindingData({
    [indexKey]: targetIndex,      // data-each-index指定時
    [argKey]: item,                // data-each-arg指定時 (プリミティブ値用)
    ...item                        // オブジェクトの場合は展開
  })
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

**役割**: セキュアな式評価エンジン

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

#### 評価メカニズム

```typescript
evaluate(expression: string, bindedValues: Record<string, unknown>): unknown {
  // 1. 空式と危険パターンをチェック
  if (expression.trim() === '' || this.containsDangerousPatterns(expression)) {
    return null
  }

  // 2. バインド値に禁止キーが含まれていないかチェック
  if (this.containsForbiddenKeys(bindedValues)) {
    return null
  }

  // 3. 禁止識別子を除外したバインドキーでキャッシュキーを作成
  const bindKeys = Object.keys(bindedValues)
    .filter(key => !FORBIDDEN_NAMES.includes(key))
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
4. バインド値を再帰的にチェックし、禁止キーを含む入力を拒否
5. plain object / array / function を Proxy でラップし、`constructor`、`__proto__`、`prototype` へのアクセスを遮断
6. 評価中のみ prototype 系プロパティの生アクセスを一時的に遮断

#### 組み込みヘルパー（予約名前空間 `haori`）

式評価エンジンは、純粋関数の組み込みヘルパー（`builtins.ts`）を予約名前空間 `haori` として式スコープへ注入します。実装は `src/builtins.ts`、注入は `Expression.evaluateDetailed` 内で行います。

- **注入条件**: 式が `haori` を独立した識別子として参照する場合のみ注入します（`/(^|[^\w$.])haori(?![\w$])/`）。参照しない式には引数も Proxy ラップも追加しません。`foo.haori` のようなプロパティアクセスは注入対象外です。
- **優先順位**: `data-bind` に `haori` キーがあっても、式中では組み込みが優先されます（バインド値は無視。開発モードでは `Log.warn` で警告）。
- **凍結との関係**: 公開 API 用の `Builtins` は `Object.freeze` 済みですが、凍結オブジェクトをそのまま注入すると評価時の Proxy ラップが Proxy 不変条件（read-only プロパティに別値を返せない）に違反するため、注入には非凍結の浅いコピーを用います。
- **提供関数**（公開 API `Haori.date` / `Haori.number` / `Haori.range` / `Haori.pages` / `Haori.monthAdd` / `Haori.monthRange` / `Haori.pageSummary` / `Haori.findBy` / `Haori.sum` / `Haori.distinct` / `Haori.groupBy` としても同一実装を提供。`monthRange` を `base` 省略で呼ぶ場合のみ現在月に依存し、それ以外は副作用なし・冪等）:
  - `haori.date(value, format?, timeZone?)`: ISO 文字列・エポックミリ秒・`Date` を整形（既定 `yyyy/MM/dd HH:mm`）。トークン `yyyy yy MM M dd d HH H mm ss`。空・不正値は空文字。`timeZone` を省略するとブラウザのローカル時刻で整形し、IANA タイムゾーン名（例 `Asia/Tokyo`）を指定するとそのタイムゾーンの時刻で整形する（`Intl.DateTimeFormat` を利用、24 時間表記）。`timeZone` が不正な名前の場合は空文字を返す。**トークンに使う英字（`y M d H m s`）はフォーマット中のどこにあってもトークンとして解釈される**ため、リテラルとして出したい英字はシングルクォートで囲む（例 `yyyy-MM-dd'T'HH:mm`、`''` はシングルクォート1文字）。`/ : -`・日本語などトークン外の文字はそのまま出力。
  - `haori.number(value, decimals?)`: 桁区切り付きで数値を整形（`Intl.NumberFormat`、`en-US`）。非数値・null・空文字・空白のみは空文字（数値文字列は前後空白を無視）。`en-US` ロケールは区切り文字（カンマ・ドット）を決めるだけで、小数桁は固定しません。`decimals` を指定するとその桁数で固定します（末尾ゼロ埋めあり。例 `number(1000, 2) → "1,000.00"`）。`decimals` を省略した場合は `Intl.NumberFormat` の既定に従い、整数はそのまま・小数は末尾ゼロ埋めなしで表示し、**小数は最大 3 桁まで（`maximumFractionDigits = 3`）に丸められます**（例 `number(1234.56789) → "1,234.568"`）。4 桁以上をそのまま出したい場合は `decimals` を明示してください。
  - `haori.range(start, end?, step?)`: 整数配列を生成（終端排他）。`range(n)`＝`[0..n-1]`。負の `step` で降順。要素数は上限で打ち切り。
  - `haori.pages(totalPages, current, {window?, boundary?})`: 省略記号付きの番号ページ列。`current` は 0 始まり。要素は `{page, label, active, ellipsis}`（`page` は 0 始まり、`label` は `page + 1`、省略記号は `{page: null, label: '…', active: false, ellipsis: true}`）。既定 `window: 2` / `boundary: 1`。**隠れるページが 1 つだけの場合は省略記号ではなくその番号を表示**する（ギャップが 2 のとき。例 `pages(5, 2, {window: 0})` → `1 2 [3] 4 5`）。
  - `haori.monthAdd(value, delta)`: `YYYY-MM` 形式の年月に月数を加算して `YYYY-MM` で返す。`Date` を介さず整数演算で計算するため**タイムゾーンの影響を受けない**。不正な入力（非 `YYYY-MM`・月が 1〜12 外）は空文字。`delta` が 0 のときは正規化（ゼロ埋め）して返す（例 `monthAdd('2026-12', 1) → '2027-01'`）。
  - `haori.monthRange(count, base?)`: 基準月から過去方向へ `count + 1` 個の `{targetMonth, label}`（`targetMonth` は `YYYY-MM`、`label` は `YYYY/MM`）を**降順**（新しい月が先頭）で返す。`base` 省略時は現在月（ローカル時刻）を基準にする。月セレクトや月次ナビゲーションの選択肢生成向け。要素数は上限（約 100 年分）で打ち切り。**`base` 省略時は現在月に依存する**ため、式の再評価で結果を固定したい場合は `base` を明示する。
  - `haori.pageSummary(page, visibleCount?)`: Spring Data の `Page` 相当（`number`・`size`・`totalElements`／`totalCount`）から表示サマリー `{start, end, total, empty}` を返す。`number` は 0 始まり。末尾ページの端数は `visibleCount`（指定時）→ `page.numberOfElements` → `size` の順で算出。総件数 0・非オブジェクトは `{start: 0, end: 0, total: 0, empty: true}`。`1 - 20 / 100 件` のような表示の算出元（例 `haori.pageSummary(view).start`）。
  - `haori.findBy(array, key, value)`: 配列から `item[key]` が `value` に一致する最初の要素を返す。比較は**文字列化**して行うため数値 ID と文字列 ID の差を吸収する。一致が無ければ `null`（非配列・空配列も `null`）。先頭フォールバックは式側で `haori.findBy(items, 'id', sel) ?? items[0]` と書く。
  - `haori.sum(array, key?)`: 配列の数値合計を返す。`key` 省略時は要素自体、指定時は `item[key]` を合計。数値化できない値（`null`・`undefined`・空文字・非数値・`NaN`）は無視し、数値文字列（例 `'12'`）は数値として扱う。非配列は `0`。集計行は `{{haori.number(haori.sum(rows, 'total'))}}` のように書く。
  - `haori.distinct(array, key?)`: 配列から重複を取り除いた新しい配列を返す。`key` 省略時は要素自体、指定時は `item[key]` で重複を判定する。比較は **`findBy`・`sum` と同様に文字列化**して行い、数値 ID と文字列 ID の差を吸収する（例 `1` と `'1'` は同一）。同じキーは**最初に出現した要素だけ**を残し、元の順序を保つ。非配列は空配列。明細レスポンスを「1 件 = 1 行」にまとめる用途（例 `data-each="haori.distinct(rows, 'orderId')"`）。
  - `haori.groupBy(array, key)`: 配列を `item[key]` ごとのグループへ分け、`{key, items}` の配列を返す。グループは**最初の出現順**、各グループ内の要素も元の順序を保つ。グループ判定は**文字列化**して行うが、`key` には最初に出現した要素の**生値**を格納する。非配列は空配列。`data-each` でグループ見出しと明細を宣言的に描画できる（外側 `data-each="haori.groupBy(rows, 'date')"`、内側 `data-each="[[items]]"`）。

`haori.date` / `number` / `range` / `pages` / `monthAdd` / `monthRange` / `pageSummary` / `findBy` / `sum` / `distinct` / `groupBy` は `Haori.date(...)` のように静的メソッドとしても公開されます。

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

#### 初期化フロー

```typescript
async init(): Promise<void> {
  // 1. document.head と document.body をスキャン（初期フェッチを含む）
  await Promise.allSettled([
    Core.scan(document.head),
    Core.scan(document.body)
  ])

  // 2. Queue に積まれた DOM 操作をすべて完了させる
  await Queue.wait()

  // 3. 初期化完了を示す属性を body に付与
  document.body.setAttribute('data-haori-ready', '')

  // 4. それぞれに MutationObserver を設定
  Observer.observe(document.head)
  Observer.observe(document.body)

  // 5. EventDispatcher を開始
  new EventDispatcher(document).start()

  // 6. IntersectObserver でツリーを同期
  IntersectObserver.syncTree(document.body)
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
  redirectReturnParam?: string | null        // 戻り先リダイレクトのクエリ名
  scrollOnError?: boolean | null             // エラー時に最初のエラー要素へスクロール
  scrollTarget?: string | null               // 成功時にスクロールする要素のCSSセレクター
}
```

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

  // 11. UI表示
  if (this.dialogMessage) {
    await Haori.dialog(this.dialogMessage)
  }
  if (this.toastMessage) {
    await Haori.toast(this.toastMessage, 'info')
  }

  // 12. スクロール（成功時）
  if (this.scrollTarget) {
    document.querySelector(this.scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  // 13. リダイレクト（redirectReturnParam があれば安全なローカルパスのみ採用）
  if (this.redirectUrl) {
    let destination = this.redirectUrl
    if (this.redirectReturnParam) {
      const raw = new URLSearchParams(window.location.search).get(this.redirectReturnParam)
      if (raw !== null) {
        const trimmed = raw.trim()
        if (Url.isSafeLocalPath(trimmed)) {
          destination = trimmed
        } else {
          Log.warn('Haori', `戻り先パスが安全なローカルパスではないため、既定の遷移先へフォールバックします: ${raw}`)
        }
      }
    }
    window.location.href = destination
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
    // FormData
    const formData = new FormData()
    Object.entries(payload).forEach(([key, value]) => {
      formData.append(key, value instanceof Blob ? value : String(value))
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

また、フォーム要素自身に対して `Core.setBindingData()` や `data-fetch` が実行された場合は、フォーム配下の入力要素へ無イベントで逆方向同期します。このとき text input / textarea / select は `value` を更新し、checkbox / radio は `Form.setValues()` と同じ規則で checked 状態を反映します。

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

それ以外の checkbox は従来どおり `value` 属性の文字列値を返し、未チェック時は `null` を返します。

`type="number"` の `<input>` は値を**数値型**として収集・バインドします。HTML の `input.value` は常に文字列ですが、DTO が `Double` / `Integer` 等を期待する場合に文字列で送られるのを避けるため、内部値を数値へ正規化します（`ElementFragment.normalizeValueForElement`）。正規化は内部値へ値を取り込むすべての経路で行われます。すなわち `syncValue()`（DOM→内部値。`change` および構築時）、`applyValue()`（バインド→内部値）、および `value` 属性のテンプレート評価（`value="{{...}}"`）で正規化され、`Form.getValues()` の結果や JSON 送信ボディに数値として現れます。なお `data-attr-value` は仕様上 `input.value`（内部値）を同期しないため対象外です。フォームで収集したい数値フィールドは `name`＋フォームの `data-bind`（双方向バインド）または `value="{{...}}"` を使ってください。

- 空文字・`null`・数値化できない値は `null`
- 小数（例 `"2.5"`）はそのまま数値（`2.5`）
- `type="number"` 以外の入力（`text` 等）は従来どおり文字列のまま

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
    parent.removeAttribute('data-message')
    parent.removeAttribute('data-message-level')
    parent.querySelectorAll('[data-message]').forEach(el => {
      el.removeAttribute('data-message')
      el.removeAttribute('data-message-level')
    })
  })
}
```

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

#### プレースホルダ解決規則

プレースホルダは、属性やノードの種類に応じて以下の共通規則で扱います。

**用語**:
- **プレースホルダ単体**: 値全体が 1 つの `{{ ... }}` で構成されるケースです。式の型を保持します。
- **文字列埋め込み**: 固定文字列と `{{ ... }}` が混在するケースです。最終結果は文字列として扱います。
- **未解決参照**: 式評価時に参照先が存在せず解決できない状態です。`null`、`false`、`undefined` とは区別します。

**評価順**:
1. `data-bind` と `data-url-param` のような入力系属性を先に反映します。
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

- `value`（テキスト系 input / textarea / select）: `input.value` を同期します。
- `checked`（radio / checkbox）・`selected`（option）: それぞれ `element.checked` / `option.selected` を同期します。

いずれも**操作中（フォーカス中）の要素には再適用しません**。別要素起因の再評価や `data-fetch` 完了で、ユーザーの未コミット入力・選択が巻き戻るのを防ぐためです。`value` は対象入力自身、`checked` はその input 自身、`selected` は所属する `<select>` がフォーカス中かで判定します。フォーカスが外れていれば次回以降の再評価で宣言状態を反映します。コミット済みの値は `change`（または `input`）イベントでバインド側へ反映されます。

これは `value="{{式}}"` のように属性へ直接 `{{...}}` を書いた場合も同様です。

未解決参照の扱いは、上記「プレースホルダ解決規則」のブラウザ先行解釈属性に従います。特に文字列埋め込みで未解決参照が 1 つでも含まれる場合は、属性全体を未反映とします。

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

**イベント**:
- `haori:show` (表示時)
- `haori:hide` (非表示時)

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
- `data-each-key`: 一意キープロパティ名 (差分検出用)
- `data-each-index`: インデックスのバインド名
- `data-each-before`: ループ前に表示する要素をマーク
- `data-each-after`: ループ後に表示する要素をマーク
- `data-row`: 各行に自動付与されるキー (手動変更禁止)
- `data-each-visible`: スクロール追従の可視行範囲を組み込み変数として公開（後述）
- `data-each-done`: 全行の描画が安定して完了したときに **Haori が自動付与**するマーカー（手動指定不可）。新しい描画サイクルの開始時に外され、完了時に再付与されます。E2E テスト等で `[data-each-done]` の出現を待って描画完了を検知できます

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
- **性能**: 公開は in-memory スコープのみ更新し、`data-bind` 属性への全データ直列化（`JSON.stringify`）は**抑止**します（`Core.setBindingData(..., reflectToAttribute=false)`）。これにより公開先スコープが `content` などの大配列を保持していても、スクロールのたびに大配列が再直列化されることはありません。再評価は一覧本体フラグメントを `skipFragments` で枝刈りするため、コストはフッタ側（行数非依存）のみです。監視コールバックは境界を跨いだ行のみ発火（スクロール停止中はゼロ）。各行を監視するため監視登録メモリは描画済み行数に比例し、極端な大量行では行仮想化の併用を推奨します。
- **属性ミラー・通知**: 可視範囲変数は実行時の一時値のため `data-bind` 属性には反映されません（`Haori.Core.getBindingData(...)` の in-memory 値では参照可能）。属性は次回の通常バインド更新時に最新 in-memory から反映されます。また高頻度更新による通知の氾濫を避けるため、公開時に **`haori:bindchange` イベントは発火しません**（公開先要素で `data-on` 等のバインド変更通知は受け取れません）。
- **初期値**: 変数は初回フレームで公開されるため、最初の描画直後の一瞬は未定義になり得ます。フッタ式は `{{vr.firstLabel}}`（未定義時は空表示）か `data-if` でガードしてください。

**例**:

```html
<div data-fetch="/api/items?page=[[page]]">
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
- `data-fetch-data`: 送信データ
- `data-fetch-form`: フォーム要素のセレクタ
- `data-fetch-bind`: バインド先セレクタ (デフォルト: 自要素)
- `data-fetch-arg`: バインドキー名（`data-fetch-bind-arg` と同義。こちらが優先）
- `data-fetch-bind-arg`: バインドキー名（`data-fetch-arg` の別名。`data-fetch-arg` が無い場合に参照）
- `data-fetch-bind-params`: 抽出パラメータ (&区切り)

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

#### `data-form-detach`

バインディングから除外します。

```html
<input name="password" data-form-detach>
<!-- getValues() で取得されない -->
```

#### `data-form-arg`

フォーム値をバインドするキー名を指定します。

```html
<form data-form-arg="formData">
  <input name="username">
</form>
<!-- バインディングデータ: { formData: { username: "..." } } -->
```

#### `data-message` / `data-message-level`

メッセージを表示します。フェッチエラー時に自動設定されます。
`data-message-level` でメッセージのレベルを表します（CSS でのスタイリングに使用）。

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

`input` は逐次（1文字ごと）に発火するため、`data-input-*` を**明示した要素のみ**を対象とします（オプトイン）。`change` と同様に、`data-input-form` の指定がなくても自動的に先祖フォームを検出して入力値を双方向バインディングへ反映します。検索欄の逐次絞り込みなどに利用できます。

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

#### 処理順序

イベント属性は以下の順序で実行されます:

1. `data-{event}-validate`: バリデーション実行
2. `data-{event}-confirm`: 確認ダイアログ表示
3. `data-{event}-reset-before`: 送信前のリセット処理実行
4. `data-{event}-data` / `data-{event}-form`: データ取得
5. `data-{event}-before-run`: フェッチ前スクリプト実行
6. `data-{event}-fetch`: HTTP通信実行
7. `data-{event}-after-run`: フェッチ後スクリプト実行
8. `data-{event}-bind`: データバインド実行
9. `data-{event}-adjust`: 値調整実行
10. `data-{event}-row-add` / `data-{event}-row-remove` / `data-{event}-row-prev` / `data-{event}-row-next`: 行データの変更
11. `data-{event}-reset`: リセット処理実行
12. `data-{event}-copy` / `data-{event}-copy-params`: 別要素へバインディング値をコピー
13. `data-{event}-refetch`: 再フェッチ実行
14. `data-{event}-click`: クリック実行
15. `data-{event}-open` / `data-{event}-close`: ダイアログ操作
16. `data-{event}-dialog` / `data-{event}-toast`: メッセージ表示
17. `data-{event}-history`: 履歴 pushState 実行
18. `data-{event}-redirect`: リダイレクト実行

なお `data-{event}-run`（フェッチを伴わない任意 JS 実行）は、`event.preventDefault()` を有効にするため、上記 2（confirm）より前の**同期タイミング**で実行されます。`data-{event}-fetch` と併用した場合は run → fetch の順になります。

また `data-{event}-prevent` は上記の手続き順序とは独立に、イベントの委譲（`EventDispatcher.delegate`）の**最初の同期段**で `event.preventDefault()` を呼びます。手続き本体（fetch 等）の成否や `await` に依存せずネイティブのデフォルト動作を抑止するためで、`data-{event}-defer` で手続きを遅延させても抑止は確実に効きます。

#### 交差監視トリガー (`data-intersect-*`)

`data-intersect-*` は `IntersectionObserver` によって発火する専用トリガー属性です。`click` / `change` / `load` の DOM イベントとは別に、要素が監視領域へ入ったことをきっかけに Procedure を実行します。主な用途は無限スクロール、一覧の先読み、遅延読み込みです。

`data-intersect-*` では次の属性を使用します。

1. `data-intersect-fetch`: 交差時に HTTP 通信を開始
2. `data-intersect-fetch-method`: HTTP メソッドを指定
3. `data-intersect-fetch-headers`: リクエストヘッダーを指定
4. `data-intersect-fetch-content-type`: Content-Type を指定
5. `data-intersect-fetch-data` / `data-intersect-fetch-form`: 送信データを構築
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

#### バリデーションと確認

##### `data-{event}-validate`

フォームバリデーションを実行します。バリデーション失敗時は処理を中断します。

```html
<form id="myForm">
  <input name="email" type="email" required>
</form>
<button data-click-validate data-click-form="#myForm">送信</button>
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

**戻り値**:
- `false` または `{ stop: true }`: 処理を中断
- `{ fetchUrl, fetchOptions }`: フェッチ設定を上書き

```html
<button
  data-click-fetch="/api/data"
  data-click-before-run="console.log('フェッチ開始'); return true"
>
  取得
</button>
```

##### `data-{event}-after-run`

フェッチ後に実行するスクリプトを指定します。

**戻り値**:
- `false` または `{ stop: true }`: 以降の処理を中断
- `{ response }`: バインド対象レスポンスを上書き

```html
<button
  data-click-fetch="/api/data"
  data-click-after-run="console.log('取得完了', arguments[0])"
>
  取得
</button>
```

##### `data-{event}-run`

フェッチを伴わないイベント時に、任意の JavaScript を実行します。`data-click-run` / `data-change-run` などイベント種別ごとに利用できます。クライアント側の状態操作や関数呼び出しのために、`document.addEventListener('click', ...)` 等の独自ハンドラを書かずに済ませるための属性です。

- **実行方式**: 属性値を本体として `new Function('event', "use strict"; body)` で実行します（`before-run` / `after-run` と同じ実 JS 実行。サンドボックス式評価ではありません）。`this` は起点要素、引数 `event` は起点の DOM イベントです。
- **`{{...}}` の展開**: 属性値に含まれる `{{...}}` は、他の属性と同様にレンダリング時に評価・展開され、展開後の文字列が本体として実行されます（`{{...}}` 部分のみバインディングスコープを参照できます）。
- **戻り値による既定動作の抑止**: 本体が **`false` を返したときだけ `event.preventDefault()`** を呼びます（`onclick="return false"` / jQuery と同じ慣習）。`<a href>` や `type="submit"` の既定動作を抑止したい場合は `return false` を返してください。`type="button"` など既定動作が無い要素では不要です。
- **実行タイミング**: 手続きの同期実行中（`await` を挟む前）に実行されるため、`event.preventDefault()` が間に合います。`data-click-fetch` と併用した場合は **run を実行してから fetch** を継続します（run の `false` は preventDefault のみを制御し、fetch は中止しません。fetch を中止する場合は `data-{event}-before-run` を使用）。
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

##### `data-{event}-row-add`

対象要素が属する行の後に新しい行を追加します。追加された行のフォーム要素は空の状態にリセットされます。

```html
<div data-each="items" data-each-arg="item">
  <input name="name" value="{{item.name}}">
  <button data-click-row-add>行追加</button>
</div>
```

##### `data-{event}-row-remove`

対象要素が属する行を削除します。ただし、リスト内に1行しか存在しない場合は削除されません。

```html
<button data-click-row-remove>削除</button>
```

##### `data-{event}-row-prev`

対象要素が属する行と前の行を入れ替えます。

```html
<button data-click-row-prev>↑</button>
```

##### `data-{event}-row-next`

対象要素が属する行と次の行を入れ替えます。

```html
<button data-click-row-next>↓</button>
```

##### `data-{event}-reset`

対象要素をリセットします (値の初期化、複製削除、メッセージ除去)。

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
- `data-{event}-form` がない場合は、イベント発火元要素の `data-bind` / 継承済み bindingData をコピー元に使用
- コピー先の既存バインディング値は保持しつつ、同名キーだけを上書き
- コピー先が `<form>` の場合は `data-bind` 更新後に入力要素へも同期
- `data-{event}-copy-params` で指定したキーがコピー元に存在しない場合も、コピー先の既存値は保持

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
- それ以外の要素の場合は、その要素の binding（継承済み bindingData を含む）を使用します。
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

##### `data-{event}-close`

対象ダイアログを閉じます。

```html
<dialog id="myDialog">
  <p>ダイアログ内容</p>
  <button data-click-close="#myDialog">閉じる</button>
</dialog>
```

##### `data-{event}-dialog`

ダイアログメッセージを表示します。

```html
<button data-click-fetch="/api/save" data-click-dialog="保存しました">
  保存
</button>
```

##### `data-{event}-toast`

トーストメッセージを表示します (3秒表示)。

```html
<button data-click-fetch="/api/save" data-click-toast="保存しました">
  保存
</button>
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
- `data-{event}-history` が指定されている場合、その値をベース URL にする（相対パス可）
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

---

##### `data-{event}-redirect`

指定URLにリダイレクトします。

```html
<button
  data-click-fetch="/api/create"
  data-click-redirect="/success"
>
  作成
</button>
```

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

- **`data-{event}-redirect` と併用**し、その既定遷移先を「安全な戻り先で上書きする」修飾子として動作します。**`data-{event}-redirect` が無い場合は本属性を無視**します（オプトイン。属性が無ければ従来どおり `data-{event}-redirect` のみが動作し、既存挙動は不変）。
- 手続きが**成功**したとき、現在ページ URL から指定クエリ名の値を `URLSearchParams.get()` で**1回だけ**デコードして読み取ります（二重デコードによる検証回避を防ぐため、追加のデコードは行いません）。
- 読み取った値を**こちら側で `trim()`** したうえで、**安全な同一オリジンのローカルパス**であればそこへ遷移します。安全でない／値が無い場合は `data-{event}-redirect`（静的な既定遷移先）へフォールバックします。
- **「安全なローカルパス」の判定（ライブラリ内蔵）**: `trim()` 後の値が**単一の `/` で始まる**こと。`//`・`/\`（ともにプロトコル相対と解釈され得る）、スキームやオーソリティを含むものは拒否します（さらに現在オリジンを基準に解決したオリジンが一致することも確認します）。判定 NG の場合は `Log.warn('Haori', ...)` で警告してフォールバックします。
- 許可は**同一オリジンの相対パスのみ**（外部遷移は常に不可）とし、オープンリダイレクトをライブラリ側で構造的に防ぎます。
- 全 `{event}`（click / submit / change 等）と全 fetch 経路で一貫して利用できます。`data-{event}-history` と併用する場合の実行順は既存 redirect と同様です。

#### クリック実行制御

以下は `click` イベント専用の制御属性です。

##### `data-click-no-disabled`

`click` 手続きの実行中、起点要素に `disabled` 属性を**付与しない**ようにします。

通常、`click` 手続きの実行中は起点要素に `disabled` 属性が付与され、二重実行を防ぎます。しかし Bootstrap など他ライブラリの click ハンドラや CSS は `disabled` 要素を無視するため、トグル系の機能が動かなくなることがあります。本属性を付けると `disabled` を付与せず、Haori 内部のマーカーで多重実行のみを防止します（CSS による実行中スタイルの切り替えは行えません）。

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

Haori.js初期化完了時に発火します。

```javascript
document.addEventListener('haori:ready', (event) => {
  console.log('Haori.js準備完了', event.detail.version)
})
```

**detail**:
```typescript
{ version: string }
```

#### `haori:render`

要素がレンダリングされた時に発火します。

```javascript
element.addEventListener('haori:render', (event) => {
  console.log('レンダリング完了')
})
```

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
}
```

#### `haori:rowadd`

行が追加された時に発火します。

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
  index: number
  item: unknown
}
```

#### `haori:rowremove`

行が削除された時に発火します。

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
  index: number
}
```

#### `haori:rowmove`

行が移動した時に発火します。

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
  from: number
  to: number
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

---

## パブリックAPI

### エクスポート (index.ts)

```typescript
// クラス
export {
  Core,      // コア機能
  Env,       // 環境管理
  Fragment,  // Fragment基底クラス + ElementFragment, TextFragment
  Form,      // フォーム操作
  Haori,     // ユーティリティ
  Log,       // ログ出力
  Queue      // 非同期キュー
}

// 型
export type {HaoriRuntime} from './env'

// 関数: すべてのレンダリングタスク（追従投入分を含む）の完了を待つ
export const waitForRenders: () => Promise<void>

// デフォルトエクスポート
export default Haori

// バージョン
export const version = '0.10.0'
```

### Core クラス

```typescript
class Core {
  // 初期化
  static scan(element: HTMLElement): Promise<void>

  // 属性処理
  static setAttribute(element: HTMLElement, name: string, value: string | null): Promise<void>

  // バインディング
  static setBindingData(element: HTMLElement, data: Record<string, unknown>): Promise<void>
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

Haori.jsは複数のレイヤーでXSS攻撃を防ぎます:

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

開発モードでは、各操作の所要時間をログ出力:

```javascript
document.addEventListener('haori:fetchend', (event) => {
  console.log(`フェッチ所要時間: ${event.detail.durationMs}ms`)
})

document.addEventListener('haori:importend', (event) => {
  console.log(`インポート所要時間: ${event.detail.durationMs}ms`)
})
```

### スコープ診断（開発モード）

開発モードでは、`data-if` 式が falsy（非表示）と評価されるたびに、その式と参照しているトップレベル識別子の解決値・由来（`dumpScope` の `sources`）をコンソールへ自動出力します。`data-if="!(dialog?.id || id)"` が想定外に非表示になる場合に、`id` がどの要素（例: フォームの `name="id"` 入力）の値で解決されているかをそのまま確認でき、スコープ競合のデバッグに役立ちます。任意のタイミングでスコープを確認するには `Core.dumpScope(element)`（ブラウザからは `Haori.Core.dumpScope(element)`）を使います。

---

## 付録

### 環境検出

Haori.jsは以下のロジックで環境を検出します:

```typescript
// <script> タグから設定を取得
const scriptTag = document.querySelector('script[src*="haori"]')
const prefix = scriptTag?.getAttribute('data-prefix') || 'data-'
const devMode = scriptTag?.hasAttribute('data-dev')

// ホスト名で開発モードを判定
const isDev = devMode ||
  ['localhost', '127.0.0.1', '::1'].includes(location.hostname) ||
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
```

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
