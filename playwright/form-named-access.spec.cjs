/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console */
// form の named access（<input name="id"> が form.id を上書きする）で
// 開発モードの診断経路が TypeError になっていた問題の回帰ガード。
// jsdom は named access の組み込み上書きを実装しないため、実ブラウザで確認する。
const {test, expect} = require('@playwright/test');

test.describe('form の named access', () => {
  test('name="id" の入力があってもバインド更新が壊れない', async ({page}) => {
    test.setTimeout(60000);
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.goto('/playwright/form-named-access-repro.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');
    await page.locator('#run').click();
    await page.waitForFunction(
      () => document.getElementById('log').textContent !== '-',
      {timeout: 50000},
    );
    const result = JSON.parse(await page.locator('#log').innerText());
    console.log('result:', JSON.stringify(result));

    // 前提: このブラウザで実際に form.id が上書きされていること。
    expect(result.shadowed, 'named access による上書きが起きていない').toBe(
      true,
    );
    expect(result.errors, JSON.stringify(result.errors)).toEqual([]);
    expect(result.child).toBe('derived');
  });
});
