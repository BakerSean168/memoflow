---
tags:
  - product
  - module
  - schedule
description: Planner / Calendar 产品模块与 Scheduler 边界说明
created: 2026-06-02T00:00:00
updated: 2026-09-17T22:45:00+08:00
---

# 日程模块说明

> **当前边界（2026-09-17）：** `@memoflow/schedule` 是用户可见的 **Planner / Calendar**；`@memoflow/scheduler` 以 `ScheduledInvocation + InvocationAttempt`、queue、lease、retry/recovery 作为 **Temporal Engine** 真值。Legacy `ScheduleTask / ScheduleExecution / ScheduleConfig / SourceModule` 已由 S4-2302B 破坏式退休。业务模块通过 `ScheduledIntent + SchedulingPort.reconcile` 接入 Scheduler，不直接把 invocation persistence 当成产品对象。详见 [Scheduling / Notification vNext](../scheduling-notification-vnext.md)、[ADR-060](../../architecture/adr/ADR-060-schedule-planner-and-scheduler-boundary.md)、[ADR-061](../../architecture/adr/ADR-061-business-module-scheduling-port-and-handler-registry.md)。

## 1. 功能定位

`@memoflow/schedule` 负责“用户怎么看和安排时间”：CalendarEntry、日/周/月 Planner、冲突检测/解决，以及 Calendar reliability operation。它可以投影 Task / Goal / Routine 的时间事实，但不拥有这些业务实体，也不拥有后台 worker job。

`@memoflow/scheduler` 负责“系统什么时候可靠执行”：ScheduledInvocation / InvocationAttempt、lease、claim、queue、retry/backoff、Handler Registry 与只读 worker diagnostics。

## 2. 当前功能说明

### Planner / Calendar (`@memoflow/schedule`)

- CalendarEntry 创建、更新、删除与按时间范围查询；
- 日 / 周 / 月统一 Planner 视图，聚合 CalendarEntry 与 owner-domain 时间 projection；
- 冲突检测、冲突解决、拖动/缩放到 owner command 的路由；
- Prisma / PowerSync Calendar repository；
- rebuild outbox、domain-event publisher、delivery-log consumer，以及带审计的 rebuild timeline / replay；
- HTTP / IPC / client 只暴露 Calendar 产品命令与 Calendar reliability ops。

### Temporal Engine (`@memoflow/scheduler`)

- ScheduledInvocation / InvocationAttempt canonical runtime 与 Prisma / PowerSync repositories；
- ScheduleLease coordinator、queue/runtime、claim/retry/backoff；
- `SchedulingPort` adapter 与 `ScheduledHandlerRegistry`；
- HTTP / IPC / client 仅提供 raw worker 的只读 diagnostics；
- raw worker create/update/pause/resume/complete/cancel/delete 只允许在 Scheduler 内部用例中使用，普通产品 transport 不公开。

## 3. 用户路径

- **Planner 路径：** 用户进入日程页，在日/周/月视图查看统一事件；CalendarEntry 可直接编辑，Task / Goal / Routine 事件通过各自 owner command 修改。
- **Calendar Entry 路径：** 用户创建或编辑时间块，系统执行冲突检测并给出解决路径。
- **Worker diagnostics：** 仅在需要诊断后台触发状态时读取 Scheduler worker 状态；用户不能直接通过产品 UI 暂停/完成/删除 raw ScheduledInvocation。
- **移动端：** Calendar/Planner 产品路径继续使用 `ScheduleClientPort`；需要 worker diagnostics 的 React surface 使用独立 `SchedulerClientPort`。

## 4. 业务与架构规则

- `CalendarEntry` 是 `@memoflow/schedule` 的产品聚合；`ScheduledInvocation` 是 `@memoflow/scheduler` 的内部 invocation persistence。
- Planner projection 与 Scheduler invocation 是两条独立 projection；一个 Task/Goal/Routine 可以同时出现在 Planner 并产生 Scheduler invocation，但二者不共享产品所有权。
- owner domain 通过 `SchedulingPort.reconcile` 写入调度意图；不得直接构造/持久化 raw ScheduledInvocation。
- Scheduler 的执行选择由 handler key / registry 驱动；历史 `SourceModule` 行为路由已退休；执行选择由 handler key / registry 驱动。
- Calendar reliability worker 依赖 `@memoflow/patterns/lease` 抽象；具体 ScheduleLease coordinator/repository 属于 Scheduler。
- API 与 Desktop 都分别装配 Calendar module 与 Scheduler module；不能重新创建一个混合的“大 Schedule module”。

