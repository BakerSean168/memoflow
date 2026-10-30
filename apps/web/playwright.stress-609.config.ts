import { defineConfig, devices } from '@playwright/test';

const batch = process.env.STRESS_BATCH ?? 'dev';

export default defineConfig({
  testDir: './e2e/goal/reference',
  outputDir: 'test-results/stress-609/' + batch,
  timeout: 5 * 60 * 1000,
  fullyParallel: false,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/stress-609/' + batch + '/results.json' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:53161',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    reducedMotion: 'reduce',
    viewport: { width: 1280, height: 800 },
    actionTimeout: 15000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm exec vite --config e2e/goal/reference/vite.config.ts',
    url: 'http://127.0.0.1:53161',
    reuseExistingServer: false,
    timeout: 240000,
  },
});
