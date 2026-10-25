---
tags:
  - plan
  - archive
  - imports
  - monorepo
description: 全仓 import 路径收敛 — 消灭包内 @/，默认相对路径 + @memoflow 公开入口
created: 2026-07-27T00:00:00
updated: 2026-07-29T00:00:00
status: done
---

> **归档结果（2026-07-29）**：包内 `@/` → 相对路径已完成；政策见 `docs/standards/import-path-policy.md`。  
> Follow-up（tsconfig 删 `@/*`、ESLint ban）不阻塞本 plan 归档。

# Import Path Elegance（路径优雅化）

## 目标

在 **不改变运行时行为** 的前提下，把包内 `@/` 一次性收敛为相对路径，使：

1. 跨包：`@memoflow/*` 公开入口（已成立）
2. 包内：**相对路径为唯一源码坐标**（本次）
3. 解析上下文无关：任意 app typecheck / vitest 深引不再踩 `@/` 错根

政策见 [`docs/standards/import-path-policy.md`](../../standards/import-path-policy.md)。

## 完成情况

| 项                                                                                                         | 状态                                     |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 政策文档 `import-path-policy.md` + standards 索引                                                          | done                                     |
| 业务源码 `@/` → 相对路径 bulk rewrite（~339 files / ~529 imports）                                         | done                                     |
| `vi.mock('@/...')` / 测试 mock 路径对齐                                                                    | done                                     |
| `packages/task/vitest.performance.config.ts` 去掉无用 `@` alias                                            | done                                     |
| 受影响包 `typecheck`（goal/task/governance/auth/schedule/notification/setting/reminder/ui-vue-shadcn/api） | green                                    |
| 删除各包 tsconfig `@/*` paths                                                                              | **本轮不做**（兼容 shadcn CLI / 逃生舱） |
| ESLint ban `@/`                                                                                            | **follow-up**                            |

## 范围（已执行）

| 包                                                 | 动作                                  |
| -------------------------------------------------- | ------------------------------------- |
| ui-vue-shadcn                                      | 相对化；保留 components.json 生成别名 |
| governance / task / authentication / goal          | 相对化                                |
| schedule / notification / setting / reminder / api | 相对化                                |

不改：`@memoflow/*`、node builtins、第三方包。

## 验证

- `pnpm nx run-many -t typecheck -p goal,task,governance,authentication,schedule,notification,setting,reminder,ui-vue-shadcn,api` → success
- 业务源码 `from '@/...'` 计数 → 0（`components.json` 除外）

## 架构结论（一句话）

> 路径空间只剩两层：**跨包 `@memoflow` 公开 seam** + **包内相对路径**；`@/` 不再是源码默认坐标，仅作工具配置兼容。
