/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, document */
// 初期化中（初回の取得が終わるまで）に入力した値が、応答の反映で既定値へ戻らない
// ことの実ブラウザ確認。期待値の根拠は仕様「ユーザー編集と宣言バインドの権威」の
// 「印は打鍵ごと（`input`）に付きます」と、仕様「初期スキャン中に発火したイベントの
// 扱い」（`data-haori-ready` の付与後まで保留するのは手続きの実行だけ）。
// 単体テスト（tests/init-input-protection.test.ts）は jsdom なので、実際の入力と
// requestAnimationFrame で流れる描画キューはここで確かめる。従来の方式と CSP モードの
// 両方で確かめる。
const {test, expect} = require('@playwright/test');

/**
 * 指定した取得の応答を止め、返す関数を返します。もう一方の取得は止めずに返します。
 *
 * @param {import('@playwright/test').Page} page 対象のページ
 * @param {'init-a' | 'init-b'} held 応答を止める取得（外側は init-a、内側は init-b）
 * @returns {{requested: Promise<void>, release: () => void}} 要求を待つ Promise と
 *     応答を返す関数
 */
async function holdFetch(page, held) {
  let release = () => {};
  let arrived = () => {};
  const requested = new Promise(resolve => {
    arrived = resolve;
  });
  const stopped = new Promise(resolve => {
    release = resolve;
  });
  for (const name of ['init-a', 'init-b']) {
    await page.route(`**/api/${name}`, async route => {
      if (name === held) {
        arrived();
        await stopped;
      }
      await route.fulfill({
        contentType: 'application/json',
        body: '{"loaded":true}',
      });
    });
  }
  return {requested, release: () => release()};
}

for (const [label, url] of [
  ['従来の方式', '/playwright/init-input-protection-repro.html'],
  ['CSP モード', '/playwright/init-input-protection-csp-repro.html'],
]) {
  test.describe(`初期化中に入力した値の保護（${label}）`, () => {
    test('取得の応答を待つあいだに入力した日付が、既定値へ戻らない', async ({
      page,
    }) => {
      const inner = await holdFetch(page, 'init-b');
      await page.goto(url);
      await inner.requested;
      expect(
        await page.evaluate(() =>
          document.body.hasAttribute('data-haori-ready'),
        ),
      ).toBe(false);

      await page.locator('#i').fill('2025-01-01');
      await page.locator('#j').click();
      inner.release();

      await page.waitForSelector('body[data-haori-ready]');
      // 編集していない欄は既定値を受ける（= 評価し直した合図）。
      await expect(page.locator('#k')).toHaveValue('既定');
      await expect(page.locator('#i')).toHaveValue('2025-01-01');
    });

    test('取得の応答を待つあいだに実キーで打った文字が、既定値へ戻らない', async ({
      page,
    }) => {
      const inner = await holdFetch(page, 'init-b');
      await page.goto(url);
      await inner.requested;

      // 打ち終えて別の欄へ移ってから応答を返す。フォーカス中の欄は編集の印が
      // 無くても再適用しないため、移らないと印の有無を確かめられない。
      await page.locator('#k').click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type('手入力');
      await page.locator('#j').focus();
      inner.release();

      await page.waitForSelector('body[data-haori-ready]');
      await expect(page.locator('#i')).toHaveValue('2026-10-06');
      await expect(page.locator('#k')).toHaveValue('手入力');
    });

    test('外側の応答を待つあいだに入力した日付が、内側の応答の後も既定値へ戻らない', async ({
      page,
    }) => {
      // 内側の取得は入力より後に要求される。仕様「ユーザー編集と宣言バインドの
      // 権威」の「応答の反映が印を解除するのは、その応答で値が決まる欄だけです」に
      // より、応答と関係のない既定値の欄の入力は残る。
      const outer = await holdFetch(page, 'init-a');
      await page.goto(url);
      await outer.requested;

      await page.locator('#i').fill('2025-01-01');
      await page.locator('#j').click();
      outer.release();

      await page.waitForSelector('body[data-haori-ready]');
      await expect(page.locator('#k')).toHaveValue('既定');
      await expect(page.locator('#i')).toHaveValue('2025-01-01');
    });
  });
}
