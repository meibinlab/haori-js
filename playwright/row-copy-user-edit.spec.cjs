/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console */
// 行への明示的な書き戻し（data-{event}-copy で行を指す）が、同じ手続きの起点に
// なった入力の編集値を巻き戻さないこと、利用者が操作した入力へも届くことの確認。
const {test, expect} = require('@playwright/test');

/**
 * 行データ（contracts の 0 番目）を返します。
 *
 * @param page 対象ページ
 * @returns 行の要素データ
 */
async function rowData(page) {
  return page.evaluate(() => {
    const owner = document.getElementById('owner');
    const data = window.Haori.Core.getBindingData(owner, {resolved: true});
    return data.contracts[0];
  });
}

test.describe('行への書き戻しとユーザー編集', () => {
  test('住所欄の編集でチェックだけが外れ、編集値は巻き戻らない', async ({
    page,
  }) => {
    const errors = [];
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', error => errors.push(String(error)));

    await page.goto('/playwright/row-copy-user-edit-repro.html');
    await page.waitForFunction(() =>
      document.body.hasAttribute('data-haori-ready'),
    );
    await page.evaluate(() => window.Haori.waitForRenders());

    // 「契約者住所と同じ」をチェックする → 契約者住所が行へ複写される。
    await page.locator('.same-as').check();
    await expect(page.locator('.municipality')).toHaveValue('千代田区');
    await expect(page.locator('.postal')).toHaveValue('1000001');
    console.log('[after check]', JSON.stringify(await rowData(page)));

    // 住所欄を編集する（change で sameAsCustomerAddress: false を書き戻す）。
    await page.locator('.municipality').fill('港区');
    await page.locator('.street').focus();
    await page.waitForTimeout(600);

    const after = await rowData(page);
    console.log('[after edit]', JSON.stringify(after));
    console.log('[errors]', JSON.stringify(errors));

    // 期待: 編集値は残り、チェックだけが外れる。
    await expect(
      page.locator('.municipality'),
      '編集した住所が巻き戻っている',
    ).toHaveValue('港区');
    expect(after.municipality, '行データの住所が旧値へ戻っている').toBe('港区');
    expect(after.sameAsCustomerAddress, '行データのチェックが外れていない').toBe(
      false,
    );
    await expect(
      page.locator('.same-as'),
      '画面のチェックが外れていない',
    ).not.toBeChecked();
  });
});

test.describe('行への書き戻しとユーザー編集（収集の宣言が無い所有者）', () => {
  test('data-form が無い構成でも編集値は巻き戻らない', async ({page}) => {
    const errors = [];
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', error => errors.push(String(error)));

    await page.goto('/playwright/row-copy-user-edit-repro.html');
    await page.waitForFunction(() =>
      document.body.hasAttribute('data-haori-ready'),
    );
    await page.evaluate(() => window.Haori.waitForRenders());

    const read = () =>
      page.evaluate(() => {
        const owner = document.getElementById('ownerB');
        const data = window.Haori.Core.getBindingData(owner, {resolved: true});
        return data.contracts[0];
      });

    await page.locator('.same-as-b').check();
    await expect(page.locator('.municipality-b')).toHaveValue('千代田区');
    console.log('[B after check]', JSON.stringify(await read()));

    await page.locator('.municipality-b').fill('港区');
    await page.locator('.street-b').focus();
    await page.waitForTimeout(600);

    const after = await read();
    console.log('[B after edit]', JSON.stringify(after));
    console.log('[B checked]', await page.locator('.same-as-b').isChecked());
    console.log('[B errors]', JSON.stringify(errors));

    await expect(
      page.locator('.municipality-b'),
      '編集した住所が巻き戻っている',
    ).toHaveValue('港区');
    expect(after.municipality, '行データの住所が旧値へ戻っている').toBe('港区');
    expect(after.sameAsCustomerAddress, 'チェックが外れていない').toBe(false);
    await expect(
      page.locator('.same-as-b'),
      '画面のチェックが外れていない',
    ).not.toBeChecked();
  });
});
