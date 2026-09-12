---
tags:
  - adr
  - reminder
  - routine
  - desktop
  - ai-native
  - focus
description: Reminder 向 Routine Coach 演进时的领域边界、Profile Gate、确定性 Runtime、Ambient/Protocol 双运行语义与 Electron Surface 决策
created: 2026-08-25T17:13:00+08:00
updated: 2026-09-08T20:20:00+08:00
---

# ADR-059: Routine Coach 领域、Runtime 与交互 Surface

**状态：** 已采纳并实施（Core vNext 基础目标态；ADR-076~079 进一步收敛待实施）
**日期：** 2026-08-25  
**影响范围：** reminder、contracts、database、schedule-orchestration、notification、app-vue、desktop、AI tools/workflows  
**关联：** ADR-004、ADR-006、ADR-033、ADR-037、ADR-042、ADR-045、ADR-048、ADR-050、ADR-051、ADR-058

## 2026-09-08 实现状态

Routine Coach 核心目标态已经落地：RoutineDefinition、M:N ProfileMembership、WallClock / ActiveUsage / Protocol runtimes、Temporary Override、Intervention/Focus surfaces 与确定性 ProtocolSession。ControlMode、single-group ownership 与独立 Reminder scanner 已退休；初始六方法 Method Library 与 AI Routine command tools 也已接入 owner-domain command seam。

### 2026-09-08 领域模型二次收敛

本 ADR 的 Runtime/Profile/Protocol 大方向保持有效，但重新审查代码后确认 Legacy `ReminderTemplate` 仍然是完整写模型，并与 Routine vNext 并存。后续最终模型由以下 ADR 细化：

- ADR-076：RoutineDefinition / Trigger Algebra / legacy retirement；
- ADR-077：RoutineOccurrence / RoutineInteraction 与可靠性边界；
- ADR-078：Profile / Eligibility / RuntimeContext / TemporaryOverride；
- ADR-079：Intervention Policy / Notification / Device Surface。

这些新增决策**尚未实施**；不得把“Core vNext 基础目标态已落地”解释为 legacy Reminder 已经完全删除。

## 1. 背景

MemoFlow 当前 Reminder 模块已经具备较完整的工程能力：

- `ReminderTemplate` / `ReminderGroup` / `UserReminderPreferences`；
- `FixedTime` / `Interval` trigger；
- Schedule projection 与 Notification 送达；
- `ReminderOccurrence` 的 lease、claim、fencing、retry、dead-letter、idempotency；
- HTTP / IPC / PowerSync / Prisma 等多运行时适配。

但此前的领域名称和实现逐渐把它理解成“整个产品的提醒系统”。这与原始业务目标不一致。

原始业务目标主要是：

- 久坐、喝水、眼睛休息等健康习惯；
- 起床、吃饭、刷牙、睡觉等生活节律；
- Work / Study / Gaming 等不同场景组合；
- Pomodoro / 50/10 / Flowtime 等用户主动启动的专注方法；
- 后台运行、到点或满足条件时通过弹窗/通知干预用户；
- 由 AI 帮助用户配置和优化，但不要求用户一直停留在 Reminder 页面。

当前模型存在几个结构性错位：

1. `ReminderGroup.controlMode = Group | Individual` 把“父级场景 Gate”建模为“控制权切换”；
2. Group 模式可以接管并复活一个自身已暂停的 Reminder，违背用户对局部开关的直觉；
3. `ReminderTemplate.groupId` 只能表达一对多，无法复用同一习惯到 Work / Study / Gaming 多个场景；
4. `Interval` 是 wall-clock elapsed，不理解真实 Active Usage、Idle 和 Natural Break；
5. Pomodoro 类行为如果继续塞成 Reminder，会形成多个互不协调的 Timer；
6. 当前桌面应用主要只有 Main/ProfileAccess Window，缺少短生命周期 Intervention Surface 和持续 Focus Session Surface；
7. 现有自动 Smart Frequency 方向可能擅自改变重要生活/健康节律，不适合作为默认自动行为。

## 2. 决策摘要

采用以下 North Star：

```text
Reminder vNext = Routine Coach business domain
```

其目标是：

> 帮助用户把健康、休息、时间管理和专注方法转化为可持续、上下文感知的行为节律。

