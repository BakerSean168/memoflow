---
tags:
  - product
  - reminder
  - routine
  - focus
  - ai-native
  - desktop
  - vnext
description: MemoFlow Reminder 向 AI-native Routine Coach 演进的产品定义、真实场景推演、领域模型、运行时与桌面交互设计
created: 2026-08-25T17:13:00+08:00
updated: 2026-09-08T20:20:00+08:00
---

# Routine Coach vNext：习惯节律、健康干预与专注协议

> **ADR-111 cutover policy (2026-09-09):** 当前没有需要保留的 MemoFlow 旧业务数据，也不要求兼容旧客户端/旧备份。本文历史推演中仅为旧数据保存设计的 migration/backfill/compatibility window 不再执行；目标模型和真实行为不变量继续有效。实施采用 direct canonical cutover + old-surface deletion + reset/reseed。

> 本文记录 2026-08-25 对现有 Reminder 模块的重新定性与 vNext 设计讨论。
>
> **实现状态（2026-09-08）：Core vNext 目标态已经落地。物理包仍名为 `reminder`，`ReminderTemplate` 继续作为兼容写入入口，但写入会投影 canonical RoutineDefinition/ProfileMembership；`ControlMode`、single-group ownership 与独立 cron scanner 已退休。本文中“当前/需要退役”字样若出现在历史推演章节，应按本 checkpoint 理解为 2026-08-25 的迁移背景。**

## 2026-09-08 Model Convergence Freeze

在 Core vNext 基础能力落地后重新审查当前代码，确认 **Routine vNext 与 Legacy Reminder 两代模型仍并存**。因此本轮进一步冻结最终领域目标，但**尚未实施这次退役/收敛**。

最终产品/领域结构：

```text
RoutineDefinition
├── RoutineTrigger
│   ├── WallClock
│   ├── Elapsed
│   └── ActiveUsage
├── InterventionPolicy
└── Shared Labels (external projection)

RoutineProfile <-> ProfileMembership <-> RoutineDefinition

RoutineRuntimeContext
RoutineTemporaryOverride

RoutineOccurrence
└── RoutineInteraction

ProtocolDefinition
└── ProtocolSession
```

边界：

```text
RoutineDefinition = 长期行为意图
RoutineRuntime     = 当前上下文/累计/临时状态
RoutineOccurrence  = 一次业务发生事实
RoutineInteraction = 用户对该 occurrence 的响应
Scheduler          = durable wall-clock wake-up / retry
Notification       = Notification Fact + per-channel delivery
Device Surface     = 实际设备呈现
```

Legacy `ReminderTemplate / ReminderGroup / ReminderHistory / ReminderResponse / ReminderInstance / ReminderOccurrence` 不再作为长期新能力承载面；ADR-111 下 current consumers 切到 Routine 后直接删除，不写旧 row converter，也不继续双写。

详细决策：

- ADR-076 — Routine Definition / Trigger Algebra / Legacy Reminder retirement；
- ADR-077 — Routine Occurrence / Interaction / Reliability boundary；
- ADR-078 — Profile / Eligibility / Runtime Context / Temporary Override；
- ADR-079 — Intervention Policy / Notification / Device Surface boundary；
- `docs/analysis/2026-09-08-reminder-routine-current-system-map.md` — 当前代码真值与迁移映射。

> 本轮只冻结模型与退役方向，不创建 Reminder active implementation plan。

---

## 1. Executive Summary

MemoFlow 当前名为 Reminder 的模块，不应被定义为整个产品的通用提醒基础设施，也不应成为 Goal / Task 等业务模块提醒能力的统一底座。

它真正要解决的是另一类独立问题：

> **帮助用户把健康、休息、时间管理和专注方法转化为持续可执行的个人行为节律。**

典型场景包括：

- 每持续使用电脑 40 分钟，提醒起身活动；
- 采用 20-20-20 规则，每持续看屏幕约 20 分钟后远眺一段时间；
- 定时喝水；
- 起床、早餐、午餐、晚餐、刷牙、睡觉等基础生活节律；
- 工作、学习、游戏等不同场景启用不同的健康习惯组合；
- Pomodoro、50/10、Flowtime 等用户主动开始的专注协议；
- 根据自然离开电脑、会议、演示、DND 等上下文，减少不必要或破坏专注的干预；
- 由 AI 帮助用户配置、选择和迭代这些方法，但由确定性 Runtime 可靠执行。

因此，vNext 的内部领域名称建议使用：

```text
Routine / Routine Coach
```

中文产品语言可以继续探索“节律”“习惯”“专注”“健康节律”等名称；“提醒”只是一种输出方式，不再是整个领域的定义。

核心决策：

```text
Ambient Routine    = 后台运行、按条件出现的轻量习惯干预
Protocol Session   = 用户主动进入、有持续状态的专注/训练会话
```

两者共享同一个 Routine Domain 与 Runtime 状态，但拥有不同的交互 Surface。

---

## 2. 产品边界

### 2.1 这个模块是什么

Routine Coach 回答：

1. 我想长期保持哪些健康或行为习惯？
2. 在工作、学习、游戏等不同场景下，哪些习惯应该生效？
3. 什么时候才真正需要干预我？
4. 我是否已经通过自然休息满足了这次需求？
5. 当前应该使用轻提醒、引导式休息，还是进入一个完整专注 Session？
6. 哪些成熟方法可以直接采用，而不需要用户自己研究并拼装 Timer？
7. AI 能否根据我的行为数据提出更合适的节律建议？

