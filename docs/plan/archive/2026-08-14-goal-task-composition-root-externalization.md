---
tags:
  - plan
  - active
  - architecture
  - goal
  - task
  - composition-root
description: 将 Goal 与 Task 的宿主特定装配外移到 API/Desktop runtime composer，复用 governance 的 transport-neutral deep module 模式
created: 2026-08-14T00:00:00Z
updated: 2026-08-14T00:00:00Z
---

# Goal / Task Composition Root 外移执行方案

## 1. 背景与目标

`packages/governance` 已作为 reference module 完成 composition-root externalization（参见 `docs/plan/archive/2026-08-13-governance-composition-root-externalization.md`）。本阶段把同一套 host-composer pattern 推广到组合最深的两个业务包：Goal 与 Task。目标不是重写 domain/use cases，而是把“宿主选择 persistence adapter、组装 runtime、创建 module instance”的 ownership 从 `api`/`electron` transport module 移到 `apps/api/src/runtime` 与 `apps/desktop/src/main/runtime`。

目标依赖方向固定为：

```text
API runtime / Desktop runtime composer
  -> createGoalPrismaRepositories(db) / createGoalPowerSyncRepositories(db)
  -> createTaskPrismaRepositories(db) / createTaskPowerSyncRepositories(db)
  -> module-owned runtime contributions (Goal listeners / Task event + outbox)
  -> createGoalModule({ repository set, taskBindingReadPort, runtimeContributions })
     createTaskModule({ repository set, runtimeContributions })
  -> createGoalApiModule({ instance }) / createGoalElectronModule({ instance })
     createTaskApiModule({ instance }) / createTaskElectronModule({ instance })
```

这里的 `createGoalModule` 与 `createTaskModule` 是 transport-neutral deep modules：它们已经在 `packages/goal/src/server/infrastructure/goal.module.ts:333-459` 与 `packages/task/src/server/infrastructure/task.module.ts:305-417` 完成 use-case/Application Port 组装；本次只把 adapter 选择与 runtime contribution 创建移到宿主。API/Electron module 只做 route/IPC wiring 和 lifecycle，永远不读取 `ctx.db` / `context.db`、不 import concrete Prisma/PowerSync adapter。

必须保持不变的 observable behavior：

- Goal HTTP mounts `/goals` 与 `/goal-folders`（`packages/goal/src/api/module.ts:77-86`）。Task 的真实路由不是一个统一 prefix：`registerTaskRoutes` 固定挂载 `/task-templates`、`/task-instances`、`/tasks`（`packages/task/src/api/routes/index.ts:35-66`）。`TaskApiModuleOptions.routePrefix?` 虽声明在 `packages/task/src/api/module.ts:46-53`，但 `register()` 在 `:69-112` 从未读取它；本计划把它视为 dead option，不把不存在的行为传播到 composer。
- API bootstrap 的 `/api` 与 `/api/v1` 双前缀、模块注册顺序和 destroy 顺序不变（`apps/api/src/bootstrap.ts:136-152,163-175`）。
- Electron 所有 `GoalChannels` / `TaskChannels`、认证 wrapper、controller 和 result envelope 不变（`packages/goal/src/electron/index.ts:100-310`、`packages/task/src/electron/index.ts:128-363`，surface specs 位于 `packages/goal/src/electron/goal-electron.surface.spec.ts:17-33` 与 `packages/task/src/electron/task-electron.surface.spec.ts:11-30`）。
- Goal 的 Task -> Goal `taskBindingReadPort` 必须由 host 提供；Task 的 `goalProgressHandler`、schedule runtime contributions 必须由 host composer 提供。

## 2. 现状分析：Goal / Task 当前组装路径

### 2.1 API host

`apps/api/src/main.ts` 已在 runtime 创建共享 Prisma client，并创建跨模块 adapter：

1. `taskApiModule` 当前在 `apps/api/src/main.ts:175-178` 创建，传入 `scheduleOrchestrationModule.projectionRuntime` 和 `createGoalTaskProgressPrismaHandler(prisma)`。
2. Goal 当前在 `apps/api/src/main.ts:235` 以 `createGoalApiModule({ taskBindingReadPort: new PrismaTaskBindingReadPort(prisma) })` 注册；同文件 `:46-49` 直接从 `@memoflow/goal/api` 与 `@memoflow/task` 导入这些 seam。
3. `packages/goal/src/api/module.ts:13-18,24-25` 引入 `PrismaClient`、`createGoalPrismaModule`、`createGoalRuntimeContribution` 和 `registerGoalEventListeners`；`register(context)` 在 `:52-86` 从 `context.db` 创建完整 module、启动它、创建 listener、创建 controllers/routes。package singleton `activeGoalModule` 与 `goalEventListeners` 位于 `:39-40`，destroy 在 `:89-94` 清理它们。
4. `packages/task/src/api/module.ts:18-38` 引入 Prisma infrastructure 和 outbox concrete；`register(context)` 在 `:69-112` 从 `context.db` 创建 `createTaskPrismaModule`，并在其中构造 `createTaskRuntimeContribution()`、`PrismaTaskGoalOutboxDispatchStore`、`TaskGoalOutboxDispatcher`、`createTaskGoalOutboxRuntime`；`activeTaskModule` singleton 位于 `:61`，destroy 在 `:114-117` 调用异步 `dispose()`。同文件 `:46-53` 声明的 `routePrefix?` 没有被 `register()` 使用；实际固定 mounts 位于 `packages/task/src/api/routes/index.ts:42-64`。
5. `IApiModule.register` 已允许 `Promise<void> | void`（`apps/api/src/shared/contracts/api-module.ts:76-100`），且契约注释已经把目标方向写成 runtime-first（`:68-88`）；本阶段不修改该接口或 `context.db` 字段，因为尚未迁移的 sibling 仍在使用它。

