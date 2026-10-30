import { defineConfig } from '@playwright/test';
export default defineConfig({
  tsconfig: '../../tsconfig.workspace-src.json',
  testDir: './e2e/conversation/selection',
  testMatch: '*.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:53173',
    browserName: 'chromium',
    viewport: { width: 900, height: 720 },
    screenshot: 'only-on-failure',
  },
  outputDir: './test-results/conversation-selection',
  reporter: [['list']],
  webServer: {
    command:
      'node ../../node_modules/vite/bin/vite.js build --config e2e/conversation/selection/vite.config.ts && node ../../node_modules/vite/bin/vite.js preview --config e2e/conversation/selection/vite.config.ts',
    url: 'http://127.0.0.1:53173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
