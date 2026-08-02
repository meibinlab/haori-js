/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 候補が後から描画される `<select>` への値の反映を実ブラウザで確認する。
// 入力欄への書き戻しは行生成より前に走るため、代入した時点では該当する `<option>` が
// まだ無い。`<select>` は候補に無い値の代入を無視し、ブラウザが先頭の候補を自動選択
// するため、画面と収集値が食い違ったままになっていた。
const {test, expect} = require('@playwright/test');

test.describe('候補が後から届く select（実ブラウザ）', () => {
  test('保存済みの値が画面にも収集値にも載る', async ({page}) => {
    test.setTimeout(60000);
    const urls = [];
    await page.route('**/api/record', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          pref: '東京都',
          opts: [{v: '大阪府'}, {v: '東京都'}, {v: '福岡県'}],
        }),
      });
    });
    await page.route('**/api/send*', async route => {
      urls.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      });
    });
    await page.goto('/playwright/late-option-select-repro.html');
    await page.waitForSelector('body[data-haori-ready]');

    await page.locator('#load').click();
    await expect(page.locator('#pref option')).toHaveCount(3);

    // 画面の選択が供給された値になる。
    await expect(page.locator('#pref')).toHaveValue('東京都');

    // 送信値も一致する（画面と送信内容が食い違わない）。
    await page.locator('#send').click();
    await expect.poll(() => urls.length).toBe(1);
    expect(new URL(urls[0]).searchParams.get('pref')).toBe('東京都');
  });
});