核心架构决策：

1. `Reminder` 不作为 Goal / Task 等业务模块的统一提醒底座；
2. Runtime 分为 `Ambient Routine` 和 `Protocol Session` 两种运行语义，但共享一个 Routine Runtime；
3. `ReminderGroup` 的产品语义演化为 `RoutineProfile`；
4. 删除 `ControlMode`，Profile 永远只是 Gate，不接管/复活成员自身状态；
5. `groupId` 演化为 `ProfileMembership` 多对多关系；
6. Trigger 区分 `WallClock`、`Elapsed`、`ActiveUsage`；Pomodoro/Flowtime 属于 Protocol，不是普通 Trigger；
7. ActiveUsage / Idle / Natural Break 由 Desktop Local Runtime 处理，不强塞给 Cloud Schedule；
8. Schedule 保留 durable wall-clock execution；Notification 保留 delivery 职责；
9. Electron 增加 `InterventionWindow` 与 `FocusWindow`，Strict 场景可单独增加 `BreakOverlay`；
10. AI 负责意图理解、配置、解释和建议，精确计时与状态转移由确定性 Runtime 执行；
11. Smart Frequency 改为 insight/suggestion，关键配置默认需要用户确认；
12. 现有 `ReminderOccurrence` 可靠执行机制作为受保护资产迁移，不重写成脆弱的 renderer timer。

## 3. 产品边界

### 3.1 Routine Coach 拥有

- 习惯/方法定义；
- 场景 Profile；
- Profile membership；
- 当前 Runtime context；
- ActiveUsage / Idle / Natural Break 语义；
- Ambient Routine due/satisfied；
- Intervention policy；
- Protocol definition/session/phase；
- Routine occurrence / interaction；
- Temporary override / snooze；
- 方法采用历史和可解释的调整建议。

### 3.2 Routine Coach 不拥有

- Task deadline 的业务条件；
- Goal/KR 的业务条件；
- 通用 Scheduler queue；
- 通用 Notification channel delivery；
- 任意 Automation workflow；
- LLM 本身的精确计时。

## 4. Ambient Routine 与 Protocol Session

### 4.1 Ambient Routine

后台、无持续主窗口的习惯干预。

例：

```text
12:00 午饭
ActiveUsage 40m -> 起身
ActiveUsage 20m -> 远眺
Elapsed 60m -> 喝水
23:30 -> 准备睡觉
```

产生 occurrence 后根据 intervention policy 选择 Surface。

### 4.2 Protocol Session

用户主动启动、有持续状态的专注/训练会话。

例：

```text
Pomodoro
50/10
Flowtime
```

它们必须拥有一等状态机，而不是通过多个 Reminder 拼装。

### 4.3 共享 Runtime

两者必须共享：

- 当前 user activity；
- 当前 active profiles；
- overlays；
- break satisfaction；
- occurrence；
- session coordination。

一个 Protocol Break 可以满足 Ambient `Stand` / `EyeBreak`，避免重复提示。

## 5. Profile Gate 决策

### 5.1 删除 ControlMode

现有：

```text
Group mode      -> group 接管 child lifecycle
Individual mode -> 忽略 group lifecycle
```

目标：

```text
effectiveEnabled =
  globalEnabled
  && profileActive
  && membershipEnabled
  && runtimeAllowsPresentation
  && !temporaryDisabled
```

Profile 永远只是父级 Gate。

### 5.2 子项状态必须保留

例如 Gaming：

```text
Profile OFF

Stand       memberEnabled = true
Drink       memberEnabled = false
EyeBreak    memberEnabled = true
```

此时三者 effective 都为 false，但 member 状态不变。

Gaming 再次 ON：

```text
Stand       effective true
Drink       effective false
EyeBreak    effective true
```

Profile 不得复活 `Drink`。

### 5.3 ProfileMembership

用 M:N 替代 `ReminderTemplate.groupId`：

```text
RoutineDefinition <-> ProfileMembership <-> RoutineProfile
```

同一个 `Drink Water` 可以复用于多个 Profile。

## 6. Profile 与 Runtime Overlay 分离

长期场景：

```text
Baseline Health
Work
Study
Gaming
```

短期上下文：