### 2.2 Desktop host

1. `apps/desktop/src/main/main.ts:110-130` 以 PowerSync repositories/schedule sources 组装 schedule orchestration；`:131-134` 创建 `taskElectronModule`，传入 schedule runtime 与 `createGoalTaskProgressPowerSyncHandler(db)`。
2. 当前 Goal 在 `apps/desktop/src/main/main.ts:274,283-285` 只在注册时调用 `createGoalElectronModule({ taskBindingReadPort: new PowerSyncTaskBindingReadPort(db) })`；没有提前绑定 instance。
3. `packages/goal/src/electron/index.ts:21-34,61-91` 在 `register(ctx)` 内从 `ctx.db` 调用 `createGoalPowerSyncModule`，启动 module，写入 `_goalRepository` / `_goalRecordRepository`，再调用 `registerGoalEventListeners`；`:314-324` 移除所有 IPC handlers、停止 listener、dispose module 并清空 globals。
4. `packages/task/src/electron/index.ts:24-44,89-116` 在 `register(ctx)` 内从 `ctx.db` 调用 `createTaskPowerSyncModule`，构造 Task event/outbox runtime，保存 `taskTemplateRepository` / `taskInstanceRepository` globals，并调用未等待的 `taskModule.start()`；`:366-374` 移除 handlers、dispose module、清空 globals。
5. Electron bootstrap 已要求 host 先组装再注册（`apps/desktop/src/main/bootstrap.ts:43-64`），并按逆序 destroy（`:70-89`），因此 Goal/Task composer 可以直接符合现有生命周期，不需改 bootstrapper。

### 2.3 Server ingredient 与 deep module

**Goal。** `GoalModuleDependencies` 在 `packages/goal/src/server/infrastructure/goal.module.ts:86-96` 要求四个 repository、`goalWriteTransactionRunner`、`taskBindingReadPort`，runtime optional，`habitRepository` optional；`GoalModuleInstance` 在 `:189-198` 公开 repositories、`api`、同步 `start/dispose`。`createGoalModule` 的 runtime 只消费传入的 contributions（`:340-348`），并按正序 start、逆序 stop（`:443-457`）。

`packages/goal/src/server/infrastructure/prisma.ts:27-49` 的 `createGoalPrismaModule` 已经创建完整五个 Prisma adapter（包括 `PrismaHabitRepository` 与 `PrismaGoalWriteTransactionRunner`），但 `createGoalPrismaRepositories` 在 `:55-62` 只返回四个 repository，缺少 `habitRepository` 与 transaction runner。`packages/goal/src/server/infrastructure/powersync.ts:27-47` 直接创建四个 PowerSync repository 与 runner，但没有独立 `createGoalPowerSyncRepositories`；仓库中没有 PowerSync Habit adapter（`rg` 只发现 Prisma `PrismaHabitRepository`，位于 `packages/goal/src/server/infrastructure/adapters/prisma/prisma-habit.repository.ts:49`）。因此 Goal set 必须包含可选 `habitRepository?: IHabitRepository`，Prisma set 提供它，PowerSync set 保持 absent，避免虚构新的持久化实现。

**Task。** `TaskModuleDependencies` 在 `packages/task/src/server/infrastructure/task.module.ts:87-94` 需要四个 repository、必需的 `taskWriteTransactionRunner` 与 optional runtime；`TaskModuleInstance` 的 async lifecycle 在 `:165-174`，`createTaskModule` 在 `:317-324,392-415` 自动加入 maintenance runtime、顺序 await start、逆序 await stop。`packages/task/src/server/infrastructure/prisma.ts:35-50` 与 `powersync.ts:42-54` 都已经在 convenience module 中创建 transaction runner，但 `createTaskPrismaRepositories` 仅返回四个 repository（`:56-63`），PowerSync 没有 standalone repository factory。两种 set 必须补齐 `taskWriteTransactionRunner`。

**Cross-module ports。** Task -> Goal read port 的 concrete adapters 由 Task package 暴露：`PrismaTaskBindingReadPort` 在 `packages/task/src/server/infrastructure/index.ts:24-27`，PowerSync variant 在 `:30-38`；host 分别使用 `new PrismaTaskBindingReadPort(prisma)`（`apps/api/src/main.ts:235`）与 `new PowerSyncTaskBindingReadPort(db)`（`apps/desktop/src/main.ts:283-285`）。Goal -> Task progress handler 的 Prisma/PowerSync factories 位于 `packages/goal/src/server/infrastructure/prisma.ts:64-72` 与 `powersync.ts:57-64`，host 当前分别传给 Task（`apps/api/src/main.ts:175-178`、`apps/desktop/src/main.ts:131-134`）。

### 2.4 Electron repository accessor consumers

Goal package 的 `_goalRepository` / `_goalRecordRepository` 与 accessors 在 `packages/goal/src/electron/index.ts:38-55`；Task 的两个 accessor 在 `packages/task/src/electron/index.ts:49-75`。本阶段实查到 Goal accessor 的直接消费者只有：

- `apps/desktop/src/main/services/dashboard-read-service.ts:11-15,96-123`；
- `apps/desktop/src/main/modules/ai/desktop-analytics-read.adapter.ts:1-24`。

`getGoalRecordRepository` 当前没有 apps consumer；Task accessors 被同一 dashboard service 的 `:12,96-115` 与 analytics adapter 的 `:5,10-15` 使用。另有 `DesktopAutomationToolExecutorAdapter` 在 `apps/desktop/src/main/modules/ai/desktop-automation-tool-executor.adapter.ts:10-15,41-49` 自己创建 convenience modules；这属于独立 automation composition，不是 IPC transport adapter，仍可保留 convenience root 作为 rollback/独立工具 seam，但不得引入 package server deep import。

