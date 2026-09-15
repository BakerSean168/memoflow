# @memoflow/goal

目标模块 — OKR 目标与关键结果管理。Goal 与 Governance 一样使用 host-composer 装配模式：模块只暴露 transport-neutral 的深模块工厂与 ingredient factory，宿主运行时选择持久化 adapter 并组装 instance。

## 公开 seam

```text
@memoflow/contracts/goal

@memoflow/goal
@memoflow/goal/api
@memoflow/goal/electron
@memoflow/goal/client
```

## 模块职责

- `@memoflow/goal`：transport-neutral 深模块工厂 `createGoalModule` + 宿主装配 ingredient factory（`createGoalPrismaRepositories` / `createGoalPowerSyncRepositories` / `createGoalRuntimeContribution` / `createGoalEventListenersRuntime`）+ port/set 类型（`GoalRepositorySet` 等）
- `@memoflow/goal/api`：HTTP 传输与生命周期适配器（接收已装配的 `{ instance }`，不含组合）
- `@memoflow/goal/electron`：IPC 传输与生命周期适配器（接收已装配的 `{ instance }`，不含组合）
- `@memoflow/goal/client`：Web / Desktop renderer 客户端 seam

## 内部结构标准

```text
packages/goal/src/
├── api/                    # HTTP module 与 resource-first routes（transport-only）
├── client/                 # renderer client seam
├── electron/               # desktop main seam（transport-only）
├── server/
│   ├── domain/             # 聚合根、实体、仓储接口、值对象
│   ├── application/        # use cases / GoalApplicationPort
│   ├── transport/          # controller 与 transport 翻译
│   └── infrastructure/     # adapters / runtime / 深模块工厂 / convenience root
└── index.ts                # root public entry（ingredient + module factory + types）
```

## 关键收敛点

- **Goal vNext identity/lifecycle (GOAL-7202)**：Goal 根身份只有 `name + summary`；业务状态只有 `Planned | InProgress | Completed | Abandoned`。状态只通过带 optimistic-concurrency 的 `plan / activate / complete / abandon` 动作改变；archive 独立，时间/KR/提醒/任务副作用不得自动推导状态。
- 具体 `*Repository` class（`GoalPrismaRepository`、`GoalPowerSyncRepository` 等）是内部实现，不通过 root / api / electron 公开导出
- `createGoalPrismaModule` / `createGoalPowerSyncModule` 是包内 convenience roots（测试与 rollback 用），不是宿主组合入口
- Goal -> Task 进度 handler 工厂（`createGoalTaskProgressPrismaHandler` / `createGoalTaskProgressPowerSyncHandler`）由 root 暴露给宿主，由宿主传给 Task composer

## Composition ownership

Goal 的宿主装配（composition）由两个 runtime composer 完成，而不是由 `api`/`electron` module 在 register 内隐式组合：

- **API lane composer**：`apps/api/src/runtime/compose-goal.ts`（Prisma）。选择 Prisma adapter → `createGoalPrismaRepositories(db)` → `createGoalRuntimeContribution()` + `createGoalEventListenersRuntime(...)` + host contributions → `createGoalModule(...)` → `createGoalApiModule({ instance })`。
- **Desktop lane composer**：`apps/desktop/src/main/runtime/compose-goal.ts`（PowerSync）。选择 PowerSync adapter → `createGoalPowerSyncRepositories(db)` → 同样 runtime contributions → `createGoalModule(...)` → `createGoalElectronModule({ instance })`。
- 两个宿主复用同一个 transport-neutral 的 `createGoalModule()` / `GoalApplicationPort`，只替换持久化 adapter，从而从构造上保证 HTTP/IPC 行为一致。
- `taskBindingReadPort` 必须由宿主提供（API 传 `new PrismaTaskBindingReadPort(prisma)`，Desktop 传 `new PowerSyncTaskBindingReadPort(db)`），绝不从 `db` 推断。
- `api` / `electron` module 只是 transport + lifecycle 适配器：只做路由 / IPC handler 注册与 instance 的 start/dispose，不创建 Repository、use case 或 runtime adapter。
