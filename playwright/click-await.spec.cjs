/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// クリックの完了待ち（data-{event}-click-await）の実ブラウザ確認。
// 一覧の並べ替えは 2 件の更新を順に送る必要があり、前段が失敗したまま後段を送ると
// 表示順が壊れる。宣言だけで直列化と打ち切りができることを操作で確認する。
const {test, expect} = require('@playwright/test');

/**
 * ページを開き、更新 API の応答を差し替えます。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @param {number} firstStatus 1 件目に返す HTTP ステータス
 * @returns {Promise<string[]>} 受け取った順に並ぶ記録（start:/end:）
 */
async function open(page, firstStatus) {
  const log = [];
  await page.route('**/api/items/1', async route => {
    log.push('start:1');
    // 1 件目をわざと遅くする。待っていなければ 2 件目が先に始まる。
    await new Promise(resolve => setTimeout(resolve, 400));
    log.push('end:1');
    await route.fulfill({
      status: firstStatus,
      contentType: 'application/json',
      body: JSON.stringify(
        firstStatus === 200 ? {} : {message: '更新に失敗しました'},
      ),
    });
  });
  await page.route('**/api/items/2', async route => {
    log.push('start:2');
    log.push('end:2');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
  });
  await page.goto('/playwright/click-await-repro.html');
  await page.waitForSelector('body[data-haori-ready]');
  return log;
}

test.describe('クリックの完了待ち（実ブラウザ）', () => {
  test('宣言した順に直列で送る', async ({page}) => {
    const log = await open(page, 200);

    await page.locator('#move-up').click();
    await expect(page.locator('.haori-toast')).toHaveText(
      '表示順を更新しました',
    );

    expect(log).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
  });

  test('失敗したら後続を送らず、メッセージを出す', async ({page}) => {
    const log = await open(page, 500);

    await page.locator('#move-up').click();
    await expect(page.locator('#row')).toHaveAttribute(
      'data-message',
      '更新に失敗しました',
    );

    // 2 件目は送らない。片方だけ通ると表示順が重複する。
    expect(log).toEqual(['start:1', 'end:1']);
    // 呼び出し元のトーストも出さない。
    await expect(page.locator('.haori-toast')).toHaveCount(0);
  });
});
