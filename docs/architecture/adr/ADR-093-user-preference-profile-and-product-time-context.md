---
tags:
  - adr
  - setting
  - preferences
  - time
  - timezone
  - presentation
  - vnext
description: ADR-093 - UserPreferenceProfile 的 typed namespace、Product Time 用户上下文与 legacy Account/UserSetting 双真值收敛
created: 2026-09-08T23:26:00+08:00
updated: 2026-09-09T12:00:00+08:00
---

# ADR-093: User Preference Profile 与 Product Time Context

**状态：** 已采纳（SETTING-9202 foundation 已实施；consumer cutover 待 SETTING-9203）
**日期：** 2026-09-08
**影响范围：** Setting/Preferences、Account、Time、Task、Routine、Reminder、Planner、Scheduler、Notification、Web/Desktop/Mobile presentation

## 1. 决策摘要

在 ADR-092 的 ownership 边界上，MemoFlow 将 cloud-synced User Preferences 收敛为两个严格类型化 namespace：

```text
UserPreferenceProfile
├── presentation
│   ├── theme
│   └── language
│
└── regional
    ├── timeZone
    ├── dateStyle
    ├── timeStyle
    └── weekStartsOn
```

同时建立单一 Product Time user-context seam：

```text
UserPreference owner
        │
        ▼
UserTimeContextPort
        │
        ├── Task / Routine / Reminder
        ├── Planner
        ├── Scheduler projection
        └── Notification QuietHours
```

业务模块不再读取 `Account.settings.timezone`、`UserSettingRepository` 或 renderer Pinia store 来猜用户时区。

## 2. 为什么 timezone 是本轮最高优先级

当前存在真实双真值：

```text
Account.settings.timezone
UserSetting.preferences.locale.timezone
```

当前 Settings 页面修改的是后者，但 Reminder server 的 `AccountApplicationTimezoneAdapter` 读取前者。

Renderer helper 又使用：

```text
Account timezone
  -> UserSetting timezone
  -> host timezone
```

因此同一用户可能出现：

```text
Settings UI 显示 Asia/Tokyo
Reminder server 仍按 Asia/Shanghai 计算
```

这会直接污染：

- wall-clock recurrence；
- QuietHours；
- Today/Upcoming query；
- Task/Routine occurrence materialization；
- Planner day/week boundary；
- Scheduler desired invocation；
- relative reminder boundary。

这不是 presentation 差异，而是业务时间语义错误。

## 3. Canonical UserPreferenceProfile

目标 contract：

```ts
interface UserPreferenceProfile {
  presentation: {
    theme: 'light' | 'dark' | 'auto';
    language: LocaleId;
  };

  regional: {
    timeZone: TimeZoneId;
    dateStyle: 'short' | 'medium' | 'long';
    timeStyle: '12h' | '24h';
    weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  };
}
```

说明：

> **2026-09-09 implementation clarification:** `TimeZoneId` 是跨模块 portable primitive，与 `Instant / Ymd / Hm` 一样 canonicalized in `@memoflow/contracts/primitives`，同时提供唯一 IANA validator/schema。`@memoflow/time` 继续拥有 `TimeContext`、Clock/Calendar/Format 与 require/resolve 行为并 re-export 该 primitive。这样保留 Product Time 语义所有权，同时避免 `contracts -> time -> contracts` package cycle。

1. `LocaleId` 与 `TimeZoneId` 使用 MemoFlow Time/Presentation 已有语义，不在 Setting 自建第二套；
2. `timeZone` 必须是经 `@memoflow/time` `isIanaTimeZoneId()` 验证的 IANA zone；
3. `dateStyle` 不允许任意 date-fns token/format string 作为产品 contract；
4. `timeStyle` 表达用户 12/24 小时偏好，不把渲染 pattern 暴露为持久化产品语义；
5. `weekStartsOn` 直接喂给 `TimeStyle.calendar.weekStartsOn`；
6. Time formatting 最终仍经 `@memoflow/time`，不允许各 UI 自建 formatter。

## 4. Preference -> TimeStyle adapter

UserPreferenceProfile 不复制整个 `TimeStyle`。

目标适配：

```text
presentation.language
regional.timeZone
regional.dateStyle
regional.timeStyle
regional.weekStartsOn
         │
         ▼
PreferenceUserTimeContextAdapter
         │
         ▼
@memoflow/time TimeContext + TimePresentationStyle
```

这样：

- Product Time 保持统一格式/日历算法 owner；
- Preferences 只保存用户选择；
- Time package 不依赖 Setting package；
- host composition 注入 adapter，避免循环依赖。

## 5. UserTimeContext

业务模块需要的是时间上下文，不是完整 Settings DTO。

目标最小 contract：

```ts
interface UserTimeContext {
  timeZone: TimeZoneId;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

interface UserTimeContextPort {
  getUserTimeContext(identityId: IdentityId): Promise<UserTimeContext>;
}
```

如模块只需要时区，可以提供更窄 facade，但 canonical resolution 规则必须一致。

### 5.1 禁止依赖

业务模块不得：

```text
import AccountRepository to read settings.timezone
import UserSettingRepository
read Pinia store
read process/server local timezone
call Intl.resolvedOptions() inside server business math
```

### 5.2 允许的 host/device boundary

客户端第一次 materialize 新 preference profile 时，可以通过 `@memoflow/time` 的 `TimeZoneSource` 获取当前设备 IANA zone，并把它作为**显式初始化输入**提交。

这是：

```text
device observation -> explicit preference initialization
```

而不是：

```text
server ambient timezone -> silent business default
```

## 6. New-user timezone initialization

目标不能继续把 `Asia/Shanghai` 作为全球硬编码 cloud truth。

