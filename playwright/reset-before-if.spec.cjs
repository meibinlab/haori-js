/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, window */
// `data-{event}-reset-before` の対象配下の `data-if` が同じ押下で再評価されることの
// 回帰ガード。期待値は仕様「data-if の動作」の「判定の基準は内部状態であり、
// `style.display` や `data-if-false` は追随結果として扱う」から取っている。
//
// 単体テスト（tests/if-false-attribute-intake.test.ts）は属性マップの取り込みを直接
// 見ている。実ブラウザでは描画キューの巡回が単体テストより粗く、追随結果の書き戻しが
// `show()` の後に着地する時間差が大きいため、利用者に見える表示状態でも確認する。
const {test, expect} = require('@playwright/test');

test.describe('reset-before 配下の data-if', () => {
  test.beforeEach(async ({page}) => {
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.goto('/playwright/reset-before-if-repro.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');
  });

  test('同じ押下で条件どおりに表示が切り替わる', async ({page}) => {
    // 押下前は外側が偽なので分岐ごと非表示。
    await expect(page.locator('#outer')).toBeHidden();

    await page.click('#edit');
    // 追随結果の書き戻しは描画キュー経由で遅れて着地するため、落ち着くまで待つ。
    await page.waitForTimeout(1000);

    await expect(page.locator('#outer')).toBeVisible();
    await expect(page.locator('#has-id')).toBeVisible();
    await expect(page.locator('#no-id')).toBeHidden();
    await expect(page.locator('#id-text')).toHaveText('30001');
  });

  test('二度目の押下でも表示が保たれる', async ({page}) => {
    await page.click('#edit');
    await page.waitForTimeout(600);
    await page.click('#edit');
    await page.waitForTimeout(1000);

    await expect(page.locator('#has-id')).toBeVisible();
    await expect(page.locator('#no-id')).toBeHidden();
  });
});
