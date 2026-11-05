import { defineConfig } from '@playwright/test';
export default defineConfig({
  tsconfig: '../../tsconfig.workspace-src.json',
  testDir: './e2e/ai/runtime-permissions', testMatch: '*.spec.ts',
  workers: 1, retries: 0, timeout: 90_000,
  use: { baseURL: 'http://127.0.0.1:4861', browserName: 'chromium', viewport: { width: 1000, height: 850 }, trace: 'on' },
  outputDir: process.env.RUNTIME_PERMISSION_EVIDENCE_DIR ? `${process.env.RUNTIME_PERMISSION_EVIDENCE_DIR}/playwright-results` : './test-results/runtime-permissions', reporter: [['list']],
  webServer: { command: 'node ../../node_modules/vite/bin/vite.js --config e2e/ai/runtime-permissions/vite.config.ts', url: 'http://127.0.0.1:4861/__runtime/state', reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
