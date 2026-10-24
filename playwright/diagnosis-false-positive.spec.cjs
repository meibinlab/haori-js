/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 開発モードの未解決参照の診断が、正常な構成に警告を出さないことの実ブラウザ確認。
// 期待値の根拠は仕様「未解決参照の診断」。従来の方式と CSP モードの両方で確かめる。
const {test, expect} = require('@playwright/test');

for (const [label, url] of [
  ['従来の方式', '/playwright/diagnosis-false-positive-repro.html'],
  ['CSP モード', '/playwright/diagnosis-false-positive-csp-repro.html'],
]) {
  test.describe(`未解決参照の診断の誤検知（${label}）`, () => {
    test('描かれていない行テンプレートと、失敗の後に評価する属性を報告しない', async ({
      page,
    }) => {
      const warnings = [];
      page.on('console', message => {
        if (message.type() === 'warning') {
          warnings.push(message.text());
        }
      });
      await page.route('**/api/diagnosis', route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{"ok":true}',
        }),
      );
      await page.goto(url);
      await page.waitForSelector('body[data-haori-ready]');
      await page.locator('#b1').click();
      await expect(page.locator('#b2')).toBeVisible();
      // 集約の報告は描画が落ち着いた後に出るため、少し待ってから確かめる。
      await page.waitForTimeout(500);

      // 仕様「未解決参照の診断」の「**次の評価は、どちらの診断（一度も供給されなかった
      // キーと、別のスコープでは供給されているキー）にも記録しません。**」
      // 「**入力欄の値を決めるための確認の評価**」
      expect(
        warnings.filter(text =>
          /never provided by any binding: .*\bo\b/.test(text),
        ),
      ).toEqual([]);
      // 仕様「未解決参照の診断」の「`data-click-error-toast="{{_fetch.responseMessage ?? '…'}}"`
      // は描画のときには報告せず」
      expect(
        warnings.filter(text => text.includes('provided in another scope')),
      ).toEqual([]);
    });
  });
}
