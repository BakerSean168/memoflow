---
tags:
  - adr
  - setting
  - device
  - shortcuts
  - feature-flags
  - privacy
  - consent
  - vnext
description: ADR-094 - Device Preference、Feature/Experiment Policy 与 Privacy Consent 从 cloud User Preferences 分离
created: 2026-09-08T23:26:00+08:00
updated: 2026-09-08T23:26:00+08:00
---

# ADR-094: Device Preference、Feature Policy 与 Consent Boundary

**状态：** 已采纳（待实施）
**日期：** 2026-09-08
**影响范围：** Setting UI、Desktop、Notification、Shortcut/Command、Feature/Labs、Privacy/Telemetry、Data Portability

## 1. 决策摘要

MemoFlow 不再把以下三类完全不同的东西塞进 cloud `UserSetting.preferences`：

```text
Device Preference
Feature / Experiment Policy
Privacy / Telemetry Consent
```

三者分别回答：

```text
Device Preference
= 这台设备/这个本地 profile 如何呈现和操作

Feature / Experiment Policy
= 产品是否向这个 context 提供某能力

Consent
= 用户是否明确授权某类可选数据处理
```

它们不能通过一个 generic boolean/string-array settings bag 互相冒充。

## 2. 当前混合状态

当前 UserSetting 中有：

```text
notification.sound
notification.useCustomNotification
shortcuts.enabled
shortcuts.custom
experimental.enabled
experimental.features[]
ui.startPage
ui.sidebarCollapsed
privacy.profileVisibility
privacy.showOnlineStatus
privacy.allowSearchByEmail
privacy.allowSearchByPhone
privacy.shareUsageData
```

这些字段的 scope、风险和 owner 完全不同。

当前部分字段甚至没有真实 runtime consumer；有些只有 UI/story/mock，有些 UI 改完也没有持久化 handler。

因此本 ADR 的重点是**删除错误 ownership 和假能力**，不是为每个旧字段补一套后端。

## 3. Device Preference 定义

Device Preference 是：

> 某一物理设备、host、local profile 或当前 window 的体验选择；换设备后未必应该相同。

典型例子：

```text
Desktop custom/native notification presentation
sound/vibration preference where device supports it
keyboard accelerator mapping
sidebar collapsed
window layout
local-only UX affordance
```

### 3.1 不等于 User Preferences

默认策略：

```text
cross-device sync = off
```

只有某项明确证明跨设备有稳定语义，并设计了 portability/scope 规则后，才可选择同步。

## 4. Notification device surface

按 ADR-063/088：

```text
NotificationPreference
= user-level delivery preference / QuietHours

Device Surface
= 当前设备实际如何 popup/sound/vibrate + OS capability
```

因此迁移：

```text
UserSetting.notification.sound
  -> DeviceNotificationPreference.soundEnabled

UserSetting.notification.useCustomNotification
  -> DesktopNotificationPreference.presentationMode
```

目标例：

```ts
interface DesktopNotificationPreference {
  presentationMode: 'native' | 'custom';
  soundEnabled: boolean;
}
```

这里的 `custom` 是 MemoFlow Desktop surface implementation choice，不进入 cloud Notification Fact。

### 4.1 Runtime event migration

当前 Desktop `NotificationService` 监听：

```text
setting:user-setting-patched
setting:user-setting-reset
```

只为了更新 `useCustomNotification`。

目标改为：

```text
DesktopNotificationPreferenceStore
  -> NotificationService runtime subscription/read
```

不再通过 cloud Setting domain event 驱动本地窗口样式。

## 5. Keyboard shortcut boundary

当前：

```text
shortcuts.enabled
shortcuts.custom: Record<string, string>
```

缺少 canonical command identity，也没有稳定跨平台 accelerator 语义。

目标分两层：

```text
CommandRegistry
├── commandKey
├── title/description
├── supportedHosts
└── defaultAcceleratorsByHost

DeviceKeymap
├── localProfileId/device scope
├── commandKey
└── accelerator override
```

例：

```text
task.create
  Windows/Linux -> Ctrl+Shift+T
  macOS         -> Cmd+Shift+T
```

### 5.1 规则

- accelerator 绑定 command semantic，不绑定组件 id；
- unknown commandKey 不允许静默保存；
- host 必须验证 accelerator grammar/conflict；
- Mobile 不强迫消费 Desktop keymap；
- 当前 cloud `shortcuts` category 退休；
- 本轮不要求立即实现完整 editable shortcut product，只有真实 CommandRegistry 后再开放 UI。

## 6. Local UI state

`sidebarCollapsed` 属于：

```text
window/local UI state
```

不属于 cloud user preference。

它应该由 presentation shell 自己持久化，例如按 local profile/window scope：

```text
LocalPresentationState
```

不需要 domain event、server DTO、PowerSync row。

`startPage` 当前没有真实稳定消费者；先删除 cloud field。若未来正式提供“默认启动页”，再作为明确 user preference 或 device preference 设计，不预占 schema。

## 7. User files path

当前 `UserFilesSettings` 通过 Desktop IPC：

```text
USER_FILES_GET_PATH
USER_FILES_PICK_DIRECTORY
USER_FILES_RESET_PATH
```

这是正确方向。

本 ADR 明确：

```text
local files root path
```

继续属于 Desktop/local profile host capability。

禁止把绝对路径同步进：

```text
UserPreferences
Account
PowerSync cloud rows
```

因为：

```text
C:\Users\A\...
/home/a/...
```

在另一设备没有稳定含义。

## 8. Experimental settings retirement

当前：

```text
experimental.enabled
experimental.features: string[]
```

