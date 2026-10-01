/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 祖先の data-fetch の応答で、配下の data-fetch が data-url-param の取り込みより先に
// 走らないことの実ブラウザ確認。祖先の応答は配下を走査する前に届くため、再評価が
// 未走査の配下まで降りると、URL のクエリが入る前の空の条件で 1 回余分に取得する。
// 期待値の根拠は仕様「`data-fetch`」の「再評価の対象は、走査（初期化）を済ませた
// 要素だけです」と、仕様「`data-url-param`」の「配下の取得は、取り込みの後に走ります」。
const {test, expect} = require('@playwright/test');

test.describe('祖先の取得と data-url-param（実ブラウザ）', () => {
  test('配下の取得は、URL のクエリを取り込んだ条件で 1 回だけ走る', async ({
    page,
  }) => {
    const requests = [];
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) {
        requests.push(url.pathname + url.search);
      }
    });
    // どちらの応答も遅らせる（利用側で起きた構成と同じ）。
    await page.route('**/api/auth.json', async route => {
      await new Promise(resolve => setTimeout(resolve, 100));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"id":1}',
      });
    });
    await page.route('**/api/list.json*', async route => {
      await new Promise(resolve => setTimeout(resolve, 100));
      const name = new URL(route.request().url()).searchParams.get('name');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({label: `一覧: ${name}`}),
      });
    });

    await page.goto('/playwright/ancestor-fetch-url-param-repro.html?name=foo');
    await expect(page.locator('#list')).toHaveText('一覧: foo');
    // 余分な取得が後から走らないことも見る。
    await page.waitForTimeout(500);

    expect(requests).toEqual(['/api/auth.json', '/api/list.json?name=foo']);
  });
});
