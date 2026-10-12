import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_WEB_BASE_URL ?? 'http://127.0.0.1:4175';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/ai/provider-onboarding.spec.ts', '**/ai/provider-composer-states.spec.ts'],
  outputDir: 'test-results/ai-provider',
  timeout: 3 * 60 * 1000,
  expect: { timeout: 15 * 1000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { outputFolder: 'playwright-ai-provider-report', open: 'never' }], ['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 800 },
    actionTimeout: 15 * 1000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
