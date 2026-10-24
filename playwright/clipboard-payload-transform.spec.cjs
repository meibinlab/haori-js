/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, navigator */
// data-{event}-clipboard と data-{event}-payload-transform の実ブラウザ確認。
// 期待値の根拠は仕様「`data-{event}-clipboard`」と仕様
// 「`data-{event}-payload-transform`（非イベント: `data-fetch-payload-transform`）」。
// 従来の方式と CSP モードの両方で確かめる。
const {test, expect} = require('@playwright/test');

for (const [label, url] of [
  ['従来の方式', '/playwright/clipboard-payload-transform-repro.html'],
  ['CSP モード', '/playwright/clipboard-payload-transform-csp-repro.html'],
]) {
  test.describe(`クリップボードと送信データの変換（${label}）`, () => {
    test('押すと値をクリップボードへ書き、トーストを出す', async ({
      page,
      context,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto(url);
      await page.waitForSelector('body[data-haori-ready]');
      await page.locator('#copy').click();
      // 仕様「`data-{event}-clipboard`」の「値をクリップボードへ書きます」「書き込みが
      // 終わってから後続のアクションへ進むため、`data-{event}-toast` で書いたことを
      // 知らせられます」
      await expect(page.getByText('コピーしました')).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        'C-0001',
      );
    });

    test('値が空なら書かず、トーストも出さない', async ({page, context}) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto(url);
      await page.waitForSelector('body[data-haori-ready]');
      await page.evaluate(() => navigator.clipboard.writeText('before'));
      await page.locator('#copy-empty').click();
      await page.waitForTimeout(500);
      // 仕様「`data-{event}-clipboard`」の「評価した値が空文字の場合と、
      // [未解決参照](#未解決参照の診断)を含む場合」「後続のアクション
      // （`data-{event}-confirm` / `data-{event}-fetch` / `data-{event}-toast`
      // など）は実行しません」
      // `toHaveCount(0)` は消えるまで待ち直すため、3 秒で消えるトーストを見逃す。
      // その時点の件数をそのまま確かめる。
      expect(await page.getByText('空をコピーしました').count()).toBe(0);
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        'before',
      );
    });

    test('値が空なら、書けなかったことをトーストで知らせる', async ({
      page,
      context,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto(url);
      await page.waitForSelector('body[data-haori-ready]');
      await page.locator('#copy-empty-error').click();
      // 仕様「`data-{event}-clipboard`」の「`data-{event}-clipboard-error-toast`
      // を宣言すると、上の「止める場合」のどれかで止まったときに、その文言の
      // トーストを表示します」「後続のアクションは実行しません」
      await expect(page.getByText('コピーできませんでした')).toBeVisible();
      expect(await page.getByText('空をコピーしました').count()).toBe(0);
    });

    test('書き込みが拒まれたら、書けなかったことをトーストで知らせる', async ({
      page,
    }) => {
      await page.addInitScript(() => {
        navigator.clipboard.writeText = () =>
          Promise.reject(new Error('denied'));
      });
      await page.goto(url);
      await page.waitForSelector('body[data-haori-ready]');
      await page.locator('#copy-error').click();
      // 仕様「`data-{event}-clipboard`」の「書き込みが拒まれた場合（権限が無い、
      // ページにフォーカスが無いなど）」「その文言のトーストを表示します」
      await expect(page.getByText('書き込みを拒まれました')).toBeVisible();
      expect(await page.getByText('コピーしました').count()).toBe(0);
    });

    test('変換した送信データを送り、画面の行は残す', async ({page}) => {
      const bodies = [];
      await page.route('**/api/demand', route => {
        bodies.push(route.request().postData());
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{}',
        });
      });
      await page.goto(url);
      await page.waitForSelector('body[data-haori-ready]');
      await page.locator('#save').click();
      await expect.poll(() => bodies.length).toBe(1);
      // 仕様「`data-{event}-payload-transform`（非イベント:
      // `data-fetch-payload-transform`）」の「式の中では送信データ全体を `payload`
      // として参照でき、戻り値を送ります」
      expect(JSON.parse(bodies[0])).toEqual({
        items: [{m: '2026-01', kw: 10}],
      });
      // 同「変換で行を除いても、画面の行と入力した値はそのまま残ります」
      await expect(page.locator('#demand input[name="kw"]')).toHaveCount(2);
    });
  });
}
