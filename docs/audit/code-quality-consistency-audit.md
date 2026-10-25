# Code Quality & Consistency Audit

- 审查日期：2026-07-07
- 审查范围：当前工作区代码、配置、测试、治理脚本与正式文档
- 执行原则：初始审查阶段只读；后续按 `docs/plan/active/2026-07-07-code-quality-consistency-repair-plan.md` 完成 focused repair pass，并保留原始审查证据
- 工作区状态：`git status --short` 显示当前存在大量未提交重构改动，本报告以当前工作区内容为准，不回滚、不覆盖用户改动

## 1. Executive Summary

当前最大风险不是单个业务规则写错，而是近期 server-first 重构后，部分生命周期、测试配置和治理规则没有同步收敛。代码主干已经明显朝 `src/server/{domain,application,transport,infrastructure}` 形态迁移；本轮修复已经把审查中记录的 7 个问题收敛到 Fixed，并通过 targeted verification。

原始审查中最应该优先修复的是 `Q-001` 和 `Q-002`：

- `Q-001`：`schedule` runtime 外层 `start(): void` 使用 `void queue.start()` 丢弃异步失败，API 与 Electron 启动路径会在队列加载完成前宣告成功。
- `Q-002`：`schedule-orchestration:test` 当前 4 个 suite 在导入阶段失败，导致调度投影/执行编排包没有可用的测试保护。

整体判断：当前项目不是完全失控的结构，而是迁移后的局部边界漂移。修复后，主要风险已从“已确认问题”转为“后续变更需要持续按 governance、typecheck 和 targeted tests 守住边界”。

严重级别统计：

| 严重级别 | 数量 |
| -------- | ---: |
| Blocker  |    0 |
| High     |    2 |
| Medium   |    3 |
| Low      |    2 |

修复状态：

| 问题 ID | 状态  | 关键验证                                                                                                               |
| ------- | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| Q-001   | Fixed | `pnpm nx run schedule:test --skipSync`                                                                                 |
| Q-002   | Fixed | `pnpm nx run schedule-orchestration:test --skipSync`                                                                   |
| Q-003   | Fixed | `pnpm nx run memoflow:governance-check --skipSync`                                                                     |
| Q-004   | Fixed | `pnpm nx run api:test:smoke --skipSync`                                                                                |
| Q-005   | Fixed | `pnpm nx run api:typecheck --skipSync`、`pnpm nx run repository:test --skipSync`、`pnpm nx run editor:test --skipSync` |
| Q-006   | Fixed | `pnpm nx run memoflow:docs-check --skipSync`                                                                           |
| Q-007   | Fixed | `pnpm nx run schedule:test --skipSync`                                                                                 |

阅读说明：第 2-8 章保留初始审查快照、证据和推荐修复路径，其中出现的“当前观察”指 2026-07-07 初始审查时的工作区状态。修复后的权威状态以本节 `Fixed` 表、`Verification Log` 和当前代码为准。

## 2. Project Map

### Workflow 0：项目模块地图

当前仓库是 Nx monorepo。根协作规范 `AGENT.md` 明确：真值顺序为当前代码/配置/测试优先，其次才是正式文档。

主要应用：

| 目录              | 职责                                                                          |
| ----------------- | ----------------------------------------------------------------------------- |
| `apps/api`        | Express API 启动、模块注册、HTTP middleware、OpenAPI/route 装配               |
| `apps/web`        | Vue/Vite Web 客户端与 mock handlers                                           |
| `apps/desktop`    | Electron main/preload/renderer，桌面 profile runtime、IPC 与 PowerSync 运行时 |
| `apps/mobile`     | 移动端应用配置                                                                |
| `apps/ai-service` | Python FastAPI AI service                                                     |

主要包：

| 目录                                                                                                                                  | 职责                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `packages/{account,ai,authentication,data-portability,editor,goal,governance,notification,reminder,repository,schedule,setting,task}` | 业务 feature packages，当前目标形态是 `src/api`、`src/client`、`src/electron`、`src/server/*` |
| `packages/contracts`                                                                                                                  | 跨端 DTO、contracts 与公共协议                                                                |
| `packages/domain-shared`                                                                                                              | 跨 feature/domain 的共享类型和值对象                                                          |
| `packages/utils`                                                                                                                      | Result、route registrar、HTTP adapter、事件总线等共享基础设施                                 |
| `packages/database`                                                                                                                   | Prisma schema/client 与数据库基础设施                                                         |
| `packages/schedule-orchestration`                                                                                                     | 调度投影与 source execution 的跨 feature 编排                                                 |
| `packages/app-vue`、`packages/ui-*`                                                                                                   | 前端应用/UI 共享层                                                                            |

### 重点审查文件清单

