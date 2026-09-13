---
tags:
  - plan
  - active
  - task
  - refactor
description: Task Plan / Occurrence 聚合边界、Schedule ADT、Result/Checklist、Reminder parity、Goal/Workspace 一次性收敛实施计划
created: 2026-09-08T19:35:00+08:00
updated: 2026-09-13T16:42:00+08:00
---

# Task vNext Model Convergence

> **System-wide execution-order notice (2026-09-09):** 本文继续作为模块内部 ticket/验收细节真值；跨模块执行顺序、共享 schema 单写者与 destructive cutover gate 由 [`2026-09-09-system-wide-vnext-model-convergence-implementation.md`](./2026-09-09-system-wide-vnext-model-convergence-implementation.md) 统一协调。
>
> **ADR-111 zero-legacy-data override:** 本文中所有仅用于保存当前旧数据/旧备份/旧客户端的 migration、backfill、compatibility reader/adapter、dual-read/write、redirect window、before/after old-data parity 要求均已被 ADR-111 supersede。领域目标与行为验收继续有效；实施时直接切 current consumers、删除旧 surface、reset/reseed persistence。

## ADR-111 execution rewrite

- `TASK-7305` is a direct Prisma/PowerSync canonical schema cutover, not an old-row migration;
- `TASK-7306` switches all current application/HTTP/IPC/AI consumers in the same coordinated batch;
- old `TaskTemplate`/`TaskInstance` persistence and compatibility DTOs are deleted rather than translated;
- no legacy round-trip fixture is required; fresh TaskPlan/TaskOccurrence round-trip remains required.

**状态：ACTIVE / TASK-7308 complete; TASK-7309 next**
**执行分支：** `feat/system-wide-vnext-convergence`（next ticket worktree: `delegated/task-7309-legacy`）
**上游设计依赖：** Goal vNext ADR-069（Goal-level Task link / context）；Repository ADR-090（linked notes stable `KnowledgeDocumentId`）
**基线：** Task Vitest 71 files / 717 tests PASS

## 1. Objective

一次性把 Task 从“历史 TaskTemplate + TaskInstance + 多轮兼容字段”收敛为：

```text
TaskPlan       = Action Definition + Scheduling Intent + Plan Lifecycle
TaskOccurrence = Execution + Reality Fact
TaskWorkspace  = Plan + Occurrences + Cross-module Context
```

完成后不保留长期旧字段/旧双轨。

## 2. Accepted ADR

- ADR-071 Task Plan / Occurrence Aggregate Boundary
- ADR-072 Task Plan Schedule Algebra
- ADR-073 Occurrence Result / Checklist
- ADR-074 Reminder Policy Persistence Parity
- ADR-075 Task Workspace / Context / Goal Link

## 3. Non-goals

- 不恢复 TaskFolder / hierarchy / dependency DAG / CriticalPath；
- 不增加通用 completion-policy DSL；
- 不让 Task 自己拥有 Scheduler runtime；
- 不把 Related Notes 存成 `noteIds[]`；
- 不把 path-derived `KnowledgeNoteProjection.id` / relativePath 当成 durable Note relation identity；
- 不把 Overdue/Missed 混为一谈。

## 4. Work items

### TASK-7301 — Contract freeze + architecture locks

- 新 TaskPlanSchedule discriminated union；
- TaskGoalLink `keyResultId?`，contribution invariant；
- TaskOccurrenceResult union；
- Checklist definition/state schema；
- Reminder policy multi-trigger round-trip schema；
- 新 surface locks 禁止 legacy fields/old status filters。

### TASK-7302 — TaskPlan aggregate convergence

- canonical domain symbol `TaskPlan`；
- 移除 Plan `startDate/dueDate/completedAt/actualMinutes/note/estimatedMinutes`；
- 以 `schedule` 替代 `taskType + timeConfig + recurrenceRule`；
- lifecycle/outcome/completion policy 保持；
- Goal-level link；
- Plan 不再持有 occurrence collection。

**TASK-7302 DONE（2026-09-13）：** TaskPlan 已不再拥有或 rehydrate TaskOccurrence collection。`_instances / addInstance / removeInstance / getAllInstances / createInstance / generateInstances / getInstanceForDate` 等 aggregate-owned occurrence surface 已删除；Plan repository 同时删除 `findByIdWithChildren`。Occurrence materialization 由 `TaskOccurrenceGenerationService` 基于 Plan schedule + 显式 `existingInstances` 完成，Plan 仅暂时保留 runtime generation horizon（后续 TASK-7304/7305 继续收口）。`GetTaskPlanUseCase` 现在分别从 TaskPlan owner 与 TaskOccurrence owner 组合 children/stats，不再把执行事实塞回 Plan aggregate。Anti-resurrection lock 已加入 `task-domain-simplification.surface.spec.ts`。本地验收：Task unit **73 files / 671 tests PASS**、真实 PostgreSQL integration **6 files / 31 tests PASS**、Task typecheck/build PASS、Task lint **0 errors**（既有 warnings 保留）。

