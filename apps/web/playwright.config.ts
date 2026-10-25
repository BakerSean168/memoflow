import { defineConfig, devices } from '@playwright/test';
import {
  createApiServer,
  createOpenAICompatibleMockServer,
  createWebServer,
  getE2EWebOrigin,
} from './playwright.server';
import { WEB_SPECIALIZED_SPECS } from './web-specialized-specs.mjs';
import { WEB_AUDIT_SPECS } from './web-audit-specs.mjs';

// One Web collector; explicit modes preserve server ownership and report identity.
const mode = process.env.WEB_E2E_MODE ?? 'provider';
if (!['audit', 'provider'].includes(mode)) {
  throw new Error(`Unknown WEB_E2E_MODE: ${mode}`);
}
const inventory = process.env.TEST_INVENTORY_LIST === '1';
const specs = inventory
  ? [...WEB_AUDIT_SPECS, ...WEB_SPECIALIZED_SPECS]
  : mode === 'audit'
    ? WEB_AUDIT_SPECS
    : WEB_SPECIALIZED_SPECS;
const suffix = `-${mode === 'provider' ? 'ai-provider' : mode}`;
const result = `${mode}-results`;
const external = process.env.PLAYWRIGHT_DISABLE_WEBSERVER === 'true' || mode === 'provider';

export default defineConfig({
  testDir: './e2e',
  testMatch: specs.map((spec) => `**/${spec}`),
  outputDir: `test-results/${mode === 'provider' ? 'ai-provider' : mode}`,
  timeout: 5 * 60 * 1000,
  expect: { timeout: mode === 'provider' ? 15_000 : 10_000 },
  fullyParallel: false,
  maxFailures: 0,
  retries: 0,
  failOnFlakyTests: Boolean(process.env.CI),
  workers: 1,
  reporter: inventory
    ? [['list']]
    : [
        [
          'html',
          {
            outputFolder: `playwright${suffix}-report`,
            open: 'never',
          },
        ],
        [
          'json',
          {
            outputFile: `test-results/${result}.json`,
          },
        ],
        ['junit', { outputFile: `test-results/${result}.junit.xml` }],
        ['list'],
        ...(process.env.CI ? [['github'] as const] : []),
      ],
  use: {
    baseURL: getE2EWebOrigin(),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: mode === 'provider' ? 800 : 720 },
    actionTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: external
    ? undefined
    : [createOpenAICompatibleMockServer(), createApiServer(), createWebServer()],
});
