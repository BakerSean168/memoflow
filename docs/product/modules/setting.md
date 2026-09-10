---
tags:
  - product
  - module
  - setting
description: 设置模块当前功能资产说明与 Setting vNext target-design 入口
created: 2026-06-02T00:00:00
updated: 2026-09-09T12:00:00+08:00
---

# 设置模块说明

> **vNext implementation notice（2026-09-10）**：本文把当前运行路径与历史/目标 rationale 分开记录。`SETTING-9203`/`9204`/`9205` 已完成 Account/Notification shadow retirement、canonical presentation/regional consumer cutover，以及 dead/fake UserSetting surface retirement；legacy `UserSetting` 只保留 appearance + locale remainder。Canonical `presentation | regional` contracts、owner-specific seams 与 Settings Hub composition 是当前实现边界。不存在 backfill、dual-read 或 dual-write。完整目标仍见 [ADR-092](../../architecture/adr/ADR-092-settings-hub-and-preference-ownership-boundary.md)～[ADR-095](../../architecture/adr/ADR-095-preference-persistence-sync-migration-and-portability.md)、[product target](../setting-vnext-settings-hub.md) 与 [active plan](../../plan/active/2026-09-08-setting-vnext-model-convergence.md)。

## 1. 当前功能定位

当前代码里同时存在两个不同概念：

```text
Settings UI
= 外观、Knowledge、AI、Notification、Account、Data、Advanced 的统一入口

UserSetting
= identity-scoped preferences JSONB 聚合
```

因此即使在当前实现里，Settings 页面也已经不是单纯的 `UserSetting` 编辑器：AI Provider 由 AI module 管理、Knowledge connection 由 Repository/Knowledge 管理、Notification channel preference 由 Notification module 管理、Account/Profile/Password 由 Account/Auth 管理、User Files 路径由 Desktop host IPC 管理。

## 2. 当前 `UserSetting` 功能

当前 legacy `UserSetting.preferences` 只保留 live legacy remainder 两个 category：

```text
appearance
locale
```

其中成熟度并不相同：

- `appearance`：theme 有真实 Settings UI、bootstrap 与即时应用路径。
- `locale`：language/timezone/date/time/week remainder 由 legacy Settings 保留；`locale.currency` 已 retired，canonical presentation/regional seams 承担当前 preference truth。
- `workflow`、`privacy`、`notification`、`shortcuts`、`experimental`、`ui`、`ai`：作为 legacy UserSetting categories 已 retired；它们的真实 capability 由对应 owner 管理，或等待明确的 future owner，不再由 fake UserSetting editor 表示。
- 当前实现不含已退役的 in-app `editor` category；portable `editor_*` backup tables 仍归 Data Portability owner 管理。

## 3. 当前 Settings UI 分组

`UserSettingsView.vue` 当前 7 个 group：

```text
appearance
repository
ai
notifications
account
data
advanced
```

对应：

| Group         | 当前主要 capability/owner                                            |
| ------------- | -------------------------------------------------------------------- |
| Appearance    | UserSetting appearance/locale + presentation bootstrap               |
| Repository    | Repository/Knowledge                                                 |
| AI            | AI provider/onboarding                                               |
| Notifications | NotificationPreference + retained device-local notification surface |
| Account       | Account/Profile、Cloud Auth/Password                               |
| Data          | UserFiles Desktop IPC、Settings JSON export/import、Data Portability |
| Advanced      | Settings import/export、reset 与其他 retained actions               |

当前已有 `?tab=` 深链与 `settings-tab-{value}` 测试 contract；Advanced 只承载真实的数据导入导出、reset 与其他 retained actions，不再挂载 fake workflow/privacy/shortcut/experimental editor。

## 4. 当前持久化与同步

### 4.1 当前运行路径：retained legacy `UserSetting`

Prisma：

```text
user_settings
├── id
├── identity_id unique
├── preferences Json
├── version
└── timestamps
```

PowerSync 也以一条 `user_settings` row + JSON string 同步。

目前保留的 appearance/locale remainder 仍可由 legacy aggregate 读取/reset；canonical presentation/regional preference 已是 current Settings consumer 的真值。

当前 Aggregate 会 `version += 1`，但 Prisma `upsert` 不带 `expectedVersion` compare-and-swap，所以 version 不是实际 optimistic-concurrency fence。

### 4.2 当前 canonical Preferences seam

`SETTING-9202` 已增加：

```text
user_preference_records
├── identity_id
├── namespace = presentation | regional
├── payload
├── revision
└── timestamps
```

其中 `(identity_id, namespace)` 唯一，每个 namespace 是独立 persistence/sync/CAS unit。Prisma 与 PowerSync 都以 `expected revision` 作为真实 compare-and-swap fence；首次写入 revision `1`，不存在 namespace 的纯读取使用 virtual revision `0` 且不 persistence-on-read。

当前 host repository set 暴露 legacy remainder 与 canonical `userPreferenceRepository`；Settings HTTP/IPC/UI 的 presentation/regional consumers 走 canonical seam。legacy aggregate 只保留当前 retained appearance/locale 的窄边界，**不是**新旧 truth 的 dual-read/dual-write compatibility 机制。

PowerSync 云端链路也已登记 canonical table：server sync stream 会下发 `user_preference_records`，Desktop pre-hydration 会等待该表，API upload 对这张表使用专用 revision-CAS handler 而不是 generic last-write-wins `upsert/update`。并发冲突返回 HTTP `409`，因此 current canonical path 已保证“冲突不静默覆盖”；具体 owner action 由对应 module seam 处理。

