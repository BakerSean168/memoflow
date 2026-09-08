---
tags:
  - plan
  - active
  - schedule
  - scheduler
  - reminder
  - routine
  - notification
  - planner
  - refactor
description: Schedule/Planner、Scheduler、Reminder/Routine、Notification 边界重构的分阶段实施计划，保护现有可靠执行资产并迁移到 neutral scheduling contract
created: 2026-08-25T17:49:00+08:00
updated: 2026-08-25T19:18:00+08:00
---

# Scheduling / Notification vNext — Boundary & Reliability Refactor

> **Archived 2026-08-29:** detailed Scheduling/Notification design is retained here for reference. The completed orchestration record is archived at `./2026-08-25-core-vnext-orchestration.md`; this child plan is historical reference only and is not an active execution truth.

> **Orchestration notice (2026-08-25):** 本文件保留 Scheduling/Notification 的专项设计与 ticket 细节；实际实施顺序、并行 lane、与 Goal/Task/Routine 的 contract freeze 点以 `2026-08-25-core-vnext-orchestration.md` 为唯一真值。不要先迁旧 Task projector 后再重写 Task vNext。
>
> Old-phase mapping: Phase 0 -> `CORE-0001~0005`; Phase 1 -> `SCHED-1101~1105` + `NOTIF-1101/1102`; Phase 2 -> `TASK-3101/3102`; Phase 3 -> `GOAL-3201/3202` + `ROUTINE-3501/3502`; Phase 4 -> `NOTIF-2401/2402` + `NOTIF-3301/3302`; Phase 5 -> `PLAN-5101~5105`; Phase 6 -> `POC-6101` + cleanup tickets; Phase 7 -> `HARD-7101~7105`.

**状态：** Planned / active  
**North Star：** ADR-060~063  
**产品详述：** `docs/product/scheduling-notification-vnext.md`  
**OSS 研究：** `docs/analysis/2026-08-25-scheduling-notification-oss-study.md`

## 1. Outcome

把当前：

```text
Feature -> ScheduleTask -> SourceModule switch -> Feature Executor -> NotificationPort
```

演进成：

```text
Feature Domain
  -> module-owned projector
  -> ScheduledIntent[]
  -> SchedulingPort.reconcile
  -> Scheduler invocation
  -> HandlerRegistry
  -> Domain Handler
  -> durable NotificationRequested
  -> Notification Fact + per-channel delivery
```

同时：

- Schedule 产品页收敛为 Planner / Calendar；
- Scheduler 变成内部 Temporal Engine；
- Reminder 退役第二套 wall-clock cron authority；
- Notification policy 真正逐 channel 生效；
- 保留并迁移现有 lease/fencing/retry/outbox/recovery 资产。

## 2. Why Now

当前存在几个已经被代码审查确认的结构性风险：

### P0/P1

1. Reminder Schedule Queue 与 Reminder Cron 双 scheduler authority；
2. Notification create policy 只检查第一个 channel；
3. DND/rate-limit 没有完整进入实际 create/delivery path；
4. Goal/Reminder schedule projection 缺 startup reconcile；
5. post-commit in-memory event failure 可能留下 stale schedule projection；
6. `SourceModule` contract 可表示 runtime 不支持的 source；
7. Goal/Task/Reminder projection 直接构造 `ScheduleTask`；
8. `replaceSelection()` 不是真正 transaction-level atomic；
9. random ScheduleTask ID 缺 stable business scheduling identity；
10. projection timezone 仍存在 `Timezone.Shanghai` fallback。

这些问题会阻碍 Routine Coach、Goal/Task vNext、AI automation 和 Planner 继续扩展。

## 3. Coordination With Other Active Work

### Goal / Task vNext

本计划不重新定义 ADR-053~057 的 Goal/KR/Task 语义。

依赖关系：

```text
Goal/Task domain semantics
      ↓
本计划负责 scheduling projection seam
```