| 文件                                                                                                                     | 审查原因                                                   |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `apps/api/src/main.ts`                                                                                                   | API bootstrap、跨模块依赖注入、调度编排与 storage 配置入口 |
| `apps/desktop/src/main/main.ts`、`apps/desktop/src/main/profile/desktop-profile-runtime-manager.ts`                      | Electron runtime/profile 启动链路                          |
| `packages/schedule/src/server/infrastructure/runtime/schedule.runtime.ts`                                                | 调度 runtime contribution 的启动/停止与事件订阅            |
| `packages/schedule/src/server/application/scheduler/schedule-task-queue.ts`                                              | 调度队列真实异步启动、loader、错误传播                     |
| `packages/schedule/src/api/module.ts`、`packages/schedule/src/electron/index.ts`                                         | API/Electron 调度 runtime 启动入口                         |
| `packages/schedule-orchestration/vitest.config.ts`、`vitest.shared.ts`、`vitest.workspace-helpers.ts`                    | 跨包测试 alias 与 resolver 配置                            |
| `packages/task/src/api/routes/*.ts`、`packages/goal/src/api/routes/goal.routes.ts`、`packages/setting/src/api/routes.ts` | route middleware 与 `expressAdapter` auth 语义             |
| `packages/utils/src/result/route-registrar.ts`、`packages/utils/src/result/express-adapter.ts`                           | 路由注册和 auth option 的实际执行顺序                      |
| `tools/governance/server-feature-shape-audit.mjs`                                                                        | server-first 目录治理规则                                  |
| `docs/architecture/adr/ADR-031-server-feature-standard-shape.md`                                                         | server-first ADR 标准                                      |
| `docs/test/running-tests.md`、`vitest.shared.ts`                                                                         | 测试文档与实际 coverage 配置                               |

### 当前推断出的职责边界

| 边界                            | 期望职责                                                      | 当前观察                                                                               |
| ------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| App bootstrap                   | 只做组合、注入、生命周期启动                                  | `apps/api/src/main.ts` 同时重复维护 repository storage path 默认值                     |
| Feature `api`                   | Express routes、API module 注册、HTTP transport seam          | 部分 route 同时表达 `[auth]` middleware 和 `{ requireAuth: false }`，语义来源不唯一    |
| Feature `server/domain`         | 聚合、实体、值对象、domain service                            | 新结构基本建立，但 ADR 要求的 `server/index.ts` 缺失                                   |
| Feature `server/application`    | use cases、ports、scheduler queue 等业务流程                  | `ScheduleTaskQueue.start()` 是真实异步入口，但外层 runtime 没有等待                    |
| Feature `server/infrastructure` | repository adapters、module composition、runtime contribution | root barrel 直接导出 `./server/infrastructure`，与 ADR 的 `server/index.ts` 入口不一致 |
| `schedule-orchestration`        | 跨 feature schedule projection/source execution 编排          | 仍使用 `infrastructure-server` 命名，且测试配置无法处理被导入包内部 `@` alias          |

### 高风险区域

- `schedule` runtime lifecycle：异步启动和失败传播没有被模块生命周期承接。
- `schedule-orchestration` 测试配置：核心跨 feature 编排包测试目标失败。
- server-first 目录标准：ADR、治理脚本、实际入口不完全一致。
- route auth 语义：middleware 与 adapter option 同时表达认证要求。
- repository storage 配置：同一 env/default 在多个模块重复维护，且未纳入 API env schema/example。

### Workflow 1：核心流程审查

#### 流程 1：API 启动与业务模块注册

```
进程启动
↓
apps/api/src/main.ts
↓
loadEnv / connectDatabase / createScheduleOrchestrationModule
↓
TaskApiModule 注入 projectionRuntime；ScheduleApiModule 注入 sourceExecutor
↓
ApiBootstrapper.registerModules()
↓
各 feature module register(context)
↓
Express routes / runtime contribution / OpenAPI 输出
```

| 阶段                     | Owner                                 | 输入                                    | 输出                             | 风险点                                                                     |
| ------------------------ | ------------------------------------- | --------------------------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| API bootstrap            | `apps/api`                            | env、Prisma client、module list         | Express app 与模块注册           | `apps/api/src/main.ts:68-85` 重复读取 `REPOSITORY_STORAGE_PATH`            |
| Schedule module register | `packages/schedule/src/api/module.ts` | db、sourceExecutor                      | `activeScheduleModule` 与 routes | `scheduleModule.start()` 在 `register()` 内同步调用，未等待 queue 异步启动 |
| Route registration       | `packages/utils` + feature routes     | route defs、middleware、adapter options | Express route                    | `[auth]` middleware 与 `{ requireAuth: false }` 可冲突                     |

#### 流程 2：Desktop profile/runtime 启动

```
Electron main 启动
↓
apps/desktop/src/main/main.ts
↓
DesktopProfileRuntimeManager 准备 profile/db/runtime
↓
注册 feature Electron modules
↓
构建 schedule orchestration
↓
startScheduleRuntime()
↓
Schedule module runtime contribution
```

| 阶段             | Owner                                     | 输入                                | 输出                 | 风险点                                                                            |
| ---------------- | ----------------------------------------- | ----------------------------------- | -------------------- | --------------------------------------------------------------------------------- |
| Desktop shell    | `apps/desktop`                            | profile、PowerSync db、窗口生命周期 | Desktop runtime      | 认证/账户/profile 逻辑集中在桌面端 app-local 模块，后续需保持与 feature seam 对齐 |
| Schedule runtime | `packages/schedule/src/electron/index.ts` | `activeScheduleModule`              | runtime started 日志 | `activeScheduleModule.start()` 同步返回，不能表达 queue loader 失败               |

#### 流程 3：Task CRUD/API route

```
Web/Desktop 客户端调用 @memoflow/task/client
↓
HTTP 或 IPC adapter
↓
packages/task/src/api/routes/*
↓
controller / transport handler / application port
↓
server application use cases
↓
repositories / event bus
↓
Result / HTTP response / client state 更新
```

