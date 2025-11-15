# Haori.js 技術仕様書

バージョン: 1.0.0
最終更新: 2025-01-14

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
│  セキュアな式評価 (禁止識別子チェック + Function生成)         │
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
   - `data-if`: 条件分岐評価
   - `data-each`: 繰り返し処理評価

2. **通常属性**: その他のすべての属性

3. **遅延属性** (優先属性・通常属性の後に処理)
   - `data-fetch`: Procedure実行
   - `data-url-param`: URLパラメータバインド

#### data-if の動作

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
  'alert', 'confirm', 'prompt', 'fetch', 'XMLHttpRequest',

  // プロトタイプチェーン
  'constructor', '__proto__', 'prototype', 'Object',

  // DOM/ブラウザAPI
  'document', 'location', 'navigator', 'localStorage', 'sessionStorage',
  'IndexedDB', 'history'
]

// strict モード専用の禁止識別子
private static readonly STRICT_FORBIDDEN_NAMES = ['eval', 'arguments']
```

#### 評価メカニズム

```typescript
evaluate(expression: string, bindedValues: Record<string, unknown>): unknown {
  // 1. 危険パターンチェック
  if (this.containsDangerousPatterns(expression)) {
    Log.warn(`Dangerous pattern detected: ${expression}`)
    return null
  }

  // 2. 禁止キーチェック
  if (this.containsForbiddenKeys(bindedValues)) {
    Log.warn('Forbidden keys in binding values')
    return null
  }

  // 3. キャッシュキー生成
  const bindKeys = Object.keys(bindedValues)
    .filter(key => !FORBIDDEN_NAMES.includes(key))
    .sort()
  const cacheKey = `${expression}:${bindKeys.join(',')}`

  // 4. キャッシュチェック
  let evaluator = EXPRESSION_CACHE.get(cacheKey)

  if (!evaluator) {
    // 5. 評価関数生成
    const assignments = FORBIDDEN_NAMES
      .map(name => `const ${name} = undefined`)
      .join(';\n')

    const body = `"use strict";\n${assignments};\nreturn (${expression});`

    evaluator = new Function(...bindKeys, body)
    EXPRESSION_CACHE.set(cacheKey, evaluator)
  }

  // 6. 実行
  const argValues = bindKeys.map(key => bindedValues[key])
  return evaluator(...argValues)
}
```

**セキュリティレイヤー**:
1. 正規表現で `eval()`, `arguments[]` を検出
2. 禁止識別子を `undefined` で上書き
3. strict モードで `eval`, `arguments` の使用を禁止
4. バインドキーから禁止識別子名を除外
5. ネストしたオブジェクトも再帰的にチェック

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
  // 1. document.head と document.body をスキャン
  await Promise.all([
    Core.scan(document.head),
    Core.scan(document.body)
  ])

  // 2. それぞれに MutationObserver を設定
  Observer.observe(document.head)
  Observer.observe(document.body)

  // 3. EventDispatcher を開始
  new EventDispatcher(document).start()

  // 4. haori:ready イベント発火
  HaoriEvent.ready(version)
}

// DOMContentLoaded または即座に実行
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Observer.init())
} else {
  Observer.init()
}
```

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
  refetchFragments?: ElementFragment[] | null // 再フェッチ対象
  clickFragments?: ElementFragment[] | null  // クリック対象
  openFragments?: ElementFragment[] | null   // ダイアログオープン対象
  closeFragments?: ElementFragment[] | null  // ダイアログクローズ対象
  dialogMessage?: string | null              // ダイアログメッセージ
  toastMessage?: string | null               // トーストメッセージ
  redirectUrl?: string | null                // リダイレクトURL
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
    this.reset(),
    this.refetch(),
    this.click(),
    this.openDialogs(),
    this.closeDialogs()
  ])

  // 9. UI表示
  if (this.dialogMessage) {
    await Haori.dialog(this.dialogMessage)
  }
  if (this.toastMessage) {
    await Haori.toast(this.toastMessage, 'info')
  }

  // 10. リダイレクト
  if (this.redirectUrl) {
    window.location.href = this.redirectUrl
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
    if (data.errors) {
      Object.entries(data.errors).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          entries.push(...value.map(m => ({ key, message: m })))
        } else {
          entries.push({ key, message: String(value) })
        }
      })
    }

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

