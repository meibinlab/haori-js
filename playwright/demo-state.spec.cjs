/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// デモの操作テスト（状態保持・URL・部分テンプレート・メッセージ・イベント）。
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

test.describe('data-url-param', () => {
  test('クエリの値を指定キーの下へ入れる', async ({page}) => {
    const errors = await open(
      page,
      '/demo/url/data-url-param-demo.html?user=%E5%A4%AA%E9%83%8E',
    );
    await expect(page.locator('div[data-url-param]')).toContainText(
      'ユーザー: 太郎',
    );
    expect(errors).toEqual([]);
  });

  test('複数のクエリをまとめて参照できる', async ({page}) => {
    await open(
      page,
      '/demo/url/data-url-param-arg-demo.html?name=%E8%8A%B1%E5%AD%90&age=25',
    );
    const scope = page.locator('div[data-url-param]');
    await expect(scope).toContainText('名前: 花子');
    await expect(scope).toContainText('年齢: 25');
  });

  test('クエリが無いときは空表示になる', async ({page}) => {
    await open(page, '/demo/url/data-url-param-demo.html');
    await expect(page.locator('div[data-url-param]')).toHaveText('ユーザー:');
  });
});

test.describe('data-import', () => {
  test('部分テンプレートを読み込んで差し込む', async ({page}) => {
    await open(page, '/demo/import/data-import-demo.html');
    await expect(page.locator('div[data-import] #imported-title')).toHaveText(
      '読み込まれたヘッダー',
    );
    // 読み込み中の目印は完了時に外れる。
    await expect(page.locator('div[data-import]')).not.toHaveAttribute(
      'data-importing',
      '',
    );
  });
});

test.describe('data-message', () => {
  test('宣言した段階ごとのメッセージが属性として付く', async ({page}) => {
    await open(page, '/demo/message/data-message-demo.html');
    await expect(page.locator('[data-message-level="error"]')).toHaveAttribute(
      'data-message',
      'メールアドレスが不正です',
    );
    await expect(
      page.locator('[data-message-level="warning"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-message-level="success"]'),
    ).toHaveCount(1);
  });

  test('スクリプトから付け外しできる', async ({page}) => {
    await open(page, '/demo/message/data-message-demo.html');
    const field = page.locator('#dynamic-field');
    await expect(field).not.toHaveAttribute('data-message', /./);

    await page.locator('#add-error').click();
    await expect(field).toHaveAttribute(
      'data-message',
      '電話番号の桁数が足りません',
    );
    await expect(field).toHaveAttribute('data-message-level', 'error');

    await page.locator('#clear-message').click();
    await expect(field).not.toHaveAttribute('data-message', /./);
  });
});

test.describe('data-store', () => {
  test('入力と配列を保存し、次の画面で復元して破棄できる', async ({page}) => {
    await open(page, '/demo/store/data-store-demo.html');

    await page.fill('input[name="name"]', '山田太郎');
    await page.locator('input[name="name"]').blur();
    await page.selectOption('select[name="kind"]', 'gas');
    await page.check('input[name="agreed"]');
    await page.getByRole('button', {name: '契約を2件追加'}).click();
    await expect(page.locator('#state')).toContainText('契約: 2 件');

    // 2 画面目へ進むと保存内容が復元される。
    await page.getByRole('link', {name: '2画面目へ進む'}).click();
    await page.waitForURL('**/data-store-step2-demo.html');
    await page.waitForFunction(() =>
      document.body.hasAttribute('data-haori-ready'),
    );
    const restored = page.locator('div[data-store]');
    await expect(restored).toContainText('お名前: 山田太郎');
    await expect(restored).toContainText('種別: gas');
    await expect(restored).toContainText('契約: 2 件');
    // 復元値が data-if の条件として機能する。
    await expect(page.locator('p[data-if="customer.agreed"]')).toBeVisible();
    // 入力欄へも戻る。
    await expect(page.locator('form input[name="name"]')).toHaveValue(
      '山田太郎',
    );

    // 破棄して再読み込みすると復元されない。
    await page.getByRole('button', {name: '保存内容を破棄'}).click();
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForFunction(() =>
      document.body.hasAttribute('data-haori-ready'),
    );
    await expect(page.locator('div[data-store]')).toContainText('契約: 0 件');
    await expect(page.locator('form input[name="name"]')).toHaveValue('');
  });
});

test.describe('haori:* イベント', () => {
  test('初期化・バインド変更・行操作・通信・読み込みが記録される', async ({
    page,
  }) => {
    await open(page, '/demo/event/haori-events-demo.html');
    const log = page.locator('#event-log');

    /**
     * ログに記録されたイベント名を返します。
     *
     * @returns イベント名の配列
     */
    const names = () =>
      log.locator('li').evaluateAll(items =>
        items.map(item => item.getAttribute('data-event-name')),
      );

    // 初期化完了（haori:ready）が発火し、detail にバージョンが入る。
    await expect.poll(names).toContain('ready');
    await expect(log.locator('li[data-event-name="ready"]')).toContainText(
      /"version":"\d+\.\d+\.\d+"/,
    );

    // 初期描画で行ごとに rowadd が発火する（りんご・みかんの 2 行）。
    await expect
      .poll(async () => (await names()).filter(name => name === 'rowadd').length)
      .toBeGreaterThanOrEqual(2);

    // 部分テンプレートの読み込みは表示までに発火する。
    await expect.poll(names).toContain('importstart');
    await expect.poll(names).toContain('importend');

    // フォームの双方向コミットで bindchange が発火し、表示も更新される。
    await page.fill('#message-input', 'やあ');
    await page.locator('#message-input').blur();
    await expect(page.locator('#bind-output')).toContainText('やあ');
    await expect.poll(names).toContain('bindchange');

    // data-click-bind による書き換えでも発火する。
    await page.locator('#bind-button').click();
    await expect.poll(names).toContain('bindchange');
    await expect(page.locator('#bind-output')).toContainText('更新しました');

    // 行を下へ動かすと rowmove が発火する（キーが一意な初期状態で確かめる）。
    await page.locator('.row-next').first().click();
    await expect(page.locator('.row-name').first()).toHaveText('みかん');
    await expect.poll(names).toContain('rowmove');

    // 行を追加すると一覧更新（eachupdate）と行追加（rowadd）が発火する。
    const beforeRows = (await names()).filter(name => name === 'eachupdate')
      .length;
    const beforeAdds = (await names()).filter(name => name === 'rowadd').length;
    await page.locator('.row-add').first().click();
    await expect
      .poll(async () =>
        (await names()).filter(name => name === 'eachupdate').length,
      )
      .toBeGreaterThan(beforeRows);
    await expect
      .poll(async () => (await names()).filter(name => name === 'rowadd').length)
      .toBeGreaterThan(beforeAdds);

    // 行を削除すると rowremove が発火する。
    await page.locator('.row-remove').first().click();
    await expect.poll(names).toContain('rowremove');

    // 表示の切り替えで show / hide が発火する。
    await page.uncheck('#visible-toggle');
    await expect.poll(names).toContain('hide');
    await page.check('#visible-toggle');
    await expect.poll(names).toContain('show');

    // 通信の開始と終了が発火する。
    await page.locator('#fetch-button').click();
    await expect.poll(names).toContain('fetchstart');
    await expect.poll(names).toContain('fetchend');
    await expect(page.locator('#fetch-output')).toContainText('佐藤花子');
  });
});
