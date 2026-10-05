/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, URL */
// プレースホルダ式の data-fetch ＋ data-fetch-form が、フォームの初期値の反映を
// 待ってから収集することの実ブラウザ確認（要望 BO）。初期化では <head> と <body> の
// 走査が並行して走り、先に終わった <head> の走査が <body> の待ち合わせを消していた。
// プレースホルダ式の取得は起動が 1 フレーム遅れるため、その間に消されると、
// data-attr-value の初期値が入る前の空の条件で取得していた。
// 期待値の根拠は仕様「`data-{event}-form`」の「初期表示では、フォームの初期値の
// 反映が終わってから取得します」。
const {test, expect} = require('@playwright/test');

test.describe('プレースホルダ式の取得とフォームの初期値（実ブラウザ）', () => {
  test('初回の取得は、画面の欄の値（data-attr-value と URL の値）で送る', async ({
    page,
  }) => {
    const requests = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) {
        requests.push(url.pathname + url.search);
      }
    });
    await page.route('**/api/list.json*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"totalElements": 3}',
      }),
    );

    await page.goto(
      '/playwright/fetch-form-placeholder-initial-values-repro.html?active=true',
    );
    await expect(page.locator('#list')).toHaveText('3');
    // 余分な取得が後から走らないことも見る。
    await page.waitForTimeout(500);

    expect(requests).toEqual([
      '/api/list.json?rewardMonth=2026-10&active=true',
    ]);
  });
});