### 2.5 Goal listener 的真实语义

`registerGoalEventListeners` 当前在 API 与 Electron 两个 transport module 中都被调用（API `packages/goal/src/api/module.ts:63-70`，Electron `packages/goal/src/electron/index.ts:84-91`），但实现已在 `packages/goal/src/server/application/event-handlers/index.ts:4-10,31-52` 明确“不再直连订阅 task 事件”，仅保留幂等 `start/stop` 与日志。真正的 durable Task -> Goal 通道是 Task outbox + Goal progress handler（同文件 `:4-6`）。因此本计划不把 listener 继续留在 transport，也不把它误写成新的 event bus；它会成为 Goal module-owned runtime contribution 的一个可逆 wrapper，两个 host 对称注入，保留当前日志与生命周期。

## 3. 目标设计

### 3.1 Ingredient factory contracts

在各 package infrastructure public seam 新增 port-shaped set，concrete class 只在 factory implementation 中出现：

```ts
export interface GoalRepositorySet {
  readonly goalRepository: IGoalRepository;
  readonly goalFolderRepository: IGoalFolderRepository;
  readonly goalRecordRepository: IGoalRecordRepository;
  readonly focusModeRepository: IFocusModeRepository;
  readonly goalWriteTransactionRunner: GoalWriteTransactionRunner;
  readonly habitRepository?: IHabitRepository;
}

export interface TaskRepositorySet {
  readonly taskTemplateRepository: ITaskTemplateRepository;
  readonly taskInstanceRepository: ITaskInstanceRepository;
  readonly taskDependencyRepository: ITaskDependencyRepository;
  readonly taskFolderRepository: ITaskFolderRepository;
  readonly taskWriteTransactionRunner: TaskWriteTransactionRunner;
}
```

其中 `GoalRepositorySet` 的 `habitRepository` 必须保持 optional，原因是当前 `GoalModuleDependencies.habitRepository` 也是 optional（`goal.module.ts:94-95`），且 PowerSync 没有对应 adapter；不得因为“接口完整”而扩展领域模型。

> **Deviation note（相对 §3.1 初稿）**：`TaskRepositorySet.taskFolderRepository` 从初稿的 optional 调整为 **required**。原因：Step 1 实施时 Prisma 与 PowerSync 两个 factory 都始终返回该字段，且 data-portability 消费者依赖它；保持 required 让 set 与 `TaskModuleDependencies` 的差异显式化（`TaskModuleDependencies.taskFolderRepository` 仍为 optional 以容忍其缺失）。该偏差已记录在 `packages/task/src/server/infrastructure/prisma.ts` 的 `TaskRepositorySet` JSDoc 中（"required because both factories always supply it"）。

新增/调整：

- `createGoalPrismaRepositories(db): GoalRepositorySet`：返回当前四个 repository + `PrismaGoalWriteTransactionRunner` + `PrismaHabitRepository`。
- `createGoalPowerSyncRepositories(db): GoalRepositorySet`：返回四个 PowerSync repository + `PowerSyncGoalWriteTransactionRunner`，`habitRepository` 不提供。
- `createTaskPrismaRepositories(db): TaskRepositorySet`：增加 `PrismaTaskWriteTransactionRunner`。
- `createTaskPowerSyncRepositories(db): TaskRepositorySet`：新增并返回四个 PowerSync repository + `PowerSyncTaskWriteTransactionRunner`。

`createGoalPrismaModule` / `createGoalPowerSyncModule` / `createTaskPrismaModule` / `createTaskPowerSyncModule` 必须保留，作为 in-package convenience roots 和 rollback seam；它们只做“repository factory + runtimeContributions + `create*Module`”委托，不重复 concrete adapter wiring。现有 schedule source factories 也改用 repository set，但其公开行为和返回类型不变。Goal/Task barrels 仅导出 ingredient factories、set types、module factory、runtime factory 和 port types；不要新增 package exports subpath，也不要从 root/API/Electron 导出 concrete adapter classes。当前 package exports 仅有 `.`, `./api`, `./electron` 等既有 subpaths（`packages/goal/package.json:10-42`、`packages/task/package.json:10-42`），保持不变。

### 3.2 Goal runtime contributions 与 event listener decision

明确决策：**`registerGoalEventListeners` 放进 deep module 的 runtime contribution，不留在 API/Electron host wiring。**理由：它消费 Goal repositories/transaction runner，并且 API/Electron 当前都需要相同 lifecycle；放在 transport 会造成两边行为漂移，也会让 `register()` 同时承担 assembly 与 side effect。实现上新增 package-owned `createGoalEventListenersRuntime(repositories: Pick<GoalRepositorySet, ...>)`（或等价命名），内部调用现有 `registerGoalEventListeners(...)`，返回 `GoalModuleRuntimeContribution`，`start/stop` 委托并保持幂等。两个 host composer 创建 `[createGoalRuntimeContribution(), createGoalEventListenersRuntime(repositorySet), ...hostContributions]` 后传给 `createGoalModule`。这样 listener 的实现仍属于 Goal package，宿主只选择/传递 runtime ingredient；Goal 目前 no-direct-subscription 的日志语义保持不变。

### 3.3 Host composer interfaces

新增四个 host composer，接口窄而显式：