| 阶段        | Owner                                          | 输入                    | 输出              | 风险点                                                                     |
| ----------- | ---------------------------------------------- | ----------------------- | ----------------- | -------------------------------------------------------------------------- |
| Client seam | `packages/task/src/client`                     | DTO/request             | HTTP/IPC 调用     | 依赖 contracts 一致性                                                      |
| API routes  | `packages/task/src/api/routes`                 | Express req/context     | controller result | 部分 route 同时传 `[auth]` 和 `{ requireAuth: false }`                     |
| Adapter     | `packages/utils/src/result/express-adapter.ts` | Result、adapter options | HTTP response     | `requireAuth` 只在 middleware 后执行，不能覆盖已绑定 middleware 的认证行为 |

#### 流程 4：Schedule projection 与执行

```
Task/Goal/Reminder 业务状态变化
↓
projection runtime 生成/更新 ScheduleTask
↓
schedule runtime queue 加载 enabled tasks
↓
ScheduleTaskQueue.scheduleNext()
↓
sourceExecutor / schedule-orchestration source router
↓
任务执行、事件发布、状态更新
```

| 阶段             | Owner                             | 输入                           | 输出                | 风险点                                          |
| ---------------- | --------------------------------- | ------------------------------ | ------------------- | ----------------------------------------------- |
| Projection owner | `task` / `goal` / `reminder`      | feature domain state           | `ScheduleTask`      | 跨 feature 投影依赖 orchestration 测试保护      |
| Runtime queue    | `packages/schedule`               | enabled tasks、clock、executor | scheduled execution | `queue.start()` 异步错误可能被外层吞掉          |
| Orchestration    | `packages/schedule-orchestration` | source module/type/id          | source execution    | 当前 test target 导入阶段失败，无法验证核心路由 |

## 3. Responsibility Boundaries

当前职责边界已经有清晰方向，但仍有几类混乱：

| 边界问题                   | 证据                                                                                                                       | 影响                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 生命周期 owner 不清        | `ScheduleTaskQueue.start(): Promise<void>`，但 `createScheduleRuntimeContribution.start(): void` 使用 `void queue.start()` | 上层模块无法知道调度队列是否真正启动成功        |
| 标准入口不统一             | ADR 要求 `src/server/index.ts`，实际 feature root barrel 直接导出 `./server/infrastructure`                                | 新人按文档找入口会失败；治理通过不代表符合 ADR  |
| route auth 真值源不唯一    | route 传 `[auth]`，同时 adapter option 传 `{ requireAuth: false }`                                                         | 代码读者和后续工具可能误判 public/private 边界  |
| 配置 owner 分散            | `REPOSITORY_STORAGE_PATH` 在 API、repository、editor、repository prisma adapter 重复 default                               | 部署配置漂移会导致多个模块使用不同 storage root |
| 测试 resolver owner 不明确 | `schedule-orchestration` 只使用 shared config，但需要跨包 `@` alias resolver                                               | 核心编排测试 target 失败                        |

## 4. Critical Findings (Resolved)

### Q-001

- ID：Q-001
- 严重级别：High
- 类型：质量 / 异步生命周期 / 测试
- 位置：`packages/schedule/src/server/infrastructure/runtime/schedule.runtime.ts:createScheduleRuntimeContribution.start` lines 285-305；`packages/schedule/src/server/application/scheduler/schedule-task-queue.ts:ScheduleTaskQueue.start/loadActiveTasks` lines 164-183, 368-388；`packages/schedule/src/api/module.ts:register` lines 54-69；`packages/schedule/src/electron/index.ts:startScheduleRuntime` lines 81-88
- 影响：API/Electron 启动路径会在队列加载完成前认为 runtime 已启动；如果 loader 失败，失败只存在于被丢弃的 Promise 中，上层模块没有明确 fail/ready/degraded 状态。
- 证据：
  - `schedule.runtime.ts:303-305`：`void queue.start(); started = true; logger.info(...)`
  - `schedule-task-queue.ts:164-175`：`async start(): Promise<void>` 且 `await this.loadActiveTasks()`
  - `schedule-task-queue.ts:383-387`：`loadActiveTasks()` catch 后 `throw error`
  - `schedule/api/module.ts:69`：`scheduleModule.start();`
  - `schedule/electron/index.ts:86-88`：`activeScheduleModule.start(); runtimeStarted = true; logger.info(...)`
- 建议修复方向：把 runtime contribution/module lifecycle 的 `start` 升级为可等待的 `Promise<void>`，并在 API/Electron bootstrap 中等待；如果产品需要容忍降级启动，则必须显式 catch、记录失败并暴露 degraded/ready 状态，不能继续用 `void` 丢弃。
- 推荐验证方式：先补失败测试，再运行 `pnpm nx run schedule:test --skipSync`；修复 API/Electron 调用后再补对应 targeted test。

### Q-002

