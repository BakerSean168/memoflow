---
tags:
  - product
  - setting
  - settings-hub
  - preferences
  - desktop
  - mobile
  - vnext
description: Setting vNext 产品设计：Settings Hub 作为多 capability 管理入口、User Preference/Module/Device/System scope 与真实可执行设置 UI
created: 2026-09-08T23:26:00+08:00
updated: 2026-09-08T23:26:00+08:00
---

# Setting vNext — Settings Hub

> **ADR-111 cutover policy (2026-09-09):** 当前没有需要保留的 MemoFlow 旧业务数据，也不要求兼容旧客户端/旧备份。本文历史推演中仅为旧数据保存设计的 migration/backfill/compatibility window 不再执行；目标模型和真实行为不变量继续有效。实施采用 direct canonical cutover + old-surface deletion + reset/reseed。

## 1. 一句话定义

> **Settings Hub = 管理 MemoFlow capabilities 的统一入口，不是一个 Settings God Aggregate。**

用户看到的是一个统一设置页；内部每个 section 由自己的 canonical owner 提供 read/mutation/runtime behavior。

## 2. Product goals

Setting vNext 要做到：

1. 用户只看到真实会生效的设置；
2. 一个设置只有一个 owner；
3. 用户偏好、模块业务配置、设备配置、系统 policy 清楚分层；
4. 跨设备同步行为可以解释；
5. 改时区后 Task/Routine/Reminder/Planner 等业务语义立即一致；
6. Settings 页面故障不拖垮所有 section；
7. Web/Desktop/Mobile 使用相同语义 contract，但只显示 host 支持能力；
8. 不保留已经没有产品含义的历史开关。

## 3. 页面信息架构

目标 Settings Hub：

```text
Settings
│
├── General
│   ├── Appearance
│   └── Language & Region
│
├── Knowledge
│   └── Vault / GitHub / source binding
│
├── AI
│   └── Providers / models / connection health
│
├── Notifications
│   ├── Workflow & channel preferences
│   └── Device presentation (host-specific)
│
├── Account & Privacy
│   ├── Profile
│   ├── Password / Authentication
│   └── Consent (only when a real consent product exists)
│
└── Data
    ├── Preferences export/import
    ├── Full data portability
    └── Local files location (Desktop only)
```

当前 6-group shell 已按真实 owner capability 收敛。Advanced 不作为空壳 group 保留；Keyboard shortcuts、Diagnostics、Labs 只有在对应真实 owner/runtime 存在后才新增入口。

## 4. Scope mental model

用户不需要看到 DDD 术语，但 UI 行为必须符合四类 scope。

### 4.1 User preference

```text
“跟着我的账号走”
```

示例：

- theme；
- language；
- time zone；
- date/time style；
- week starts on。

### 4.2 Module preference/config

```text
“这是某项功能本身的配置”
```

示例：

- Notification channel/QuietHours；
- AI provider/default model；
- Knowledge repository connection。

### 4.3 Device preference

```text
“只影响当前设备/应用”
```

示例：

- Desktop native/custom notification style；
- sound；
- local files path；
- keyboard accelerator；
- window/sidebar state。

### 4.4 Product/System policy

```text
“这不是用户随便能覆盖的配置”
```

示例：

- feature rollout；
- entitlement；
- hard safety/rate-limit guard；
- system telemetry policy。

## 5. General — Appearance

目标内容保持极简：

```text
Appearance

Theme
( ) System
( ) Light
( ) Dark
```

更新：

```text
presentation.theme
```

行为：

1. 本地立即 preview/apply；
2. background 持久化 canonical User Preference；
3. write 失败则回滚为 server canonical value 并给非阻塞错误提示；
4. presentation bootstrap local cache 只作为启动 cache，不作为第二 truth。

## 6. General — Language & Region

目标：

```text
Language & Region

Language          简体中文
Time zone         Asia/Shanghai (UTC+08:00)
Date style        2026-09-08
Time style        23:26
Week starts on    Monday
```

### 6.1 Time zone picker

要求：

- 只允许 valid IANA zone；
- 支持搜索 city/zone；
- 展示 current UTC offset 仅用于帮助选择，不持久化 offset；
- 修改后告诉用户“日程、循环任务、提醒和安静时段将按此时区计算”；
- 不展示服务器时区；
- 初次账号初始化优先用当前设备 IANA zone 明确 materialize。

### 6.2 Date/time style

产品只提供有限、稳定的 style choices，不让用户输入 date-fns pattern。

例如：

```text
Date
2026-09-08
Sep 8, 2026
September 8, 2026

Time
23:26
11:26 PM
```

内部映射 `@memoflow/time` TimeStyle。

