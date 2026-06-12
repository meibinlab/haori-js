/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console */
// バグ報告の実ブラウザ再現（haori@0.15.0 + runtime=demo + haori-bootstrap）。
const {test, expect} = require('@playwright/test');

test.describe('click バグ再現（bootstrap + demo runtime）', () => {
  test('バグ1: fetch なし data-click-confirm の挙動を観測', async ({page}) => {
    const consoleErrors = [];
    page.on('console', m => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    let nativeDialog = false;
    page.on('dialog', d => {
      nativeDialog = true;
      d.dismiss();
    });

    await page.goto('/demo/click/repro-confirm-bootstrap-demo.html');
    await expect(page.locator('#rules-count')).toHaveText('3');

    await page.locator('.del').first().click();
    await page.waitForTimeout(1000);

    // クリック直後（confirm 未操作）の状態を観測する。
    const countAfter = await page.locator('#rules-count').innerText();
    const rulesAfter = await page.locator('#rules-out').innerText();
    const modalInfo = await page.evaluate(() => {
      const modals = Array.from(document.querySelectorAll('.modal'));
      return modals.map(m => ({
        cls: m.className,
        visible:
          getComputedStyle(m).display !== 'none' && m.offsetParent !== null,
        text: (m.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      }));
    });
    const bootstrapInstalled = await page.evaluate(
      () =>
        typeof window.HaoriBootstrap !== 'undefined' ||
        (window.Haori && typeof window.Haori.confirm === 'function'),
    );
    console.log('[BUG1] countAfterClick =', countAfter);
    console.log('[BUG1] rulesAfterClick =', rulesAfter);
    console.log('[BUG1] nativeDialogFired =', nativeDialog);
    console.log('[BUG1] bootstrapInstalled =', bootstrapInstalled);
    console.log('[BUG1] modals =', JSON.stringify(modalInfo));
    console.log('[BUG1] consoleErrors =', JSON.stringify(consoleErrors));

    // バグ（confirm スキップ）なら、未操作で即削除され count=2 になる。
    // 正常なら confirm 待ちで count=3 のまま。
    expect(
      countAfter,
      'confirm 未操作なら削除されず 3 のまま（2 ならバグ再現）',
    ).toBe('3');
  });

  test('バグ2: data-click-click は id=1 でフェッチする（bootstrap+demo）', async ({
    page,
  }) => {
    const requested = [];
    page.on('request', r => {
      const u = r.url();
      if (u.includes('-rules.json')) requested.push(u);
    });
    const consoleErrors = [];
    page.on('console', m => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });

    await page.goto('/demo/click/repro-click-click-bootstrap-demo.html');
    await expect(page.locator('.edit')).toBeVisible();
    await page.locator('.edit').click();
    await page.waitForTimeout(1500);

    const rulesOut = await page.locator('#rules-out').innerText();
    console.log('[BUG2] rulesOut =', rulesOut);
    console.log('[BUG2] requested =', JSON.stringify(requested));
    console.log('[BUG2] consoleErrors =', JSON.stringify(consoleErrors));

    const usedNull = requested.some(u => u.includes('items-null-rules.json'));
    expect(usedNull, `null URL でフェッチ: ${requested.join(', ')}`).toBe(false);
  });
});