如果 Goal/Task 字段在 vNext 迁移，projector 必须基于其新 contract 更新，但不能把 Goal/KR settlement 逻辑塞入 Scheduler。

### Routine Coach

ADR-059 是 Reminder 的产品/领域演进。

本计划负责：

- wall-clock durable scheduling；
- occurrence可靠执行；
- Notification/desktop presentation seam。

ActiveUsage/Idle/Protocol timer 仍属于 ADR-059 local runtime，不作为本计划的 cloud Scheduler job。

## 4. Protected Contracts

全程保护：

1. API / Desktop 两宿主 parity；
2. PowerSync / Prisma identity isolation；
3. Schedule queue restart recovery；
4. lease / claim / retry / timeout / execution history；
5. ReminderOccurrence idempotency/fencing/transaction semantics；
6. NotificationDispatchOutbox per-channel reliable delivery；
7. Task/Goal/Reminder 到点后重新读取 current state；
8. Schedule 日/周/月用户路径；
9. ADR-037 Product Time System；
10. ADR-042 BusinessOperationReceipt / delivery reliability semantics；
11. 现有 HTTP/IPC public contract 在迁移期必须兼容或显式版本化。

## 5. Non-goals

本计划不同时：

- 重写 Goal/KR measurement；
- 重写 Task recurrence engine；
- 完整实现 Routine Coach 全部 UI；
- 接入 CalDAV；
- 接入真实 Email/Push provider（除非已有 provider 需要修复）；
- 立即把自研 Scheduler 替换成 pg-boss；
- 引入完整 Novu/Trigger.dev service；
- 重做整个 Schedule UI 视觉设计。

---

# Phase 0 — Baseline / Characterization / Safety Net

## 目标

先证明现有真实行为和竞态，再改 owner。任何删除旧 scheduler 前必须有 characterization evidence。

## SCHED-0001 — 冻结当前 Scheduling System Map

**Goal:** 将当前 API/Desktop 的 projection、queue、execution、notification wiring 变成可测试 inventory。  
**Why now:** 后续每一步都需要判断是迁移还是行为回归。  
**Scope:** `apps/api/src/server.ts`、`apps/desktop/src/main/main.ts`、`packages/schedule-orchestration`、`packages/schedule`。  
**Out of scope:** 改业务代码。

**Implementation:**

1. 为 Task/Goal/Reminder 当前 projection/execution path 建 architecture characterization tests；
2. 锁定 `SourceModule -> executor` 当前 mapping；
3. 锁定 API/Desktop composition parity；
4. 记录 raw ScheduleTask public surface consumer inventory；
5. 记录 hardcoded timezone inventory；
6. 记录所有 `ScheduleTask.create` 跨包调用点。

**Tests:**

```bash
pnpm nx run schedule-orchestration:test
pnpm nx run schedule:test
pnpm nx run api:typecheck
pnpm nx run desktop:typecheck
```

**Acceptance:** 可以用 tests/inventory 明确回答每个业务来源如何进入/离开 Scheduler。

## REM-0001 — Characterize 双 Scheduler Authority

**Goal:** 用测试证明当前 Schedule path 与 Reminder Cron path 的真实 side effects。  
**Scope:** reminder + schedule-orchestration + notification integration tests。

**Implementation:**

1. 构造同一 due Reminder；
2. 分别运行 Schedule path / Cron path；
3. 记录 nextTriggerAt、history、occurrence、notification/outbox 的变化；
4. 构造两条路径并发；
5. 锁定现有幂等保护能与不能保证的内容。

**Acceptance:** 删除任一路径前，有自动化测试描述当前双轨行为。

## NOTIF-0001 — Characterize Per-channel Policy Defect

**Goal:** 建失败测试证明“第一个 channel allowed、第二个 channel disabled”仍被错误 enqueue。  
**Scope:** CreateNotification use case tests。

**Acceptance:** 测试在修复前失败，并精确覆盖 per-channel preference。

---

