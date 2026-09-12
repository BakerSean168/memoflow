---
tags: [adr, data-portability, backup, import, migration]
description: Data Portability V3 采用 owner-driven capability registry 与 versioned manifest
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-09T00:31:00+08:00
---

# ADR-106: Owner-driven Data Portability V3

**状态：** 已采纳，部分实施（V3 framework + preferences@3 owner 已落地；full cutover pending）
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

Payload 不允许 unrestricted `unknown` 直通。每个 capability 有 canonical Zod/schema + explicit schema version。例如：

```text
goal@3
task@3
routine@2
knowledge@2
preferences@3
notification-preferences@2
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

### 6. Legacy V2 policy — superseded by ADR-111

ADR-111 已明确采用 zero-legacy-data destructive cutover：

- 不提供 V2 writer；
- 不提供 V2 reader/migrator 或 compatibility window；
- 旧 backup 明确 unsupported；
- V3 只包含最终 surviving owner facts；
- 当前生产 V2 路径仅是 full V3 owner coverage 完成前的实施中间态，不是兼容策略，必须由 PORT-1603 删除。

## Protected security invariants

- host-owned identity；
- secret/key blacklist fail closed；
- dry-run no mutation；
- server-held disclosure不可导入；
- owner module validation always runs on import；
- import receipt records skipped/conflicted/migrated sections。
