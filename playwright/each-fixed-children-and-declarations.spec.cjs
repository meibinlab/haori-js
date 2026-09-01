/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, document */
// 固定要素の再評価・非表示中の完了マーカー・宣言の書き換えの確認。
// 期待値は次の仕様から取っている。
// - 仕様「`data-each`」の「固定要素とコンテナ直下のテキストノードは行ではないため、
//   **コンテナのスコープで、バインドデータの更新のたびに再評価します**」
// - 同節の「`data-each-done`」の「**非表示のあいだは外れます。**」
// - 仕様「監視対象」の「宣言の属性（`data-if` / `data-each` など）が書き換えられた
//   場合、その属性の処理は**更新後の宣言**で行います」
// - 仕様「data-if の動作」の「追随結果を取り込まない範囲は、DOM の監視だけでなく
//   **要素の内部状態を作る時点**（走査・複製）にも及びます」
//
// 単体テストは属性とバインドデータを見ている。宣言の書き換えは監視の経路を通るため、
// 実ブラウザでも確かめる（jsdom では取り込みの経路が実物と違う組み方になりやすい）。
const {test, expect} = require('@playwright/test');

test.describe('固定要素と宣言の書き換え', () => {
  test('固定要素が配列の変化でそのつど再評価される', async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto('/demo/each/data-each-fixed-children-demo.html');
    await page.waitForFunction(() =>
      document.body.hasAttribute('data-haori-ready'),
    );

    const caption = page.locator('#fruitList .caption');
    const empty = page.locator('#fruitList .empty');
    await expect(caption).toHaveText('くだもの（2 件）');
    await expect(empty).toBeHidden();

    await page.getByRole('button', {name: '追加'}).click();
    await expect(caption).toHaveText('くだもの（4 件）');
    await expect(empty).toBeHidden();

    await page.getByRole('button', {name: '空にする'}).click();
    await expect(caption).toHaveText('くだもの（0 件）');
    await expect(empty).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('非表示のあいだは data-each-done が外れる', async ({page}) => {
    await page.goto('/demo/each/data-each-fixed-children-demo.html');
    await page.waitForFunction(() =>
      document.body.hasAttribute('data-haori-ready'),
    );
    const list = page.locator('#fruitList');
    await expect(list).toHaveAttribute('data-each-done', '');

    await page.getByRole('button', {name: '隠す'}).click();
    await expect(list).not.toHaveAttribute('data-each-done', '');

    await page.getByRole('button', {name: '出す'}).click();
    await expect(list).toHaveAttribute('data-each-done', '');
  });

  test('宣言の書き換えが 1 手遅れずに反映される', async ({page}) => {
    await page.goto('/demo/each/data-each-fixed-children-demo.html');
    await page.waitForFunction(() =>
      document.body.hasAttribute('data-haori-ready'),
    );
    const rows = page.locator('#fruitList li:not(.caption):not(.empty)');
    await expect(rows).toHaveCount(2);

    // `data-each` の宣言そのものを絞り込み式へ書き換える。
    await page.evaluate(() =>
      document
        .getElementById('fruitList')
        .setAttribute('data-each', 'items.filter(x => x === "りんご")'),
    );
    await expect(rows).toHaveCount(1);

    await page.evaluate(() =>
      document.getElementById('fruitList').setAttribute('data-each', 'items'),
    );
    await expect(rows).toHaveCount(2);

    // `data-if` の宣言そのものを書き換える。
    const list = page.locator('#fruitList');
    await page.evaluate(() =>
      document.getElementById('fruitList').setAttribute('data-if', 'false'),
    );
    await expect(list).toBeHidden();

    await page.evaluate(() =>
      document.getElementById('fruitList').setAttribute('data-if', 'true'),
    );
    await expect(list).toBeVisible();
  });

  test('data-if の追随結果を含む markup が表示へ戻る', async ({page}) => {
    await page.goto('/playwright/if-false-markup.html');
    await page.waitForFunction(() =>
      document.body.hasAttribute('data-haori-ready'),
    );

    await expect(page.locator('#shown')).toBeVisible();
    await expect(page.locator('#styled')).toBeVisible();
    await expect(page.locator('#styled')).toHaveCSS('color', 'rgb(180, 83, 9)');
    await expect(page.locator('#hidden')).toBeHidden();
  });
});