# Phase 1 — P0 Notification Correctness + Neutral Scheduling Foundation

## 为什么先做

Notification policy bug 是独立的真实 correctness 问题，可以先修；同时建立 neutral contract，但暂不搬物理 package。

## NOTIF-1001 — Per-channel Delivery Decision

**Goal:** 每个 channel 独立通过 preference/policy。  
**Scope:** notification application/domain policy、tests。

**Implementation:**

1. 将一次 `shouldSend(firstChannel)` 改成 per-channel planning；
2. 明确 disabled/suppressed channel 是否创建 channel record；
3. 推荐保留 decision receipt，而不是完全静默丢弃；
4. 不改变 Notification read/unread 语义；
5. 补 mixed-channel tests。

**Acceptance:** 任一 channel 的禁用不会因为数组中另一个 channel allowed 而被绕过。

## NOTIF-1002 — Wire DND / Rate Limit Into Real Path

**Goal:** Policy 中已经存在的 DND/rate-limit 真实影响生产 create/delivery path。  
**Scope:** notification use case/runtime/repository。

**Implementation:**

1. 明确 policy context source；
2. 接入 DND；
3. 接入 rate usage/count；
4. 记录 `suppressed_dnd / rate_limited / deferred` reason；
5. 区分 Notification Fact 与 channel outcome。

**Acceptance:** 集成测试证明 DND/rate-limit 不再只是“定义存在”。

## SCHED-1001 — Introduce ScheduledIntent / SchedulingPort Contracts

**Goal:** 业务模块可以不依赖 ScheduleTask aggregate 描述 desired scheduling state。  
**Scope:** contracts 或极薄 scheduler public seam；不迁现有业务 projector。

**Implementation:**

1. 定义 `SchedulingOwner`；
2. 定义 `ScheduledIntent`；
3. 定义 `SchedulingPort.reconcile/removeOwner`；
4. 定义 receipt；
5. 定义 payload validation/versioning 策略；
6. 建 contract tests；
7. 不让 Prisma/PowerSync type 泄漏。

**Protected contracts:** ADR-037 Instant、ADR-042 receipt semantics。

## SCHED-1002 — Existing ScheduleTask Adapter Implements SchedulingPort

**Goal:** 在不替换当前 Scheduler engine 的前提下，用 adapter 把 neutral intent 投影到现有 ScheduleTask persistence。  
**Why now:** 先解耦上层，后续 queue implementation 才可替换。

**Implementation:**

1. 新增 adapter；
2. `ScheduledIntent -> ScheduleTask` 只存在于 scheduler infrastructure；
3. 保留 existing queue/runtime；
4. 先兼容 `SourceModule` metadata；
5. 所有新字段有 mapper tests。

**Acceptance:** 一个测试模块可只通过 `SchedulingPort` 创建可执行旧 ScheduleTask。

## SCHED-1003 — Stable schedulingKey + Unique Constraint

**Goal:** 相同业务 scheduling intent 重复 reconcile 不产生重复 row。  
**Scope:** contract + Prisma + PowerSync schema/mappers + migration。

**Implementation:**

1. 新增 stable key；
2. 选择 canonical composite uniqueness；
3. backfill existing projected tasks；
4. 明确用户手工 internal jobs 的 key 生成；
5. collision tests；
6. migration rollback/compatibility test。

**Acceptance:** 100 次同 desired state reconcile 仍只有一条 invocation。

## SCHED-1004 — Owner-level Atomic Reconcile

**Goal:** desired upsert + stale delete 为单个原子 operation。  
**Scope:** Prisma repository/adapter；PowerSync 提供等价 local transaction。

**Implementation:**

1. 在 `withTransaction()` 内读 existing；
2. upsert stable keys；
3. delete stale；
4. 写 projection receipt；
5. transaction fail injection；
6. 删除 shared helper 中“伪 atomic”的注释/实现。

**Acceptance:** 任意注入 failure 都不会留下 half-reconciled owner set。

