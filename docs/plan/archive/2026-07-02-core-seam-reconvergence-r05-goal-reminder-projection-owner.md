---
tags:
  - plan
  - archive
  - architecture
  - refactor
  - rounds
  - r05
description: R05 执行文档，把 goal/reminder 的 projection ownership 迁入 schedule-orchestration，收口三类 source 的统一 owner
created: 2026-07-02T00:00:00+08:00
updated: 2026-07-03T19:10:00+08:00
---

# R05 Goal Reminder Projection Owner

## 1. Objective

让 task、goal、reminder 三类 projection 统一归属于 `schedule-orchestration`，结束多模块各自维护 projection owner 的状态。

## 2. Why This Round Exists

只迁 task 还不够。只要 goal/reminder 仍然自持 owner，projection 事实来源就仍然分裂，后续执行链和测试都无法真正统一。

`R04` 只是证明 task 这条线可以被系统模块接管。`R05` 负责把这个 owner 模型扩成完整、对称、可维护的系统边界。

## 3. Entry Conditions

- `R04` 已 done
- `schedule-orchestration` 已经接管 task projection
- API 与 desktop host 已经以 orchestration 为唯一 task projection 入口

## 4. In Scope

- `packages/goal`
- `packages/reminder`
- `packages/schedule-orchestration`
- `apps/api`
- `apps/desktop`

## 5. Out Of Scope

- source executor ownership
- controller seam 与 route seam
- strict ID contract

## 6. Must Delete In This Round

- `packages/goal/src/api/schedule-runtime.ts`
- `packages/reminder/src/api/schedule-runtime.ts`
- 旧的 API/desktop goal/reminder runtime contribution 接线
- feature 包内部对 `eventBus` 的 runtime owner 订阅逻辑

## 7. Target Shape

### 7.1 每个 feature 只暴露自己的 projection contract

goal 与 reminder 都需要像 task 一样提供窄公共出口，例如：

```ts
@memoflow/goal/schedule-projection
@memoflow/reminder/schedule-projection
```

这些出口只暴露：

- projection source contract
- selection / plan type
- event map
- event-to-action handler factory

它们不暴露：

- api module
- runtime contribution
- host-specific source builder 以外的宽门面

### 7.2 orchestration 内形成对称 projectors

```text
packages/schedule-orchestration
  -> TaskProjector
  -> GoalProjector
  -> ReminderProjector
  -> unified projection runtimes
```

### 7.3 feature 包职责收窄

- task / goal / reminder 只负责“如何从自身领域对象生成 schedule projection”
- orchestration 负责“何时监听、何时删旧、何时重建、何时发 schedule:task-deleted”

## 8. File Checklist

### Goal side

- `packages/goal/src/schedule-projection/index.ts`
- `packages/goal/package.json`
- 删除或回收 `packages/goal/src/api/schedule-runtime.ts`

### Reminder side

- `packages/reminder/src/schedule-projection/index.ts`
- `packages/reminder/package.json`
- 删除或回收 `packages/reminder/src/api/schedule-runtime.ts`

### Orchestration side

- `packages/schedule-orchestration/src/projectors/goal-projector.ts`
- `packages/schedule-orchestration/src/projectors/reminder-projector.ts`
- `packages/schedule-orchestration/src/runtime/goal-projection-runtime.ts`
- `packages/schedule-orchestration/src/runtime/reminder-projection-runtime.ts`
- `packages/schedule-orchestration/src/infrastructure-server/schedule-orchestration.module.ts`
- 相关 tests

### Host touch points

- `apps/api/src/main.ts`
- `apps/desktop/src/main/main.ts`

## 9. Suggested Execution Slices

1. 为 goal 建立窄 projection seam
2. 为 reminder 建立窄 projection seam
3. 在 orchestration 中新增对称 projectors
4. 在 orchestration 中新增 goal/reminder runtime
5. 切换 API host 接线
6. 切换 desktop host 接线
7. 删除旧 runtime 文件和旧注入路径
8. 对齐三类 source 的测试风格

## 10. Suggested Commit Slices