### 2.2 这个模块不是什么

Routine Coach **不是**：

- 所有业务模块的提醒基础设施；
- Goal / Task 的 deadline reminder 规则所有者；
- 通用 cron / job scheduler；
- 通用 Notification Center；
- 一个要求用户一直停留的“Reminder 页面”；
- 一个每次计时都调用 LLM 决定是否触发的 AI Timer；
- 企业级排班、日历或 Workflow Automation 系统。

Goal / Task 等模块仍然拥有自己的业务语义，例如：

```text
Task：dueAt - 30m 时需要提醒
Goal：某个业务条件变化时需要提示用户
```

它们可以复用 Schedule / Notification 基础能力，但不因为 Routine Coach 的存在而被迫变成 Routine。

### 2.3 North Star

```text
用户不需要“管理一堆提醒器”。

用户选择自己想采用的习惯和方法，
MemoFlow 根据当前生活/工作场景和真实使用状态，
在合适的时机以合适的强度进行干预，
帮助用户真正形成可持续的行为节律。
```

---

## 3. AI-native 产品原则

MemoFlow 是 AI-native 的个人工具，因此 Routine Coach 不应复制传统 Reminder App 的“进入页面 -> 手工填很多表单 -> 一直盯着页面”的主路径。

更自然的主路径是：

```text
用户自然语言
  -> AI 理解意图
  -> 生成/修改 Routine、Profile、Protocol 或 Temporary Override 草案
  -> 用户确认必要的持久变更
  -> Deterministic Routine Runtime 执行
  -> Notification / Electron Surface 干预
  -> 行为事实沉淀
  -> AI 复盘并提出建议
```

### 3.1 AI 是 Coach / Planner，不是 Clock

禁止把精确计时做成：

```text
每 20 分钟
  -> 调 LLM
  -> 问“现在要不要提醒？”
```

应该是：

```text
AI
  - 理解自然语言
  - 帮用户选方法
  - 创建/调整配置
  - 解释为什么建议调整
  - 根据历史行为提出建议

Deterministic Runtime
  - 计算时间
  - 处理 activity/idle
  - 管理 session state machine
  - 判断 due / overdue / satisfied
  - 执行 pause / resume / snooze
  - 保证 crash recovery / idempotency
```

这样同时满足：

- 可预测；
- 离线可运行；
- 成本低；
- 不受模型瞬时失败影响；
- 用户可以理解和控制规则；
- AI 仍然是产品主要入口之一。

### 3.2 AI 写入规则

AI 对持久配置的变更默认应生成结构化草案，例如：

```text
用户：以后打游戏每 45 分钟提醒我起来走走。

AI draft:
profile = Gaming
routine = Stand & Move
trigger = ActiveUsage(45m)
intervention = Gentle -> Guided
memberEnabled = true
```

UI 可以展示确认卡片：

```text
已准备加入“游戏”场景：

起身活动
· 连续电脑使用 45 分钟后
· 建议活动 2 分钟
· 游戏场景开启时生效

[确认] [调整]
```

对于明确的临时变化，可使用 Temporary Override：

```text
“今天肩膀累一点，工作时每 30 分钟提醒我活动。”

base interval = 40m
runtime override = 30m
expiresAt = endOfToday
```

不直接永久改写原始方法。

---

## 4. 两种核心运行语义

### 4.1 Ambient Routine

Ambient Routine 是后台习惯干预。

特点：

- 用户不需要持续打开任何 Routine 页面；
- 大部分时间没有窗口存在；
- 到点或满足条件后才创建一次 `RoutineOccurrence`；
- 根据干预强度选择 OS Notification、Electron Mini Window、Guided Break Window 或可选 Strict Overlay；
- 支持 Natural Break、Idle、DND、Meeting Overlay 等上下文；
- 典型行为：喝水、起身、远眺、吃饭、睡觉、刷牙。

### 4.2 Protocol Session

Protocol Session 是用户主动开始的持续性方法执行会话。

特点：

- 用户有清晰的“开始/暂停/结束”动作；
- 存在当前 Phase、剩余时间、Cycle、暂停原因等持续状态；
- 通常需要一个持续存在的小型 Focus Window；
- 必须可恢复：应用重启后可以恢复 Session；
- 典型协议：Pomodoro、50/10、Flowtime、自定义学习协议。

### 4.3 两者必须共享 Runtime，而不是两个独立 Timer

禁止：

```text
Background Reminder Timer
Pomodoro Timer
Task Timer
Break Timer

各自独立，不知道其他计时器发生了什么
```

目标：

```text
                  Routine Runtime
                 /               \
        Ambient Routine      Protocol Session
                 \               /
                  shared user state
                  shared activity/idle
                  shared break satisfaction
                  shared intervention coordination
```

例如 50/10 Session 的 10 分钟休息，可以同时满足：

- Stand Routine；
- Eye Break Routine；
- Movement Routine。

因此 Session 结束休息后，后台 Routine 不应该马上再弹一个“请站起来”。

---

## 5. 真实一天场景推演

本节不是 UI Demo，而是用于验证领域模型是否能覆盖复杂真实状态。

### 5.1 长期配置

用户拥有以下 Profile。

#### Baseline Health

```text
07:30 起床
08:00 早餐
12:00 午餐
18:30 晚餐
23:30 准备睡觉
每约 60 分钟喝水
```

它属于长期基础生活节律，一般持续开启。