### 6. Form (form.ts)

**役割**: フォーム双方向バインディング

#### 双方向バインディングの自動更新

フォーム要素（`<form>`タグ）内の入力要素で`change`イベントが発火すると、以下の処理が自動的に実行されます：

1. **フォーム値の取得**: `Form.getValues()`でフォーム内のすべての入力値を取得
2. **`data-bind`属性の更新**: フォーム要素の`data-bind`属性にフォーム値のJSONを設定
3. **バインディングデータの更新**: フラグメントのバインディングデータを更新
4. **DOM更新**: `Core.setBindingData()`で関連する要素（`{{variable}}`、`data-if`など）を自動更新

これにより、`data-bind`属性を明示的に記述しなくても、フォーム要素内の入力変更が自動的にバインディングデータとして反映され、リアクティブな更新が実現されます。

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

#### 主要メソッド

```typescript
class Form {
  // 値の取得
  static getValues(form: ElementFragment): Record<string, unknown>

  // 値の設定
  static setValues(form: ElementFragment, values: Record<string, unknown>, force?: boolean): Promise<void>

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
  static async toast(message: string, level: 'info' | 'warning' | 'error'): Promise<void>

  // 確認ダイアログ
  static async confirm(message: string): Promise<boolean>

  // <dialog> 要素の制御
  static async openDialog(element: HTMLElement): Promise<void>
  static async closeDialog(element: HTMLElement): Promise<void>

  // エラーメッセージ
  static async addErrorMessage(target: HTMLElement | HTMLFormElement, message: string): Promise<void>
  static async clearMessages(parent: HTMLElement): Promise<void>
}
```

#### 実装例

```typescript
// トースト (3秒表示)
static async toast(message: string, level: 'info' | 'warning' | 'error' = 'info'): Promise<void> {
  return Queue.enqueue(() => {
    const toast = document.createElement('div')
    toast.textContent = message
    toast.className = `haori-toast haori-toast-${level}`
    toast.setAttribute('popover', 'manual')

    document.body.appendChild(toast)
    toast.showPopover()

    setTimeout(() => {
      toast.hidePopover()
      toast.remove()
    }, 3000)
  })
}

// エラーメッセージ設定
static async addErrorMessage(target: HTMLElement, message: string): Promise<void> {
  return Queue.enqueue(() => {
    target.setAttribute('data-message', message)
  })
}

// メッセージクリア (再帰的)
static async clearMessages(parent: HTMLElement): Promise<void> {
  return Queue.enqueue(() => {
    parent.removeAttribute('data-message')
    parent.querySelectorAll('[data-message]').forEach(el => {
      el.removeAttribute('data-message')
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

---

### 条件分岐

#### `data-if`

条件式を評価し、結果が `false`, `null`, `undefined`, `NaN` の場合は要素を非表示にします。

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

配列を繰り返し処理し、各要素を表示します。差分検出により効率的な更新を実現します。

**構文**:
```html
data-each="arrayExpression"
```

**関連属性**:
- `data-each-arg`: 各要素のバインド名 (プリミティブ配列では必須)
- `data-each-key`: 一意キープロパティ名 (差分検出用)
- `data-each-index`: インデックスのバインド名
- `data-each-before`: ループ前に表示する要素をマーク
- `data-each-after`: ループ後に表示する要素をマーク
- `data-row`: 各行に自動付与されるキー (手動変更禁止)

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
- `data-fetch-arg`: バインドキー名
- `data-fetch-bind-params`: 抽出パラメータ (&区切り)

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

---

### URLパラメータ

#### `data-url-param`

URLクエリパラメータをバインディングデータに設定します。

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

#### `data-message`

エラーメッセージを表示します。フェッチエラー時に自動設定されます。

```html
<input name="email">
<!-- エラー時に親要素に自動設定: -->
<div data-message="メールアドレスが不正です">
  <input name="email">
