/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 行の同名チェックボックス群（送信値を宣言バインドで与える構成）の実ブラウザ確認。
// チェック状態の判定に使う送信値を属性マップから引くと、`data-attr-value` の場合は
// 値が無く null になる。収集値（配列）と比較して常に不一致となり、2 つ目をチェック
// した直後の書き戻しでグループ全体のチェックが落ちていた。
// 表示より先に収集値が壊れるため、送信値でも確かめる。
const {test, expect} = require('@playwright/test');

test.describe('行の同名チェックボックス群（実ブラウザ）', () => {
  test('2 つチェックすると両方が送信される', async ({page}) => {
    test.setTimeout(60000);
    const urls = [];
    await page.route('**/api/send*', async route => {
      urls.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      });
    });
    await page.goto('/playwright/row-checkbox-group-repro.html');
    await page.waitForSelector('body[data-haori-ready]');

    const boxes = page.locator('#f input[type=checkbox]');
    await expect(boxes).toHaveCount(2);
    await boxes.nth(0).check();
    await boxes.nth(1).check();

    // 表示が落ちない（報告では 2 つ目のチェックから数百 ms 以内に両方 off になる）。
    await page.waitForTimeout(300);
    await expect(boxes.nth(0)).toBeChecked();
    await expect(boxes.nth(1)).toBeChecked();

    // 送信値も 2 件そろう。
    await page.locator('#send').click();
    await expect.poll(() => urls.length).toBe(1);
    const query = new URL(urls[0]).searchParams.getAll('optionIds');
    expect(query).toEqual(['11', '12']);
  });
});
