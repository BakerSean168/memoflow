---
tags: [adr, account, profile, lifecycle, vnext]
description: Account 收敛为 Product Profile + Lifecycle，并退休 settings 与重复 Cloud identity truth
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-10T00:55:00+08:00
---

# ADR-104: Account Profile, Lifecycle and Cloud Identity Projection

**状态：** 已实施（ACC-1401～1407 已收口；AUTH-1501/AUTH-1502 未开始）
**日期：** 2026-09-09
**依赖：** ADR-039, ADR-092, ADR-093, ADR-100

> 2026-09-10 implementation checkpoint: `Account.settings` 已退休；`AccountView + CloudIdentitySummary` 已上线；Account lifecycle 已收敛为 `Active | Closed + closedAt`；无真实 capability 的 `ContactPhone` 与五个 phone persistence columns 已物理删除。ADR-111 的 destructive cutover 规则适用，因此本轮不保留 legacy backfill/dual-read compatibility。`ACC-1406` 已进一步退休 Account auth-email shadow、dead availability 与 legacy-auth bootstrap。`ACC-1407` 已删除 Account product `version`，保留 `AccountClosureOperation.version` 作为真实 CAS，并将 Account 创建/资料更新/关闭时间统一为显式 `Instant` + 注入式 `Clock`；Account persistence 不再以 ambient time 补缺。

## Decision

Account 的 canonical ownership 收敛为：

```text
Account
= Product Profile + Product Lifecycle
```

而不是 profile + auth contact + preference + speculative security states 的总集合。

### 1. Product profile

保留 nickname/avatar/bio 和有真实产品需求的 optional personal attributes。属性存在不代表它们属于 authentication identity。

Birthday 如保留必须是 `Ymd`。Account 时间戳使用 `Instant` + injected Clock。

### 2. Retire `Account.settings`

`theme/language/timezone` 迁入 UserPreference；`notificationEnabled` 迁入 NotificationPreference。删除 `/me/settings`、AccountSettings VO/event/JSON column only after consumers and portability are cut over.

### 3. Login email is not Account write truth

Cloud login email + verification 由 Cloud Auth/Better Auth authoritative。产品 Account read surface 如需要显示邮箱，使用 composed `AccountView` / `CloudIdentitySummary`。兼容期 `ContactEmail` 只能被 auth projection 写入，不提供独立业务修改语义，最终删除或降为明确 projection。

Local guest 不需要 fake login email 作为产品事实；guest display 由 Local Profile + AccountProfile 决定。

### 4. Lifecycle simplification

目标 Account lifecycle 只保留当前真实产品语义：

```text
Active
Closed
```

`Suspended` 在没有正式 admin/moderation control plane 之前删除。若未来真的需要 suspension，重新以独立 policy + audit 设计，而不是提前留 enum。

`closedAt` 是明确 lifecycle fact；Auth `disabledAt` 是 access enforcement projection，不是第二份产品 lifecycle。

### 5. Phone

当前无真实 verification/phone-auth capability。实施阶段先 characterization；无 consumer 时删除 ContactPhone verification/persistence。若未来需要普通 contact phone，则以普通 profile contact 重新设计；若需要 phone login，则归 Cloud Auth。

### 6. Concurrency

当前 Account `version` 不是有效 CAS。要么实现真正 expected-revision persistence，要么从 product contract 移除“版本可防 lost update”的假象。优先选择小型 profile revision/CAS，仅在并发场景有真实收益时实现。

## Protected assets

- same cloud Account id == Better Auth user id;
- Desktop local-first Account/Profile experience;
- tenant adoption identity safety;
- durable account closure coordinator and revocation/recovery/audit;
- Cloud sign-out != local Profile lock/delete.

## Migration order

1. move preference consumers off Account settings;
2. introduce composed Account/CloudIdentity read model;
3. remove Account email write semantics;
4. characterize/remove phone and Suspended;
5. normalize Clock/Instant and persistence;
6. remove legacy contracts/schema/PowerSync columns after Data Portability V3 migration.
