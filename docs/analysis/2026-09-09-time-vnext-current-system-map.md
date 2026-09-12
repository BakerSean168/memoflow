---
tags:
  - analysis
  - time
  - vnext
  - current-system
description: Time vNext 当前系统地图——Product Time primitives、Facade、timezone、calendar、format、recurrence 与跨模块依赖证据
created: 2026-09-09T00:00:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# Time vNext Current System Map

## 1. Executive conclusion

`@memoflow/time` 的抽取方向正确，它已经是 MemoFlow 的 Product Time foundation，而不是 Goal/Task 私有工具集合。当前需要的是第二轮模型收敛，不是重写。

当前已经正确的核心资产：

- `Instant / Ymd / Hm` 产品 primitive；
- `Clock / Codec / Calendar / Format / Input` Facade；
- `RecurrenceEnginePort` 对第三方 `rrule` 的隔离；
- `date-fns` 业务直连治理；
- IANA `TimeZoneSource`；
- recurrence 的显式 timezone 输入；
- fixed clock / conformance / third-party-boundary tests。

当前最重要的 gap 是：**模型已经声明 `TimeStyle.timeZone`，但大部分 Calendar/Format 实现仍以 host-local `Date` / date-fns 作为实际时区语义。** Setting vNext 引入 canonical user timezone 后，这个 gap 会从实现细节升级为跨模块业务一致性风险。

## 2. Current package role

```text
@memoflow/contracts primitives
├── Instant
├── TransferDate
├── Ymd
├── Hm
└── Duration
        │
        ▼
@memoflow/time
├── Clock
├── Codec
├── Format
├── Input
├── Calendar
├── TimeZoneSource
└── RecurrenceEnginePort
        │
        ▼
Goal / Task / Routine / Reminder / Planner / UI / Account ...
```

当前直接依赖 `@memoflow/time` 的生产面已经覆盖 Goal、Task、Reminder/Routine、Planner UI、Account profile、Desktop runtime 与 shared UI date fields。

## 3. Current facts

### 3.1 Canonical primitives

ADR-037 已确立：

```text
Instant = absolute epoch-ms instant
Ymd     = local calendar date
Hm      = local wall-clock time
```

`DomainDate = Date` 已退役。JS `Date` 只应作为 boundary/engine implementation detail。

### 3.2 Facade

当前 `TimeFacade`：

```text
style
clock
codec
format
input
calendar
engine
```

支持 `withStyle / withClock / withEngine`，测试和宿主注入 seam 清楚。

### 3.3 Engine ownership

`packages/time/src/engine/date-fns-engine.ts` 是 date-fns canonical importer。全仓检索未发现 `packages/time` 外的生产 `date-fns` import，说明治理目标已经基本达成。

### 3.4 Recurrence

`RecurrenceEnginePort` 是 MemoFlow-owned contract：

```text
startDate: Ymd
localTime: Hm
timeZone: TimeZoneId
frequency
interval
byWeekday
count
until
```

`rrule@2.8.1` 类型终止在 adapter 文件，产品层不直接依赖 RRule/Options/Weekday。

### 3.5 Timezone utilities

当前存在：

```text
TimeZoneSource
isIanaTimeZoneId()
createSystemTimeZoneSource()
createFixedTimeZoneSource()
resolveTimeZoneId()
```

Recurrence wall-clock -> Instant 已显式传入 IANA zone。

## 4. Observed gaps

### TIME-G1 — `TimeStyle.timeZone` 没有真正贯穿 Calendar/Format

Observed：

- `TimeStyle` 有 `timeZone`；
- `createCalendar(style, engine, clock)` 只把 `weekStartsOn` 传给 engine；
- `DateFnsEngine.toYmd/startOfDay/endOfDay/isSameDay/startOfWeek/format*` 使用 host-local `Date`/date-fns；
- `formatDate/formatDateTime` 的 `locale` 参数也没有完整生效。

Desired：

