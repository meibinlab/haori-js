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

    const ignorableExpressionErrors = [
      /Expression evaluation error: ellipsis/,
      /Expression evaluation error: !ellipsis && p === number/,
      /Expression evaluation error: !ellipsis && p !== number/,
      /Expression evaluation error: ellipsis \? 'disabled' : p === number \? 'active' : ''/,
      /Expression evaluation error: projectName/,
      /Expression evaluation error: unitPrice/,
      /Expression evaluation error: startPeriod/,
      /Expression evaluation error: p \+ 1/,
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