---
tags:
  - adr
  - schedule
  - planner
  - calendar
  - occupancy
  - conflict
description: 将 CalendarEntry 收敛为用户自有时间块，采用 Timed/AllDay Range Algebra，并将 duration/conflict cache/priority 从聚合真值中移出，以统一 Planner occupancy 与跨来源冲突模型
created: 2026-09-08T20:45:00+08:00
updated: 2026-09-08T20:45:00+08:00
---

# ADR-080: Planner Calendar Range、Occupancy 与 Conflict Model

**状态：** 已采纳（待实施）  
**日期：** 2026-09-08  
**影响范围：** schedule、contracts、database、PowerSync、app-vue Planner、Goal/Task/Routine calendar projection  
**修订：** 在 ADR-060 已完成 Schedule/Scheduler bounded-context 分离的基础上，继续收敛 Planner 产品模型  
**关联：** ADR-037、ADR-053、ADR-057、ADR-060、ADR-067、ADR-071~~075、ADR-076~~079、ADR-081~083

## 1. 决策摘要

`@memoflow/schedule` 的长期产品模型固定为：

```text
CalendarEntry
= 用户直接拥有并可编辑的一段 Calendar/Planner 时间事实
```

Planner 本身是跨 owner 的读模型：

```text
CalendarEntry
TaskOccurrence
Goal temporal marker
RoutineOccurrence
future external calendar event
        ↓
PlannerEventProjection[]
        ↓
Planner UI / Occupancy / Conflict
```

本 ADR 决定：

1. `CalendarEntry` 的时间从 `startTime/endTime` 收敛为 `CalendarEntryRange = Timed | AllDay`；
2. `duration` 不再持久化，永远由 range 推导；
3. `hasConflict/conflictingEntries` 不再属于 CalendarEntry aggregate business state；
4. Planner projection 新增显式 `occupancy` 语义，区分 blocking / non-blocking / marker；
5. 冲突检测从“Schedule 表内部两两比较”升级为对 Planner blocking occupancy 的跨来源计算；
6. CalendarEntry `priority: 1..5` 退役，不再维持 Planner 专属优先级量表；
7. `location` 保留，`participants` 保持 optional context；
8. Planner owner command 始终路由回真实 owner domain，不直接修改 projection 或 Scheduler persistence。

## 2. 当前系统事实

当前 `CalendarEntryState` 同时保存：

```text
id / identityId
name/title / description
startTime / endTime / duration
hasConflict / conflictingEntries
priority
location / attendees
version / timestamps
```

同时 `CalendarEventProjection` 已经能表达：

```text
sourceType = schedule | task | goal | routine
Timed range = Instant + optional end
AllDay range = Ymd + optional end
ownerCommandTarget
revision
editableCapabilities
```

因此当前系统已经出现一个明确的不对称：

- Planner read contract 已经支持 Product Time 的 `Instant/Ymd` 双语义；
- CalendarEntry aggregate 仍只支持 timed `startTime/endTime`；
- conflict cache 已被 repository 注释为 projection，但仍进入 aggregate state；
- Task/Goal/Routine 已进入 Planner projection，但 conflict engine 仍主要只查询 `schedules` 表。

## 3. North Star

```text
                           Planner
                              │
                 ┌────────────┴────────────┐
                 │                         │
        User-owned entries          Owner projections
                 │                         │
          CalendarEntry        Task / Goal / Routine
                 │                         │
                 └────────────┬────────────┘
                              ▼
                   PlannerEventProjection
                              │
                 ┌────────────┼────────────┐
                 ▼            ▼            ▼
              Render       Occupancy     Commands
                              │            │
                              ▼            ▼
                       Conflict Engine   owner domain
```

Planner 不成为 Goal/Task/Routine 的写入 owner。

## 4. Canonical CalendarEntry

目标模型：

```text
CalendarEntry
│
├── identity
│   ├── id
│   └── identityId
│
├── content
│   ├── title
│   └── description?
│
├── range
│   ├── Timed
│   │   ├── start: Instant
│   │   └── end: Instant
│   │
│   └── AllDay
│       ├── start: Ymd
│       └── end?: Ymd
│
├── context
│   ├── location?
│   └── participants[]?
│
└── system
    ├── version
    ├── createdAt
    └── updatedAt
```

