---
tags:
  - adr
  - powersync
  - goal
  - task
  - sync
  - concurrency
description: PowerSync 上行 goals/task_plans 的版本乐观锁、冲突拒绝语义与云/本地双写规则
created: 2026-11-19T00:00:00Z
updated: 2026-11-19T00:00:00Z
---

# ADR-125: PowerSync Uplink Row Version Guard

**状态：** 已采纳（#1035）

**日期：** 2026-11-19

**关联：** ADR-038、ADR-118、ADR-121、ADR-124（本地 MCP 宿主）、#982、#1036

> 本文回应 ADR-124 第 6 节挂起的跨端冲突规则，并取代该节「现行规则」中的 last-write-wins 表述。

## Context

云端 MCP 写入与 Desktop 本地写入都已上线，二者写同一行 `goals` / `task_plans` 时走两条不同的落库路径：

- 云端 MCP：`/mcp` 工具 → `bindGatewayWrites` → owner 命令（幂等回执 + `expectedVersion` CAS）→ Prisma 仓储。过期写入返回 `CONFLICT`。
- 本地写入：Desktop SQLite 先本地提交，PowerSync 按变更列批量上行 `PUT /api/v1/powersync/crud`，服务端 `executeCrudBatch` 用 Prisma `upsert` / `update` 直接写库。

第二条路径在 #1035 之前没有任何版本比较：上行携带本地已推进的 `version`，服务端无条件整行（PATCH 为逐变更列）覆盖。离线或并发时，先写一方的修改会被静默吞掉，且本地队列无法判断这次覆盖是否合法。

`goals.version`、`task_plans.version` 在 Postgres、Prisma 客户端与 PowerSync 客户端 schema 中都存在，且本地每次写都会 `version + 1` 后随 `data.version` 一起上行，因此同步协议已具备版本信号——这是选择方案 A 而非改造为 owner 命令上行的依据。

## Decision

### 1. 上行采用版本乐观锁（方案 A）

`goals`、`task_plans` 的 PowerSync 上行不再走通用 last-write-wins 分支，由 `row-version-guard.ts` 处理：

| 操作                      | 上行携带                                        | 服务端判定                                                       | 结果                                                        |
| ------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| `PATCH`（带 `version`）   | `version = 本地基线 + 1`                        | `updateMany where { id, identityId, version: { lt: incoming } }` | 命中即写入；未命中且内容已是该状态视为重放成功；否则冲突    |
| `PATCH`（不带 `version`） | 辅助列（Goal 状态投影、TaskPlan 删除/恢复墓碑） | `where { id, identityId }`                                       | 保持单列 last-write-wins，不写 `version`                    |
| `PUT`（新建）             | `version = 1`                                   | `createMany skipDuplicates`                                      | 插入成功即写入；已存在且版本落后才允许按 CAS 更新；否则冲突 |
| `DELETE`                  | 无版本                                          | 通用分支                                                         | 保持现状（业务删除是 `deleted_at` 列 PATCH）                |

使用 `version < incoming` 而非 `version = incoming - 1`：离线期间同一行可能被多次修改并被 PowerSync 合并成一次上行，严格等于会把合法的离线连改误判为冲突；`lt` 仍能拒绝一切「服务端已经前进过」的上传。

冲突判定前先比较变更列内容：若服务端当前行已经等于上行内容，则视为重放（HTTP 2xx 丢失后的 at-least-once 重传）成功，不重复写入、也不报冲突。

### 2. 冲突有独立、可编程的错误语义

过期上传返回 HTTP 409，响应体与既有偏好冲突同构，`error.context.code = "row_version_conflict"`，并携带 `reason`（`stale_version` / `row_missing`）、`table`、`rowId`、`operation`、`incomingVersion`、`currentVersion`、`identityId`。批量上行在单个 Prisma 事务内执行，任一冲突都整批回滚，不产生半写。

同步层（Desktop connector）据此区分三类结果：

- **冲突拒绝**：不再重试（重试永远不会成功）。客户端校验整条队列编辑链后，把被拒绝的 payload 写入本地 `desktop_sync_row_conflicts` 表留证，只删除该行对应的 `ps_crud` 队列项，其余行继续上传；随后由尚未到达的下载增量把服务端胜出版本写入本地视图。
- **普通失败**（网络、5xx、未知 409）：保留全部队列项，交由 PowerSync SDK 既有重试策略处理。
- 任何情况下都不静默完成（acknowledge）一个冲突 409。

### 3. 云/本地双写同一行的规则

| 场景                 | 规则                                                               |
| -------------------- | ------------------------------------------------------------------ |
| 云端先写、本地后上行 | 本地过期上传被 409 拒绝，云端数据保留，本地留证并回落到服务端版本  |
| 本地先上行、云端后写 | 云端 `expectedVersion` 已过期，MCP 返回 `CONFLICT`，本地数据保留   |
| 双方都基于同一基线   | 先落库者胜出，后到者在自己的入口被拒绝，语义一致                   |
| 重放（响应丢失）     | 内容已落库则按成功处理，不推进版本、不覆盖                         |
| 无版本的辅助列写     | 单列 last-write-wins，不参与版本链，见「Consequences」中的残留风险 |

云端 MCP 与本地上行共享同一权威事实：Postgres 中的 `version` 是唯一裁决依据；任何一端都不做「整行后写覆盖」。

### 4. 与 #1036 及既有 ADR 的口径

- ADR-038 已要求 owner 写入使用 `expectedVersion` 并返回类型化冲突；本决策把同一语义补到 PowerSync 上行，二者不再是两套规则。
- ADR-124 第 6 节登记的「现行规则」是上行整行后写覆盖、不承诺跨端冲突检测；本决策落地后该表述按 ADR-124 自身的约定被本节接管，ADR-124 只保留引用。
- 本地 MCP 写走本地 owner 命令 + PowerSync 上行，云端 MCP 写走云端 owner 命令；两端都不得静默覆盖，冲突一律显式返回。
- 不新增第二个治理运行时、不引入 CRDT 逐列合并，也不把上行改造成 owner 命令通道（方案 B 会重复实现幂等回执与命令编解码，收益不抵成本）。

## Consequences

- 跨端并发写同一 Goal / TaskPlan 时不再丢失先写方的数据，代价是后到方的这次编辑被显式拒绝，需要用户重读后重做。
- 离线连改、同批次多行、5xx 重试、409 重放等既有行为保持不变；偏好（`revision`）与 `ai_conversations` 的专用守卫不变。
- 已知残留：不携带 `version` 的辅助列 PATCH（例如任务完成驱动的 Goal 状态投影、TaskPlan 软删除/恢复）仍是单列 last-write-wins，只覆盖单列、不改版本；这些写入由已版本化的父命令派生，本决策不为它们引入第二套版本链。
- 证据边界：单元测试覆盖守卫判定；集成测试在真实 Postgres 上以「云端 MCP 工具调用 + 本地 `/powersync/crud` 上行」实测过期上传被拒绝、先写数据完整保留。PowerSync 服务端复制、真实 Desktop 断电/多设备时序不在本决策的证据范围内。
