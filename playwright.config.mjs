// playwright.config.mjs
// デモHTMLのE2E表示確認用 Playwright 設定（ESM形式）
/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  webServer: {
    command: 'npm run build && npx http-server . -p 4273',
    port: 4273,
    reuseExistingServer: false
  },
  testDir: './playwright',
  timeout: 30000,
  retries: 0,
  use: {
    headless: true,
    baseURL: 'http://localhost:4273',
  },
};
export default config;
