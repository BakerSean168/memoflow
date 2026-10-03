import { defineConfig } from '@playwright/test';

// Isolated production components + service doubles. Never starts or mutates a database.
export default defineConfig({
  testDir: './e2e/goal/reference',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:53161', browserName: 'chromium', reducedMotion: 'reduce' },
  snapshotPathTemplate: '../../reports/test-system-v2/goal-reference/{testName}/{arg}{ext}',
  outputDir: './test-results/goal-reference',
  reporter: [
    ['list'],
    ['html', { outputFolder: '../../reports/test-system-v2/goal-reference/html', open: 'never' }],
  ],
  webServer: {
    command:
      'node ../../node_modules/vite/bin/vite.js build --config e2e/goal/reference/vite.config.ts && node ../../node_modules/vite/bin/vite.js preview --config e2e/goal/reference/vite.config.ts',
    url: 'http://127.0.0.1:53161',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