```ts
// apps/api/src/runtime/compose-goal.ts
export interface ComposeGoalDependencies {
  readonly db: PrismaClient;
  readonly taskBindingReadPort: GoalDependencyReadPort;
  readonly runtimeContributions?: GoalRuntimeContributionsInput;
}
export function composeGoal(deps: ComposeGoalDependencies): GoalApiModuleDef;

// apps/api/src/runtime/compose-task.ts
export interface ComposeTaskDependencies {
  readonly db: PrismaClient;
  readonly runtimeContributions?: TaskRuntimeContributionsInput;
  readonly goalProgressHandler?: TaskGoalProgressHandler;
}
export function composeTask(deps: ComposeTaskDependencies): TaskApiModuleDef;

// apps/desktop/src/main/runtime/compose-goal.ts
export interface ComposeGoalDesktopDependencies {
  readonly db: IElectronDatabase;
  readonly taskBindingReadPort: GoalDependencyReadPort;
  readonly runtimeContributions?: GoalRuntimeContributionsInput;
}
export interface ComposedGoalDesktop {
  readonly module: IElectronModule;
  readonly repositories: Pick<GoalModuleInstance, 'goalRepository' | 'goalRecordRepository'>;
}
export function composeGoal(deps: ComposeGoalDesktopDependencies): ComposedGoalDesktop;

// apps/desktop/src/main/runtime/compose-task.ts
export interface ComposeTaskDesktopDependencies {
  readonly db: IElectronDatabase;
  readonly runtimeContributions?: TaskRuntimeContributionsInput;
  readonly goalProgressHandler?: TaskGoalProgressHandler;
}
export interface ComposedTaskDesktop {
  readonly module: IElectronModule;
  readonly repositories: Pick<
    TaskModuleInstance,
    'taskTemplateRepository' | 'taskInstanceRepository'
  >;
}
export function composeTask(deps: ComposeTaskDesktopDependencies): ComposedTaskDesktop;
```

The exact exported names may be `composeGoal`/`composeTask` per host directory; avoid ambiguous cross-host imports by keeping each file local to its app. The required assembly order in each composer is `db -> repository set -> module-owned runtime contributions + host contributions -> create*Module -> create*{Api,Electron}Module({ instance })`.

`taskBindingReadPort` is never inferred from `db`; the composer receives the already-created host adapter. API main passes `new PrismaTaskBindingReadPort(prisma)`; Desktop main passes `new PowerSyncTaskBindingReadPort(db)`. `goalProgressHandler` is likewise host-provided: API uses `createGoalTaskProgressPrismaHandler(prisma)`, Desktop uses `createGoalTaskProgressPowerSyncHandler(db)`. Task composer constructs the outbox runtime only when that handler exists, using the matching Prisma/PowerSync outbox dispatch store and `TaskGoalOutboxDispatcher`; it also always adds `createTaskRuntimeContribution()`, then appends schedule/other host contributions. The composer deliberately does **not** accept `routePrefix`: it is a currently unused option, while the observable transport contract is the three fixed mounts in `routes/index.ts:42-64`. Removing the dead option is a surface cleanup, not a route change; exact paths are locked by route and smoke tests.

### 3.4 API transport module factories

`createGoalApiModule({ instance })` and `createTaskApiModule({ instance })` accept already-assembled `GoalModuleInstance` / `TaskModuleInstance`. They must not import `PrismaClient`, `ServerModuleContext<PrismaClient>`, `create*PrismaModule`, repository classes, outbox stores, or runtime constructors. Their `register(context)` only:

1. validates state (`created -> registered -> disposed`, with `failed` on partial registration/start failure);
2. wires handlers/controllers/routes before starting the instance, so a failed start cannot leave an unowned transport;
3. calls `instance.start()` exactly once (`await` for Task, synchronous call for Goal);
4. on registration/start failure, best-effort disposes the instance and removes any installed routes/handlers before rethrowing;
5. `destroy()` is idempotent, removes transport resources and awaits Task dispose; Goal dispose remains synchronous at its current interface.

The route mounts remain exact: Goal calls `router.use('/goals', ...)` and `router.use('/goal-folders', ...)`; Task continues calling `registerTaskRoutes(...)`, whose internal fixed mounts remain `/task-templates`, `/task-instances`, and `/tasks` (`packages/task/src/api/routes/index.ts:42-64`). Remove the unused `TaskApiModuleOptions.routePrefix` rather than introducing new routing behavior during an architecture migration. API module definitions keep `register(): Promise<void> | void` compatibility and no package singleton (`activeGoalModule`, `goalEventListeners`, `activeTaskModule`) remains.

### 3.5 Electron transport and repository access decision

`createGoalElectronModule({ instance })` and `createTaskElectronModule({ instance })` receive the instance; `register(ctx)` may use `ctx.auth` for `withAuthenticatedValue`, but never `ctx.db` for composition. IPC handlers are otherwise copied with no channel/payload changes. `destroy()` removes every `Object.values(GoalChannels)` / `Object.values(TaskChannels)` handler, disposes the bound instance once, and is idempotent.

**Decision: relocate Electron repository access to instance-bound desktop composition and inject it into consumers.** Do not keep package-level `_goalRepository` / `taskTemplateRepository` globals as the primary seam. The desktop composers return the small repository view shown in §3.3; `main.ts` passes these views to:

- `getDesktopDashboardData(identityId, repositories)` and `registerDashboardIpcHandler(getAuth, () => repositories)` (or an equivalent closure) instead of importing `getGoalRepository()`/`getTask*Repository()`;
- `new DesktopAnalyticsReadAdapter({ goalRepository, taskTemplateRepository })`;
- any other direct consumer found by the final `rg` inventory.

`getGoalRepository`, `getGoalRecordRepository`, `getTaskTemplateRepository`, and `getTaskInstanceRepository` should be removed from the Electron public seam once all consumers are injected; if an incremental commit needs compatibility, retain them only as a deprecated adapter over an explicitly bound instance registry, with tests proving they cannot be populated by `register(ctx.db)`. The target state is no module-global repository ownership: the composer owns the instance and exposes only port-shaped repository views. This is cleaner than retaining hidden mutable globals, and the verified consumer count is small (two Goal consumers, two Task consumers, no Goal-record consumer).