### 6.3 Currency

General 不再展示“全局货币”。

Wallet 中已有 currency owner；未来如果有“新钱包默认货币”，在 Wallet 设置里设计。

## 7. Knowledge

Settings Hub 的 Knowledge section 继续复用 Repository/Knowledge owner。

用户看到：

```text
Knowledge

Connected knowledge source
GitHub: baker/.../thought-forest
Branch: main
Status: Healthy

[Manage connection] [Reconnect] [Disconnect]
```

本 section 不写 `UserPreferences.knowledge`。

状态、installation intent、stable document identity、projection health 按 ADR-089~091。

## 8. AI

沿用当前已经较正确的 provider onboarding：

```text
AI

Connected providers
OpenAI       gpt-...
OpenRouter   ...
Custom       ...

[Add provider]
```

Add flow：

```text
Provider picker
  -> credential/base URL
  -> connection probe/model discovery
  -> model selection/test
  -> review
  -> save
```

AI provider secret/default model 由 AI owner 管理，不重新放回 `UserSetting.preferences.ai`。

## 9. Notifications

这一页要把 user-level delivery 和 current-device presentation 视觉分组。

目标：

```text
Notifications

Delivery preferences            [Account]
  Task            In-app  Push
  Goal            In-app  Push
  Routine         In-app  Push
  ...

Quiet hours                     [Account]
  Enabled
  22:00 - 08:00
  Time zone: follows account

On this device                  [This device]
  Presentation: Native / MemoFlow
  Sound: On
  OS permission: Allowed
```

UI 不一定真的显示 `[Account]` badge；但文案必须能表达“此设备”与跨设备值的区别。

### 9.1 Owner

```text
Delivery preferences/QuietHours
-> Notification

Device presentation/sound/OS capability
-> Desktop/Mobile device surface
```

不再通过 UserSetting.notification 混写。

## 10. Account & Privacy

### 10.1 Account

保留真实能力：

```text
Profile
Email/phone status as currently supported
Password/Auth
Account lifecycle/data controls
```

由 Account/Auth owner 提供。

### 10.2 删除当前 fake social privacy switches

当前不再展示：

```text
Profile visibility
Show online status
Allow search by email
Allow search by phone
```

原因不是“隐私不重要”，而是当前产品没有相应 Social/Presence/Discovery enforcement。

没有真实 enforcement 的 privacy switch 会误导用户，风险高于缺少该 UI。

### 10.3 Usage analytics consent

只有 telemetry pipeline + consent enforcement 真正实施后，才展示：

```text
Share optional usage analytics
```

并使用专门 consent owner；旧 `shareUsageData=true` 不能自动作为新 consent。

## 11. Data

目标分成两个层次。

### 11.1 Preferences portability

```text
Export preferences
Import preferences
```

只导出：

```text
presentation
regional
```

UI 要显示 import receipt：

```text
Migrated: 6
Retired legacy fields: 8
Skipped device-only fields: 3
Requires re-consent: 1
```

不能只说“导入成功”。

### 11.2 Full data portability

```text
Export all data
Import full backup
Server-held data disclosure
```

继续由 Data Portability owner。

### 11.3 Local files location

Desktop only：

```text
Current directory
Change
Open
Reset to default
```

明确文案：

> 此位置只影响当前设备，不会同步到其他设备。

Web/Mobile 不渲染 unsupported control。

## 12. Future Advanced capabilities（当前不渲染 Advanced group）

`SETTING-9207` 已删除 Advanced 空壳。以下内容只是 future capability 条件，不是当前 UI。


### 12.1 Keyboard shortcuts

当前 shortcut shell 不作为稳定功能展示，直到：

```text
CommandRegistry
+ host defaults
+ conflict validation
+ DeviceKeymap persistence
```

完成。

届时 UI：

```text
Search commands
Create task       Ctrl+Shift+T
Open command...   Ctrl+K
...
```

并显示：

```text
This device
```

scope。

### 12.2 Labs

当前 fake：

```text
experimental.enabled
experimental.features[]
```

从 Settings 删除。

真正 Labs 必须由 feature definition/evaluator 提供可 opt-in 列表：

```text
Labs
New planning surface      [Try it]
```

如果 evaluator 不允许 user opt-in，则不显示 toggle。

### 12.3 Diagnostics

未来可放：

```text
App version
Sync diagnostics
Open logs
Copy diagnostic bundle
```

但 diagnostics 是 host/ops capability，不存进 UserPreferenceProfile。

## 13. Save behavior

不设计一个全页：

```text
[Save all settings]
```

因为一个页面跨多个 owner，统一 Save 容易伪造跨模块 transaction。