#### Work

```text
20-20-20
ActiveUsage 40m -> 起身活动
ActiveUsage 60m -> 喝水
```

#### Gaming

```text
ActiveUsage 45m -> 起身活动    ON
Elapsed / ActiveUsage -> 喝水  OFF
眼睛休息                       ON
```

Gaming 中“喝水”曾被用户临时关闭，这个 member 自身状态需要被保存。

---

### 5.2 07:30：用户没有打开 MemoFlow 主窗口

`Wake Up` 是 WallClock Routine。

后台持久调度得到：

```text
RoutineOccurrence
routine = Wake Up
scheduledFor = 07:30
```

此时无需打开主应用，也无需 Electron 自定义复杂窗口。

Surface：

```text
OS Notification

早上好，该起床了。
[知道了] [稍后提醒]
```

结论：

> 对最简单的 Ambient Routine，系统原生通知是最合适的 Surface。

---

### 5.3 09:00：用户开始工作

用户可以在 AI 主会话直接说：

```text
“我要开始写代码了。”
```

AI 识别当前意图并激活 Work Profile：

```text
Baseline Health  ON
Work             ON
Gaming           OFF
```

Gaming 内部 member 状态不被修改：

```text
Stand            ON
Drink Water      OFF
Eye Break        ON
```

因此将来重新启用 Gaming 时，它会恢复为：

```text
Stand            ON -> effective ON
Drink Water      OFF -> effective OFF
Eye Break        ON -> effective ON
```

这验证了 Group 的正确语义不是“控制权切换”，而是父级 Gate。

---

### 5.4 09:20：20-20-20 到期

系统检测到用户真实屏幕/电脑活跃使用约 20 分钟。

产生：

```text
RoutineOccurrence
reason = ActiveUsageThresholdReached
```

此时普通 OS Toast 可能过轻，因为用户需要完成一个约 20 秒的动作。

Electron Intervention Window：

```text
┌─────────────────────────────┐
│ 👀 让眼睛休息一下           │
│                             │
│ 看向远处约 20 秒            │
│                             │
│ [现在开始]   [稍后 5 分钟]  │
└─────────────────────────────┘
```

用户点击“现在开始”后，同一个窗口进入引导态：

```text
┌─────────────────────────────┐
│ 👀 看向远处                 │
│                             │
│            17 s             │
│                             │
│ 放松眼睛，不需要盯着屏幕    │
│                             │
│ [结束]                      │
└─────────────────────────────┘
```

20 秒结束后窗口自动关闭。

结论：

> Routine 的输出不等于 Notification。需要独立的 Intervention Surface。

---

### 5.5 09:42：理论上该起身，但用户已经自然休息

用户 09:35 离开电脑约 6 分钟。

ActivitySensor 给出：

```text
IdleStarted
IdleDuration >= StandBreak.requiredRest
```

Runtime 判断：

```text
NaturalBreak satisfied
```

于是：

- 不再弹起身提醒；
- 对相应的 active-usage accumulator 进行 reset / credit；
- 记录本次需求已被自然行为满足。

这比简单 `Interval = 40m` 更符合真实健康行为。

关键不变量：

> 用户已经实际完成了休息，就不要为了“Timer 到点”再打扰用户。

---

### 5.6 10:20：进入会议

用户说：

```text
“我要开一个小时会。”
```

或未来由本地 Capability 检测到会议状态。

系统不需要关闭 Work Profile，而是添加 Temporary Runtime Overlay：

```text
Work Profile       Active
Meeting Overlay    Active
```

Meeting Overlay 示例策略：

```text
普通视觉提醒：Suppress
Activity tracking：Continue
高优先级生活节律：Allow / downgrade
到期 Routine：Mark due but defer presentation
```

会议结束后 Overlay 消失，Profile 原始状态完全不变。

结论：

> “我现在处于什么生活/工作场景”和“此刻是否允许打扰”不是同一个概念。

因此 Profile 与 Runtime Overlay 必须分开。

---

### 5.7 11:15：会议结束后处理 overdue break

Runtime 发现：

```text
Stand Break due
presentation suppressed for 12m
```

不应会议一结束就用全屏强制打断。

先进入 Gentle Phase：

```text
你已经持续工作一段时间了。
找个合适的位置停下来，活动 2 分钟。

[准备休息] [稍后 5 分钟]
```

如果用户长时间继续工作，可以按 InterventionPolicy 升级：

```text
Due
 -> Gentle
 -> Pending / Grace Period
 -> Guided Break
 -> Strict Overlay (only when explicitly enabled)
```

---

### 5.8 12:00：午餐提醒

Lunch 属于 Baseline Health + WallClock。

此时即使 Work Profile 正在运行，也只需要轻量通知：

```text
到午饭时间了。
```

这再次说明 Presentation 不能由一个统一“Reminder Window”决定，而应根据 Routine 的行为性质选择 Surface。

---

### 5.9 14:00：用户主动开始 50/10 学习法

用户说：

```text
“我要用 50/10 学习两小时。”
```

AI 生成明确 Protocol Session：

```text
Protocol = 50/10
Focus = 50m
Break = 10m
Cycles = 2
```

Runtime 创建：

```text
ProtocolSession
state = Focus
cycle = 1/2
```

Electron 打开持续存在的 Focus Window：

```text
┌─────────────────────────┐
│ Deep Study              │
│                         │
│          43:21          │
│                         │
│ Focus · Cycle 1/2       │
│                         │
│ [Pause]       [End]     │
└─────────────────────────┘
```