1. goal seam
2. reminder seam
3. orchestration projectors/runtimes
4. API/desktop 接线切换
5. 删除旧 owner 文件和收尾 tests

## 11. Do Not Do

- 不要在 `schedule-orchestration` 内继续直接 import `@memoflow/goal/api` 或 `@memoflow/reminder/api`
- 不要把 goal/reminder 的 repo factory 直接塞进 orchestration 公共接口
- 不要在 feature 包保留“旧 runtime 备用”
- 不要一边做 `R05` 一边顺手做 `R06`

## 12. Verification

### Preferred

- `pnpm nx run goal:typecheck`
- `pnpm nx run goal:test`
- `pnpm nx run reminder:typecheck`
- `pnpm nx run reminder:test`
- `pnpm nx run schedule-orchestration:typecheck`
- `pnpm nx run schedule-orchestration:test`
- `pnpm nx run schedule:test`
- `pnpm nx run api:typecheck`
- `pnpm nx run api:test:smoke`

### Known local fallback when `pnpm` hits `ERR_PNPM_IGNORED_BUILDS`

- `.\node_modules\.bin\nx.cmd run goal:typecheck`
- `.\node_modules\.bin\nx.cmd run goal:test`
- `.\node_modules\.bin\nx.cmd run reminder:typecheck`
- `.\node_modules\.bin\nx.cmd run reminder:test`
- `.\node_modules\.bin\nx.cmd run schedule-orchestration:typecheck`
- `.\node_modules\.bin\nx.cmd run schedule-orchestration:test`
- `.\node_modules\.bin\nx.cmd run schedule:test`
- `.\node_modules\.bin\nx.cmd run api:typecheck`
- `.\node_modules\.bin\nx.cmd run api:test:smoke`

### Verification notes

- `.\node_modules\.bin\tsc.cmd --noEmit -p apps/desktop/tsconfig.typecheck.json` 当前仍会因为既有 `electron-entry` 别名解析问题失败，表现为无法解析 `@memoflow/data-portability/electron-entry` 与 `@memoflow/governance/electron-entry`；这不是本轮引入的回归，因此只记录为 Existing Failure。

## 13. Exit Criteria

- task/goal/reminder 的 projection owner 只剩一个模块
- feature package 不再自己删建 schedule task
- feature package 不再自持 runtime owner 的事件订阅
- API 与 desktop 都只从统一入口接 projection runtime

## 14. Handoff

`R06` 将继续把 source executor ownership 和通知执行链收进同一个系统模块，让 host 真正回到纯宿主。

## 15. Status Note

- Date: 2026-07-03
- Status: done
- What changed: `packages/goal` 与 `packages/reminder` 都新增 `schedule-projection` 窄公共出口；`packages/schedule-orchestration` 新增 goal/reminder projector、runtime 与共享 projection helper；API/desktop host 统一把三类 projection source 接到同一个 `projectionRuntime`。
- Old path deleted: `packages/goal/src/api/schedule-runtime.ts`、`packages/reminder/src/api/schedule-runtime.ts`
- Verification: `.\node_modules\.bin\nx.cmd run goal:typecheck`、`.\node_modules\.bin\nx.cmd run goal:build`、`.\node_modules\.bin\nx.cmd run goal:test`、`.\node_modules\.bin\nx.cmd run reminder:typecheck`、`.\node_modules\.bin\nx.cmd run reminder:test`、`.\node_modules\.bin\nx.cmd run schedule-orchestration:typecheck`、`.\node_modules\.bin\nx.cmd run schedule-orchestration:test`、`.\node_modules\.bin\nx.cmd run schedule-orchestration:build`、`.\node_modules\.bin\nx.cmd run schedule:test`、`.\node_modules\.bin\nx.cmd run api:typecheck`、`.\node_modules\.bin\nx.cmd run api:test:smoke` 通过。
- Remaining follow-up: 进入 `R06`，删除 `createSharedSourceExecutor(...)` 和 `createDesktopSourceExecutor(...)` 继续留下的 execution owner，彻底压薄 host。
