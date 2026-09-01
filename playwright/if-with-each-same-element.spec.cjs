/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, document */
// `data-if` と `data-each` を同一要素へ宣言したときの、行の中の表示条件の確認。
// 期待値は仕様「`data-if` と `data-each` の同一要素への宣言」の「行の中の `data-if`
// や `data-attr-*` は、同一要素へ `data-if` を宣言してもしなくても**同じ行スコープ
// で評価します**」から取っている。
//
// 単体テスト（tests/if-each-same-element.test.ts）は属性の状態を見ている。ここでは
// 利用者に見える表示（印が実際に見えるか）と、一覧を隠して出し直した後の復帰を確認する。
const {test, expect} = require('@playwright/test');

test.describe('data-if と data-each の同一要素への宣言', () => {
  test('行の印が行のデータで出し分けられ、作り直しても戻らない', async ({page}) => {
    const errors = [];
    page.on('console', message => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto('/demo/each/data-if-with-data-each-demo.html');
    await page.waitForFunction(() =>
      document.body.hasAttribute('data-haori-ready'),
    );

    await expect(page.locator('#ruleList li')).toHaveCount(3);
    // 印が付くのは pinned な 1 件目と 3 件目だけ。
    await expect(page.locator('#ruleList li:nth-child(1) .badge')).toBeVisible();
    await expect(
      page.locator('#ruleList li:nth-child(2) .badge'),
    ).toBeHidden();
    await expect(page.locator('#ruleList li:nth-child(3) .badge')).toBeVisible();

    // 一覧ごと隠して出し直す。行を作り直しても印の出方は変わらない。
    await page.getByRole('button', {name: '隠す'}).click();
    await expect(page.locator('#ruleList')).toBeHidden();
    await page.getByRole('button', {name: '出す'}).click();
    await expect(page.locator('#ruleList')).toBeVisible();

    await expect(page.locator('#ruleList li')).toHaveCount(3);
    await expect(page.locator('#ruleList li:nth-child(1) .badge')).toBeVisible();
    await expect(
      page.locator('#ruleList li:nth-child(2) .badge'),
    ).toBeHidden();
    await expect(page.locator('#ruleList li:nth-child(3) .badge')).toBeVisible();

    expect(errors).toEqual([]);
  });
});
