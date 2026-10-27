import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  tsconfig: './tsconfig.playwright.json',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 2 * 60 * 1000,
  expect: {
    timeout: 30 * 1000,
  },
  reporter:
    process.env.TEST_INVENTORY_LIST === '1'
      ? [['list']]
      : process.env.CI
        ? [
            ['list'],
            ['json', { outputFile: 'test-results/results.json' }],
            ['junit', { outputFile: 'test-results/results.junit.xml' }],
          ]
        : [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
