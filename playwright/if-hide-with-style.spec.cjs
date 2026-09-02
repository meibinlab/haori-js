/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, document */
// `data-if` と inline style を同じ要素へ書いた場合の非表示の確認。
// 期待値は仕様「data-if の動作」の「`data-if` が false の場合、要素を
// `display: none` で非表示にする」と、同節の「判定の基準は内部状態であり、
// `style.display` や `data-if-false` は追随結果として扱う」から取っている。
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
});