---

# Phase 2 — Task Vertical Slice + Handler Registry

## 为什么 Task 先迁

Task Projection 已有 startup reconcile，repair 资产最好，是最低风险 vertical slice。

## SCHED-2001 — Migrate Task Projection to SchedulingPort

**Goal:** `packages/task` 不再 import/construct `ScheduleTask`。  
**Scope:** task schedule-projection seam + schedule-orchestration adapter。

**Implementation:**

1. Task source 输出 neutral desired intents；
2. stable key 基于 TaskInstance + reminder identity；
3. 保留 Relative/Absolute 业务计算；
4. `schedule-orchestration` 只调用 `SchedulingPort.reconcile`；
5. characterization parity tests；
6. API + Desktop 两 adapter 验证。

**Acceptance:** Task 包 production code 对 `ScheduleTask` aggregate 零依赖。

## SCHED-2002 — Introduce HandlerRegistry With Task Handler

**Goal:** Scheduler 可按 handlerKey 执行 Task，无需 SourceModule switch。  
**Implementation:**

1. 定义 registry；
2. 注册 `task.reminder.fire`；
3. adapter 将 legacy sourceModule task invocation 映射到新 handler 以兼容迁移；
4. registry 未知 key fail-fast/dead-letter；
5. handler payload schema validate；
6. Task handler 到点重新读取 TaskInstance/Template。

**Acceptance:** Task execution path 不经过 central `if SourceModule.Task`。

## SCHED-2003 — Projection Repair Standard

**Goal:** 把 Task 现有 startup reconcile 抽象为所有 scheduling projector 的一致 runtime pattern。  
**Implementation:**

1. 先注册 event listener；
2. 再 full reconcile；
3. reconcile 与 event 同 key 幂等；
4. source enumeration failure 可重试/可观测；
5. 定义 periodic repair 是否需要。

**Acceptance:** 故意丢一个 event 后 restart 能恢复正确 Task invocation。

---

# Phase 3 — Goal Migration + Reminder Single Authority

## SCHED-3001 — Migrate Goal Projection

**Goal:** Goal 使用 neutral scheduling contract + stable key。  
**Implementation:**

1. 保留 RemainingDays / TimeProgressPercentage 在 Goal；
2. 投影 stable intent；
3. 增加 Goal owner enumeration；
4. startup full reconcile；
5. handler registry 注册 `goal.reminder.fire`；
6. stale/completed/archive skip tests；
7. 去除 Goal projection Shanghai fallback。

**Acceptance:** Goal 不构造 ScheduleTask；event 丢失后 restart 可恢复。

## REM-3001 — Schedule Handler Reuse Reliable Occurrence Transaction

**Goal:** 新 Scheduler path 具备当前 Cron path 的业务可靠性。  
**Scope:** reminder execution handler + existing transaction runner。

**Implementation:**

1. 定义 canonical occurrenceKey；
2. Scheduler handler 进入 ReminderOccurrence idempotency fence；
3. transaction 内 revalidate template；
4. history + nextTriggerAt + occurrence outcome 同事务；
5. NotificationRequested 写 durable outbox；
6. 不再在 handler 中直接 `notificationPort.createNotification()`。

**Acceptance:** Schedule path 的可靠性 >= 原 Cron path，DB commit 前后 crash 均有测试。

## REM-3002 — Reminder Projection Repair + One-shot Next Occurrence

**Goal:** Reminder 当前 nextTriggerAt 始终可重建为一个稳定 one-shot invocation。  
**Implementation:**

1. Reminder source owner enumeration；
2. startup reconcile；
3. `schedulingKey = occurrenceKey`；
4. execute/advance 后 event/outbox 触发下一次 reconcile；
5. pause/snooze/move 删除或替换旧 invocation；
6. timezone 解析遵循 Product Time policy。

## REM-3003 — Shadow Compare Legacy Cron vs Scheduler Due Set

