/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console */
// 入力要素自身の data-change-bind が、その編集自身の「編集済みの印」を解除して
// いた問題の回帰ガード。参照キー（record.*）と書込キー（draft）が別の構成で、
// 次の項目を編集すると直前の項目が空へ上書きされ、画面は空・収集値は入力済みと
// いう食い違いが起きていた。
// 実ブラウザは dirty value flag を持つため jsdom と値の権威の伝わり方が異なる。
const {test, expect} = require('@playwright/test');

test.describe('双方向コミットのバインドとユーザー編集の優先', () => {
  test('data-change-bind でも順に編集した 3 項目が保持される', async ({
    page,
  }) => {
    test.setTimeout(60000);
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.goto('/playwright/commit-bind-user-edit-repro.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');

    await page.locator('#ia').fill('AAA');
    await page.locator('#ib').fill('BBB');
    await page.locator('#ic').fill('CCC');
    await page.locator('#collect').click();
    await page.waitForFunction(
      () => document.getElementById('log').textContent !== '-',
    );
    const result = JSON.parse(await page.locator('#log').innerText());
    console.log('result:', JSON.stringify(result));

    // 画面表示（3 項目とも編集値のまま）
    expect(result.dom).toEqual({a: 'AAA', b: 'BBB', c: 'CCC'});
    // 収集値（送信内容）も編集値
    expect(result.collected).toEqual({a: 'AAA', b: 'BBB', c: 'CCC'});
    // 書込先のバインドデータも編集値で揃う
    expect(result.draft).toEqual({a: 'AAA', b: 'BBB', c: 'CCC'});
  });

  test('手編集していない派生欄は選択の変更に追従する', async ({page}) => {
    test.setTimeout(60000);
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.goto('/playwright/commit-bind-user-edit-repro.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');
    await expect(page.locator('#price')).toHaveValue('100');

    await page.locator('#kind').selectOption('B');
    await expect(page.locator('#price')).toHaveValue('200');
  });
});