```text
Meeting
Presentation
DND
Temporary Quiet
Fullscreen Game
```

Overlay 不修改 Profile；它只影响 Runtime：

- 是否允许 presentation；
- 是否继续累计 activity；
- overdue 如何处理；
- 哪些优先级仍然允许送达。

## 7. Trigger 决策

### 7.1 WallClock

用于现实固定时间，投影到 Schedule：

```text
07:30 Wake Up
12:00 Lunch
23:30 Sleep Wind-down
```

时区使用经过验证的 IANA timezone，不允许静默 fallback 到某个固定城市。

### 7.2 Elapsed

从激活/上次满足开始经过时长。

### 7.3 ActiveUsage

只累计实际用户活动时间。

必须支持：

```text
UserActive
UserIdle
UserResumed
```

并支持 Natural Break credit：

```text
idleDuration >= requiredRest
=> occurrence requirement satisfied
=> reset/credit accumulator
```

### 7.4 Protocol 不进入 TriggerType

Pomodoro / Flowtime 使用独立 `ProtocolDefinition` / `ProtocolSession`。

## 8. Local Runtime 与 Schedule 边界

### 8.1 Schedule 负责

- wall-clock due；
- durable future execution；
- retry / idempotency；
- 后端可靠执行。

### 8.2 Local Routine Runtime 负责

- keyboard/mouse/activity；
- idle；
- foreground app；
- local DND/context；
- ActiveUsage accumulation；
- Natural Break；
- protocol session；
- Electron surfaces。

不得用后端“每 20 分钟打一枪”模拟真实 ActiveUsage。

## 9. Capability Port 决策

平台感知必须经 Port：

```text
ActivitySensorPort
IdleSensorPort
DndSensorPort
ActiveApplicationPort
```

核心领域只消费标准化事件，不依赖 Win32 / DBus / Wayland / macOS API。

第一阶段允许只有 Windows adapter，但 Port 边界从第一天建立。

## 10. RoutineOccurrence 与可靠执行

当前 `ReminderOccurrence` 的：

- occurrence key；
- idempotency；
- lease；
- fencing；
- retry；
- dead-letter；
- transaction boundary；

是必须保护的能力。

vNext 可逐步泛化为 `RoutineOccurrence`，但迁移时优先保持行为兼容，而不是为了改名重写可靠链路。

## 11. Snooze / Temporary Override

Snooze 属于真实状态变更：

```text
snoozeUntil
```

不应只是一条 response analytics。

TemporaryOverride 不修改长期规则：

```text
“再玩 20 分钟”
=> sleep.snoozeUntil = 23:50
!= sleep.defaultTime = 23:50
```

## 12. Intervention Policy

采用渐进式干预：

```text
Due
 -> Gentle
 -> Grace Period
 -> Guided
 -> Strict (explicit opt-in only)
```

系统默认尊重用户自然停顿点，而不是到点立即全屏打断。

Strict 模式必须：

- 用户显式启用；
- 有安全退出；
- 与普通 Window capability 隔离。

## 13. Electron Surface 决策

Main Process 是 BrowserWindow 生命周期所有者。

目标窗口：

```text
MainWindow
ProfileAccessWindow
InterventionWindow
FocusWindow
BreakOverlay?  // strict only
```

### 13.1 InterventionWindow

- ephemeral；
- compact；
- 默认不抢焦点；
- occurrence-driven；
- gentle/guided 两阶段可复用一个窗口。

### 13.2 FocusWindow

- session-driven；
- persistent while session active；
- countdown / phase / cycle / pause / end；
- 可折叠、可拖动、可选置顶；
- Window 被隐藏不能等价于 Session 被取消。

### 13.3 安全约束

遵守现有 Electron architecture：

- context isolation；
- preload IPC；
- least-privilege bridge；
- renderer 不持有业务 truth；
- 不暴露任意 Node API。

## 14. AI 边界

AI 负责：

```text
Intent -> Draft -> Explanation -> Confirmation -> Config
History -> Insight -> Suggestion
```

AI 不负责：

```text
Timer tick
lease
phase transition truth
idempotency
crash recovery
```

持久关键参数变化默认要求用户确认；明确临时指令可以产生有 expiry 的 TemporaryOverride。

## 15. Smart Frequency 决策

自动改频率退出默认核心路径。