**Goal:** 删除旧 Cron 前证明新 Scheduler 不漏 due reminder。  
**Implementation:**

1. legacy Cron 进入 shadow read-only mode；
2. 同时间窗比较 due set；
3. 输出 mismatch metrics/log；
4. 不产生历史/notification side effect；
5. 跑 restart/sleep/two-worker cases。

**Acceptance:** 约定验证矩阵无 unexplained mismatch。

## REM-3004 — Delete Legacy Reminder Trigger Cron Authority

**Goal:** durable wall-clock Reminder 只剩 Scheduler authority。  
**Implementation:**

1. 从 API/Desktop composition 移除 trigger cron runtime；
2. 删除 scanner-owned business execution；
3. 保留可复用 occurrence transaction/idempotency；
4. 删除双轨 config；
5. 更新 module docs/tests。

**Acceptance:** 全仓无 production path 能绕过 Scheduler 直接扫描 `nextTriggerAt` 并推进 Reminder。

---

# Phase 4 — NotificationRequested Pipeline + Router Decoupling

## NOTIF-4001 — Durable NotificationRequested Contract

**Goal:** Domain handler 与 Notification runtime 通过 durable intent 解耦。  
**Implementation:**

1. 定义 workflowKey/topic；
2. 定义 idempotency/correlation；
3. 建 durable outbox writer；
4. Notification runtime consume；
5. create Notification Fact；
6. plan channels；
7. establish dispatch outboxes。

## NOTIF-4002 — Remove NotificationPort From Schedule Execution Router

**Goal:** Scheduler 只 dispatch handler，不 finalize notification。  
**Implementation:**

1. Goal/Task/Reminder handler 自己通过 business outbox 产生 NotificationRequested；
2. execution result 不再携带中央 `notification` 字段；
3. 删除 `finalizeExecution(... notificationPort)`；
4. 删除 orchestration 对 Notification package 的执行耦合；
5. contract/runtime tests。

**Acceptance:** Scheduler package/registry 不依赖 notification channel/domain types。

## NOTIF-4003 — Workflow / Global / Per-workflow Preferences

**Goal:** 从 stringly module map 演进为 workflow/topic-aware preference hierarchy。  
**Implementation:**

1. inventory current preference migration；
2. workflow default/capability；
3. global channel setting；
4. per-workflow override；
5. critical/readOnly only for explicit system workflows；
6. UI/API migration compatibility。

## NOTIF-4004 — Device-local Delivery Outcome

**Goal:** Desktop local DND/permission/surface override 不改变 cloud Notification truth。  
**Implementation:**

1. Desktop delivery adapter capability check；
2. native/custom window selection；
3. local DND；
4. optional delivery receipt；
5. foreground suppression/silent Inbox；
6. Routine InterventionWindow integration seam。

---

# Phase 5 — Schedule / Planner Product Convergence

## PLAN-5001 — Planner Unified Event Contract

**Goal:** Calendar UI 统一展示来源，同时保持 owner identity。  
**Contract:**

```text
CalendarEventProjection
  sourceType
  sourceId
  ownerCommandTarget
  start/end
  title
  display metadata
  editable capabilities
```

**Implementation:**

1. 当前 Schedule CalendarEntry adapter；
2. Task occurrence adapter；
3. Goal milestone/review adapter；
4. Routine fixed-time occurrence adapter；
5. source visibility/filter；
6. no Scheduler invocation rows in normal Planner。

## PLAN-5002 — Complete Goal / Routine Calendar Projection

**Goal:** 修复当前类型支持 Goal 但实际 events 未聚合 Goal 的不完整状态。  
**Acceptance:** 日/周/月视图能正确显示可配置的 Goal/Routine 时间事实。

## PLAN-5003 — Source-aware Drag / Resize

**Goal:** Planner 操作更新 authoritative owner。  
**Rules:**

- CalendarEntry -> Schedule/Planner command；
- Task -> Task command；
- Goal -> Goal command if field editable；
- Routine -> Routine command；
- read-only projection -> 禁止拖动并说明原因。

