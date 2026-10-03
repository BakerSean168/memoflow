import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e/visual-regression',
  testMatch: 'matrix.spec.ts',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:53191',
    browserName: 'chromium',
    timezoneId: 'UTC',
    locale: 'en-US',
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
  },
  expect: { toHaveScreenshot: { animations: 'disabled', maxDiffPixels: 0 } },
  snapshotPathTemplate: '{testDir}/baselines/{arg}{ext}',
  outputDir: './test-results/visual-regression',
  reporter: [['list']],
  webServer: {
    env: { ...process.env, RAYON_NUM_THREADS: '2' },
    command:
      'node ../../node_modules/vite/bin/vite.js build --config e2e/visual-regression/vite.config.ts && node ../../node_modules/vite/bin/vite.js preview --config e2e/visual-regression/vite.config.ts',
    url: 'http://127.0.0.1:53191',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