The automation adapter's independent convenience modules (`apps/desktop/src/main/modules/ai/desktop-automation-tool-executor.adapter.ts:41-49`) may remain in this migration because convenience roots are explicitly retained for rollback/standalone composition; it must continue importing only `@memoflow/goal` / `@memoflow/task`, never `server/infrastructure` deep paths. A follow-up may share composer instances, but that is outside this plan unless lifecycle tests show duplicate runtime ownership.

## 4. 分步实施步骤

### Step 0 — Baseline and inventory

**Scope.** Capture current behavior and failures before editing. Read current surface specs and record all `create*Module`/accessor imports with `rg`.

**Commands (direct Vitest; do not use `pnpm nx run <pkg>:test`, which hangs in this repository):**

```bash
pnpm nx run goal:typecheck
pnpm nx run goal:lint
pnpm nx run task:typecheck
pnpm nx run task:lint
pnpm nx run api:typecheck
pnpm nx run api:lint
pnpm nx run desktop:typecheck
pnpm nx run desktop:lint
node node_modules/vitest/vitest.mjs run --config packages/goal/vitest.config.ts
node node_modules/vitest/vitest.mjs run --config packages/task/vitest.config.ts
node node_modules/vitest/vitest.mjs run --config apps/api/vitest.config.ts
node node_modules/vitest/vitest.mjs run --config apps/desktop/vitest.main.config.ts
node node_modules/vitest/vitest.mjs run --config apps/desktop/vitest.ipc.config.ts
rg -n "createGoalApiModule|createTaskApiModule|createGoalElectronModule|createTaskElectronModule|getGoalRepository|getTaskTemplateRepository" apps packages
```

**独立完成标准：** baseline outputs are recorded; no pre-existing failure is silently attributed to this plan; the import/accessor inventory is attached to the implementation PR.

### Step 1 — Ingredient seams for Goal and Task

**Files:**

- `packages/goal/src/server/infrastructure/prisma.ts`, `powersync.ts`, `goal.module.ts`, `index.ts`, `packages/goal/src/index.ts`;
- `packages/task/src/server/infrastructure/prisma.ts`, `powersync.ts`, `task.module.ts`, `index.ts`, `packages/task/src/index.ts`;
- new focused surface specs for `GoalRepositorySet` / `TaskRepositorySet` and both adapter factories.

**Changes:**

1. Add the two set interfaces and complete all factory return types. Include Goal Prisma habit + transaction runner and both Task transaction runners; add Goal PowerSync factory with optional habit omitted.
2. Make four convenience module factories delegate to set factory + `create*Module`; preserve existing argument forms where tests/standalone callers rely on them, including Task PowerSync's current runtime-contribution input form (`packages/task/src/server/infrastructure/powersync.ts:42-54`).
3. Add `createGoalEventListenersRuntime` (or an equivalent package-owned runtime factory) and export only its port-shaped factory/type. It must wrap existing `registerGoalEventListeners` without changing the no-direct-subscription semantics.
4. Ensure root barrels export ingredient factories/set types/module factory/runtime factory; mark concrete adapters `@internal` and do not add package.json exports.

**Verification:**

```bash
node node_modules/vitest/vitest.mjs run --config packages/goal/vitest.config.ts packages/goal/src/server/infrastructure/goal-repositories.surface.spec.ts
node node_modules/vitest/vitest.mjs run --config packages/task/vitest.config.ts packages/task/src/server/infrastructure/task-repositories.surface.spec.ts
pnpm nx run goal:typecheck && pnpm nx run task:typecheck
pnpm nx run goal:lint && pnpm nx run task:lint
```

**独立完成标准：** both host implementations can obtain the same port-shaped field names; convenience roots still construct a valid module; no app import requires a concrete adapter; existing schedule and transaction-runner tests remain green.

### Step 2 — Transport module factories become instance-bound

**Files:** `packages/goal/src/api/module.ts`, `api/index.ts`, `packages/goal/src/electron/index.ts`; corresponding Task files; new lifecycle specs and updated surface specs.

**Goal changes:** remove `PrismaClient`, `createGoalPrismaModule`, runtime/listener construction, package singletons, and `context.db` reads from API module. `createGoalApiModule({ instance })` wires handlers/routes, then starts instance, and owns idempotent dispose. Electron factory receives `{ instance }`, keeps all existing IPC handlers/auth wrappers, and removes global repository population. Add the listener runtime to composer in Step 3, not here.

**Task changes:** remove Prisma/outbox/runtime imports and `activeTaskModule`; `createTaskApiModule({ instance })` remains async and awaits `instance.start()`/`dispose()`. Remove the unused `routePrefix` option and add a surface assertion that the fixed mounts remain `/task-templates`, `/task-instances`, and `/tasks`. `createTaskElectronModule({ instance })` preserves synchronous `IElectronModule.register` only if the bound instance has already been started by the adapter contract; otherwise make the register method async and await start consistently with `TaskModuleInstance` (preferred: async register is legal in Electron bootstrap because `bootstrap.ts:56-60` already awaits it).

**Lifecycle state machine tests:** for each adapter assert `created -> registered -> disposed`; double register is rejected or is a documented no-op (choose one consistently, preferably fail-closed); start failure enters `failed`, calls dispose once, and removes installed handlers/routes; double destroy is idempotent; no handler remains after destroy. Use fake instances and mocked `ipcMain`/router so tests do not require a database.

**Verification:**

```bash
node node_modules/vitest/vitest.mjs run --config packages/goal/vitest.config.ts packages/goal/src/api packages/goal/src/electron
node node_modules/vitest/vitest.mjs run --config packages/task/vitest.config.ts packages/task/src/api packages/task/src/electron
pnpm nx run goal:typecheck && pnpm nx run task:typecheck
pnpm nx run goal:lint && pnpm nx run task:lint
```

