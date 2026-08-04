/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console */
// 画面外の入力欄で検証に失敗したとき、ネイティブの検証 UI（バブル）が出なかった問題の
// 回帰ガード。修正前は reportValidity() を画面外の位置で呼んでいたため、ブラウザが
// バブルの表示を取り消していた（実測: 呼び出し時点の top が -2185）。
//
// 期待値は仕様「`data-{event}-validate`」の「対象の欄が**画面外にある場合は、先に
// 画面内へスクロールし、スクロールが止まってから**検証 UI を表示します」から取る。
// バブル自体は DOM に出ないため、「reportValidity が呼ばれた時点で入力欄が画面内に
// あるか」を観測する。
const {test, expect} = require('@playwright/test');

test.describe('画面外の入力欄の検証 UI', () => {
  test('スクロールが止まってから検証 UI を表示する', async ({page}) => {
    test.setTimeout(60000);
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.setViewportSize({width: 900, height: 700});
    await page.goto('/playwright/validation-bubble-scroll-repro.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');

    // ボタンまでスクロールして、必須欄を画面外へ追い出す
    await page.evaluate(() =>
      document.getElementById('validate').scrollIntoView({block: 'center'}),
    );
    await page.waitForFunction(() => window.scrollY > 1000);
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => {
      window.__scrolls = [];
      return Math.round(
        document.getElementById('x').getBoundingClientRect().top,
      );
    });
    expect(before).toBeLessThan(0);

    await page.locator('#validate').click();
    await page.waitForFunction(() => window.__reports.length > 0, null, {
      timeout: 10000,
    });
    // スムーズスクロールの完了後も追加の呼び出しが無いことを確かめる
    await page.waitForTimeout(1500);

    const reports = await page.evaluate(() => window.__reports);
    console.log('reports:', JSON.stringify(reports));

    // 検証 UI は先頭の不正な欄に 1 回だけ
    expect(reports).toHaveLength(1);
    expect(reports[0].id).toBe('x');
    // 呼ばれた時点で画面内にある（修正前は top が負の大きな値だった）
    expect(reports[0].top).toBeGreaterThanOrEqual(0);
    expect(reports[0].bottom).toBeLessThanOrEqual(reports[0].innerHeight);
    // 検証 UI より前にスクロールが指示されている
    expect(reports[0].scrolls).toBeGreaterThan(0);

    // スクロールの指定はスムーズのまま（即時ジャンプへ変えていない）。
    // Playwright のテストランナーではスムーズスクロールが即時に完了するため、
    // アニメーションの経過そのものは観測できない。指定を観測して代わりとする。
    const scrolls = await page.evaluate(() => window.__scrolls);
    console.log('scrolls:', JSON.stringify(scrolls));
    expect(scrolls[0]).toEqual({
      id: 'x',
      options: JSON.stringify({behavior: 'smooth', block: 'nearest'}),
    });

    // 最終位置でも入力欄は画面内にある
    const after = await page.evaluate(() => {
      const rect = document.getElementById('x').getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        innerHeight: window.innerHeight,
        active: document.activeElement ? document.activeElement.id : null,
      };
    });
    console.log('after:', JSON.stringify(after));
    expect(after.top).toBeGreaterThanOrEqual(0);
    expect(after.bottom).toBeLessThanOrEqual(after.innerHeight);
    expect(after.active).toBe('x');
  });
});
