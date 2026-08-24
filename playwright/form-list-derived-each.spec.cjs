/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, document */
// 派生配列を描く `data-each` と `data-form-list` を併用したときの収集値の確認。
// 期待値は仕様「行の対応付けと `data-each-key`」の「**収集した行に対応しない配列要素**:
// 元の位置に元の値のまま残します。**収集が配列を行数へ切り詰めることは
// ありません**」から取っている。
//
// 単体テスト（tests/form-list-derived-each-rows.test.ts）はバインドデータを直接見て
// いる。実ブラウザでは行の描画と収集の順序が単体テストより粗いため、利用者に見える
// 表示でも確認する。
const {test, expect} = require('@playwright/test');

test.describe('data-form-list と派生配列の data-each', () => {
  test('画面に出ていない要素が収集値に残る', async ({page}) => {
    const errors = [];
    page.on('console', message => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto('/demo/form/data-form-list-derived-each-demo.html');
    await page.waitForFunction(() =>
      document.body.hasAttribute('data-haori-ready'),
    );

    // 画面には有効な 2 件だけが出る。
    await expect(page.locator('#ruleRows tr')).toHaveCount(2);
    await expect(page.locator('#ruleData li')).toHaveText([
      '1: 基本料金（有効）',
      '2: 早期割（無効・画面に出ていない行）',
      '3: 従量料金（有効）',
    ]);

    // 1 行目の名称を書き換えて欄から出る。
    const name = page.locator('#name-1');
    await name.fill('基本料金（改定）');
    await name.blur();

    // 収集した 2 行だけで組み立て直すと、画面に出ていない 2: 早期割 が消える。
    await expect(page.locator('#ruleData li')).toHaveText([
      '1: 基本料金（改定）（有効）',
      '2: 早期割（無効・画面に出ていない行）',
      '3: 従量料金（有効）',
    ]);
    expect(errors).toEqual([]);
  });
});
