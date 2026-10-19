import { defineConfig, devices } from '@playwright/test';
import { createApiServer, createWebServer, getE2EWebOrigin } from './playwright.server';

// `web:e2e:ai-workspace` starts Vite outside Playwright on Windows to avoid
// flaky webServer teardown; keep the opt-in switch for direct config usage.
// Residual 1337: when the external runner owns servers it sets
// PLAYWRIGHT_DISABLE_WEBSERVER=true and also starts the e2e API.
const shouldManageWebServer = process.env.PLAYWRIGHT_DISABLE_WEBSERVER !== 'true';
const aiWorkspaceOutputDir = process.env.AI_WORKSPACE_E2E_OUTPUT_DIR ?? 'test-results/ai-workspace';
const aiWorkspaceHtmlReportDir =
  process.env.AI_WORKSPACE_E2E_HTML_REPORT_DIR ?? 'playwright-ai-workspace-report';
const aiWorkspaceJsonReportFile =
  process.env.AI_WORKSPACE_E2E_JSON_REPORT_FILE ?? 'test-results/ai-workspace-results.json';

export default defineConfig({
  testDir: './e2e',
  outputDir: aiWorkspaceOutputDir,
  testMatch: ['**/ai/goal-workflow/*.spec.ts'],
  timeout: 5 * 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  fullyParallel: false,
  retries: 0,
  failOnFlakyTests: Boolean(process.env.CI),
  workers: 1,
  reporter: process.env.CI
    ? [
        ['html', { outputFolder: aiWorkspaceHtmlReportDir, open: 'always' }],
        ['json', { outputFile: aiWorkspaceJsonReportFile }],
        ['list'],
        ['github'],
      ]
    : [
        ['html', { outputFolder: aiWorkspaceHtmlReportDir }],
        ['list'],
        ['json', { outputFile: aiWorkspaceJsonReportFile }],
      ],
  use: {
    baseURL: getE2EWebOrigin(),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
    actionTimeout: 15 * 1000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Residual 1337: AI SSE is mocked in-spec, but bootstrap still uses real register/login.
  // When Playwright owns servers, start API + Web. The external runner owns both when disabled.
  webServer: shouldManageWebServer
    ? [createApiServer(), createWebServer(`${getE2EWebOrigin()}/`)]
    : undefined,
});
