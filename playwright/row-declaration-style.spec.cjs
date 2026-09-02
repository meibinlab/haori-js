/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, document */
// 行テンプレートに利用者が書いた `style="display: none"` の宣言が、行を増やしても
// 残ることの確認。期待値は仕様「data-if の動作」の「内部状態を持たない要素に追随
// 結果（`data-if-false` / `display: none` / `data-haori-if-disabled`）が残っていた
// 場合は、宣言として取り込まずに**落とします**」から取っている。落とす対象は追随
// 結果に限られ、同節が「`data-if-false` は手動で書く属性ではありません」と述べる
// とおり、判定の手がかりは `data-if-false` の有無である。
//
// 観測点は**あとから増えた行**。初期描画の行は宣言が保たれるため、増やす前に判定
// すると差が見えない（単体テスト tests/follow-up-artifact-intake.test.ts と同じ
// 理由）。実ブラウザで確かめるのは、行の複製と属性の再適用の順序が jsdom と変わり
// うるためである。
const {test, expect} = require('@playwright/test');

test.describe('行テンプレートの display の宣言', () => {
  test('行を増やしても隠した要素は隠れたまま', async ({page}) => {
    const errors = [];
    page.on('console', message => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto('/playwright/row-declaration-style.html');
    await page.waitForFunction(() =>
      document.body.hasAttribute('data-haori-ready'),
    );

    await expect(page.locator('#list .line')).toHaveCount(1);
    await expect(page.locator('#list .badge')).toBeHidden();
    await expect(page.locator('#list .always')).toBeVisible();

    // 行を 3 つへ増やす。増えた行でも宣言は残る。
    await page.locator('#grow').click();
    await expect(page.locator('#list .line')).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      await expect(page.locator('#list .badge').nth(index)).toBeHidden();
      await expect(page.locator('#list .always').nth(index)).toBeVisible();
    }

    expect(errors).toEqual([]);
  });
});
