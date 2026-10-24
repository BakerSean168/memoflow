---
tags:
  - plan
  - archive
  - architecture
  - refactor
  - rounds
  - r06
description: R06 执行文档，把 source executor ownership 与通知执行链收回 orchestration，压薄 apps/api 与 apps/desktop 的宿主层
created: 2026-07-02T00:00:00+08:00
updated: 2026-07-03T20:54:00+08:00
---

# R06 Source Executor Host Thinning

## 1. Objective

把 `apps/api` 和 `apps/desktop` 中手工拼装的跨域执行链收回到 `schedule-orchestration`，让宿主层恢复成纯 composition root。

## 2. Why This Round Exists

如果 projection owner 已统一，但 source executor 与 notification 仍散落在 host，宿主层依旧知道太多底层细节，核心复杂度并没有真正收回。

当前 `createSharedSourceExecutor(...)` 虽然复用了逻辑，但它仍然放在 `packages/schedule` 里，并承载了 task/goal/reminder/notification 的系统级业务知识。这对 `schedule` 来说过深、也过宽。

`R06` 的优雅目标是：

- `schedule` 只定义 runtime contract
- `schedule-orchestration` 拥有跨域 execution routing
- host 只注入高层 ports，不再组装 repo/use-case 图

当前已经能明确看到两块待收口 owner：

- `apps/api/src/main.ts` 仍通过 `createSharedSourceExecutor(...)`、`create*PrismaRepositories(...)` 和 `CreateNotificationUseCase` 手工拼装执行链
- `apps/desktop/src/main/modules/schedule/source-executors.ts` 仍保留 reminder/goal/task 三套 per-source executor 与通知创建逻辑

这意味着 projection owner 虽已统一，但 execution owner 仍然分裂成 API 一套、desktop 一套、`packages/schedule` 一套。

## 3. Entry Conditions

- `R05` 已 done
- 三类 projection owner 已统一
- `schedule-orchestration` 已经是 projection runtime 的唯一入口

## 4. In Scope

- `packages/schedule-orchestration`
- `packages/notification`
- `packages/schedule`
- `apps/api/src/main.ts`
- `apps/desktop/src/main/main.ts`

## 5. Out Of Scope

- controller seam
- strict ID contract
- host-level direct tests

## 6. Must Delete In This Round

- `apps/api/src/main.ts` 中跨域 repo/use-case/sourceExecutor 的手工拼装
- `apps/desktop/src/main/main.ts` 中等价的跨域执行链拼装
- `packages/schedule` 中对 reminder/goal/task/notification 业务规则的 owner 身份

## 7. Target Shape

### 7.1 `schedule` 只保留运行时 contract

`packages/schedule` 继续只拥有：

- `ScheduleTaskSourceExecutor` interface
- `ScheduleTaskExecutionResult`
- queue/runtime 行为

它不再拥有：

- `createSharedSourceExecutor(...)` 里的跨域业务分发知识
- 对 notification/task/goal/reminder repo 的装配知识

### 7.2 `schedule-orchestration` 拥有 execution router

建议的最终形态：

```ts
export interface ScheduleOrchestrationModule {
  readonly projectionRuntime: RuntimeContribution;
  readonly sourceExecutor: ScheduleTaskSourceExecutor;
}
```

内部结构：

```text
packages/schedule-orchestration
  -> execution/
     -> schedule-execution-router.ts
     -> task-execution-adapter.ts
     -> goal-execution-adapter.ts
     -> reminder-execution-adapter.ts
     -> notification-port.ts
```

### 7.3 host 只注入 ports，不再组装 repo 图

host 只需要做：

- 选择 Prisma 还是 PowerSync 版本的 adapter
- 实例化 `createScheduleOrchestrationModule(...)`
- 把 `module.sourceExecutor` 传给 `createScheduleApiModule(...)` 或 `createScheduleElectronModule(...)`

host 不需要再做：

- `createGoalPrismaRepositories(...)`
- `createTaskPrismaRepositories(...)`
- `createReminderPrismaRepositories(...)`
- `new CreateNotificationUseCase(...)`
- `createSharedSourceExecutor(...)`

## 8. File Checklist

### Orchestration side

