/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console */
// 宣言バインド（data-attr-value）の再適用が、確定済みのユーザー編集を巻き戻して
// いた問題の回帰ガード。参照キー（detail.*）と書込キー（name）が別のフォームで、
// 次の項目を編集すると直前の項目が取得時の値へ戻り、送信値も古くなっていた。
// 実ブラウザは dirty value flag を持つため jsdom と値の権威の伝わり方が異なる。
const {test, expect} = require('@playwright/test');

test.describe('宣言バインドとユーザー編集の優先', () => {
  test('順に編集しても前の項目が巻き戻らない', async ({page}) => {
    test.setTimeout(60000);
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.goto('/playwright/user-edit-priority-repro.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');
    await expect(page.locator('#name')).toHaveValue('原名');

    // 3 項目を順に編集する（各項目でフォーカスを外して change を確定させる）。
    await page.locator('#name').fill('編集A');
    await page.locator('#kana').fill('ヘンシュウビー');
    await page.locator('#tel').fill('03-9999-9999');
    await page.locator('#collect').click();
    await page.waitForFunction(
      () => document.getElementById('log').textContent !== '-',
    );
    const result = JSON.parse(await page.locator('#log').innerText());
    console.log('result:', JSON.stringify(result));

    // 画面表示が編集値のまま
    expect(result.dom).toEqual({
      name: '編集A',
      kana: 'ヘンシュウビー',
      tel: '03-9999-9999',
    });
    // 送信される収集値も編集値（表示だけ正しく送信値が古い状態にならない）
    expect(result.collected).toEqual({
      name: '編集A',
      kana: 'ヘンシュウビー',
      tel: '03-9999-9999',
    });
    // 双方向コミットは祖先の detail をフォームへ焼き付けない
    expect(JSON.parse(result.formBind)).toEqual({
      name: '編集A',
      kana: 'ヘンシュウビー',
      tel: '03-9999-9999',
    });
  });

  test('明示的な値の供給では評価結果が反映される', async ({page}) => {
    test.setTimeout(60000);
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.goto('/playwright/user-edit-priority-repro.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');

    await page.locator('#name').fill('編集A');
    await page.locator('#supply').click();
    await page.waitForFunction(
      () => document.getElementById('log').textContent !== '-',
    );
    const result = JSON.parse(await page.locator('#log').innerText());
    console.log('result:', JSON.stringify(result));

    // 供給された値が権威となり、編集値ではなく評価結果になる。
    expect(result.dom.name).toBe('サーバ名');
    expect(result.collected.name).toBe('サーバ名');
  });
});
