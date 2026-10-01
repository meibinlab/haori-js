/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// data-if と data-each を同じ要素へ宣言し、外部のスクリプトが data-if 属性を書き換えて
// 表示へ戻したときに、行が描き直されることの実ブラウザ確認（DOM の監視を経る経路）。
// 期待値の根拠は仕様「`data-if` と `data-each` の同一要素への宣言」の「続けて走る
// `data-each` の描画に任せます」と、仕様「`data-each`」の「表示へ戻って描き終えた時点で
// 再付与します」。
const {test, expect} = require('@playwright/test');

test.describe('data-if の書き換えで表示へ戻した一覧（実ブラウザ）', () => {
  test('非表示のあいだに変わった配列と値で、行を描き直す', async ({page}) => {
    await page.goto('/playwright/if-each-attribute-show-repro.html');
    await page.waitForSelector('body[data-haori-ready]');
    await expect(page.locator('.t')).toHaveText(['1-1']);

    await page.locator('#hide').click();
    await expect(page.locator('#list')).toHaveAttribute('data-if-false', '');
    // 非表示のあいだに配列と値を変える（data-bind の書き換えも DOM の監視を経る）。
    await page.evaluate(() =>
      document
        .getElementById('root')
        .setAttribute('data-bind', '{"rows":[{"id":1},{"id":2}],"q":"2"}'),
    );
    await expect(page.locator('#list')).not.toHaveAttribute('data-each-done', '');

    await page.locator('#show').click();

    await expect(page.locator('.t')).toHaveText(['1-2', '2-2']);
    await expect(page.locator('#list')).toHaveAttribute('data-each-done', '');
  });
});