## 5. 相关文件索引

详细文件清单见 [日程 / Scheduler 文件索引](../module-index/schedule-files.md)。

## 6. 当前差距

- 跨 owner projection 的交互一致性与完整 acceptance journey 仍是产品体验改进项，不改变当前 owner/persistence contract。
- Scheduler 目前仍是自研 Temporal Engine；是否采用 pg-boss 尚未决定，必须通过 `POC-6401` 比较 claim/retry/DLQ/heartbeat/transaction enqueue/multi-worker/PowerSync 等约束。
- 数据库与 contracts 仍保留历史 `schedule_*` 命名；这不等于 package ownership 仍混合。若未来重命名，应独立决策，避免把 schema churn 与 runtime 行为变化混在一起。

## 7. 优化机会

- Planner 增强拖拽/resize、跨来源筛选、agenda/read model 与冲突体验；
- 为 Scheduler 增加更清晰的只读运维可观测面，而不是恢复产品级 raw worker mutation；
- 用 `POC-6401` 评估 pg-boss cloud adapter 或 hybrid cloud/local adapter；
- 最终 HARD-7101~7105 中补齐跨域失败矩阵、完整产品 journey 与架构文档 closure。

## 8. 风险点

- Calendar projection 和 Scheduler invocation 必须保持独立 truth，不能因 UI convenience 再次合并 ownership；
- API / Desktop 双宿主必须共享相同 SchedulingPort/lease/recovery 语义；
- PostgreSQL 与 PowerSync 的 CAS、claim、lease、outbox/replay 行为需要持续真实 DB 回归；
- 任何新的 raw worker product mutation route/client/IPC 都属于架构回退，应由 surface/governance tests 阻止。

## 9. 已确认决策

- CalendarEntry 与 ScheduledInvocation **不合并**；
- Planner/Calendar 与 Scheduler/Temporal Engine 已物理拆包；
- raw ScheduledInvocation 不是普通用户产品对象；
- pg-boss 不是既定迁移目标，只有 PoC 证据通过才考虑 Adopt/Hybrid。

## 10. 相关资料

- [ADR-060 Schedule / Planner 与 Scheduler / Temporal Engine 分离](../../architecture/adr/ADR-060-schedule-planner-and-scheduler-boundary.md)
- [ADR-061 Scheduling Port 与 Handler Registry](../../architecture/adr/ADR-061-business-module-scheduling-port-and-handler-registry.md)
- [目标模块说明](./goal.md)
- [任务模块说明](./task.md)
- [日程 / Scheduler 文件索引](../module-index/schedule-files.md)

## 11. 2026-09-17 vNext Model Convergence

ADR-080~083 的 Phase 4 收敛已经实施：

```text
CalendarEntry
  -> CalendarEntryRange(Timed | AllDay)
  -> duration derived
  -> conflict moved to Planner projection
  -> calendar priority retired

PlannerEventProjection
  -> occupancy(blocking | non-blocking | marker)
  -> Goal/Task/Routine/external calendar cross-source conflict

ScheduleTask
  -> ScheduledInvocation

ScheduleExecution
  -> InvocationAttempt

ScheduleConfig / SourceModule / payload envelope
  -> retire from canonical Scheduler model
```

其中 `SchedulingPort.reconcile`、stable schedulingKey、Handler Registry、lease、claim、retry/backoff、restart recovery、Prisma/PowerSync parity 都是受保护资产，不因模型改名而重写。

相关文档：

- [Schedule / Planner + Scheduler / Temporal Engine vNext](../schedule-planner-scheduler-vnext.md)
- [Schedule / Scheduler Current System Map](../../analysis/2026-09-08-schedule-scheduler-current-system-map.md)
- [ADR-080](../../architecture/adr/ADR-080-planner-calendar-range-occupancy-and-conflict-model.md)
- [ADR-081](../../architecture/adr/ADR-081-scheduled-invocation-model-and-legacy-schedule-task-retirement.md)
- [ADR-082](../../architecture/adr/ADR-082-scheduler-invocation-attempt-and-runtime-state-machine.md)
- [ADR-083](../../architecture/adr/ADR-083-schedule-scheduler-contract-diagnostics-and-persistence-boundary.md)
