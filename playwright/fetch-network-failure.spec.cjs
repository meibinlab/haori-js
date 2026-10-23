/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// <body> の data-fetch が通信の例外で終わっても、子孫の構築を続けることの実ブラウザ
// 確認。期待値の根拠は仕様「`data-fetch`」の「通信の例外で終わった場合も、HTTP の
// 失敗と同じく子孫を構築します」。従来の方式と CSP モードの両方で確かめる。
const {test, expect} = require('@playwright/test');

for (const [label, url] of [
  ['従来の方式', '/playwright/fetch-network-failure-repro.html'],
  ['CSP モード', '/playwright/fetch-network-failure-csp-repro.html'],
]) {
  test.describe(`body の data-fetch の通信の失敗（${label}）`, () => {
    test('子孫の式を評価し、失敗を _fetch に入れる', async ({page}) => {
      const errors = [];
      page.on('console', message => {
        if (message.type() === 'error') {
          errors.push(message.text());
        }
      });
      await page.route('**/api/check.json', route => route.abort());
      await page.goto(url);
      await page.waitForSelector('body[data-haori-ready]');
      await expect(page.locator('#v')).toHaveText('2');
      await expect(page.locator('#status')).toHaveText('true');
      expect(
        errors.filter(message =>
          message.includes('Failed to build body fragment'),
        ),
      ).toEqual([]);
    });
  });
}
