// 調査用 Playwright 設定: 既存サーバを再利用し再ビルドしない（高速反復用）。
/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  webServer: {
    command: 'npx http-server . -p 4273 -c-1',
    port: 4273,
    reuseExistingServer: true,
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
