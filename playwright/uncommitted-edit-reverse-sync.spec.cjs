/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console */
// まだバインドデータへ載っていない編集が、古いバインドデータの逆方向同期で消えて
// いた問題の回帰ガード。期待値は仕様「収集は DOM を真とする」の「収集は読み取りに
// 徹し、内部値は書き換えません。… バインドデータには載っていないのに内部値だけが
// 新しい状態が生まれ、続く逆方向同期（フォーム配下の入力欄への書き戻し）が古い
// バインドデータと不一致とみなして入力欄を上書きします」から取っている。
// 単体テスト（tests/uncommitted-edit-reverse-sync.test.ts）は jsdom なので、キー
// イベントを伴わない実際の文字入力（貼り付け・IME 確定と同じ経路）はここで確認する。
const {test, expect} = require('@playwright/test');

test.describe('コミット前の編集と逆方向同期', () => {
  test.beforeEach(async ({page}) => {
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.goto('/playwright/uncommitted-edit-reverse-sync-repro.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');
  });

  test('貼り付け相当の文字入力で入れた値が、行への書き戻しで消えない', async ({
    page,
  }) => {
    // 内側の行のテキストを編集する。収集値が契約行の要素データへ載るため、以降の
    // 更新で契約行へ逆方向同期が走る。
    await page.locator('#staff-11').fill('担当');
    await page.locator('#place').click();

    // キーイベントを伴わない文字入力。貼り付け・IME 確定と同じく 1 回の `input`
    // だけで値が確定し、`change` はまだ発火しない。
    await page.keyboard.insertText('場所A');
    await expect(page.locator('#place')).toHaveValue('場所A');

    await page.locator('#narrow').click();
    await page.waitForFunction(
      () => document.getElementById('log').textContent !== '-',
    );
    const result = JSON.parse(await page.locator('#log').textContent());

    // 画面と収集値の双方に残る（収集値が空のままなら保存・送信で失われる）。
    expect(result.dom).toBe('場所A');
    expect(result.collected.contracts[0].name).toBe('場所A');
  });

  test('打鍵で入れた値も、行への書き戻しで消えない（対照）', async ({page}) => {
    await page.locator('#staff-11').fill('担当');
    await page.locator('#place').click();
    await page.locator('#place').pressSequentially('場所A');

    await page.locator('#narrow').click();
    await page.waitForFunction(
      () => document.getElementById('log').textContent !== '-',
    );
    const result = JSON.parse(await page.locator('#log').textContent());

    expect(result.dom).toBe('場所A');
    expect(result.collected.contracts[0].name).toBe('場所A');
  });
});
