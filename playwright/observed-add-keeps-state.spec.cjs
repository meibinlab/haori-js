/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, window, document, setTimeout */
// 外部のスクリプトが DOM に追加した要素の状態を、監視の取り込みが壊さないことの
// 実ブラウザ確認。popover・モーダル・フォーカスは jsdom では確かめられない。
//
// 期待値は仕様「監視対象」の「**外部のスクリプトが DOM に追加したノードは、追加
// された位置のまま取り込み、DOM から外して付け直すことはしません。** 開いた
// popover・`showModal()` で開いた `<dialog>` のモーダル状態・フォーカスは、要素を
// DOM から外すと失われるためです」と、仕様「`data-{event}-toast`」の「トースト
// メッセージを表示します (3秒表示)」から取っている。
//
// 修正前は、取り込みのたびに要素を DOM から外して同じ位置へ付け直していたため、
// 追加の直後に開いた popover は閉じ、モーダルはモーダルでなくなり、フォーカスは
// 外れていた。
const {test, expect} = require('@playwright/test');

/**
 * ページを開き、読み込みの完了を待ちます。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 */
async function open(page) {
  await page.goto('/playwright/observed-add-keeps-state-repro.html');
  await page.waitForSelector('body[data-haori-ready]');
}

/**
 * 監視の取り込みが終わるまで待ちます。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 */
async function settle(page) {
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));
}

test.describe('外部から追加した要素の状態（実ブラウザ）', () => {
  test('追加の直後に開いた popover は開いたまま（回帰）', async ({page}) => {
    await open(page);
    await page.evaluate(() => {
      const pop = document.createElement('div');
      pop.id = 'pop';
      pop.setAttribute('popover', 'manual');
      pop.textContent = 'x';
      document.body.appendChild(pop);
      pop.showPopover();
    });
    await settle(page);

    expect(
      await page.locator('#pop').evaluate(e => e.matches(':popover-open')),
    ).toBe(true);
  });

  test('Haori.toast() のトーストが表示される（回帰）', async ({page}) => {
    await open(page);
    await page.evaluate(() => window.Haori.toast('通知'));
    await settle(page);

    await expect(page.locator('.haori-toast')).toBeVisible();
  });

  test('data-click-toast のトーストが表示される（回帰）', async ({page}) => {
    await open(page);
    await page.locator('#save').click();
    await settle(page);

    await expect(page.locator('.haori-toast')).toBeVisible();
    await expect(page.locator('.haori-toast')).toHaveText('保存しました');
  });

  test('追加の直後に showModal() で開いたダイアログはモーダルのまま（回帰）', async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(() => {
      const dialog = document.createElement('dialog');
      dialog.id = 'modal';
      dialog.textContent = 'd';
      document.body.appendChild(dialog);
      dialog.showModal();
    });
    await settle(page);

    expect(
      await page.locator('#modal').evaluate(e => e.matches(':modal')),
    ).toBe(true);
  });

  test('追加の直後に当てたフォーカスが残る（回帰）', async ({page}) => {
    await open(page);
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'added';
      document.getElementById('slot').appendChild(input);
      input.focus();
    });
    await settle(page);

    expect(await page.evaluate(() => document.activeElement?.id)).toBe('added');
  });
});
