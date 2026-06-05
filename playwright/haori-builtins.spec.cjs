/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 組み込みヘルパー（haori.date / number / pages）と data-click-prevent を
// 実ブラウザで検証する。改修要望 H1・H2・H3 の受け入れ条件に対応する。
const {test, expect} = require('@playwright/test');

test.describe('haori built-in helpers', () => {
  test('日時・数値整形、番号ページネーション、送信抑止が機能する', async ({
    page,
  }) => {
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    await page.goto('/demo/builtins/haori-builtins-demo.html');
    await page.evaluate(() => window.Haori.waitForRenders());

    // H3: 日時フォーマット（オフセットなし ISO はローカル時刻として解釈される）
    await expect(page.locator('#data-table tbody tr').first().locator('.updated')).toHaveText(
      '2024/01/05 09:05',
    );
    // H3: 数値フォーマット（桁区切り）
    await expect(page.locator('#data-table tbody tr').first().locator('.amount')).toHaveText(
      '1,234,567',
    );

    // H2: 現在ページ（number=9, 0始まり）の表示ラベルは 10、強調表示される
    await expect(
      page.locator('#pagination-nav .page-item.active span[aria-current="page"]'),
    ).toHaveText('10');
    // H2: 中央のため両側に省略記号が表示される
    await expect(page.locator('#pagination-nav .page-link.ellipsis:visible')).toHaveCount(2);
    // H2: 先頭(1)・末尾(20)のページが存在する
    await expect(
      page.locator('#pagination-nav .page-item button.page-link:visible').first(),
    ).toHaveText('1');

    // H1: type="submit" + data-click-prevent はネイティブ送信せずハンドラだけ実行する
    const urlBefore = page.url();
    await page.locator('#save-btn').click();
    await page.evaluate(() => window.Haori.waitForRenders());
    expect(page.url()).toBe(urlBefore);
    expect(await page.evaluate(() => window.__submitHandled === true)).toBe(true);

    expect(
      pageErrors,
      `JS errors: ${pageErrors.join('\n')}`,
    ).toEqual([]);
    expect(
      consoleErrors,
      `Console errors: ${consoleErrors.join('\n')}`,
    ).toEqual([]);
  });
});