**独立完成标准：** source surface tests prove API modules contain no `PrismaClient`, `context.db`, or `create*PrismaModule`; Electron modules contain no DB composition; route/channel behavior and lifecycle tests pass with an injected fake instance.

### Step 3 — API composers and API entry switch

**Files:** new `apps/api/src/runtime/compose-goal.ts`, `compose-task.ts`; `apps/api/src/main.ts`; new composer surface/order specs; update API integration fixtures only where their use of convenience roots is intentional.

**Composer implementation:**

- `composeGoal({ db, taskBindingReadPort, runtimeContributions })` calls `createGoalPrismaRepositories(db)`, creates Goal runtime contributions (including the listener wrapper), appends supplied runtime contributions, calls `createGoalModule({ ...repositories, taskBindingReadPort, runtimeContributions })`, and returns `createGoalApiModule({ instance })`.
- `composeTask({ db, runtimeContributions, goalProgressHandler })` calls `createTaskPrismaRepositories(db)`, creates `createTaskRuntimeContribution()`, conditionally creates the Prisma outbox runtime from `goalProgressHandler`, appends schedule contributions, calls `createTaskModule({ ...repositories, runtimeContributions })`, and returns `createTaskApiModule({ instance })`.
- Composer tests mock ingredient/module/API factories and assert strict order and exact arguments; no composer imports package `/server` deep paths.

**Entry switch:**

- Replace `createTaskApiModule({...})` at `apps/api/src/main.ts:175-178` with `composeTask({ db: prisma, runtimeContributions: ..., goalProgressHandler: ... })`.
- Replace Goal `createGoalApiModule(...)` at `:235` with a precomputed `const goalApiModule = composeGoal({ db: prisma, taskBindingReadPort: new PrismaTaskBindingReadPort(prisma) })`, then register it at the same position. Keep governance and all other registration order unchanged (`:210-236`).
- Do not move schedule orchestration ownership; only pass its existing projection runtime into composer.

**Verification:**

```bash
node node_modules/vitest/vitest.mjs run --config apps/api/vitest.config.ts apps/api/src/runtime/compose-goal.spec.ts apps/api/src/runtime/compose-task.spec.ts apps/api/src/runtime/compose-goal.surface.spec.ts apps/api/src/runtime/compose-task.surface.spec.ts
pnpm nx run api:typecheck
pnpm nx run api:lint
node node_modules/vitest/vitest.mjs run --config apps/api/vitest.config.ts apps/api/src/bootstrap.spec.ts apps/api/src/__tests__/integration/task-goal-host-restart.integration.test.ts
```

**独立完成标准：** API main has no Goal/Task transport factory call that accepts db; composers are the only API-lane assembly roots; `/api/goals`, `/api/goal-folders`, `/api/task-templates`, `/api/task-instances`, `/api/tasks` and `/api/v1/...` behavior is unchanged; async Task registration is awaited by `ApiBootstrapper`.

### Step 4 — Desktop composers, instance-bound consumers, and entry switch

**Files:** new `apps/desktop/src/main/runtime/compose-goal.ts`, `compose-task.ts`; `apps/desktop/src/main/main.ts`; `dashboard-read-service.ts`, `ipc/dashboard-handler.ts`, `desktop-analytics-read.adapter.ts`; corresponding package Electron lifecycle/surface specs.

**Composer implementation:**

- `composeGoal({ db, taskBindingReadPort, runtimeContributions })` selects PowerSync Goal set, creates Goal runtime/listener contributions, creates `GoalModuleInstance`, and returns `{ module: createGoalElectronModule({ instance }), repositories: { goalRepository, goalRecordRepository } }`.
- `composeTask({ db, runtimeContributions, goalProgressHandler })` selects PowerSync Task set, creates Task runtime + conditional PowerSync outbox runtime, creates instance, and returns module plus `{ taskTemplateRepository, taskInstanceRepository }`.
- No composer passes `db` into a transport factory; `db` is used only by ingredient factories and host-created cross-module adapters.

**Consumer refactor:**

1. Change `getDesktopDashboardData` to receive a repository view (or a `getRepositories` closure) and update `registerDashboardIpcHandler` to close over it. Preserve auth/error envelopes and `DashboardChannels.GET_STATS` (`apps/desktop/src/main/ipc/dashboard-handler.ts:14-63`).
2. Change `DesktopAnalyticsReadAdapter` constructor to receive Goal/Task repository ports; construct it from composer outputs in the existing AI module option callback (`apps/desktop/src/main/main.ts:136-143`).
3. Remove direct imports of `@memoflow/goal/electron` / `@memoflow/task/electron` accessors after `rg` is empty. Remove the package globals/accessors, including unused `getGoalRecordRepository`, or retain a clearly deprecated compatibility registry only for an explicitly bounded migration commit. Target completion is injection, not hidden mutable state.
4. Keep automation adapter convenience modules unchanged unless tests prove duplicate lifecycle ownership; if touched, use only root public factories and ensure it does not start a second long-lived runtime accidentally.

**Entry switch:** replace `createGoalElectronModule(...)` at `apps/desktop/src/main/main.ts:283-285` and the prebuilt `createTaskElectronModule(...)` at `:131-134` with composer results; register `.module` in the same order (Goal before Task, then schedule, Reminder, AI). Use the composer repository views when constructing analytics/dashboard services. Governance composer and bootstrap order remain untouched.

**Verification:**

