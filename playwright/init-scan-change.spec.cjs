/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, window, document */
// 回帰ガード（実ブラウザ）: 初期スキャン中に発火した change でも手続きが実行される。
//
// EventDispatcher の購読開始が初期スキャン完了後だった 0.25.0 以前は、
// data-each-rendered-run から同期的に dispatch した change が
// リスナー未登録のまま失われ、data-change-fetch が実行されなかった。
// 保留・再生方式の導入と data-each-rendered-change の追加を検証する。
const {test, expect} = require('@playwright/test');

async function load(page, mode) {
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text().split('\n')[0]);
    }
  });
  await page.goto(`/playwright/init-scan-change-repro.html?mode=${mode}`);
  await page.waitForFunction(() => typeof window.Haori !== 'undefined');
  await page.waitForTimeout(1000);
  const state = await page.evaluate(() => ({
    fetched: window.__fetched,
    detail: document.getElementById('detail-result').textContent,
    options: document.getElementById('month').options.length,
  }));
  return {...state, consoleErrors};
}

test('data-each-rendered-run 内の同期 change でも手続きが実行される', async ({
  page,
}) => {
  test.setTimeout(60000);
  const state = await load(page, 'run');
  expect(state.options, '候補が描画される').toBe(3);
  expect(
    state.fetched.some(url => url.includes('init-scan-change-detail.json')),
    'change 手続きの fetch が実行される',
  ).toBe(true);
  expect(state.detail, 'バインド結果が反映される').toContain('12345');
  expect(state.consoleErrors, 'コンソールエラーが出ない').toEqual([]);
});

test('data-each-rendered-change でも手続きが実行される', async ({page}) => {
  test.setTimeout(60000);
  const state = await load(page, 'attr');
  expect(state.options, '候補が描画される').toBe(3);
  expect(
    state.fetched.some(url => url.includes('init-scan-change-detail.json')),
    'change 手続きの fetch が実行される',
  ).toBe(true);
  expect(state.detail, 'バインド結果が反映される').toContain('12345');
  expect(state.consoleErrors, 'コンソールエラーが出ない').toEqual([]);
});
