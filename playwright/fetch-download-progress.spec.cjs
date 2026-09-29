/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// ダウンロードの受信の進み具合（`_fetch.receivedBytes` / `_fetch.totalBytes`）の
// 実ブラウザ確認。jsdom では応答本文を 1 チャンクで渡せてしまうため、実際に
// 分割して届く経路で最後まで数え上げられることを見る。
const {test, expect} = require('@playwright/test');

/** 分割して届くだけの大きさの本文 */
const BODY = 'a'.repeat(1024 * 1024);

/**
 * ページを開き、エクスポートの応答を差し替えます。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @returns {Promise<void>} 準備完了の Promise
 */
async function open(page) {
  await page.route('**/api/large.csv*', async route => {
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Length': String(BODY.length),
      },
      body: BODY,
    });
  });
  await page.goto('/playwright/fetch-download-progress-repro.html');
  await page.waitForSelector('body[data-haori-ready]');
}

test.describe('ダウンロードの受信の進み具合（実ブラウザ）', () => {
  test('受け取った量と全体の量を画面から参照できる', async ({page}) => {
    await open(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#export').click(),
    ]);
    expect(download.suggestedFilename()).toBe('large.csv');

    // 仕様「`data-fetch-state` / `data-{event}-fetch-state`」の
    // 「受け取りの完了時には必ず最終値を入れます」。分割して届いても、
    // 数え上げた合計は本文の大きさに一致する。
    await expect(page.locator('#done')).toHaveText(
      `完了 ${BODY.length} / ${BODY.length}`,
    );
    // 受信中の表示は成功の時点で消える。
    await expect(page.locator('#loading')).toBeHidden();
  });
});
