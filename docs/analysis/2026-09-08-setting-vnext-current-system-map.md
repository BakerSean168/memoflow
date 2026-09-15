---
tags:
  - analysis
  - setting
  - preferences
  - account
  - notification
  - desktop
  - powersync
  - vnext
description: Setting vNext 当前实现、双真值、Settings Hub 组合、持久化/PowerSync、假设置与迁移风险审计
created: 2026-09-08T23:26:00+08:00
updated: 2026-09-08T23:26:00+08:00
---

# Setting vNext — Current System Map

## 1. 文档地位

本文记录 **2026-09-08 当前源码事实**，用于支撑 Setting vNext 建模。

它不是目标态实现说明。

目标设计见：

- [ADR-092: Settings Hub 与 Preference Ownership Boundary](../architecture/adr/ADR-092-settings-hub-and-preference-ownership-boundary.md)
- [ADR-093: User Preference Profile 与 Product Time Context](../architecture/adr/ADR-093-user-preference-profile-and-product-time-context.md)
- [ADR-094: Device Preference、Feature Policy 与 Consent Boundary](../architecture/adr/ADR-094-device-preference-feature-policy-and-consent-boundary.md)
- [ADR-095: Preference Persistence、Sync、Migration 与 Portability](../architecture/adr/ADR-095-preference-persistence-sync-migration-and-portability.md)
- [Setting vNext Settings Hub](../product/setting-vnext-settings-hub.md)

实施完成前：

```text
current source/tests = 当前行为真值
本文 = 当前事实索引
ADR-092~095 = 已采纳目标设计
```

## 2. 当前 `UserSetting` aggregate

文件：

```text
packages/setting/src/server/domain/aggregates/user-setting.ts
```

当前状态：

```ts
interface UserSettingState {
  id: SettingId;
  identityId: IdentityId;
  preferences: UserSettingPreferences;
  version: number;
  createdAt: Instant;
  updatedAt: Instant;
}
```

核心行为：

```text
patchCategory(category, patch)
get(key)
set(key, value)
resetCategory(category)
resetAll()
toPreferences()
importPreferences(data)
toServerDTO()/toClientDTO()
```

当前实现是：

> 一个 identity 一条 `UserSetting`，所有 preference category 放在一个 JSON object 中。

## 3. 当前 preference categories

Single source 在：

```text
packages/contracts/src/modules/setting/preferences/schemas/
```

当前 `UserPreferencesSchema`：

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

### 3.1 appearance

```ts
{
  theme: 'light' | 'dark' | 'auto'; // default auto
}
```

这是当前少数有真实 Settings page + presentation bootstrap consumer 的稳定 preference。

### 3.2 locale

```ts
{
  language: string; // default zh-CN
  timezone: string; // default Asia/Shanghai
  dateFormat: string; // default YYYY-MM-DD
  timeFormat: '12H' | '24H';
  currency: string; // default CNY
  weekStartsOn: number; // 0..6
}
```

其中 language/theme 会被 `PresentationPreferenceStore` 消费；timezone 也被部分 reminder renderer helper 消费，但存在 Account shadow truth，见 §8。

### 3.3 workflow

```text
autoSave
autoSaveInterval
confirmBeforeDelete
defaultTaskView
defaultGoalView
defaultScheduleView
```

全仓审查没有发现这些字段的真实 production behavior consumer；主要存在于 schema/mock/i18n。

特别是：

```text
defaultGoalView = LIST | TREE | TIMELINE
```

仍包含已经从 Goal vNext 退出的 TREE/hierarchy 心智。

### 3.4 privacy

```text
profileVisibility
showOnlineStatus
shareUsageData
allowSearchByEmail
allowSearchByPhone
```

当前主要消费者是 Settings UI/schema/mocks/stories；没有完整 Presence/Social/Discovery/Telemetry enforcement path。

### 3.5 notification

```text
email
push
inApp
sound
useCustomNotification
```

与此同时 Notification 模块另有 canonical `NotificationPreference`，形成双轨，见 §9。

### 3.6 shortcuts

