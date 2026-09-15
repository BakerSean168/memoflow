---
tags:
  - adr
  - time
  - timezone
  - calendar
  - vnext
description: ADR-100 - TimeContext、IANA timezone-aware Calendar/Format 与 Product Time user-context 收敛
created: 2026-09-09T00:00:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# ADR-100: Product Time Context 与 Timezone-aware Calendar

**状态：** 已采纳（待实施）
**日期：** 2026-09-09
**修订：** ADR-037 的 `TimeStyle.timeZone` 实现边界；ADR-093 的 UserTimeContext consumer contract

## 1. Decision

MemoFlow 将影响业务日历语义的状态从 presentation style 中拆出：

```text
TimeContext
├── timeZone: TimeZoneId
└── weekStartsOn: 0..6
```

所有与“用户在哪一天/哪一周/哪个本地钟面时刻”有关的 Calendar/Input/Format 行为必须显式消费 `TimeContext`。host-local timezone 不再是 server/business calculation 的隐式真值。

## 2. Why

当前已经存在 `TimeStyle.timeZone`，但：

```text
Calendar.toYmd/startOfDay/endOfDay/isSameDay/startOfWeek
Format.date/dateTime/hm
```

主要由 JS `Date` + date-fns host-local 行为实现，timezone 只在 recurrence wall-clock conversion 中显式生效。

Setting vNext 已决定：

```text
UserPreferenceProfile.regional.timeZone
-> UserTimeContextPort
```

如果 Product Time 不真正消费这个 context，同一用户在不同 host/server zone 下仍会得到不一致结果。

## 3. Target API shape

概念目标：

```ts
interface TimeContext {
  timeZone: TimeZoneId;
  weekStartsOn: Weekday;
}

interface TimeFacadeOptions {
  context: TimeContext;
  presentation?: TimePresentationStyle;
  clock?: Clock;
  engine?: TimeEngine;
}
```

具体 symbol 可以在实施期按兼容成本落地，但 canonical ownership 不变。

## 4. TimeZoneId

`TimeZoneId` 从普通 string 收敛为 validated/branded product primitive。

构造只允许：

```text
parse/validate IANA time zone
fixed/system TimeZoneSource
canonical UserTimeContext
```

不允许任意业务代码通过 cast/普通 string 创建长期 canonical zone。

## 5. Calendar invariants

以下 API 在相同 `Instant + TimeContext` 下必须跨 host 得到一致结果：

```text
toYmd
startOfDay
endOfDay
startOfWeek
isSameDay
isToday
diffCalendarDays
diffCalendarWeeks
Ymd + Hm -> Instant
```

验证必须至少覆盖：

- UTC host vs Asia/Tokyo context；
- America/New_York DST spring-forward；
- America/New_York DST fall-back；
- leap day；
- month/year boundary；
- Monday/Sunday week start。

## 6. WallClockResolutionPolicy

`Ymd + Hm + TimeZoneId -> Instant` 对 DST gap/overlap 不能继续是隐式 best-effort。

目标定义产品 policy，例如：

```text
Nonexistent local time:
  reject | shift-forward

Ambiguous local time:
  earlier | later
```

最终具体默认值必须通过 fixture 冻结；Task/Routine recurrence 和 one-time wall-clock input 使用同一 policy，禁止各模块自行决定。

## 7. User preference boundary

Preferences 拥有用户选择：

```text
regional.timeZone
regional.weekStartsOn
```

Time 拥有解释与计算。

依赖方向：

```text
Setting/host composition
  -> adapter
  -> TimeContext
  -> @memoflow/time
```

禁止 `@memoflow/time` 反向 import `@memoflow/setting`。

## 8. Explicit schedule snapshot

Task/Routine 等对象若已经保存 explicit schedule timezone snapshot：

```text
TaskPlan.schedule.timeZone
RoutineTrigger.timeZone
```

用户修改 global preference 不追溯修改历史 schedule，除非 owner domain 明确提供“跟随用户时区”语义。

## 9. Third-party boundary

可以继续复用：

- platform `Intl` IANA timezone；
- date-fns calendar arithmetic；
- `rrule` recurrence generation；
- `@internationalized/date` UI adapter。

但 third-party timezone/DST types 不进入 owner contracts。

## 10. Protected contracts

- `Instant / Ymd / Hm`；
- `Clock` injection；
- `RecurrenceEnginePort`；
- date-fns direct-import governance；
- owner-domain schedule semantics；
- ADR-093 UserTimeContext single source。

## 11. Acceptance

实施完成后：

```text
server TZ=UTC
client/user TZ=Asia/Tokyo
```

和：

```text
server TZ=America/Los_Angeles
same user TZ=Asia/Tokyo
```

对于同一 Instant/TimeContext 必须产生相同 `Ymd`, day/week boundary, recurrence wall-time result。