### TASK-7303 — TaskOccurrence aggregate convergence

- canonical `TaskOccurrence`；
- `planId`；
- schedule snapshot；
- Result union；
- checklist state；
- dueAt/isOverdue derived；
- correction semantics + Goal settlement regression。

**TASK-7303 DONE（2026-09-13）：** TaskOccurrence durable truth 已收敛为 `planId + occurrenceKey + scheduleSnapshot(date:Ymd,timing) + importanceSnapshot + status + actualStartAt + result + checklistState + audit/version`。旧 `templateId / instanceDate / timeConfig / completionRecord / skipRecord / actualEndTime / comment` 已退出 aggregate/server/persistence truth；TASK-7306 之前 Web/Desktop 所需旧 client shape 仅由 `toClientDTOAt(timeContext)` 基于 canonical state 显式派生，不构成第二持久化真值。Completed/Missed/Skipped 统一使用 `TaskOccurrenceResult`，Pending/InProgress 强制 `result = null`；Missed/Skipped -> Completed 与 Completed -> Pending correction semantics 均保留，自动实际耗时修正为**分钟**。Plan checklist definition 在 materialize 时 snapshot 为 occurrence checklist state，历史 occurrence 不随 Plan 编辑回写。`dueAt/isOverdue` 使用 Product Time 从 Ymd + timing 派生，DST/wall-clock 不可解析时 fail closed，不使用 host/UTC fallback。Repository 的日期范围、future cutoff、rolling stats 统一改为 Ymd，消除“同一天 +1ms 被误判为 future”的旧歧义。

为保证 schedule snapshot 可真实持久化，本票按 ADR-111 消耗了 **TASK-7305 的最小 occurrence persistence direct-cut slice**：Prisma/PowerSync `task_instances` 物理表名暂保留至 TASK-7309，但列已直接切为 `plan_id / occurrence_key / schedule_date / schedule_timing / importance_snapshot / actual_start_at / result / checklist_state`，无 backfill、dual-read/write 或 legacy reader；Prisma/PowerSync mapper/repository 同批切换，并新增 anti-resurrection lock。完整 TASK-7305 **仍保持 OPEN**，因为 TaskPlan schedule/reminder/runtime cursor 等旧物理列尚未完成 single-track cutover。

本地验收：Task unit **74 files / 605 tests PASS**；真实 PostgreSQL integration **6 files / 31 tests PASS**（含 canonical round-trip、事务回滚、finite-plan Goal settlement）；Contracts **85 files / 580 tests PASS**；Data Portability **36 files / 148 tests PASS**；Database **10 files / 35 tests PASS**；PowerSync schema **1 file / 7 tests PASS**；Task build/typecheck PASS；Data Portability direct typecheck PASS；Contracts/Database/PowerSync schema direct typecheck PASS；Task lint **0 errors**（既有 warnings 保留）；Prisma schema validate PASS。Data Portability 的当前 business-backup occurrence 也同步 destructive-cut 为 `planRef + scheduleSnapshot + importanceSnapshot + result + checklistState`：Plan checklist definition 使用 portable `_ref`，Occurrence 使用 `definitionRef`，导入时为每轮备份恢复重新分配内部 definition ID 并保持 Plan↔Occurrence 对应；strict contract 明确拒绝旧 `templateRef / instanceDate / timeConfig` occurrence payload，不新增旧备份 compatibility reader。

### TASK-7304 — Occurrence materialization service

- 从 Aggregate 移除 generation methods；
- application/domain service 根据 Plan schedule + existing occurrence keys 生成；
- generation cursor/runtime state 不进入产品 DTO；
- finite plan outcome 不依赖 public `lastGeneratedDate`。

