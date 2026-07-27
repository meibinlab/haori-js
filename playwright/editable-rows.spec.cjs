/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// data-each + data-form-list による編集可能な繰り返し行の実ブラウザ確認。
// ローカルビルド（/dist）を読み込んだデモ画面を操作し、初期 data-bind からの
// 値復元と、行の追加・削除・並べ替えがバインディングデータへ追従することを検証する。
const {test, expect} = require('@playwright/test');

test.describe('data-each + data-form-list（実ブラウザ）', () => {
  test('初期値が復元され、行の増減と並べ替えが送信データへ追従する', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto('/demo/form/data-form-list-editable-demo.html');
    await page.waitForSelector('body[data-haori-ready]');
    await page.waitForSelector('#contractRows [data-row]');

    const rows = page.locator('#contractRows > tr');
    const summary = page.locator('#contractForm ul li');

    // --- 初期 data-bind からの復元 ---
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator('select')).toHaveValue('power');
    await expect(rows.nth(1).locator('select')).toHaveValue('gas');
    await expect(rows.nth(0).locator('input[name="name"]')).toHaveValue(
      '東京本社',
    );
    await expect(rows.nth(0).locator('input[name="active"]')).toBeChecked();
    await expect(rows.nth(1).locator('input[name="active"]')).not.toBeChecked();

    // --- 行の追加（1 行目の直後へ空行が入る） ---
    await rows.nth(0).locator('button[data-click-row-add]').click();
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1).locator('input[name="name"]')).toHaveValue('');
    await expect(rows.nth(2).locator('input[name="name"]')).toHaveValue(
      '大阪支店',
    );
    // 行番号（data-each-index）が振り直される
    await expect(rows.nth(0).locator('.num')).toHaveText('1');
    await expect(rows.nth(2).locator('.num')).toHaveText('3');

    // 追加した行へ入力するとバインディングデータへ反映される
    // （テキスト入力は change で確定するため、入力後にフォーカスを外す）
    await rows.nth(1).locator('input[name="name"]').fill('名古屋支店');
    await rows.nth(1).locator('input[name="name"]').blur();
    await expect(summary.nth(1)).toContainText('name=名古屋支店');
    await rows.nth(1).locator('select').selectOption('gas');
    await expect(summary.nth(1)).toContainText('kind=gas');

    // --- 並べ替え ---
    await rows.nth(1).locator('button[data-click-row-prev]').click();
    await expect(rows.nth(0).locator('input[name="name"]')).toHaveValue(
      '名古屋支店',
    );
    await expect(rows.nth(1).locator('input[name="name"]')).toHaveValue(
      '東京本社',
    );
    await expect(summary.nth(0)).toContainText('name=名古屋支店');

    // --- 0 件まで削除できる（row-remove-empty） ---
    for (let remaining = 3; remaining > 0; remaining -= 1) {
      await rows.nth(0).locator('button[data-click-row-remove]').click();
      await expect(rows).toHaveCount(remaining - 1);
    }
    await expect(page.locator('#contractForm .empty')).toBeVisible();
    await expect(page.locator('#contractForm p').first()).toHaveText('件数: 0');

    // --- 0 件の状態から、行の外のボタンで追加できる ---
    await page.locator('button[data-click-row-add="#contractRows"]').click();
    await expect(rows).toHaveCount(1);
    await expect(page.locator('#contractForm .empty')).toBeHidden();
    await expect(rows.nth(0).locator('input[name="name"]')).toHaveValue('');
  });
});