## 5. 当前重复 truth

### Account / Notification owner seams

Account 与 Notification shadow 已在 SETTING-9203/9204 中移除；当前 owner seams 是：

```text
NotificationPreference
├── globalChannels
├── workflowOverrides
├── doNotDisturb
└── rateLimit
```

legacy `UserSetting` 不再保存 Account 或 Notification category。

## 6. 当前 timezone 行为风险

当前 regional preference 由 canonical seam 提供 timezone/date/time/week context；历史上的 Account vs UserSetting timezone 双真值只保留在下方 target rationale/历史资料中，不是当前实现契约。

## 7. 当前导入/导出

Standalone Settings export 当前包含：

```text
version = 2.0.0
exportedAt
identityId
settings/preferences
```

Import 只校验版本是否为 `1.0.0`/`2.0.0`，随后把 payload cast 成 `Partial<UserSettingPreferences>`；当前没有 version-specific strict decoder + deterministic migrator。

Full Data Portability 已经把 settings、NotificationPreference、ReminderPreference 等作为不同 owner section 处理，这个边界是 vNext 应继续采用的基础。

## 8. 当前 presentation bootstrap

`PresentationPreferenceStore` 本地持久化：

```text
locale
theme
```

用于 Settings API 完成前快速恢复 presentation；`usePresentationBootstrap` 随后加载 server defaults/UserSetting 并同步。

这层 store 当前应理解为 presentation cache/bootstrap projection，不应演变为新的 canonical preference truth。

## 9. 当前正确保留的 owner 边界

以下当前做法符合 vNext 方向，应保护：

- AI provider/secret/default model 由 AI module 管理；
- Knowledge source binding 由 Repository/Knowledge 管理；
- Notification workflow/channel preference 已有 Notification owner；
- User files path 通过 Desktop local IPC 管理，不在 cloud UserSetting；
- Data Portability 负责跨模块 export/import orchestration；
- `@memoflow/time` 已有 TimeZoneId/TimeStyle/Recurrence 能力，不需要 Setting 自建时间库。

## 10. 已采纳的 Setting vNext 方向

目标将收敛为：

```text
Settings Hub
= capability composition

UserPreferenceProfile
├── presentation
│   ├── theme
│   └── language
└── regional
    ├── timeZone
    ├── dateStyle
    ├── timeStyle
    └── weekStartsOn
```

其他当前字段的目标 owner：

```text
Notification channel/QuietHours -> Notification
sound/custom notification       -> Device Surface
shortcuts                       -> future DeviceKeymap
local UI state                  -> presentation local state
AI                              -> AI
Knowledge                       -> Repository/Knowledge
Account security/profile        -> Account/Auth
feature/experiment              -> future Feature evaluator
usage analytics consent         -> future explicit Consent owner
```

详细 target 见 [Setting vNext Settings Hub](../setting-vnext-settings-hub.md)。

## 11. 已解决债务与剩余实施优先级

### 已解决的历史债务

以下问题是 9203/9204/9205 的实施背景，不是当前风险：

- timezone 双真值，以及 `Account.settings` 与 `UserSetting` 的重复 truth（SETTING-9203）；
- `NotificationPreference` 与 `UserSetting.notification` 的 shadow truth（SETTING-9204）；
- fake privacy / experimental / shortcut / workflow / ui / ai surfaces（SETTING-9205）。

当前代码已经完成这些 owner cutover 或 dead/fake surface retirement；不要把它们重新描述为待修复的产品能力。

### 当前仍剩余的实施债务

1. legacy appearance/locale remainder，以及 giant JSON persistence + fake legacy revision，随 SETTING-9209 完成最终删除；
2. device/local persistence 与 scope seams，按 SETTING-9206 实施；
3. strict portability/migration cutover，按 SETTING-9208 实施；
4. legacy fields/runtime 的最终删除，按 SETTING-9209 实施；
5. review、evidence 收口与 archive，按 SETTING-9210 实施。

实施顺序以 [Setting vNext active plan](../../plan/active/2026-09-08-setting-vnext-model-convergence.md) 为真值，并受 ADR-111 的 zero-legacy-data destructive cutover policy 约束。

## 12. 相关资料

- [Setting vNext current-system map](../../analysis/2026-09-08-setting-vnext-current-system-map.md)
- [Setting vNext reference study](../../analysis/2026-09-08-setting-vnext-reference-study.md)
- [Setting vNext Settings Hub](../setting-vnext-settings-hub.md)
- [ADR-092](../../architecture/adr/ADR-092-settings-hub-and-preference-ownership-boundary.md)
- [ADR-093](../../architecture/adr/ADR-093-user-preference-profile-and-product-time-context.md)
- [ADR-094](../../architecture/adr/ADR-094-device-preference-feature-policy-and-consent-boundary.md)
- [ADR-095](../../architecture/adr/ADR-095-preference-persistence-sync-migration-and-portability.md)
- [ADR-037 Product Time](../../architecture/adr/ADR-037-product-time-system.md)
- [ADR-088 Notification Preference](../../architecture/adr/ADR-088-notification-preference-quiet-hours-realtime-and-operations-boundary.md)
- [设置模块文件索引](../module-index/setting-files.md)