首选路径：

```text
first authenticated client
  -> resolve current IANA zone via TimeZoneSource
  -> create UserPreferenceProfile(initialTimeZone)
```

如果没有 client zone（例如系统任务先于客户端初始化）：

```text
server business fallback = explicit UTC
```

并保留“preference not materialized”可观测性；禁止读取服务器宿主时区替代用户时区。

一旦 UserPreferenceProfile 已 materialize，后续业务计算只使用 canonical preference `regional.timeZone`，除非具体业务对象自己保存了明确的 schedule timezone snapshot。

## 7. Existing-data migration precedence

当旧 truth 冲突时必须 deterministic，不能“看最后谁写”。

### 7.1 Theme

```text
if valid UserSetting.appearance.theme exists:
  use it
else if valid Account.settings.theme exists:
  map Light/Dark/System -> light/dark/auto
else:
  auto
```

理由：当前真实 Settings 页面写 UserSetting；Account settings 已是 shadow legacy path。

### 7.2 Language

```text
if valid UserSetting.locale.language exists and supported:
  use it
else if valid Account.settings.language exists and supported:
  use it
else:
  product default locale
```

不把任意未注册 language string 静默写入 canonical profile。

### 7.3 Time zone

```text
if UserSetting.locale.timezone is valid IANA:
  use it
else if Account.settings.timezone is valid IANA:
  use it
else:
  explicit UTC + migration warning
```

这里 UserSetting 优先，是因为当前 Settings UI 的用户操作落在 UserSetting；否则会出现“用户刚改完设置，迁移后又回到旧 Account 值”。

### 7.4 Week/date/time style

```text
weekStartsOn -> validate 0..6, else product default
legacy dateFormat -> map only known supported formats to dateStyle
legacy timeFormat -> 12H/24H -> 12h/24h
```

未知 legacy custom format 不进入 canonical schema；迁移器记录 warning。

## 8. Value validation

### 8.1 Time zone

唯一 validator：

```text
@memoflow/time isIanaTimeZoneId
```

不维护 Setting-local timezone regex/list。

### 8.2 Locale

Locale 必须来自 presentation supported locale registry。

当前 Web presentation 实际只完整支持部分 locale，因此“schema 接受任意字符串”不再等于“产品支持任意 locale”。

### 8.3 Strict namespaces

每个 namespace schema 必须：

```text
strict
known fields only
known enum/value ranges only
```

未知 key 直接失败或进入 versioned migration warning，不允许像当前 `z.object(...).partial()` 默认 strip 一样静默吞掉字段。

## 9. Mutation contract

长期不暴露：

```ts
set('anything.string.key', unknown);
```

目标：

```ts
updatePresentationPreferences(patch, expectedRevision?)
updateRegionalPreferences(patch, expectedRevision?)
```

或者 transport-neutral：

```ts
patchPreferenceNamespace(
  namespace: 'presentation' | 'regional',
  typedPatch,
  expectedRevision?,
)
```

namespace 必须来自 closed registry，不接受 arbitrary strings。

## 10. Defaults contract

当前 `GetDefaultSettings` 为拿 defaults 创建：

```text
fake UserSetting
fake identityId
fake id
version/timestamps
```

目标删除这种实体伪装。

使用纯值：

```ts
interface UserPreferenceDefaults {
  presentation: ...;
  regional: Omit<RegionalPreferences, 'timeZone'> & {
    timeZonePolicy: 'detect-device-or-utc';
  };
}
```

或者 host 直接从 schema/default factory 获得 defaults。

Defaults API 不返回：

```text
id
identityId
version
createdAt
updatedAt
```

## 11. Account.settings retirement

实施完成后删除：

```text
AccountSettings ValueObject
UpdateAccountSettings(theme/language/timezone/notificationEnabled)
AccountResponse.settings
accounts.settings JSON
Reminder AccountTimezoneAdapter
renderer Account-first timezone fallback
```

Account Profile 若需要展示用户语言/时区，必须通过 Settings Hub read composition 获取，不把它重新塞回 Account DTO。

## 12. Product Time compatibility

本 ADR 修订 ADR-037 当年“设备 local timezone first-version”在 cloud user preference 已成熟后的 owner resolution，但不改变：

- `Instant / Ymd / Hm` 产品类型；
- TimeStyle/Codec/Calendar/Recurrence owner；
- RecurrenceEnginePort；
- IANA zone validation；
- 禁止 ambient server timezone；
- schedule object 可以保存自己的 explicit timezone snapshot。

关系是：

```text
ADR-037 owns time semantics/engine
ADR-093 owns where user-level time preference comes from
```

## 13. Protected contracts

1. `@memoflow/time` 继续是产品时间唯一行为 owner；
2. existing Task/Routine/Scheduler explicit schedule timezone 不被 user preference change 追溯篡改，除非业务 contract 明确采用 follow-user policy；
3. Reminder/Notification QuietHours 迁移时必须显式使用 UserTimeContext；
4. server fallback 只能是显式 UTC，不得是 host timezone；
5. Web/Desktop/Mobile 使用同一 preference contract；
6. guest/local profile 在未绑定 cloud account 时可以继续使用 device-local TimeZoneSource；
7. account binding 后不产生第二份 Account timezone truth。

## 14. Acceptance target

实施完成后必须可以证明：

```text
User changes time zone in Settings
  -> canonical regional preference revision changes
  -> Task/Routine/Reminder/Planner/Notification resolve same user zone
  -> no consumer reads Account.settings.timezone
  -> restart / second device / PowerSync round-trip retains same value
```

并证明：

```text
server host timezone changes
```

不会改变同一用户的 recurrence/QuietHours/day-boundary 结果。