</div>
```

---

### イベント属性

イベント属性は `data-{event}-*` の形式で指定します。`{event}` には以下が使用できます:

- `click`: クリック時
- `change`: 変更時
- `load`: ロード時

#### 処理順序

イベント属性は以下の順序で実行されます:

1. `data-{event}-validate`: バリデーション実行
2. `data-{event}-confirm`: 確認ダイアログ表示
3. `data-{event}-data` / `data-{event}-form`: データ取得
4. `data-{event}-before-run`: フェッチ前スクリプト実行
5. `data-{event}-fetch`: HTTP通信実行
6. `data-{event}-after-run`: フェッチ後スクリプト実行
7. `data-{event}-bind`: データバインド実行
8. `data-{event}-adjust`: 値調整実行
9. `data-{event}-row-add` / `data-{event}-row-remove` / `data-{event}-row-prev` / `data-{event}-row-next`: 行データの変更
10. `data-{event}-reset`: リセット処理実行
11. `data-{event}-refetch`: 再フェッチ実行
12. `data-{event}-click`: クリック実行
13. `data-{event}-open` / `data-{event}-close`: ダイアログ操作
14. `data-{event}-dialog` / `data-{event}-toast`: メッセージ表示
15. `data-{event}-redirect`: リダイレクト実行

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

#### フェッチ

##### `data-{event}-fetch`

フェッチURLを指定します。

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

対象要素が属する行の後に新しい行を追加します。

```html
<div data-each="items" data-each-arg="item">
  <input name="name" value="{{item.name}}">
  <button data-click-row-add>行追加</button>
</div>
```

##### `data-{event}-row-remove`

対象要素が属する行を削除します。

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

```html
<form id="myForm">
  <input name="username">
</form>
<button data-click-reset="#myForm">リセット</button>
```

##### `data-{event}-refetch`

対象要素の `data-fetch` を再実行します。

```html
<div id="userList" data-fetch="/api/users"></div>
<button data-click-refetch="#userList">再読み込み</button>
```

##### `data-{event}-click`

対象要素をクリックします。

```html
<button id="submitBtn">送信</button>
<button data-click-click="#submitBtn">送信 (間接)</button>
```

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

// メソッド呼び出し
{{ text.toUpperCase() }}
{{ price.toFixed(2) }}
{{ items.join(', ') }}

// 複雑な式
{{ (price * 1.1).toFixed(2) }}
{{ items.filter(item => item.active).length }}
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

// グローバルオブジェクト
window
document
location
navigator
localStorage

// プロトタイプチェーン
constructor
__proto__
prototype

// その他
arguments (strict モードで禁止)
```

禁止パターンを使用した場合、式は `null` を返します。

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
})
```

**detail**:
```typescript
{
  url: string
  options?: RequestInit
  payload?: Record<string, unknown>
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

// デフォルトエクスポート
export default Haori

// バージョン
export const version = '1.0.0'
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
  static clearMessages(fragment: ElementFragment): Promise<void>
  static findFragmentsByKey(fragment: ElementFragment, key: string): ElementFragment[]
  static getFormFragment(fragment: ElementFragment): ElementFragment | null
}
```

### Haori クラス

```typescript
class Haori {
  static dialog(message: string): Promise<void>
  static toast(message: string, level?: 'info' | 'warning' | 'error'): Promise<void>
  static confirm(message: string): Promise<boolean>
  static openDialog(element: HTMLElement): Promise<void>
  static closeDialog(element: HTMLElement): Promise<void>
  static addErrorMessage(target: HTMLElement, message: string): Promise<void>
  static clearMessages(parent: HTMLElement): Promise<void>
}
```

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

1. 優先属性 (`data-bind`, `data-if`, `data-each`)
2. 通常属性
3. 遅延属性 (`data-fetch`, `data-url-param`)

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

### 1.0.0 (2025-01-14)

初回リリース

- HTML-First設計
- 仮想DOM実装
- リアクティブバインディング
- セキュアな式評価
- 差分検出による効率的な更新
- フォーム双方向バインディング
- イベント駆動アーキテクチャ

---

**End of Document**