**Acceptance:** 无 UI path 直接修改 internal ScheduledInvocation。

---

# Phase 6 — Internalization / Build-vs-Adopt / Physical Split

## SCHED-6001 — Internalize Raw ScheduleTask Surface

**Goal:** 普通产品 API 不再暴露 worker infra concepts。  
**Implementation:**

1. consumer inventory；
2. internal/dev ops endpoints 与 product API 分离；
3. deprecate raw create/update ScheduleTask user flows；
4. migration adapter；
5. docs/OpenAPI cleanup。

## SCHED-6002 — pg-boss Build-vs-Adopt PoC

**Goal:** 在上层 contract 已稳定后，用数据决定是否继续自研 queue。  
**Compare:**

- PostgreSQL claim correctness；
- retry/backoff/dead-letter；
- cron/deferred jobs；
- same-DB transaction enqueue；
- metrics/observability；
- multi-worker；
- API/Desktop/PowerSync constraints；
- schema migration；
- operational complexity；
- license/update path；
- performance under MemoFlow workload。

**PoC rule:** 只替换 `SchedulingPort` 的 infrastructure adapter，不改业务 projectors/handlers。

**Decision outputs:**

```text
Keep Custom
or
Adopt pg-boss for cloud scheduler
or
Hybrid: pg-boss cloud + local scheduler desktop
```

禁止在 PoC 前预设结论。

## SCHED-6003 — Physical Package Split

**Goal:** 只有语义稳定后再考虑：

```text
packages/schedule   -> Planner/Calendar domain
packages/scheduler  -> Temporal Engine
```

`packages/schedule-orchestration` 决定是：

- 收敛为 generic scheduling integration package；
- 或把 registry/runtime 分别下沉到 scheduler + module adapters 后删除。

**Acceptance:** 物理目录反映已经稳定的 ownership，而不是为了“看起来干净”搬文件。

---

# Phase 7 — Hardening / Governance / Documentation

## HARD-7001 — Failure Matrix

至少覆盖：

```text
projection event lost
projection transaction crash
scheduler worker crash
lease expiry
duplicate enqueue
stale invocation
handler business skip
handler technical retry
notification outbox crash
channel disabled
DND
rate limit
device offline
server restart
desktop restart
clock/timezone/DST
```

## HARD-7002 — Architecture Surface Governance

增加/扩展治理：

- feature package 禁止 import Scheduler aggregate；
- Scheduler 禁止 import Goal/Task/Reminder/Notification domain package；
- `SourceModule` 不得用于 execution switch；
- `Timezone.Shanghai` schedule projection hardcode 归零；
- production Reminder trigger scanner 禁止回归；
- Notification multi-channel create 必须经过 planner/policy seam。

## HARD-7003 — Documentation Closure

同步：

- module docs；
- module file indexes；
- ADR index；
- active/archive plan；
- architecture diagrams；
- API docs；
- migration notes。

---

# 6. Ticket Dependency Order

```text
NOTIF-0001 -> NOTIF-1001 -> NOTIF-1002

SCHED-0001
   -> SCHED-1001
   -> SCHED-1002
   -> SCHED-1003
   -> SCHED-1004
   -> SCHED-2001
   -> SCHED-2002
   -> SCHED-2003
        ├-> SCHED-3001
        └-> REM-3001 -> REM-3002 -> REM-3003 -> REM-3004

REM-3001 + SCHED-3001
   -> NOTIF-4001
   -> NOTIF-4002
   -> NOTIF-4003/4004

stable domain projections
   -> PLAN-5001 -> PLAN-5002 -> PLAN-5003

all upper contracts stable
   -> SCHED-6001 -> SCHED-6002 -> optional SCHED-6003
   -> HARD-7001/7002/7003
```

---

# 7. Verification Matrix

## Focused packages

