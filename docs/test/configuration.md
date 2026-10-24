# 测试配置入口

本页只列“去哪里看配置”，不复述实现细节。需要理解 alias、worker、global setup、fixture 或 webServer 为什么这样配时，直接打开对应文件。

## 根入口

| 场景                 | 入口文件                                     | 说明                                                   |
| -------------------- | -------------------------------------------- | ------------------------------------------------------ |
| Vitest 工作区注册表  | [`vitest.config.ts`](../../vitest.config.ts) | 只维护 workspace projects 注册，不定义项目局部测试行为 |
| 通用共享配置         | [`vitest.shared.ts`](../../vitest.shared.ts) | 多个项目复用的 Vitest 基础配置                         |
| 项目本地 Vitest 配置 | 各项目 `vitest.config.ts`                    | 项目局部 alias、coverage、timeout、pool 的真值入口     |
| Nx 测试 target       | 各项目 `project.json`                        | 测试命令统一从 Nx target 进入                          |

## 按测试类型查看

| 测试类型              | 重点入口文件                                                                                                                                                                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web 单元测试          | [`apps/web/project.json`](../../apps/web/project.json)、[`apps/web/vitest.config.ts`](../../apps/web/vitest.config.ts)、[`apps/web/src/test/setup.ts`](../../apps/web/src/test/setup.ts)                                                                                                       |
| Web E2E               | [`apps/web/project.json`](../../apps/web/project.json)、[`apps/web/playwright.config.ts`](../../apps/web/playwright.config.ts)、[`apps/web/e2e/`](../../apps/web/e2e/)                                                                                                                         |
| Web 同步回归 E2E      | [`apps/web/project.json`](../../apps/web/project.json)、[`apps/web/playwright.sync.config.ts`](../../apps/web/playwright.sync.config.ts)、[`apps/web/e2e/sync/`](../../apps/web/e2e/sync/)                                                                                                     |
| Web 契约测试          | [`apps/web/src/mocks/handlers/`](../../apps/web/src/mocks/handlers/)、[`apps/web/src/mocks/handlers/_shared/contract-test-helpers.ts`](../../apps/web/src/mocks/handlers/_shared/contract-test-helpers.ts)                                                                                     |
| API 单元 / 应用测试   | [`apps/api/project.json`](../../apps/api/project.json)、[`apps/api/vitest.config.ts`](../../apps/api/vitest.config.ts)、[`apps/api/src/test/setup.ts`](../../apps/api/src/test/setup.ts)                                                                                                       |
| API 冒烟测试          | [`apps/api/project.json`](../../apps/api/project.json)、[`apps/api/vitest.smoke.config.ts`](../../apps/api/vitest.smoke.config.ts)、`apps/api/src/__tests__/smoke/**`                                                                                                                          |
| Task 单元测试         | [`packages/task/project.json`](../../packages/task/project.json)、[`packages/task/vitest.config.ts`](../../packages/task/vitest.config.ts)                                                                                                                                                     |
| Task 集成测试         | [`packages/task/project.json`](../../packages/task/project.json)、[`packages/task/vitest.integration.config.ts`](../../packages/task/vitest.integration.config.ts)、[`packages/task/src/__tests__/integration-global-setup.ts`](../../packages/task/src/__tests__/integration-global-setup.ts) |
| Task 性能 / Bench     | [`packages/task/project.json`](../../packages/task/project.json)、[`packages/task/vitest.performance.config.ts`](../../packages/task/vitest.performance.config.ts)                                                                                                                             |
| Desktop renderer 测试 | [`apps/desktop/project.json`](../../apps/desktop/project.json)、[`apps/desktop/vitest.config.ts`](../../apps/desktop/vitest.config.ts)                                                                                                                                                         |
| Desktop IPC 测试      | [`apps/desktop/project.json`](../../apps/desktop/project.json)、[`apps/desktop/vitest.ipc.config.ts`](../../apps/desktop/vitest.ipc.config.ts)                                                                                                                                                 |
| Desktop main 测试     | [`apps/desktop/project.json`](../../apps/desktop/project.json)、[`apps/desktop/vitest.main.config.ts`](../../apps/desktop/vitest.main.config.ts)                                                                                                                                               |

## 优先补注释的位置

以下文件最适合承接“为什么这样配”的说明：

- [`vitest.config.ts`](../../vitest.config.ts)
- 各领域包本地 `vitest.config.ts`
- [`apps/web/playwright.config.ts`](../../apps/web/playwright.config.ts)
- [`apps/web/playwright.sync.config.ts`](../../apps/web/playwright.sync.config.ts)
- [`packages/task/vitest.performance.config.ts`](../../packages/task/vitest.performance.config.ts)
- [`packages/task/src/__tests__/integration-global-setup.ts`](../../packages/task/src/__tests__/integration-global-setup.ts)
- [`apps/web/e2e/helpers/`](../../apps/web/e2e/helpers/) 与 [`apps/web/e2e/sync/helpers/`](../../apps/web/e2e/sync/helpers/)
- [`apps/desktop/vitest.config.ts`](../../apps/desktop/vitest.config.ts) 与 [`apps/desktop/vitest.ipc.config.ts`](../../apps/desktop/vitest.ipc.config.ts)

## 维护约定

- 文档只保留入口索引和边界说明。
- 配置实现一旦变化，先在对应文件注释里说明，再检查本页链接是否仍然成立。
- 不再在文档里维护 alias 顺序、插件回退策略、具体 worker 参数等实现展开。
