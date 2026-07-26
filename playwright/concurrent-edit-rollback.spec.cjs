/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console */
// 連続編集の競合（後から操作した入力が古い収集値で巻き戻る）の回帰ガード。
// 修正前は Core.setBindingData のワークが「ワーク開始時点の収集値」をフレーム跨ぎ後に
// 入力欄へ書き戻すため、その間のユーザー操作を巻き戻し、さらに後続の入力操作が
// 巻き戻された内部値を再収集して確定させていた。
// 注: 本競合はマシン負荷依存で、低負荷環境では検出力が下がる（試行数を増やすと安定）。
// 検出力の実測（開発機・300 行の再評価・48 試行）: 修正前 27 失敗 / 修正後 0 失敗。
const {test, expect} = require('@playwright/test');

test.describe('連続編集の競合（実ブラウザ回帰）', () => {
  test('select 変更直後の checkbox 操作が巻き戻らない', async ({page}) => {
    test.setTimeout(180000);
    await page.goto('/playwright/concurrent-edit-rollback-repro.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');
    await page.locator('#run').click();
    await page.waitForFunction(
      () => document.getElementById('result').textContent !== '-',
      {timeout: 170000},
    );
    const result = await page.locator('#result').innerText();
    const log = await page.locator('#log').innerText();
    console.log('result:', result);
    const fails = Number((result.match(/^(\d+)/) || [])[1] ?? -1);
    expect(fails, `巻き戻り ${result}\n${log}`).toBe(0);
  });
});
