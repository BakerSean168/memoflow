---
tags: [adr, vnext, destructive-cutover, legacy, data, compatibility]
description: 本轮 vNext 重构不保留旧 MemoFlow 数据、不提供 legacy compatibility window，直接以新模型重建 canonical schema/runtime
created: 2026-09-09T11:10:00+09:00
updated: 2026-09-09T11:10:00+09:00
---

# ADR-111: Zero-Legacy-Data Destructive Cutover Policy

**状态：** 已采纳，立即生效
**日期：** 2026-09-09
**作用范围：** ADR-067~110 的本轮实施策略

## Context

MemoFlow 当前没有需要保留的生产业务数据，也没有必须继续支持的旧客户端/旧备份格式。

因此此前多个 ADR/计划为了稳妥升级而设计的：

```text
legacy row backfill
old/new dual read
old/new dual write
compatibility DTO alias
legacy API input adapter
V2 backup reader/migrator
old route redirect window
one-time content migration
before/after data-parity fixture
```

在本轮重构中只会增加成本、延长双轨状态并提高模型收敛风险。

## Decision

本轮 vNext 采用 **destructive cutover / clean-slate data policy**。

### 1. 不保留旧 MemoFlow 数据

允许直接：

- drop legacy tables/columns/indexes；
- 删除 legacy Prisma/PowerSync schema；
- 重建开发/测试/当前部署数据库；
- 清空旧 Account/Goal/Task/Reminder/Schedule/Notification/AI/Editor/Dashboard/Repository 等业务数据；
- 用 canonical vNext seed / fixtures 重新建立测试状态。

不写“为了保存当前旧行”的 backfill/migrator。

### 2. 不保留 legacy compatibility code

以下不作为实施目标：

```text
old DTO alias
old enum alias
old route redirect
old API compatibility input
legacy persistence reader
bounded dual-read
bounded dual-write
legacy import window
temporary shadow model
```

consumer 在同一原子 batch 中改到 canonical contract；旧 surface 随即删除。

### 3. Data Portability 从 V3 新格式直接开始

Data Portability 保留为长期产品能力，但：

- 不提供 V2 writer；
- 不提供 V2 reader/migrator；
- 不恢复 Editor/Dashboard/旧 Reminder/旧 Repository 等已退休 payload；
- 当前旧 backup 明确视为 unsupported；
- V3 只描述最终 surviving owner facts。

未来 V3 之后的真实产品版本升级可独立设计 migration policy，不由本轮历史负担预先污染模型。

### 4. Schema 使用 clean canonical baseline

本轮可以采用数据库 reset / destructive migration / migration squash 中工程成本最低且可验证的方式，目标是最终：

```text
Prisma schema = canonical vNext truth
PowerSync schema = canonical offline projection truth
fresh database bootstrap = green
```

无需证明旧数据库内容升级后值保持一致。

### 5. 仍然必须保护行为与工程不变量

“不要迁数据”不等于“可以破坏正确行为”。以下仍是硬约束：

- Scheduler lease/fencing/retry/crash recovery；
- Notification outbox/replay/reliable delivery；
- Better Auth security/session enforcement；
- GitHub App installation/security semantics；
- Knowledge Git/Vault truth and confirmation boundaries；
- Product Time timezone/DST correctness；
- Mastra workflow/HITL/restart semantics；
- API/IPC/Prisma/PowerSync canonical parity；
- Governance executable reference-module invariants。

这些通过 characterization / behavior tests 保护，而不是通过 legacy data compatibility 保护。

### 6. External-user-data features are not legacy migration

未来产品允许用户连接已有 Obsidian Vault、导入第三方数据或选择已有文件时，相关 adoption/import 行为属于**产品能力**，不属于“保留当前 MemoFlow 旧数据库”。

例如 ADR-090 的：

```text
existing Markdown note
→ explicit memoflow_id adoption
→ stable KnowledgeDocumentId
```

继续保留，因为这是未来正常用户路径。

但当前 MemoFlow 旧 path-derived relation/data 不需要迁移修复。

### 7. Historical ADR text vs execution truth

ADR-067~110 中关于领域 ownership、状态机、contract 目标、reliability 的决策继续有效。

其中所有仅为当前旧数据/旧客户端服务的 migration/compatibility clauses，被本 ADR 统一 supersede。

如果旧 ADR 写有：

> “先兼容读取旧格式，再迁移后删除”

本轮执行解释为：

> “直接实现 canonical target，切换全部 current consumers，然后删除旧格式。”

## Immediate execution changes

### Remove from active work

- Goal historical text/KR value backfill；
- Setting old preference precedence/backfill；
- Data Portability V2 migration window；
- Editor backup compatibility warning path；
- Legacy Reminder -> Routine row converter；
- Legacy ScheduleTask -> ScheduledInvocation row converter；
- Notification old Channel/Template/History compatibility projections；
- AI legacy transcript/quota/generation-task data preservation；
- Dashboard `/dashboard` compatibility redirect；
- Account.settings/contact data copy；
- old Repository/Folder/Resource portability preservation；
- Time/Label legacy consumer adapters once current consumers can be changed atomically。

### Keep

- current behavior characterization needed to preserve real product semantics；
- schema/contract compile-time cutover tests；
- fresh bootstrap/seed tests；
- final no-legacy architecture locks；
- destructive deletion review；
- exact-head CI / Docker / E2E validation。

## Rollback

Rollback is source/deployment rollback plus database reset/reseed, **not** runtime compatibility code.

No rollback requirement justifies keeping old models in production source.
