/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console */
// ドットを含む name が評価器の引数リストを壊し、同一スコープの全式を
// コンパイル不能にしていた問題の回帰ガード。無関係な式まで巻き添えで
// 評価できなくなり、data-if が非表示のまま残っていた。
const {test, expect} = require('@playwright/test');

test.describe('識別子として使えないバインドキー', () => {
  test('ドットを含む name があっても同スコープの式が評価される', async ({
    page,
  }) => {
    test.setTimeout(60000);
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.goto('/playwright/binding-key-identifier-repro.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');

    await page.locator('#sel').selectOption('法人');
    await page.locator('#flat').fill('abc');
    await page.locator('#collect').click();
    await page.waitForFunction(
      () => document.getElementById('log').textContent !== '-',
    );
    const result = JSON.parse(await page.locator('#log').innerText());
    console.log('result:', JSON.stringify(result));

    // 無関係な式が巻き添えで壊れない。
    expect(result.plainVisible).toBe(true);
    // 引数にできないキーは haori.data から読める。
    expect(result.corpVisible).toBe(true);
    expect(result.mirror).toBe('法人');
    // 収集値（送信形式）はフラットなキー名のまま変わらない。
    expect(result.collected).toEqual({
      'customer.contractorType': '法人',
      plainKey: 'abc',
    });
  });
});