```bash
node node_modules/vitest/vitest.mjs run --config apps/desktop/vitest.main.config.ts apps/desktop/src/main/__tests__/bootstrap.spec.ts apps/desktop/src/main/services/dashboard-read-service.spec.ts
node node_modules/vitest/vitest.mjs run --config apps/desktop/vitest.ipc.config.ts
node node_modules/vitest/vitest.mjs run --config packages/goal/vitest.config.ts packages/goal/src/electron packages/goal/src/server/application/event-handlers
node node_modules/vitest/vitest.mjs run --config packages/task/vitest.config.ts packages/task/src/electron packages/task/src/server/infrastructure/task-goal-outbox-runtime.spec.ts
pnpm nx run desktop:typecheck
pnpm nx run desktop:lint
```

**独立完成标准：** both hosts use the same transport-neutral Goal/Task module factories with Prisma vs PowerSync sets; no Electron transport module composes from `ctx.db`; dashboard/AI still read the same repositories through explicit instance-bound ports; all IPC channels are registered and removed exactly once.

### Step 5 — Documentation, exports, and surface-spec lock

**Files:** Goal/Task API/Electron JSDoc and barrels; new/updated package surface specs; `apps/api` and `apps/desktop` composer surface specs; `docs/plan/active/README.md` inventory if required by docs check. Do not modify `apps/api/src/shared/contracts/api-module.ts` unless a type-level issue is discovered; its runtime-first documentation is already present at `:68-88`.

**Surface rules to lock:**

- root namespaces export ingredient factories, module factory, runtime contribution factories, and port/set types; concrete Prisma/PowerSync classes do not appear in public root/API/Electron exports;
- `apps/api` imports only `@memoflow/goal`, `@memoflow/goal/api`, `@memoflow/task`, `@memoflow/task/api` public seams; Desktop uses package root and `/electron` only;
- no `@memoflow/goal/server/infrastructure` or `@memoflow/task/server/infrastructure` deep import from apps;
- API module source has no `PrismaClient`/`context.db`/convenience module imports; Electron source has no `ctx.db` composition;
- exact public namespace snapshots are regenerated, not hand-edited around failures.

**Verification:**

```bash
pnpm nx run goal:typecheck && pnpm nx run task:typecheck
pnpm nx run goal:lint && pnpm nx run task:lint
pnpm nx run api:typecheck && pnpm nx run desktop:typecheck
pnpm nx run memoflow:governance-check
pnpm nx run memoflow:docs-check
node node_modules/vitest/vitest.mjs run --config packages/goal/vitest.config.ts packages/goal/src/__tests__ packages/goal/src/api packages/goal/src/electron
node node_modules/vitest/vitest.mjs run --config packages/task/vitest.config.ts packages/task/src/api packages/task/src/electron
```

**独立完成标准：** docs/JSDoc describe host composer ownership in English-first + 中文; root export snapshots and package export audit pass; test inventory is regenerated and includes lifecycle, surface, route/channel, and behavior-invariance cases.

### Step 6 — Done definition and handoff

Before marking this plan complete, attach raw command results and the final `rg` inventory to the implementation PR. The plan may move to archive only when both API and Desktop composers are active, all public seams are locked, and no residual transport-side assembly remains. Any intentionally retained convenience-root use (standalone tests/automation) must be listed explicitly as non-host composition.

## 5. 验证清单

### 5.1 Per-step gates

| 阶段   | Gate                                                                      | Expected result                                                                                                                |
| ------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Step 0 | `goal/task/api typecheck + lint`                                          | baseline and no unexplained new diagnostics                                                                                    |
| Step 0 | direct Vitest configs for Goal, Task, API, Desktop main/IPC               | baseline test inventory captured; no Nx test hang                                                                              |
| Step 1 | Goal/Task repository surface specs                                        | both persistence variants return the same port-shaped dependency names; missing transaction runner is impossible at type level |
| Step 2 | package API/Electron lifecycle specs                                      | state machine, double-register policy, failure cleanup, idempotent destroy, handler removal pass                               |
| Step 3 | API composer order/surface + bootstrap/integration tests                  | Prisma selected only in `apps/api/runtime`; Task async start awaited; paths/envelopes unchanged                                |
| Step 4 | Desktop composer/main/IPC tests                                           | PowerSync selected only in Desktop composer; no DB composition in Electron module; injected repository consumers work          |
| Step 5 | `memoflow:governance-check`, `memoflow:docs-check`                        | exports, JSDoc, surface specs and test inventory pass                                                                          |
| Final  | direct Vitest + `pnpm nx run ...:typecheck/lint` for all touched projects | all required lanes green; no residual unverified behavior change                                                               |

### 5.2 Behavior invariance checklist

- Goal HTTP route mounts and OpenAPI registrations are byte-for-byte equivalent at `/goals` and `/goal-folders`; Task retains the three fixed mounts `/task-templates`, `/task-instances`, `/tasks`. The unused `routePrefix?` declaration is removed without inventing a custom-prefix behavior.
- API bootstrap still mounts the root router at both `/api` and `/api/v1`; Goal remains registered after Task in `main.ts` unless an existing ordering test requires otherwise.
- `GoalApplicationPort` and `TaskApplicationPort` method names, argument order, controllers, Zod validation, status codes, result envelopes and error mapping are unchanged.
- Goal Task-binding fail-closed behavior remains: missing `taskBindingReadPort` throws in the module/composer seam, as existing surface specs assert (`packages/goal/src/api/__tests__/goal-api-module-gate.surface.spec.ts:14` and `packages/goal/src/electron/goal-electron.surface.spec.ts:66-83`).
- Task outbox is enabled iff `goalProgressHandler` is supplied; dispatch store remains Prisma on API and PowerSync on Desktop; no duplicate outbox runtime is created on double register.
- Goal listener wrapper preserves current no-direct-task-subscription log and idempotent start/stop; durable progress still flows through Task outbox and `GoalTaskProgressHandler`.
- Every Goal/Task IPC channel in `Object.values(GoalChannels/TaskChannels)` is registered once and removed once; payload normalization/auth wrappers are unchanged.
- `start()`/`dispose()` ordering stays runtime contribution forward/reverse; Task awaits async contributions, Goal keeps synchronous contract unless its module interface is deliberately widened with corresponding adapter tests.

