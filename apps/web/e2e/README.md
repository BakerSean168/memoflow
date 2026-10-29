# Web E2E

`apps/web/e2e` 只存放 Web 端到端测试本身与少量测试辅助代码。运行入口、测试分层和全仓库测试策略统一以 [`docs/internals/testing/`](../../../docs/internals/testing/README.md) 为准，这里不再重复维护一套厚文档。

## 目录边界

- `e2e/**`：Web 端到端测试源码；其中默认 `web:e2e` 只跑核心业务回归
- `e2e/sync/**`：desktop-web 同步回归
- `e2e/helpers/**`：传统 Web E2E 通用 helper
- `e2e/sync/helpers/**`：sync 专用 helper
- `e2e/config.ts`：常规 E2E 的 URL、超时、测试账号常量

## 运行入口

统一从 Nx target 进入：

```bash
pnpm nx run web:e2e
pnpm nx run web:e2e:ui
pnpm nx run web:e2e:sync
pnpm nx run web:e2e:report
```

更细的调试参数优先通过 `web:e2e` 或 `web:e2e:sync` 传递，而不是把裸 `playwright test` 写成主文档入口。

## 默认回归范围

默认 Web Flow 的唯一清单真值是 [`apps/web/web-flow-specs.mjs`](../web-flow-specs.mjs)。CI 每个 shard 由 `tools/test-system-v2/run-web-shard.mjs` 用 `web-spec-durations.json` 现场计算确定性的 LPT 分片（没有静态 shard 清单）。README 不再复制一份容易过期的 spec 列表。

`tools/test-system-v2/__tests__/web-shards.test.mjs` 会同时校验：canonical spec 必须真实存在、按 CI matrix 计算的分片与 canonical 清单一致（无遗漏、无重复）、duration history 不得保留已经退休的 spec。

AI Goal Workflow 旅程拆分在 `ai/goal-workflow/*.spec.ts`，共享路由 mock 与会话引导位于 `ai/goal-workflow/goal-workflow.fixture.ts`；每个测试都自注册用户，彼此独立。

## 已登录业务 spec 的会话与数据

普通业务 spec 从 [`helpers/fixtures.ts`](./helpers/fixtures.ts) 导入 `test`，不要在每个 `beforeEach` 里重新走注册 UI：

- `workerAccount`：每个 Playwright worker 通过 `helpers/auth-api.ts` 的 API 路径建一个已邮箱验证的账号，storageState 写在仓库外的 runner 临时目录（`os.tmpdir()/memoflow-e2e-auth/run-<runner pid>/worker-<n>.json`，`0600`）。该文件含凭据，因此不能放进 `test-results/`（Nightly 会整目录上传失败证据），更不能进 Git。
- `context`/`page`：仍由 Playwright 创建，每个用例一个独立 BrowserContext，只是 `storageState` 指向上面的 worker 文件。
- `testData`：每个用例一个随机 `key`；`name()` 生成带 key 的记录名，`seedGoal`/`seedTaskPlan` 建的数据在 fixture teardown（含用例失败）按逆序删除；`resetPreferences`/`resetAccountProfile` 把共享账号的账户级可变状态还原成新注册账号的默认值。
- `authSession`：用例开始时探测 `/api/auth/get-session`，失效则经 API 重新登录一次并重写状态文件；运行中出现 API 401 时同样只修复一次。

以下场景不要使用该 fixture，必须保留真实认证路径或多身份/多 Context：`e2e/authentication/**`、跨身份 Owner/权限拒绝、双会话同步、注销/PIN 切换、密码重置，以及 local-docker 与 desktop（Cookie 域不同，不能复用 Web storageState）。

## 配置入口

- 常规 Web E2E：[`apps/web/playwright.config.ts`](../playwright.config.ts)
- 同步回归 E2E：[`apps/web/playwright.sync.config.ts`](../playwright.sync.config.ts)
- 常规 E2E 配置常量：[`apps/web/e2e/config.ts`](./config.ts)
- sync 账号与 desktop 启动 helper：[`apps/web/e2e/sync/helpers/`](./sync/helpers)

## Ownership 与执行车道

E2E 的执行归属不由目录或 Playwright config 的存在自动推断。`tools/test-system-v2/e2e-ownership.json` 是 collector/spec execution ownership 的真源；`tools/test-system-v2/e2e-retirement.json` 记录不得恢复的 retired acceptance。新增、移动或退休 E2E 时必须同步这两个契约，并通过 `pnpm nx run test-system-v2:test:governance`。一次性诊断不要提交成长期 `debug*.spec.ts`；需要浏览器交互排障时使用 `pnpm e2e:debug` 调试 canonical Web Flow。

## 维护约定

- 文档只解释目录边界和入口，不维护测试数量、覆盖率统计或历史规划。
- helper 的实现理由应写在 helper 或配置文件注释里。
- 如果某类场景已经迁到 `sync` 或被删除，应先改目录和配置，再同步这里的简述。

## V2 shell anchors (UI redesign)

- 顶部模块胶囊：`capsule-nav-{goal|task|note|schedule|notification}`
- 胶囊独立预览：`capsule-preview-toggle-{module}` / `capsule-preview-{module}`
- 右侧面板开关：`shell-right-panel-toggle`
- 业务面板：`business-panel` / `business-panel-close`
- 面板错误兜底：`panel-error-boundary` / `panel-error-fallback` / `panel-error-retry`
- 任务库路由：`/tasks`（无 `/tasks/one-time`）
- AI 常驻层：`ai-chat-view`（不经业务路由卸载）