窗口能力：

- 可拖动；
- 可折叠；
- 可选择 always-on-top；
- 不要求 MainWindow 保持前台；
- Session 结束后关闭；
- 重启应用后可恢复。

---

### 5.10 14:50：Session 进入 Break Phase

同一个 Focus Window 切换：

```text
┌─────────────────────────┐
│ 休息一下                │
│                         │
│          09:58          │
│                         │
│ 离开屏幕，活动身体      │
│                         │
│ [结束休息]              │
└─────────────────────────┘
```

Runtime 同时发出 break satisfaction：

```text
satisfies:
- Stand Routine
- Eye Break Routine
- Movement Routine
```

后台 Routine 对这些需求重新计时或结算，不重复干扰用户。

---

### 5.11 16:00：Protocol Session 完成

Session 状态：

```text
Completed
focusDuration = 100m
breakDuration = 20m
cycles = 2
```

Focus Window 自动关闭。

主应用或 AI 会话可以在之后显示轻量结果：

```text
完成 2 个 50/10 Cycle，共专注 100 分钟。
```

AI 可以基于长期数据建议：

```text
过去一周你在第二个 50 分钟周期后经常提前结束，
是否尝试 40/10？

[调整] [保持 50/10]
```

AI 不应自动偷偷修改协议。

---

### 5.12 20:00：切换到 Gaming

用户说：

```text
“开游戏模式。”
```

Runtime：

```text
Work    OFF
Gaming  ON
```

Gaming member 原始状态恢复：

```text
Stand       ON
Drink       OFF
Eye Break   ON
```

Baseline Health 继续保持 Active。

---

### 5.13 23:30：睡觉 Routine 与 Snooze

Sleep Routine 到期。

第一次只做温和干预：

```text
已经 23:30 了，准备收尾睡觉吧。
```

用户选择：

```text
再玩 20 分钟
```

系统创建：

```text
TemporaryOverride
routine = Sleep
snoozeUntil = 23:50
```

不修改长期规则：

```text
Sleep.defaultTime = 23:30
```

23:50 再生成新的 occurrence / presentation。

---

## 6. 从场景推演得到的领域模型

### 6.1 RoutineDefinition

一个可复用的原子习惯/干预定义。

示例：

```text
Drink Water
Stand & Move
Look Far Away
Breakfast
Lunch
Brush Teeth
Prepare for Sleep
```

建议核心字段：

```text
id
title
description?
actionKind
triggerPolicy
interventionPolicy
defaultDuration?
defaultEnabled
methodRef?
createdAt
updatedAt
```

RoutineDefinition 不应该直接绑定某一个 Profile。

### 6.2 RoutineProfile

Profile 表达：

> 在一种长期场景中，我希望哪些 Routine 参与运行？

示例：

```text
Baseline Health
Work
Study
Gaming
```

Profile 是对现有 ReminderGroup 思想的升级，而不是简单重命名。

### 6.3 ProfileMembership

当前 `ReminderTemplate.groupId` 是一对多：一个 Reminder 只能属于一个 Group。

真实需求是多对多：

```text
Drink Water
  -> Baseline Health
  -> Work
  -> Study
  -> Gaming
```

目标对象：

```text
ProfileMembership
  profileId
  routineId
  enabled
  triggerOverride?
  interventionOverride?
  order?
```

这使 Routine 可以复用，而不是复制三份“喝水 Reminder”。

### 6.4 Profile 启用语义

2026-08-25 迁移基线中的 `ControlMode.Group / Individual` 需要退休；该删除现已完成。

正确的不变量是：

```text
effectiveEnabled =
  globalRoutineEnabled
  && profileActive
  && membershipEnabled
  && !suppressedByRuntimeOverlay
  && !temporarilyDisabled
```

Profile OFF：

- 所有 member effective OFF；
- member 自身 enabled 状态不变。

Profile ON：

- member 按自己保存的 enabled 状态恢复；
- Profile 永远不能“复活”一个用户明确关闭的 member。

### 6.5 Profile 与 Overlay

长期上下文和临时打扰策略分离：

```text
Profile
- Baseline Health
- Work
- Study
- Gaming

Runtime Overlay
- Meeting
- Presentation
- DND
- Fullscreen Game
- Temporary Quiet
```

Overlay 是短生命周期 Runtime 状态，不应该写回长期 Profile 配置。

### 6.6 TemporaryOverride

用于临时改变某个 Routine / Profile / Session 行为：

```text
snoozeUntil
suppressUntil
overrideInterval
expiresAt
reason
source = user | ai | runtime
```

典型：

- “今天每 30 分钟活动”；
- “再玩 20 分钟”；
- “会议期间不要弹”；
- “这次跳过，但明天继续”。

---

## 7. Trigger Model

当前实现主要是：

```text
FixedTime
Interval
```

它不足以表达习惯节律。

### 7.1 WallClock

用于现实世界固定时间：

```text
07:30 起床
12:00 午饭
23:30 睡觉
```

建议：

```text
WallClockTrigger
  localTime
  recurrenceRule
  timezone (IANA)
```

### 7.2 Elapsed

从 Profile / Routine activation 或上次满足后计算经过时长：

```text
工作场景启动后约 60m 喝水
```

它计算的是 elapsed time，而不是电脑 active usage。

### 7.3 ActiveUsage

只累计用户真实使用电脑的时间：

