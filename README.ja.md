# Haori.js（日本語ドキュメント）

Haori.js は、HTML 属性を中心にして動的な UI を実現する軽量なライブラリです。JavaScript をほとんど書かずに、データバインディング、条件分岐、繰り返し処理、フォームの双方向バインディング、サーバー通信などを HTML 属性で宣言できます。

バージョン: 0.1.5

---

**目次**

- 概要
- インストール
- クイックスタート
- よく使う属性（概要）
- 公開・ビルド手順
- ライセンス・貢献
- 詳細ドキュメント

---

## 概要

- 設計思想: HTML-First（HTML 属性のみで UI を宣言）
- 主な特徴:
  - データバインディング（`data-bind`）
  - 条件表示（`data-if`）
  - 繰り返し表示（`data-each`）
  - フォーム双方向バインディング（`name` 属性による自動バインド）
  - サーバー通信（`data-fetch`）
  - HTML インポート（`data-import`）
  - ゼロ依存（ブラウザネイティブのみ）

## インストール

npm:

```bash
npm install haori
```

CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/haori/dist/haori.iife.js"></script>
```

この CDN URL は npm に公開済みの最新バージョンを参照します。

ES Module:

```js
import Haori from 'haori'
```

---

## クイックスタート

HTML だけで簡単に使えます。以下は最小の例です。

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>Haori サンプル</title>
  <script src="https://cdn.jsdelivr.net/npm/haori/dist/haori.iife.js"></script>
</head>
<body>
  <div data-bind='{"name":"太郎"}'>
    <p>こんにちは、{{name}} さん</p>
  </div>
</body>
</html>
```

JavaScript からマウントする例:

```js
import Haori from 'haori'

Haori.mount(document.body, { items: [ { name: 'りんご' }, { name: 'みかん' } ] })
```

---

## よく使う属性（概要）

- `data-bind` — 要素にバインディングデータを設定（JSON またはパラメータ形式）
- `{{ ... }}` — テンプレート式（式評価により挿入）
- `data-if` — 条件に応じて要素を表示 / 非表示
- `data-each` — 配列を繰り返し表示（`data-each-key`, `data-each-arg`, `data-each-index` など）
- `data-fetch` — サーバーからデータを取得してバインド
- `data-import` — 外部 HTML を読み込んで挿入
- `data-url-param` — URL のクエリパラメータをバインディングに取り込む

テンプレート式では、プロパティアクセス、動的インデックスを含むブラケットアクセス、optional chaining、三項演算子、配列 `map` / `filter` のアロー関数、spread を伴う呼び出しなどの安全な構文を利用できます。一方で、グローバルオブジェクト、`eval` や `arguments`、`constructor`、`__proto__`、`prototype`、`Reflect` などの脱出経路は使用できません。

詳しい使い方や多数のサンプルについては、公式ドキュメントを参照してください。

---

## 公開・ビルド手順（パッケージ作成）

ローカル確認とリリース準備の基本手順を示します。

公開運用メモ:

1. `npm run test`、`npm run build`、`npm pack --dry-run` を実行する
2. `npm version patch` などで公開する版数に更新する
3. `git push origin main` と `git push origin --tags` を実行する
4. 新しい版数タグから GitHub Release を公開する
5. npm、jsDelivr、GitHub Release の assets が新しい版数を指すことを確認する

1. 依存インストール

```bash
npm install
```

2. 型チェックとテスト

```bash
npm run compile
npm run test
```

3. 配布物のビルド

```bash
npm run build
```

4. バージョン更新

```bash
npm version patch
```

5. 版数更新のコミットとタグを push

```bash
git push origin main
git push origin --tags
```

6. 新しいタグから GitHub Release を公開

このリポジトリの npm 公開は GitHub Actions で行います。現在の workflow は `release.published` を契機に起動し、パッケージをビルドしたうえで、対象 version が未公開のときだけ `NPM_TOKEN` を使って npm へ公開し、あわせて `dist.zip` を GitHub Release のアセットとして添付します。

必要な前提条件:

- GitHub Actions の repository secrets に `NPM_TOKEN` が設定されていること
- 対象バージョンのタグから Release を `published` 状態で公開すること

公開前の推奨確認:

- `npm run test`
- `npm run build`
- `npm pack --dry-run`

注意: `package.json` の `name`, `version`, `description`, `repository`, `license` が正しいことを確認してください。公開対象ファイルは `files` フィールドに従います。

---

## ライセンス・貢献

- ライセンス: MIT（リポジトリの `LICENSE` を参照）

貢献歓迎: バグ報告、改善提案、プルリクエストは GitHub リポジトリへお願いします。

---

## 詳細ドキュメント

より詳しい使い方、属性仕様、内部設計については以下のドキュメントを参照してください。

- `docs/ja/guide.md` — 利用ガイド（サンプル多数）
- `docs/ja/specs.md` — 技術仕様書（内部設計・API など）

---

README の作成にあたって追加してほしい項目（API 参照、図、例など）があれば教えてください。