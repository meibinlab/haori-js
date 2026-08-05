/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console */
// 反映待ちの書き込みが、要求より後に打った文字を消していた問題の回帰ガード。
// 期待値は仕様「反映待ちの間に起きた変化」の「保護の対象は打鍵 1 文字ごとです。
// `change` の発火（フォーカスを外す・選択の確定）を待ちません」から取っている。
// 単体テスト（tests/pending-write-typing.test.ts）は jsdom なので、実際のキーボード
// 入力と requestAnimationFrame で流れる描画キューはここで確認する。
const {test, expect} = require('@playwright/test');

test.describe('反映待ちの書き込みと打鍵中の編集', () => {
  test.beforeEach(async ({page}) => {
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.goto('/playwright/pending-write-typing-repro.html');
    await page.waitForFunction(() => typeof window.Haori !== 'undefined');
    await page.waitForSelector('body[data-haori-ready]');
  });

  test('実キーボードで打った文字が、飛行中の取得の応答で消えない', async ({
    page,
  }) => {
    // `data-input-*` を宣言していない入力欄でも、打鍵の時点で編集として記録される。
    // 修正前は記録されず、反映待ちの書き込みを見送る判定が働かなかった。
    //
    // 観測は画面と収集値だけで行う（内部の通番は読まない）。応答は保留したまま実キーで
    // 打ち、打ち終わってから初めて返すため、「要求より後の打鍵」であることが順序として
    // 保証される。応答が着弾しても打った文字が残ることが、記録されている証拠になる。
    let release = null;
    let requested = null;
    const requestArrived = new Promise(resolve => {
      requested = resolve;
    });
    await page.route('**/api/record', async route => {
      requested();
      await new Promise(resolve => {
        release = resolve;
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({record: {zip: '1000001', addr: '千代田'}}),
      });
    });

    await page.locator('#load').click();
    await requestArrived;

    // 応答待ちの間に実キーで打つ。`change` はまだ発火していない。
    await page.locator('#addr').click();
    await page.keyboard.type('手入力');

    release();

    // 編集していない郵便番号欄は応答の値を受ける（= 応答が着弾した合図）。
    await expect(page.locator('#zip')).toHaveValue('1000001');

    await page.locator('#collect').click();
    await page.waitForFunction(
      () => document.getElementById('log').textContent !== '-',
    );
    const result = JSON.parse(await page.locator('#log').textContent());

    // 画面と収集値の双方に打った文字が残る。
    expect(result.dom).toBe('手入力');
    expect(result.collected.addr).toBe('手入力');
  });

  test('書き戻しの要求後に打った文字が、着弾した書き込みで消えない', async ({
    page,
  }) => {
    // 要求から着弾までの間に打鍵する必要があるため、打鍵まで同期的に進める
    // （実キーボードでは往復の間にキューが流れてしまい、要求後の打鍵にならない）。
    //
    // 供給は `Core.setBindingData` で起こす。`change` を発火させる形にすると、収集は
    // 打鍵より後に DOM を読むため（収集は DOM を真とする）供給値が打鍵後の値になり、
    // 上書きが起きない。報告の事象は「収集が打鍵より前に済んでいた」場合なので、
    // 供給の内容が打鍵前の値であることを明示して固定する。
    await page.evaluate(() => {
      const api = window.Haori && window.Haori.default ? window.Haori : null;
      const addr = document.getElementById('addr');
      // 外部ライブラリ（YubinBango）の代入。イベントは発火しない。
      addr.value = '千代田';
      // 収集・コミットの結果が入力欄へ書き戻される（反映の要求）。
      void api.Core.setBindingData(document.getElementById('state'), {
        record: {zip: '1000001', addr: '千代田'},
      });
      // クリック直後の打鍵。`change` はまだ発火していない。
      addr.focus();
      addr.value = '千代田1-1';
      addr.dispatchEvent(new Event('input', {bubbles: true}));
    });

    await page.locator('#collect').click();
    await page.waitForFunction(
      () => document.getElementById('log').textContent !== '-',
    );
    const result = JSON.parse(
      await page.locator('#log').textContent(),
    );

    // 画面と収集値の双方に打った文字が残る（収集値が供給値のままなら保存で失われる）。
    expect(result.dom).toBe('千代田1-1');
    expect(result.collected.addr).toBe('千代田1-1');
  });
});
