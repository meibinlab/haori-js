/* @vitest-environment node */
/**
 * @fileoverview バージョン表記の一致検査。
 *
 * バージョンは `package.json` を正とし、ライブラリのソース（`src/version.ts`）と
 * 公開文書（README・ガイド・技術仕様書）へ同じ値を書きます。リリース時にどれかを
 * 更新し忘れると、`haori:ready` の `detail.version` や文書の表記が実際の版と
 * ずれるため、ここで一致を固定します。
 *
 * 根拠は仕様書ではなくリリース手順（`package.json` を正として、ソースと公開文書のバージョン表記を一致させる）。
 */
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

import {VERSION} from '../src/version';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

/**
 * リポジトリ内のファイルを読み込みます。
 *
 * @param relativePath リポジトリルートからの相対パス
 * @returns ファイルの内容
 */
function read(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

const packageVersion = JSON.parse(read('package.json')).version as string;

describe('バージョン表記の一致', () => {
  it('src/version.ts が package.json と一致する', () => {
    expect(VERSION).toBe(packageVersion);
  });

  it('package-lock.json が package.json と一致する', () => {
    const lock = JSON.parse(read('package-lock.json'));
    expect(lock.version).toBe(packageVersion);
    expect(lock.packages[''].version).toBe(packageVersion);
  });

  it('公開文書の版数表記が package.json と一致する', () => {
    const documents: [string, RegExp][] = [
      ['README.md', /^Version: (.+)$/m],
      ['README.ja.md', /^バージョン: (.+)$/m],
      ['docs/ja/guide.md', /^バージョン: (.+)$/m],
      ['docs/ja/specs.md', /^バージョン: (.+)$/m],
    ];
    const mismatched: string[] = [];
    for (const [file, pattern] of documents) {
      const matched = read(file).match(pattern);
      if (matched === null) {
        mismatched.push(`${file}: 版数の記載が見つからない`);
        continue;
      }
      if (matched[1].trim() !== packageVersion) {
        mismatched.push(`${file}: ${matched[1].trim()}`);
      }
    }
    expect(
      mismatched,
      `package.json は ${packageVersion}:\n${mismatched.join('\n')}`,
    ).toEqual([]);
  });

  it('CHANGELOG に現在の版の節がある', () => {
    const changelog = read('CHANGELOG.md');
    expect(changelog).toContain(`## [${packageVersion}]`);
  });
});