```text
ActiveUsage 40m -> Stand Break
ActiveUsage 20m -> Eye Break
```

需要 ActivitySensor / IdleSensor。

### 7.4 Natural Break Credit

当用户自然 idle 足够久时：

```text
idleDuration >= requiredBreakDuration
=> requirement satisfied
=> reset / credit accumulator
```

这是 Routine Runtime 的核心业务语义之一。

### 7.5 Protocol 不作为普通 Trigger

Pomodoro / Flowtime 不应该被塞成 `TriggerType.Protocol`。

它们是独立的一等对象：

```text
ProtocolDefinition
ProtocolSession
ProtocolPhase
```

这样状态机、Crash Recovery、Phase transition 才清晰。

---

## 8. Protocol / Focus Session 模型

### 8.1 ProtocolDefinition

示例：

```text
Pomodoro
50/10
52/17
Flowtime
20-20-20 Guided Session
Custom
```

字段方向：

```text
id
name
phases[]
cyclePolicy
breakPolicy
strictness
completionPolicy
```

### 8.2 ProtocolPhase

```text
Focus
ShortBreak
LongBreak
Prepare
Recovery
```

Pomodoro 示例：

```text
Focus 25m
ShortBreak 5m
Focus 25m
ShortBreak 5m
...
Every 4 cycles -> LongBreak 15m
```

### 8.3 ProtocolSession

Session 保存 Runtime 事实：

```text
id
protocolId
state
currentPhase
cycle
startedAt
phaseStartedAt
pausedAt?
accumulatedPauseMs
remainingMs / phaseDeadline
completedAt?
terminationReason?
```

最低状态机：

```text
Idle
 -> Preparing?
 -> Focus
 -> Break
 -> Focus
 -> ...
 -> Completed

Focus / Break
 -> Paused
 -> Resume

Any active state
 -> Cancelled
```

### 8.4 Crash Recovery

Protocol Session 不能只存在 Renderer 内存。

应用异常退出或系统重启后，必须能够根据持久状态恢复：

```text
session state
current phase
phase start/deadline
cycle
pause state
protocol snapshot/version
```

恢复时不能简单“从剩余秒数继续减”，而应基于持久 wall-clock / monotonic-safe 策略重新推导。

---

## 9. RoutineOccurrence 与 Interaction

`ReminderOccurrence` 当前已经承担可靠执行事实，这是应该保护的资产。

vNext 可以逐渐泛化为：

```text
RoutineOccurrence
  id
  routineId
  profileContext?
  dueReason
  dueAt / scheduledFor
  createdAt
  status
  satisfiedAt?
  satisfiedBy?
  interventionLevel
  operation/idempotency metadata
```

用户行为独立记录：

```text
RoutineInteraction
  occurrenceId
  action = acknowledge | start | dismiss | snooze | complete | skip
  occurredAt
  snoozeUntil?
  latencyMs?
```

需要避免现有 `responseTime` 同时承担“响应耗时”和“snooze 时长”的混合语义。

Snooze 也应该是有可靠状态变更的命令，而不是“先写一条 analytics response，再尽力 reschedule”。

---

## 10. Intervention Policy

Reminder 到期不应等价于立即弹窗。

目标模型：

```text
Due
 -> Gentle
 -> Grace Period
 -> Guided
 -> Strict (optional)
```

### 10.1 Gentle

- 非抢焦点；
- 小尺寸；
- 可自动退到后台；
- 提示“找个自然停顿点”。

### 10.2 Guided

当用户开始休息后，展示动作和短倒计时：

```text
远眺 20 秒
活动肩颈 60 秒
站立 2 分钟
```

### 10.3 Strict

仅用户主动开启时使用：

- 全屏 Overlay；
- 可限制交互；
- 不应成为默认行为；
- 必须保留安全退出路径。

### 10.4 用户可选择干预风格

```text
Gentle
Normal
Strict
```

但方法本身也可以给出合理默认值。

---

## 11. Desktop / Electron Surface 设计

Routine Coach 的日常体验不能依赖主 Reminder 页面。

目标至少包含四类 Surface。

### 11.1 MainWindow

职责：

- AI 对话；
- Dashboard；
- Routine 方法库；
- Profile 管理；
- Protocol 配置；
- 历史与复盘；
- 高级设置。

MainWindow 不是 Runtime 必须保持打开的前台页面。

### 11.2 OS Notification

适合：

- 起床；
- 午饭；
- 简单喝水；
- Session 完成后的轻提示；
- 不需要持续引导的动作。

优势：

- 原生；
- 成本低；
- App 不需显示自定义窗口。

### 11.3 InterventionWindow

短生命周期 Electron BrowserWindow。

适合：

- 20-20-20；
- 起身活动；
- Guided break；
- 需要自定义动作、倒计时或多步交互的提示。

窗口原则：

- frameless / compact；
- 默认不抢键盘焦点；
- 可定位屏幕边角；
- 多显示器策略明确；
- 可以从 Gentle 形态扩展为 Guided 形态；
- occurrence 完成/取消后销毁或隐藏。

### 11.4 FocusWindow

Protocol Session 生命周期内持续存在。

能力：

- 当前 Phase；
- 倒计时；
- Cycle；
- Pause / Resume / End；
- 可折叠；
- 可拖动；
- 可选 always-on-top；
- Session 状态恢复后重新构建。

### 11.5 BreakOverlay

仅 Strict Mode 使用。

