---
tags:
  - product
  - module
  - reminder
  - routine
description: Routine Coach 当前实现、Reminder 兼容聚合与确定性 runtime 边界
created: 2026-06-02T00:00:00
updated: 2026-09-08T09:00:00+08:00
---

# Routine / Reminder 模块说明

## 1. 功能定位

`packages/reminder` 是当前物理包名与兼容聚合入口，但产品语义已经收敛到 **Routine Coach**：长期配置由 RoutineDefinition / ProfileMembership 表达，确定性的 WallClock / ActiveUsage / Protocol runtime 执行，Notification 只负责用户触达。

当前 `ReminderTemplate` 创建/更新是迁移兼容入口；写入后会投影 canonical `RoutineDefinition` 与 ProfileMembership，而不是维护第二套独立 Routine 真值。

## 2. 当前产品能力

- Routine/Reminder template 创建、编辑、启停与删除；
- RoutineProfile + M:N ProfileMembership；Profile 只作为 Gate，不接管成员自身状态；
- WallClock trigger：由 Scheduler 作为唯一 durable wake-up authority；
- ActiveUsage trigger：Desktop 本地 activity sensor/runtime 驱动，端能力显式区分；
- ProtocolSession：50/10、Pomodoro 等持续会话由确定性状态机计时；
- Temporary Override：snooze / suppress / temporary interval 与长期配置分离，过期后自动回到 canonical trigger；
- Routine occurrence：保留可靠、幂等、可 fencing 的执行事实；
- Method Library：初始只提供 Stand & Move、20-20-20、Drink Water、Sleep Wind-down、50/10 Protocol、Pomodoro 六个可验证方法；
- AI Routine commands：创建 Routine、Profile gate、temporary override、Protocol start/pause/resume/end 通过 owner-domain command port 执行；持久配置变更要求 AI tool approval。

已退休：`ControlMode.Group/Individual`、single-group ownership、独立 Reminder cron/scanner (`ReminderSchedulerService`)、重复 Smart Frequency 状态、把 snooze 与响应延迟混为一个字段的旧模型。

## 3. 单一调度权

```text
Routine domain
  owns trigger / occurrence / session truth
        |
        v
SchedulingPort.reconcile
        |
        v
Scheduler / Temporal Engine
  owns durable wake-up / lease / retry
```

Routine 不直接创建或修改 raw ScheduleTask。temporary override 更新后只发送 owner-domain `routine:override-changed`，由既有 projection 重新 reconcile。

## 4. Method Library 与 Protocol

WallClock 方法可直接预填现有 Routine 配置；50/10 与 Pomodoro 不伪装成普通 Interval Reminder，而是进入 ProtocolSession runtime。每个 Method record 明确：方法类型、推荐参数、可编辑参数、runtime requirement、默认干预级别与 source/reference note。

## 5. 跨端一致性

Prisma 与 PowerSync 都持久化 RoutineDefinition / Profile / Membership / ProtocolSession；temporary override 也已补齐 PowerSync parity。Mobile 不伪造 Desktop-only ActiveUsage 能力；能力不可用时应显式反映 capability state。

## 6. 相关资产

- [Routine Coach vNext](../routine-coach-vnext.md)
- [ADR-059 Routine Coach](../../architecture/adr/ADR-059-routine-coach-domain-runtime-and-surfaces.md)
- [ADR-062 Single Scheduling Authority](../../architecture/adr/ADR-062-reminder-routine-single-scheduling-authority.md)
- [Method Library / AI parity evidence](../../analysis/2026-09-08-hard-7104-documentation-truth-closure.md)
- [Reminder/Routine 文件索引](../module-index/reminder-files.md)
