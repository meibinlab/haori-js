/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// フィールド間検証（data-validity / data-{event}-if）の実ブラウザ確認。
// 属性値の再描画はキュー（requestAnimationFrame）経由なので、実ブラウザで
// 「最後の欄を直してそのまま押す」「条件を壊してそのまま押す」の両方向を操作し、
// 条件が実行時に同期評価されることを検証する。
const {test, expect} = require('@playwright/test');

test.describe('フィールド間検証（実ブラウザ）', () => {
  test('data-validity がネイティブ検証としてブロックする', async ({page}) => {
    test.setTimeout(60000);
    await page.goto('/demo/form/field-condition-demo.html');
    await page.waitForSelector('body[data-haori-ready]');

    const tel = page.locator('input[name="tel"]');
    const mail = page.locator('input[name="mail"]');
    const mail2 = page.locator('input[name="mail2"]');
    const next = page.locator('#next');
    const result = page.locator('#result');

    // 何も入力せずに押すと、いずれか必須の条件で止まる。
    await next.click();
    await expect(result).not.toContainText('送信しました');
    await expect(tel).toHaveJSProperty(
      'validationMessage',
      '電話番号かメールアドレスを入力してください',
    );

    // メールを入れると、いずれか必須は満たすが確認欄が一致しない。
    await mail.fill('user@example.com');
    await next.click();
    await expect(result).not.toContainText('送信しました');
    await expect(mail2).toHaveJSProperty(
      'validationMessage',
      'メールアドレスが一致しません',
    );

    // 最後の欄を直して、フォーカスを外さずそのまま押しても通る。
    await mail2.fill('user@example.com');
    await next.click();
    await expect(result).toContainText('送信しました');
    await expect(mail2).toHaveJSProperty('validationMessage', '');
  });

  test('data-{event}-if が条件を満たすまで手続きを止める', async ({page}) => {
    test.setTimeout(60000);
    await page.goto('/demo/form/field-condition-demo.html');
    await page.waitForSelector('body[data-haori-ready]');

    const agreed = page.locator('input[name="agreed"]');
    const submit = page.locator('#submit');
    const result = page.locator('#result');

    // 未同意のまま押しても実行されない。
    await submit.click();
    await expect(result).not.toContainText('送信しました');

    // 同意した直後にそのまま押すと実行される（属性の再描画を待たない）。
    await agreed.check();
    await submit.click();
    await expect(result).toContainText('送信しました');
  });

  test('条件を壊した直後に押しても実行されない', async ({page}) => {
    test.setTimeout(60000);
    await page.goto('/demo/form/field-condition-demo.html');
    await page.waitForSelector('body[data-haori-ready]');

    const agreed = page.locator('input[name="agreed"]');
    const submit = page.locator('#submit');
    const result = page.locator('#result');

    // 送信回数を数えるため、操作の前から監視する。
    const requests = [];
    page.on('request', request => {
      if (request.url().includes('field-condition-response.json')) {
        requests.push(request.url());
      }
    });

    await agreed.check();
    await submit.click();
    await expect(result).toContainText('送信しました');
    expect(requests).toHaveLength(1);

    // 同意を外した直後（属性の再描画より前）に押しても実行されない。
    await agreed.uncheck();
    await submit.click();
    await page.waitForTimeout(300);
    expect(requests).toHaveLength(1);
  });
});