应和 InterventionWindow 分离，避免普通提醒天然获得全屏/阻塞能力。

### 11.6 Electron Main Process 作为窗口生命周期所有者

目标结构：

```text
Electron Main Process
│
├── MainWindow
├── InterventionWindow
├── FocusWindow
└── BreakOverlay (optional)
```

Renderer 不应自行无约束创建 BrowserWindow。

Main Process 负责：

- 创建/销毁；
- 唯一实例；
- 屏幕位置；
- always-on-top；
- multi-monitor；
- hide/show；
- crash/reload recovery；
- 与 Runtime 的 IPC binding。

安全约束继续遵循现有 Electron 架构：

- context isolation；
- preload/IPC capability boundary；
- 不向 renderer 暴露任意 Node API；
- Routine 窗口拥有最小 IPC surface。

---

## 12. Activity / Context Capability Ports

ActiveUsage、Natural Break 和 Context-aware suppression 不应把平台 API 写进领域服务。

目标 Port：

```text
ActivitySensorPort
  onActivityChanged
  getCurrentActivityState

IdleSensorPort
  getIdleDuration
  onIdle
  onResume

DndSensorPort
  getDndState

ActiveApplicationPort
  getActiveApplication
  onActiveApplicationChanged
```

平台 Adapter：

```text
Windows
macOS
Linux
```

Routine Runtime 只消费标准事件：

```text
UserActive
UserIdle
UserResumed
DndEnabled
DndDisabled
ActiveApplicationChanged
```

不理解 Win32、DBus、Wayland 或 macOS API 细节。

---

## 13. Runtime 状态与责任

Routine Runtime 是确定性的领域运行时。

职责：

- 当前 active profiles；
- 当前 runtime overlays；
- elapsed accumulator；
- active usage accumulator；
- idle / natural break credit；
- due / overdue；
- temporary override；
- occurrence creation；
- intervention escalation；
- protocol session coordination；
- crash/restart recovery；
- 去重和幂等。

概念图：

```text
                     AI
                     │
              configure / coach
                     │
                     ▼
┌──────────────────────────────────────┐
│           Routine Domain             │
│                                      │
│ RoutineDefinition                    │
│ RoutineProfile                       │
│ ProfileMembership                    │
│ ProtocolDefinition                   │
│ TemporaryOverride                    │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│           Routine Runtime            │
│                                      │
│ Active Profiles                      │
│ Runtime Overlays                     │
│ Activity / Idle                      │
│ Due / Overdue / Satisfied            │
│ ProtocolSession                      │
│ Intervention Coordination            │
└──────────────────┬───────────────────┘
                   │
            RoutineOccurrence
                   │
          ┌────────┴────────┐
          ▼                 ▼
   Ambient Surface      Focus Session
```

---

## 14. 与 Schedule / Notification 的边界

### 14.1 WallClock 适合 Schedule

例如：

```text
每天 23:30 准备睡觉
```

是 durable wall-clock event：

```text
Routine
 -> Schedule
 -> RoutineOccurrence
 -> Notification / Intervention
```

Schedule 负责“到达某个确定的时间点后可靠执行”。

### 14.2 ActiveUsage 不属于后端 Schedule

例如：

```text
真实使用电脑 20m -> 眼睛休息
```

依赖本地事实：

- keyboard/mouse activity；
- idle；
- foreground app；
- DND；
- 当前 Session；
- 当前 Profile。

正确链路：

```text
Desktop ActivitySensor
 -> Local Routine Runtime
 -> RoutineOccurrence
 -> InterventionWindow
```

不应由后端每 20 分钟固定打一次 Schedule job。

### 14.3 Notification 只负责送达

Notification 不拥有：

- Routine 是否 due；
- Natural Break 是否满足；
- Profile 是否 active；
- Protocol 当前 Phase。

Notification 负责：

```text
“系统已经决定要触达”之后，如何通过 channel 送达。
```

---

## 15. Profile 组合模型

为了覆盖“基础健康长期开启 + 当前工作/游戏场景 + 临时会议”的真实情况，不能再把所有 Group 视为互斥单选。

推荐三层：

```text
Baseline Profiles
  +
Activity Context Profile
  +
Runtime Overlays
```

示例：

```text
Baseline Health  ON
Work             ON
Meeting Overlay  ON
```

或：

```text
Baseline Health  ON
Gaming           ON
DND Overlay      ON
```

第一阶段产品 UI 可以把 Work / Study / Gaming 作为“当前主要场景”做一键切换，但领域层不要把“所有 Profile 全局只能一个 Active”写成永久硬约束。

---

## 16. 方法库（Method Library）

Routine Coach 的长期价值不只是让用户手工创建 Timer，而是提供整理好的方法模板。

可能的内置方法：

```text
20-20-20
Pomodoro
50/10
52/17
Flowtime
Microbreak
Posture Reset
Breathing Break
Sleep Wind-down
```

方法模板提供：

- 简短原理；
- 推荐参数；
- 可以调整的参数；
- 推荐场景；
- 默认 InterventionPolicy；
- 是否需要 ActivitySensor；
- 是否是 Ambient Routine 或 Protocol。

用户操作：

```text
方法库
 -> 添加 20-20-20
 -> 使用推荐参数
 -> 放入 Work Profile
 -> AI 可帮助调整
```

而不是要求用户理解 `TriggerType`、cron、`activeTime` 等内部术语。

---

## 17. Smart Frequency 的重新定位

当前 Reminder 有自动 frequency adjustment 思路。