- ID：Q-002
- 严重级别：High
- 类型：测试 / 配置 / 一致性
- 位置：`packages/schedule-orchestration/vitest.config.ts` lines 5-17；`vitest.shared.ts` lines 329-334；`vitest.workspace-helpers.ts` lines 3-49, 236-248；`packages/schedule/src/server/infrastructure/adapters/prisma/schedule-prisma.repository.ts` lines 9-11
- 影响：`schedule-orchestration` 是调度投影与 source execution 的核心跨 feature 编排包，但当前 test target 在导入阶段失败，4 个 suite 0 tests，无法保护核心流程。
- 证据：
  - `pnpm nx run schedule-orchestration:test --skipSync` 当前失败：`Cannot find package '@/server/domain/aggregates/calendar-entry' imported from '/opt/memoflow/packages/schedule/src/server/infrastructure/adapters/prisma/schedule-prisma.repository.ts'`
  - `packages/schedule-orchestration/vitest.config.ts:5-17` 只调用 `createSharedConfig(...)`，没有安装跨包 `@` resolver。
  - `vitest.shared.ts:329-334` 把 `@` 映射到当前项目 `projectSrc`。
  - `vitest.workspace-helpers.ts:3-49` 已存在 `domainResolveAtAlias`，`236-248` 已存在 `createPackageResolveAliases()`，但未被该 target 使用。
- 建议修复方向：为 `schedule-orchestration` test config 接入能按 importer package 解析 `@/` 的 resolver，或避免测试路径导入带有包内 `@` alias 的深层实现；修复后必须保证该 target 真实执行 4 个 suite。
- 推荐验证方式：`pnpm nx run schedule-orchestration:test --skipSync`。

## 5. Full Findings (Resolved)

### Q-001

- ID：Q-001
- 严重级别：High
- 类型：质量 / 异步生命周期 / 测试
- 位置：`packages/schedule/src/server/infrastructure/runtime/schedule.runtime.ts:createScheduleRuntimeContribution.start` lines 285-305；`packages/schedule/src/server/application/scheduler/schedule-task-queue.ts:ScheduleTaskQueue.start/loadActiveTasks` lines 164-183, 368-388；`packages/schedule/src/api/module.ts:register` lines 54-69；`packages/schedule/src/electron/index.ts:startScheduleRuntime` lines 81-88
- 现象：外层 runtime contribution 是同步 `start(): void`，内部调用 `void queue.start()` 后立即设置 `started = true`；真实队列启动函数是 `async start(): Promise<void>`，并会等待 loader。
- 影响：loader 失败时，上层 bootstrap 无法捕获；启动状态和真实队列状态可能不一致；日志会误报 runtime 已启动。
- 证据：见 Critical Findings Q-001。
- 建议：统一 lifecycle contract，把异步启动显式暴露给 API/Electron/bootstrap；不要在核心 runtime 中丢弃启动 Promise。
- 是否需要测试：需要。
- 推荐测试位置：`packages/schedule/src/server/infrastructure/runtime/schedule.runtime.spec.ts`，必要时补 `packages/schedule/src/api/module` 或 Electron seam 的 lifecycle 测试。
- 验证方式：`pnpm nx run schedule:test --skipSync`。

### Q-002

- ID：Q-002
- 严重级别：High
- 类型：测试 / 配置 / 一致性
- 位置：`packages/schedule-orchestration/vitest.config.ts` lines 5-17；`vitest.shared.ts` lines 329-334；`vitest.workspace-helpers.ts` lines 3-49, 236-248；`packages/schedule/src/server/infrastructure/adapters/prisma/schedule-prisma.repository.ts` lines 9-11
- 现象：`schedule-orchestration:test` 的 4 个 suite 全部在 import 阶段失败，错误为无法解析从 `packages/schedule` 深层文件引入的 `@/server/domain/aggregates/calendar-entry`。
- 影响：核心调度编排测试不可用；后续 schedule projection/source execution 改动可能在 governance 通过的情况下破坏编排行为。
- 证据：见 Critical Findings Q-002。
- 建议：统一 Vitest alias 策略，确保跨包导入时 `@/` 按 importer 所在 package 解析；修复后将失败 target 作为回归验证。
- 是否需要测试：需要。
- 推荐测试位置：`packages/schedule-orchestration/src/__tests__/*` 保持现有 suite；修复配置后确保它们真实运行。
- 验证方式：`pnpm nx run schedule-orchestration:test --skipSync`。

### Q-003

- ID：Q-003
- 严重级别：Medium
- 类型：架构 / 文档 / 一致性
- 位置：`docs/architecture/adr/ADR-031-server-feature-standard-shape.md` lines 16-52；`tools/governance/server-feature-shape-audit.mjs` lines 24-25, 74-96；`packages/task/src/index.ts` lines 14-29；`packages/schedule-orchestration/src/index.ts` line 8；`packages/schedule-orchestration/project.json` lines 1-7
- 现象：ADR 把 `src/server/index.ts` 定义为 canonical server feature shape 的一部分，但当前 `find packages -path '*/src/server/index.ts' -print` 没有输出。治理脚本只检查 `server`、`api`、`client`、`electron` 和 `server/{domain,application,transport,infrastructure}`，不检查 `server/index.ts`。root barrel 示例 `packages/task/src/index.ts:14-29` 直接导出 `./server/infrastructure`。
- 影响：文档标准、机器治理、实际入口不一致；新人或后续 repair pass 可能按 ADR 新增入口，但治理不会约束现有包；`schedule-orchestration` 作为 `layer:domain` 共享包仍暴露 `./infrastructure-server`，也不在 audited feature package 列表内。
- 证据：
  - ADR lines 31-52 包含 `server/index.ts` 和 root `src/index.ts` 说明。
  - `server-feature-shape-audit.mjs:24-25` 只定义目录数组，不包含 `server/index.ts`。
  - `server-feature-shape-audit.mjs:88-96` 只检查 `server` 下四个子目录。
  - `packages/task/src/index.ts:14-29` 直接 `from './server/infrastructure'`。
  - `packages/schedule-orchestration/src/index.ts:8` 仍 `from './infrastructure-server'`。
