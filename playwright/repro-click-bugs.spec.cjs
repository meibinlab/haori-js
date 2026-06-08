/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// バグ報告の実ブラウザ再現テスト。
// - バグ1: fetch を伴わない data-click-confirm がスキップされる。
// - バグ2: data-click-click がターゲット再描画前に発火し、古い id でフェッチする。
const {test, expect} = require('@playwright/test');

test.describe('click バグ再現（実ブラウザ）', () => {
  test('バグ1: fetch なしボタンでも confirm キャンセルで状態が変わらない', async ({
    page,
  }) => {
    let dialogShown = false;
    // confirm ダイアログはキャンセル（dismiss=false 相当）する。
    page.on('dialog', dialog => {
      dialogShown = true;
      dialog.dismiss();
    });

    await page.goto('/demo/click/repro-confirm-local-demo.html');
    await expect(page.locator('#rules-count')).toHaveText('3');

    await page.locator('.del').first().click();
    // 少し待ってから状態を確認する。
    await page.waitForTimeout(300);

    // 確認ダイアログが表示され、キャンセルしたので rules は不変であること。
    expect(dialogShown, 'confirm ダイアログが表示されること').toBe(true);
    await expect(page.locator('#rules-count')).toHaveText('3');
    await expect(page.locator('#rules-out')).toHaveText('A,B,C');
  });

  test('バグ2: data-click-click は再描画後の最新URL（id=1）でフェッチする', async ({
    page,
  }) => {
    const requested = [];
    page.on('request', request => {
      const url = request.url();
      if (url.includes('-rules.json')) {
        requested.push(url);
      }
    });

    await page.goto('/demo/click/repro-click-click-order-demo.html');
    await expect(page.locator('.edit')).toBeVisible();

    await page.locator('.edit').click();

    // ルールが反映されるまで待つ（id=1 のフェッチが成功した場合のみ反映される）。
    await expect(page.locator('#rules-out')).toHaveText('r1,r2', {
      timeout: 5000,
    });

    const usedNull = requested.some(u => u.includes('items-null-rules.json'));
    const usedOne = requested.some(u => u.includes('items-1-rules.json'));
    expect(usedNull, `null URL でフェッチされた: ${requested.join(', ')}`).toBe(
      false,
    );
    expect(usedOne, `id=1 URL でフェッチされた: ${requested.join(', ')}`).toBe(
      true,
    );
  });
});