对于健康方法和重要生活节律，系统不应根据“用户经常忽略”就自动改掉规则。

例如：

```text
用户常忽略睡觉提醒
!=
系统应该偷偷把 23:30 改成 01:00
```

vNext 原则：

> Analytics 产生 Insight，AI/系统产生 Suggestion，持久规则调整由用户确认。

示例：

```text
过去 14 次站立提醒中，你有 11 次在 5 分钟内忽略。
工作日 10:00-12:00 的接受率更高。

是否把 40 分钟改成 50 分钟？

[调整] [保持]
```

---

## 18. 当前实现与 vNext 映射

### 18.1 当前可保护资产

| 当前能力                                                                   | vNext 判断                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| ReminderOccurrence reliability / lease / idempotency / retry / dead-letter | 保留并演化为 RoutineOccurrence 的可靠执行基础                 |
| Schedule / Notification 分层                                               | 保留                                                          |
| HTTP / IPC adapter parity                                                  | 保留                                                          |
| PowerSync / Prisma 双运行时适配                                            | 保留边界，迁移时保持 contract parity                          |
| Reminder response / history 事实                                           | 保留意图，但重新整理 Interaction / Occurrence 语义            |
| Global reminder enabled                                                    | 保留为 global routine gate                                    |
| active hours 概念                                                          | 保留需求，但迁入 profile availability / trigger policy 更合理 |

### 18.2 需要退役或重构

| 当前模型                             | 问题                                       | 目标                                  |
| ------------------------------------ | ------------------------------------------ | ------------------------------------- |
| ReminderGroup                        | 只表达分组，无法准确表示场景               | RoutineProfile                        |
| ControlMode Group/Individual         | 把父级 Gate 错建模成控制权切换             | 删除；统一 gate 公式                  |
| ReminderTemplate.groupId             | 一条 Routine 只能属于一个 Group            | ProfileMembership M:N                 |
| FixedTime / Interval                 | 不能区分 wall-clock、elapsed、active usage | WallClock / Elapsed / ActiveUsage     |
| effectiveEnabled 缓存 + 多套计算服务 | 复杂且容易状态不一致                       | Runtime/Policy 单一权威计算           |
| smartFrequency auto adjustment       | 对重要节律过于激进                         | Insight + user-confirmed suggestion   |
| Reminder 页面作为主要产品入口        | 不符合 AI-native / ambient usage           | 配置中心 + AI + popup/session surface |

### 18.3 当前代码事实（2026-09-08）

- `packages/reminder` 仍是当前物理包名，`ReminderTemplate` 是现状中的兼容写入入口；ADR-111 要求最终 cutover 时移除该入口，只保留 canonical `RoutineDefinition` 与 M:N `ProfileMembership`；
- Profile 只作为 Gate；`ControlMode` 与 single-group ownership 已删除；
- WallClock 由 Scheduler 唯一 durable wake-up authority 驱动，旧 `ReminderSchedulerService` / cron scanner 已删除；
- ActiveUsage runtime 与 activity sensor 在 Desktop 本地执行，端能力不伪造；
- ProtocolDefinition / ProtocolSession 已形成确定性 state machine，50/10 与 Pomodoro 不复用普通 Interval Reminder timer；
- Temporary Override 与长期 trigger 分离，Prisma / PowerSync 均有持久化 parity；
- InterventionWindow / FocusWindow 已存在实际 Desktop surface；
- 初始六方法 Method Library 已实现；AI 可通过 owner-domain command port 创建 Routine、切换 Profile gate、设置 temporary override、启动/控制 ProtocolSession；
- 可靠 occurrence / lease / fencing / retry / idempotency 能力保留并纳入 HARD-7101~7103 回归。

---

## 19. 目标数据流

### 19.1 Ambient WallClock

```text
RoutineDefinition
 -> WallClockPolicy
 -> Schedule projection
 -> durable due event
 -> RoutineOccurrence
 -> InterventionPolicy
 -> Notification / InterventionWindow
 -> RoutineInteraction
```

### 19.2 Ambient ActiveUsage

```text
ActivitySensor
 -> RoutineRuntime accumulator
 -> threshold reached
 -> check profile + overlays + temporary override
 -> RoutineOccurrence
 -> Gentle InterventionWindow
 -> user naturally pauses
 -> Guided break / satisfied
 -> reset accumulator
```

### 19.3 Protocol Session

```text
User / AI starts protocol
 -> ProtocolSession persisted
 -> FocusWindow
 -> deterministic phase transitions
 -> Break phase
 -> satisfy compatible ambient routines
 -> next phase
 -> Completed
 -> summary fact
 -> AI insight later
```

---

## 20. Electron 交互原则

### 20.1 不抢焦点是默认

Ambient intervention 不应因为出现就抢走：

- IDE 输入焦点；
- 游戏输入；
- 全屏演示；
- 当前会议窗口。

除 Strict Mode 外，默认应是可见但低侵入。

### 20.2 不需要长期打开 Reminder 页面

Routine 页面定位：

```text
方法库
Profile 管理
历史
统计
高级参数
```

日常动作主要来自：

```text
AI conversation
system tray / quick action
InterventionWindow
FocusWindow
OS Notification
```

### 20.3 Window 是 Surface，不是状态所有者

关闭/隐藏 FocusWindow 不应自动丢失 ProtocolSession。

关闭 InterventionWindow 也必须形成明确 Interaction：