- 建议：选择一个 canonical 标准并同步三处：如果 `server/index.ts` 是标准，则补齐所有 audited packages 并更新治理；如果 root barrel 直接导出 infrastructure 才是标准，则修正 ADR。另行决定 `schedule-orchestration` 是否应纳入类似治理。
- 是否需要测试：需要，偏治理测试。
- 推荐测试位置：`tools/governance/server-feature-shape-audit.mjs` 对应脚本行为；必要时补脚本 fixture 或至少更新 governance check。
- 验证方式：`pnpm nx run memoflow:governance-check`。

### Q-004

- ID：Q-004
- 严重级别：Medium
- 类型：一致性 / 安全边界 / 文档
- 位置：`packages/task/src/api/routes/task-template.routes.ts` lines 179-181, 320-326；`packages/task/src/api/routes/task-dependency.routes.ts` lines 86-88, 104-106, 122-124, 140-142；`packages/goal/src/api/routes/goal.routes.ts` lines 183-185；`packages/setting/src/api/routes.ts` lines 150-152；`packages/utils/src/result/route-registrar.ts` lines 175-177；`packages/utils/src/result/express-adapter.ts` lines 139-153；`apps/api/src/shared/infrastructure/http/middlewares/auth-middleware.ts` lines 78-90；`apps/api/src/__tests__/smoke/task/task-template.smoke.test.ts` lines 195-196
- 现象：多个 route 同时传入 `[auth]` middleware 和 `{ requireAuth: false }` adapter option。`RouteRegistrar` 会先绑定 middleware 再绑定 adapted handler，因此 adapter 的 `requireAuth: false` 不能让 route 变成 public。
- 影响：当前不是认证绕过；实际行为仍会被 middleware 拦截。但代码中存在两个认证真值源，后续生成 OpenAPI、重构中间件或补 route contract test 时容易误判 public/private 边界。
- 证据：
  - `route-registrar.ts:176-177`：`const adapted = expressAdapter(handler, adapterOptions); this.router[def.method](def.path, ...middleware, adapted);`
  - `express-adapter.ts:139-153`：`requireAuth` 只在 adapted handler 内检查。
  - `auth-middleware.ts:84-89`：缺少 Bearer token 直接返回 unauthorized。
  - `task-template.smoke.test.ts:195-196` 注释明确承认：route 有 `requireAuth: false`，但 `[auth]` middleware 仍然要求 token。
- 建议：认证要求保留一个来源。若 route 必须认证，移除误导性的 `{ requireAuth: false }`；若确实是 public read，则改用 optional-auth middleware 或不绑定 `[auth]`。
- 是否需要测试：需要。
- 推荐测试位置：`packages/task/src/api/routes/*.spec.ts`、`packages/goal/src/api/routes/goal.routes.spec.ts`、`packages/setting/src/api/routes.spec.ts`，必要时保留 API smoke 覆盖。
- 验证方式：`pnpm nx run api:test:smoke`，以及相关 package test target。

### Q-005

- ID：Q-005
- 严重级别：Medium
- 类型：一致性 / 配置 / 可维护性
- 位置：`apps/api/src/main.ts` lines 68-85；`packages/repository/src/api/module.ts` lines 68-75；`packages/editor/src/api/module.ts` lines 73-78；`packages/repository/src/server/infrastructure/prisma.ts` lines 22-25；`apps/api/src/shared/infrastructure/config/env.schema.ts`、`.env.example`、`docs/**`
- 现象：`REPOSITORY_STORAGE_PATH || '/tmp/memoflow-repository-storage'` 在 API AI adapters、repository module、editor module、repository prisma adapter 多处重复维护；同名 env 未在 API env schema、`.env.example` 或 docs 中被 `rg` 找到。
- 影响：部署时同一 storage root 可能因为默认值、env 注入或未来拼写漂移而分裂；AI knowledge、repository、editor 可能读写不同目录。
- 证据：
  - `apps/api/src/main.ts:72,77,84` 三次重复读取同一 env/default。
  - `packages/repository/src/api/module.ts:71-72` 重复相同 default。
  - `packages/editor/src/api/module.ts:75` 重复相同 default。
  - `packages/repository/src/server/infrastructure/prisma.ts:24` 再次使用 `process.env.REPOSITORY_STORAGE_PATH ?? '/tmp/memoflow-repository-storage'`。
  - `rg REPOSITORY_STORAGE_PATH apps/api/src/shared/infrastructure/config/env.schema.ts .env.example docs -n` 未返回结果。
- 建议：建立单一 storage config 解析入口，或由 repository package 暴露 canonical helper/constant；API bootstrap 只解析一次并注入所有需要的 module/adapter；同时把 env 加入 schema、`.env.example` 和部署文档。
- 是否需要测试：需要。
- 推荐测试位置：新增 config/helper 单元测试；涉及 API 注入时补 `apps/api` smoke/config 测试。
- 验证方式：`pnpm nx run api:typecheck`，`pnpm nx run repository:test`，必要时补 `pnpm nx run editor:test`。

