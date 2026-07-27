/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, window, document, HTMLInputElement */
// 回帰ガード（実ブラウザ）: バインドに無い識別子が window 経由で解決されないこと。
// jsdom には window の named access（id 由来）が無いため実ブラウザでのみ再現する。
// 退行時はケースAの入力欄へ [object HTMLInputElement] / window.name の値が入り、
// required の必須検証も通ってしまう。
const {test, expect} = require('@playwright/test');

test('バインドに無い識別子が同名 id の要素や window プロパティへ解決されない', async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors = [];
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });

  await page.goto('/playwright/named-access-shadowing-repro.html');
  await page.waitForFunction(() => typeof window.Haori !== 'undefined');
  await page.waitForTimeout(500);

  // 参考: named access が実際に効いている環境であることを確認する
  // （効いていない環境ではこのテスト自体が退行を検出できない）。
  const namedAccessWorks = await page.evaluate(
    () => window.agencyCode instanceof HTMLInputElement,
  );
  expect(namedAccessWorks, 'window の named access が有効な環境である').toBe(
    true,
  );

  const state = await page.evaluate(() => {
    const value = id => document.getElementById(id).value;
    const valid = id => document.getElementById(id).checkValidity();
    return {
      aValue: value('agencyCode'),
      aValid: valid('agencyCode'),
      nameValue: value('nameField'),
      nameValid: valid('nameField'),
      outA: document.getElementById('outA').textContent.trim(),
      bValue: value('agencyCodeB'),
      bValid: valid('agencyCodeB'),
      cValue: value('agencyCodeC'),
      outD: document.getElementById('outD').textContent.trim(),
    };
  });

  // ケースA: 要素オブジェクトも window.name も入らず、必須検証が働く。
  expect(state.aValue, '同名 id の要素へ解決しない').toBe('');
  expect(state.aValid, '未入力として必須検証が働く').toBe(false);
  expect(state.nameValue, 'window.name へ解決しない').toBe('');
  expect(state.nameValid, 'window.name でも必須検証が働く').toBe(false);
  expect(state.outA, 'テキスト補間でも要素を描画しない').toBe('');

  // ケースB: バインドで宣言したキーは従来どおり反映される。
  expect(state.bValue, 'バインド値が優先される').toBe('A-1');
  expect(state.bValid, 'バインド値があれば必須検証を通る').toBe(true);

  // ケースC: ?? のフォールバックは従来どおり効く。
  expect(state.cValue, '?? のフォールバックが効く').toBe('FB');

  // ケースD: 標準組み込みは従来どおり参照できる。
  expect(state.outD, 'Math などの標準組み込みは使える').toBe('9');

  // 原因を追えるよう、識別子名を含むエラーログが出る。
  const joined = errors.join('\n');
  expect(joined, 'エラーログに識別子名が含まれる').toContain('agencyCode');
});