```text
TimeContext.timeZone
  -> Calendar / Input / wall-clock conversion / user-relative queries

PresentationStyle.locale/time style
  -> Format
```

Impact：服务器宿主 timezone 与用户 preference 不同的情况下，`today`、day boundary、date formatting、week boundary 可能与用户语义不一致。

### TIME-G2 — Presentation Style 与 Business Time Context 混合

当前 `TimeStyle` 同时包含：

```text
locale / display / empty / relative / duration  // presentation
timeZone / weekStartsOn                         // business/calendar context
```

这使“换显示风格”和“换业务日界”通过同一个 `withStyle()` seam 发生，语义过宽。

### TIME-G3 — `TimeZoneId = string`

虽然 runtime 有 IANA validator，但 compile-time 仍允许任意 string 冒充 canonical zone。

### TIME-G4 — Canonical API 仍大量接受裸 `number`

例如 Calendar/Format 接收：

```text
Instant | number
```

这是迁移期兼容面，但长期削弱 branded primitive 的防错价值。

### TIME-G5 — `Date` compatibility helper 仍暴露在 public format surface

`dateToYmd(date: Date)` 属于 legacy/boundary helper，不应成为长期产品 facade 的首选 API。

### TIME-G6 — Locale contract 与实现漂移

`formatDate/formatDateTime` 接受 locale，但 date-fns implementation 使用固定 pattern，长格式含固定中文字符；`locale=en-US` 并不能保证产品显示完全符合 locale。

### TIME-G7 — DST gap/overlap policy 未形成显式产品 contract

`combineYmdHmWithTimeZone()` 对 DST gap 使用 best-effort resolve；Recurrence fixture 已覆盖 DST，但产品层尚未明确：

```text
nonexistent local time
ambiguous local time
```

应选择 reject、shift-forward、earlier/later 中哪一种政策。

## 5. Protected assets

第二轮收敛不得破坏：

1. `Instant / Ymd / Hm` 语义；
2. `@memoflow/time` 单一 product time package；
3. `RecurrenceEnginePort` 与第三方 adapter isolation；
4. `Clock` 可注入与 deterministic tests；
5. date-fns direct-import governance；
6. Prisma/PowerSync mapper 只在 boundary 转换；
7. Task/Routine 等 owner domain 自己拥有 schedule/trigger，不让 Time 反向拥有业务实体；
8. explicit schedule timezone snapshot 不因用户 preference 修改被静默追溯改写。

## 6. Current → target mapping

| Current                                | Target                                                     |
| -------------------------------------- | ---------------------------------------------------------- |
| `TimeStyle` mixed context/presentation | `TimeContext + TimePresentationStyle`                      |
| `TimeZoneId = string`                  | branded/validated `TimeZoneId`                             |
| host-local Calendar engine             | timezone-aware Calendar semantics                          |
| fixed-pattern locale handling          | locale-aware presentation implementation                   |
| `Instant                               | number` public convenience                                 | canonical `Instant`, boundary adapters for raw number |
| `dateToYmd(Date)` product convenience  | boundary compatibility helper, then retire/publicly narrow |
| implicit DST best-effort               | explicit `WallClockResolutionPolicy`                       |

## 7. Not a target

本轮不做：

- 把 Task/Routine recurrence business model搬进 Time；
- 自研 timezone database；
- 自研 recurrence engine；
- 引入 Moment/Day.js 平行体系；
- 强制采用 Temporal 作为前置；
- 把所有 duration/format 文案塞进 Time。

## 8. Evidence paths

- `docs/architecture/adr/ADR-037-product-time-system.md`
- `docs/architecture/product-time-system.md`
- `packages/time/src/types.ts`
- `packages/time/src/facade.ts`
- `packages/time/src/engine/date-fns-engine.ts`
- `packages/time/src/calendar/calendar.ts`
- `packages/time/src/format/format.ts`
- `packages/time/src/timezone/time-zone.ts`
- `packages/time/src/recurrence/*`
- `tools/governance/time-registry.json`
