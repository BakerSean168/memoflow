import { defineConfig, devices } from '@playwright/test';

const webOrigin = process.env.E2E_WEB_BASE_URL;
const apiOrigin = process.env.E2E_API_BASE_URL;

if (!webOrigin || !apiOrigin) {
  throw new Error(
    'Local Docker Playwright requires E2E_WEB_BASE_URL and E2E_API_BASE_URL from the runtime profile runner.',
  );
}

export default defineConfig({
  testDir: './e2e',
  testMatch: [
    '**/authentication/auth-flow.spec.ts',
    '**/authentication/auth-login.spec.ts',
    '**/authentication/auth-password.spec.ts',
    '**/authentication/auth-register.spec.ts',
    '**/goal/goal-crud.spec.ts',
    '**/local-docker/core-product-phase-*.spec.ts',
  ],
  globalSetup: './e2e/local-docker/global-setup.ts',
  timeout: 5 * 60 * 1000,
  expect: { timeout: 15 * 1000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['html', { outputFolder: 'playwright-local-docker-report', open: 'never' }],
    ['json', { outputFile: 'test-results/local-docker/results.json' }],
    ['list'],
  ],
  use: {
    baseURL: webOrigin,
    viewport: { width: 1280, height: 720 },
    timezoneId: 'Asia/Shanghai',
    actionTimeout: 15 * 1000,
    navigationTimeout: 30 * 1000,
    trace: 'on',
    screenshot: 'on',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-local-docker',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
