---
tags:
  - adr
  - task
  - reminder
  - scheduler
description: Task Reminder Policy 多 trigger 语义与 Prisma/PowerSync 单轨持久化，删除只保存 triggers[0] 的失真实现
created: 2026-09-08T19:15:00+08:00
updated: 2026-09-08T19:15:00+08:00
---

# ADR-074: Task Reminder Policy 与 Persistence Parity

**状态：** 已采纳（实施中）
**日期：** 2026-09-08
**关联：** ADR-061、ADR-062、ADR-063

## 1. 当前缺陷

Domain/UI 允许最多多个 reminder triggers，但 Prisma/PowerSync mapper 当前只持久化 `triggers[0]` 的 relative offset/unit。Absolute trigger 与第二个及以后 trigger 会丢失。

这是 contract/domain/persistence vertical mismatch，必须删除。

## 2. 决策

TaskPlan 使用：

```text
reminderPolicy?
├── enabled
└── triggers[]
    ├── Relative { value, unit }
    └── Absolute { at: Instant }
```

所有 trigger 必须全量 round-trip。

## 3. Persistence

采用单一 canonical JSON 字段保存完整 policy；旧展开列：

```text
reminder_config_enabled
reminder_config_time_offset_minutes
reminder_config_unit
reminder_config_channel
```

完成迁移后删除，不长期双写。

Prisma / PowerSync 使用同一 serializer/validator fixture，必须验证：

- 0 trigger disabled；
- 1 relative；
- 2+ mixed triggers；
- absolute；
- round-trip 保序；
- invalid trigger fail closed。

## 4. Scheduling authority

TaskPlan 只拥有“希望何时提醒”的 policy；真正 temporal scheduling 仍通过 SchedulingPort / Scheduler handler registry，Task 不恢复 cron/worker authority。
