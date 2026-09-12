---
tags:
  - adr
  - setting
  - preferences
  - ownership
  - ui
  - vnext
description: ADR-092 - Settings Hub 作为 capability composition surface，User Preferences 收缩为无更强 owner 的跨设备偏好
created: 2026-09-08T23:26:00+08:00
updated: 2026-09-08T23:26:00+08:00
---

# ADR-092: Settings Hub 与 Preference Ownership Boundary

**状态：** 已采纳（待实施）
**日期：** 2026-09-08
**影响范围：** Setting、Account、Notification、AI、Repository/Knowledge、Desktop、Data Portability、Web/Mobile Settings UI

## 1. 决策摘要

MemoFlow 将“设置页”与“设置领域所有权”明确分离：

> **Settings Hub 是 UI capability composition surface，不是一个拥有所有设置的 bounded context。**
> **User Preferences 只拥有没有更强业务 owner、并且确有跨设备同步价值的用户偏好。**

目标 ownership taxonomy：

```text
Settings Hub
  = presentation/composition only

User Preferences
  = cross-device user preference with no stronger owner

Module Preferences
  = Notification / AI / Knowledge / Account / ... owner module

Device Preferences
  = Desktop/Mobile/Web host-local or device-scoped state

Product/System Policy
  = feature entitlement / experiment rollout / telemetry policy / hard guard
```

因此不再把“能从 Settings 页面修改”推导为“必须存进 `UserSetting.preferences`”。

## 2. 当前问题

当前 `UserSetting.preferences` 同时包含：

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

但实际 Settings UI 已经是多模块组合：

```text
Appearance / Locale        -> Setting
Knowledge                  -> Repository/Knowledge
AI Providers               -> AI
Notification channels      -> Notification
Account/Profile/Password   -> Account / CloudAuth
Data portability           -> Data Portability
User files path            -> Desktop host capability
```

当前最严重的问题不是“页面分组不好看”，而是多个 owner 已经出现以后，旧 `UserSetting` 仍继续保留对应 shadow fields，形成双真值和假功能。

最典型的双真值：

```text
Account.settings.theme
vs UserSetting.preferences.appearance.theme

Account.settings.language
vs UserSetting.preferences.locale.language

Account.settings.timezone
vs UserSetting.preferences.locale.timezone

Account.settings.notificationEnabled
vs UserSetting.preferences.notification.*
vs NotificationPreference
```

## 3. Product Constitution

### 3.1 Settings Hub 不拥有业务状态

Settings Hub 可以展示和编辑多个 capability，但不创建一个新的“Settings God Aggregate”。

禁止目标：

```text
SettingsAggregate
├── account
├── aiProvider
├── notification
├── vault
├── shortcuts
└── every future preference
```

Settings Hub 只组合 owner application/client ports。

### 3.2 一个语义只能有一个 canonical owner

如果已有更强 owner：

```text
AI provider credentials/models -> AI
Notification channels/quiet hours -> Notification
Knowledge repository binding -> Repository/Knowledge
Account profile/security -> Account/Auth
Wallet currency -> Wallet
```

则 Setting 不保存 mirror/shadow truth。

### 3.3 不为现有 UI 壳反向发明领域

当前存在 UI/schema 并不等于该功能已经形成产品能力。

没有真实消费者的：

```text
workflow.*
privacy social controls
experimental string[]
ui.startPage/sidebarCollapsed
ai: {}
```

不得因为“已经有表单”而补做成永久 cloud preference。

### 3.4 Device-specific state 不默认跨设备同步

例如：

```text
Desktop custom notification style
sound
keyboard accelerators
sidebar collapsed
local files root path
OS focus/DND observation
```

这些由 device/host owner 管理，不进入 canonical cross-device User Preferences。

### 3.5 Product/System Policy 不伪装成用户偏好

Feature rollout、entitlement、hard safety/anti-spam guard、telemetry runtime policy 不能存为用户可任意改写的 generic settings key。

## 4. Target ownership model

