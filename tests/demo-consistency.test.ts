/* @vitest-environment node */
/**
 * @fileoverview demo/ 配下の静的な整合性検査。
 *
 * デモは仕様の実例であり、実装から取り残されると誤った書き方を広めてしまいます。
 * 表示テスト（`playwright/demo-display.spec.cjs`）では「エラーなく表示される」ことしか
 * 分からないため、ここでは次の 3 点をファイルの内容から検査します。
 * 1. デモが使う `data-*` 属性が仕様書（`docs/ja/specs.md`）に載っていること
 * 2. すべてのデモページが `demo/index.html` の一覧から辿れること
 * 3. デモ内の相対リンク・スクリプト・部分テンプレートの参照先が存在すること
 */
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const demoRoot = path.join(repositoryRoot, 'demo');
const specsPath = path.join(repositoryRoot, 'docs', 'ja', 'specs.md');

/** `data-{event}-*` の `{event}` に入りうるイベント名。 */
const EVENT_NAMES = [
  'click',
  'change',
  'input',
  'submit',
  'load',
  'focus',
  'blur',
  'keydown',
  'keyup',
  'fetch',
  'poll',
  'intersect',
  'each',
];

/** 仕様書に載らないデモ内部の目印。 */
const DEMO_LOCAL_ATTRIBUTES = new Set([
  'data-demo-id', // index.html の「DOM を表示」ボタンが対象節を指すための目印
]);

/**
 * 一覧（`demo/index.html`）へのリンクを求めないページ。
 * 単体では意味を持たない断片や、デモ内の操作から遷移する先を除きます。
 */
const CATALOG_EXEMPT = new Set([
  'index.html', // 一覧そのもの
  'components/header.html', // data-import 用の断片
  'import/components/header.html', // data-import 用の断片
  'form/late-attribute-complete.html', // 遷移先（応答の値で切り替わる）
  'form/late-attribute-pay.html', // 遷移先（応答の値で切り替わる）
]);

/**
 * ディレクトリ配下の HTML を再帰的に列挙します。
 *
 * @param directory 走査を始めるディレクトリ
 * @returns demo/ からの相対パス（区切りは `/`）の配列
 */
function listDemoPages(directory: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...listDemoPages(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      results.push(path.relative(demoRoot, fullPath).split(path.sep).join('/'));
    }
  }
  return results.sort();
}

/**
 * スクリプト・コメント・字面で見せているコード例を除いたマークアップを返します。
 *
 * `<pre>` / `<code>` の中はエスケープした属性の例（`&lt;button data-...&gt;`）を
 * 含むため、生きた宣言と区別するために取り除きます。
 *
 * @param source HTML の内容
 * @returns 生きたマークアップだけを残した文字列
 */
