/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, document */
// `data-if` と inline style を同じ要素へ書いた場合の非表示の確認。
// 期待値は仕様「data-if の動作」の「評価値が `false`, `null`, `undefined`, `NaN`
// の場合、要素を非表示化」・「`style.display = 'none'` を設定」と、同節の「判定の
// 基準は内部状態であり、`style.display` や `data-if-false` は追随結果として扱う」
// から取っている。
//
// 属性の再適用は `style` 属性をまるごと宣言の値へ置き換えるため、追随結果を
// 優先しないと `data-if-false` は付いているのに要素が見えたままになる。単体
// テスト（tests/if-hide-with-display-declaration.test.ts）は `style.display` を
// 見ているが、ここでは利用者に見える状態（実際に見えているか）を確認する。
const {test, expect} = require('@playwright/test');

test.describe('style の宣言を持つ要素の data-if', () => {
  test('宣言があっても隠れ、戻すと宣言どおりに表示される', async ({page}) => {
    const errors = [];
    page.on('console', message => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto('/playwright/if-hide-with-style.html');
    await page.waitForFunction(() =>
      document.body.hasAttribute('data-haori-ready'),
    );

    // 条件が偽のあいだは、宣言の有無にかかわらず見えない。
    await expect(page.locator('#flexBox')).toBeHidden();
    await expect(page.locator('#colored')).toBeHidden();
    await expect(page.locator('#plain')).toBeHidden();

    // 表示へ戻すと、利用者の宣言どおりに描かれる。
    await page.locator('#toggle').click();
    await expect(page.locator('#flexBox')).toBeVisible();
    await expect(page.locator('#colored')).toBeVisible();
    await expect(page.locator('#plain')).toBeVisible();
    await expect(page.locator('#flexBox')).toHaveCSS('display', 'flex');
    await expect(page.locator('#colored')).toHaveCSS(
      'color',
      'rgb(180, 83, 9)',
    );

    // もう一度隠す。往復しても追随結果が消えない。
    await page.locator('#toggle').click();
    await expect(page.locator('#flexBox')).toBeHidden();
    await expect(page.locator('#colored')).toBeHidden();

    expect(errors).toEqual([]);
  });

  test('非表示のあいだに宣言を変えても、戻すと最新の宣言になる', async ({
    page,
  }) => {
    // 期待値は仕様「data-if の動作」の「戻す値はその時点の宣言」。表示へ戻した
    // ときに残るのは、控えた値ではなくその時点の宣言である。
    const errors = [];
    page.on('console', message => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto('/playwright/if-hide-with-style.html');
    await page.waitForFunction(() =>
      document.body.hasAttribute('data-haori-ready'),
    );

    await expect(page.locator('#dynamic')).toBeHidden();

    // 非表示のまま宣言を切り替える。
    await page.locator('#change').click();
    await expect(page.locator('#dynamic')).toBeHidden();

    // 表示へ戻すと、変えたあとの宣言が効く。
    await page.locator('#toggle').click();
    await expect(page.locator('#dynamic')).toBeVisible();
    await expect(page.locator('#dynamic')).toHaveCSS('display', 'grid');

    expect(errors).toEqual([]);
  });
});
