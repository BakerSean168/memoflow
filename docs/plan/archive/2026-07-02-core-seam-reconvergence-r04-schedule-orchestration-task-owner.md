---
tags:
  - plan
  - archive
  - architecture
  - refactor
  - rounds
  - r04
description: R04 执行文档，新建 schedule-orchestration 包，并接管 task projection 的最终 owner 身份
created: 2026-07-02T00:00:00+08:00
updated: 2026-07-03T18:20:00+08:00
---

# R04 Schedule Orchestration Task Owner

## 1. Objective

建立真正的系统级 `schedule-orchestration` 包，并让它成为 task projection 的唯一 owner。

本轮的关键不是“把文件搬家”，而是把 owner 收敛进一个真正深的 module：

- feature package 只保留 task-specific projection rules
- orchestration package 持有删旧、重建、保存、事件订阅这类系统级协作复杂度
- host 只负责实例化 module，不再保存临时 owner 文件

## 2. Why This Round Exists

`R03` 只是把 owner 从 task 包里抬到 host 级，目的是先切开边界。`R04` 才是把 owner 收进正确的系统模块，让 host 重新变薄。

如果 `R04` 不做，`apps/api/src/main.ts` 和 `apps/desktop/src/main/main.ts` 仍然会持有“半个业务 runtime”，这不算真正收口。

## 3. Entry Conditions

- `R03` 已 done
- task projection source port 已稳定
- typed event seam 已可复用
- 当前 host-level owner 只是过渡形态，不允许长期保留

## 4. Completed Snapshot

本轮已经完成收口，当前结构符合预期：

- `packages/schedule-orchestration/` 已成为 task projection 的唯一系统级 owner
- `TaskProjector`、`TaskProjectionRuntime`、`createScheduleOrchestrationModule(...)` 已接入实际 host
- `apps/api` 和 `apps/desktop` 只保留 source adapter 选择与 module 实例化
- host 上临时 task owner 文件已经删除

这轮真正完成的，不只是“把代码搬进新包”，而是把 seam 也一起收窄了：

- `schedule-orchestration` 不再依赖过宽的 `@memoflow/task/api`
- task projection contract 已通过 `@memoflow/task/schedule-projection` 单独暴露
- `schedule-orchestration` 的 build/typecheck/test/governance 已恢复通过

## 5. Implemented Correction

### 5.1 已收窄 task 的 projection public seam

新增一个显式、窄、稳定的 task 子路径：

```ts
@memoflow/task/schedule-projection
```

这个子路径只应该暴露：

- `TaskScheduleProjectionSource`
- `TaskScheduleProjectionSelection`
- `TaskScheduleProjectionPlan`
- `TaskScheduleProjectionHandlers`
- `TaskScheduleProjectionEventMap`
- `createTaskScheduleProjectionEventHandlers(...)`
- 如确有必要，再补 `taskScheduleProjectionEventNames`

它不应该暴露：

- task api module
- prisma / powersync adapter
- controller / route / runtime / transport
- task 包内部其余宽导出

### 5.2 `schedule-orchestration` 已只依赖窄 seam

以下文件全部改为依赖窄出口：

- `packages/schedule-orchestration/src/ports/task-projection.ts`
- `packages/schedule-orchestration/src/projectors/task-projector.ts`
- `packages/schedule-orchestration/src/runtime/task-projection-runtime.ts`
- `packages/schedule-orchestration/src/infrastructure-server/schedule-orchestration.module.ts`

目标依赖关系应收敛为：

```text
apps/api or apps/desktop
  -> host-specific source factory
  -> schedule-orchestration
  -> @memoflow/task/schedule-projection (contract only)
```

而不是：

```text
schedule-orchestration
  -> @memoflow/task/api
  -> task api barrel
  -> task infra / adapters / unrelated exports
```

### 5.3 schedule 侧已优先使用更窄出口

如果 `@memoflow/schedule` 根出口已经稳定导出 `ScheduleTask` 和 `IScheduleTaskRepository`，优先使用根出口或更窄出口，不要为了省事再次拉宽到 `@memoflow/schedule/api`。

## 6. In Scope

- 新建并收口 `packages/schedule-orchestration`
- `packages/task` 的窄 projection public seam
- `apps/api`
- `apps/desktop`
- `packages/schedule` 的少量依赖路径收窄
- `schedule-orchestration` 自身的 typecheck / test / build 配置

## 7. Out Of Scope

- goal/reminder projection 迁移
- source executor ownership
- controller seam
- route seam
- ID fixture 清理

## 8. Must Delete In This Round

- host 上只为 task 准备的临时 runtime contribution 入口
- `schedule-orchestration` 对 `@memoflow/task/api` 的依赖
- 任何继续把 task projection owner 挂在 feature 包或 host 零散文件里的路径

## 9. Target Shape

### 9.1 Public contract

```ts
export interface ScheduleOrchestrationModule {
  readonly taskProjectionRuntime: RuntimeContribution;
}

export interface CreateScheduleOrchestrationModuleOptions {
  readonly taskProjection: {
    readonly source: TaskScheduleProjectionSource;
    readonly scheduleTaskRepository: IScheduleTaskRepository;
  };
}
```