```text
enabled
custom: Record<string, string>
```

当前 Settings page shortcut categories 初始化为空，编辑链未形成稳定 command registry + persistence contract。

### 3.7 experimental

```text
enabled
features: string[]
```

Settings UI hard-code 过 feature keys，但没有真实 feature evaluator/runtime enforcement。

### 3.8 ui

```text
startPage
sidebarCollapsed
```

当前没有稳定 cloud behavior consumer；`sidebarCollapsed` 语义上又明显属于 local/window state。

### 3.9 ai

```ts
{
}
```

AI provider 设置实际由 AI module 负责，当前 Setting `ai` category 是空壳。

## 4. 当前 validation 行为

文件：

```text
packages/contracts/src/modules/setting/configs/setting-registry.ts
```

当前 patch 验证：

```ts
(schema as z.ZodObject<...>).partial().safeParse(patch)
```

风险：Zod object 未显式 `.strict()`；unknown key 可能被 strip，而不是明确拒绝。

与此同时 Aggregate event 使用的是原始 `patch`：

```text
changes: patch
```

因此理论上存在：

```text
event says key changed
persisted payload silently dropped unknown key
```

的审计/事实偏差。

## 5. 当前 persistence

Prisma：

```text
packages/database/prisma/schema/setting.prisma
```

模型：

```text
UserSetting
├── id
├── identityId unique
├── preferences Json
├── version
├── createdAt
└── updatedAt
```

PowerSync：

```text
user_settings
├── identity_id
├── preferences text(JSON)
├── version
├── created_at
└── updated_at
```

Prisma 与 PowerSync 都以整条 settings singleton 为持久化/同步粒度。

## 6. 当前 `version` 不是实际 CAS

`UserSetting.patchCategory()` 会：

```text
version += 1
```

但 Prisma repository：

```text
upsert(where identityId)
```

没有 expected-version predicate。

因此当前 version 只能描述“某实例 patch 过多少次”，不能阻止 stale full-JSON overwrite。

这对多设备同步形成风险：两个设备修改不同 category，也可能互相覆盖旧 snapshot。

## 7. 当前 Settings 页面已经是 Capability Hub

主视图：

```text
packages/app-vue/src/modules/setting/views/UserSettingsView.vue
```

当前 7 个 group：

```text
appearance
repository
ai
notifications
account
data
advanced
```

UI composition：

```text
appearance
  -> AppearanceSettings
  -> LocaleSettings

repository
  -> KnowledgeRepositorySettings

ai
  -> AISettings

notifications
  -> NotificationSettings

account
  -> AccountProfileSection
  -> CloudPasswordSection
  -> PrivacySettings

data
  -> UserFilesSettings
  -> SettingAdvancedActions / DataPortability

advanced
  -> ShortcutSettings
  -> SettingsResetSection
  -> ExperimentalSettings
```

所以从实际 UI 来看，Settings 已经不是“UserSetting aggregate 编辑器”，而是跨 capability 入口。

## 8. Account.settings 双真值

Account 当前仍有：

```text
packages/account/src/server/domain/value-objects/account-settings.ts
```

字段：

```text
theme
language
timezone
notificationEnabled
```

Prisma `Account` 也有：

```text
settings Json
```

Account 提供：

```text
update-account-settings.use-case.ts
```

可以独立修改这些值。

与此同时 UserSetting 又有：

```text
appearance.theme
locale.language
locale.timezone
notification.*
```

这是当前最明确的 duplicate source of truth。

## 9. timezone 已经产生真实 behavior divergence

Renderer：

```text
packages/app-vue/src/modules/reminder/utils/user-timezone.ts
```

当前 priority：

```text
Account.settings.timezone
  -> UserSetting.preferences.locale.timezone
  -> Intl host timezone
  -> null
```

Server Reminder：

```text
packages/reminder/src/server/infrastructure/adapters/account-timezone-adapter.ts
```

只读取：

```text
Account settings timezone
```

Settings 页面 `LocaleSettings` 更新的是：

```text
UserSetting.locale.timezone
```

