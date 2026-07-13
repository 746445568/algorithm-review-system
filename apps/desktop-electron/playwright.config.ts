import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: ['**/browser-extension.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'playwright-results.xml' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5180',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  projects: [
    { name: 'chromium', use: { ...{ viewport: { width: 1460, height: 920 } } } },
  ],
})
