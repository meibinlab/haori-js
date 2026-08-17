/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// `data-{event}-reset-before` と `data-{event}-bind` を同じバインドホストへ向けたとき、
// そのホストへ `data-fetch-bind` で寄せた取得結果が失われないことの実ブラウザ確認。
// 期待値の根拠は仕様「`data-{event}-reset`」（初期化の対象は「フォーム自身のバインド
// データ」で、`<form>` と `data-form-arg` フォームに限る）と仕様「`data-fetch`」。
const {test, expect} = require('@playwright/test');

/**
 * ページを開き、取得回数の記録を返します。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @returns {Promise<{count: () => number}>} 取得回数の参照
 */
async function open(page) {
  let requests = 0;
  await page.route('**/package.json', async route => {
    requests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"name":"haori"}',
    });
  });
  await page.goto('/playwright/reset-before-bind-host-repro.html');
  await page.waitForSelector('body[data-haori-ready]');
  await expect(page.locator('#out')).toHaveText('haori');
  return {count: () => requests};
}

test.describe('リセットと bind を同じホストへ向ける', () => {
  test('reset-before でも data-fetch の結果が失われない', async ({page}) => {
    test.setTimeout(60000);
    const {count} = await open(page);

    await page.locator('#btn').click();

    // bind は従来どおり書き込まれる。
    await expect(page.locator('#out-dialog')).toHaveText('1');
    // 取得結果は保たれる（再取得に頼らない）。
    await expect(page.locator('#out')).toHaveText('haori');
    expect(count()).toBe(1);

    // 2 回目のクリックでも失われない。
    await page.locator('#btn').click();
    await expect(page.locator('#out')).toHaveText('haori');
    expect(count()).toBe(1);
  });

  test('reset でも data-fetch の結果が失われない', async ({page}) => {
    test.setTimeout(60000);
    const {count} = await open(page);

    await page.locator('#btn-reset').click();

    await expect(page.locator('#out-dialog')).toHaveText('2');
    await expect(page.locator('#out')).toHaveText('haori');
    expect(count()).toBe(1);
  });

  test('form でない要素でも入力欄は既定値へ戻る', async ({page}) => {
    test.setTimeout(60000);
    await open(page);

    await page.locator('#keyword').fill('編集後');
    await page.locator('#plan').selectOption('1');

    await page.locator('#btn-values').click();

    await expect(page.locator('#keyword')).toHaveValue('初期');
    await expect(page.locator('#plan')).toHaveValue('2');
  });
});
