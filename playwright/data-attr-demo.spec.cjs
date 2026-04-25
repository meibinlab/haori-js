/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// data-attr デモの動作と raw 属性保持を確認する Playwright テスト
const { test, expect } = require('@playwright/test');

/**
 * page error と console error を収集します。
 *
 * @param {import('@playwright/test').Page} page Playwright の page
 * @returns {{pageErrors: Error[], consoleErrors: string[]}} 収集先オブジェクト
 */
function collectRuntimeErrors(page) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error));
  page.on('console', message => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  return {pageErrors, consoleErrors};
}

test.describe('data-attr デモ', () => {
  test('画像切り替えと DOM 表示が正しく動作する', async ({ page }) => {
    const {pageErrors, consoleErrors} = collectRuntimeErrors(page);

    await page.goto('/demo/index.html');

    const previewSection = page.locator('#demo1attr');
    const previewImage = previewSection.locator('img.attr-preview-image');
    const previewLabel = previewSection.locator('.attr-preview-meta p').first();

    // 初期状態で data-attr-* による属性反映が行われること。
    await expect(previewSection).toBeVisible();
    await expect(previewLabel).toContainText('green');
    const initialImageSource = await previewImage.getAttribute('src');
    expect(initialImageSource).not.toBeNull();

    // 画像キー変更で data-attr-src の反映先が切り替わること。
    await page.selectOption('#previewSelector', 'orange');
    await expect(previewLabel).toContainText('orange');
    const nextImageSource = await previewImage.getAttribute('src');
    expect(nextImageSource).not.toBe(initialImageSource);

    // DOM 表示に data-attr-* の記法が含まれること。
    await previewSection.getByRole('button', {name: 'DOMを表示'}).click();
    const domViewer = page.locator('#dom-demo1attr');
    await expect(domViewer).toBeVisible();
    await expect(domViewer).toContainText('data-attr-src="{{previews[currentPreview]}}"');
    await expect(domViewer).toContainText('data-attr-value');

    // 操作全体を通して runtime error が出ていないこと。
    expect(pageErrors, `JS errors: ${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `Console errors: ${consoleErrors.join('\n')}`).toEqual([]);
  });
});