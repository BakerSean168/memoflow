---
tags:
  - governance
  - quick-reference
  - architecture
description: Governance 一页速查卡 - 公开 seam、职责与改动入口
created: 2026-03-14T00:00:00
updated: 2026-09-11T00:00:00+09:00
---

# Governance 快速参考卡

## 一页结构图

| seam / 层             | 目录 / 入口                                       | 负责什么                                                                      |
| --------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Public Contracts      | `@memoflow/contracts/governance`                  | DTO、Schema、事件、ID 类型、Protocol                                          |
| Contracts Mocks       | `@memoflow/contracts/mocks`                       | governance mock 数据                                                          |
| Server Domain         | `src/server/domain/`                              | 聚合根、实体、仓储接口、值对象                                                |
| Server Application    | `src/server/application/`                         | Commands / Queries / `GovernanceApplicationPort`                              |
| Server Transport      | `src/server/transport/`                           | 校验、控制器、transport 翻译                                                  |
| Server Infrastructure | `src/server/infrastructure/`                      | Prisma / PowerSync / runtime / 规范化组合根（`createGovernanceModule`）/ seed |
| API                   | `@memoflow/governance/api` / `src/api/`           | HTTP 传输与生命周期适配器（不含组合）                                         |
| Client                | `@memoflow/governance/client` / `src/client/`     | Web / Desktop renderer 客户端 seam                                            |
| Electron              | `@memoflow/governance/electron` / `src/electron/` | IPC 传输与生命周期适配器（不含组合）                                          |
| Server Root           | `@memoflow/governance`                            | 规范化服务端组合根 + 宿主装配 ingredient factory                              |

治理模块公共契约已经外提到 `packages/contracts`，`packages/governance/src/` 内不再维护第二份 contracts，也不再对外暴露 `domain-client`、`application-client`、`infrastructure-client` 这类 layer-named seam。

## Reference feature 可执行验收

Governance 不是静态目录样板。`GOV-1901` 长期要求以下四组 proof 同时存在：

1. **业务行为**：Rule CRUD/search、Draft → Active → Deprecated → Active lifecycle，以及 append-only `RuleRevision` history；
2. **持久化 parity**：Prisma 与 PowerSync 对同一 Rule/RuleRevision round-trip 等价，search/filter 行为一致；
3. **transport parity**：HTTP / IPC 使用同一 contracts validation、同一 `GovernanceApplicationPort` 与一致 Result/failure contract；
4. **composition/public seam**：`apps/api/src/runtime/compose-governance.ts` 与 `apps/desktop/src/main/runtime/compose-governance.ts` 持有 adapter 选择，公开 seam 固定为 `@memoflow/governance`、`/api`、`/client`、`/electron`。

对应 anti-drift gate：`packages/governance/src/reference-module-invariants.surface.spec.ts` 与 `server/infrastructure/__tests__/governance-persistence-parity.spec.ts`。任何系统级 feature architecture 改造，应先确保这两类 reference gate 仍成立。

## Published GovernanceRuleBundle

- schema：`GovernanceRuleBundle` v1；
- 内容：仅 Active Rule + revision/provenance + code/severity/tags/reference path + examples；
- hash：locale-independent canonical JSON → SHA-256；不包含 export time / machine identity；
- HTTP：`GET /api/v1/governance/rules/bundle`；
- IPC：`governance:rule-bundle:export`；
- client：`GovernanceClientPort.exportRuleBundle()`；
- 生成过程严格只读；seed rule 没有历史 revision 时显式返回 `revisionCount: 0` / `latestRevision: null`；
- CI/engineering governance 不读取 live Rule DB，后续只能消费 repository-pinned/versioned bundle。

## Development / diagnostic surface

- development：Governance 工作台导航自动可见；
- production / staging / test：默认 `VITE_ENABLE_GOVERNANCE_DEV_SURFACE=false`，普通导航隐藏；
- 生产诊断：显式设为 `true` 后展示入口；
- route、API/IPC、Prisma/PowerSync、Vue list/detail/editor/history 从不因导航隐藏而删除；
- 回归必须包含 `governance-development-smoke.spec.ts` 的 list → create → update → revision history 闭环。

## 前端数据流（推荐）

```text
@memoflow/governance/client -> Pinia(POJO cache) -> app-vue display-rule helpers -> components
```

- Store 里只存 POJO / DTO，不存 class 实例
- app-vue 在本地派生展示模型，不再依赖 governance 包内 `domain-client`
- 组件优先使用 composable，不直接依赖 transport 细节

## 改动去哪改

| 需求                           | 主要文件                                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 新增请求字段                   | `packages/contracts/src/modules/governance/api/*.ts` + 相关 DTO                                                            |
| 新增响应字段                   | `packages/contracts/src/modules/governance/api/response-schemas.ts` + 相关 DTO                                             |
| 新增 RPC channel / IPC payload | `packages/contracts/src/modules/governance/protocol/*`                                                                     |
| 新增领域规则                   | `src/server/domain/aggregates/rule.ts`                                                                                     |
| 新增值对象 / 领域不变量        | `src/server/domain/value-objects/`                                                                                         |
| 新增查询/命令                  | `src/server/application/use-cases/`                                                                                        |
| 新增 HTTP 端点                 | `src/api/routes/*.routes.ts`                                                                                               |
| 新增 transport 共享逻辑        | `src/server/transport/`                                                                                                    |
| 新增模块运行时副作用           | `src/server/infrastructure/runtime/`                                                                                       |
| 新增宿主装配（组合根）         | `apps/api/src/runtime/compose-governance.ts`（Prisma）/ `apps/desktop/src/main/runtime/compose-governance.ts`（PowerSync） |
| 新增桌面主进程治理 IPC 接线    | `src/electron/index.ts`（仅传输 + 生命周期）                                                                               |
| 新增 Web / Renderer 调用       | `src/client/index.ts`                                                                                                      |
| 新增 UI 展示派生               | `packages/app-vue/src/modules/governance/display-rule.ts`                                                                  |
| 新增持久化字段                 | `src/server/infrastructure/adapters/*/mappers/`                                                                            |

## 路由拆分规则

- 路由层按资源 / feature 拆，不按 command/query 拆
- `Rule` 主资源放 `governance-rules.routes.ts`
- `RuleRevision` 子资源放 `governance-rule-revisions.routes.ts`
- 共享 parser / response schema 放 `governance-route-shared.ts`
- 聚合顺序必须保证：静态路径先于 `/:id`

## 四个服务端切片口诀

- `server/domain` 看业务模型与不变量
- `server/application` 看用例与调用门面
- `server/transport` 看控制器与 transport 翻译
- `server/infrastructure` 看适配器、runtime 与规范化组合根

> **组合归属：** `createGovernanceModule` 是规范化组合根，但宿主装配在 apps 完成——
> `apps/api/src/runtime/compose-governance.ts`（Prisma）与
> `apps/desktop/src/main/runtime/compose-governance.ts`（PowerSync）
> 调用 `create*Repositories` + `createGovernanceEventLogRuntime` + `createGovernanceModule`
> 后把 instance 传给 `api` / `electron` transport module。不要在 register 内再组合。

## 常见反模式

- 在 controller 里写业务逻辑
- 在 route 文件里复制 query parser 和 response schema
- 同时维护 `packages/contracts` 与模块内第二份 contracts
- 对外暴露 layer-named seam（如 `application-client`）
- 把 UI display logic 伪装成 `domain-client`
- 在通用 `contracts/electron` 再维护一份 governance channel 常量
