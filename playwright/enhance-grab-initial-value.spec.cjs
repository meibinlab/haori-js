/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// <option> を引き取る連携で、data-each で選択肢を描く <select> の初期値を init が
// 受け取れることの実ブラウザ確認（課題 54）。
// init が描画の確定（フォームの初期値が載る前）に呼ばれていたため、Choices.js の
// ように init の時点の選択を取り込む連携では、URL の値がウィジェットに出なかった。
//
// 期待値の根拠は仕様「`data-enhance`」の「`data-each` で選択肢を描画する `<select>`
// も同じです」。
const {test, expect} = require('@playwright/test');

test.describe('<option> を引き取る連携と data-each の初期値（実ブラウザ）', () => {
  test('URL の値が入った状態で init が呼ばれ、ウィジェットに出る', async ({page}) => {
    await page.goto('/playwright/enhance-grab-initial-value-repro.html?sel=Y&sel=Z');
    await page.waitForSelector('body[data-haori-ready]');

    expect(await page.evaluate(() => window.__initSeen)).toEqual([
      'X',
      'Y:selected',
      'Z:selected',
    ]);
    await expect(page.locator('#tags .tag')).toHaveText(['Y', 'Z']);
  });

  test('URL に値が無ければ、選択の無い状態で init が呼ばれる（対照）', async ({page}) => {
    await page.goto('/playwright/enhance-grab-initial-value-repro.html');
    await page.waitForSelector('body[data-haori-ready]');

    expect(await page.evaluate(() => window.__initSeen)).toEqual(['X', 'Y', 'Z']);
    await expect(page.locator('#tags .tag')).toHaveCount(0);
  });
});