**TASK-7304 DONE（2026-09-13）：** occurrence materialization 已完全改为 **cursor-free reconcile**。`TaskPlan` aggregate/state、server/client DTO、response schema、client aggregate、当前 portability payload 均删除 `lastGeneratedDate / generateAheadDays`；`recordGenerationHorizon / shouldRefillInstances / calculateRefillTargetDate / forceGenerate / findNeedGenerateInstances` 等旧 runtime-cursor surface 全部退出业务代码。`TaskOccurrenceGenerationService` 每轮仅依据 canonical Plan schedule + 显式 `existingInstances` 在 Product-Time 有界窗口内重新枚举 recurrence，并以 occurrence key/Ymd 幂等去重；这样不仅不会重复生成，也能自动补回窗口中间丢失的 occurrence，而不依赖“最新生成日期 + 1 天”的脆弱游标。maintenance runtime 现在扫描 Active recurring plans、加载该 Plan 当前 occurrence facts，再执行 reconcile；没有缺口时不写 occurrence/Plan，有新增时 Plan save 仅用于沿既有可靠写边界 flush generated domain event，不持久化 generation state。

finite-plan settlement 同步去 cursor 化：`TaskPlanOutcomeEvaluator` 的 occurrence fact 增加 canonical `scheduleDate: Ymd`；Count scope 依据实际 distinct occurrence dates，Until scope 通过 canonical recurrence + Product Time 计算“应存在的 Ymd 集合”，只有实际 occurrence 覆盖全部 expected dates 才视为 scope fully known。缺一天即保持 `Open`，不会因为某个 cursor 声称“已生成到 Until”而错误结算。DST spring-forward、窗口补洞、重复 reconcile 幂等与 Until hole 都已有行为测试。

Prisma/PowerSync TaskPlan mapper 已停止读取/写入 cursor；当前 Data Portability TaskPlan export/import 也不再携带或写入 runtime cursor。**物理 `task_templates.last_generated_date / generate_ahead_days` 列仍暂留在 Prisma + PowerSync schema，仅作为 TASK-7305 destructive schema cutover 的待删除残余；7304 不把这两列视为有效 truth，也不误标 7305 完成。** Anti-resurrection lock 已加入 `task-domain-simplification.surface.spec.ts`，禁止 cursor surface 回流到 product/domain/portable boundary。

本地验收：Task unit **74 files / 601 tests PASS**；真实 PostgreSQL integration **6 files / 31 tests PASS**；Contracts **85 files / 580 tests PASS**；Data Portability **36 files / 148 tests PASS**；Database **10 files / 35 tests PASS**；PowerSync schema **1 file / 7 tests PASS**；Task direct typecheck/build PASS；Data Portability direct typecheck/build PASS；Task lint **0 errors**（52 个既有 warnings）；production cursor residual scan **0 命中**，仅剩 Prisma/PowerSync 两个物理 schema 列等待 TASK-7305 删除。

### TASK-7305 — Persistence single-track cutover

- Prisma / PowerSync 同步新 Plan/Occurrence shape；
- reminder full JSON；
- checklist state JSON；
- schedule canonical persistence；
- 删除旧 reminder/time/recurrence 展开列；
- migration fixture + round-trip parity。

**TASK-7305 DONE（2026-09-13）：** TaskPlan persistence 已完成 ADR-111 destructive single-track cutover。PostgreSQL/Prisma 以 `schedule Json` 作为唯一 scheduling truth，并以 `reminder_config` 完整 JSON 保存 multi-trigger reminder；PowerSync 同步使用 `schedule` / `reminder_config` JSON text，现有 `checklist` 继续保存带 stable definition id 的完整 JSON。Recurring/OneTime repository 查询不再依赖 shadow discriminator：Prisma 直接以 JSON path 查询 `schedule.kind`，PowerSync 以 `json_extract(schedule, '$.kind')` 查询。TaskOccurrence canonical row 已由 TASK-7303 完成，本票不再重建第二条 occurrence persistence 轨道。

本票物理删除 TaskPlan **18 个 retired columns**：7 个 `time_config_*`、5 个 `recurrence_rule_*`、4 个展开 `reminder_config_*`，以及 `last_generated_date / generate_ahead_days` 两个死 cursor 列。Prisma mapper、PowerSync mapper/repository、PowerSync transaction test double、Data Portability Prisma/PowerSync import store 同批切换；不存在 backfill、dual-read/write、legacy decoder 或 runtime compatibility fallback。Portable TaskPlan 同步收敛为 canonical `schedule + reminderConfig`，strict contract 明确拒绝旧 `taskType / timeConfig / recurrenceRule` backup shape；PowerSync export/import/repeated-import round-trip 证明新形状可迁移且不会复活旧列。

为防止回流，Database schema test 锁定 `schedule Json + reminder_config` 并逐项禁止 18 个旧物理列；PowerSync schema test 同步锁定 canonical TEXT columns 与旧列不存在；Data Portability SQL/round-trip tests 进一步断言旧列不再出现在写入和恢复结果中。真实 PostgreSQL integration 不仅在共享 test DB destructive-sync 后 **6 files / 31 tests PASS**，还在独立临时空数据库从零创建 extension + `db push` 后再次 **6/31 PASS（direct Vitest RC=0）**，随后临时库已删除，证明 closure 不依赖历史 schema/row residue。

