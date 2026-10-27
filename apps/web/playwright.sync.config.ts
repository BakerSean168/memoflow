import { defineConfig, devices } from '@playwright/test';
import {
  createApiServer,
  createPowerSyncTestServer,
  createWebServer,
  getE2EWebOrigin,
} from './playwright.server';
import { configurePowerSyncTestEnv } from './e2e/helpers/powersync-test-env';

const mode = process.env.NATIVE_E2E_MODE ?? 'sync';
if (!['sync', 'shell', 'capture'].includes(mode))
  throw new Error(`Unknown NATIVE_E2E_MODE: ${mode}`);
if (mode === 'sync') configurePowerSyncTestEnv();
const inventory = process.env.TEST_INVENTORY_LIST === '1';

export default defineConfig({
  tsconfig: '../../tsconfig.workspace-src.json',
  testDir: './e2e',
  testMatch: inventory
    ? ['**/sync/*.spec.ts', '**/shell/*.spec.ts', '**/desktop-screenshots/*.spec.ts']
    : mode === 'sync'
      ? ['**/sync/*.spec.ts']
      : mode === 'shell'
        ? ['**/shell/*.spec.ts']
        : ['**/desktop-screenshots/*.spec.ts'],
  timeout: 5 * 60 * 1000,
  // Sync 回归会同时驱动 API、Web 和 desktop，串行执行更容易定位跨端状态问题。
  fullyParallel: false,
  retries: 0,
  workers: 1,
  expect: {
    timeout: 30 * 1000,
  },
  reporter: process.env.CI
    ? [
        [
          'html',
          {
            outputFolder: `playwright-${mode === 'capture' ? 'desktop-screenshot' : mode}-report`,
            open: 'never',
          },
        ],
        ['json', { outputFile: `test-results/${mode}-results.json` }],
        ['list'],
        ['github'],
      ]
    : [
        [
          'html',
          { outputFolder: `playwright-${mode === 'capture' ? 'desktop-screenshot' : mode}-report` },
        ],
        ['json', { outputFile: `test-results/${mode}-results.json` }],
        ['list'],
      ],
  // 先准备 desktop 可执行入口，避免每个用例重复 build。
  globalSetup:
    mode === 'shell'
      ? './e2e/shell/global-setup.ts'
      : './e2e/helpers/desktop-build-global-setup.ts',
  use: {
    baseURL: getE2EWebOrigin(),
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15 * 1000,
  },
  projects: [
    {
      name: 'sync-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // 先拉起 API，再拉起依赖该 API 的 Web dev server。这样 sync 用例和开发时
  // 通过代理访问后端的路径保持一致。
  webServer:
    mode === 'shell'
      ? undefined
      : mode === 'capture'
        ? [createApiServer()]
        : [
            {
              ...createPowerSyncTestServer(),
            },
            {
              ...createApiServer(),
            },
            {
              ...createWebServer(),
            },
          ],
});
