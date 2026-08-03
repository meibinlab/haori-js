/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// リセットで、候補を `data-each` で流し込む `<select>` が既定値へ戻ることを実ブラウザで
// 確認する。候補が揃った時点で書き込みを載せ直す仕組みがリセット後にも働くと、
// クリアしたはずの `<select>` だけがクリア前の値へ戻り、検索条件のクリアが効かない。
const {test, expect} = require('@playwright/test');

test.describe('リセットと候補が後から届く select（実ブラウザ）', () => {
  test('クリア後は select も既定値に戻り、再取得も既定値で送信される', async ({
    page,
  }) => {
    test.setTimeout(60000);
    const urls = [];
    await page.route('**/api/list*', async route => {
      urls.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({content: []}),
      });
    });
    await page.goto('/playwright/reset-late-option-select-repro.html');
    await page.waitForSelector('body[data-haori-ready]');
    await expect(page.locator('#sel option')).toHaveCount(3);

    await page.locator('#sel').selectOption('7');
    await page.locator('#txt').fill('あ');
    await expect(page.locator('#sel')).toHaveValue('7');

    urls.length = 0;
    await page.locator('#clear').click();
    await page.waitForTimeout(700);

    expect(await page.locator('#sel').inputValue()).toBe('');
    expect(await page.locator('#txt').inputValue()).toBe('');
    expect(urls.length).toBeGreaterThan(0);
    const last = new URL(urls[urls.length - 1]);
    expect(last.searchParams.get('parentId')).toBe('');
    expect(last.searchParams.get('name')).toBe('');
  });

  test('再取得を伴わないクリアでも select が既定値に戻る', async ({page}) => {
    test.setTimeout(60000);
    await page.route('**/api/list*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({content: []}),
      });
    });
    await page.goto('/playwright/reset-late-option-select-repro.html');
    await page.waitForSelector('body[data-haori-ready]');
    await expect(page.locator('#sel option')).toHaveCount(3);

    await page.locator('#sel').selectOption('7');
    await page.locator('#txt').fill('あ');

    await page.locator('#clear-only').click();
    await page.waitForTimeout(700);

    expect(await page.locator('#sel').inputValue()).toBe('');
    expect(await page.locator('#txt').inputValue()).toBe('');
  });
});
