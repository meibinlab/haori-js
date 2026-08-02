/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 外部ライブラリがスクリプトから代入した入力値が収集されることの実ブラウザ確認。
// 郵便番号からの住所補完（YubinBango 等）は keyup で `element.value` へ直接代入し、
// change / input を発火しない。内部値だけを見て収集していると、画面には表示されて
// いるのに送信・保存されない欄ができる（`required` の検証も通るため気づけない）。
const {test, expect} = require('@playwright/test');

/** 補完後に期待する住所。 */
const FILLED = {
  postalCode: '1000001',
  prefecture: '東京都',
  municipality: '千代田区',
  town: '千代田',
};

/**
 * ページを開き、送信先のルートを差し替えます。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @returns {Promise<{bodies: string[]}>} 受け取った送信ボディの収集先
 */
async function open(page) {
  const bodies = [];
  await page.route('**/api/save', async route => {
    bodies.push(route.request().postData());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
  });
  await page.goto('/playwright/external-value-collection-repro.html');
  await page.waitForSelector('body[data-haori-ready]');
  return {bodies};
}

/**
 * 郵便番号を 1 文字ずつ入力し、補完が入るまで待ちます。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @returns {Promise<void>} 補完完了で解決します
 */
async function fillPostalCode(page) {
  await page.locator('[name=postalCode]').pressSequentially(FILLED.postalCode);
  // 補完は入力欄への直接代入なので、まず画面上の値で完了を待つ。
  await expect(page.locator('[name=prefecture]')).toHaveValue(
    FILLED.prefecture,
  );
  await expect(page.locator('[name=municipality]')).toHaveValue(
    FILLED.municipality,
  );
  await expect(page.locator('[name=town]')).toHaveValue(FILLED.town);
}

test.describe('外部ライブラリが代入した入力値の収集', () => {
  test('補完直後に送信すると住所が送信ボディへ載る', async ({page}) => {
    test.setTimeout(60000);
    const {bodies} = await open(page);
    await fillPostalCode(page);

    // 他の欄を触らずそのまま「次へ」を押す（報告の受け入れ条件）。
    await page.locator('#next').click();
    await expect.poll(() => bodies.length).toBe(1);

    expect(JSON.parse(bodies[0])).toEqual({
      customer: {...FILLED, memo: ''},
    });
  });

  test('補完された住所が双方向バインディングでバインドデータへ載る', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await open(page);
    await fillPostalCode(page);

    // 郵便番号の入力を確定させると収集が走る（報告の「他の欄を編集した後」）。
    await page.locator('[name=memo]').fill('あとで確認');
    await page.locator('[name=memo]').blur();

    await expect
      .poll(async () =>
        JSON.parse(
          await page.locator('#customer-form').getAttribute('data-bind'),
        ),
      )
      .toEqual({customer: {...FILLED, memo: 'あとで確認'}});
  });
});
