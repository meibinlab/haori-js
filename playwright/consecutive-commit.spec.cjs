/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 間隔を空けずに続けて確定した入力値が消えないことの実ブラウザ確認。
// `data-validity` はバインド更新のたびに条件を評価し、その評価は収集値を使う。
// 収集が内部値を書き換えていると「バインドデータには載っていないのに内部値だけが
// 新しい」状態が生まれ、続く逆方向同期が古いバインドデータで入力欄を上書きして
// 値を消していた。人手より速い入力（`fill()` の連続）で踏むため実ブラウザで押さえる。
const {test, expect} = require('@playwright/test');

/** 入力する欄と値（画面の並び順）。 */
const FIELDS = [
  ['postalCode', '1000001'],
  ['municipality', '千代田区'],
  ['town', '千代田'],
  ['email', 'a@example.com'],
  ['emailConfirm', 'a@example.com'],
];

/** 消失は確率的に起きるため、報告の受け入れ条件に合わせて繰り返す。 */
const ITERATIONS = 20;

test('間隔を空けずに続けて確定した入力値が消えない', async ({page}) => {
  test.setTimeout(180000);
  const bodies = [];
  await page.route('**/api/save', async route => {
    bodies.push(route.request().postData());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
  });

  const expected = Object.fromEntries(FIELDS);
  for (let i = 0; i < ITERATIONS; i++) {
    await page.goto('/playwright/consecutive-commit-repro.html');
    await page.waitForSelector('body[data-haori-ready]');

    // 待機を挟まずに続けて確定する（人手より速い入力）。
    for (const [name, value] of FIELDS) {
      await page.locator(`[name=${name}]`).fill(value);
    }

    // 表示が入力どおりであること。
    await expect
      .poll(async () =>
        page.evaluate(() =>
          Object.fromEntries(
            Array.from(document.querySelectorAll('#f input')).map(input => [
              input.name,
              input.value,
            ]),
          ),
        ),
      )
      .toEqual(expected);

    // 収集値（送信される値）も入力どおりであること。
    bodies.length = 0;
    await page.locator('#save').click();
    await expect.poll(() => bodies.length).toBe(1);
    expect(JSON.parse(bodies[0])).toEqual({customer: expected});
  }
});