本地验收：Task unit **74 files / 590 tests PASS**（旧 expanded-column mapper compatibility tests 被删除并替换为 canonical mapper/fail-closed tests）；PostgreSQL integration **6/31 PASS**，fresh DB **6/31 PASS**；Contracts **85/581 PASS**；Data Portability **36/148 PASS**；Database **11/37 PASS**；PowerSync schema **1/7 PASS**；Prisma validate PASS；Task / Contracts / Data Portability direct typecheck PASS；Task build PASS；Data Portability direct build PASS；Task lint **0 errors / 52 warnings**，受影响 Contracts/Data Portability/Database/PowerSync lint **0 errors**。Production persistence residual scan 对 retired TaskPlan physical symbols **0 命中**；剩余字符串仅存在于 anti-resurrection assertions。

### TASK-7306 — Application / HTTP / IPC / AI cutover

- Create/Update/Query 迁移到 Plan/Occurrence contract；
- Planner projection / SchedulingPort / handler registry 更新；
- AI Task draft 使用同一 schedule/goal link contract；
- 删除 legacy QueryValidator status/dueDate surface。

**TASK-7306 DONE（2026-09-13）：** application / HTTP / IPC / Planner / Scheduling / AI consumer 已统一切到 canonical `TaskPlan / TaskOccurrence` contract。`TaskOccurrenceClientDTO` 不再输出 `templateId / instanceDate / timeConfig / actualEndTime / comment`，而是直接暴露 `planId + scheduleSnapshot + importanceSnapshot + result + checklistState + dueAt/isOverdue`；公开 occurrence list filter 从 `templateId` 改为 `planId`。Reschedule command 同步 destructive-cut 为 `occurrenceId + scheduleSnapshot`，旧 `instanceId / newTime: TaskTimeConfig` body 由 strict schema 明确拒绝；Planner drag/drop 直接产生 canonical schedule snapshot，不再重建 legacy time config。TaskPlan HTTP/IPC/client 的 generate/range/bind/unbind 参数也统一为 `planId`；底层 `TEMPLATE_*` channel / repository legacy symbol 留给 TASK-7309 最终删除，不再作为新 JSON contract 暴露。

Scheduling reminder payload 升为 canonical Plan/Occurrence vocabulary 与 v2 payload，owner target 使用 `task.plan` / `task.occurrence`；AI Planner read port 改读 `planId + scheduleDate/scheduleSnapshot`，standalone Task apply receipt/deterministic kind 从 `task_template` 收敛为 `task_plan`，AI Task draft 继续复用同一 `CreateTaskPlanReq.schedule + goalBinding` contract。无人消费的 `TaskQueryValidator` 与 completion-toggle legacy surface 已直接删除。Dashboard 仅作为待 Phase-5 退休的 consumer projection 适配 canonical occurrence，不把旧 DTO 重新引入 Task authority；Vue Planner/Task views、capsule、Daily Todo、Occurrence row/composable 已直接消费 `scheduleSnapshot / planId / result / dueAt`。

本地 exact-worktree 验收：Task **74 files / 590 tests PASS**；Contracts **85 / 581 PASS**；app-vue **207 / 806 PASS**；Task lint **0 errors / 52 existing warnings**；Task / app-vue / Web / API / Desktop direct typecheck PASS；Task / Contracts / app-vue / AI build PASS；TaskOccurrence HTTP smoke **32/32 PASS**，TaskPlan HTTP smoke **29/29 PASS**；HTTP/IPC parity **17/17 PASS**，Electron Task transport **10/10 PASS**；Planner focused tests PASS。Anti-resurrection locks 拒绝 legacy occurrence DTO、legacy `newTime` reschedule body 与旧 query alias；没有新增 compatibility reader/adapter。

### TASK-7307 — UI convergence

- Product wording Template/Instance -> Plan/Occurrence/Task；
- create/edit 改 property-chip first；
- Goal-only link 可用；
- checklist definition + occurrence checklist interaction；
- reminder multi-trigger 与 persistence parity；
- Task Detail 改 TaskPlanWorkspace。

