/* @vitest-environment node */
/**
 * @fileoverview 仕様参照と文書内リンクの静的検査。
 *
 * 期待値の根拠は `docs/ja/testing.md`「規則 1: 期待値は仕様書から取る。実装から取らない」
 * の「テストのコメントには、根拠にした仕様書の**節の見出し**と引用を書いてください」
 * 「**行番号で参照しないでください。**」です。仕様書そのものが根拠なので、個別の節では
 * なく参照の解決可否を検査します。
 *
 * これまで参照の検査は手作業（testing.md に載せた PowerShell）でした。2026-08-04 の
 * 棚卸しでは約 30 箇所のうち 10 箇所ほどが無関係な行を指しており、見落とすと
 * 「仕様由来か実装由来か」を判別できなくなります。文書内リンクについては検査が無く、
 * 節の名前を変えるとリンクが静かに切れていました。両方をここで固定します。
 */
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

/** リポジトリのルート */
const root = path.resolve(__dirname, '..');

/** 仕様書のパス */
const specPath = path.join(root, 'docs', 'ja', 'specs.md');

/**
 * 見出しから GitHub のアンカー名を作ります。
 *
 * 小文字化し、記号（バッククォート・スラッシュ・括弧など）を取り除き、空白 1 つを
 * ハイフン 1 つへ置き換えます（空白を詰めないため、`A / B` は `a--b` になります）。
 *
 * @param heading 見出しの文字列
 * @returns アンカー名
 */
function toAnchor(heading: string): string {
  const kept = Array.from(heading.trim().toLowerCase())
    .filter(character => /[\p{L}\p{N} _-]/u.test(character))
    .join('');
  return kept.trim().replace(/ /g, '-');
}

/**
 * Markdown からコードの部分を取り除きます。
 *
 * コードブロックとコードスパンの中はリンクとして描画されないため、書式そのものを
 * 説明する例（この検査の説明文など）をリンクとして拾わないようにします。
 *
 * @param markdown Markdown の内容
 * @returns コードを取り除いた内容
 */
function stripCode(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

/**
 * Markdown から見出しの一覧を取り出します。
 *
 * @param markdown Markdown の内容
 * @returns 見出しの文字列の配列
 */
function collectHeadings(markdown: string): string[] {
  return Array.from(markdown.matchAll(/^#{1,6} (.+)$/gm)).map(match =>
    match[1].trim(),
  );
}

/**
 * 検査対象のソース・テスト・文書のパスを集めます。
 *
 * この検査自身は除きます。照合のための正規表現とメッセージの雛形が同じ書式の文字列を
 * 含むため、参照として拾うと必ず 2 件の不一致になります（参照ではなくデータです）。
 *
 * @returns 対象ファイルのパスの配列
 */
function collectTargets(): string[] {
  const self = path.basename(__filename).replace(/\.[cm]?[jt]s$/, '');
  const targets: string[] = [];
  for (const directory of [
    path.join(root, 'src'),
    path.join(root, 'tests'),
    path.join(root, 'tests', 'helpers'),
    path.join(root, 'docs', 'ja'),
  ]) {
    for (const name of readdirSync(directory)) {
      if (/\.(ts|md)$/.test(name) && !name.startsWith(self)) {
        targets.push(path.join(directory, name));
      }
    }
  }
  return targets;
}

describe('仕様参照と文書内リンク', () => {
  it('仕様「…」の参照はすべて仕様書の見出しと一致する', () => {
    const headings = new Set(
      collectHeadings(readFileSync(specPath, 'utf8')).map(heading =>
        heading.replace(/\s+/g, ''),
      ),
    );
    const broken: string[] = [];
    let count = 0;
    for (const target of collectTargets()) {
      const source = readFileSync(target, 'utf8')
        // コメントの折り返し（` * ` / `// `）をつないでから照合する。
        .replace(/\n\s*(\*|\/\/)\s*/g, '');
      for (const match of source.matchAll(
        /(?:仕様|同)\s*(?:の)?\s*「([^」]+)」/g,
      )) {
        count += 1;
        // テンプレートリテラル内のバッククォートはエスケープされている。
        const name = match[1].replace(/\\/g, '').replace(/\s+/g, '');
        if (!headings.has(name)) {
          broken.push(`${path.relative(root, target)} :: 仕様「${match[1]}」`);
        }
      }
    }
    // 参照が消えていないことも確かめる（正規表現の取りこぼしで空振りしないため）。
    expect(count).toBeGreaterThan(300);
    expect(broken, `見出しと一致しない参照:\n${broken.join('\n')}`).toEqual([]);
  });

  it('文書内リンク（#見出し）はすべて解決する', () => {
    const broken: string[] = [];
    let count = 0;
    const directory = path.join(root, 'docs', 'ja');
    for (const name of readdirSync(directory)) {
      if (!name.endsWith('.md')) {
        continue;
      }
      const markdown = readFileSync(path.join(directory, name), 'utf8');
      const anchors = new Set(collectHeadings(markdown).map(toAnchor));
      for (const match of stripCode(markdown).matchAll(/\]\(#([^)]+)\)/g)) {
        count += 1;
        if (!anchors.has(match[1])) {
          broken.push(`docs/ja/${name} :: #${match[1]}`);
        }
      }
    }
    expect(count).toBeGreaterThan(50);
    expect(broken, `解決しないリンク:\n${broken.join('\n')}`).toEqual([]);
  });
});
