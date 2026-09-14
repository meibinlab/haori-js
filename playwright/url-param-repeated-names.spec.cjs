/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 同じ名前の URL パラメータが複数ある場合の data-url-param の実ブラウザ確認（課題 53）。
// 取り込みが同じ名前を上書きしていたため、複数選択の条件が 1 件に潰れていた。
// 検索（pushState の直後の読み直し）でも、既定の選択のまま 1 件になっていた。
//
// 期待値の根拠は仕様「`data-url-param`」の「同じ名前のパラメータが複数ある場合」と、
// 仕様「`data-{event}-history`」の「URL 組み立て規則」。
const {test, expect} = require('@playwright/test');

/**
 * 再現ページを開きます。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @param {string} query 付けるクエリ（`?` から）
 * @returns {Promise<void>} 読み込みの完了
 */
async function open(page, query) {
  await page.goto(`/playwright/url-param-repeated-names-repro.html${query}`);
  await page.waitForSelector('body[data-haori-ready]');
}

/**
 * 複数選択の `<select>` で選ばれている値を返します。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @returns {Promise<string[]>} 選択中の値
 */
function selectedValues(page) {
  return page
    .locator('#msel')
    .evaluate(select =>
      Array.from(select.selectedOptions).map(option => option.value),
    );
}

/**
 * 要素の `data-bind` を読みます。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @param {string} selector 要素のセレクタ
 * @returns {Promise<Record<string, unknown>>} バインドデータ
 */
async function bindOf(page, selector) {
  return JSON.parse(
    (await page.locator(selector).getAttribute('data-bind')) ?? '{}',
  );
}

/**
 * 収集値を写し、その `msel` を返します。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @returns {Promise<unknown>} 収集値の `msel`
 */
async function collectedMsel(page) {
  await page.locator('#collect').click();
  await expect.poll(async () => (await bindOf(page, '#out')).msel).toBeDefined();
  return (await bindOf(page, '#out')).msel;
}

test.describe('同じ名前の URL パラメータと data-url-param（実ブラウザ）', () => {
  test('同じ名前が複数ある URL で開くと、すべて選択される', async ({page}) => {
    await open(page, '?msel=Q&msel=R');

    await expect.poll(() => selectedValues(page)).toEqual(['Q', 'R']);
    expect(await collectedMsel(page)).toEqual(['Q', 'R']);
    expect((await bindOf(page, '#u')).u.msel).toEqual(['Q', 'R']);
  });

  test('既定の選択のまま検索しても選択が変わらず、リロードしても戻る', async ({page}) => {
    await open(page, '');

    await page.locator('#search').click();

    await expect(page).toHaveURL(/msel=P&msel=Q$/);
    await expect
      .poll(async () => (await bindOf(page, '#u')).u?.msel)
      .toEqual(['P', 'Q']);
    expect(await selectedValues(page)).toEqual(['P', 'Q']);
    expect(await collectedMsel(page)).toEqual(['P', 'Q']);

    // 書いた URL を開き直しても同じ条件になる。
    await page.reload();
    await page.waitForSelector('body[data-haori-ready]');
    await expect.poll(() => selectedValues(page)).toEqual(['P', 'Q']);
    expect(await collectedMsel(page)).toEqual(['P', 'Q']);
  });
});