```text
dismiss / postpone / ignored
```

Renderer Window 只是 Runtime state 的投影。

---

## 21. 关键业务不变量

1. Profile OFF 不修改其 Membership 的个人 enabled 状态。
2. Profile ON 不能复活用户明确关闭的 Membership。
3. Natural Break 足够时，应满足相应 Routine，而不是仍按墙上时间弹窗。
4. Protocol Break 可以满足兼容的 Ambient Routine，避免重复干预。
5. Temporary Overlay 不应污染长期 Profile 配置。
6. Snooze 不应永久修改长期 Trigger。
7. AI 不直接承担精确计时，也不在未经确认时永久改变关键习惯参数。
8. Activity-dependent Routine 不能仅依赖云端 Schedule。
9. WallClock durable trigger 应继续使用可靠调度基础能力。
10. Window/Renderer 不拥有业务 truth；Runtime / persisted state 才是权威。
11. 重启应用后，进行中的 Protocol Session 必须可恢复或明确结算为 interrupted。
12. Strict 模式只能显式开启，且必须存在安全退出路径。

---

## 22. OSS 设计来源

详细分析见：

- [Routine / Break / Focus OSS 调研](../analysis/2026-08-25-routine-break-focus-oss-study.md)

核心参考：

### Workrave

借鉴：

- Active Time / Idle Time；
- Natural Break；
- Microbreak / Restbreak；
- Gentle prelude；
- Normal / Quiet / Suspended / Reading 等运行上下文。

### Sane Break

借鉴：

- 两阶段干预；
- 先提示寻找自然停顿点；
- 用户自然停止活动后再进入真正休息；
- 避免把 Skip / Postpone 培养成机械操作。

### Safe Eyes

借鉴：

- Smart Pause；
- Idle Monitor Interface；
- 平台能力通过 Adapter / Plugin 隔离。

### BreakTimer

借鉴：

- Notification 与 fullscreen break 分层；
- Smart Break / idle reset；
- 工作时间窗口；
- 新版先 subtle notification 再进入 countdown。

### Focust

借鉴：

- mini break / long break；
- 不同 schedule；
- idle / DND / active app context；
- strict mode；
- 系统托盘和动态 break window。

注意：该项目仍处于 early development，适合作为产品需求参考，不作为工程质量唯一基准。

### Super Productivity

借鉴：

- Focus Mode；
- Pomodoro / Flowtime / Countdown 策略；
- Session / Break 分离；
- Flowtime 根据实际 focus duration 动态选择 break；
- Electron taskbar / focus surface 与 session state 协同。

同时避免多个独立 Timer 子系统之间状态不同步的问题。

---

## 23. 与现有 Reminder 文档的关系

- `docs/product/modules/reminder.md`：描述当前已经存在的 Reminder 模块实现事实；
- 本文：描述 vNext 产品 North Star 和目标业务模型；
- ADR-059：记录需要长期约束实现的架构决策；
- 后续 Active Plan：在决定进入实现阶段后，再拆迁移 ticket，不在本文假装已经实施。

---

## 24. 下一阶段需要进一步决策的问题

这些问题不会阻塞本文作为 North Star，但实施前需要收敛：

1. 产品最终中文名称：提醒 / 节律 / 习惯 / Routine / Focus；
2. `packages/reminder` 是否最终物理重命名为 `packages/routine`，还是先保持 package 名兼容、仅迁领域模型；
3. 第一阶段平台传感器只做 Windows，还是同时抽象 Windows/macOS/Linux；
4. Work / Study / Gaming 是否在 UI 上默认互斥，还是允许用户并行激活；
5. DND / active app detection 第一版是否进入 MVP；
6. Strict Overlay 第一版是否实现，还是先只做 Gentle + Guided；
7. ProfileMembership override 第一版支持哪些字段，避免一开始做成配置系统；
8. Method Library 第一批内置方法的来源与健康免责声明；
9. ProtocolSession 与 Task time tracking 的协同边界；
10. Local Runtime 与 Cloud Runtime 的离线/同步 ownership。

---

## 25. 建议的最小可信 vNext Slice

虽然本文不是 Active Plan，但为了验证架构，后续第一个 Vertical Slice 应尽量小：

```text
Work Profile
 +
Stand Routine
 +
ActiveUsage 40m
 +
Idle Natural Break
 +
Gentle InterventionWindow
 +
Snooze / Complete
```

它可以一次性验证：

- Profile Gate；
- ActivitySensor Port；
- local Routine Runtime；
- Natural Break；
- RoutineOccurrence；
- Electron InterventionWindow；
- interaction persistence；
- AI 开启/关闭 Work Profile 的控制入口。

第二个 Slice 再验证：

```text
50/10 ProtocolSession
 +
Persistent FocusWindow
 +
Break satisfaction coordination
 +
restart recovery
```

只有这两个 Slice 跑通后，再扩展方法库和更复杂上下文检测。

---

## 26. 最终产品心智

用户不应该想：

```text
“我去 Reminder 页面创建一个 TriggerType=Interval 的提醒。”
```

用户应该想：

```text
“我要开始工作了。”
“工作时帮我注意眼睛和久坐。”
“今天用 50/10 学两个小时。”
“开会时先不要打断我。”
“再玩 20 分钟，然后提醒我睡觉。”
```

MemoFlow 将这些意图转换为可靠、可解释、可恢复的行为系统。

这就是 Routine Coach 作为 AI-native 个人工具中的正确位置。
