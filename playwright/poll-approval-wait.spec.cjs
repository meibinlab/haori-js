/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, window */
// data-poll-* の実ブラウザ動作確認。ローカルビルド（/dist）を読み込み、
// 応答は page.route() で差し替える。jsdom のユニットテストでは検証できない
// 「実タイマー・実 requestAnimationFrame 下での停止・一時停止」を確認する。
const {test, expect} = require('@playwright/test');

test.describe('data-poll-*（実ブラウザ）', () => {
  test('until 成立で停止し、timeout で打ち切り、data-if 非表示で一時停止する', async ({
    page,
  }) => {
    test.setTimeout(60000);

    // A: 3回目の応答で confirmed:true を返す
    let confirmCalls = 0;
    await page.route('**/api/approval-status', async route => {
      confirmCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({confirmed: confirmCalls >= 3}),
      });
    });

    // B: 常に未確認を返す（timeout での打ち切りを見る）
    let neverCalls = 0;
    await page.route('**/api/never-confirm', async route => {
      neverCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({confirmed: false}),
      });
    });

    // C: 呼び出し回数だけを数える
    let tickCalls = 0;
    await page.route('**/api/tick', async route => {
      tickCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await page.goto('/playwright/poll-approval-wait.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');

    // --- A: until 成立で停止する ---
    await expect(page.locator('#doneA')).toBeVisible({timeout: 10000});
    await expect(page.locator('#waitingA')).toBeHidden();
    const stateA = await page.locator('#stateA').innerText();
    expect(stateA).toContain('confirmed=true');
    expect(stateA).toContain('stopped=true');
    expect(stateA).toContain('reason=until');
    // 条件成立後は取得が止まる
    const callsAtStop = confirmCalls;
    await page.waitForTimeout(600);
    expect(confirmCalls).toBe(callsAtStop);

    // --- B: timeout で打ち切る ---
    await expect(page.locator('#expiredB')).toBeVisible({timeout: 10000});
    const stateB = await page.locator('#stateB').innerText();
    expect(stateB).toContain('timedOut=true');
    expect(stateB).toContain('reason=timeout');
    const neverAtStop = neverCalls;
    await page.waitForTimeout(600);
    expect(neverCalls).toBe(neverAtStop);

    // --- C: data-if の非表示で一時停止し、再表示で再開する ---
    await expect
      .poll(() => tickCalls, {timeout: 10000})
      .toBeGreaterThanOrEqual(2);

    await page.locator('#toggleC').click();
    await expect(page.locator('#pausedC')).toBeVisible({timeout: 10000});
    // 一時停止であり恒久停止ではない
    await expect(page.locator('#stoppedC')).toBeHidden();

    const callsWhilePaused = tickCalls;
    await page.waitForTimeout(600);
    expect(tickCalls).toBe(callsWhilePaused);

    // 再表示で再開する
    await page.locator('#showC').click();
    await expect
      .poll(() => tickCalls, {timeout: 10000})
      .toBeGreaterThan(callsWhilePaused);
  });
});
