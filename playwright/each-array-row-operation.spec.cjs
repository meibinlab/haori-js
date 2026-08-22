/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, window */
// `data-each-array` を宣言した派生配列の行操作が、実ブラウザでも元の配列を書き換える
// ことの確認。期待値は仕様「派生配列の書き戻し先（`data-each-array`）」の「対象の行を
// 表示上の前後の行が居る位置へ移します」と「表示に出ていない要素（派生で除かれた要素）
// の順序は変わりません」から取っている。
//
// 単体テスト（tests/row-operation-each-array.test.ts）はバインドデータを直接見ている。
// 実ブラウザでは差分更新の巡回が単体テストより粗いため、利用者に見える表示でも確認する。
const {test, expect} = require('@playwright/test');

test.describe('data-each-array の行操作', () => {
  test.beforeEach(async ({page}) => {
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.goto('/demo/each/data-each-array-demo.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');
  });

  test('グループの中だけが入れ替わり、元データも追従する', async ({page}) => {
    const groups = page.locator('.group');
    await expect(groups.nth(0).locator('.row')).toHaveText([
      /1: 基本料金/,
      /3: 従量料金/,
      /5: 燃料調整/,
    ]);
    await expect(groups.nth(1).locator('.row')).toHaveText([
      /2: 早期割/,
      /4: 継続割/,
    ]);

    // 「料金」の 2 行目（配列では 3 番目）を上へ移す。
    await groups.nth(0).locator('.row').nth(1).getByText('↑').click();
    await page.waitForTimeout(500);

    await expect(groups.nth(0).locator('.row')).toHaveText([
      /3: 従量料金/,
      /1: 基本料金/,
      /5: 燃料調整/,
    ]);
    // 表示に出ていない「割引」の順序は変わらない。
    await expect(groups.nth(1).locator('.row')).toHaveText([
      /2: 早期割/,
      /4: 継続割/,
    ]);
    // 元の配列も入れ替わっている（3 が 1 の位置へ移る）。
    await expect(page.locator('pre')).toHaveText(
      /3:料金:従量料金\s*1:料金:基本料金\s*2:割引:早期割\s*4:割引:継続割\s*5:料金:燃料調整/,
    );
  });
});