## 6. 风险与回滚

### 6.1 Risks

1. **Incomplete repository set.** Missing transaction runners can compile only if the set uses inference. Explicit `GoalRepositorySet`/`TaskRepositorySet` return types and surface tests prevent this regression; no module factory may construct a hidden runner fallback (`goal.module.ts:205-211`, `task.module.ts:201-204`).
2. **Goal PowerSync habit mismatch.** No PowerSync Habit adapter exists. Keep `habitRepository` optional and preserve current Electron behavior; do not silently claim habit parity.
3. **Cross-module adapter identity.** `taskBindingReadPort` and `goalProgressHandler` must be created by the same host database lane as repositories. Composer tests assert exact object pass-through, and integration tests cover host restart.
4. **Async lifecycle mismatch.** Task `start/dispose` are async (`task.module.ts:392-415`), while Goal is sync (`goal.module.ts:443-457`). API and Electron adapter contracts must await Task; failure cleanup must handle a rejected start. Do not use `void taskModule.start()` in the migrated transports.
5. **IPC handler leakage.** Registering handlers before a failed start can leave `ipcMain` state. Wire into local removal bookkeeping and test failed registration; `destroy()` must be safe after partial registration.
6. **Repository access regression.** Dashboard/AI are currently initialized through callbacks and shell IPC (`dashboard-handler.ts:14-25`, `main.ts:136-143,375`). Pass instance-bound views through those callbacks and test before removing accessors.
7. **Duplicate standalone modules.** Automation currently creates its own Goal/Task convenience instances (`desktop-automation-tool-executor.adapter.ts:41-49`). Keep this explicit and short-lived; if lifecycle tests show they overlap with registered instances, refactor it to consume composer views in a separate change rather than reintroducing globals.
8. **Surface drift.** Existing barrels currently expose many concrete adapters (Goal `server/infrastructure/index.ts:13-27`; Task `:15-38`). The migration must narrow app-facing exports without changing package.json subpaths; update surface specs and generated inventory together.

### 6.2 Lifecycle and rollback policy

- **Created/registered/disposed/failed state:** composer creates exactly one instance; transport register can run once; failed registration performs best-effort cleanup and rethrows; destroy is idempotent and clears only resources it owns.
- **API rollback:** restore `main.ts` calls to `createTaskApiModule` / `createGoalApiModule` and the old context.db assembly while retaining domain/use-case changes (there should be none). Re-run API and package tests; no DB migration is involved.
- **Desktop rollback:** restore `createGoalElectronModule({ taskBindingReadPort })` and prebuilt `createTaskElectronModule({...})` registration, and temporarily restore accessor binding only if injected consumers cannot be recovered in the same commit. Do not revert unrelated governance composer changes.
- **Ingredient rollback:** convenience `create*PrismaModule`/`create*PowerSyncModule` remain callable throughout Step 1, so a composer can be switched back without data changes.
- Never use `git reset --hard` or overwrite unrelated user changes; rollback is a targeted source change followed by direct tests.

## 7. 成功标准

- [x] `apps/api/src/runtime/compose-goal.ts` and `compose-task.ts` own Prisma adapter selection and return instance-bound API transport modules.
- [x] `apps/desktop/src/main/runtime/compose-goal.ts` and `compose-task.ts` own PowerSync adapter selection and return instance-bound Electron transport modules plus explicit repository views.
- [x] Goal and Task repository factories return complete port-shaped `GoalRepositorySet` / `TaskRepositorySet`; transaction runners are present; Goal habit remains correctly optional on PowerSync.
- [x] `createGoalModule` / `createTaskModule` remain the single transport-neutral deep module factories; domain/application/use-case behavior is unchanged.
- [x] Goal listener lifecycle is a package-owned runtime contribution passed by both host composers; no API/Electron transport module calls `registerGoalEventListeners` directly.
- [x] API/Electron module factories accept `{ instance }`, never compose from DB, have explicit lifecycle state, failure cleanup, handler removal, and idempotent destroy.
- [x] API main passes `PrismaTaskBindingReadPort(prisma)` and `createGoalTaskProgressPrismaHandler(prisma)` through composers; Desktop passes PowerSync equivalents; no port is inferred from transport context.
- [x] Goal routes, Task fixed mounts (`/task-templates`, `/task-instances`, `/tasks`), IPC channels, auth wrappers, controllers, envelopes and `/api` + `/api/v1` behavior are unchanged; the unused `routePrefix?` option is removed rather than propagated.
- [x] Dashboard and AI consumers use instance-bound repository ports; package-level Electron repository globals/accessors are removed or explicitly deprecated only as a temporary migration shim, never as hidden composition ownership.
- [x] Package root barrels export only ingredient factories, module factories, runtime contribution factories and types; concrete adapter classes do not leak through app-facing seams; package.json exports remain unchanged.
- [x] English-first + 中文 JSDoc explains composer/transport/deep-module ownership; docs and surface specs match implementation; test inventory is regenerated.
- [x] `goal:typecheck`, `task:typecheck`, `api:typecheck`, `desktop:typecheck`, touched-project lint, direct Goal/Task/API/Desktop Vitest lanes, `pnpm nx run memoflow:governance-check`, and `pnpm nx run memoflow:docs-check` all pass. `pnpm nx run <pkg>:test` is intentionally not used because it hangs.
- [x] Only after every checkbox is satisfied may this file move from `docs/plan/active` to `docs/plan/archive`.
