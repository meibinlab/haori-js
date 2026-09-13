/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// マークアップの既定と、供給された値の優先の実ブラウザ確認（課題 50）。
// URL から取り込んだ選択が、マークアップの `<option selected>` に打ち消され、
// 2 回目以降の取得が既定値のクエリで送られていた。
//
// 期待値の根拠は仕様「初期 `data-bind` からの入力欄復元」の「マークアップに書いた
// `selected` / `checked` は既定値であり、供給された値を打ち消しません」。
const {test, expect} = require('@playwright/test');

/**
 * 再現ページを開き、一覧取得のクエリを記録します。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @param {string} search 開くときのクエリ文字列
 * @returns {Promise<string[]>} 送信された順に並ぶクエリ文字列
 */
async function open(page, search) {
  const queries = [];
  await page.route('**/api/dunnings.json*', async route => {
    queries.push(new URL(route.request().url()).search);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({total: queries.length}),
    });
  });
  await page.goto(`/playwright/markup-default-vs-supplied-repro.html${search}`);
  await page.waitForSelector('body[data-haori-ready]');
  return queries;
}

test.describe('マークアップの既定と供給された値（実ブラウザ）', () => {
  test('URL で供給した選択が、どの取得でも送られる', async ({page}) => {
    const queries = await open(page, '?customerId=3&statuses=PAID');

    // 再評価による 2 回目の取得まで待つ。
    await expect(page.locator('#total')).not.toHaveText('');
    await expect.poll(() => queries.length).toBeGreaterThanOrEqual(2);

    // URL の値がフォームへ載った後の取得だけを見る（載る前の初回は対象外）。
    const applied = queries.filter(
      query => new URLSearchParams(query).get('customerId') === '3',
    );
    expect(applied.length).toBeGreaterThan(0);
    for (const query of applied) {
      expect(new URLSearchParams(query).getAll('statuses')).toEqual(['PAID']);
    }
    await expect(page.locator('#statuses')).toHaveValues(['PAID']);
  });

  test('URL で供給しなければ、マークアップの既定が送られる（対照）', async ({
    page,
  }) => {
    const queries = await open(page, '?customerId=3');

    await expect(page.locator('#total')).not.toHaveText('');
    await expect.poll(() => queries.length).toBeGreaterThanOrEqual(2);

    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) {
      const values = new URLSearchParams(query).getAll('statuses');
      expect(values).toEqual(['PENDING', 'ISSUED', 'PAID', 'CANCELLED']);
    }
    await expect(page.locator('#statuses')).toHaveValues([
      'PENDING',
      'ISSUED',
      'PAID',
      'CANCELLED',
    ]);
  });
});
