/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 外部ライブラリ連携（data-enhance / data-enhance-new）の実ブラウザ確認。
// 適用・再同期・破棄が宣言だけで行われることを操作で検証する。
const {test, expect} = require('@playwright/test');

test.describe('外部ライブラリ連携（実ブラウザ）', () => {
  test('宣言だけで適用・再同期・破棄される', async ({page}) => {
    test.setTimeout(60000);
    await page.goto('/demo/enhance/data-enhance-demo.html');
    await page.waitForSelector('body[data-haori-ready]');

    // 適用: 生成 DOM が 1 つだけ作られる。
    await expect(page.locator('#plan + .fake-tags')).toHaveCount(1);
    await expect(page.locator('#plan + .fake-tags .fake-tag')).toHaveCount(1);

    // 再同期: 選択肢を増やすと refresh でタグが追随する。
    await page.locator('#add-plan').click();
    await expect(page.locator('#plan + .fake-tags .fake-tag')).toHaveCount(2);

    // 追加した行にだけ適用する（既存行の生成 DOM は重複しない）。
    await page.locator('#rows .row-block').first().getByText('行を追加').click();
    await expect(page.locator('#rows .row-block')).toHaveCount(2);
    await expect(page.locator('#rows .fake-tags')).toHaveCount(2);

    // 破棄: 行を削除すると生成 DOM も片付く。
    await page.locator('#rows .row-block').last().getByText('削除').click();
    await expect(page.locator('#rows .row-block')).toHaveCount(1);
    await expect(page.locator('#rows .fake-tags')).toHaveCount(1);
  });

  test('data-enhance-new がグローバル参照を new する', async ({page}) => {
    test.setTimeout(60000);
    await page.goto('/demo/enhance/data-enhance-demo.html');
    await page.waitForSelector('body[data-haori-ready]');

    await expect(page.locator('.address-status')).toHaveText(
      '住所補完が有効です',
    );
  });

  test('外部ライブラリが代入した値が収集される', async ({page}) => {
    test.setTimeout(60000);
    await page.goto('/demo/enhance/data-enhance-demo.html');
    await page.waitForSelector('body[data-haori-ready]');

    // 代入は keyup で行われ、change / input は発火しない。
    await page.locator('#address-form [name=postalCode]').pressSequentially(
      '1000001',
    );
    await expect(page.locator('#address-form [name=region]')).toHaveValue(
      '東京都',
    );

    // フォーカスを外すと収集が走り、双方向バインディングで表示へ反映される。
    await page.locator('#address-form [name=postalCode]').blur();
    await expect(page.locator('#address-values')).toHaveText(
      '収集値: 郵便番号「1000001」/ 都道府県「東京都」/ 市区町村「千代田区」',
    );
  });
});