因此存在可复现模型风险：

```text
UI writes Tokyo
Account remains Shanghai
server reminder still resolves Shanghai
```

`@memoflow/time` 当前已经具备：

```text
TimeZoneId
TimeZoneSource
isIanaTimeZoneId
createFixedTimeZoneSource
resolveTimeZoneId
TimeStyle.calendar.weekStartsOn
```

所以缺失的不是 timezone library，而是 canonical user preference owner/resolution seam。

## 10. Notification 双真值

Notification 模块当前独立存在：

```text
NotificationPreference
├── globalChannels
├── workflowOverrides
├── doNotDisturb
└── rateLimit
```

Settings `NotificationSettings.vue` 实际同时操作两套 owner：

```text
useCustomNotification
  -> UserSetting.notification

per-module inApp/push
  -> Notification preference composable/module
```

Desktop `NotificationService` 又监听 Setting events：

```text
setting:user-setting-patched
setting:user-setting-reset
```

来更新 `useCustomNotification`。

ADR-088 已经定义 target：

```text
User delivery preference -> NotificationPreference
Device popup/sound/DND capability -> Device Surface
```

当前 Setting category 因而是待拆 shadow truth。

## 11. Privacy UI 当前不是可靠持久化功能

`PrivacySettings.vue` 支持：

```text
profile visibility
online status
search by email/phone
share usage data
```

但 Settings root 当前：

```html
<PrivacySettings v-model="privacy" />
```

只改变 local ref；没有相应 `updateCategory('privacy', ...)` handler。

另外 schema/UI 值还漂移：

```text
contract enum: FRIENDS_ONLY
UI option:     FRIENDS
```

所以不能把该页面当前视觉存在理解为“已经实现的隐私业务能力”。

## 12. Experimental UI 当前不是 feature flag system

`ExperimentalSettings.vue` hard-code：

```text
ai-assistant
voice-input
collaboration
advanced-analytics
```

但全仓没有这些 Setting feature strings 的真实 runtime evaluator consumer。

Settings root 同样只有：

```html
<ExperimentalSettings v-model="experimental" />
```

没有稳定 save/apply path。

结论：当前是 UI prototype/legacy shell，不是 canonical feature flag model。

## 13. Shortcut 当前是 UI shell

`ShortcutSettings.vue` 有完整的编辑视觉组件，但 root：

```ts
const shortcutCategories = ref<ShortcutCategory[]>([]);
```

未形成：

```text
CommandRegistry
host-specific default accelerators
conflict validation
canonical persistence
```

因此当前 `shortcuts.custom` 不能被视为成熟跨设备 preference contract。

## 14. AI Setting category 已失去意义

`AISchema`：

```ts
z.object({});
```

而 `AISettings.vue` 已经直接管理：

```text
provider catalog
connection probe
API secret onboarding
default model
model refresh/test
replace/delete provider
```

这些状态位于 AI module (`AiProviderConfig`, onboarding sessions, secrets)。

这是已经正确完成 ownership 外移的例子。

## 15. User files path 已是正确的 local capability

`UserFilesSettings.vue` 通过 Electron IPC：

```text
USER_FILES_GET_PATH
USER_FILES_PICK_DIRECTORY
USER_FILES_OPEN_DIRECTORY
USER_FILES_RESET_PATH
```

读取/修改当前设备文件目录。

它没有被塞入 `UserSetting.preferences`，这与 vNext 目标一致，应保护。

## 16. Presentation bootstrap

当前有两层 store：

```text
user-setting-store
  -> server/user preferences snapshot

presentation-preference-store
  -> locale/theme local persisted bootstrap cache
```

`usePresentationBootstrap`：

1. 尝试从 persisted userSetting 快速应用 theme/language；
2. background/load server defaults；
3. 拉 UserSetting；
4. sync theme/language。

这个“presentation fast cache”可以保留，但必须明确它是：

```text
cache/bootstrap projection
```

不是第二 canonical preference truth。

## 17. Defaults 当前伪装成用户实体

`GetDefaultSettings` 当前：

