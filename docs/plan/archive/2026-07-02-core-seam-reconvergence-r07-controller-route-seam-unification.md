---
tags:
  - plan
  - archive
  - architecture
  - refactor
  - rounds
  - r07
description: R07 执行文档，统一 task、goal、schedule 的 controller seam 与 route registration seam
created: 2026-07-02T00:00:00+08:00
updated: 2026-07-03T20:54:00+08:00
---

# R07 Controller Route Seam Unification

## 1. Objective

统一三套服务端 transport seam：

- controller 统一依赖 plain function port
- route registration 统一返回 `Router`
- `module.ts` 统一负责 mount prefix

## 2. Why This Round Exists

只要 `.execute` wrapper 和 root-router mutation 还在，controller 层就仍然是三种形状，维护者很难形成统一心智模型。

当前最不优雅的地方并不是“多了几个文件”，而是同一层接口有三种约定：

- `goal` 需要把 plain function 包成 `{ execute }`
- `task` 用自己的对象字段分组
- `schedule` 直接透传

`R07` 的目标是把这三种形状收成一种，不留兼容层。

## 3. Entry Conditions

- `R06` 已 done
- orchestration 与 host 接线已经稳定
- 不再需要一边改 controller 一边兼顾系统级 owner 收敛

## 4. In Scope

- `packages/task/src/controllers/*`
- `packages/goal/src/controllers/*`
- `packages/schedule/src/controllers/*`
- 对应 `api/transport-handlers.ts`
- 对应 `api/routes/*`
- 对应 `api/module.ts`

## 5. Out Of Scope

- projection/runtime ownership
- typed event seam
- strict ID contract

## 6. Must Delete In This Round

- 被替换的 `.execute` wrapper
- task 的 root-router mutation seam
- `registerGoalFolderRoutes_` 这类为旧形状妥协出来的异常命名
- 任何只为了旧 shape 而存在的 pass-through transport helper

## 7. Target Shape

### 7.1 Controller port 统一为 plain function

以 plain function port 为最终标准：

```ts
interface GoalControllerPort {
  createGoal(input: CreateGoalRequest, ctx: RequestContext): Promise<Result<...>>;
  updateGoal(id: string, input: UpdateGoalRequest): Promise<Result<...>>;
}
```

而不是：

```ts
{
  createGoal: { execute(...) { ... } }
}
```

### 7.2 Transport handler 只有在“重分组”时才保留

- 如果 application facade 与 controller port 同形，直接透传
- 如果只需要 `template / instance / dependency` 这类分组，可以保留轻量分组，但不要再改变函数 contract

### 7.3 Route registration 统一

最终统一为：

```ts
const router = registerXxxRoutes(handlers, middleware, openApiRegistry);
rootRouter.use('/xxx', router);
```

由 `module.ts` 负责 mount prefix；route 文件永远返回 `Router`。

## 8. File Checklist

- `packages/goal/src/controllers/*`
- `packages/goal/src/api/transport-handlers.ts`
- `packages/goal/src/api/routes/index.ts`
- `packages/task/src/controllers/*`
- `packages/task/src/api/transport-handlers.ts`
- `packages/task/src/api/routes/index.ts`
- `packages/schedule/src/controllers/*`
- `packages/schedule/src/api/transport-handlers.ts`
- `packages/*/src/api/module.ts`

## 9. Suggested Execution Slices

1. 决定统一 controller contract 的最终 shape
2. 先切 `goal`，删除 `.execute` wrapper
3. 再切 `task`，把分组保留在 transport handler，但函数 contract 与 controller 对齐
4. 统一 route registration 都返回 `Router`
5. 统一 `module.ts` 中 mount prefix 的位置
6. 删除旧 wrapper、旧命名、旧 registration 方式

## 10. Suggested Commit Slices

1. controller contract 基线
2. goal seam 切换
3. task seam 切换
4. routes/module 收尾
5. tests 和旧路径删除

## 11. Do Not Do

- 不要同时保留 plain function 与 `.execute` 两套 contract
- 不要再新增“shared wrapper helper”去继续包 `.execute`
- 不要把 route prefix 逻辑散回各个子 route 文件
- 不要把 `R07` 和 `R08` 混成一个 PR

## 12. Verification

### Preferred

- `pnpm nx run task:test`
- `pnpm nx run goal:test`
- `pnpm nx run schedule:test`
- `pnpm nx run api:test`
- `pnpm nx run api:typecheck`

### Known local fallback when `pnpm` hits `ERR_PNPM_IGNORED_BUILDS`

- `.\node_modules\.bin\nx.cmd run task:test`
- `.\node_modules\.bin\nx.cmd run goal:test`
- `.\node_modules\.bin\nx.cmd run schedule:test`
- `.\node_modules\.bin\nx.cmd run api:test`
- `.\node_modules\.bin\nx.cmd run api:typecheck`

## 13. Exit Criteria

- task/goal/schedule controller seam 同形
- route registration 风格统一
- transport handler 不再承载无意义包装
- 异常命名与历史 wrapper 全部删除

## 14. Handoff

`R08` 可以在统一的 transport 基面上收紧 strict ID contract 和 fixture，不再被接口 shape 差异分散注意力。

## 15. Status Note

- Date: 2026-07-03
- Status: done
- What changed: `task` 与 `goal` 的 controller 已统一消费 plain function port；`transport-handlers.ts` 退回成薄分组映射层；`registerTaskRoutes(...)` 改为返回 `Router`，`module.ts` 统一负责 mount；`goal` 旧 `{ execute: api.xxx }` wrapper 已收口成直接函数映射。
- Old path deleted: `task` 的 root-router mutation seam、`goal` 的 `.execute` wrapper contract，以及只为旧 shape 存在的异常 route registration 命名与 pass-through 映射。
- Verification: `.\node_modules\.bin\nx.cmd run task:typecheck`、`goal:typecheck`、`task:test`、`goal:test`、`schedule:test`、`api:typecheck`、`api:test` 通过。
- Remaining follow-up: 进入 `R08`，在统一 transport 基面上收紧 strict ID contract 与 fixture 体系。