### Q-006

- ID：Q-006
- 严重级别：Low
- 类型：文档 / 测试 / 一致性
- 位置：`docs/test/running-tests.md` line 19；`vitest.shared.ts` lines 74-79
- 现象：测试文档仍描述 coverage 默认检查 `src/domain-server/**` 与 `src/domain-shared/value-objects/**`，但当前 `vitest.shared.ts` 的 governed roots 已迁移为 `src/server/domain/{aggregates,entities,services,value-objects}`。
- 影响：新人和后续 repair prompt 可能按旧路径补测或排查 coverage，降低测试维护效率。
- 证据：
  - `docs/test/running-tests.md:19` 写的是 `src/domain-server/aggregates/**`、`src/domain-server/services/**`、`src/domain-server/value-objects/**`。
  - `vitest.shared.ts:75-78` 是 `src/server/domain/aggregates`、`entities`、`services`、`value-objects`。
- 建议：更新测试文档到 server-first 路径，并说明当前 coverage 默认 roots 以 `vitest.shared.ts` 为准。
- 是否需要测试：不需要业务测试；需要文档/治理检查。
- 推荐测试位置：不适用。
- 验证方式：`pnpm nx run memoflow:docs-check` 或项目现有 docs check target。

### Q-007

- ID：Q-007
- 严重级别：Low
- 类型：架构 / 可维护性
- 位置：`packages/schedule/src/electron/index.ts` lines 81-88, 107-113；`packages/schedule/src/server/infrastructure/powersync.ts` lines 35-39
- 现象：Electron seam 中为了拿到 `scheduleTaskRepository`，创建了一个 `seedModule = createSchedulePowerSyncModule(ctx.db)`，随后又创建实际 `scheduleModule`。`createSchedulePowerSyncModule` 本身会构建完整 module/repositories。
- 影响：当前未确认存在资源泄漏，因为 seed module 没有 start；但 module 组装职责不清，后续若 module factory 增加副作用或 runtime contribution，会放大维护风险。
- 证据：
  - `packages/schedule/src/electron/index.ts:107-113` 创建 `seedModule` 只用于读取 repository。
  - `packages/schedule/src/server/infrastructure/powersync.ts:35-39` `createSchedulePowerSyncModule` 会创建完整 module。
- 建议：提供明确的 repository factory，或在 Electron seam 中一次性创建 module 并从同一实例注入 runtime，避免用完整 module 作为临时 repository factory。
- 是否需要测试：需要，修复时补 seam 行为测试。
- 推荐测试位置：`packages/schedule/src/electron/*.spec.ts` 或 desktop main targeted test。
- 验证方式：`pnpm nx run schedule:test --skipSync`，必要时 `pnpm nx run desktop:test:main`。

## 6. Consistency Matrix

| 概念 / 规则 / 数据          | 位置 A                                  | 位置 B                                   | 位置 C                                                                     | 不一致表现                                                                        | 风险                             | 建议统一方式                                       |
| --------------------------- | --------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------- |
| Schedule runtime start 语义 | `schedule.runtime.ts:285-305`           | `schedule-task-queue.ts:164-183`         | `api/module.ts:69`, `electron/index.ts:86-88`                              | 外层 `start(): void`，内层 `start(): Promise<void>`                               | 启动成功状态和真实队列状态不一致 | 统一为可等待 lifecycle 或显式 degraded state       |
| `@/` alias 解析             | `vitest.shared.ts:329-334`              | `vitest.workspace-helpers.ts:3-49`       | `schedule-orchestration/vitest.config.ts:5-17`                             | shared config 把 `@` 固定到当前项目，orchestration 未接入 importer-aware resolver | 跨包测试 import 失败             | 统一 test alias strategy，按 importer package 解析 |
| Server feature shape        | ADR-031 lines 31-52                     | `server-feature-shape-audit.mjs:24-96`   | `packages/task/src/index.ts:14-29`                                         | ADR 要求 `server/index.ts`，治理不查，实际 root barrel 直出 infrastructure        | 文档、治理、实现三方漂移         | 更新治理或更新 ADR，形成单一标准                   |
| 认证要求                    | route files 的 `[auth]` middleware      | `expressAdapter({ requireAuth: false })` | smoke test 注释                                                            | middleware 与 adapter option 表达相反语义                                         | route public/private 边界误判    | 只保留一个认证真值源                               |
| Repository storage path     | `apps/api/src/main.ts:72,77,84`         | `repository/api/module.ts:71-72`         | `editor/api/module.ts:75`, `repository/server/infrastructure/prisma.ts:24` | 同一 env/default 多处重复，schema/docs 未收录                                     | 部署配置漂移                     | 单一 config resolver + schema/docs                 |
| Coverage 文档路径           | `docs/test/running-tests.md:19`         | `vitest.shared.ts:75-78`                 | -                                                                          | 文档仍写 legacy `domain-server` 路径                                              | 补测方向错误                     | 文档改为 `src/server/domain/**`                    |
| Orchestration infra 命名    | `schedule-orchestration/src/index.ts:8` | ADR legacy 禁止方向                      | `project.json:6`                                                           | domain-tagged shared 包仍暴露 `infrastructure-server`                             | 治理覆盖盲区                     | 明确是否纳入 server-first 或保留例外并文档化       |