- `packages/schedule-orchestration/src/execution/*`
- `packages/schedule-orchestration/src/infrastructure-server/schedule-orchestration.module.ts`
- 相关 tests

### Schedule side

- `packages/schedule/src/application-server/source-executors/runtime-contract.ts`
- `packages/schedule/src/application-server/source-executors/shared-source-executor.ts`
- `packages/schedule/src/api/index.ts` 等导出路径

### Host touch points

- `apps/api/src/main.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/modules/schedule/source-executors.ts`

## 9. Suggested Execution Slices

1. 锁定 API 与 desktop 当前 execution owner 的共同 shape，提炼 orchestration 所需最小 port
2. 把 `shared-source-executor.ts` 与 `apps/desktop/.../source-executors.ts` 的业务分发知识迁入 orchestration
3. 让 `schedule` 退回只依赖 `ScheduleTaskSourceExecutor`
4. 下沉 notification adapter / use-case 装配
5. 切换 API host 到 module-level wiring
6. 切换 desktop host 到 module-level wiring
7. 删除 host 中跨域拼装细节
8. 删除 `packages/schedule` 与 desktop 本地模块中不该继续保留的 shared owner

## 10. Suggested Commit Slices

1. execution ports
2. orchestration execution router
3. API host 接线切换
4. desktop host 接线切换
5. 删除 `shared-source-executor.ts`、desktop source executors 和 host 手工拼装

## 11. Do Not Do

- 不要把 `createSharedSourceExecutor(...)` 原样复制一份到 orchestration 再双轨保留
- 不要把 `createDesktopSourceExecutor(...)` 原样搬进 orchestration 再保留旧文件
- 不要让 `schedule` 继续成为“泛系统业务执行器”
- 不要把 notification 的具体 repo 细节暴露到 orchestration 公共接口
- 不要一边做 `R06` 一边顺手改 controller seam

## 12. Verification

### Preferred

- `pnpm nx run api:typecheck`
- `pnpm nx run api:test`
- `pnpm nx run api:test:smoke`
- `pnpm nx run schedule:test`
- `pnpm nx run schedule-orchestration:test`

### Known local fallback when `pnpm` hits `ERR_PNPM_IGNORED_BUILDS`

- `.\node_modules\.bin\nx.cmd run api:typecheck`
- `.\node_modules\.bin\nx.cmd run api:test`
- `.\node_modules\.bin\nx.cmd run api:test:smoke`
- `.\node_modules\.bin\nx.cmd run schedule:test`
- `.\node_modules\.bin\nx.cmd run schedule-orchestration:test`

## 13. Exit Criteria

- host 不再知道如何跨域拼装执行链
- `schedule` 不再持有 task/goal/reminder/notification 的业务知识
- orchestration 对外接口仍然小而明确
- API 与 desktop 都通过 module-level wiring 使用同一条 execution router

## 14. Handoff

`R07` 将在更薄的 host 之上统一 controller 和 route seam，不再被 composition root 噪声干扰。

## 15. Status Note

- Date: 2026-07-03
- Status: done
- What changed: `schedule-orchestration` 已成为 execution router 的唯一 owner；`task`、`goal`、`reminder`、`notification` 都通过 `schedule-execution` 窄公共出口向 orchestration 暴露最小执行 port；API / desktop host 现在都只注入 `scheduleOrchestrationModule.sourceExecutor`，不再手工拼装跨域执行链。
- Old path deleted: `packages/schedule/src/application-server/source-executors/shared-source-executor.ts`、`packages/schedule/src/application-server/source-executors/types.ts`、`apps/desktop/src/main/modules/schedule/source-executors.ts`；`apps/api/src/main.ts` 与 `apps/desktop/src/main/main.ts` 中旧的 host-local execution assembly 已移除。
- Verification: `.\node_modules\.bin\nx.cmd run schedule-orchestration:build`、`schedule-orchestration:test`、`api:typecheck`、`api:test`、`api:test:smoke`、`schedule:test`、`.\node_modules\.bin\tsc.cmd --noEmit -p apps/desktop/tsconfig.typecheck.json` 通过。
- Remaining follow-up: 进入 `R07`，统一 controller seam 与 route registration seam。
