// playwright.config.mjs
// デモHTMLのE2E表示確認用 Playwright 設定（ESM形式）
/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  webServer: {
    command: 'npx http-server . -p 4173',
    port: 4173,
    reuseExistingServer: true
  },
  testDir: './playwright',
  timeout: 30000,
  retries: 0,
  use: {
    headless: true,
    baseURL: 'http://localhost:4173',
  },
};
export default config;
