/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// デモの操作テスト（フォームの値収集と双方向バインディング）。
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

test.describe('data-form', () => {
  test('入力値がバインディングデータへ同期され、式が追随する', async ({
    page,
  }) => {
    const errors = await open(page, '/demo/form/data-form-demo.html');
    await expect(page.locator('#output')).toHaveText(
      '入力値: 山田太郎（年齢: 28）',
    );

    await page.fill('input[name="username"]', '鈴木花子');
    await page.locator('input[name="age"]').fill('35');
    // change を発火させるためフォーカスを外す。
    await page.locator('input[name="age"]').blur();
    await expect(page.locator('#output')).toHaveText(
      '入力値: 鈴木花子（年齢: 35）',
    );
    expect(errors).toEqual([]);
  });
});

test.describe('data-form-arg', () => {
  test('収集した値が指定キーの下にまとまる', async ({page}) => {
    await open(page, '/demo/form/data-form-arg-demo.html');
    await expect(page.locator('#output')).toHaveText(
      '収集結果: user1 / 開発部',
    );

    await page.fill('input[name="username"]', 'user2');
    await page.locator('input[name="username"]').blur();
    await expect(page.locator('#output')).toContainText('user2');
  });
});

test.describe('data-form-object', () => {
  test('配下の入力がオブジェクトとしてまとまる', async ({page}) => {
    await open(page, '/demo/form/data-form-object-demo.html');
    await expect(page.locator('#output')).toContainText('氏名: 山田太郎');
    await expect(page.locator('#output')).toContainText(
      '住所: Tokyo 100-0001',
    );

    await page.fill('input[name="city"]', 'Osaka');
    await page.locator('input[name="city"]').blur();
    await expect(page.locator('#output')).toContainText('住所: Osaka');
    // 同じスコープの氏名は影響を受けない。
    await expect(page.locator('#output')).toContainText('氏名: 山田太郎');
  });
});

test.describe('data-form-list', () => {
  test('値の配列とオブジェクトの配列を収集する', async ({page}) => {
    await open(page, '/demo/form/data-form-list-demo.html');
    await expect(page.locator('#output')).toContainText('tags: js, ts');
    await expect(page.locator('#output')).toContainText(
      'items: Item1, Item2',
    );

    await page.locator('input[name="tags"]').nth(1).fill('tsx');
    await page.locator('input[name="tags"]').nth(1).blur();
    await expect(page.locator('#output')).toContainText('tags: js, tsx');
  });
});

test.describe('data-form-detach', () => {
  test('外した入力はバインディングデータへ載らない', async ({page}) => {
    await open(page, '/demo/form/data-form-detach-demo.html');
    await expect(page.locator('#output')).toContainText(
      '収集された username: 「user1」',
    );
    await expect(page.locator('#output')).toContainText(
      '収集された password: 「」',
    );

    // 値を変えても収集されない。
    await page.fill('input[name="password"]', 'changed');
    await page.locator('input[name="password"]').blur();
    await expect(page.locator('#output')).toContainText(
      '収集された password: 「」',
    );
  });
});
