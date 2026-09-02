/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, document */
// 祖先が一覧を持つ編集フォーム（`data-form-arg` なし）の確認。
// 期待値は仕様「祖先が所有する値の反映（`data-form-arg` なし）」の「コミット時は
// **収集したキーごとに、最も近い所有者の値を土台に収集値を重ねます**」と「祖先が
// 当該キーを更新したときに解除するため、以降の更新が届かなくなることはありません」
// から取っている。
//
// 単体テスト（tests/inherited-record-commit.test.ts）はバインドデータを見ている。
// ここでは利用者に見える表示（`{{row.id}}` の描画と入力欄の値）を確認する。実
// ブラウザで確かめるのは、解除が `Core.setBindingData()` の更新チェーンに乗るため
// で、段の進み方が jsdom と変わりうるためである（課題 29 で監視経路が jsdom では
// 再現しなかった経緯がある）。
const {test, expect} = require('@playwright/test');

test.describe('祖先が一覧を持つ編集フォーム', () => {
  test('編集しても行の id が残り、再取得は画面へ届く', async ({page}) => {
    const errors = [];
    page.on('console', message => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto('/playwright/inherited-record-commit.html');
    await page.waitForFunction(() =>
      document.body.hasAttribute('data-haori-ready'),
    );

    await expect(page.locator('#list .line')).toHaveCount(2);
    await expect(page.locator('#list .rowId')).toHaveText(['1', '2']);

    // 1 行目を編集して確定する。編集していない行も含めて id が残る。
    //
    // 判定の順序が重要。`id` は編集前から `1|2` なので、コミットの完了を待たずに
    // 判定すると壊れる前に成立してしまう（仕様どおりでも通ってしまい、検出力が
    // 無い）。まず label がコミットされたことを確認し、その時点で id を判定する。
    const first = page.locator('#list .line input').first();
    await first.fill('あ！');
    await first.blur();
    await expect(page.locator('#labels')).toHaveText('あ！|い');
    await expect(page.locator('#ids')).toHaveText('1|2');
    await expect(page.locator('#list .rowId')).toHaveText(['1', '2']);
    await expect(page.locator('#list .line input').nth(0)).toHaveValue('あ！');
    await expect(page.locator('#list .line input').nth(1)).toHaveValue('い');

    // 一覧を再取得する。コピーが解除され、新しい値が画面へ届く。
    await page.locator('#reload').click();
    await expect(page.locator('#list .line input').nth(0)).toHaveValue('X');
    await expect(page.locator('#list .line input').nth(1)).toHaveValue('Y');
    await expect(page.locator('#list .rowId')).toHaveText(['1', '2']);

    expect(errors).toEqual([]);
  });

  test('リセットは祖先が持つ値へ戻す', async ({page}) => {
    await page.goto('/playwright/inherited-record-commit.html');
    await page.waitForFunction(() =>
      document.body.hasAttribute('data-haori-ready'),
    );

    const first = page.locator('#list .line input').first();
    await first.fill('あ！');
    await first.blur();
    await expect(page.locator('#list .line input').nth(0)).toHaveValue('あ！');
    await expect(page.locator('#list .line input').nth(1)).toHaveValue('い');

    await page.locator('#rst').click();
    await expect(page.locator('#list .line input').nth(0)).toHaveValue('あ');
    await expect(page.locator('#list .line input').nth(1)).toHaveValue('い');
    await expect(page.locator('#list .rowId')).toHaveText(['1', '2']);
  });
});
