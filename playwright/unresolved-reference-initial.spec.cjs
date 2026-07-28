/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 回帰ガード（実ブラウザ）: 初期表示のためにキーを data-bind で宣言しなくても、
// コンソールエラーを出さずに空表示になり、値が届いた時点で描画されること。
// 退行時は初期表示で error ログが出るか、宣言が無いと値が反映されなくなる。
const {test, expect} = require('@playwright/test');

/**
 * ページのコンソールエラーを収集します。
 *
 * @param page 対象ページ
 * @returns 収集したエラーメッセージの配列
 */
function collectErrors(page) {
  const errors = [];
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  return errors;
}

test('宣言なしでも初期表示はエラーを出さず空表示になる', async ({page}) => {
  const errors = collectErrors(page);

  await page.goto('/demo/click/data-click-fetch-demo.html');
  await page.waitForTimeout(500);

  // 取得前は未解決参照として空表示（`undefined` などを描画しない）。
  expect(await page.locator('#result').innerText()).toBe('名前:');
  expect(errors.join('\n'), '初期表示でエラーを出さない').toBe('');

  // 値が届けば宣言なしでも反映される。
  await page.getByRole('button', {name: '取得'}).click();
  await page.waitForTimeout(700);
  expect(await page.locator('#result').innerText()).toContain('クリック太郎');
  expect(errors.join('\n'), '取得後もエラーを出さない').toBe('');
});

test('オプショナルチェーンを書かなくても状態表示が成立する', async ({page}) => {
  const errors = collectErrors(page);

  await page.goto('/demo/fetch/data-fetch-state-demo.html');
  await page.waitForTimeout(500);

  // `_fetch` はフェッチ前には存在しないが、`!_fetch.status` は真として扱われる。
  expect(await page.locator('#result').innerText()).toContain(
    '「成功するフェッチ」または「失敗するフェッチ」を押してください。',
  );
  expect(errors.join('\n'), '初期表示でエラーを出さない').toBe('');

  await page.getByRole('button', {name: '成功するフェッチ'}).click();
  await page.waitForTimeout(900);
  const success = await page.locator('#result').innerText();
  expect(success).toContain('取得に成功しました。');
  expect(success).toContain('りんご');
  expect(errors.join('\n'), '成功時もエラーを出さない').toBe('');

  await page.getByRole('button', {name: '失敗するフェッチ（404）'}).click();
  await page.waitForTimeout(900);
  expect(await page.locator('#result').innerText()).toContain(
    'ステータス: 404',
  );
});
