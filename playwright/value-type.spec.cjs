/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// `data-value-type` で宣言した収集値の型が、実ブラウザの送信ボディまで保たれることの
// 確認。要望の受け入れ条件は「hidden 入力に真偽値・数値を宣言でき、`data-{event}-form`
// の収集結果と送信本文で型が保たれる」「宣言しない限り従来どおり」。
// 期待値の根拠は仕様「`data-value-type`」。
const {test, expect} = require('@playwright/test');

/**
 * ページを開き、送信先のルートを差し替えます。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @returns {Promise<{bodies: string[]}>} 受け取った送信ボディの収集先
 */
async function open(page) {
  const bodies = [];
  await page.route('**/api/apply', async route => {
    bodies.push(route.request().postData());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
  });
  await page.goto('/playwright/value-type-repro.html');
  await page.waitForSelector('body[data-haori-ready]');
  return {bodies};
}

test.describe('data-value-type', () => {
  test('宣言した型のまま送信ボディへ載る', async ({page}) => {
    test.setTimeout(60000);
    const {bodies} = await open(page);

    await page.locator('#send').click();
    await expect.poll(() => bodies.length).toBe(1);

    expect(JSON.parse(bodies[0])).toEqual({
      agree: true,
      // `false` も値として書く（属性削除にしない）。
      reject: false,
      count: 12,
      // 宣言しない欄は従来どおり文字列。
      plain: 'true',
      planId: 2,
      memo: '控え',
    });
  });

  test('宣言した欄の DOM は文字列のまま（画面と送信値が食い違わない）', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await open(page);

    await expect(page.locator('[name=agree]')).toHaveValue('true');
    await expect(page.locator('[name=reject]')).toHaveValue('false');
    await expect(page.locator('[name=count]')).toHaveValue('12');
  });
});