```text
UserSetting.create(fake identityId)
-> UserSettingClientDTO
```

返回：

```text
id
identityId
preferences
version
timestamps
```

但调用者真正只需要 defaults。

这会让“schema defaults”和“用户实体”概念混合。

## 18. Import/export 当前不是严格版本迁移

Standalone Settings export：

```json
{
  "version": "2.0.0",
  "exportedAt": "...",
  "identityId": "...",
  "settings": {}
}
```

Import：

```text
requires data.settings
requires version
accept 1.0.0 or 2.0.0
cast settings to Partial<UserSettingPreferences>
```

当前没有：

```text
v1 strict schema
v1 -> v2 migrator
v2 -> canonical migrator
retired field report
owner reassignment
```

## 19. Data Portability 已经提供更正确的跨模块边界

`PortableUserDataV2Schema` 当前把：

```text
settings
notificationPreference
userReminderPreference
goals
tasks
reminders
repositories
schedules
editor
ai
```

分开。

`settings.importer.ts` 也分别处理：

```text
settings
notification preference
reminder preference
```

这说明目标不需要让 Setting 重新成为“所有配置导入 owner”；应沿用 owner-specific projections/importers。

## 20. Current domain events

Setting event map：

```text
setting:user-setting-created
setting:user-setting-patched
setting:user-setting-reset
setting:setting-imported
```

实际跨模块 production consumer 主要是 Desktop NotificationService 对 notification style 的监听。

随着 `useCustomNotification` 移入 device owner，这个主要跨边界 consumer 将不再需要 Setting domain event。

## 21. Current-to-target migration matrix

| Current source             | Current issue                         | Target                                  |
| -------------------------- | ------------------------------------- | --------------------------------------- |
| `UserSetting.appearance`   | correct owner, giant row              | `presentation` namespace                |
| `UserSetting.locale`       | mixed real/unused fields              | `presentation + regional`               |
| `Account.settings`         | duplicate truth                       | delete after migration                  |
| `UserSetting.workflow`     | no real consumers / stale semantics   | retire                                  |
| `UserSetting.privacy`      | fake/unenforced controls              | retire; future consent owner separately |
| `UserSetting.notification` | overlaps Notification/device          | split to Notification + Device Surface  |
| `UserSetting.shortcuts`    | no command registry, wrong sync scope | retire; future DeviceKeymap             |
| `UserSetting.experimental` | not a feature evaluator               | retire; future Feature system           |
| `UserSetting.ui`           | local/no consumers                    | retire cloud fields                     |
| `UserSetting.ai`           | empty shadow                          | delete                                  |
| singleton JSON row         | unrelated edits can overwrite         | namespace rows                          |
| decorative `version`       | no CAS                                | real per-namespace revision             |
| fake defaults entity       | wrong concept                         | pure defaults value                     |
| loose import cast          | no migration truth                    | versioned strict migrator               |

## 22. Protected current assets

以下不是本轮“清理掉”的对象：

1. Settings route/group/deep-link shell；
2. `?tab=` settings deep-link behavior；
3. theme/language presentation bootstrap 的快速体验；
4. `@memoflow/time` TimeZone/TimeStyle utilities；
5. NotificationPreference owner；
6. AI provider owner；
7. Knowledge Repository owner；
8. UserFiles Desktop IPC owner；
9. Data Portability cross-module envelope；
10. Prisma/PowerSync multi-runtime parity requirement；
11. ADR-039 guest/local profile boundary。

## 23. Current high-priority defects/debts

按影响排序：

```text
P0/P1 semantic debt
1. timezone duplicate truth affects wall-clock business behavior
2. Account.settings vs UserSetting duplicate owner
3. Notification preference duplicate owner

P1 architecture/data debt
4. whole-JSON persistence + fake revision
5. loose import/version handling

P2 product truth debt
6. fake privacy controls
7. fake experimental controls
8. shortcut shell without real registry
9. workflow/ui/ai dead categories
10. docs still describe old Setting as owner of all preferences
```

这些项目构成 Setting vNext active plan 的基线。
