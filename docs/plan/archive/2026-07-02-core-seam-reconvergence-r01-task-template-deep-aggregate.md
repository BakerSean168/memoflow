---
tags:
  - plan
  - archive
  - architecture
  - refactor
  - rounds
  - r01
description: R01 执行文档，收敛 TaskTemplate 深聚合，删除反向 factory、DTO helper 与 lazy import
created: 2026-07-02T00:00:00+08:00
updated: 2026-07-02T20:45:00+08:00
---

# R01 TaskTemplate Deep Aggregate

## 1. Objective

把 `TaskTemplate` 从浅封装集合收回成真正的深聚合：

- 聚合自己拥有 `create(...)`、`rehydrate(...)` 和核心命令
- DTO mapping 不再反向影响聚合
- factory 不再作为隐藏真实入口的旁路
- policy/helper 只保留真正纯计算职责

## 2. Why This Round Exists

如果 `TaskTemplate` 继续处在循环依赖和 helper 反向缠绕的形态，后续的 orchestration、transport 和测试收敛都会建立在不稳定地基上。

## 3. Entry Conditions

- 可以只读取 `packages/task` 及直接相邻 mapper/tests
- 不需要同时触碰 controller、route、schedule ownership
- 如果发现新的循环依赖，必须优先解释依赖方向，再决定删除或并回

## 4. In Scope

- `packages/task/src/domain-server/aggregates/task-template.ts`
- `packages/task/src/domain-server/aggregates/task-template-factory.ts`
- `packages/task/src/domain-server/aggregates/task-template-dto.ts`
- `packages/task/src/domain-server/aggregates/task-template-*.policy.ts`
- 紧邻聚合边界的 mapper 与 aggregate tests

## 5. Out Of Scope

- schedule projection ownership
- typed event seam
- controller seam 与 route seam
- strict ID fixture 统一

## 6. Must Delete In This Round

- `task-template.ts` 底部 lazy import
- factory 对 aggregate 的反向装配依赖
- 聚合对 DTO helper 的认知

## 7. Suggested Execution Slices

1. 先补聚合回归测试与依赖图检查，锁住外部行为
2. 定义聚合最终入口：`create(...)`、`rehydrate(...)`、聚合命令方法
3. 把 DTO 映射移出聚合，或把只属于聚合状态的内容内联回聚合
4. 把 `TaskTemplateState` 之类的稳定状态形状提炼成独立边界
5. 删除 factory/lazy import/反向 helper
6. 回收所有直接调用点和测试

## 8. Suggested Commit Slices

1. 守护测试和依赖图基线
2. 提炼稳定状态类型
3. 把真实入口并回 `TaskTemplate`
4. 删除 DTO/helper/factory 旧路径
5. 清理调用点和导出

## 9. Verification

- Preferred:
  - `pnpm nx run task:typecheck`
  - `pnpm nx run task:test`
  - `.\node_modules\.bin\madge.cmd --circular --extensions ts packages/task/src/index.ts`
- Known local fallback when `pnpm` hits `ERR_PNPM_IGNORED_BUILDS`:
  - `.\node_modules\.bin\nx.cmd run task:typecheck`
  - `.\node_modules\.bin\nx.cmd run task:test`

## 10. Exit Criteria

- `TaskTemplate` 不再 import 反向 factory
- `TaskTemplate` 不再 import DTO helper
- `madge` 不再报告 `task-template` 相关环
- 聚合 API 变小，但真实行为变多

## 11. Handoff

完成后才允许进入 `R02`。`R02` 会在一个更稳定的聚合边界上建立 typed event seam。

## 12. Status Note

- Date: 2026-07-02
- Status: done
- What changed: 抽出 `task-template.state.ts`；把 `createOneTimeTask`、`createRecurringTask`、`create`、`load` 并回 `TaskTemplate`；移除对 DTO helper 的反向依赖；同步更新 policy、导出、tests 和 PowerSync mapper。
- Old path deleted: `packages/task/src/domain-server/aggregates/task-template-dto.ts`、`packages/task/src/domain-server/aggregates/task-template-factory.ts`、`task-template.ts` 底部 lazy import。
- Verification: `.\node_modules\.bin\madge.cmd --circular --extensions ts packages/task/src/index.ts` 通过；`.\node_modules\.bin\nx.cmd run task:typecheck` 通过；`.\node_modules\.bin\nx.cmd run task:test` 通过。
- Remaining follow-up: 进入 `R02`，不要在本轮之后再把 DTO 或 factory 逻辑拉回聚合。
