/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 交差トリガーが、抑止の間に来た交差を捨てずに拾い直すことの実ブラウザ確認。
// `IntersectionObserver` は交差状態が変化したときにしか通知しないため、捨てると、
// 交差したまま変化しない番兵では次の機会が来ず、一覧が空のまま止まっていた。
//
// 期待値の根拠は仕様「抑止の間に来た交差」の「実行中に起きた交差は、その
// 実行が完了した時点で拾い直します」と、「`data-intersect-disabled` が真の間に
// 起きた交差は、偽へ変わった時点で拾い直します」。
const {test, expect} = require('@playwright/test');

test.describe('交差トリガーの取りこぼしの拾い直し（実ブラウザ）', () => {
  test('実行中に隠して出し直した番兵の交差を、実行の完了時に拾い直す', async ({
    page,
  }) => {
    await page.goto('/playwright/intersect-pending-retry-repro.html');
    await page.waitForSelector('body[data-haori-ready]');

    // 初期表示の番兵が交差し、1 回目の取得が始まる（応答は保留中）。
    await page.waitForFunction(() => window.__calls.posts === 1);

    // 保留中に、番兵を隠して出し直す。交差は起きるが実行中なので開始しない。
    await page.click('#hide');
    await expect(page.locator('#sentinel')).toBeHidden();
    await page.click('#show');
    await expect(page.locator('#sentinel')).toBeVisible();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__calls.posts)).toBe(1);

    // 保留を解放すると、覚えていた交差を拾い直して 2 回目が始まる。
    await page.evaluate(() => window.__release());
    await page.waitForFunction(() => window.__calls.posts === 2);

    // 覚えている交差 1 回につき 1 回だけなので、3 回目は始まらない。
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__calls.posts)).toBe(2);
  });

  test('抑止の間に来た交差を、data-intersect-disabled が偽へ変わった時点で拾い直す', async ({
    page,
  }) => {
    await page.goto('/playwright/intersect-pending-retry-repro.html');
    await page.waitForSelector('body[data-haori-ready]');

    // 抑止している間は開始しない。番兵は交差したまま変化しない。
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__calls.guarded)).toBe(0);

    await page.click('#enable');
    await page.waitForFunction(() => window.__calls.guarded === 1);

    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__calls.guarded)).toBe(1);
  });
});