function markupOnly(source: string): string {
  return source
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<pre[\s\S]*?<\/pre>/gi, '')
    .replace(/<code[\s\S]*?<\/code>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * 存在しないことに意味がある参照。
 * 値は `ページ: 参照` の形式です。
 */
const INTENTIONAL_MISSING = new Set([
  // 失敗状態（data-fetch-state）を見せるための、意図的に存在しない取得先
  'fetch/data-fetch-state-demo.html: ./not-found-404.json',
]);

const demoPages = listDemoPages(demoRoot);
// アンカー（`(#data-event-...)`）は属性名の記載ではないため除く。
const specs = readFileSync(specsPath, 'utf8').replace(/\(#[^)]*\)/g, '');

/**
 * 仕様書に属性名の記載があるかを判定します。
 *
 * @param attribute 属性名（`data-` から始まる）
 * @returns 記載があれば true
 */
function isDocumented(attribute: string): boolean {
  const exact = new RegExp(`${attribute}(?![a-z-])`);
  if (exact.test(specs)) {
    return true;
  }
  const matched = attribute.match(/^data-([a-z]+)-(.+)$/);
  if (matched && EVENT_NAMES.includes(matched[1])) {
    return new RegExp(`data-\\{event\\}-${matched[2]}(?![a-z-])`).test(specs);
  }
  return false;
}

describe('デモの整合性', () => {
  it('デモページが 1 つ以上ある', () => {
    expect(demoPages.length).toBeGreaterThan(0);
  });

  describe('規則1: 仕様書にない属性を使わない', () => {
    it('すべてのデモの data-* 属性が仕様書に載っている', () => {
      const unknown: string[] = [];
      for (const page of demoPages) {
        const source = markupOnly(
          readFileSync(path.join(demoRoot, page), 'utf8'),
        );
        const attributes = new Set(
          (source.match(/\sdata-[a-z-]+/g) ?? []).map(name => name.trim()),
        );
        for (const attribute of attributes) {
          if (DEMO_LOCAL_ATTRIBUTES.has(attribute)) {
            continue;
          }
          if (!isDocumented(attribute)) {
            unknown.push(`${page}: ${attribute}`);
          }
        }
      }
      expect(unknown, `仕様書にない属性:\n${unknown.join('\n')}`).toEqual([]);
    });
  });

  describe('規則2: 一覧から全デモを辿れる', () => {
    it('demo/index.html が各デモページへリンクしている', () => {
      const index = readFileSync(path.join(demoRoot, 'index.html'), 'utf8');
      const linked = new Set<string>();
      for (const match of index.matchAll(/href="([^"#]+\.html)"/g)) {
        const href = match[1];
        if (/^(https?:)?\/\//.test(href)) {
          continue;
        }
        const resolved = href.startsWith('/demo/')
          ? href.slice('/demo/'.length)
          : path.posix.normalize(href.replace(/^\.\//, ''));
        linked.add(resolved);
      }
      const missing = demoPages.filter(
        page => !CATALOG_EXEMPT.has(page) && !linked.has(page),
      );
      expect(
        missing,
        `一覧に載っていないデモ:\n${missing.join('\n')}`,
      ).toEqual([]);
    });

    it('一覧のリンク先がすべて存在する', () => {
      const index = readFileSync(path.join(demoRoot, 'index.html'), 'utf8');
      const broken: string[] = [];
      for (const match of index.matchAll(/href="(\.\/[^"#]+)"/g)) {
        const target = path.join(demoRoot, match[1]);
        if (!existsSync(target)) {
          broken.push(match[1]);
        }
      }
      expect(broken, `一覧の壊れたリンク:\n${broken.join('\n')}`).toEqual([]);
    });
  });

  describe('規則3: 参照先が存在する', () => {
    it('相対リンク・スクリプト・部分テンプレート・取得先の参照先がある', () => {
      const broken: string[] = [];
      for (const page of demoPages) {
        const source = markupOnly(
          readFileSync(path.join(demoRoot, page), 'utf8'),
        );
        const references = new Set<string>();
        for (const pattern of [
          /\shref="([^"]+)"/g,
          /\ssrc="([^"]+)"/g,
          /\sdata-import="([^"]+)"/g,
          // `data-fetch` / `data-{event}-fetch` などの取得先（相対パスのみ）
          /\sdata-[a-z-]*fetch="([^"]+)"/g,
        ]) {
          for (const match of source.matchAll(pattern)) {
            references.add(match[1]);
          }
        }
        for (const reference of references) {
          if (
            reference.startsWith('#') ||
            reference.startsWith('data:') ||
            reference.startsWith('mailto:') ||
            /^(https?:)?\/\//.test(reference) ||
            reference.includes('{{')
          ) {
            continue;
          }
          const withoutQuery = reference.split(/[?#]/)[0];
          if (withoutQuery === '') {
            continue;
          }
          const target = withoutQuery.startsWith('/')
            ? path.join(repositoryRoot, withoutQuery)
            : path.resolve(
              path.dirname(path.join(demoRoot, page)),
              withoutQuery,
            );
          const label = `${page}: ${reference}`;
          if (!existsSync(target) && !INTENTIONAL_MISSING.has(label)) {
            broken.push(label);
          }
        }
      }
      expect(broken, `参照先が無いリンク:\n${broken.join('\n')}`).toEqual([]);
    });

    it('セレクタ属性が指す id が同じページに存在する', () => {
      const dangling: string[] = [];
      for (const page of demoPages) {
        const source = readFileSync(path.join(demoRoot, page), 'utf8');
        const ids = new Set(
          [...source.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]),
        );
        // セレクタを値に取る属性のうち、単純な id 参照だけを検査する。
        // `{{}}` を含む値は実行時に決まるため対象外。
        for (const match of source.matchAll(
          /\sdata-[a-z-]*(?:bind|copy|copy-source|open|close|adjust|reset|refetch|form|click)="(#[A-Za-z][\w-]*)"/g,
        )) {
          const id = match[1].slice(1);
          if (!ids.has(id)) {
            dangling.push(`${page}: ${match[1]}`);
          }
        }
      }
      expect(
        dangling,
        `存在しない id を指すセレクタ:\n${dangling.join('\n')}`,
      ).toEqual([]);
    });
  });
});
