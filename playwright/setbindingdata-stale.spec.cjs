/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console */
// 報告#1 の回帰ガード（実ブラウザ）。同一 state 参照を mutate＋push する画面で、
// 数量 change（push①）の 5〜10ms 後に検索 input（push②）が来ると、修正前は
// push① の古い値が data-bind 属性に後勝ちしていた（FIFO 直列化の不完全）。
// 本テストはローカルビルド（/dist）を読み込み、後勝ちが発生しないことを検証する。
// 注: 本競合はマシン負荷依存で、低負荷環境では検出力が下がる（N を増やすと安定）。
const {test, expect} = require('@playwright/test');

test.describe('報告#1 setBindingData 古い値の後勝ち（実ブラウザ回帰）', () => {
  test('数量変更直後の検索入力で検索値が消えない', async ({page}) => {
    test.setTimeout(150000);
    await page.goto('/playwright/serialization-stale-repro.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForTimeout(300);
    await page.locator('#run').click();
    await page.waitForFunction(
      () => document.getElementById('result').textContent !== '-',
      {timeout: 120000},
    );
    const result = await page.locator('#result').innerText();
    console.log('result:', result);
    const m = result.match(/^(\d+)\s*\/\s*(\d+)/);
    const fails = m ? Number(m[1]) : -1;
    expect(fails, `古い値の後勝ち ${result}`).toBe(0);
  });
});