### 4.1 Range Algebra

```ts
type CalendarEntryRange =
  | {
      readonly kind: 'Timed';
      readonly start: Instant;
      readonly end: Instant;
    }
  | {
      readonly kind: 'AllDay';
      readonly start: Ymd;
      readonly end: Ymd | null;
    };
```

不变量：

- Timed: `start < end`；
- AllDay: `end == null || start <= end`；
- `Ymd` 不通过伪造午夜 UTC Instant 表示；
- CalendarEntry 不自己重新实现 timezone/day conversion，统一使用 ADR-037 Product Time。

## 5. 删除持久化 `duration`

`duration` 完全由：

```text
end - start
```

推导。

继续同时保存：

```text
start
end
duration
```

会形成冗余真值。

目标：

```diff
 CalendarEntry
   range
-  duration persisted
+  duration derived on read when UI needs it
```

如果 API 为兼容旧客户端短期仍返回 `duration`，它只能是 response projection，不得继续作为 persistence/domain authority。

## 6. Conflict 不属于 CalendarEntry Aggregate

当前字段：

```text
hasConflict
conflictingEntries[]
```

依赖其它事件是否存在，因此不是 CalendarEntry 自身事实。

例如：

```text
A = 14:00-15:00
B = 14:30-16:00
```

B 被删除后，A 完全没有发生 business mutation，但 A 的 conflict 状态应立即改变。

因此：

```diff
 CalendarEntryState
- hasConflict
- conflictingEntries
```

目标 read model：

```text
PlannerConflictProjection
├── leftSource
├── rightSource
├── overlapRange
├── overlapDuration
├── severity
└── suggestions[]
```

旧 `ScheduleRebuildOutbox` / conflict cache reliability 只能作为迁移阶段的兼容 projection 资产；最终不再污染 CalendarEntry aggregate revision。

## 7. Planner Occupancy

并非所有 Planner event 都“占用时间”。

正式引入：

```ts
type PlannerOccupancy = 'blocking' | 'non-blocking' | 'marker';
```

语义：

| Occupancy      | 含义                                        | 示例                                |
| -------------- | ------------------------------------------- | ----------------------------------- |
| `blocking`     | 这段时间真实被占用，可参与时间冲突          | 医院预约、会议、明确 TimeRange Task |
| `non-blocking` | 在 Planner 中有时间归属，但不应阻止其他安排 | All-day 待办、宽松计划              |
| `marker`       | 仅是 temporal marker，不表示时间占用        | Goal Target、Routine 提醒点         |

冲突 engine 只将：

```text
blocking ↔ blocking
```

作为硬冲突候选。

未来可以在产品层扩展 soft overlap / warning policy，但不得用“是否在 Calendar 上”推断“是否占用时间”。

## 8. PlannerEventProjection VNext

目标读模型：

```ts
interface PlannerEventProjection {
  identityId: string;

  sourceType: PlannerSourceType;
  sourceId: string;

  title: string;
  range: PlannerEventRange;
  occupancy: PlannerOccupancy;

  displayMetadata: PlannerDisplayMetadata;
  editableCapabilities: PlannerEditableCapabilities;
  ownerCommandTarget: PlannerOwnerCommandTarget;

  revision: number;
}
```

其中：

- `sourceId` 是 projection fact identity，不是 Scheduler invocation ID；
- `ownerCommandTarget` 决定 mutation 路由；
- `revision` 由真实 owner 提供 optimistic concurrency；
- `displayMetadata` 只用于展示，不成为 owner domain truth。

## 9. Goal / Task / Routine 映射

### Goal

Goal vNext：

```text
start
TargetTimeframe
```

Planner 不再使用：

```text
goal-deadline
dueDate
```

目标语义：

```text
goal-start
goal-target
```

`goal-target` 默认：

```text
occupancy = marker
```

季度/月/年 Target 不得伪装成某一天的硬 deadline，也不得将整个月/季度都标成 blocking。

### Task

Task vNext 使用 `TaskOccurrence`：

```text
AllDay     -> non-blocking by default
TimePoint  -> marker or non-blocking depending product policy
TimeRange  -> blocking by default
```

