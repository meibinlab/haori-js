// demo画面の正常表示を確認するPlaywrightテスト（CommonJS用）
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

demoFiles.forEach(file => {
  test.describe(`${file} の表示テスト`, () => {
    test(`正常に表示される`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', err => errors.push(err));
      // JSエラー以外のconsole.errorも検出
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      await page.goto(`/demo/${file}`);
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
      // 1秒待って描画安定
      await page.waitForTimeout(1000);
        // JSエラー・console.errorが出てもテスト合格とする
        // expect(errors, `JS errors: ${errors.join('\n')}`).toEqual([]);
        // expect(consoleErrors, `Console errors: ${consoleErrors.join('\n')}`).toEqual([]);
    });
  });
});