```text
                         Settings Hub
                     (UI composition only)
                              │
          ┌───────────────────┼────────────────────┐
          │                   │                    │
          ▼                   ▼                    ▼
   User Preferences     Module Preferences    Device Preferences
   cross-device         owner module          host/profile/device

   presentation         Notification          notification surface
   regional/time        AI                    keyboard keymap
   accessibility?       Knowledge             window/sidebar state
                        Account               local files path
                        ...                   ...
                              │
                              ▼
                     Product/System Policy
                     feature entitlement
                     experiment rollout
                     telemetry policy
                     runtime hard guards
```

## 5. Canonical owner matrix

| Current field/capability                   | Target owner                            | Target action                                        |
| ------------------------------------------ | --------------------------------------- | ---------------------------------------------------- |
| `appearance.theme`                         | User Preferences                        | 保留并迁移到 `presentation.theme`                    |
| `locale.language`                          | User Preferences                        | 保留并迁移到 `presentation.language`                 |
| `locale.timezone`                          | User Preferences / Product Time context | 保留并迁移到 `regional.timeZone`                     |
| `locale.dateFormat`                        | User Preferences / TimeStyle            | 收敛为受控 `regional.dateStyle`                      |
| `locale.timeFormat`                        | User Preferences / TimeStyle            | 收敛为受控 `regional.timeStyle`                      |
| `locale.weekStartsOn`                      | User Preferences / TimeStyle            | 保留                                                 |
| `locale.currency`                          | Wallet if future default is needed      | 从 general preference 删除；不改已有 Wallet currency |
| `workflow.*`                               | none                                    | 退休；真实模块需求以后由 owner 重建                  |
| `privacy.profileVisibility`                | future Social/Collaboration owner only  | 当前删除                                             |
| `privacy.showOnlineStatus`                 | future Presence owner only              | 当前删除                                             |
| `privacy.allowSearchByEmail/Phone`         | future Discovery owner only             | 当前删除                                             |
| `privacy.shareUsageData`                   | future Privacy/Telemetry Consent        | 不作为 generic bool 保留；见 ADR-094                 |
| `notification.email/push/inApp`            | NotificationPreference                  | 从 User Preferences 删除                             |
| `notification.sound`                       | Device Notification Surface             | 迁出 cloud preference                                |
| `notification.useCustomNotification`       | Desktop Device Preference               | 迁出 cloud preference                                |
| `shortcuts.*`                              | Device Keymap                           | 从 cloud preference 删除；见 ADR-094                 |
| `experimental.*`                           | Feature/Experiment system               | 删除 arbitrary strings；见 ADR-094                   |
| `ui.sidebarCollapsed`                      | Local UI state                          | 迁出 cloud preference                                |
| `ui.startPage`                             | none until real consumer exists         | 当前删除                                             |
| `ai: {}`                                   | AI owner already exists                 | 删除空 category                                      |
| `Account.settings.theme/language/timezone` | User Preferences                        | 迁出 Account                                         |
| `Account.settings.notificationEnabled`     | NotificationPreference                  | 迁出 Account                                         |

## 6. Account boundary

目标 Account：

```text
Account
├── identity projection
├── profile
├── contact projection
├── lifecycle
└── account/security-facing metadata
```

Account 不再拥有：

```text
theme
language
timezone
notificationEnabled
```

这些字段目前位于 `Account.settings`，属于历史 convenience bundle，不再作为目标领域模型的一部分。

迁移完成后：

```text
accounts.settings
```

应从 Prisma/PowerSync/contracts/application use cases 中删除，而不是长期作为 compatibility shadow 保留。

本 ADR 不改变 ADR-039 已冻结的 Cloud Auth / Local Profile Access 边界。

## 7. Module-owned preferences

### 7.1 Notification

ADR-088 已经定义 NotificationPreference、QuietHours、Device Surface 的目标边界。

Setting 只负责把 Notification capability 放进 Settings Hub；不再保存：

```text
email
push
inApp
```

的第二份 truth。

