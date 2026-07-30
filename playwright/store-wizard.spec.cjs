/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// 受け入れ条件（実ブラウザ）: 画面をまたいで入力を持ち回るウィザードが、
// <script> を1つも書かずに成立すること（退避・復元・応答の退避・破棄）。
// 復元値が data-if の条件・data-each の配列・入力欄の初期値として機能することも確認する。
const {test, expect} = require('@playwright/test');

const STEP1 = '/playwright/store-wizard-step1.html';
const STEP2 = '/playwright/store-wizard-step2.html';

/**
 * 指定ページへ遷移し、Haori の初期化完了を待つ。
 */
async function open(page, url) {
  await page.goto(url);
  await page.waitForFunction(() =>
    document.body.hasAttribute('data-haori-ready'),
  );
}

/**
 * 遷移完了（URL 一致と初期化完了）を待つ。
 */
async function waitForPage(page, url) {
  await page.waitForURL(`**${url}`);
  await page.waitForFunction(() =>
    document.body.hasAttribute('data-haori-ready'),
  );
}

/**
 * 1画面目の入力を確定する。
 */
async function fillStep1(page) {
  await page.fill('#name', 'あかね');
  await page.selectOption('#kind', 'gas');
  await page.check('#agreed');
  // 入力の確定（change）が双方向コミットを起こし、その場でレコードへ書き出される。
  await page.waitForTimeout(200);
}

test('入力が次の画面へ持ち回られ、data-if と入力欄の初期値として機能する', async ({
  page,
}) => {
  test.setTimeout(60000);
  await open(page, STEP1);
  await fillStep1(page);

  const saved = await page.evaluate(() =>
    sessionStorage.getItem('wizardApply'),
  );
  expect(JSON.parse(saved)).toEqual({
    customer: {name: 'あかね', kind: 'gas', agreed: true},
  });

  await page.click('#next');
  await waitForPage(page, STEP2);

  expect(await page.textContent('#name')).toBe('あかね');
  expect(await page.textContent('#kind')).toBe('gas');
  // 復元値が data-if の条件として機能する。
  await expect(page.locator('#agreedMessage')).toBeVisible();
});

test('バインドと遷移が同一手続きでも応答の退避が間に合う', async ({page}) => {
  test.setTimeout(60000);
  await open(page, STEP1);

  // data-click-bind → data-click-redirect が同一手続きで走る導線。
  // 書き出しを次フレームへ遅延させていると、この保存は遷移で失われる。
  await page.click('#finish');
  await waitForPage(page, STEP2);

  expect(await page.textContent('#receiptNo')).toBe('A-1');
});

test('別画面で追加した配列が復元され data-each の行になる', async ({page}) => {
  test.setTimeout(60000);
  await open(page, STEP1);
  await fillStep1(page);
  await page.click('#next');
  await waitForPage(page, STEP2);

  await page.click('#addContract');
  await expect(page.locator('#list .row')).toHaveCount(1);

  // 戻って進み直しても、両画面が保存したキーが共存する（部分更新）。
  await page.click('#back');
  await waitForPage(page, STEP1);
  expect(await page.inputValue('#name')).toBe('あかね');
  expect(await page.inputValue('#kind')).toBe('gas');

  await page.click('#next');
  await waitForPage(page, STEP2);
  await expect(page.locator('#list .row')).toHaveCount(1);
  expect(await page.textContent('#list')).toContain('C-1');
  expect(await page.textContent('#name')).toBe('あかね');
});

test('完了で破棄すると次回の表示に復元されない', async ({page}) => {
  test.setTimeout(60000);
  await open(page, STEP1);
  await fillStep1(page);
  await page.click('#next');
  await waitForPage(page, STEP2);
  expect(await page.textContent('#name')).toBe('あかね');

  await page.click('#done');
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => sessionStorage.getItem('wizardApply')),
  ).toBeNull();

  // 破棄後に再表示しても復元されない。
  await open(page, STEP2);
  expect(await page.textContent('#name')).toBe('');
  await expect(page.locator('#agreedMessage')).toBeHidden();
  expect(
    await page.evaluate(() => sessionStorage.getItem('wizardApply')),
  ).toBeNull();
});
