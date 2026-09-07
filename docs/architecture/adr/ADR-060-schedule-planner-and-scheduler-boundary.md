---
tags:
  - adr
  - schedule
  - planner
  - scheduler
  - temporal-engine
  - calendar
  - architecture
description: 将用户可见的 Schedule/Planner 与内部 Scheduler/Temporal Engine 明确分层，避免 CalendarEntry 与后台执行队列继续共享同一产品语义
created: 2026-08-25T17:49:00+08:00
updated: 2026-09-07T15:20:00+08:00
---

# ADR-060: Schedule / Planner 与 Scheduler / Temporal Engine 分离

**状态：** 已采纳并实施
**日期：** 2026-08-25  
**影响范围：** schedule、scheduler、schedule-orchestration、patterns、task、goal、reminder、notification、app-vue、app-react、api、desktop、contracts、database
**关联：** ADR-003、ADR-025、ADR-033、ADR-037、ADR-042、ADR-058、ADR-059、ADR-061~063

## 1. 背景

在本 ADR 编写时，MemoFlow 的 `packages/schedule` 同时承载两类本质不同的能力：

1. **用户可见的时间规划产品**
   - `CalendarEntry`；
   - 日 / 周 / 月视图；
   - 时间块、地点、参与者、优先级；
   - 冲突检测与冲突解决；
   - Task / Goal 等来源的统一日历展示。
2. **系统内部的时间执行基础设施**
   - `ScheduleTask`；
   - `ScheduleExecution`；
   - `ScheduleLease`；
   - `nextRunAt`、cron、retry/backoff、timeout；
   - 最小堆 + 单 next timer 的运行队列；
   - worker claim、失败恢复、执行历史。

这两类能力在早期被放到一个模块有现实原因：都与“时间”有关，而且用户的日历规划、Task/Goal Reminder 和后台执行都需要共享时间基础设施。

但随着 Goal / Task / Reminder / Notification 的业务边界逐渐清晰，继续把两者称为同一个“Schedule Domain”会产生以下问题：

- 用户以为“日历里的一个计划”与“系统内部的一条 job”是同一种实体；
- `ScheduleTask` 的 retry、lease、timeout、source module 等基础设施概念可能泄漏到产品 API；
- Calendar/Planner 的拖拽、冲突、时间块等交互容易误改后台执行事实；
- Scheduler 为了执行 Goal/Task/Reminder，逐渐认识越来越多业务模块；
- 未来新增 Habit、AI、Wallet、Knowledge 等定时动作时，需要修改中央枚举和 router；
- Schedule 前端与后台执行队列的演进速度、稳定性要求和测试维度完全不同。

因此需要明确：**“用户怎么看和安排时间”与“系统什么时候执行某个 handler”不是一个 bounded context。**

## 2. 决策摘要

MemoFlow 采用以下正式术语和边界：

```text
Schedule / Calendar / Planner
  = 用户可见的时间规划产品领域

Scheduler / Temporal Engine
  = 内部的时间触发与可靠执行基础设施

Reminder / Routine Coach
  = 何时、为什么需要提醒/干预的业务语义

Notification
  = 消息如何形成用户可见事实、并通过哪些渠道抵达用户
```

一句话：

> **Calendar 管“用户怎么看和安排时间”，Scheduler 管“系统什么时候执行”，Reminder 管“什么时候需要提醒/干预”，Notification 管“消息如何抵达用户”。**

逻辑边界先行；在语义所有权稳定后再执行物理 package 拆分。该 Phase B 物理拆分已于 2026-09-07 完成。

## 3. 当前系统事实

### 3.1 Schedule 产品面

当前 `Schedule` Prisma 模型保存用户可见 Calendar Entry，包含：

- title / description；
- startTime / endTime / duration；
- location / attendees / priority；
- hasConflict / conflictingSchedules；
- version / timestamps。

前端 `packages/app-vue/src/modules/schedule/composables/useCalendarView.ts` 已经把 Schedule 当成一个聚合时间视图：

- 读取 `calendarEntries`；
- 将 TaskInstance 转成 CalendarEventItem；
- 类型层已经预留 `goal` source。

这说明产品层正在自然演化为 **Planner / Calendar Read Model**，方向正确。

### 3.2 Scheduler 基础设施面

当前 `ScheduleTask` 保存：

- `sourceModule` / `sourceEntityId`；
- enabled / status；
- cron / timezone / startDate / endDate / maxExecutions；
- nextRunAt / lastRunAt / executionCount；
- consecutiveFailures；
- retry policy；
- payload / tags / priority / timeout。