## 7. Testing Gaps (Closed Or Covered By Targeted Verification)

| 测试缺口                                          | 风险                                              | 建议测试类型                               | 推荐测试位置                                                                                                                            | 优先级 | 验证命令                                                   |
| ------------------------------------------------- | ------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| Schedule runtime 启动失败未被外层 lifecycle 捕获  | loader 失败时 API/Electron 仍认为 runtime started | 单元测试 + lifecycle contract test         | `packages/schedule/src/server/infrastructure/runtime/schedule.runtime.spec.ts`                                                          | High   | `pnpm nx run schedule:test --skipSync`                     |
| `schedule-orchestration` test target 当前不可运行 | 核心编排无测试保护                                | 配置回归 + 现有 suite 真实执行             | `packages/schedule-orchestration/vitest.config.ts` 与 `src/__tests__/*`                                                                 | High   | `pnpm nx run schedule-orchestration:test --skipSync`       |
| route auth 语义缺少统一 contract 测试             | public/private 边界可能被误改                     | route registration/auth contract test      | `packages/task/src/api/routes/*.spec.ts`、`packages/goal/src/api/routes/goal.routes.spec.ts`、`packages/setting/src/api/routes.spec.ts` | Medium | `pnpm nx run api:test:smoke`                               |
| Repository storage config 没有集中解析测试        | storage root 漂移难以及时发现                     | config/helper 单元测试 + API config smoke  | 新增 storage config helper 对应 spec                                                                                                    | Medium | `pnpm nx run api:typecheck`、`pnpm nx run repository:test` |
| server-first shape 文档/治理不一致未被测试锁定    | 新包结构可能继续漂移                              | governance script test 或 governance check | `tools/governance/server-feature-shape-audit.mjs`                                                                                       | Medium | `pnpm nx run memoflow:governance-check`                    |
| coverage 文档路径过时                             | 新人补测路径错误                                  | docs check                                 | `docs/test/running-tests.md`                                                                                                            | Low    | `pnpm nx run memoflow:docs-check`                          |
| Electron schedule module 双组装 seam 未覆盖       | 后续 factory 增加副作用后风险扩大                 | seam 单元测试                              | `packages/schedule/src/electron/*.spec.ts`                                                                                              | Low    | `pnpm nx run schedule:test --skipSync`                     |

## 8. Recommended Repair Plan

### Repair Pass 01：修复 Q-001

- 目标：让 schedule runtime 启动语义显式可等待，失败可被 bootstrap 捕获或进入明确 degraded state。
- 涉及文件：`packages/schedule/src/server/infrastructure/runtime/schedule.runtime.ts`、`packages/schedule/src/server/application/scheduler/schedule-task-queue.ts`、`packages/schedule/src/api/module.ts`、`packages/schedule/src/electron/index.ts`、相关 spec。
- 为什么优先：这是运行时语义风险，可能导致启动日志成功但队列未加载。
- 推荐步骤：
  1. 先在 `schedule.runtime.spec.ts` 补一个 loader reject 的失败测试，断言外层 `start()` 可观察失败。
  2. 将 runtime contribution/module 的 `start` contract 调整为 `Promise<void>` 或显式 `ready` promise。
  3. 更新 API/Electron 启动调用，避免 `void queue.start()`。
  4. 运行 targeted verification。
- 验证命令：`pnpm nx run schedule:test --skipSync`

### Repair Pass 02：修复 Q-002

- 目标：恢复 `schedule-orchestration:test`，确保 4 个 suite 能进入真实测试执行。
- 涉及文件：`packages/schedule-orchestration/vitest.config.ts`、必要时 `vitest.workspace-helpers.ts`。
- 为什么优先：当前核心跨 feature 编排包没有可运行测试保护。
- 推荐步骤：
  1. 保留当前失败作为回归基线。
  2. 接入 importer-aware `@/` resolver，或移除触发跨包 `@` 深层解析的导入方式。
  3. 确认 `schedule-orchestration:test` 不再出现 0 test failed suites。
  4. 运行 targeted verification。
- 验证命令：`pnpm nx run schedule-orchestration:test --skipSync`

### Repair Pass 03：修复 Q-004

- 目标：统一 route auth 表达方式，消除 `[auth]` 与 `{ requireAuth: false }` 的反向语义。
- 涉及文件：`packages/task/src/api/routes/*.ts`、`packages/goal/src/api/routes/goal.routes.ts`、`packages/setting/src/api/routes.ts`、相关 route specs/smoke tests。
- 为什么优先：认证边界属于安全语义，即使当前没有绕过，也不应保留互相矛盾的配置。
- 推荐步骤：
  1. 先补/调整 contract 测试，明确这些 route 是否必须携带 token。
  2. 若必须认证，删除 misleading `requireAuth: false`。
  3. 若必须 public，改中间件策略，而不是只改 adapter option。
  4. 运行 targeted verification。
- 验证命令：`pnpm nx run api:test:smoke`

### Repair Pass 04：修复 Q-003

