/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, URL, window */
// data-click-refetch の対象で、同じ手続きのバインドが自動の取得を走らせた場合に取り
// 直さないことの実ブラウザ確認。期待値の根拠は仕様「`data-{event}-refetch`」の「手続き
// がバインド（処理順序の 9）へ進んだ後に、対象の要素で、今の実行シグネチャの自動の取得
// が始まった場合は、取り直しません」「自動の取得が走らなかった場合（条件を変えずに
// 押した場合など）は、取り直します」。フォームの送信を伴う実際の操作で確かめるため、
// 単体テスト（tests/click-refetch-managed-fetch.test.ts）とは別にここで確かめる。従来
// の方式と CSP モードの両方で確かめる。
const {test, expect} = require('@playwright/test');

/**
 * 集計の要求を記録し、条件ごとに 1 行の応答を返します。
 *
 * @param {import('@playwright/test').Page} page 対象のページ
 * @returns {Promise<string[]>} 要求された条件（`from` の値）の一覧
 */
async function recordSummaries(page) {
  const requested = [];
  await page.route('**/api/summary*', async route => {
    const from = new URL(route.request().url()).searchParams.get('from');
    requested.push(from);
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({rows: [`集計 ${from}`]}),
    });
  });
  return requested;
}

for (const [label, url] of [
  ['従来の方式', '/playwright/click-refetch-managed-fetch-repro.html'],
  ['CSP モード', '/playwright/click-refetch-managed-fetch-csp-repro.html'],
]) {
  test.describe(`取り直しと自動の取得（${label}）`, () => {
    test('条件を変えて押すと 1 回、変えずに押すとさらに 1 回だけ取得する', async ({
      page,
    }) => {
      const requested = await recordSummaries(page);
      await page.goto(url);
      await page.waitForSelector('body[data-haori-ready]');

      await page.locator('#from').fill('2026-10-01');
      await page.locator('#show').click();
      await expect(page.locator('#rows li')).toHaveText(['集計 2026-10-01']);
      await page.evaluate(() => window.Haori.waitForRenders());
      expect(requested).toEqual(['2026-10-01']);

      // 条件を変えずに押すと、空に戻した集計表を取り直しで埋め直す。
      await page.locator('#show').click();
      await expect(page.locator('#show')).not.toHaveAttribute(
        'data-haori-click-lock',
      );
      await expect(page.locator('#rows li')).toHaveText(['集計 2026-10-01']);
      await page.evaluate(() => window.Haori.waitForRenders());
      expect(requested).toEqual(['2026-10-01', '2026-10-01']);
    });
  });
}