UI hard-code 过：

```text
ai-assistant
voice-input
collaboration
advanced-analytics
```

但没有 canonical feature registry/evaluator 消费。

因此这些字段不能继续被称为“实验功能系统”。

目标：

```diff
- experimental.enabled
- experimental.features[]
```

从 User Preferences 删除。

## 9. 真正 Feature/Experiment model

未来若 MemoFlow 需要 Labs/rollout，必须建立独立 capability：

```text
FeatureDefinition
├── featureKey
├── lifecycle
├── defaultValue
├── context schema
├── rollout/targeting policy
└── userOptInAllowed

FeatureEvaluator
  evaluate(featureKey, context)

UserLabOptIn   // only when definition explicitly allows opt-in
├── featureKey
└── enabled
```

关键规则：

1. feature key 必须先注册；
2. evaluation 与用户 preference 分离；
3. rollout/entitlement 可以覆盖“不允许用户自行打开”的能力；
4. user opt-in 只适用于定义明确允许的 Labs；
5. 未知 key fail closed/返回定义的 default，而不是“字符串存在即启用”；
6. 不能通过导入 settings JSON 绕过 entitlement。

OpenFeature/Unleash 类系统只作为这一语义边界的行业参考，本 ADR 不强制引入某个 vendor/runtime。

## 10. Privacy 当前事实

当前 `privacy` schema：

```text
profileVisibility
showOnlineStatus
allowSearchByEmail
allowSearchByPhone
shareUsageData
```

其中前四项假设了 MemoFlow 存在：

```text
public/friends profile
presence
email/phone user discovery
```

当前系统并没有相应完整产品能力或 runtime enforcement。

另外当前 UI/contract 还有明显 drift：

```text
contract: FRIENDS_ONLY
UI:       FRIENDS
```

并且 Settings view 当前只 `v-model="privacy"`，没有对应 `updateCategory('privacy', ...)` 持久化路径。

因此不能把这些 UI 开关当成真实隐私控制。

## 11. Social/privacy fake controls retirement

当前删除：

```text
profileVisibility
showOnlineStatus
allowSearchByEmail
allowSearchByPhone
```

如果以后出现 Collaboration/Presence/Discovery：

```text
Social/Collaboration owner
```

必须定义真实 read/write/enforcement path，再新增设置。

禁止为了保留旧 UI 先造一个没有业务消费者的 Privacy Aggregate。

## 12. `shareUsageData` 与 Consent

`shareUsageData` 与前四项不同：它可能对应真实 telemetry/analytics consent。

但 consent 不是普通 preference boolean。

如果未来启用可选使用分析，应建立：

```ts
interface UsageAnalyticsConsent {
  subjectId: IdentityId;
  state: 'Granted' | 'Denied';
  policyVersion: string;
  changedAt: Instant;
  source: 'settings-ui' | 'onboarding';
}
```

并要求：

```text
Telemetry ingestion
  -> check effective consent/policy
```

### 12.1 Legacy true 不自动升级为新 consent

这是强约束：

```text
legacy shareUsageData = true
```

不能在迁移时自动生成：

```text
Consent Granted
```

因为旧开关没有新的 policyVersion、语义和审计证据。

允许：

- 在 legacy import/migration report 中记录旧值；
- 新 consent UI 上显式重新选择；
- 未重新同意时按 Denied/NotGranted 处理。

## 13. Device preference persistence

本 ADR 不建立一个新的“DeviceSetting God JSON”。

原则仍是 owner-oriented：

```text
Desktop Notification preference -> Desktop notification owner/local store
Keymap -> Command/Keymap owner/local store
Window/sidebar -> Shell presentation state
User files -> UserFiles capability
```

只有这些 owner 真的需要共享存储设施时，才可抽一个 typed local profile store；它仍不能接受 arbitrary string keys。

## 14. Portability

跨设备 backup 与自动 sync 是两件不同的事。

### 14.1 User data export

Data Portability 可以选择导出某些 device configuration 作为**显式 portable optional section**，但导入必须按 host capability 验证。

### 14.2 不自动迁移的旧字段

```text
shortcuts.*
ui.sidebarCollapsed
notification.sound/useCustomNotification
```

不得在 cloud migration 中静默复制到所有设备。

如果未来提供 host-specific import，必须让用户知道它作用于当前设备。

## 15. Settings UI 规则

设置页只显示真实可执行控制：

```text
visible control
-> canonical owner read
-> canonical owner mutation
-> actual runtime behavior
```

如果三者缺任一，不以稳定设置形式展示。

所以实施期允许直接删除：

- fake privacy controls；
- fake experimental controls；
- empty shortcut editor shell；

而不是为了 UI 完整感保留不可执行功能。

## 16. Protected contracts

1. ADR-088 Notification user preference/device capability 分离；
2. OS permission/DND observation 不能被 cloud setting 覆盖；
3. local file path 保持 local profile/device scoped；
4. Auth/Account security/privacy law-sensitive action 不迁入 Setting；
5. consent fail closed，不把 legacy bool 自动视为新授权；
6. feature evaluation 不能由 arbitrary imported strings 绕过；
7. Device state 不进入 Product Time/account business truth。

## 17. 明确 non-goals

本 ADR 不要求本轮：

- 自建完整 LaunchDarkly/Unleash 类平台；
- 引入 OpenFeature SDK；
- 立刻开放 keyboard shortcut 编辑；
- 新增社交/好友/presence 产品；
- 新增 telemetry pipeline；
- 把所有 local UI state 统一成一个数据库。

目标只是让现有模型先停止错误声明这些能力。