### 7.2 AI

AI Provider、secret、base URL、default model、model discovery/onboarding 已由 AI 模块拥有。

因此 `UserSetting.preferences.ai = {}` 不再保留。

Settings Hub 的 AI 页面继续直接依赖 AI client/application port。

### 7.3 Knowledge

Knowledge Repository/Vault/GitHub binding 按 ADR-089~091 继续由 Repository/Knowledge owner 管理。

Settings Hub 只是管理入口，不把 repository id、vault path、GitHub state 抄入 User Preferences。

### 7.4 Data Portability

Data Portability 是跨模块导出/导入 orchestrator。

Setting/Preferences 只负责自己的 preference payload，不拥有：

```text
NotificationPreference
AI provider state
Knowledge binding
Account profile
```

的 portable truth。

## 8. Settings Hub composition contract

目标 Settings Hub 不是服务端聚合，也不是必须存在的单一 backend query。

推荐 client-side composition：

```text
SettingsScene
├── UserPreferenceClient
├── AccountClient
├── AuthClient
├── NotificationClient
├── KnowledgeClient
├── AIClient
├── DataPortabilityClient
└── DeviceCapabilityClient
```

每个 section：

1. 只加载自己需要的 owner capability；
2. 不为了打开 Settings 首页一次拉取所有 provider/remote state；
3. owner unavailable 时只降级对应 section；
4. 不把多个 owner 的 mutation 包装成一个不可解释的 `patchSettings()`。

## 9. User Preferences 的新边界

本 ADR 只冻结 ownership；具体 schema、Product Time Context 与 persistence 由 ADR-093/095 规定。

目标只保留：

```text
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

未来 accessibility 可以在有真实产品需求后作为显式 typed namespace 新增。

## 10. Generic Setting Registry 的限制

不建立：

```text
key: string
value: unknown
```

式无限 registry。

现有 dot-notation：

```text
appearance.theme
locale.timezone
```

可以作为迁移期内部兼容手段，但不是长期公共 contract。

长期 mutation 必须面向已注册、严格类型化 namespace。

## 11. Package naming

`@memoflow/setting` 在实施期可以保留包名以降低迁移噪音。

当 ownership 收敛完成后，可以单独做无行为改动 rename：

```text
@memoflow/setting
-> @memoflow/preferences
```

这不是本轮 DoD，不允许为了命名先扩大改动面。

## 12. Protected contracts

实施不得破坏：

1. Settings 路由和 `?tab=` 深链；
2. 现有 Settings group test selectors，在 UI 迁移完成前保持兼容；
3. Account/Auth profile/password/closure 行为；
4. ADR-039 guest/local profile ownership；
5. ADR-037 Product Time 不使用 ambient server timezone；
6. ADR-088 Notification owner/device boundary；
7. Data Portability identity 由 ExecutionContext 注入；
8. HTTP/IPC 与 Prisma/PowerSync parity；
9. Desktop local files path 不上传为 cloud preference；
10. 不保留永久 old/new 双公共 truth。

## 13. 明确拒绝

本 ADR 拒绝：

- 把 Settings 页面所有 section 重新塞进一个 `UserSetting` JSON；
- 在 Account 继续长期保留 preference mirror；
- 为当前空壳 UI 补造业务系统；
- 把 device setting 默认为 cloud-synced；
- 把 feature flag/consent/safety guard 作为 generic setting key；
- 通过 Settings Hub 绕过 owner application ports 直写别的模块表。

## 14. 迁移关系

本 ADR 与以下文档共同构成 Setting vNext 目标真值：

- ADR-093 — User Preference Profile 与 Product Time Context
- ADR-094 — Device Preference、Feature Policy 与 Consent Boundary
- ADR-095 — Preference Persistence、Sync、Migration 与 Portability
- ADR-037 — Product Time System
- ADR-039 — Cloud Auth / Local Profile Access
- ADR-088 — Notification Preference / Device Surface

实施完成前，当前源码和 Setting current-system map 仍是当前行为真值。
