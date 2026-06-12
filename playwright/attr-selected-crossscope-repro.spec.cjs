/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 文書化テスト（実ブラウザ）: data-attr-selected の参照スコープが name 双方向束縛の
// 書込スコープと異なると、change 後（フォーカスが外れた再評価）に選択が巻き戻る
// （アンチパターン: CASE A）。書込先と同じキーを読む（CASE D）か、name 束縛のみに
// 任せる（BASE）と保持される。docs/ja/guide.md のレシピの裏付け。
const {test, expect} = require('@playwright/test');

// 実 selectOption（フォーカス＋change）→ フォーカスを外し→ 再評価を促し、
// 選択が保持されるかを返す。
async function probe(page, selId) {
  await page.goto('/playwright/attr-selected-crossscope-repro.html');
  await page.waitForFunction(() => typeof window.Haori !== 'undefined');
  await page.waitForTimeout(300);
  await page.selectOption(`#${selId}`, 'BILLING_OTHER');
  await page.waitForTimeout(300);
  // 保存ボタン押下相当: フォーカスを外す
  await page.evaluate(() => document.getElementById('elsewhere').focus());
  // 別データ変更を模した再評価を促す
  await page.evaluate(() => {
    const root = document.querySelector('[data-bind]');
    window.Haori.Core.setBindingData(
      root,
      window.Haori.Core.getBindingData(root) || {},
    );
  });
  await page.waitForTimeout(400);
  return page.evaluate(id => document.getElementById(id).value, selId);
}

test('推奨レシピ（BASE / 同一キー）は選択が保持され、クロススコープは巻き戻る', async ({
  page,
}) => {
  test.setTimeout(60000);
  const base = await probe(page, 'selBase');
  const d = await probe(page, 'selD');
  const a = await probe(page, 'selA');
  expect(base, 'name 束縛のみ（推奨①）は保持される').toBe('BILLING_OTHER');
  expect(d, '書込先と同じキーを読む（推奨②）は保持される').toBe('BILLING_OTHER');
  // アンチパターンは巻き戻る（このテストが将来 false になったら挙動が変わった合図）
  expect(a, 'クロススコープ参照（アンチパターン）は巻き戻る').toBe('');
});