### 9.2 Ownership graph

```text
task package
  -> owns projection rules
  -> owns event-to-action mapping contract

schedule-orchestration package
  -> owns projector
  -> owns runtime subscription lifecycle
  -> owns delete/rebuild/save orchestration

apps/api / apps/desktop
  -> owns source adapter selection only
  -> does not own projection runtime logic
```

## 10. File Checklist

### Add or update in `packages/task`

- `packages/task/src/schedule-projection/index.ts`
- `packages/task/package.json`

### Add or update in `packages/schedule-orchestration`

- `src/ports/task-projection.ts`
- `src/projectors/task-projector.ts`
- `src/runtime/task-projection-runtime.ts`
- `src/infrastructure-server/schedule-orchestration.module.ts`
- `src/__tests__/task-projection-runtime.test.ts`
- `tsconfig.json`
- `tsup.config.ts`
- `vitest.config.ts`

### Host touch points

- `apps/api/src/main.ts`
- `apps/desktop/src/main/main.ts`

## 11. Suggested Execution Slices

1. 建立 `@memoflow/task/schedule-projection` 窄公共出口
2. 改 `schedule-orchestration` 只依赖窄 seam
3. 修正 `schedule-orchestration` 的 tsconfig / tsup / vitest 映射
4. 收尾 `TaskProjector` 与 `TaskProjectionRuntime` 的类型问题
5. 跑 `schedule-orchestration` 自身验证
6. 再跑 host 级 typecheck，确认新包被正确消费

## 12. Suggested Commit Slices

1. task 窄 seam
2. orchestration import 收窄
3. package config 收尾
4. runtime tests / typecheck 收尾

## 13. Do Not Do

- 不要继续从 `@memoflow/task/api` re-export 一层“临时 projection seam”
- 不要把 task-specific source builder 一起塞进 `schedule-orchestration`
- 不要为了通过测试，继续在 vitest 里堆 deep alias 去兜住 task 宽导出
- 不要在 host 重新生成临时 owner 文件

## 14. Verification

### Preferred

- `pnpm nx run schedule-orchestration:typecheck`
- `pnpm nx run schedule-orchestration:test`
- `pnpm nx run api:typecheck`
- `pnpm nx run task:test`
- `pnpm nx run schedule:test`

### Known local fallback when `pnpm` hits `ERR_PNPM_IGNORED_BUILDS`

- `.\node_modules\.bin\nx.cmd run schedule-orchestration:typecheck`
- `.\node_modules\.bin\nx.cmd run schedule-orchestration:test`
- `.\node_modules\.bin\nx.cmd run api:typecheck`
- `.\node_modules\.bin\nx.cmd run task:test`
- `.\node_modules\.bin\nx.cmd run schedule:test`

### Existing noise to record, not to “solve accidentally” inside this round

- `api:test:smoke` 仍可能被既有 `@memoflow/patterns/scheduler` 解析失败阻塞
- `desktop:test:main` 仍可能被既有 Electron 安装与 auth 测试基线阻塞
- `desktop:typecheck` 仍可能被上游 `ui-vue-shadcn:build` 的现有 `TS2742` 阻塞

## 15. Exit Criteria

- task projection owner 只剩 `schedule-orchestration`
- `schedule-orchestration` 不再依赖 `@memoflow/task/api`
- task feature package 不再保留 projection runtime
- host 不再保留仅服务于 task projection 的零散 owner 文件
- `schedule-orchestration` 自身有最小一层 runtime tests

## 16. Handoff

`R05` 可以把 goal/reminder 按完全相同的模式并进来，而不是再单独设计一套 owner 模型。

## 17. Status Note

- Date: 2026-07-03
- Status: done
- What changed: `packages/task` 新增 `@memoflow/task/schedule-projection` 窄公共出口；`packages/schedule-orchestration` 全面切到窄 seam 和 `@memoflow/schedule` 根出口；host 继续只负责实例化 source 与 orchestration module；`schedule-orchestration` 的 DTS 构建基准目录与治理白名单已同步收口。
- Old path deleted: `apps/api/src/modules/task-schedule-projection/runtime.ts`、`apps/desktop/src/main/modules/schedule/task-schedule-projection.runtime.ts`
- Verification: `.\node_modules\.bin\nx.cmd run schedule-orchestration:typecheck`、`.\node_modules\.bin\nx.cmd run schedule-orchestration:test`、`.\node_modules\.bin\nx.cmd run schedule:test`、`.\node_modules\.bin\nx.cmd run task:test`、`.\node_modules\.bin\nx.cmd run api:typecheck`、`.\node_modules\.bin\nx.cmd run schedule-orchestration:build`、`.\node_modules\.bin\nx.cmd run memoflow:governance-check` 通过。
- Remaining follow-up: 进入 `R05`，沿同一 owner 模型把 goal/reminder projection 收回 `schedule-orchestration`。