目标：

```text
metrics
 -> insight
 -> suggestion
 -> user accepts/rejects
 -> deterministic config update
```

不能因为用户经常忽略睡眠提醒，就自动把睡觉时间推迟。

## 16. 与现有模型映射

| Current            | Target                             | Contract strategy    |
| ------------------ | ---------------------------------- | -------------------- |
| ReminderTemplate   | RoutineDefinition / legacy adapter | migrate              |
| ReminderGroup      | RoutineProfile                     | migrate              |
| ControlMode        | 无                                 | retire               |
| groupId            | ProfileMembership                  | migrate              |
| FixedTime          | WallClock                          | migrate              |
| Interval           | Elapsed，部分场景迁 ActiveUsage    | split/migrate        |
| ReminderOccurrence | RoutineOccurrence                  | preserve then evolve |
| ReminderResponse   | RoutineInteraction                 | migrate              |
| ReminderHistory    | occurrence/activity projection     | converge             |
| smartFrequency     | suggestion                         | behavior change      |

## 17. Protected Contracts

实施不得破坏：

1. 现有 Reminder reliable occurrence 的幂等和 crash recovery；
2. Schedule / Notification 的通用模块边界；
3. HTTP / IPC transport parity；
4. identity scope / auth boundary；
5. PowerSync / Prisma 数据隔离与 migration safety；
6. 已有 Desktop security boundary；
7. 当前公开 API 在 consumer inventory 完成前不得直接删除；
8. local runtime 失败不能导致 cloud durable state 静默损坏。

## 18. 迁移策略原则

不采用一次性重写。

建议顺序：

```text
1. Characterize current Reminder contracts
2. Introduce Profile/Membership semantics behind compatibility layer
3. Remove ControlMode takeover semantics
4. Add local ActivitySensor + Runtime vertical slice
5. Add InterventionWindow
6. Add ProtocolSession + FocusWindow
7. Migrate interaction/snooze semantics
8. Retire legacy Reminder-only fields/routes after consumer inventory
```

正式实施 ticket 单独进入 Active Plan。

## 19. OSS 依据

本 ADR 的设计不是从零发明，主要参考：

- Workrave：Active/Idle/Natural Break、运行模式、gentle prelude；
- Sane Break：two-phase intervention；
- Safe Eyes：Smart Pause 与平台 idle monitor interface；
- BreakTimer：notification/fullscreen 分层、Smart Break；
- Focust：schedule、idle、DND、active app、strict mode 的产品覆盖；
- Super Productivity：Focus Mode、Pomodoro/Flowtime strategy、session/break state。

具体来源与采用/不采用项见：

- `docs/analysis/2026-08-25-routine-break-focus-oss-study.md`

## 20. Consequences

### Positive

- 产品语义回到真实“习惯培养/节律/专注”目标；
- AI-native 入口和后台日常体验一致；
- Group 控制复杂度显著下降；
- 支持真实 ActiveUsage / Natural Break；
- Pomodoro 不再污染普通 Reminder；
- Electron 能提供恰当强度的干预；
- 保留现有可靠执行资产。

### Cost

- 数据模型需要 M:N membership migration；
- Desktop 增加本地 Runtime 和平台能力 adapter；
- 需要管理 cloud/local ownership；
- ProtocolSession 需要可靠恢复；
- 当前 Reminder API/DTO/UI 需要分阶段兼容迁移。

### Risks

- 过早做太多 sensor/context 会扩大平台适配成本；
- Profile override 若无限扩展会变成配置系统；
- Protocol 与 Task time tracking 可能重新产生双 timer；
- AI 若绕过结构化 command boundary，会破坏可预测性。

对应约束是：先做最小 vertical slice，不在第一阶段实现所有 context sensor 和所有方法。

## 21. First Validation Slice

第一个验证切片建议：

```text
Work Profile
 + Stand Routine
 + ActiveUsage 40m
 + Idle Natural Break
 + Gentle InterventionWindow
 + Snooze / Complete
```

第二个：

```text
50/10 ProtocolSession
 + Persistent FocusWindow
 + Break satisfies Ambient routines
 + restart recovery
```

如果这两条路径不能清晰实现，不继续扩展 Method Library 或复杂 AI 自动化。
