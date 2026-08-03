/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 同名チェックボックス群を、人手より速い間隔で連続クリックしたときの整合を確認する。
// チェック状態の書き戻しは描画キューを経由するため、待たずに次のクリックが来ると
// 「画面はチェック済みなのに送信値に含まれない」形の食い違いが起こり得る。
// jsdom では実ブラウザのイベント順序を再現できないため、ここで押さえる。
const {test, expect} = require('@playwright/test');

test.describe('連続クリックしたチェックボックス群（実ブラウザ）', () => {
  test('画面のチェック状態と送信値が一致する', async ({page}) => {
    test.setTimeout(60000);
    const urls = [];
    await page.route('**/api/save*', async route => {
      urls.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      });
    });
    await page.goto('/playwright/rapid-checkbox-group-repro.html');
    await page.waitForSelector('body[data-haori-ready]');
    const boxes = page.locator('input[name="optionIds"]');
    await expect(boxes).toHaveCount(4);

    // 20 回繰り返し、毎回 4 つを間隔なしで連続クリックしてから外す。
    for (let round = 0; round < 20; round += 1) {
      for (let index = 0; index < 4; index += 1) {
        await boxes.nth(index).click();
      }
      const checked = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll('input[name="optionIds"]'),
        )
          .filter(input => input.checked)
          .map(input => input.value),
      );
      expect(checked).toEqual(['11', '12', '13', '14']);

      urls.length = 0;
      await page.locator('#send').click();
      await expect.poll(() => urls.length).toBe(1);
      const sent = new URL(urls[0]).searchParams.getAll('optionIds');
      expect(sent, `round ${round}`).toEqual(['11', '12', '13', '14']);

      for (let index = 0; index < 4; index += 1) {
        await boxes.nth(index).click();
      }
    }
  });
});