默认：

```text
one control intent
-> owner mutation
-> immediate local feedback
-> owner-specific receipt/error
```

高风险操作（disconnect/delete/reset）单独 confirm。

## 14. Loading behavior

Settings Hub 不需要打开页面就等待所有 remote capability。

推荐：

```text
Settings shell + General
  -> immediate

selected section
  -> lazy load owner data
```

例如 AI provider API 暂时失败，不应导致 Appearance 页面无法打开。

每个 section 有独立：

```text
loading
empty
error/retry
unsupported on this host
```

状态。

## 15. Deep link contract

当前：

```text
/settings?tab=appearance
/settings?tab=repository
/settings?tab=ai
/settings?tab=notifications
/settings?tab=account
/settings?tab=data
```

surviving 6 个 query value 是已有产品/测试 contract，继续保护。旧 `advanced` 或未知值回落到 `appearance`。

即使最终文案把 `appearance` 显示成 `General`，也不要求立刻改 query value。

已有 test id：

```text
settings-tab-{value}
```

特别是 appearance/notifications 现有 E2E anchor，在替代测试上线前不删除。

## 16. Reset UX

当前“Reset Settings”必须缩 scope。

目标至少分：

```text
Reset appearance & regional preferences
```

和 owner-specific reset：

```text
Reset notification preferences
Reset this device keymap
```

不提供一个含糊按钮：

```text
Reset all settings
```

然后跨 AI/Knowledge/Auth/Data 静默删除数据。

如果以后提供“恢复应用默认状态”，必须是专门 destructive workflow，展示具体影响范围。

## 17. Web/Desktop/Mobile parity

Parity 指**同一语义 contract**，不是每个平台显示完全相同列表。

### Shared

```text
presentation
regional
Account core
Notification user preference
AI/Knowledge when platform supports
```

### Desktop-only candidates

```text
custom/native desktop notification style
local files path
desktop accelerator keymap
window diagnostics
```

### Mobile-only candidates

```text
mobile push OS permission/deep-link capability
vibration/device-specific presentation
```

Host 不支持的设置不以 disabled fake control 占位，除非解释跨设备状态本身有价值。

## 18. Accessibility

如果未来增加 accessibility namespace，应符合：

```text
real presentation consumer
clear cross-device vs device scope
strict typed schema
```

可能候选：

```text
reduced motion
font scale
high contrast preference
```

本轮不预建空 category。

## 19. Error model

设置 mutation error 不统一成一个模糊 toast。

最低分类：

```text
ValidationError
RevisionConflict
OwnerUnavailable
UnsupportedOnHost
PermissionRequired
AuthenticationRequired
ImportMigrationWarning/Error
```

RevisionConflict 建议：

```text
“设置已在另一设备更新，已加载最新值。请重新应用你的修改。”
```

而不是最后写入静默覆盖。

## 20. Settings search

本轮不是必需，但未来 search 应索引 Settings Hub section metadata，而不是从 `UserSetting` schema 自动生成。

原因：AI/Knowledge/Notification 等 section 本来就不是 UserSetting-owned。

目标 registry 可以是 presentation metadata：

```text
SettingsSectionDefinition
├── route/tab
├── title/keywords
├── host capability
└── lazy component
```

它不是 preference registry/persistence owner。

## 21. Product truth rules

一个 control 要进入稳定 Settings UI，必须满足：

```text
1. canonical owner exists
2. read path exists
3. mutation path exists
4. runtime behavior consumes it
5. scope/sync policy is defined
6. test proves round-trip/behavior
```

仅有：

```text
schema + UI switch
```

不足以成为产品功能。

## 22. Migration UI impact

实施顺序允许逐 section 收敛：

```text
General/Time first
Notification second
remove dead/fake controls
Device/local surface
final Settings shell cleanup
```

在任一阶段不得把尚未实施的 ADR 目标文案写成“当前已支持”。

## 23. North Star example

最终用户看到的是一个干净的设置页：

```text
General
  Theme                 Dark
  Language              简体中文
  Time zone             Asia/Shanghai
  Time                  24-hour
  Week starts           Monday

Knowledge
  GitHub Vault          Connected

AI
  Default provider      OpenAI · gpt-...

Notifications
  Task                   In-app + Push
  Routine                In-app
  Quiet hours            22:00 - 08:00
  This device            Native · Sound on

Account
  Profile / Password

Data
  Export preferences
  Export all data
  Local files            D:\MemoFlow   [Desktop]
```

没有：

```text
假的 friends privacy
假的 experimental strings
没有消费者的 workflow defaults
空 ai category
cloud-synced sidebar collapse
重复的 Account timezone
```
