---
tags:
  - product
  - module
  - setting
description: 设置模块当前功能资产说明与 Setting vNext target-design 入口
created: 2026-06-02T00:00:00
updated: 2026-09-08T23:26:00+08:00
---

# 设置模块说明

> **Target-design notice（2026-09-08）**：本文件描述当前实现真值。Setting vNext 已由 [ADR-092](../../architecture/adr/ADR-092-settings-hub-and-preference-ownership-boundary.md)～[ADR-095](../../architecture/adr/ADR-095-preference-persistence-sync-migration-and-portability.md) 采纳为目标设计：Settings 页面将作为多 capability composition hub；cloud User Preferences 收缩为 presentation + regional/time；Account/Notification/device/feature/consent 等回归各自 owner。实施前不得把该目标态描述成当前代码事实。详见 [current-system map](../../analysis/2026-09-08-setting-vnext-current-system-map.md)、[reference study](../../analysis/2026-09-08-setting-vnext-reference-study.md)、[product target](../setting-vnext-settings-hub.md) 与 [active plan](../../plan/active/2026-09-08-setting-vnext-model-convergence.md)。

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

当前 `UserSetting.preferences` 有 9 个 category：

```text
appearance
locale
workflow
privacy
notification
shortcuts
experimental
ui
ai
```

其中成熟度并不相同：

- `appearance`：theme 有真实 Settings UI、bootstrap 与即时应用路径。
- `locale`：language/timezone/date/time/week/currency schema 存在；language/theme 有 presentation consumer；timezone 存在与 Account 双真值问题。
- `notification`：`useCustomNotification` 有 Desktop runtime consumer，但 channel preference 已另由 Notification module 管理。
- `workflow`：schema/mock/i18n 存在，生产消费者基本为空，并含已过时 `defaultGoalView=TREE` 等语义。
- `privacy`：有 UI/schema，但当前 Settings root 只改 local `v-model`，没有稳定 UserSetting persistence handler；同时 UI `FRIENDS` 与 contract `FRIENDS_ONLY` 漂移。
- `shortcuts`：schema 和组件存在，但 root `shortcutCategories` 当前为空，未形成 CommandRegistry + persistence 产品链。
- `experimental`：UI hard-code feature strings，但没有真实 feature evaluator；root 当前也没有稳定 save/apply handler。
- `ui`：`startPage/sidebarCollapsed` schema 存在，没有稳定 cloud behavior consumer。
- `ai`：schema 是空 object；真正 AI provider/model/secret 已由 AI module 管理。

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
| Notifications | UserSetting device-style residue + NotificationPreference            |
| Account       | Account/Profile、Cloud Auth/Password、Privacy UI shell               |
| Data          | UserFiles Desktop IPC、Settings JSON export/import、Data Portability |
| Advanced      | Shortcut UI shell、Reset、Experimental UI shell                      |

当前已有 `?tab=` 深链与 `settings-tab-{value}` 测试 contract。

## 4. 当前持久化与同步

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

所有 category 因此共享整条 singleton JSON persistence/sync 粒度。

当前 Aggregate 会 `version += 1`，但 Prisma `upsert` 不带 `expectedVersion` compare-and-swap，所以 version 不是实际 optimistic-concurrency fence。

## 5. 当前重复 truth

### Account vs UserSetting

当前 Account 仍拥有：

```text
theme
language
timezone
notificationEnabled
```

UserSetting 同时拥有对应 preference，因此形成双真值。

### Notification vs UserSetting

当前 Notification module 已拥有：

```text
NotificationPreference
├── globalChannels
├── workflowOverrides
├── doNotDisturb
└── rateLimit
```

UserSetting 仍有 `notification.email/push/inApp/sound/useCustomNotification`，形成第二层双轨。

## 6. 当前 timezone 行为风险

Settings 页面更新：

```text
UserSetting.preferences.locale.timezone
```

但 Reminder server 的 Account timezone adapter 当前读取：

```text
Account.settings.timezone
```

Renderer helper 又按：

```text
Account timezone -> UserSetting timezone -> host timezone
```

取值。

因此同一用户可能在 Settings UI 看到一个 timezone，而 Reminder server 按另一个 timezone 计算。这是 Setting vNext 最高优先级语义债之一。

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

## 11. 当前风险与实施优先级

```text
P0/P1 semantic
1. timezone 双真值影响业务时间
2. Account.settings vs UserSetting
3. NotificationPreference vs UserSetting.notification

P1 architecture/data
4. giant JSON persistence + fake revision
5. loose import/migration

P2 product truth
6. fake privacy controls
7. fake experimental controls
8. shortcut shell
9. workflow/ui/ai dead categories
```

实施顺序以 [Setting vNext active plan](../../plan/active/2026-09-08-setting-vnext-model-convergence.md) 为真值。

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
