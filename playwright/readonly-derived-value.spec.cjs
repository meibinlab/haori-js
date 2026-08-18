/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console */
// 他項目から算出した値を入れた欄が、タブ移動の行き先になっても追従することの回帰ガード。
// 期待値は仕様「`data-attr-*`」の「ただし `readonly` の入力欄（`<input>` /
// `<textarea>`）は保護の対象外で、フォーカス中でも `value` を再適用します」から取っている。
//
// 単体テスト（tests/readonly-derived-value.test.ts）は jsdom でフォーカスを直接当てて
// いる。実際のタブ移動が算出欄へ入ること、`readonly` の欄がタブ移動の対象であること自体は
// ブラウザの挙動なので、ここで確認する。
const {test, expect} = require('@playwright/test');

test.describe('算出値を入れた欄の追従', () => {
  test.beforeEach(async ({page}) => {
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.goto('/playwright/readonly-derived-value-repro.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');
  });

  test('タブ移動の行き先が readonly の算出欄でも、同じ再描画で追従する', async ({
    page,
  }) => {
    await page.locator('#src').click();
    await page.keyboard.type('A');
    // Tab の行き先は DOM 順で次の入力欄、つまり算出欄自身になる。
    await page.keyboard.press('Tab');

    await expect(page.locator('#calc')).toHaveValue('A-算出');
    expect(await page.evaluate(() => document.activeElement.id)).toBe('calc');
    // 同じ再描画でテキスト出力も更新されている（評価そのものは遅れていない）。
    await expect(page.locator('#text-out')).toHaveText('[A]');
  });

  test('readonly の算出欄は、そこへフォーカスしたまま入力元を変えても追従する', async ({
    page,
  }) => {
    await page.locator('#src').click();
    await page.keyboard.type('A');
    await page.locator('#calc').click();
    await expect(page.locator('#calc')).toHaveValue('A-算出');

    await page.locator('#src').click();
    await page.keyboard.type('B');
    await page.locator('#calc').click();
    await expect(page.locator('#calc')).toHaveValue('AB-算出');
  });

  test('編集できる算出欄は、フォーカス中は従来どおり守られる', async ({page}) => {
    // 仕様「`data-attr-*`」の「いずれも**操作中（フォーカス中）の要素には再適用
    // しません**」。`readonly` の例外が、編集できる欄まで広がっていないことを固定する。
    await page.locator('#calc-editable').click();
    await expect(page.locator('#calc-editable')).toHaveValue('-編集可');

    await page.evaluate(() => {
      const src = document.getElementById('src');
      src.value = 'A';
      src.dispatchEvent(new Event('input', {bubbles: true}));
      src.dispatchEvent(new Event('change', {bubbles: true}));
    });
    await expect(page.locator('#calc')).toHaveValue('A-算出');
    await expect(page.locator('#calc-editable')).toHaveValue('-編集可');
  });

  test('算出値が送信データに載る', async ({page}) => {
    let body = null;
    await page.route('**/api/save', async route => {
      body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      });
    });
    await page.locator('#src').click();
    await page.keyboard.type('A');
    await page.keyboard.press('Tab');
    await expect(page.locator('#calc')).toHaveValue('A-算出');

    await page.locator('#send').click();
    await expect.poll(() => (body === null ? null : body.calc)).toBe('A-算出');
    expect(body.calcHidden).toBe('A-隠し');
  });
});
