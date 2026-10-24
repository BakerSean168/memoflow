import { defineConfig, devices } from '@playwright/test';
import {
  createApiServer,
  createOpenAICompatibleMockServer,
  createWebServer,
  getE2EWebOrigin,
} from './playwright.server';
import { WEB_FLOW_SPECS } from './web-flow-specs.mjs';
import { WEB_AUDIT_SPECS } from './web-audit-specs.mjs';

// One Web collector; explicit modes preserve server ownership and report identity.
const mode = process.env.WEB_E2E_MODE ?? 'flow';
if (!['flow', 'audit', 'workspace', 'provider'].includes(mode)) {
  throw new Error(`Unknown WEB_E2E_MODE: ${mode}`);
}
const providerSpecs = ['ai/provider-onboarding.spec.ts', 'ai/provider-composer-states.spec.ts'];
const inventory = process.env.TEST_INVENTORY_LIST === '1';
const specs = inventory
  ? [...WEB_FLOW_SPECS, ...WEB_AUDIT_SPECS, ...providerSpecs]
  : mode === 'audit'
    ? [...WEB_FLOW_SPECS, ...WEB_AUDIT_SPECS]
    : mode === 'workspace'
      ? WEB_FLOW_SPECS.filter((spec) => spec.startsWith('ai/goal-workflow/'))
      : mode === 'provider'
        ? providerSpecs
        : WEB_FLOW_SPECS;
const suffix =
  mode === 'flow'
    ? ''
    : `-${mode === 'workspace' ? 'ai-workspace' : mode === 'provider' ? 'ai-provider' : mode}`;
const result =
  mode === 'flow' ? 'results' : mode === 'workspace' ? 'ai-workspace-results' : `${mode}-results`;
const external = process.env.PLAYWRIGHT_DISABLE_WEBSERVER === 'true' || mode === 'provider';

export default defineConfig({
  testDir: './e2e',
  testMatch: specs.map((spec) => `**/${spec}`),
  outputDir:
    mode === 'workspace'
      ? (process.env.AI_WORKSPACE_E2E_OUTPUT_DIR ?? 'test-results/ai-workspace')
      : mode === 'provider'
        ? 'test-results/ai-provider'
        : `test-results/${mode}`,
  timeout: 5 * 60 * 1000,
  expect: { timeout: mode === 'provider' ? 15_000 : 10_000 },
  fullyParallel: false,
  maxFailures: process.env.CI && mode === 'flow' ? 5 : 0,
  retries: 0,
  failOnFlakyTests: Boolean(process.env.CI),
  workers: 1,
  reporter: inventory
    ? [['list']]
    : [
        [
          'html',
          {
            outputFolder:
              process.env.AI_WORKSPACE_E2E_HTML_REPORT_DIR && mode === 'workspace'
                ? process.env.AI_WORKSPACE_E2E_HTML_REPORT_DIR
                : `playwright${suffix}-report`,
            open: 'never',
          },
        ],
        [
          'json',
          {
            outputFile:
              mode === 'workspace'
                ? (process.env.AI_WORKSPACE_E2E_JSON_REPORT_FILE ?? `test-results/${result}.json`)
                : `test-results/${result}.json`,
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
