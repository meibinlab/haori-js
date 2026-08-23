/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, window */
// 式の中の正規表現リテラルが、実ブラウザでもリテラルとして評価されることの確認。
// 期待値は仕様「正規表現リテラル」の「文字列リテラルや数値リテラルと同じく 1 個の
// リテラルとして扱い、中身は解釈しません」と「直前のトークンが識別子・数値・文字列・
// 正規表現リテラル・`)`・`]`・`}` のいずれかであれば除算演算子です」から取っている。
//
// 単体テスト（tests/expression-regexp-literal.test.ts）は評価器を直接呼んでいる。
// 実ブラウザでは属性値を HTML パーサが読んだ後の文字列が式になるため、`\` の扱いを
// 含めて利用者に見える表示でも確認する。
const {test, expect} = require('@playwright/test');

test.describe('式の正規表現リテラル', () => {
  test.beforeEach(async ({page}) => {
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.goto('/demo/bind/expression-regexp-demo.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');
  });

  test('全置換・判定・分割が宣言だけで動く', async ({page}) => {
    // 装飾記法の開始・終了タグ（10 種）が 1 個の宣言で取り除かれる。
    await expect(page.locator('#plain')).toHaveText('重要なお知らせ（至急）');
    await expect(page.locator('#valid')).toHaveText('妥当');
    await expect(page.locator('#tag-list')).toHaveText('電気 / ガス / セット');
    await expect(page.locator('#derived-tags li')).toHaveText([
      '電気',
      'ガス',
      'セット',
    ]);
    // 値が来る位置ではない `/` は除算のまま。
    await expect(page.locator('#division')).toHaveText('54');
  });

  test('入力を変えると判定と分割が追従する', async ({page}) => {
    const code = page.locator('input[name="code"]');
    await code.fill('12a45');
    await code.blur();
    await expect(page.locator('#valid')).toHaveText('数字以外を含みます');

    const tags = page.locator('input[name="tags"]');
    await tags.fill('水道,  電気');
    await tags.blur();
    await expect(page.locator('#tag-list')).toHaveText('水道 / 電気');
    await expect(page.locator('#derived-tags li')).toHaveText([
      '水道',
      '電気',
    ]);
  });
});
