/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// リセットと data-derive の配下の再評価の実ブラウザ確認（課題 49）。
// 非表示のうちにリセットしてから同じ値で開き直すと、入力欄が空のまま残っていた。
//
// 期待値の根拠は仕様「`data-{event}-reset`」の「再評価して `data-each` の行と宣言
// バインドの現在の評価結果を入力欄へ入れ直す」。
const {test, expect} = require('@playwright/test');

/**
 * 再現ページを開きます。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @returns {Promise<void>} 読み込みの完了
 */
async function open(page) {
  await page.goto('/playwright/reset-derive-subtree-repro.html');
  await page.waitForSelector('body[data-haori-ready]');
}

/**
 * 同じ値で開き直します。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @param {string} openSelector 開くボタンのセレクタ
 * @returns {Promise<void>} 操作の完了
 */
async function reopen(page, openSelector) {
  await page.locator(openSelector).click();
  await expect(page.locator('#name')).toHaveValue('A');
  await page.locator('#close').click();
  await expect(page.locator('#panel')).toBeHidden();
  await page.locator(openSelector).click();
  await expect(page.locator('#panel')).toBeVisible();
}

test.describe('リセットと data-derive の配下の再評価（実ブラウザ）', () => {
  test('reset-before で同じ値を開き直しても、欄が評価結果で埋まる', async ({
    page,
  }) => {
    await open(page);

    await reopen(page, '#openBefore');

    await expect(page.locator('#name')).toHaveValue('A');
    await expect(page.locator('#kind')).toHaveValue('k2');
    await expect(page.locator('#nameCopy')).toHaveValue('A');
  });

  test('開き直した後の収集値も評価結果と一致する', async ({page}) => {
    await open(page);

    await reopen(page, '#openBefore');
    await page.locator('#collect').click();

    await expect(page.locator('#outName')).toHaveText('A');
    await expect(page.locator('#outKind')).toHaveText('k2');
  });

  test('リセットせずに開き直した場合は変わらない（対照）', async ({page}) => {
    await open(page);

    await reopen(page, '#openPlain');

    await expect(page.locator('#name')).toHaveValue('A');
    await expect(page.locator('#kind')).toHaveValue('k2');
  });
});
