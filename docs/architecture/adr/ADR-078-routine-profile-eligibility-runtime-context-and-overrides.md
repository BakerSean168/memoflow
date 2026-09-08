---
tags:
  - adr
  - routine
  - profile
  - runtime-context
  - eligibility
  - override
description: 将 Profile 定义、M:N Membership、运行时 Active Context、Temporary Override 与有效启用派生彻底分离，避免 cached effectiveEnabled 与 profile.active 污染长期定义
created: 2026-09-08T20:20:00+08:00
updated: 2026-09-08T20:20:00+08:00
---

# ADR-078: Routine Profile、Eligibility、Runtime Context 与 Temporary Override

**状态：** 已采纳（待实施）  
**日期：** 2026-09-08  
**影响范围：** reminder/routine、desktop runtime、contracts、database、PowerSync、AI tools  
**修订：** ADR-059 Profile Gate / Runtime Overlay 语义  
**关联：** ADR-037、ADR-045、ADR-059、ADR-076、ADR-077

## 1. 决策摘要

长期 Profile 定义、成员关系与“当前正在什么场景”必须分开：

```text
RoutineProfile            = 长期场景定义
ProfileMembership         = Routine 与 Profile 的 M:N 边
RoutineRuntimeContext     = 当前设备/运行时处于哪些场景
RoutineTemporaryOverride  = 临时 snooze/suppress/interval override
Eligibility               = 上述事实的纯派生结果
```

`effectiveEnabled` 不作为 Routine/Reminder aggregate 持久真值。

## 2. RoutineProfile

目标：

```text
RoutineProfile
├── id
├── identityId
├── name
├── description?
├── enabled
├── version
├── createdAt
└── updatedAt
```

例如：

```text
Baseline Health
Work
Study
Gaming
```

### 2.1 `enabled` 的语义

`enabled=false` 表示这个 Profile 长期不可用/被用户关闭。

它不等价于：

> “此刻用户正在 Gaming。”

## 3. ProfileMembership

继续保留当前 M:N 方向：

```text
RoutineDefinition
       ↕
ProfileMembership
       ↕
RoutineProfile
```

边自己拥有：

```text
enabled
```

关闭 Profile 不得修改 membership；关闭 membership 不得修改 Routine Definition。

## 4. `profile.active` 的长期去向

当前 `RoutineProfile` 同时有：

```text
enabled
active
```

其中 `active` 更像运行上下文，不是 Profile definition。

目标优先迁到：

```text
RoutineRuntimeContext
```

而不是每次切换工作/游戏状态都修改 Profile 的 `version/updatedAt`。

### 4.1 为什么 Runtime Context 需要独立

多设备场景可能同时存在：

```text
Desktop A -> Gaming
Laptop B  -> Work
Phone     -> no foreground context
```

因此“哪个 Profile 当前 active”天然可能是 device/runtime-scoped 状态。

是否跨设备同步 active context 是后续产品策略；本 ADR 不把它隐式变成 Profile Definition state。

## 5. RoutineRuntimeContext

目标 read/runtime model：

```text
RoutineRuntimeContext
├── identityId
├── runtimeId / deviceId
├── activeProfileIds[]
├── overlays[]
├── foregroundContext?
├── activityState?
└── observedAt
```

Overlay 示例：

```text
Meeting
Presentation
DND
Temporary Quiet
Fullscreen Game
```

Overlay 是短期上下文，不修改长期 Profile。

## 6. Canonical Eligibility Function

最终有效性必须是纯函数，不缓存到 Definition：

```text
effectiveEnabled =
  globalRoutineEnabled
  && routine.enabled
  && profileGateAllows
  && temporaryOverrideAllowsExecution
  && runtimeAllowsExecution
```

其中 M:N Profile gate：

```text
如果 routine 没有任何 membership：
  profileGateAllows = true

如果 routine 有 memberships：
  profileGateAllows =
    exists membership where
      membership.enabled
      && profile.enabled
      && runtimeContext.activeProfileIds contains profile.id
```

这允许同一 Routine 复用于 Work / Study / Gaming，而不是要求所有 Profile 同时 active。

## 7. Global gate

现有 `UserReminderPreferences.globalReminderEnabled` 可以在迁移期继续作为总开关来源，但产品语义应改为：

```text
Global Routine / Intervention master gate
```

而不是“旧 Reminder 系统总开关”。

Global gate 只参与 eligibility，不改写每条 Routine.enabled。

## 8. Temporary Override

当前 vNext 的方向正确：

```text
snoozeUntil
suppressUntil
overrideIntervalMs
expiresAt
reason
source
```

必须继续与长期 trigger 分离。

例如：

```text
base = ActiveUsage 40m
今天肩膀累 -> 临时 30m
```

表示：

```text
RoutineDefinition.trigger = 40m
TemporaryOverride.interval = 30m, expires end-of-day
```

而不是永久把 trigger 改成 30m。

## 9. Snooze 语义

Snooze 是 runtime state change，不只是 analytics response：

```text
User Snooze
  -> RoutineInteraction(Snoozed)
  -> RoutineTemporaryOverride(snoozeUntil)
  -> projection/re-evaluation
```

它不得：

- 重写 WallClock.localTime；
- 重写 recurrence；
- 重写 Profile；
- 只写 ReminderResponse 然后不改变实际运行状态。

## 10. Presentation Window 与 Eligibility

“业务 requirement 已 due”与“此刻适不适合弹窗”应分开。

例如 ActiveUsage 40m 在 23:59 达到 due，但用户配置夜间不打扰：

```text
Occurrence = Open / due
Presentation = suppress/defer by runtime/intervention policy
```

是否超时变 Expired 由 Routine policy 决定。

不要因为不能呈现，就伪造“Routine 没有 due”。

## 11. current cached effectiveEnabled 的退役

旧 `ReminderTemplate.effectiveEnabled` 是 legacy cached projection。

最终禁止：

```text
setEffectiveEnabled()
isEffectivelyEnabled() reading stored boolean
```

目标：

```text
RoutineEligibilityEvaluator.evaluate(
  definition,
  memberships,
  profiles,
  runtimeContext,
  override,
  globalPreference,
  now
)
```

输出 read-only decision：

```text
allowed: boolean
reasonCodes[]
```

这也能让 UI 正确解释：

```text
“该节律已启用，但 Work Profile 当前未激活”
```

而不是只看到 false。

## 12. AI 边界

AI 可以：

- 创建/修改 Profile；
- 修改 memberships；
- 建议切换 Profile；
- 创建 Temporary Override；
- 解释当前 eligibility reason。

AI 不可以：

- 直接写 cached effectiveEnabled；
- 把临时 context 永久写入 Profile；
- 绕过结构化 command 修改 runtime 内部状态。

## 13. Acceptance（未来实施）

最终：

```text
RoutineProfile.active as long-lived truth      = 0
ReminderTemplate.cached effectiveEnabled       = 0
ControlMode                                    = 0
single groupId ownership                       = 0
snooze rewriting trigger definition            = 0
implicit host-timezone presentation checks     = 0
```

且 API/Desktop/PowerSync/Prisma 都能解释相同的 eligibility reason。
