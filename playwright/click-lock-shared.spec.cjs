/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, URL */
// data-click-lock で、別々の打刻のボタンが 1 つのロックを共有することの実ブラウザ
// 確認。期待値の根拠は仕様「`data-click-lock`」の「同じ名前のどれかの手続きが実行中
// の間は、同じ名前のほかの要素を押しても手続きを実行しません」「ロックを持つ間、同じ
// 名前のすべての要素に `disabled` を付けます」「エンジンが付けた `disabled` は、
// 起点要素と同じく各要素の宣言の評価結果へ揃えます」。実際のマウス操作で押すため、
// 単体テスト（tests/click-lock-shared.test.ts）とは別にここで確かめる。従来の方式と
// CSP モードの両方で確かめる。
const {test, expect} = require('@playwright/test');

/**
 * 打刻の要求を記録し、休憩開始の応答だけを止めます。
 *
 * @param {import('@playwright/test').Page} page 対象のページ
 * @returns {Promise<{punches: string[], requested: Promise<void>,
 *     release: () => void}>} 要求された打刻、休憩開始の要求を待つ Promise、
 *     応答を返す関数
 */
async function holdBreakStart(page) {
  const punches = [];
  let release = () => {};
  let arrived = () => {};
  const requested = new Promise(resolve => {
    arrived = resolve;
  });
  const stopped = new Promise(resolve => {
    release = resolve;
  });
  await page.route('**/api/punch-*', async route => {
    const name = new URL(route.request().url()).pathname.replace('/api/', '');
    punches.push(name);
    const status = {
      'punch-break-start': '休憩中',
      'punch-break-end': '勤務中',
      'punch-off-work': '退勤済み',
    }[name];
    if (name === 'punch-break-start') {
      arrived();
      await stopped;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({status}),
    });
  });
  return {punches, requested, release: () => release()};
}

for (const [label, url] of [
  ['従来の方式', '/playwright/click-lock-shared-repro.html'],
  ['CSP モード', '/playwright/click-lock-shared-csp-repro.html'],
]) {
  test.describe(`別々のボタンで共有するクリックのロック（${label}）`, () => {
    test('休憩開始の応答を待つあいだに退勤を押しても、退勤を打刻しない', async ({
      page,
    }) => {
      const held = await holdBreakStart(page);
      await page.goto(url);
      await page.waitForSelector('body[data-haori-ready]');

      await page.locator('#break-start').click();
      await held.requested;
      await expect(page.locator('#off-work')).toBeDisabled();
      // 利用者が続けて押した操作を、ボタンの位置へのマウス操作で再現する。
      const box = await page.locator('#off-work').boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      held.release();

      await expect(page.locator('#break-end')).toBeEnabled();
      expect(held.punches).toEqual(['punch-break-start']);
    });

    test('休憩開始が終わると、各ボタンの活性が宣言の評価結果に揃い、休憩終了を打刻できる', async ({
      page,
    }) => {
      const held = await holdBreakStart(page);
      await page.goto(url);
      await page.waitForSelector('body[data-haori-ready]');

      await page.locator('#break-start').click();
      await held.requested;
      await expect(page.locator('#break-end')).toBeDisabled();
      held.release();

      await expect(page.locator('#break-end')).toBeEnabled();
      await expect(page.locator('#break-start')).toBeDisabled();
      await expect(page.locator('#off-work')).toBeDisabled();
      await page.locator('#break-end').click();
      await expect(page.locator('#off-work')).toBeEnabled();
      expect(held.punches).toEqual(['punch-break-start', 'punch-break-end']);
    });
  });
}
