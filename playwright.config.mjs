// playwright.config.mjs
// デモHTMLのE2E表示確認用 Playwright 設定（ESM形式）
/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  webServer: {
    // ローカルでは dist の作り忘れを防ぐためビルドしてから配信する。CI は直前の
    // ビルドステップの成果物を使うので、二重ビルドを避けて配信だけを行う。
    command: process.env.CI
      ? 'npx http-server . -p 4273'
      : 'npm run build && npx http-server . -p 4273',
    port: 4273,
    reuseExistingServer: false
  },
  testDir: './playwright',
  timeout: 30000,
  retries: 0,
  use: {
    headless: true,
    baseURL: 'http://localhost:4273',
    // まれにしか落ちないテストの原因を追えるよう、失敗したときだけ記録を残す
    // （`test-results/` に出る。成功した実行では残さない）。
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
};
export default config;
