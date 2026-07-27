/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
// data-each と data-if の組み合わせでページネーションが壊れないことを確認する。
const {test, expect} = require('@playwright/test');

test.describe('data-each pagination repro', () => {
  test('開発中ソースでページネーションが表示される', async ({page}) => {
    const pageErrors = [];
    const consoleErrors = [];

    page.on('pageerror', error => pageErrors.push(error));
    page.on('console', message => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    await page.goto('/demo/each/data-each-pagination-repro.html');

    await expect(page.locator('#project-list tbody tr')).toHaveCount(2);
    await expect(
      page.locator('#pagination-nav .page-item.active span.page-link[aria-current="page"]'),
    ).toBeVisible();

    const visiblePageLinks = await page.locator('#pagination-nav .page-item .page-link:visible').count();
    expect(visiblePageLinks).toBeGreaterThan(0);

    await expect(
      page.locator('#pagination-nav .page-item:not(.active) button.page-link:visible').first(),
    ).toBeVisible();

    // 0 件時は data-each の行テンプレートが行スコープ無しで評価されるため、
    // 行スコープのキーが未解決参照になる。取得後は解決されるため無視する。
    const ignorableExpressionErrors = [
      /not in the binding data: ellipsis/,
      /not in the binding data: active/,
      /not in the binding data: label/,
      /not in the binding data: projectName/,
      /not in the binding data: unitPrice/,
      /not in the binding data: startPeriod/,
    ];
    const unexpectedPageErrors = pageErrors.filter(error => {
      return !ignorableExpressionErrors.some(pattern => pattern.test(error.message));
    });
    const unexpectedConsoleErrors = consoleErrors.filter(message => {
      return !ignorableExpressionErrors.some(pattern => pattern.test(message));
    });

    expect(unexpectedPageErrors, `JS errors: ${unexpectedPageErrors.map(error => error.message).join('\n')}`).toEqual([]);
    expect(unexpectedConsoleErrors, `Console errors: ${unexpectedConsoleErrors.join('\n')}`).toEqual([]);
  });
});