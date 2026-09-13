/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// URL の変更を契機とした data-url-param の読み直しの実ブラウザ確認（課題 51）。
// 取り込みが走査時の 1 回だけだったため、検索で URL を書き換えても取り込んだ値が
// 古いまま残り、戻る操作でも URL と食い違っていた。
//
// 期待値の根拠は仕様「`data-url-param`」の「取り込みの契機」と、仕様
// 「`data-{event}-history`」の「戻る・進む操作（`popstate`）の扱い」。
const {test, expect} = require('@playwright/test');

/**
 * 再現ページを開き、再読み込みの検出用の目印を置きます。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @returns {Promise<void>} 読み込みの完了
 */
async function open(page) {
  await page.goto('/playwright/url-param-refresh-repro.html?q=v0');
  await page.waitForSelector('body[data-haori-ready]');
  // 再読み込みが起きるとこの目印は消える。
  await page.evaluate(() => {
    window.__marker = 'kept';
  });
}

/**
 * 検索欄へ値を入れて URL を書き換えます。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @param {string} value 検索欄へ入れる値
 * @returns {Promise<void>} 操作の完了
 */
async function search(page, value) {
  await page.locator('#q').fill(value);
  await page.locator('#search').click();
}

test.describe('URL の変更と data-url-param の読み直し（実ブラウザ）', () => {
  test('URL を書き換えると、取り込んだ値が新しくなる', async ({page}) => {
    await open(page);
    await expect(page.locator('#argV')).toHaveText('v0');

    await search(page, 'v1');

    await expect(page).toHaveURL(/\?q=v1$/);
    await expect(page.locator('#argV')).toHaveText('v1');
    await expect(page.locator('#noArgV')).toHaveText('v1');
    // 再読み込みではなく、その場で読み直している。
    expect(await page.evaluate(() => window.__marker)).toBe('kept');
  });

  test('読み直しても、同じ要素へ書いた他のキーは残る', async ({page}) => {
    await open(page);
    await page.locator('#tickSelf').click();
    await expect(page.locator('#argSelfTick')).toHaveText('1');

    await search(page, 'v1');

    await expect(page.locator('#argV')).toHaveText('v1');
    await expect(page.locator('#argSelfTick')).toHaveText('1');
  });

  test('Haori が積んでいない履歴項目へ戻ると、URL の値に揃う', async ({
    page,
  }) => {
    await open(page);
    await search(page, 'v1');
    await expect(page.locator('#argV')).toHaveText('v1');

    await page.goBack();

    await expect(page).toHaveURL(/\?q=v0$/);
    await expect(page.locator('#argV')).toHaveText('v0');
    await expect(page.locator('#noArgV')).toHaveText('v0');
  });
});
