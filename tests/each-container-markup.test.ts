/* @vitest-environment jsdom */
/**
 * @fileoverview 文書とデモの `data-each` の書き方の検査。
 *
 * 仕様「`data-each`」の配置ルールは、コンテナの最初の要素の子だけをテンプレート
 * とします。要素の子を 2 つ以上並べた markup は 2 つめ以降が行に入らず、例外も
 * 出ないため、書いた側が気づけません。実際に仕様書・ガイド・E2E のフィクスチャ・
 * 単体テストの 9 箇所へ入り込んでいたので、文書とデモの例を機械的に検査します。
 *
 * 実行時には開発モードの警告（`Core.warnExtraEachChildren`）が出ますが、描画され
 * ない文書の例は警告では拾えないため、静的にも見ます。
 */
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

/**
 * リポジトリのルート。
 *
 * `DOMParser` を使うため環境は jsdom で、jsdom では `import.meta.url` が file
 * スキームにならないため（ほかの静的検査のように `fileURLToPath()` が使えない）、
 * 実行ディレクトリから求めます。取り違えると対象が集まらず、検査が常に通って
 * しまうので、下の `it()` で目印のファイルと件数を確かめます。
 */
const repositoryRoot = process.cwd();

/**
 * 検査から除く箇所。
 *
 * `誤り` として提示している例と、描画結果として提示している markup は、配置ルール
 * どおりでないことに意味があります。ここへ足すときは「なぜ配置ルールから外れて
 * よいのか」を書いてください。
 */
const ALLOWED: {
  file: string;
  expression: string;
  extra: string[];
  reason: string;
}[] = [
  {
    file: 'docs/ja/guide.md',
    expression: 'rows',
    extra: ['button'],
    reason: '配置ルールの「誤り」として提示している例そのもの',
  },
  {
    file: 'docs/ja/guide.md',
    expression: 'users',
    extra: ['li', 'li'],
    reason: '描画結果の DOM（行が展開された後）を示す例',
  },
  {
    file: 'playwright/each-extra-children-repro.html',
    expression: 'rows',
    extra: ['button'],
    reason: '警告と行操作の失敗を確かめるための、誤った形の再現ページ',
  },
];

/**
 * リポジトリの中のファイルを集めます。
 *
 * @param relativeDirectory リポジトリルートからの相対ディレクトリ
 * @param pattern ファイル名に一致させる正規表現
 * @param recursive 下位ディレクトリも辿るかどうか
 * @returns リポジトリルートからの相対パスの配列
 */
function collect(
  relativeDirectory: string,
  pattern: RegExp,
  recursive = true,
): string[] {
  const absolute = path.join(repositoryRoot, relativeDirectory);
  const collected: string[] = [];
  readdirSync(absolute, {withFileTypes: true}).forEach(entry => {
    const relative = path.posix.join(
      relativeDirectory === '.' ? '' : relativeDirectory,
      entry.name,
    );
    if (entry.isDirectory()) {
      if (recursive) {
        collected.push(...collect(relative, pattern));
      }
      return;
    }
    if (pattern.test(entry.name)) {
      collected.push(relative);
    }
  });
  return collected;
}

/**
 * markup の中の、要素の子が 2 つ以上ある `data-each` コンテナを探します。
 *
 * @param markup 調べる markup
 * @returns 見つかったコンテナの `data-each` の式と、行に入らない子のタグ名
 */
function findExtraChildren(
  markup: string,
): {expression: string; extra: string[]}[] {
  // `<tr>` / `<td>` は `<table>` の外では捨てられるため、必要なら包んでから
  // 解析する（包まないとコンテナ自体が見つからず、見逃しになる）。
  const needsTable = /<(tr|tbody|thead|tfoot|td|th)[\s>]/i.test(markup);
  const source = needsTable ? `<table>${markup}</table>` : markup;
  const parsed = new DOMParser().parseFromString(source, 'text/html');
  const found: {expression: string; extra: string[]}[] = [];
  parsed.querySelectorAll('[data-each]').forEach(container => {
    const extra = Array.from(container.children).filter(
      child =>
        !child.hasAttribute('data-each-before') &&
        !child.hasAttribute('data-each-after'),
    );
    if (extra.length > 1) {
      found.push({
        expression: container.getAttribute('data-each') ?? '',
        extra: extra.slice(1).map(child => child.tagName.toLowerCase()),
      });
    }
  });
  return found;
}

/**
 * markdown の中の HTML のコードブロックを取り出します。
 *
 * @param text markdown の内容
 * @returns コードブロックの内容
 */
function htmlBlocks(text: string): string[] {
  const blocks: string[] = [];
  const pattern = /```(\w*)\n([\s\S]*?)```/g;
  let matched: RegExpExecArray | null;
  while ((matched = pattern.exec(text)) !== null) {
    if (matched[2].includes('<')) {
      blocks.push(matched[2]);
    }
  }
  return blocks;
}

describe('data-each の書き方（文書・デモ）', () => {
  // 仕様「`data-each`」の配置ルールの「誤り: 要素の子を 2 つ以上並べる …
  // **最初の要素の子だけがテンプレートになり、2 つめ以降は行に入りません。**」
  it('要素の子を 2 つ以上並べた data-each が無い', () => {
    const targets = [
      ...collect('docs/ja', /\.md$/),
      ...collect('.', /^README.*\.md$/, false),
      ...collect('demo', /\.html$/),
      ...collect('playwright', /\.html$/, false),
    ].sort();
    // 対象が 0 件だと常に通ってしまうため、実行ディレクトリと件数を確かめる。
    expect(existsSync(path.join(repositoryRoot, 'docs', 'ja', 'specs.md'))).toBe(
      true,
    );
    expect(targets.length).toBeGreaterThan(20);

    const violations: string[] = [];
    const usedAllowances = new Set<number>();
    for (const target of targets) {
      const text = readFileSync(path.join(repositoryRoot, target), 'utf8');
      const blocks = target.endsWith('.md') ? htmlBlocks(text) : [text];
      for (const block of blocks) {
        for (const {expression, extra} of findExtraChildren(block)) {
          // 式名だけで照合すると、同じ式名の別の誤りまで通してしまう
          // （ガイドには `data-each="rows"` の例が複数ある）。行に入らない子の
          // 並びまで一致したときだけ除外する。
          const index = ALLOWED.findIndex(
            entry =>
              entry.file === target.replace(/\\/g, '/') &&
              entry.expression === expression &&
              entry.extra.join(',') === extra.join(','),
          );
          if (index === -1) {
            violations.push(
              `${target}: data-each="${expression}" の` +
                ` ${extra.join(', ')} が行に入りません`,
            );
            continue;
          }
          usedAllowances.add(index);
        }
      }
    }
    expect(
      violations,
      `行の中身は 1 つの要素で包んでください:\n${violations.join('\n')}`,
    ).toEqual([]);

    // 使われなくなった除外を残さない。残ると、後から同じ形の誤りが入っても
    // 通ってしまう。理由の記載も必須にする（除外の根拠を残すための欄なので、
    // 空のまま足せると欄の意味が無くなる）。
    const unused = ALLOWED.filter(
      (entry, index) => !usedAllowances.has(index),
    ).map(entry => `${entry.file}: data-each="${entry.expression}"`);
    expect(unused, `除外が使われていません:\n${unused.join('\n')}`).toEqual([]);
    ALLOWED.forEach(entry => {
      expect(entry.reason, `${entry.file} の除外に理由がありません`).not.toBe(
        '',
      );
    });
  });
});
