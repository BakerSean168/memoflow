import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/schedule/presentation-authority',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:53181',
    browserName: 'chromium',
    reducedMotion: 'reduce',
  },
  snapshotPathTemplate:
    '../../reports/test-system-v2/schedule-presentation-authority/baselines/{testName}/{arg}{ext}',
  outputDir: './test-results/schedule-presentation-authority',
  reporter: [['list']],
  webServer: {
    command:
      'node ../../node_modules/vite/bin/vite.js build --config e2e/schedule/presentation-authority/vite.config.ts && node ../../node_modules/vite/bin/vite.js preview --config e2e/schedule/presentation-authority/vite.config.ts',
    url: 'http://127.0.0.1:53181',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
