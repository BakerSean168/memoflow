# @memoflow/task

任务模块 — 任务模板、实例与依赖管理。Task 与 Governance / Goal 一样使用 host-composer 装配模式：模块只暴露 transport-neutral 的深模块工厂与 ingredient factory，宿主运行时选择持久化 adapter 并组装 instance。

## 公开 seam

```text
@memoflow/contracts/task

@memoflow/task
@memoflow/task/api
@memoflow/task/electron
@memoflow/task/client
@memoflow/task/testing
```

## 模块职责

- `@memoflow/task`：transport-neutral 深模块工厂 `createTaskModule` + 宿主装配 ingredient factory（`createTaskPrismaRepositories` / `createTaskPowerSyncRepositories` / `createTaskRuntimeContribution` / `createTaskPrismaGoalOutboxRuntime` / `createTaskPowerSyncGoalOutboxRuntime`）+ port/set 类型（`TaskRepositorySet` 等）
- `@memoflow/task/api`：HTTP 传输与生命周期适配器（接收已装配的 `{ instance }`，不含组合）
- `@memoflow/task/electron`：IPC 传输与生命周期适配器（接收已装配的 `{ instance }`，不含组合）
- `@memoflow/task/client`：Web / Desktop renderer 客户端 seam
- `@memoflow/task/testing`：测试 fixture seam

## 内部结构标准

```text
packages/task/src/
├── api/                    # HTTP module 与 resource-first routes（transport-only）
├── client/                 # renderer client seam
├── electron/               # desktop main seam（transport-only）
├── server/
│   ├── domain/             # 聚合根、实体、仓储接口、值对象
│   ├── application/        # use cases / TaskApplicationPort
│   ├── transport/          # controller 与 transport 翻译
│   └── infrastructure/     # adapters / runtime / 深模块工厂 / convenience root
├── testing/                # test fixtures
└── index.ts                # root public entry（ingredient + module factory + types）
```

## 关键收敛点

- 具体 `*Repository` class（`TaskPlanPrismaRepository`、`PowerSyncTaskOccurrenceRepository` 等）是内部实现，不通过 root / api / electron 公开导出
- `createTaskPrismaModule` / `createTaskPowerSyncModule` 是包内 convenience roots（测试与 rollback 用），不是宿主组合入口
- Task -> Goal outbox runtime 由 host 在提供 `goalProgressHandler` 时构造（API 用 `createTaskPrismaGoalOutboxRuntime`，Desktop 用 `createTaskPowerSyncGoalOutboxRuntime`），dispatch store 随之是 Prisma / PowerSync；Task->Goal read port（`PrismaTaskBindingReadPort` / `PowerSyncTaskBindingReadPort`）由 Task 包暴露给宿主
- Task 路由固定挂载 `/task-plans`、`/task-occurrences`、`/tasks`，无自定义 prefix

## Composition ownership

Task 的宿主装配（composition）由两个 runtime composer 完成，而不是由 `api`/`electron` module 在 register 内隐式组合：

- **API lane composer**：`apps/api/src/runtime/compose-task.ts`（Prisma）。选择 Prisma adapter → `createTaskPrismaRepositories(db)` → `createTaskRuntimeContribution()` + 条件 outbox runtime（提供 `goalProgressHandler` 时）+ schedule 等 host contributions → `createTaskModule(...)` → `createTaskApiModule({ instance })`。
- **Desktop lane composer**：`apps/desktop/src/main/runtime/compose-task.ts`（PowerSync）。选择 PowerSync adapter → `createTaskPowerSyncRepositories(db)` → 同样 runtime contributions → `createTaskModule(...)` → `createTaskElectronModule({ instance })`。
- 两个宿主复用同一个 transport-neutral 的 `createTaskModule()` / `TaskApplicationPort`，只替换持久化 adapter，从而从构造上保证 HTTP/IPC 行为一致。
- `goalProgressHandler` 必须由宿主提供（API 传 `createGoalTaskProgressPrismaHandler(prisma)`，Desktop 传 `createGoalTaskProgressPowerSyncHandler(db)`）；outbox runtime 仅在提供该 handler 时启用。
- `api` / `electron` module 只是 transport + lifecycle 适配器：只做路由 / IPC handler 注册与 instance 的 start/dispose，不创建 Repository、use case 或 runtime adapter。
