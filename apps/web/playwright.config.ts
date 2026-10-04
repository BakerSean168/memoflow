import { defineConfig, devices } from '@playwright/test';
import {
  createApiServer,
  createOpenAICompatibleMockServer,
  createWebServer,
  getE2EWebOrigin,
} from './playwright.server';
import { WEB_FLOW_SPECS } from './web-flow-specs.mjs';

/**
 * Playwright 配置
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // 默认 E2E 只覆盖纯 Web 流程；desktop-web 同步回归单独放到 sync 配置里，
  // 避免日常回归被跨进程准备成本拖慢。
  testDir: './e2e',
  // 默认入口进一步收口成 AI 可依赖的核心业务回归集合。
  testMatch: WEB_FLOW_SPECS.map((spec) => `**/${spec}`),
  testIgnore: ['sync/**', 'desktop-screenshots/**', 'performance/**'],

  // 单个测试最大执行时间 (5分钟，因为需要等待 Reminder 触发)
  timeout: 5 * 60 * 1000,

  // 全局设置超时
  expect: {
    timeout: 10 * 1000, // 断言超时 10 秒
  },

  // 主流程用例会共享账号与后端状态，保持串行比追求并发更稳定。
  fullyParallel: false,
  // PR 中优先快速暴露确定性契约错误；完整覆盖由四个独立 CI shard 汇总。
  maxFailures: process.env.CI ? 5 : 0,
  retries: 0,

  // 单 worker 可以避免数据污染，也让失败更容易复现。
  workers: 1,

  // 报告配置
  reporter:
    process.env.TEST_INVENTORY_LIST === '1'
      ? [['list']]
      : process.env.CI
        ? [
            ['html', { outputFolder: 'playwright-report', open: 'always' }],
            ['json', { outputFile: 'test-results/results.json' }],
            ['junit', { outputFile: 'test-results/results.junit.xml' }],
            ['list'],
            ['github'], // GitHub Actions 集成
          ]
        : [
            ['html', { outputFolder: 'playwright-report' }],
            ['list'],
            ['json', { outputFile: 'test-results/results.json' }],
            ['junit', { outputFile: 'test-results/results.junit.xml' }],
          ],

  // 全局配置
  use: {
    // 基础 URL
    baseURL: getE2EWebOrigin(),

    // 追踪配置
    trace: 'retain-on-failure',

    // 截图配置
    screenshot: 'only-on-failure',

    video: 'retain-on-failure',

    // 浏览器上下文选项
    viewport: { width: 1280, height: 720 },
    actionTimeout: 15 * 1000, // 操作超时 15 秒
  },

  // 项目配置
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // 默认业务回归依赖真实登录和 CRUD，必须同时托管 API + Web。
  webServer: [createOpenAICompatibleMockServer(), createApiServer(), createWebServer()],
});
