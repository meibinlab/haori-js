/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 行の中で「候補から選択中の 1 件を引いて hidden へ載せる」構成の実ブラウザ確認。
// 行の値反映は再評価の直後に走るため、宣言バインドの評価結果が収集値で潰されない
// ことを操作で検証する。
const {test, expect} = require('@playwright/test');

test.describe('行の宣言バインドと値反映（実ブラウザ）', () => {
  test('選択したプラン名が hidden に残る', async ({page}) => {
    test.setTimeout(60000);
    await page.goto('/demo/form/row-declarative-value-demo.html');
    await page.waitForSelector('body[data-haori-ready]');

    await page.locator('#area-0').selectOption('north');
    await page.locator('#type-0').selectOption('light');
    await expect(page.locator('#plan-0 option')).toHaveCount(4);

    await page.locator('#plan-0').selectOption('p2');

    await expect(page.locator('#rows .plan-name').first()).toHaveText(
      'おトクプラン',
    );
    await expect(page.locator('#rows .plan-name-field').first()).toHaveValue(
      'おトクプラン',
    );

    // 選択を変えれば hidden も追随する。
    await page.locator('#plan-0').selectOption('p3');
    await expect(page.locator('#rows .plan-name-field').first()).toHaveValue(
      '深夜割プラン',
    );
  });

  test('バインド先の外に置いた宣言は既定値のままになる', async ({page}) => {
    test.setTimeout(60000);
    await page.goto('/demo/form/row-declarative-value-demo.html');
    await page.waitForSelector('body[data-haori-ready]');

    await page.locator('#outside-plan-0').selectOption('p2');

    // 候補は取得できているが、hidden は fetch を書いた要素の外なので空のまま。
    await expect(page.locator('#outside-plan-0 option')).toHaveCount(4);
    await expect(page.locator('.outside-field')).toHaveValue('');
    await expect(page.locator('.outside-probe')).toHaveText('0');
  });
});
