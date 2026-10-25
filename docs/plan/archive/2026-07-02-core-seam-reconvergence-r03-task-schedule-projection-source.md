---
tags:
  - plan
  - archive
  - architecture
  - refactor
  - rounds
  - r03
description: R03 执行文档，把 task 的 schedule projection 业务规则保留在 task 内，但移除 task 对 projection runtime 的系统 owner 身份
created: 2026-07-02T00:00:00+08:00
updated: 2026-07-03T10:00:00+08:00
---

# R03 Task Schedule Projection Source

## 1. Objective

把 task 对 schedule projection 的业务知识和系统级 owner 职责拆开：

- task 保留 task-specific projection rules
- host 或 orchestration 保留事件订阅、删旧、重建、保存的 runtime owner 身份

## 2. Why This Round Exists

如果 task 继续在 feature 包内部同时拥有规则和 runtime owner，`R04` 的 `schedule-orchestration` 就只能包住旧复杂度，而不是收回旧复杂度。

## 3. Entry Conditions

- `R02` 已完成
- typed subscriber/publisher 已可复用
- 本轮不需要一次性引入最终 `schedule-orchestration`

## 4. In Scope

- `packages/task`
- `apps/api` 与 `apps/desktop` 上必要的临时 host-level runtime contribution
- task projection 相关 tests

## 5. Out Of Scope

- goal/reminder projection
- source executor ownership
- controller seam
- strict ID contract

## 6. Must Delete In This Round

- `packages/task/src/api/schedule-runtime.ts`
- task 包内部对 projection runtime owner 的最终持有关系

## 7. Target Shape

- task 对外暴露 projection source port
- task 对外暴露 event-to-action handler mapping
- host 通过 repo + typed event seam 承接 runtime owner
- task 自己不再删除/保存 schedule task

## 8. Suggested Execution Slices

1. 提炼 projection source 的最小 contract
2. 保留 task-specific plan building 和 selection rule 在 task 包内
3. 新建 API host runtime contribution
4. 新建 desktop host runtime contribution
5. 切换 `TaskApiModule` / `TaskElectronModule` 到 host 注入模式
6. 删除 `schedule-runtime.ts`
7. 补 task 侧 source tests

## 9. Suggested Commit Slices

1. source port 与 tests
2. API host runtime contribution
3. desktop host runtime contribution
4. module 接线切换
5. 删除旧 runtime owner

## 10. Verification

- Preferred:
  - `pnpm nx run task:typecheck`
  - `pnpm nx run task:test`
  - `pnpm nx run api:typecheck`
  - `pnpm nx run desktop:typecheck`
  - `pnpm nx run api:test:smoke`
- Known local fallback:
  - `.\node_modules\.bin\nx.cmd run task:typecheck`
  - `.\node_modules\.bin\nx.cmd run task:test`
  - `.\node_modules\.bin\nx.cmd run api:typecheck`
  - `.\node_modules\.bin\nx.cmd run desktop:typecheck`
  - `.\node_modules\.bin\nx.cmd run api:test:smoke`

## 11. Exit Criteria

- task 仍拥有 task-specific projection rules
- task 不再拥有最终 projection runtime ownership
- 外部可以在不了解 task repo 细节的前提下消费 projection source

## 12. Handoff

`R04` 只需要把 host-level owner 再集中到新的 `schedule-orchestration` 包，而不需要重新设计 task projection 规则本身。

## 13. Status Note

- Date: 2026-07-03
- Status: done
- What changed: 已经新增 `schedule-projection-source` 与对应 tests；API/desktop 各自新增 host-level runtime contribution；`TaskApiModule` 和 `TaskElectronModule` 改为接受 host 注入的 runtime contribution；task 包内的系统级 runtime owner 已删除，task 只保留 projection rules 和 event-to-action handler mapping。
- Old path deleted: `packages/task/src/api/schedule-runtime.ts`
- Verification: `.\node_modules\.bin\nx.cmd run task:typecheck` 通过；`.\node_modules\.bin\nx.cmd run task:test` 通过（`44` files / `662` tests）；`.\node_modules\.bin\nx.cmd run api:typecheck` 通过；`.\node_modules\.bin\tsc.cmd --noEmit -p apps/desktop/tsconfig.typecheck.json` 通过。`.\node_modules\.bin\nx.cmd run api:test:smoke` 仍被现有 `@memoflow/patterns/scheduler` 模块解析失败阻塞；`.\node_modules\.bin\nx.cmd run desktop:test:main` 仍被现有 Electron 安装问题与认证测试空文件基线阻塞；`.\node_modules\.bin\nx.cmd run desktop:typecheck` 的 `^build` 链仍被 `ui-vue-shadcn:build` 的现有 `TS2742` 错误阻塞。
- Remaining follow-up: 进入 `R04`，把 host-level task projection owner 收进真正的 `schedule-orchestration` 包。
