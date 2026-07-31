/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, __dirname */
// demo画面の正常表示を確認するPlaywrightテスト（CommonJS用）
//
// demo/ 配下の全 HTML を自動列挙し、ページごとに次を検査する。
// 1. 主要な要素が描画されている
// 2. Haori を読み込むページでは `data-haori-ready` が付く（初期化の完走）
// 3. 可視領域に未展開の `{{式}}` が残らない（描画漏れの検出）
// 4. デモ側の記述ミスを示す警告が出ない（禁止キーワード・属性値の解釈失敗）
// 5. JS エラーと console.error が出ない
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// demoディレクトリ内の全HTMLファイルを自動検出
const demoDir = path.resolve(__dirname, '../demo');
function findHtmlFiles(dir) {
  let results = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findHtmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      // PlaywrightのbaseURLからの相対パスに変換
      results.push(path.relative(demoDir, fullPath).replace(/\\/g, '/'));
    }
  });
  return results;
}
const demoFiles = findHtmlFiles(demoDir);

// Haori（または haori-bootstrap）を読み込むページの判定に使う。
// 遷移先やインポート用の断片は本体を読み込まないため、初期化の検査から外す。
const HAORI_SCRIPT_PATTERN = /haori(-bootstrap)?[.@][^"']*\.js|haori\.es\.js/;

// デモ側の記述ミスを示す警告。仕様どおりの診断警告（未解決参照の集約報告など）は
// デモが意図して出している場合があるため、対象を記述ミスに限定する。
const AUTHORING_WARNING_PATTERNS = [
  /disallowed keyword/i, // 式に禁止キーワード（typeof など）を書いた
  /cannot be parsed/i, // 属性値に式をそのまま書きブラウザが解釈できない
];

demoFiles.forEach(file => {
  const source = fs.readFileSync(path.join(demoDir, file), 'utf8');
  const usesHaori = HAORI_SCRIPT_PATTERN.test(source);

  test.describe(`${file} の表示テスト`, () => {
    test(`正常に表示される`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', err => errors.push(err));
      // JSエラー以外のconsole.errorも検出
      const consoleErrors = [];
      const consoleWarnings = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
        if (msg.type() === 'warning') consoleWarnings.push(msg.text());
      });
      await page.goto(`/demo/${file}`);

      // 初期化の完走を待つ（Haori を読み込むページのみ）。
      if (usesHaori) {
        await page.waitForFunction(
          () => document.body.hasAttribute('data-haori-ready'),
          undefined,
          { timeout: 10000 },
        );
      }
      // 追従投入分を含めてレンダリングの完了を待つ（iife グローバルがある場合）。
      await page.evaluate(async () => {
        const runtime = window.Haori;
        if (runtime && typeof runtime.waitForRenders === 'function') {
          await runtime.waitForRenders();
        }
      });

      // 主要なHTML要素が表示されているか厳密に確認
      const h1 = await page.$('h1');
      const h2 = await page.$('h2');
      const h3 = await page.$('h3');
      const table = await page.$('table');
      const div = await page.$('div');
      expect(h1 || h2 || h3 || table || div).not.toBeNull();
      // 主要な要素のテキストが空でないことも確認
      for (const el of [h1, h2, h3]) {
        if (el) {
          const text = await el.textContent();
          expect(text && text.trim().length).toBeGreaterThan(0);
        }
      }
      // テーブルがある場合はtbody>trが1つ以上あること
      if (table) {
        const rows = await page.$$('table tbody tr');
        expect(rows.length).toBeGreaterThan(0);
      }
      // 遅延取得や追加描画の分を待って安定させる
      await page.waitForTimeout(700);

      // 可視領域に未展開の `{{式}}` が残っていないこと。
      // 説明のために式を字面で見せる要素（code / pre など）と、`data-if` で
      // 非表示の分岐は対象外とする。
      const leftovers = await page.evaluate(() => {
        const skipTags = new Set([
          'CODE',
          'PRE',
          'TEXTAREA',
          'SCRIPT',
          'STYLE',
          'TEMPLATE',
          'SAMP',
          'KBD',
        ]);
        const found = [];
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        );
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const text = node.nodeValue || '';
          if (!text.includes('{{')) continue;
          const parent = node.parentElement;
          if (!parent) continue;
          let skipped = false;
          for (let el = parent; el; el = el.parentElement) {
            if (skipTags.has(el.tagName)) {
              skipped = true;
              break;
            }
          }
          if (skipped) continue;
          if (typeof parent.checkVisibility === 'function') {
            if (!parent.checkVisibility()) continue;
          } else if (!parent.offsetParent && parent.tagName !== 'BODY') {
            continue;
          }
          const chain = [];
          for (
            let el = parent;
            el && el !== document.body;
            el = el.parentElement
          ) {
            chain.push(el.tagName.toLowerCase());
          }
          found.push(
            `[${chain.slice(0, 5).join('<')}] ${text.trim().slice(0, 70)}`,
          );
        }
        return found;
      });
      expect(
        leftovers,
        `未展開の式が残っています:\n${leftovers.join('\n')}`,
      ).toEqual([]);

      // デモ側の記述ミスを示す警告が出ていないこと。
      const authoringWarnings = consoleWarnings.filter(message =>
        AUTHORING_WARNING_PATTERNS.some(pattern => pattern.test(message)),
      );
      expect(
        authoringWarnings,
        `記述ミスの警告: ${authoringWarnings.join('\n')}`,
      ).toEqual([]);

      // JSエラー・console.error が発生しないこと。
      expect(errors, `JS errors: ${errors.join('\n')}`).toEqual([]);
      expect(consoleErrors, `Console errors: ${consoleErrors.join('\n')}`).toEqual([]);
    });
  });
});