配套还有：

- `ScheduleExecution`；
- `ScheduleLease`；
- rebuild/domain-event outbox；
- queue runtime；
- scheduler host mutual exclusion。

这些明显属于后台执行平台，而不是普通个人日历产品对象。

## 4. North Star

```text
                       ┌──────────────────────────┐
                       │ Schedule / Planner UI    │
                       │ day / week / month       │
                       │ time block / conflict    │
                       └────────────┬─────────────┘
                                    │ read model / owner command
          ┌─────────────────────────┼──────────────────────────┐
          │                         │                          │
          v                         v                          v
       Task Domain              Goal Domain             Routine/Reminder
          │                         │                          │
          └──────────────┬──────────┴──────────────┬───────────┘
                         │ scheduling intents       │ calendar projections
                         v                          v
                 ┌────────────────┐          Planner Read Model
                 │ Scheduler      │
                 │ Temporal Engine│
                 └───────┬────────┘
                         │ handlerKey
                         v
                  Domain Handler
                         │
                         └── optional NotificationRequested
```

关键点：

- Planner 可以展示来自 Task / Goal / Routine 的时间事实，但不拥有这些业务实体；
- Scheduler 只执行内部 invocation，不是用户日历的数据源真相；
- 一个业务对象既可以出现在 Planner，也可以产生 Scheduler invocation，但两种 projection 完全独立。

## 5. Schedule / Planner 的职责

### 5.1 拥有

- 用户手工创建的时间块 / Calendar Entry；
- 日 / 周 / 月 / agenda 等视图；
- Planner layout；
- 用户可理解的时间冲突；
- Calendar Entry 本身的 drag / resize；
- 跨模块 Calendar Projection 的统一展示 contract；
- planner-specific preference，例如首日、密度、可见来源。

### 5.2 不拥有

- Task completion / recurrence business truth；
- Goal/KR completion；
- Routine trigger semantics；
- Notification delivery；
- retry / dead letter / worker lease；
- 任意业务模块的后台命令实现。

### 5.3 跨模块事件的操作规则

当 Planner 展示一个 Task 时：

```text
用户拖动 Task 到 15:00
        ↓
Planner 识别 owner = Task
        ↓
调用 Task application command / port
        ↓
Task 修改自己的时间配置
        ↓
Task event
        ↓
Planner read model + Scheduler projection 各自更新
```

禁止：

```text
Calendar UI
  -> 直接 UPDATE ScheduleTask.nextRunAt
```

因为那会绕过 Task Domain。

## 6. Scheduler / Temporal Engine 的职责

### 6.1 拥有

- `runAt` / recurrence 解析后的下一次执行时间；
- durable invocation persistence；
- claim / lease / fencing；
- retry / backoff / timeout；
- execution receipt / history；
- missed-run / restart recovery；
- worker concurrency；
- dead-letter / replay；
- handler dispatch；
- observability。

### 6.2 不拥有

- “Goal 提前 7 天”的解释；
- “Task 开始前 30 分钟”的解释；
- “40 分钟 ActiveUsage 后站立”的解释；
- “免打扰是否应该发 Push”的解释；
- 用户日历冲突的产品规则。

这些分别属于 Goal / Task / Routine / Notification / Planner。

## 7. Scheduler 数据模型原则

长期内部模型应从业务感知的 `ScheduleTask` 收敛为 neutral invocation：

```ts
interface ScheduledInvocation {
  id: string;
  identityId: string;
  schedulingKey: string;
  ownerType: string;
  ownerId: string;
  handlerKey: string;
  runAt: Instant;
  payload: unknown;
  sourceRevision?: number | string;
  retryPolicy: RetryPolicy;
  status: ScheduledInvocationStatus;
}
```

其中：

- `schedulingKey` = 业务意图的稳定身份；
- `handlerKey` = 运行时分发身份；
- `ownerType/ownerId` = 可观测、查询、reconcile 元数据；
- 不再用 `SourceModule` 决定执行行为。

是否继续沿用 `ScheduleTask` 类名属于迁移实现细节；语义必须先变成内部 invocation。

## 8. 时间语义

遵循 ADR-037：

