/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console */
// 行内 FK セレクトで確定した選択が、そのコミット自身の再描画で解除されないことの
// 回帰ガード。期待値は仕様「ユーザー編集と宣言バインドの権威」の「`data-each` の
// 差分更新そのものは印を解除しません」から取っている。
//
// 単体テスト（tests/row-reuse-user-edit.test.ts）は jsdom で change を直接送っている。
// 実ブラウザでは選択操作の後にフォーカスがセレクトへ残るかどうかで症状の出方が変わり、
// フォーカス保護が症状を覆い隠すことがあるため、ここでは選択肢リストからの選択
// （`selectOption`）と、行の削除で繰り上がった行の表示を確認する。
const {test, expect} = require('@playwright/test');

test.describe('行内 FK セレクトの選択保持', () => {
  test.beforeEach(async ({page}) => {
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.goto('/playwright/row-fk-select-repro.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');
  });

  /**
   * フォームの収集値を返します。
   *
   * @param page ページ
   * @returns 収集値
   */
  const collect = page =>
    page.evaluate(() => {
      const form = document.getElementById('detail-form');
      return window.Haori.Form.getValues(window.Haori.Fragment.get(form));
    });

  test('選択が空へ戻らず、画面・収集値・バインドデータが一致する', async ({
    page,
  }) => {
    const first = page.locator('.row').first().locator('.fk');
    await first.selectOption('1');
    // 再描画が落ち着いても選択は残る（旧版はここで空へ戻っていた）。
    await page.waitForTimeout(800);

    await expect(first).toHaveValue('1');
    expect((await collect(page)).materials[0].material.id).toBe('1');
    expect(
      await page.evaluate(
        () =>
          window.Haori.Core.getBindingData(
            document.getElementById('detail-form'),
          ).materials[0].material.id,
      ),
    ).toBe('1');
  });

  test('確定した FK が送信データに載る', async ({page}) => {
    await page.route('**/api/save', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ok: true}),
      });
    });
    const first = page.locator('.row').first().locator('.fk');
    await first.selectOption('2');
    await page.waitForTimeout(400);

    const [request] = await Promise.all([
      page.waitForRequest(
        request =>
          request.url().includes('/api/save') && request.method() === 'POST',
      ),
      page.locator('#send').click(),
    ]);

    const body = JSON.parse(request.postData());
    expect(body.materials[0].material.id).toBe('2');
  });

  test('行を削除すると、繰り上がった行が新しいレコードを表示する', async ({
    page,
  }) => {
    // 2 行目の数量を編集して印を付けたうえで、1 行目を削除する。キー指定が無い
    // ため要素データはインデックスで対応し、残った行は 2 行目のレコードを受け取る。
    const secondAmount = page.locator('.row').nth(1).locator('.amount');
    await secondAmount.fill('9');
    await secondAmount.blur();
    await page.waitForTimeout(200);

    await page.locator('.row').first().locator('.del').click();
    await page.waitForTimeout(600);

    await expect(page.locator('.row')).toHaveCount(1);
    await expect(page.locator('.row').first().locator('.amount')).toHaveValue(
      '9',
    );
  });
});
