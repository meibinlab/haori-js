/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, window, document */
// CSP モード（既定）の実ブラウザ確認。jsdom は CSP を強制しないため、
// 'unsafe-eval' の無い CSP を付けたページで、式・一覧・条件・属性・run 系・取得が
// 動き、CSP の違反が起きないことをここで確かめる。期待値の根拠は仕様「CSP モード」
// 「CSP モードの式評価」「登録した関数（`Haori.handlers`）」「CSP モードでの `*-run`」。
const {test, expect} = require('@playwright/test');

/**
 * ページを開き、CSP の違反とコンソールの error を集め始めます。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @param {string} url 開く URL
 * @returns {Promise<{errors: string[]}>} コンソールの error の記録
 */
async function open(page, url) {
  const errors = [];
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', event => {
      window.__violations.push(
        `${event.effectiveDirective} ${event.blockedURI} ${event.sample}`,
      );
    });
  });
  await page.goto(url);
  await page.waitForSelector('body[data-haori-ready]');
  return {errors};
}

/**
 * これまでに起きた CSP の違反を返します。
 *
 * @param {import('@playwright/test').Page} page 対象ページ
 * @returns {Promise<string[]>} 違反の記録
 */
function violations(page) {
  return page.evaluate(() => window.__violations);
}

test.describe('CSP モード', () => {
  test('data-csp を書かない既定のまま、式・一覧・条件・属性が CSP の違反なしに描画される', async ({
    page,
  }) => {
    await open(page, '/playwright/csp-mode-repro.html');
    await expect(page.locator('#title')).toHaveText('一覧');
    await expect(page.locator('#list .name')).toHaveText(['りんご', 'みかん']);
    // data-if は在庫のある行だけを表示する。
    await expect(page.locator('#list .stock').first()).toHaveText('3');
    await expect(page.locator('#list .stock').nth(1)).toBeHidden();
    await expect(page.locator('#list li').first()).toHaveClass('in');
    await expect(page.locator('#list li').nth(1)).toHaveClass('out');
    await expect(page.locator('#loaded-name')).toHaveText('取得した値');
    expect(await violations(page)).toEqual([]);
  });

  test('登録した関数を -handler と -args で呼べる', async ({page}) => {
    await open(page, '/playwright/csp-mode-repro.html');
    await page.locator('#list .pick').nth(1).click();
    await expect(page.locator('#picked')).toHaveText('2:みかん');
    expect(await violations(page)).toEqual([]);
  });

  test('式で書いた run を評価できる', async ({page}) => {
    await open(page, '/playwright/csp-mode-repro.html');
    await page.locator('#expression-run').click();
    await expect(page.locator('#recorded')).toHaveText('一覧');
    expect(await violations(page)).toEqual([]);
  });

  test('data-attr-style は style-src の inline 指定が無いと止まるが、data-if の非表示は止まらない', async ({
    page,
  }) => {
    await open(page, '/playwright/csp-mode-style-repro.html');
    await expect(page.locator('#hidden')).toBeHidden();
    expect(await violations(page)).toEqual(['style-src-attr inline ']);
  });

  test('対照: 従来の方式（data-csp="false"）では式が評価できず、CSP モードを案内する', async ({
    page,
  }) => {
    const {errors} = await open(page, '/playwright/csp-mode-legacy-repro.html');
    await expect(page.locator('#title')).toHaveText('');
    expect(
      errors.filter(message => message.includes('data-csp="false"')),
    ).toHaveLength(1);
    expect(
      (await violations(page)).some(entry => entry.startsWith('script-src')),
    ).toBe(true);
  });
});
