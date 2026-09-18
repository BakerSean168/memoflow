---
tags: [product, module, data-portability]
description: Data Portability V3-only owner-driven backup and restore boundary
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-18T00:00:00+00:00
---

# Data Portability 模块说明

PORT-1611 完成后，Data Portability 是跨模块的 V3 backup/restore
orchestrator，不是业务事实 owner，也不复制 Goal、Task、Routine、Schedule、AI
或 Notification 的 persistence model。ADR-111 的 destructive cutover 已落地：旧
MemoFlow backup 不受支持，不存在 V1/V2 reader、migrator、compatibility window、
dual-read、dual-write、fallback 或 backfill。

## Product surface

Importable user business backup 只有 owner-driven V3 envelope：

```text
POST /api/v1/data-portability/export
POST /api/v1/data-portability/dry-run
POST /api/v1/data-portability/apply

data-portability:export
data-portability:dry-run
data-portability:apply
```

Web HTTP 与 Desktop IPC 使用同一个 `DataPortabilityApplicationPort` 和同一个
V3 coordinator。Export 返回 `memoflow-user-data-v3-*.json`；dry-run 不调用 owner
apply；apply 先完成完整 dependency-ordered preflight，再写入 owner persistence。
V3 parser 对旧 `schemaVersion` 只返回 unsupported，不保留旧格式 DTO 或解释器。

## Current owner coverage

生产 API/Desktop registry 当前注册相同的十个 capability，schema version 均为 3：

| key | owner | dependency |
| --- | --- | --- |
| `account-profile` | Account | `preferences` |
| `preferences` | Setting | — |
| `notification-delivery-preferences` | Notification | — |
| `routines` | Reminder/Routine | — |
| `schedules` | Schedule | — |
| `notifications` | Notification | — |
| `labels` | Label | — |
| `goals` | Goal | `labels` |
| `tasks` | Task | `labels`, `goals` |
| `ai-conversations` | AI | — |

Data Portability 只负责 registry、确定性 dependency/reference ordering、envelope
版本检查、host-owned identity、安全 blacklist、dry-run/conflict receipt 和 warnings。
Capability payload schema、export projection、reference binding、dry-run 与 apply 全部
由 owner 实现。数据库 id、source identity、secret、credential、runtime state、cache、
outbox、audit 和 delivery receipt 不会被恢复。

## Server-held disclosure

Server-held disclosure 是单独的 Web-only transparency export，不是 business backup：

- envelope kind 是 `memoflow.server-held-data-disclosure`；
- `scope.importMode` 是 `not-importable`；
- `includesImportableBusinessDataBackup` 是 `false`；
- Desktop IPC 不提供 disclosure channel；
- V3 parser 在 capability validation 前拒绝 disclosure payload。

Disclosure 仍可包含服务端持有的 Knowledge projection、repository observation 和 cached
bytes，但这些事实不会进入任何 V3 import/apply path。

## Evidence and boundaries

- [ADR-106](../../architecture/adr/ADR-106-owner-driven-data-portability-v3.md)
- [ADR-111](../../architecture/adr/ADR-111-zero-legacy-data-destructive-cutover-policy.md)
- [PORT-1611 closure evidence](../../analysis/2026-09-18-port-1611-v3-only-cutover-evidence.md)

CLEAN-2601 负责剩余 whole-schema legacy deletion；本模块不借 PORT-1611 删除无关的
旧表、owner domain object 或 schema residue。
