/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// デモの操作テスト（バインド・条件分岐・繰り返し）。
//
// 表示テスト（demo-display.spec.cjs）は「エラーなく描画される」ことしか見ないため、
// ここでは各デモが宣言した振る舞い（値が入る・切り替わる・行が増減する）を確認する。
const {test, expect} = require('@playwright/test');

/**
 * ページを開き、初期化の完了を待ちます。
 *
 * @param page 対象ページ
 * @param url 開く URL
 * @returns 収集したコンソールエラーの配列
 */
async function open(page, url) {
  const errors = [];
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(url);
  await page.waitForFunction(() =>
    document.body.hasAttribute('data-haori-ready'),
  );
  await page.evaluate(async () => {
    const runtime = window.Haori;
    if (runtime && typeof runtime.waitForRenders === 'function') {
      await runtime.waitForRenders();
    }
  });
  return errors;
}

test.describe('data-bind', () => {
  test('宣言した値がテキストへ入る', async ({page}) => {
    const errors = await open(page, '/demo/bind/data-bind-demo.html');
    await expect(page.locator('div[data-bind] p')).toHaveText('Hello, Haori!');
    expect(errors).toEqual([]);
  });

  test('入れ子では内側が優先され、無いキーは祖先から受け継ぐ', async ({
    page,
  }) => {
    await open(page, '/demo/bind/data-bind-nested-demo.html');
    await expect(page.locator('#outer-line')).toContainText('プラン 標準');
    await expect(page.locator('#inner-line')).toContainText('プラン 特別');
    await expect(page.locator('#innermost-line')).toContainText('プラン 最上級');
    // company は外側だけが持つため、すべての階層で同じ値になる。
    for (const id of ['#outer-line', '#inner-line', '#innermost-line']) {
      await expect(page.locator(id)).toContainText('会社 明文堂');
    }
    // contact は最内で宣言していないため 1 つ外側の値を受け継ぐ。
    await expect(page.locator('#innermost-line')).toContainText(
      'vip@example.com',
    );
  });

  test('URL パラメータ形式でも値を与えられる', async ({page}) => {
    await open(page, '/demo/bind/data-bind-urlparam-demo.html');
    await expect(page.locator('div[data-bind]')).toContainText(
      'メッセージ: Hello World',
    );
    await expect(page.locator('div[data-bind]')).toContainText('カウント: 42');
  });
});

test.describe('data-if', () => {
  test('条件が真の分岐だけが見える', async ({page}) => {
    await open(page, '/demo/if/data-if-demo.html');
    await expect(page.locator('p[data-if="show"]')).toBeVisible();
    await expect(page.locator('p[data-if="!show"]')).toBeHidden();
  });

  test('条件を切り替えると data-if-false の付与が入れ替わる', async ({
    page,
  }) => {
    await open(page, '/demo/if/data-if-false-demo.html');
    // 初期状態は show=false。
    await expect(page.locator('#target')).toBeHidden();
    await expect(page.locator('#target')).toHaveAttribute('data-if-false', '');
    await expect(page.locator('#attr-status')).toHaveText(
      'data-if-false属性: あり',
    );

    await page.getByRole('button', {name: '表示/非表示 切替'}).click();
    await expect(page.locator('#target')).toBeVisible();
    await expect(page.locator('#target')).not.toHaveAttribute(
      'data-if-false',
      '',
    );
    await expect(page.locator('#attr-status')).toHaveText(
      'data-if-false属性: なし',
    );
  });
});

test.describe('data-each', () => {
  test('配列の件数だけ行を生成する', async ({page}) => {
    await open(page, '/demo/each/data-each-demo.html');
    await expect(page.locator('ul[data-each] li')).toHaveCount(3);
    await expect(page.locator('ul[data-each] li').first()).toHaveText('A');
  });

  test('data-each-index で行番号を参照できる', async ({page}) => {
    await open(page, '/demo/each/data-each-index-demo.html');
    const items = page.locator('ul[data-each] li');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toHaveText('0: A');
    await expect(items.nth(2)).toHaveText('2: C');
  });

  test('data-each-key の値が行の data-row に入る', async ({page}) => {
    await open(page, '/demo/each/data-each-key-demo.html');
    await expect(page.locator('li[data-row="1"]')).toHaveText('Taro');
    await expect(page.locator('li[data-row="2"]')).toHaveText('Hanako');
  });

  test('data-each-before の固定要素は繰り返されない', async ({page}) => {
    await open(page, '/demo/each/data-each-before-demo.html');
    await expect(page.locator('li[data-each-before]')).toHaveCount(1);
    // 固定要素 1 件 + 行 3 件。
    await expect(page.locator('ul[data-each] > li')).toHaveCount(4);
    await expect(page.locator('ul[data-each] > li').first()).toHaveAttribute(
      'data-each-before',
      '',
    );
  });

  test('data-each-after の固定要素は繰り返されない', async ({page}) => {
    await open(page, '/demo/each/data-each-after-demo.html');
    await expect(page.locator('li[data-each-after]')).toHaveCount(1);
    await expect(page.locator('ul[data-each] > li')).toHaveCount(4);
    await expect(page.locator('ul[data-each] > li').last()).toHaveAttribute(
      'data-each-after',
      '',
    );
  });

  test('前後の固定要素を同時に使える', async ({page}) => {
    await open(page, '/demo/each/data-each-before-after-demo.html');
    await expect(page.locator('p[data-each-before]')).toHaveCount(1);
    await expect(page.locator('p[data-each-after]')).toHaveCount(1);
    await expect(page.locator('div[data-each] > span')).toHaveCount(3);
  });

  test('生成した行に data-row が自動で付く', async ({page}) => {
    await open(page, '/demo/row/data-row-demo.html');
    const rows = page.locator('tbody[data-each] tr');
    await expect(rows).toHaveCount(3);
    for (const id of ['u-1', 'u-2', 'u-3']) {
      await expect(page.locator(`tr[data-row="${id}"]`)).toHaveCount(1);
    }
  });
});
