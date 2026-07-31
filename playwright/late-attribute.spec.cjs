/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// bind より後のアクション属性の遅延評価（応答の値で遷移先を切り替える）の
// 実ブラウザ確認。属性値の再描画はキュー経由なので、実際の遷移とメッセージが
// 応答の値で決まることを操作で検証する。
const {test, expect} = require('@playwright/test');

test.describe('後段アクションの遅延評価（実ブラウザ）', () => {
  test('応答の nextAction で遷移先が切り替わる', async ({page}) => {
    test.setTimeout(60000);
    await page.goto('/demo/form/late-attribute-demo.html');
    await page.waitForSelector('body[data-haori-ready]');

    // 応答の redirectUrl へ遷移する。
    await page.locator('#pay').click();
    await page.waitForURL(/late-attribute-pay\.html$/);
    await expect(page.locator('#heading')).toHaveText('決済ページ');

    // 同じ式でも、応答が異なれば既定の遷移先へ進む。
    await page.goto('/demo/form/late-attribute-demo.html');
    await page.waitForSelector('body[data-haori-ready]');
    await page.locator('#free').click();
    await page.waitForURL(/late-attribute-complete\.html$/);
    await expect(page.locator('#heading')).toHaveText('完了ページ');
  });

  test('toast と history にも応答の値が入る', async ({page}) => {
    test.setTimeout(60000);
    await page.goto('/demo/form/late-attribute-demo.html');
    await page.waitForSelector('body[data-haori-ready]');

    await page.locator('#receipt').click();

    await expect(page.locator('.haori-toast')).toHaveText(
      '受付番号 A-1002 で受け付けました',
    );
    await expect(page).toHaveURL(/late-attribute-demo\.html\?no=A-1002$/);
  });
});
