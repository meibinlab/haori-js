/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, window */
// `data-each` コンテナに要素の子が 2 つ以上ある構成で、実ブラウザでも開発モードの
// 警告が出ることと、2 つめ以降の子が行に入らないことの確認。期待値は仕様
// 「`data-each`」の配置ルールの「誤り: 要素の子を 2 つ以上並べる … **最初の要素の
// 子だけがテンプレートになり、2 つめ以降は行に入りません。**」から取っている。
//
// 単体テスト（tests/each-container-diagnostics.test.ts）は jsdom で判定内容を
// 固定している。こちらは、この診断が助けになる相手（ブラウザで画面を組む利用者）
// の環境で実際に出ることを確かめる。警告はフラグメントの子を数えて出すため、
// フラグメント木の組み立て順が jsdom と違っても出ることを見る必要がある。
const {test, expect} = require('@playwright/test');

test.describe('data-each コンテナの要素の子が 2 つ以上', () => {
  test('警告が出て、2 つめの子は行に入らない', async ({page}) => {
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.goto('/playwright/each-extra-children-repro.html');
    await page.waitForFunction(() => typeof window.__count === 'function');
    await page.waitForFunction(
      () => window.__count('good').inputs === 2,
      undefined,
      {timeout: 10000},
    );

    // 誤った形: 入力欄は行の数だけ増えるが、button は行に入らないので 1 個のまま。
    const bad = await page.evaluate(() => window.__count('bad'));
    expect(bad.inputs).toBe(2);
    expect(bad.buttons).toBe(1);

    // 正しい形: 行ごとに入力欄と button が揃う。
    const good = await page.evaluate(() => window.__count('good'));
    expect(good.inputs).toBe(2);
    expect(good.buttons).toBe(2);

    // 開発モードの警告が誤った形にだけ出る（コンテナは 2 つあるが 1 件）。
    const warnings = await page.evaluate(() =>
      window.__logs.warn.filter(message =>
        message.includes('要素の子が 2 つ以上あります'),
      ),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('data-each="rows"');
    expect(warnings[0]).toContain('button');
  });

  test('誤った形では行削除が失敗し、正しい形では成功する', async ({page}) => {
    page.on('pageerror', error => console.log('[pageerror]', error.message));
    await page.goto('/playwright/each-extra-children-repro.html');
    await page.waitForFunction(() => typeof window.__count === 'function');
    await page.waitForFunction(
      () => window.__count('good').inputs === 2,
      undefined,
      {timeout: 10000},
    );

    // 仕様の「行操作（`data-{event}-row-*`）のボタンは行に属さないため
    // `Row fragment not found.` で失敗します」。
    await page.evaluate(() => window.__remove('bad'));
    await page.waitForFunction(
      () =>
        window.__logs.error.some(message =>
          message.includes('Row fragment not found.'),
        ),
      undefined,
      {timeout: 10000},
    );
    expect(await page.evaluate(() => window.__count('bad').inputs)).toBe(2);

    // 正しい形は行が減る。
    await page.evaluate(() => window.__remove('good'));
    await page.waitForFunction(
      () => window.__count('good').inputs === 1,
      undefined,
      {timeout: 10000},
    );
  });
});
