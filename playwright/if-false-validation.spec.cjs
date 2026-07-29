/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console */
// data-if が偽の分岐配下の required が制約検証に残り、表示中の分岐だけを入力しても
// 送信できなかった問題の回帰ガード。値収集では除外されるのに検証では残る非対称が
// 原因だった。ネイティブの検証 UI とフォーカス可否は実ブラウザでしか確認できない。
const {test, expect} = require('@playwright/test');

test.describe('data-if が偽の分岐のバリデーション除外', () => {
  test('非表示分岐の required で検証が止まらない', async ({page}) => {
    test.setTimeout(60000);
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.goto('/playwright/if-false-validation-repro.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');

    await page.locator('#validate').click();
    await page.locator('#collect').click();
    await page.waitForFunction(
      () => document.getElementById('log').textContent !== '-',
    );
    const hidden = JSON.parse(await page.locator('#log').innerText());
    console.log('hidden:', JSON.stringify(hidden));

    expect(hidden.ifFalse).toBe(true);
    expect(hidden.willValidate).toBe(false);
    expect(hidden.formValid).toBe(true);
    expect(hidden.validatePassed).toBe(true);
    // 値収集の挙動は変わらない（非表示分岐は収集されない）。
    expect(hidden.collected).toEqual({kind: 'individual'});
  });

  test('表示中の分岐が未入力なら検証で止まり、入力すると通る', async ({
    page,
  }) => {
    test.setTimeout(60000);
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.goto('/playwright/if-false-validation-repro.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');

    await page.locator('#kind').selectOption('company');
    await expect(page.locator('#branch')).not.toHaveAttribute('data-if-false');
    await page.locator('#validate').click();
    await page.locator('#collect').click();
    await page.waitForFunction(
      () => document.getElementById('log').textContent !== '-',
    );
    const empty = JSON.parse(await page.locator('#log').innerText());
    console.log('empty:', JSON.stringify(empty));
    expect(empty.willValidate).toBe(true);
    expect(empty.formValid).toBe(false);
    expect(empty.validatePassed).toBe(false);

    await page.locator('#req').fill('ACME');
    await page.locator('#validate').click();
    await page.waitForFunction(() => window.__validatePassed === true);
    await page.locator('#collect').click();
    await page.waitForFunction(() => {
      const log = JSON.parse(document.getElementById('log').textContent);
      return log.validatePassed === true;
    });
    const filled = JSON.parse(await page.locator('#log').innerText());
    console.log('filled:', JSON.stringify(filled));
    expect(filled.formValid).toBe(true);
    expect(filled.collected).toEqual({kind: 'company', companyName: 'ACME'});
  });

  test('表示と非表示を往復しても検証対象が追随する', async ({page}) => {
    test.setTimeout(60000);
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.goto('/playwright/if-false-validation-repro.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');

    // 実ブラウザでは MutationObserver が属性変更を拾う。エンジンが付けた
    // disabled を属性処理へ載せると内部の属性マップへ焼き付き、表示へ戻した
    // 後の再評価で付け直されるため、往復で追随することを確認する。
    await page.locator('#kind').selectOption('company');
    await expect(page.locator('#req')).toBeEnabled();
    await page.locator('#kind').selectOption('individual');
    await expect(page.locator('#req')).toBeDisabled();
    await page.locator('#kind').selectOption('company');
    await expect(page.locator('#req')).toBeEnabled();

    await page.locator('#collect').click();
    await page.waitForFunction(
      () => document.getElementById('log').textContent !== '-',
    );
    const result = JSON.parse(await page.locator('#log').innerText());
    console.log('roundtrip:', JSON.stringify(result));
    expect(result.willValidate).toBe(true);
    expect(result.formValid).toBe(false);
  });
});
