import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8123',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // 现有用例断言中文文案；英文用例在文件内用 test.use({ locale: 'en-US' }) 覆盖
    locale: process.env.PW_LOCALE || 'zh-CN',
    // 本地可复用系统 Edge，避免下载 Chromium：$env:PW_CHANNEL='msedge'; npm test
    channel: process.env.PW_CHANNEL || undefined,
  },
  webServer: {
    command: 'node tests/server.mjs',
    url: 'http://127.0.0.1:8123/newtab.html',
    reuseExistingServer: true,
    timeout: 20_000,
  },
});
