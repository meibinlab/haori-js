/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// デモの操作テスト（data-fetch とその周辺）。
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

test.describe('data-fetch', () => {
  test('取得した配列を一覧へ展開する', async ({page}) => {
    const errors = await open(page, '/demo/fetch/data-fetch-demo.html');
    const rows = page.locator('tbody[data-each] tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('りんご');
    await expect(rows.nth(2)).toContainText('もも');
    // data-each-key の値が行へ付く。
    await expect(page.locator('tr[data-row="1"]')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('最小の宣言でもキーがテキストへ入る', async ({page}) => {
    await open(page, '/demo/fetch/data-fetch-demo-simple.html');
    await expect(page.locator('div[data-fetch] p')).toHaveText(
      '名前: 佐藤花子',
    );
  });

  test('data-fetch-bind で別要素へ応答をバインドする', async ({page}) => {
    await open(page, '/demo/fetch/data-fetch-bind-demo.html');
    const result = page.locator('#result');
    await expect(result).toContainText('名前: 田中太郎');
    await expect(result).toContainText('年齢: 30');
  });

  test('data-fetch-bind-params で反映するキーを絞る', async ({page}) => {
    await open(page, '/demo/fetch/data-fetch-bind-params-demo.html');
    const result = page.locator('#result');
    await expect(result).toContainText('名前: 佐藤花子');
    await expect(result).toContainText('年齢: 25');
    // 応答に含まれる city は params に無いためバインドされない。
    const bound = await result.getAttribute('data-bind');
    expect(bound).not.toContain('大阪');
  });

  test('data-fetch-headers を付けても取得できる', async ({page}) => {
    await open(page, '/demo/fetch/data-fetch-headers-demo.html');
    await expect(page.locator('div[data-fetch] p')).toHaveText(
      '名前: 田中美咲',
    );
  });

  test('data-fetch-content-type を指定して取得する', async ({page}) => {
    await open(page, '/demo/fetch/data-fetch-content-type-demo.html');
    await expect(page.locator('#result')).toContainText('結果: 成功');
  });

  test('data-fetch-form で対象フォームの値を送る', async ({page}) => {
    await open(page, '/demo/fetch/data-fetch-form-demo.html');
    await page.getByRole('button', {name: '送信'}).click();
    const result = page.locator('#result');
    await expect(result).toContainText('送信結果: 登録完了');
    await expect(result).toContainText('ユーザー名: 山田太郎');
  });

  test('data-fetch-method の指定で取得できる', async ({page}) => {
    await open(page, '/demo/fetch/data-fetch-method-demo.html');
    await expect(page.locator('#result')).toHaveText('送信結果: OK');
  });

  test('data-fetch-arg は応答をキーの下にまとめ、入力欄へ反映する', async ({
    page,
  }) => {
    await open(page, '/demo/fetch/data-fetch-arg-demo.html');
    await expect(page.locator('#user-name')).toHaveValue('田中一郎');
    await expect(page.locator('#user-ssl')).toBeChecked();
    await expect(page.locator('#user-form')).toContainText(
      '現在の名前: 田中一郎',
    );
    await expect(page.locator('#user-form')).toContainText('SSL設定: ON');
  });
});

test.describe('data-fetch-state', () => {
  test('成功と失敗で表示が切り替わる', async ({page}) => {
    await page.goto('/demo/fetch/data-fetch-state-demo.html');
    await page.waitForFunction(() =>
      document.body.hasAttribute('data-haori-ready'),
    );
    // 取得前はどの状態の表示も出ない。
    await expect(page.locator('.state-success')).toBeHidden();
    await expect(page.locator('.state-error')).toBeHidden();

    await page.getByRole('button', {name: '成功するフェッチ'}).click();
    await expect(page.locator('.state-success')).toBeVisible();
    await expect(page.locator('.state-success')).toContainText(
      '取得に成功しました',
    );

    // 失敗する取得先を押すとエラー表示へ切り替わり、ステータスが入る。
    await page.getByRole('button', {name: /失敗するフェッチ/}).click();
    await expect(page.locator('.state-error')).toBeVisible();
    await expect(page.locator('.state-error')).toContainText('404');
    await expect(page.locator('.state-success')).toBeHidden();

    // 再取得で成功表示へ戻る。
    await page.getByRole('button', {name: '再取得'}).click();
    await expect(page.locator('.state-success')).toBeVisible();
  });
});
