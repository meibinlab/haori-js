/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 回帰ガード（実ブラウザ）: data-click-bind の対象が data-url-param 要素のとき、
// 同一クリック内の後続アクション data-click-open が確実に発火し modal が開くこと。
// 退行（0.17.1〜）時はケースA（url-param 要素）で dialog が開かない。
const {test, expect} = require('@playwright/test');

// クリックは element.click() を evaluate で発火する（page.click は modal の
// top-layer 占有で actionability 待ちハングするため使わない）。
async function openState(page, src, btn, modal) {
  const q = src ? `?src=${src}` : '';
  await page.goto(`/playwright/urlparam-open-repro.html${q}`);
  await page.waitForFunction(() => typeof window.Haori !== 'undefined');
  await page.waitForTimeout(300);
  await page.evaluate(id => document.getElementById(id).click(), btn);
  await page.waitForTimeout(500);
  return page.evaluate(id => document.getElementById(id).open, modal);
}

test('url-param 要素へ bind→open でも modal が開く（ローカルビルド）', async ({
  page,
}) => {
  test.setTimeout(60000);
  const bOpen = await openState(page, '', 'btnB', 'modalB');
  expect(bOpen, '対照（url-param 無し）は開く').toBe(true);
  const aOpen = await openState(page, '', 'btnA', 'modalA');
  expect(aOpen, 'url-param 要素へバインドしても open が発火する').toBe(true);
});
