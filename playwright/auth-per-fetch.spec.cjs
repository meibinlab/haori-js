/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, window, document */
// 取得ごとの認証ガードの切り替えの実ブラウザ確認。期待値の根拠は仕様「取得ごとの
// 切り替え」。従来の方式と CSP モードの両方で確かめる。
const {test, expect} = require('@playwright/test');

/**
 * 取得の応答を差し替え、ページを開きます。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @param {string} url 開く URL
 * @param {number} checkStatus 確認の取得に返すステータス
 * @returns {Promise<void>} 待ち合わせ
 */
async function open(page, url, checkStatus) {
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', event => {
      window.__violations.push(event.effectiveDirective);
    });
    window.__fetchErrors = [];
    document.addEventListener('haori:fetcherror', event => {
      window.__fetchErrors.push(event.detail.status);
    });
  });
  await page.route('**/api/access-check', route =>
    route.fulfill({
      status: checkStatus,
      contentType: 'application/json',
      body: '{}',
    }),
  );
  await page.route('**/api/op', route =>
    route.fulfill({status: 403, contentType: 'application/json', body: '{}'}),
  );
  await page.goto(url);
}

for (const [label, url] of [
  ['従来の方式', '/playwright/auth-per-fetch-repro.html'],
  ['CSP モード', '/playwright/auth-per-fetch-csp-repro.html'],
]) {
  test.describe(`取得ごとの認証ガード（${label}）`, () => {
    test('確認の取得の 403 では、取得の要素の宣言の URL へ移る', async ({
      page,
    }) => {
      await open(page, url, 403);
      await expect(page).toHaveURL(/\/playwright\/auth-denied\.html$/);
      await expect(page.locator('#denied')).toBeVisible();
    });

    test('操作の取得の 403 では、空の宣言なので遷移せず失敗として扱う', async ({
      page,
    }) => {
      await open(page, url, 200);
      await page.waitForSelector('body[data-haori-ready]');
      await page.locator('#op').click();
      await expect
        .poll(() => page.evaluate(() => window.__fetchErrors))
        .toEqual([403]);
      expect(page.url()).toContain(url);
      expect(await page.evaluate(() => window.__violations)).toEqual([]);
    });
  });
}
