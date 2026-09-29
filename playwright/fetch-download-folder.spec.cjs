/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 保存先のフォルダへ受け取りながら書き出す宣言
// （data-{event}-fetch-download-folder）の実ブラウザ確認。フォルダを選ばせる
// ダイアログはブラウザの機能なので自動では開けない。ここでは求めの差し替えを挟み、
// 実ブラウザの応答本文が最後まで書き出されること、名前が応答から決まることを見る。
const {test, expect} = require('@playwright/test');

/** 分割して届くだけの大きさの本文 */
const BODY = 'a'.repeat(1024 * 1024);

/**
 * ページを開き、保存先の求めと応答を差し替えます。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @returns {Promise<void>} 準備完了の Promise
 */
async function open(page) {
  await page.addInitScript(() => {
    window.__written = {};
    window.showDirectoryPicker = async () => ({
      getFileHandle: async (name, options) => {
        if (!options || !options.create) {
          const error = new Error(`${name} は見つかりません`);
          error.name = 'NotFoundError';
          throw error;
        }
        const record = {size: 0, closed: false};
        window.__written[name] = record;
        return {
          createWritable: async () => ({
            write: async chunk => {
              record.size += chunk.byteLength;
            },
            close: async () => {
              record.closed = true;
            },
            abort: async () => {},
          }),
        };
      },
      removeEntry: async () => {},
    });
  });
  await page.route('**/api/large.csv*', async route => {
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="customers-2026.csv"',
      },
      body: BODY,
    });
  });
  await page.goto('/playwright/fetch-download-folder-repro.html');
  await page.waitForSelector('body[data-haori-ready]');
}

test.describe('保存先のフォルダへ書き出す（実ブラウザ）', () => {
  test('応答の名前で、最後まで書き出す', async ({page}) => {
    await open(page);

    await page.locator('#export').click();
    await expect(page.locator('#done')).toHaveText(`完了 ${BODY.length}`);

    // 名前は応答の Content-Disposition から決まる（属性値の fallback.csv では
    // ない）。フォルダだけを先に選ばせるのは、このためである。
    const written = await page.evaluate(() => window.__written);
    expect(Object.keys(written)).toEqual(['customers-2026.csv']);
    expect(written['customers-2026.csv']).toEqual({
      size: BODY.length,
      closed: true,
    });
  });
});
