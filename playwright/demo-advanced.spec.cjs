/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// デモの操作テスト（派生値・可視行範囲・監視除外・任意 JS 実行・実行時設定）。
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

test.describe('data-derive', () => {
  test('親の選択に応じて子の候補が切り替わる', async ({page}) => {
    const errors = await open(page, '/demo/derive/data-derive-demo.html');
    const options = page.locator('#option-select option');
    // 未選択のうちは固定の先頭 option だけ。
    await expect(options).toHaveCount(1);
    await expect(page.locator('#derive-count')).toHaveText('候補の件数: 0');

    await page.selectOption('#contract-select', 'c1');
    await expect(options).toHaveCount(3);
    await expect(page.locator('#derive-count')).toHaveText('候補の件数: 2');
    await expect(options.nth(1)).toHaveText('時間帯別');

    // 別の契約に変えると候補が入れ替わる。
    await page.selectOption('#contract-select', 'c2');
    await expect(options).toHaveCount(2);
    await expect(options.nth(1)).toHaveText('暖房割引');

    // 候補が無い契約では固定 option だけに戻る。
    await page.selectOption('#contract-select', 'c3');
    await expect(options).toHaveCount(1);
    await expect(page.locator('#derive-count')).toHaveText('候補の件数: 0');
    expect(errors).toEqual([]);
  });
});

test.describe('data-each-visible', () => {
  test('スクロールすると可視行範囲の表示が追随する', async ({page}) => {
    await open(page, '/demo/each/data-each-visible-demo.html');
    const range = page.locator('#range');
    await expect(range).toContainText('読込済 15 件');
    await expect(range).toContainText('表示中: 1 -');

    const firstText = await range.innerText();
    await page.locator('#list-scroll').evaluate(element => {
      element.scrollTop = element.scrollHeight;
    });
    // 末尾までスクロールすると先頭行が 1 ではなくなる。
    await expect.poll(() => range.innerText()).not.toBe(firstText);
    await expect(range).toContainText('- 15');
  });
});

test.describe('data-external', () => {
  test('監視除外の有無で再配置時の破棄が変わる', async ({page}) => {
    await open(page, '/demo/external/data-external-demo.html');
    await expect(page.locator('#guarded-log')).toHaveText('init');
    await expect(page.locator('#plain-log')).toHaveText('init');
    // 監視除外下でも data-each による option のバインドは効く。
    await expect(page.locator('#guarded option')).toHaveCount(2);

    await page.locator('#apply').click();

    // data-external 側は移動が観測されないため適用が保たれる。
    await expect(page.locator('#guarded-log')).toHaveText('init');
    // 監視下の側は削除として観測され、破棄と再適用が走る。
    await expect(page.locator('#plain-log')).toHaveText('init destroy init');
  });
});

test.describe('data-click-run', () => {
  test('宣言から関数を呼び、this と event を受け取れる', async ({page}) => {
    const errors = await open(page, '/demo/click/data-click-run-demo.html');
    await page.locator('#count-button').click();
    await page.locator('#count-button').click();
    await expect(page.locator('#count')).toHaveText('2');

    await page.locator('#self-button').click();
    await expect(page.locator('#describe')).toHaveText(
      'this の id: self-button / event.type: click',
    );
    expect(errors).toEqual([]);
  });

  test('行ごとの値を展開して渡せる', async ({page}) => {
    await open(page, '/demo/click/data-click-run-demo.html');
    await page.locator('.pick').nth(2).click();
    await expect(page.locator('#picked')).toHaveText('選んだ行: 3 行目');
  });

  test('return false で既定動作を抑止する', async ({page}) => {
    await open(page, '/demo/click/data-click-run-demo.html');
    await page.locator('#blocked-link').click();
    await expect(page.locator('#log')).toContainText(
      'リンクの遷移を止めました',
    );
    // 遷移していないこと（クエリが付いていない）。
    expect(new URL(page.url()).search).toBe('');
  });
});

test.describe('実行時の設定', () => {
  test('data-prefix で接頭辞を変えても宣言が効く', async ({page}) => {
    const errors = await open(page, '/demo/runtime/data-prefix-demo.html');
    await expect(page.locator('#title')).toHaveText('接頭辞つきの宣言');
    await expect(page.locator('ul[haori-each] li')).toHaveCount(3);
    await expect(page.locator('#visible')).toBeVisible();
    await expect(page.locator('#hidden')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('data-dev で未解決参照の診断が出る', async ({page}) => {
    const warnings = [];
    page.on('console', message => {
      if (message.type() === 'warning') {
        warnings.push(message.text());
      }
    });
    await open(page, '/demo/runtime/data-dev-demo.html');
    // 正しい参照は表示され、書き間違いは空になる。
    await expect(page.locator('#ok')).toHaveText('正しい参照: 山田太郎');
    await expect(page.locator('#typo')).toHaveText(
      '書き間違いの参照: 「」（空になります）',
    );
    // 診断は描画完了後にまとめて出る。
    await expect
      .poll(() => warnings.filter(text => text.includes('typoKey')).length)
      .toBeGreaterThan(0);
    await expect(page.locator('#warn-log')).toContainText('typoKey');
  });
});