- 目标：收敛 ADR、治理脚本和实际 server feature 入口。
- 涉及文件：`docs/architecture/adr/ADR-031-server-feature-standard-shape.md`、`tools/governance/server-feature-shape-audit.mjs`、必要时各 feature `src/server/index.ts` 或 root barrels。
- 为什么优先：这是结构标准问题，应在运行时和测试阻断项之后处理。
- 推荐步骤：
  1. 先决定 canonical 入口是否必须是 `server/index.ts`。
  2. 若是，先让治理脚本检查该文件，再逐包补入口。
  3. 若不是，更新 ADR 到当前 root barrel 直出 infrastructure 的实际标准。
  4. 明确 `schedule-orchestration` 是否纳入治理或作为文档化例外。
- 验证命令：`pnpm nx run memoflow:governance-check`

### Repair Pass 05：修复 Q-005

- 目标：集中解析 repository storage path，并纳入 env schema/example/docs。
- 涉及文件：`apps/api/src/main.ts`、`packages/repository/src/api/module.ts`、`packages/editor/src/api/module.ts`、`packages/repository/src/server/infrastructure/prisma.ts`、env schema/example。
- 为什么优先：配置漂移会影响运行环境，但低于当前 runtime/test 阻断项。
- 推荐步骤：
  1. 先补 storage config helper 的单元测试。
  2. 引入单一解析入口，替换多处重复 default。
  3. 更新 env schema、`.env.example` 和部署文档。
  4. 运行 targeted verification。
- 验证命令：`pnpm nx run api:typecheck`、`pnpm nx run repository:test`

### Repair Pass 06：修复 Q-006

- 目标：让测试文档与 `vitest.shared.ts` 的 current coverage roots 对齐。
- 涉及文件：`docs/test/running-tests.md`。
- 为什么优先：低风险文档漂移，可在结构标准确认后顺手修。
- 推荐步骤：
  1. 将 legacy `domain-server` 描述改为 `src/server/domain/**`。
  2. 指向 `vitest.shared.ts` 作为覆盖范围真值源。
  3. 运行 docs/governance check。
- 验证命令：`pnpm nx run memoflow:docs-check`

### Repair Pass 07：修复 Q-007

- 目标：避免 Electron schedule seam 为拿 repository 临时构建完整 module。
- 涉及文件：`packages/schedule/src/electron/index.ts`、`packages/schedule/src/server/infrastructure/powersync.ts`、相关 tests。
- 为什么优先：当前主要是可维护性风险，未确认运行时 bug。
- 推荐步骤：
  1. 先补 seam 测试锁定只组装一次 module/repository 的预期。
  2. 增加明确 repository factory 或调整现有 factory 返回结构。
  3. 移除 `seedModule` 临时组装。
  4. 运行 targeted verification。
- 验证命令：`pnpm nx run schedule:test --skipSync`

## 9. Suggested Follow-up Prompts

### Regression guard：Schedule lifecycle

请针对 `schedule` runtime lifecycle 做一次 focused review，只检查 `start()` / `dispose()` / event listener 注册和回滚语义是否仍然可等待、可重试、不会重复订阅。不要修改业务逻辑；如发现问题，先补失败测试，再运行 `pnpm nx run schedule:test --skipSync`。

### Regression guard：Server feature shape

请检查新增或近期迁移的 feature package 是否仍符合 ADR-031 和 `tools/governance/server-feature-shape-audit.mjs`。只处理结构入口和治理例外，不做业务重构。完成后运行 `pnpm nx run memoflow:governance-check --skipSync`。

### Regression guard：Repository storage config

请检查 API、repository、editor 和 AI adapters 是否仍统一使用 `resolveRepositoryStorageBaseDir()`。如果发现新的硬编码 storage path，先补 resolver 测试，再做 focused cleanup，并运行 `pnpm nx run api:typecheck --skipSync`、`pnpm nx run repository:test --skipSync`。

## Verification Log

本轮审查和修复执行过的关键命令：

| 命令                                                        | 结果                                       |
| ----------------------------------------------------------- | ------------------------------------------ |
| `git status --short`                                        | 工作区存在大量未提交修改，作为审查背景记录 |
| `node tools/governance/server-feature-shape-audit.mjs`      | 通过                                       |
| `node tools/governance/package-internal-boundary-audit.mjs` | 通过                                       |
| `node tools/governance/package-export-audit.mjs`            | 通过                                       |
| `node tools/governance/public-surface-audit.mjs`            | 通过                                       |
| `node tools/test/test-target-governance.mjs --check`        | 通过                                       |
| `pnpm nx run schedule:test --skipSync`                      | 通过，21 files / 259 tests                 |
| `pnpm nx run schedule-orchestration:test --skipSync`        | 通过，4 files / 6 tests                    |
| `pnpm nx run api:test:smoke --skipSync`                     | 通过，2 files / 58 tests                   |
| `pnpm nx run repository:test --skipSync`                    | 通过，12 files / 58 tests                  |
| `pnpm nx run editor:test --skipSync`                        | 通过，19 files / 103 tests                 |
| `pnpm nx run api:typecheck --skipSync`                      | 通过，包含 24 个依赖任务                   |
| `pnpm nx run memoflow:governance-check --skipSync`          | 通过                                       |
| `pnpm nx run memoflow:docs-check --skipSync`                | 通过                                       |

注意：`api:typecheck` 的第一次修复后验证暴露出 `packages/data-portability/src/server/index.ts` 导出不存在的 `./domain`。该问题属于 Q-003 server feature shape 收敛时产生的构建破口，已通过移除虚假导出修复，并由后续 `api:typecheck` 与 `memoflow:governance-check` 覆盖。
