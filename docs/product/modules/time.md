---
tags:
  - product
  - module
  - time
  - foundation
description: Product Time foundation 当前能力与 Time vNext 收敛边界
created: 2026-09-09T00:00:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# Time Foundation 模块说明

> **ADR-111 cutover policy (2026-09-09):** 当前没有需要保留的 MemoFlow 旧业务数据，也不要求兼容旧客户端/旧备份。本文历史推演中仅为旧数据保存设计的 migration/backfill/compatibility window 不再执行；目标模型和真实行为不变量继续有效。实施采用 direct canonical cutover + old-surface deletion + reset/reseed。

## 1. 定位

`@memoflow/time` 不是 Goal/Task 的私有工具包，而是 MemoFlow 全产品共享的 Product Time foundation。

它负责：

```text
Instant / Ymd / Hm behavior
Clock
Codec
Calendar
Timezone conversion
Format / Input
RecurrenceEnginePort
```

它不拥有 Goal target、Task schedule、Routine trigger、Planner occupancy 或 Scheduler invocation。

## 2. 当前已实施

- ADR-037 Product Time；
- branded `Instant / Ymd / Hm` primitives；
- `TimeFacade`；
- date-fns engine boundary；
- branded `TimeZoneId`、`TimeZoneSource` 与 validated `TimeContext` boundary；
- `TimePresentationStyle` 已建立；legacy `TimeStyle` adapter 是 ADR-111 下待立即删除的实现残留，不再承担兼容职责；
- `TimeFacade.context/presentation/withContext/withPresentation`；
- locale/timezone-aware `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat` presentation；
- semantic `dateStyle: short|medium|long` 与 `timeStyle: 12h|24h`；
- fixed chart/export pattern 通过内部 date-fns engine + 官方 `@date-fns/tz` `TZDateMini` 处理显式 IANA zone；
- `RecurrenceEnginePort + rrule` adapter；
- recurrence conformance / fixed clock / boundary tests；
- direct date-fns import治理。

## 3. 2026-09-09 vNext convergence

ADR-100/101 冻结第二轮目标：

```text
TimeStyle mixed state
  -> TimeContext + TimePresentationStyle

host-local calendar
  -> timezone-aware calendar

TimeZoneId string
  -> validated/branded TimeZoneId

Instant | number canonical APIs
  -> Instant canonical + boundary compatibility
```

TIME-1201/1202/1203/1204 已实施；canonical Calendar/Input/Codec 已使用显式 TimeContext 与共享 wall-clock resolver，Format 也已经按 locale + IANA timezone + semantic date/time style 渲染。跨模块 UserTimeContext 注入与 legacy Date/number/TimeStyle surface 由 TIME-1205/1206 继续直接删除。

## 4. Primary consumers

```text
Goal
Task
Routine/Reminder
Planner/Schedule
Notification
Setting/UserTimeContext
AI Context
Web/Desktop/Mobile presentation
Persistence mappers
```

## 5. Protected rules

- business/UI 不 direct import date-fns；
- recurrence business semantics由 owner domain拥有；
- server business math不读 ambient host timezone；
- explicit schedule timezone snapshot不被 global preference静默重写；
- third-party recurrence/timezone types不进入业务 contract。

## 6. Related docs

- [ADR-037](../../architecture/adr/ADR-037-product-time-system.md)
- [ADR-100](../../architecture/adr/ADR-100-product-time-context-and-timezone-aware-calendar.md)
- [ADR-101](../../architecture/adr/ADR-101-product-time-presentation-and-compatibility-surface.md)
- [Time vNext current-system map](../../analysis/2026-09-09-time-vnext-current-system-map.md)
- [Time + Label vNext foundations](../../architecture/time-label-vnext-foundations.md)
- [Time/Label reuse ledger](../../analysis/2026-09-09-time-label-reference-and-reuse-ledger.md)
- [Shared foundations active plan](../../plan/active/2026-09-09-time-label-vnext-model-convergence.md)