- 真正执行点以 `Instant` 保存；
- one-shot invocation 的 `runAt` 是绝对瞬时；
- timezone 只用于解释用户 wall-clock / recurrence；
- recurrence 必须使用 IANA timezone；
- 禁止业务 projection 静默 fallback 到固定 `Asia/Shanghai`；
- timezone 由明确的 source configuration / product time policy 解析后传入；
- DST 行为必须通过成熟时间库或经过充分测试的 engine 处理。

## 9. 物理 package 迁移策略与实施状态

原决策要求先完成语义收敛，再执行物理拆分。2026-09-07，`CLEAN-6304` 证明语义所有权已稳定，因此 Phase B 已完成：

```text
packages/schedule         = Planner / Calendar
packages/scheduler        = Scheduler / Temporal Engine
packages/schedule-orchestration
  = owner-domain projection + handler-registry integration
```

当前物理边界：

- `@memoflow/schedule` 只拥有 CalendarEntry、冲突检测/解决、Planner/Calendar client/transport，以及 rebuild/domain-event outbox 等 Calendar reliability operation；
- `@memoflow/scheduler` 拥有 ScheduleTask、ScheduleExecution、Prisma/PowerSync worker repositories、lease coordinator、queue/runtime、SchedulingPort adapter、Handler Registry 与只读 worker diagnostics client/API/IPC；
- `@memoflow/patterns/lease` 提供纯 `LeaseCoordinatorPort + LeaseLostError`，Calendar reliability worker 只依赖该抽象；具体 ScheduleLease persistence/coordinator 留在 Scheduler；
- API 与 Desktop composition root 分别创建 Calendar repository set 与 Scheduler repository set，并注册 sibling module handles；外部既有 `/schedules` HTTP/IPC contract 保持兼容，ownership 在包内分离；
- App-Vue 的普通 Planner 不再持有 raw ScheduleTask diagnostics state；App-React 的 worker diagnostics 改由 `SchedulerClientPort` 注入；
- `scope:scheduler` 已加入 Nx/ESLint/governance scope matrix 与 target baseline，防止未来把 worker internals 搬回 `schedule`。

这次迁移不重命名数据库表或公开 schedule contract；数据库 schema/DTO 仍可保留历史 `schedule_*` 命名，物理 package ownership 已独立。若未来需要 contract namespace 重命名，应另开 ADR/ticket，不能混入 Scheduler runtime 变更。

## 10. 受保护契约

重构必须保护：

1. 已有 Schedule queue 的 restart recovery；
2. lease / claim / retry / execution history；
3. API 与 Desktop 两宿主的行为 parity；
4. Task / Goal / Reminder 到点前后都重新检查当前业务状态；
5. Planner 的日/周/月用户路径；
6. PowerSync / Prisma 双 adapter 的数据隔离；
7. ADR-037 的 Product Time 类型与转换边界。

## 11. 不采用的方案

### 11.1 合并 CalendarEntry 与 ScheduleTask

不采用。二者生命周期和 owner 不同，强行统一会让 retry/lease 泄漏到日历产品，也会让 Planner 操作误改 job。

### 11.2 删除 Schedule 产品页，只保留后台 Scheduler

不采用。用户已经需要真正的个人 Planner/Calendar，而且前端已形成跨模块聚合方向。

### 11.3 所有时间行为都做成 cron

不采用。Task/Goal/Routine 的 recurrence 和 exception 属于各自业务语义，Scheduler 只接收已经解释后的 invocation。

## 12. OSS 借鉴

- **Super Productivity**：借 Planner / Schedule / Timeboxing / recurring task UI 与交互；
- **Trigger.dev**：借 task identity、schedule 绑定、timezone、deduplication、dashboard observability；
- **pg-boss**：借 PostgreSQL worker claim、retry/backoff/dead-letter、queue policy；
- **Vikunja**：借 Task date/reminder/repeat 的业务语义；
- **Novu**：借 Notification workflow / preference，不把 Notification 逻辑塞回 Scheduler。

详见 `docs/analysis/2026-08-25-scheduling-notification-oss-study.md`。

## 13. 验收标准

- 文档和 contract 明确区分 Planner 与 Scheduler；
- 产品 API 不再要求普通用户理解 retry/lease/sourceModule；
- Planner 对 Task/Goal/Routine 的编辑通过 owner command，而不是直接修改 Scheduler invocation；
- Scheduler 能接入一个全新模块而无需添加中央 `SourceModule` switch；
- one-shot runAt 使用 Instant，recurrence timezone 无硬编码 Shanghai；
- Planner 和 Scheduler 可分别测试、替换和演进。
