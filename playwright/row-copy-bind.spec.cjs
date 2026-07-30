/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 編集可能な行（data-each + data-form-list）への copy の実ブラウザ確認。
// ローカルビルド（/dist）を読み込んだデモ画面を操作し、行要素をコピー先に指した
// data-click-copy が対応する配列要素へ書き戻され、入力欄と送信データの双方へ
// 届くことを検証する。他の行が影響を受けないことも確認する。
const {test, expect} = require('@playwright/test');

test.describe('編集可能な行への copy（実ブラウザ）', () => {
  test('行を指した copy が入力欄と送信データへ届き、他の行を変えない', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto('/demo/form/row-copy-bind-demo.html');
    await page.waitForSelector('body[data-haori-ready]');
    await page.waitForSelector('#contractRows [data-row]');

    const rows = page.locator('#contractRows > tr');
    const summary = page.locator('#summary li');
    await expect(rows).toHaveCount(2);

    // 行ごとに一意な id が振られている（data-each-index の値で組み立てる）
    await expect(rows.nth(0)).toHaveAttribute('id', 'row-0');
    await expect(rows.nth(1)).toHaveAttribute('id', 'row-1');

    // 初期状態: 1 行目の住所は空、2 行目は入力済み
    await expect(rows.nth(0).locator('input[name="zip"]')).toHaveValue('');
    await expect(rows.nth(1).locator('input[name="zip"]')).toHaveValue(
      '5300001',
    );

    // --- 1 行目へ契約者住所を複写する ---
    await rows.nth(0).locator('button', {hasText: '契約者住所と同じ'}).click();

    await expect(rows.nth(0).locator('input[name="zip"]')).toHaveValue(
      '1000001',
    );
    await expect(rows.nth(0).locator('input[name="city"]')).toHaveValue(
      '東京都千代田区',
    );
    await expect(rows.nth(0).locator('input[name="street"]')).toHaveValue(
      '千代田1-1',
    );
    // コピー対象外のキー（名称）は保たれる
    await expect(rows.nth(0).locator('input[name="name"]')).toHaveValue(
      '東京本社',
    );
    // 他の行は変わらない
    await expect(rows.nth(1).locator('input[name="zip"]')).toHaveValue(
      '5300001',
    );
    await expect(rows.nth(1).locator('input[name="city"]')).toHaveValue(
      '大阪府大阪市北区',
    );

    // 配列（= 収集値）へ書き戻されている
    await expect(summary.nth(0)).toContainText('zip=1000001');
    await expect(summary.nth(0)).toContainText('street=千代田1-1');
    await expect(summary.nth(1)).toContainText('zip=5300001');

    // --- 行を追加してから、追加した行へ複写する ---
    await rows.nth(1).locator('button', {hasText: '行追加'}).click();
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(2)).toHaveAttribute('id', 'row-2');

    await rows.nth(2).locator('button', {hasText: '契約者住所と同じ'}).click();
    await expect(rows.nth(2).locator('input[name="city"]')).toHaveValue(
      '東京都千代田区',
    );
    // 直前の行（大阪支店）は影響を受けない
    await expect(rows.nth(1).locator('input[name="city"]')).toHaveValue(
      '大阪府大阪市北区',
    );

    // --- 複写後に入力欄を編集すると、その値が配列へ確定する ---
    await rows.nth(0).locator('input[name="street"]').fill('千代田2-2');
    await rows.nth(0).locator('input[name="name"]').click();
    await expect(summary.nth(0)).toContainText('street=千代田2-2');
  });
});
