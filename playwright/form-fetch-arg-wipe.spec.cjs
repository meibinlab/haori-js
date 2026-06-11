/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 回帰ガード（実ブラウザ）: form[data-fetch][data-fetch-arg] 配下の select を change
// したとき、change のフォーム値同期が fetch-arg（shopList）を脱落させないこと。
// 退行時は data-each が未解決になり option が placeholder 1個に潰れる（opts=1）。
const {test, expect} = require('@playwright/test');

test('form[data-fetch] の change で fetch-arg と選択肢が保持される', async ({page}) => {
  test.setTimeout(60000);
  await page.goto('/playwright/form-fetch-arg-wipe-repro.html'); // 無指定=ローカルビルド
  await page.waitForFunction(() => typeof window.Haori !== 'undefined');
  // fetch 完了で option が 3 個（placeholder + A + B）になるのを待つ
  await page.waitForFunction(
    () => document.getElementById('s1').options.length === 3,
    {timeout: 10000},
  );
  await page.selectOption('#s1', 'a');
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => ({
    runs: window.__runs,
    selectValue: document.getElementById('s1').value,
    optionCount: document.getElementById('s1').options.length,
    hasShopList: !!(
      window.Haori.Core.getBindingData(document.getElementById('f1')) || {}
    ).shopList,
  }));
  expect(r.runs, 'data-change-run が発火する').toBe(1);
  expect(r.optionCount, 'option が潰れていない（fetch-arg 保持）').toBe(3);
  expect(r.selectValue, '選択が保持される').toBe('a');
  expect(r.hasShopList, 'フォームバインドに fetch-arg が残る').toBe(true);
});
