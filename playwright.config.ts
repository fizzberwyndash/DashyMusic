import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: '.playwright/results',
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  expect: { timeout: 7000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8081',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (process.platform === 'linux' ? '/usr/bin/chromium' : undefined),
      args: ['--no-sandbox'],
    },
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    // This tests the iPhone layout in Chromium. It is not a native iOS or Safari test.
    { name: 'iphone-layout-chromium', use: { ...devices['iPhone 14'], defaultBrowserType: 'chromium' } },
    { name: 'iphone-se-layout-chromium', use: { ...devices['iPhone SE'], defaultBrowserType: 'chromium' } },
  ],
});
