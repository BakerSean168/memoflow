---
tags: [adr, data-portability, backup, import, migration]
description: Data Portability V3 采用 owner-driven capability registry 与 versioned manifest
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-18T00:00:00+08:00
---

# ADR-106: Owner-driven Data Portability V3

**状态：** 已采纳并实施；PORT-1611 已完成 V3-only destructive cutover
**日期：** 2026-09-09

## Problem

`PortableUserDataV2` 复制所有模块内部 DTO，已与 Goal/Task/Routine/Planner/Knowledge/Setting/AI vNext 大量冲突。继续在 Data Portability 中手写每个模块 repository port 会形成第二个 domain model。

## Decision

### 1. Data Portability owns orchestration, not module data shapes

Canonical framework:

```text
PortableBackupEnvelopeV3
├── format
├── schemaVersion
├── exportedAt
├── productVersion
└── capabilities[]
    ├── key
    ├── schemaVersion
    └── payload

PortableCapabilityRegistry
├── export
├── validate/dry-run
├── validate exact owner schema version
├── import/apply
└── reference mapping
```

Capability implementations由 owner module 提供并在 host composition root 注册。

### 2. Typed capability contracts

Payload 不允许 unrestricted `unknown` 直通。每个 capability 有 canonical Zod/schema + explicit schema version。当前生产 registry 的实际 owner contracts 为：

```text
account-profile@3
preferences@3
notification-delivery-preferences@3
routines@3
schedules@3
notifications@3
labels@3
goals@3
tasks@3
ai-conversations@3
```

Data Portability 只通过统一 `PortableCapability` interface 编排。

### 3. Cross-capability references

使用 export-local stable refs：

```text
capability key + portable ref
```

导入分阶段：

1. decode/validate；
2. exact capability schema-version validation；
3. dry-run and conflict plan；
4. create identity-bearing roots；
5. resolve cross references；
6. owner apply；
7. receipt/warnings。

不恢复源 `identityId` / database id / secret。

### 4. Importable vs non-importable classes

- importable business facts；
- server-held disclosure（不可导入）；
- optional device-local config；
- runtime/projection/cache/secret（不导出为可恢复业务事实）。

### 5. Explicit retirement in V3

V3 不新增以下 capability：

- legacy Editor workspace；
- Dashboard/config；
- Scheduler invocation/attempt runtime；
- Notification dispatch/outbox receipts；
- AI execution logs/vector index/runtime checkpoints；
- old Repository/Folder/Resource projections；
- Better Auth credentials/sessions/providers。

### 6. Legacy V1/V2 policy — superseded by ADR-111 and completed by PORT-1611

ADR-111 已明确采用 zero-legacy-data destructive cutover：

- 不提供 V2 writer；
- 不提供 V2 reader/migrator 或 compatibility window；
- 旧 backup 明确 unsupported；
- V3 只包含最终 surviving owner facts；
- PORT-1611 已删除生产 V1/V2 reader、writer、importer、projection、mini-repository port、transport DTO 和 compatibility fixture。
- V1/V2 backup 在 product boundary 明确返回 unsupported schemaVersion；系统不保留 parser、migrator、dual-read、dual-write、alias、fallback、backfill 或旧 backup restore path。

### 7. Current product boundary after PORT-1611

The only import/export business-backup surface is the owner-driven V3
envelope/coordinator:

```text
POST /data-portability/export
POST /data-portability/dry-run
POST /data-portability/apply
IPC data-portability:export / data-portability:dry-run / data-portability:apply
```

API and Desktop register the same ten owner capabilities. The registry orders
dependencies deterministically (`preferences` before `account-profile`, then
`labels` → `goals` → `tasks`). Server-held disclosure remains a separate Web
export with `importMode: not-importable` and is rejected before V3 capability
validation; it is never a V3 capability or restorable user data.

Closure evidence: `docs/analysis/2026-09-18-port-1611-v3-only-cutover-evidence.md`.

## Protected security invariants

- host-owned identity；
- secret/key blacklist fail closed；
- dry-run no mutation；
- server-held disclosure不可导入；
- owner module validation always runs on import；
- import receipt records skipped/conflicted/migrated sections。
