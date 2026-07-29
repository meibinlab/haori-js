/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console */
// data-{event}-reset / -reset-before がフォーム配下の data-each の描画結果を
// 消したまま復元しなかった問題の回帰ガード。フォームの外側で取得した選択肢を
// フォーム内の <select> へ描く構成では、リセット後に選択肢が 0 件になり、
// 再取得（refetch）でも戻らなかった。
const {test, expect} = require('@playwright/test');

test.describe('リセットと data-each の選択肢', () => {
  test('reset-before の後も選択肢が残り選択だけ解除される', async ({page}) => {
    test.setTimeout(60000);
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.goto('/playwright/reset-each-options-repro.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');
    // 取得した選択肢が描画されるまで待つ。
    await page.waitForFunction(
      () => document.getElementById('plans').options.length === 3,
    );

    // 利用者が選択してからリセットを伴う操作を行う。
    await page.locator('#plans').selectOption(['p2']);
    await page.locator('#new').click();
    await page.locator('#collect').click();
    await page.waitForFunction(
      () => document.getElementById('log').textContent !== '-',
    );
    const result = JSON.parse(await page.locator('#log').innerText());
    console.log('result:', JSON.stringify(result));

    // 選択肢は残り、表示テキストも評価済み。
    expect(result.options).toEqual([
      {value: 'p1', text: '従量電灯A'},
      {value: 'p2', text: '従量電灯B'},
      {value: 'p3', text: 'スマートプラン'},
    ]);
    // 値の初期化としてのリセットは機能する（選択は解除される）。
    expect(result.selected).toEqual([]);
    expect(result.collected.planIds).toEqual([]);
    expect(result.collected.memo).toBe('新規');
  });
});
