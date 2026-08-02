/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console */
// data-import で取り込んだ断片が、取り込み側のバインドスコープを継承することの
// 回帰ガード。取り込みは innerHTML で子を差し替えるため、フラグメント木への
// 繋ぎ直しと監視（MutationObserver）との噛み合いが関わる。通知の届く順序は
// 実ブラウザでしか確認できないため、初期読み込みと初期化後の両方を確かめる。
const {test, expect} = require('@playwright/test');

test.describe('data-import のスコープ継承', () => {
  test('祖先と取り込み先自身の data-bind を参照できる', async ({page}) => {
    test.setTimeout(60000);
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.goto('/playwright/import-scope-repro.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');

    // 直書きと取り込みで同じスコープ解決になる。
    await expect(page.locator('#direct')).toHaveText(
      '直書き: 2 / テスト太郎',
    );
    await expect(page.locator('#imported #frag-text')).toHaveText(
      '現在のステップ: 2 / 名前: テスト太郎',
    );
    await expect(page.locator('#imported #frag-if')).not.toHaveAttribute(
      'data-if-false',
      '',
    );

    // 取り込み先要素自身の data-bind も参照できる。
    await expect(page.locator('#imported2 #frag-text')).toHaveText(
      '現在のステップ: 3 / 名前: 取り込み先で宣言',
    );
    // 条件が偽の断片は非表示になる。
    await expect(page.locator('#imported2 #frag-if')).toHaveAttribute(
      'data-if-false',
      '',
    );
  });

  test('初期化後に URL が確定した取り込みも評価される', async ({page}) => {
    test.setTimeout(60000);
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.goto('/playwright/import-scope-repro.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');

    // 読み込み時点では URL が未解決なので取り込まれていない。
    await expect(page.locator('#imported3 #frag-text')).toHaveCount(0);

    await page.locator('#load-late').click();
    await expect(page.locator('#imported3 #frag-text')).toHaveText(
      '現在のステップ: 2 / 名前: あとから',
    );
    await expect(page.locator('#imported3 #frag-if')).not.toHaveAttribute(
      'data-if-false',
      '',
    );
  });
});
