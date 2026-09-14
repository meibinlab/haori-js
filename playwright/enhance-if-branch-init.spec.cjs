/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// <option> を引き取る連携で、data-if の分岐の中の <select> の初期値を init が受け取れる
// ことの実ブラウザ確認（課題 55）。
// 初期表示で閉じている分岐の中の要素へ、描画と初期値の反映の前に init が呼ばれて
// いたため、Choices.js のように init の時点の選択を取り込む連携では、雛形のまま
// 取り込まれ、開いた後も初期値がウィジェットに出なかった。開いている分岐でも、
// 分岐の外のフォームが与える初期値が init に届いていなかった。
//
// 期待値の根拠は仕様「`data-enhance`」の「`data-if` が偽の分岐の中の要素には、
// `init` を呼びません」と、「分岐の外の祖先のフォームが初期値を与える場合も、その
// 反映の後に呼びます」。
const {test, expect} = require('@playwright/test');

test.describe('data-if の分岐の中の連携と初期値（実ブラウザ）', () => {
  test('閉じた分岐の中の select は、開いた後に初期値の入った状態で init が呼ばれる', async ({
    page,
  }) => {
    await page.goto('/playwright/enhance-if-branch-init-repro.html');
    await page.waitForSelector('body[data-haori-ready]');

    expect(await page.evaluate(() => window.__initSeen.closed)).toBeUndefined();

    await page.click('#open');
    await page.waitForFunction(() => window.__initSeen.closed !== undefined);

    expect(await page.evaluate(() => window.__initSeen.closed)).toEqual([
      'X',
      'Y:selected',
      'Z',
    ]);
    await expect(page.locator('#tags-closed .tag')).toHaveText(['Y']);
  });

  test('開いている分岐の中でも、分岐の外のフォームの初期値が入った状態で init が呼ばれる', async ({
    page,
  }) => {
    await page.goto('/playwright/enhance-if-branch-init-repro.html');
    await page.waitForSelector('body[data-haori-ready]');

    expect(await page.evaluate(() => window.__initSeen.opened)).toEqual([
      'X',
      'Y',
      'Z:selected',
    ]);
    await expect(page.locator('#tags-opened .tag')).toHaveText(['Z']);
  });
});
