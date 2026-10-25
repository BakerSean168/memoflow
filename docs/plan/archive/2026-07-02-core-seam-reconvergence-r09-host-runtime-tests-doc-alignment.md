---
tags:
  - plan
  - archive
  - architecture
  - refactor
  - rounds
  - r09
description: R09 执行文档，补宿主启动链与 runtime 直达测试，并完成文档和最终结构的对齐
created: 2026-07-02T00:00:00+08:00
updated: 2026-07-03T20:54:00+08:00
---

# R09 Host Runtime Tests Doc Alignment

## 1. Objective

给收敛后的系统补上关键 direct tests，并把文档与最终职责边界完全对齐。

## 2. Why This Round Exists

前八轮解决的是结构和边界；最后一轮负责把新结构的可回归性和可传达性补齐，避免“代码进入新世界，测试和文档留在旧世界”。

如果没有这轮，重构虽然完成了，但团队仍然会在两件事上吃亏：

- 核心启动链回归没有第一现场测试
- 新同事读到的文档还在讲旧 owner、旧 seam、旧 host 装配

## 3. Entry Conditions

- `R08` 已 done
- orchestration、transport、ID contract 都已稳定
- 只剩测试直达性和文档回收未完成

## 4. In Scope

- `apps/api`
- `apps/web`
- `apps/desktop`
- `packages/schedule`
- `packages/schedule-orchestration`
- `docs/architecture/*`
- `docs/plan/*`
- 必要的 ADR / standards 对齐

## 5. Out Of Scope

- 再开新一轮架构重构
- 与本蓝图无关的全仓文档整理

## 6. Must Delete In This Round

- 已过时的旧 seam、旧 owner、旧 runtime 文档描述
- 对最终结构已经失真的计划注记
- 仍在暗示 host 持有跨域拼装职责的说明

## 7. Target Shape

### 7.1 关键 direct tests 到位

至少补齐：

- API bootstrap 直达测试
- web bootstrap 直达测试
- desktop main runtime / window lifecycle 直达测试
- `schedule-orchestration` integration tests

### 7.2 文档只描述最终结构

最终文档必须只保留：

- `schedule-orchestration` 作为 projection/execution owner
- host 只做 composition root
- controller seam 统一后的 contract
- strict ID contract 的新要求

## 8. File Checklist

- `apps/api/src/bootstrap.spec.ts` 或等价
- `apps/web/src/bootstrap/app.spec.ts` 或等价
- `apps/desktop/src/main/lifecycle/window-manager.spec.ts` 或等价
- `packages/schedule-orchestration/src/__tests__/*`
- 本蓝图、执行计划、相关 ADR / standards / guides

## 9. Suggested Execution Slices

1. 补 API bootstrap direct tests
2. 补 web bootstrap direct tests
3. 补 desktop main runtime / lifecycle direct tests
4. 补 `schedule-orchestration` integration tests
5. 回收旧文档与旧计划描述
6. 运行治理检查和关键 targeted verification

## 10. Suggested Commit Slices

1. API/bootstrap tests
2. web/bootstrap tests
3. desktop/runtime tests
4. orchestration integration tests
5. docs alignment + governance verification

## 11. Do Not Do

- 不要把这轮变成新的结构性重构
- 不要继续保留“旧文档先不删，留作参考”的 active 描述
- 不要只补最表层 happy-path 测试
- 不要跳过治理检查

## 12. Verification

### Preferred

- `pnpm nx run api:test`
- `pnpm nx run web:test`
- `pnpm nx run desktop:test:main`
- `pnpm nx run schedule:test`
- `pnpm nx run schedule-orchestration:test`
- `pnpm nx run memoflow:governance-check`

### Known local fallback when `pnpm` hits `ERR_PNPM_IGNORED_BUILDS`

- `.\node_modules\.bin\nx.cmd run api:test`
- `.\node_modules\.bin\nx.cmd run web:test`
- `.\node_modules\.bin\nx.cmd run desktop:test:main`
- `.\node_modules\.bin\nx.cmd run schedule:test`
- `.\node_modules\.bin\nx.cmd run schedule-orchestration:test`
- `.\node_modules\.bin\nx.cmd run memoflow:governance-check`

## 13. Exit Criteria

- API、web、desktop、schedule-orchestration 的关键运行链有 direct tests
- 文档不再描述旧 transport seam、旧 projection owner、旧 host 装配方式
- 相关 active plan 可以满足转 archive 的条件

## 14. Handoff

无后续轮次。完成后应整理归档，并将新的 canonical structure 留在代码、测试和文档三处一致的状态。

## 15. Status Note

- Date: 2026-07-04
- Status: done
- What changed: 已补 `apps/api/src/bootstrap.spec.ts`、`apps/web/src/bootstrap/app.spec.ts`、`apps/desktop/src/renderer/bootstrap/app.spec.ts`、`apps/desktop/src/main/__tests__/bootstrap.spec.ts` 与 `packages/schedule-orchestration/src/__tests__/*`，并通过 `apps/desktop/test-support/electron.stub.ts` 与 desktop auth fixture 收口把 desktop 主进程/renderer 直达测试纳入稳定基线；同时完成 blueprint、execution-plan、runbook、playbook 与本轮状态回写。
- Old path deleted: 过时的 desktop Electron install baseline blocker 叙述、`SessionManager` branded ID warning follow-up 叙述，以及各 active plan 中对旧阻塞状态的当前时描述。
- Verification: `.\node_modules\.bin\nx.cmd run api:test`、`api:test:smoke`、`web:test`、`task:typecheck`、`task:test`、`goal:test`、`reminder:test`、`schedule:test`、`schedule-orchestration:test`、`desktop:test:main`、`desktop:test`、`memoflow:governance-check` 通过；`.\node_modules\.bin\madge.cmd --circular --extensions ts packages/task/src/index.ts` 无循环依赖。
- Remaining follow-up: none。本轮完成后整组 core-seam 计划满足归档条件。
