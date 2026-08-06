/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 履歴を置き換える遷移（data-{event}-redirect-replace）を実ブラウザで確認する。
// 確定を終えた確認画面が履歴に残ると、完了画面から「戻る」で到達して同じ申込を
// もう一度確定できてしまう。置き換えて遷移すればその経路そのものが無くなる。
// 期待値の根拠は仕様「`data-{event}-redirect-replace`」。
const {test, expect} = require('@playwright/test');

test.describe('履歴を置き換える遷移（実ブラウザ）', () => {
  /**
   * 申込 API を捕捉し、入力画面から確認画面まで進みます。
   *
   * @param page テスト対象のページ
   * @returns 申込 API の呼び出し回数を保持する配列
   */
  const gotoConfirm = async page => {
    const calls = [];
    await page.route('**/api/apply', async route => {
      calls.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ok: true}),
      });
    });
    await page.goto('/playwright/redirect-replace-start.html');
    await page.waitForSelector('body[data-haori-ready]');
    await page.locator('#to-confirm').click();
    await page.waitForSelector('#confirm');
    await page.waitForSelector('body[data-haori-ready]');
    return calls;
  };

  test('置き換えて遷移すると、完了画面から戻っても確認画面へ戻らない', async ({
    page,
  }) => {
    test.setTimeout(60000);
    const calls = await gotoConfirm(page);

    await page.locator('#apply-replace').click();
    await page.waitForSelector('#complete');
    expect(calls.length).toBe(1);

    await page.goBack();
    // 確認画面は履歴に残っていないため、その 1 つ前の入力画面へ戻る。
    await page.waitForSelector('#start');
    expect(new URL(page.url()).pathname).toBe(
      '/playwright/redirect-replace-start.html',
    );
    // 確定ボタンが無いため、二重に申込を送る操作ができない。
    expect(calls.length).toBe(1);
  });

  test('data-{event}-history と併用すると、遷移前のページが履歴に残る', async ({
    page,
  }) => {
    test.setTimeout(60000);
    const calls = await gotoConfirm(page);

    await page.locator('#apply-replace-with-history').click();
    await page.waitForSelector('#complete');
    expect(calls.length).toBe(1);

    await page.goBack();
    // 置き換えたのは history が追加した項目なので、確認画面が履歴に残っている。
    await page.waitForSelector('#confirm');
    expect(new URL(page.url()).pathname).toBe(
      '/playwright/redirect-replace-confirm.html',
    );
  });

  test('従来の遷移では、完了画面から戻ると確認画面へ戻る', async ({page}) => {
    test.setTimeout(60000);
    const calls = await gotoConfirm(page);

    await page.locator('#apply-push').click();
    await page.waitForSelector('#complete');
    expect(calls.length).toBe(1);

    await page.goBack();
    await page.waitForSelector('#confirm');
    expect(new URL(page.url()).pathname).toBe(
      '/playwright/redirect-replace-confirm.html',
    );
  });
});