owner command target 从历史 `task.instance` 收敛为：

```text
task.occurrence
```

### Routine

WallClock occurrence 默认：

```text
occupancy = marker
```

除非未来某个 Protocol Session 明确占用一段 Focus/Break 时间，普通 Routine reminder 不应制造 calendar blocking conflict。

## 10. CalendarEntry Priority 退役

当前 CalendarEntry `priority` 存在多重问题：

- domain/contracts 约束 1~5；
- UI 曾出现 0~10 量表；
- conflict algorithm 并不使用它；
- 它与 Task `importance`、Scheduler `SchedulingPriority` 是三个不同概念。

因此正式退役 Calendar 专属：

```text
priority: number
```

未来若 Calendar Entry 真正需要用户表达重要性，应单独采用与 Shared product semantics 对齐的 `importance` 决策，不复活匿名数值量表。

Scheduler `SchedulingPriority` 与此完全无关，继续保留。

## 11. Location 与 Participants

### 保留 `location`

它是 Calendar Entry 的自然上下文。

### `attendees` 规范化为 `participants` 方向

长期目标：

```ts
interface CalendarParticipant {
  readonly name?: string;
  readonly email?: string;
  readonly externalId?: string;
}
```

但 participants 不是本轮必须引入的复杂协作系统。当前 string/email 列表可以作为迁移输入；在 external calendar integration 前不扩展 RSVP/organizer/meeting-provider ownership。

## 12. Owner Command Rule

Planner mutation 永远遵循：

```text
Planner drag/resize
      ↓
read ownerCommandTarget
      ↓
owner application port
      ↓
owner domain mutation
      ↓
new owner revision
      ↓
Planner projection refreshed
```

禁止：

```text
Planner -> UPDATE read projection
Planner -> UPDATE Scheduler invocation
Planner -> bypass Task/Goal/Routine domain
```

## 13. Conflict Engine 目标边界

未来 conflict pipeline：

```text
Planner source adapters
       ↓
PlannerEventProjection[]
       ↓
filter occupancy=blocking
       ↓
Conflict Engine
       ↓
PlannerConflictProjection[]
```

这允许一个真实时间冲突发生在：

```text
CalendarEntry ↔ TaskOccurrence
TaskOccurrence ↔ TaskOccurrence
CalendarEntry ↔ external calendar event
```

而不局限于 `Schedule` 表内部。

## 14. Protected Contracts

实施时必须保护：

- ADR-037 `Instant / Ymd / Hm` Product Time；
- Planner 与 Scheduler invocation 双 projection 分离；
- owner command routing；
- optimistic concurrency `revision/expectedVersion`；
- Prisma / PowerSync parity；
- Calendar domain-event/outbox/rebuild reliability 在迁移期间不可无证据删除；
- API/Desktop transport parity；
- Task/Goal/Routine 仍拥有各自业务时间语义。

## 15. 明确非目标

本 ADR 不决定：

- Google Calendar / Outlook sync；
- meeting invitation/RSVP；
- automatic AI calendar optimization；
- resource booking；
- multi-user shared calendar；
- Scheduler worker priority；
- Task importance 语义。

## 16. Migration Direction

建议未来实施顺序：

```text
1. characterization current CalendarEntry + Planner projection
2. add CalendarEntryRange / occupancy contracts
3. make Planner conflict consume occupancy projections
4. migrate CalendarEntry persistence to range truth
5. make duration response-derived
6. move conflict fields out of aggregate truth
7. retire calendar priority
8. update Goal/Task/Routine projection semantics
9. remove legacy conflict/cache fields only after parity evidence
```

本 ADR 只冻结方向，不授权当前文档变更直接执行 migration。

## 17. Acceptance Model

未来实现完成后必须能证明：

1. CalendarEntry 支持 Timed 与 AllDay；
2. 数据库不存在可与 range 冲突的独立 duration truth；
3. CalendarEntry aggregate 不保存其它事件推导出来的 conflict truth；
4. Task TimeRange 可以与 CalendarEntry 形成真实 Planner conflict；
5. Goal target marker 不制造 blocking conflict；
6. Planner drag/resize 仍通过 owner command；
7. Planner 代码无法读取或写入 Scheduler invocation persistence。