**TASK-7307 DONE（2026-09-13）：** user-facing Task UI 已收敛到 TaskPlan / TaskOccurrence vocabulary；create/edit 改为 property-chip first，Goal-only link 可用，Plan checklist definition 与 occurrence checklist mutation 已接通，multi-trigger reminder 保持 persistence parity，Task Detail 已演进为 TaskPlanWorkspace-facing surface。Reviewer repair 进一步锁定 ADR-073 stable checklist identity（duplicate definition id 在 contract + domain 双层拒绝）并要求 occurrence checklist owner command 强制 `expectedVersion`。Task 全套 **599 tests PASS**，app-vue Task **82 tests PASS**，Contracts Task focused **45 tests PASS**，Task / app-vue / Contracts typecheck PASS；最终 head `50f86db6d05`。

### TASK-7308 — Context read model

- TaskPlanWorkspace：labels + Goal/KR + occurrence summary + recent occurrences + linked notes；
- linked notes 使用 ADR-090 `KnowledgeDocumentRef`，rename/move 后 relation 仍可解析；
- 在 stable document identity 未实施前，不落 path-derived durable relation；
- 不把 context 塞回 Aggregate；
- 与 ADR-069 shared Relation 实施保持单一 ownership。

**TASK-7308 DONE（2026-09-13）：** TaskPlanWorkspace read model 已完成独立 read-side composition：严格 contract 组合 `plan + labels + Goal/KR context + all-time occurrence summary + bounded recentOccurrences + linkedNotes`；Task occurrence owner 使用 Prisma `groupBy/take` 与 PowerSync `GROUP BY/LIMIT`，详情页不再拉 500 条 occurrence 假装 workspace。Goal 通过 owner port fail-soft 解析，Relation 增加独立 `TaskKnowledgeService`，Repository stable-document resolver 产出 ADR-090 `KnowledgeDocumentRef`，`relativePath` 仅作 display metadata。HTTP `/tasks/:planId/workspace` 与独立 `TaskWorkspaceChannels.GET` 已组合到 API/Desktop，避免污染 legacy Task channel ownership。Task Detail 已切到 workspace summary/Goal/KR/linked knowledge，并在 occurrence/checklist mutation 后刷新 workspace。Reviewer repair 修复了 channel ownership、Goal Missing/Unavailable 语义、per-document note fail-soft、bounded recent position 假象等问题。独立验收：Task 全套 **77 files / 605 tests PASS**；7308 critical focused **Task 18 + Contracts 3 + Relation 1 + App-Vue 6 + Desktop 2 tests PASS**；Contracts / Task / Relation / App-Vue / API / Desktop typecheck 全绿；目标文件 ESLint 0 warning/error；`git diff --check` PASS。最终实现 head `9b5229c09b9`。

### TASK-7309 — Legacy deletion

必须为 0：

```text
TaskTemplate (canonical domain/public symbol)
TaskInstance (canonical domain/public symbol)
TaskPlan.startDate
TaskPlan.dueDate
TaskPlan.completedAt
TaskPlan.actualMinutes
TaskPlan.note
TaskPlan._occurrences / _instances
status:blocked
status:cancelled
old first-trigger reminder persistence
```

允许 migration 文件/历史 ADR 提及旧名。

### TASK-7310 — Review / acceptance / archive

五层审查：

1. contract correctness；
2. aggregate boundary；
3. behavioral completeness；
4. persistence/transport parity；
5. plan/docs truth。

最终 gates：

```text
Task unit/integration
contracts tests/typecheck
Task + contracts + database + app-vue typecheck
lint
Prisma validate/generate checks
PowerSync parity
focused Planner/Scheduler/Goal settlement tests
full CI exact-head
```

## 5. Dependency order

```text
7301
 ├─> 7302 ─> 7304
 ├─> 7303 ─> 7304
 └─> 7305 contract prep

7302/7303/7304
 └─> 7305
     └─> 7306
         ├─> 7307
         └─> 7308
             └─> 7309
                 └─> 7310
```

## 6. Current progress

- [x] Baseline inventory
- [x] Baseline Task tests 71/717 PASS
- [x] ADR-071～075 frozen
- [x] TASK-7301
- [x] TASK-7302
- [x] TASK-7303
- [x] TASK-7304
- [x] TASK-7305
- [x] TASK-7306
- [x] TASK-7307
- [x] TASK-7308
- [ ] TASK-7309
- [ ] TASK-7310

**Next:** TASK-7309 is now the sole next Task dependency: delete canonical/public legacy TaskTemplate / TaskInstance symbols and the remaining obsolete TaskPlan fields/status/reminder persistence listed above. Migration files and historical ADR references may retain old names; active runtime/contracts/owners may not. Preserve the accepted TaskPlanWorkspace composition and do not collapse its owner boundaries while deleting legacy surfaces.
