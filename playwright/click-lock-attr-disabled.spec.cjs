/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// クリックのロック解除と data-attr-disabled の実ブラウザ確認（課題 48）。
// 押下の手続きが自身の非活性条件を真にするボタンで、ロックの解除がその評価結果を
// 消していた。押したボタンだけが活性で残り、その間に押すと手続きがもう一度走る。
//
// 期待値の根拠は仕様「`data-{event}-fetch`」の「手続きが終わると、エンジンが付けた
// `disabled` はその時点の宣言の評価結果へ揃えます」。
const {test, expect} = require('@playwright/test');

/**
 * 再現ページを開きます。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @returns {Promise<void>} 読み込みの完了
 */
async function open(page) {
  await page.goto('/playwright/click-lock-attr-disabled-repro.html');
  await page.waitForSelector('body[data-haori-ready]');
}

test.describe('クリックのロック解除と data-attr-disabled（実ブラウザ）', () => {
  test('押したボタンも、評価結果どおり非活性のまま残る', async ({page}) => {
    await open(page);

    await page.locator('#btnA').click();
    await expect(page.locator('#out')).toHaveText('count=1');

    await expect(page.locator('#btnA')).toBeDisabled();
    await expect(page.locator('#btnB')).toBeDisabled();
  });

  test('非活性のままなので、手続きがもう一度走らない', async ({page}) => {
    await open(page);

    await page.locator('#btnA').click();
    await expect(page.locator('#out')).toHaveText('count=1');

    // 活性へ戻っていれば押せてしまい、count が 2 になる。
    await expect(
      page.locator('#btnA').click({timeout: 1500}),
    ).rejects.toThrow();
    await expect(page.locator('#out')).toHaveText('count=1');
  });

  test('条件が偽へ戻れば活性へ戻る', async ({page}) => {
    await open(page);

    await page.locator('#btnA').click();
    // 手続きの完了を待つ。待たずに見ると、ロックが付けた disabled を見てしまう。
    await expect(page.locator('#out')).toHaveText('count=1');
    await expect(page.locator('#btnA')).toBeDisabled();

    await page.locator('#close').click();
    await expect(page.locator('#btnA')).toBeEnabled();
  });
});