```bash
pnpm nx run schedule:test
pnpm nx run schedule:typecheck
pnpm nx run schedule-orchestration:test
pnpm nx run schedule-orchestration:typecheck
pnpm nx run task:test
pnpm nx run task:typecheck
pnpm nx run goal:test
pnpm nx run goal:typecheck
pnpm nx run reminder:test
pnpm nx run reminder:typecheck
pnpm nx run notification:test
pnpm nx run notification:typecheck
```

## Host / UI

```bash
pnpm nx run api:typecheck
pnpm nx run api:test
pnpm nx run api:test:smoke
pnpm nx run desktop:typecheck
pnpm nx run app-vue:typecheck
pnpm nx run app-vue:test
```

## Governance

```bash
pnpm nx run memoflow:governance-check
```

任何命令如果当前 workspace target 名称已变，实施时先用 `nx show project <name>` 核实，不能在计划中把“未运行”写成通过。

---

# 8. Release / Rollback Strategy

## No big-bang

迁移采用 compatibility bridge：

```text
new ScheduledIntent
  -> adapter -> existing ScheduleTask engine
```

因此业务 seam 可以先迁，queue engine 后迁。

## Reminder Cutover

旧 cron 删除前必须：

- Schedule path 用上可靠 occurrence transaction；
- startup/durable reconcile 完成；
- shadow due-set compare 通过；
- rollback flag 能短期重新启用旧 runtime，但不能双 side-effect mode。

## Notification

per-channel policy 改动需要 migration/telemetry：

- 统计 suppressed count；
- 确认没有因为历史错误依赖而突然“少发”；
- critical workflow 另做白名单。

---

# 9. Risk Ledger

| Risk                                   | Impact       | Mitigation                                                           |
| -------------------------------------- | ------------ | -------------------------------------------------------------------- |
| 同时改 business seam + queue engine    | 难定位回归   | 先 adapter existing ScheduleTask，pg-boss 后置                       |
| Reminder 切换漏提醒                    | 用户信任损失 | shadow compare + occurrence tests + startup reconcile                |
| 双轨期间重复通知                       | 干扰用户     | stable occurrence key + business idempotency + single authority flag |
| stable key 迁移碰撞                    | 数据错误     | deterministic format + unique migration preflight                    |
| timezone 改动行为变化                  | 提醒时间偏移 | explicit IANA + fixture matrix + ADR-037                             |
| Notification policy 修复改变实际发送量 | 体验变化     | per-channel telemetry + migration test                               |
| Planner 聚合成为第二 truth             | 数据漂移     | read projection + source-aware owner commands                        |
| 物理拆包过早                           | churn        | Phase 6 最后做                                                       |

---

# 10. Definition of Done

本 Active Plan 只有同时满足以下条件才可归档：

- [ ] Schedule/Planner 与 Scheduler contract/physical ownership 清晰；
- [ ] Goal/Task/Reminder production projectors 不再构造 ScheduleTask；
- [ ] stable schedulingKey + atomic owner reconcile 落地；
- [ ] handler registry 替代 central SourceModule execution switch；
- [ ] Task/Goal/Reminder 都有 durable/startup projection repair；
- [ ] Reminder durable wall-clock 只有一个 scheduler authority；
- [ ] ReminderOccurrence 可靠事务能力已迁入新 handler；
- [ ] Scheduler 不直接依赖 NotificationPort；
- [ ] Notification per-channel policy、DND、rate-limit 主路径正确；
- [ ] Notification Fact 与 delivery outcome 可区分；
- [ ] hardcoded Shanghai scheduling fallback 归零；
- [ ] Planner 不展示/编辑 raw scheduler jobs；
- [ ] source-aware Planner 编辑回到 owner domain；
- [ ] API/Desktop parity tests 通过；
- [ ] failure matrix 通过；
- [ ] governance rules 防止旧耦合回归；
- [ ] pg-boss Build-vs-Adopt 有实证结论；
- [ ] 所有 ADR/module/docs 与最终实现同步。
