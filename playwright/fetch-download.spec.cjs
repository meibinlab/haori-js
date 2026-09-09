/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 応答をファイルとして保存する宣言（data-{event}-fetch-download）の実ブラウザ確認。
// 保存はブラウザの機能なので、jsdom では「アンカーを押したこと」までしか見られない。
// ここでは実際にダウンロードが始まること、Content-Disposition のファイル名が使われる
// こと、失敗が画面のメッセージになることを確認する。
const {test, expect} = require('@playwright/test');

/** 送信されたエクスポートの URL を控える先 */
let exportUrls = [];

/**
 * ページを開き、エクスポートの応答を差し替えます。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @returns {Promise<void>} 準備完了の Promise
 */
async function open(page) {
  exportUrls = [];
  await page.route('**/api/customers.csv*', async route => {
    exportUrls.push(route.request().url());
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="customers-2026.csv"',
      },
      body: 'id,name\n1,鈴木\n',
    });
  });
  await page.route('**/api/customers-error.csv*', async route => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({message: '出力に失敗しました'}),
    });
  });
  await page.goto('/playwright/fetch-download-repro.html');
  await page.waitForSelector('body[data-haori-ready]');
}

test.describe('応答のファイル保存（実ブラウザ）', () => {
  test('Content-Disposition の名前で保存し、検索条件を送る', async ({page}) => {
    await open(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#export').click(),
    ]);

    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「応答の `Content-Disposition` のファイル名」。
    expect(download.suggestedFilename()).toBe('customers-2026.csv');

    // 同節の「送信内容の組み立ては通常のフェッチと同じです」。
    expect(exportUrls).toHaveLength(1);
    expect(exportUrls[0]).toContain('keyword=');
    expect(exportUrls[0]).toContain('status=active');
  });

  test('失敗は保存せず、画面のメッセージになる', async ({page}) => {
    await open(page);

    let started = false;
    page.on('download', () => {
      started = true;
    });

    await page.locator('#export-error').click();

    // 仕様「`data-fetch-download` / `data-{event}-fetch-download`」の
    // 「2xx 以外は保存せず…通常のフェッチと同じエラーの振り分けに載せます」。
    // ブラウザのダウンロードに委ねていたときは、失敗しても画面に何も出なかった。
    await expect(page.locator('#search-form')).toHaveAttribute(
      'data-message',
      '出力に失敗しました',
    );
    expect(started).toBe(false);
  });
});
