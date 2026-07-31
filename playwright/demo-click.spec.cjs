/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// デモの操作テスト（クリックのアクション）。
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

test.describe('data-click-adjust', () => {
  test('対象の数値を加算・減算する', async ({page}) => {
    const errors = await open(page, '/demo/click/data-click-adjust-demo.html');
    const quantity = page.locator('#quantity');
    await expect(quantity).toHaveValue('10');

    await page.getByRole('button', {name: '+1'}).click();
    await expect(quantity).toHaveValue('11');
    await page.getByRole('button', {name: '-1'}).click();
    await expect(quantity).toHaveValue('10');
    expect(errors).toEqual([]);
  });
});

test.describe('data-click-open / close / dialog', () => {
  test('ダイアログを開閉できる', async ({page}) => {
    await open(page, '/demo/click/data-click-dialog-demo.html');
    const dialog = page.locator('#myDialog');
    await expect(dialog).toBeHidden();

    await page.getByRole('button', {name: '開く'}).click();
    await expect(dialog).toBeVisible();
    await page.getByRole('button', {name: '閉じる'}).click();
    await expect(dialog).toBeHidden();
  });

  test('data-click-dialog はメッセージを表示する', async ({page}) => {
    await open(page, '/demo/click/data-click-dialog-demo.html');
    // 既定の実装は window.alert（haori-bootstrap を読み込むと差し替わる）。
    const messages = [];
    page.on('dialog', dialog => {
      messages.push(dialog.message());
      dialog.accept();
    });
    await page.getByRole('button', {name: 'メッセージ'}).click();
    await expect.poll(() => messages).toEqual(['メッセージ表示']);
  });
});

test.describe('data-click-row-*', () => {
  test('行の追加・削除・並べ替えができる', async ({page}) => {
    await open(page, '/demo/click/data-click-row-demo.html');
    const rows = page.locator('div[data-each] > div[data-row]');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator('input')).toHaveValue('A');

    // 1 行目の下に行を追加する。
    await rows.nth(0).getByRole('button', {name: '行追加'}).click();
    await expect(rows).toHaveCount(3);

    // 追加した行を削除して元の件数へ戻す。
    await rows.nth(1).getByRole('button', {name: '削除'}).click();
    await expect(rows).toHaveCount(2);

    // 1 行目を下へ動かすと A と B が入れ替わる。
    await rows.nth(0).getByRole('button', {name: '↓'}).click();
    await expect(rows.nth(0).locator('input')).toHaveValue('B');
    await expect(rows.nth(1).locator('input')).toHaveValue('A');
  });
});

test.describe('data-click-click', () => {
  test('別の要素のクリックを発火する', async ({page}) => {
    await open(page, '/demo/click/data-click-click-demo.html');
    const counter = page.locator('#counter');
    await expect(counter).toHaveValue('0');

    await page.locator('#target-button').click();
    await expect(counter).toHaveValue('1');

    // 間接クリックでも同じ処理が走る。
    await page.locator('#indirect-button').click();
    await expect(counter).toHaveValue('2');
  });
});

test.describe('data-click-confirm', () => {
  test('確認を承認したときだけ手続きが走る', async ({page}) => {
    await open(page, '/demo/click/data-click-confirm-demo.html');
    const result = page.locator('#result');
    await expect(result).toContainText('結果:');

    // 却下した場合は結果が入らない。
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', {name: '削除'}).click();
    await page.waitForTimeout(500);
    await expect(result).not.toContainText('削除されました');

    // 承認した場合は応答が反映される。
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', {name: '削除'}).click();
    await expect(result).toContainText('削除されました');
  });
});

test.describe('data-click-data / bind-arg / bind-params', () => {
  test('送信データを付けて取得し、応答を反映する', async ({page}) => {
    await open(page, '/demo/click/data-click-data-demo.html');
    await page.getByRole('button', {name: '送信'}).click();
    await expect(page.locator('#result')).toContainText('タイプ: user');
  });

  test('bind-arg でまとめたキーの下に応答が入る', async ({page}) => {
    await open(page, '/demo/click/data-click-bind-params-demo.html');
    await page.getByRole('button', {name: '取得'}).click();
    const result = page.locator('#result');
    await expect(result).toContainText('名前: クリック次郎');
    await expect(result).toContainText('年齢: 20');
    // バインド先の要素へ data-bind としてまとまる。
    await expect(page.locator('#result')).toHaveAttribute(
      'data-bind',
      /クリック次郎/,
    );
  });
});

test.describe('data-click-before-run / after-run', () => {
  test('前後の処理が実行され、false を返すと中止する', async ({page}) => {
    await open(page, '/demo/click/data-click-before-after-demo.html');
    await page.locator('#send').click();
    await expect(page.locator('#result')).toContainText('結果: OK');
    await expect(page.locator('#log')).toHaveText('送信前 送信後 ');

    await page.locator('#cancel').click();
    await page.waitForTimeout(500);
    // 中止した場合は after-run が呼ばれない。
    await expect(page.locator('#log')).toHaveText('送信前 送信後 中止 ');
  });
});

test.describe('data-click-reset / refetch', () => {
  test('入力を初期値へ戻し、一覧を再取得する', async ({page}) => {
    await open(page, '/demo/click/data-click-reset-refetch-demo.html');
    const username = page.locator('input[name="username"]');
    await expect(username).toHaveValue('testuser');
    await expect(page.locator('li.user')).toHaveCount(2);

    await username.fill('changed');
    await username.blur();
    await expect(page.locator('#form-output')).toContainText('changed');

    await page.locator('#reset-button').click();
    await expect(username).toHaveValue('testuser');

    await page.locator('#refetch-button').click();
    await expect(page.locator('li.user')).toHaveCount(2);
    await expect(page.locator('li.user').first()).toHaveText('クリック三郎');
  });
});
