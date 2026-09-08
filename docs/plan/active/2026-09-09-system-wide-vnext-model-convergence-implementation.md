---
tags: [plan, active, vnext, system-wide, convergence]
description: MemoFlow 全模块模型收敛唯一执行顺序、依赖、迁移、验证与最终删除计划
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-09T00:31:00+08:00
---

# MemoFlow System-wide vNext Model Convergence — Implementation Plan

> **Execution-order authority:** 本文是本轮系统级重构的唯一执行顺序真值。Goal/Task/Setting/AI/Time+Label 既有 active plans 继续提供模块内部实施细节，但不得绕过本文依赖顺序并行写同一 contract/schema。
>
> **Control plane:** Pixel control plane `127.0.0.1:8320` 在本计划创建时不可用，因此当前 canonical execution truth 是 GCP Dev repository branch/commit + 本计划。Pixel 恢复后只允许 attach/recover 一个 durable plan，不创建重复 writer。

## 1. Outcome

完成后 MemoFlow 只有一条现代化产品模型：

```text
Goal         Direction + Measurement + Context
Task         Plan + Occurrence + Context
Routine      Definition + Runtime + Occurrence + Intervention
Planner      Calendar/temporal projection + arrangement
Scheduler    Durable invocation + attempt
Notification Fact + Inbox + delivery
Knowledge    Space + stable Document + projection
Account      Profile + lifecycle
Preferences  typed presentation/regional
AI           Mastra runtime + typed drafts/context/owner ports
Time         shared product-time foundation
Label        shared registry; owner assignments
```

并物理退休：

```text
legacy Reminder model
legacy ScheduleTask model
legacy Repository/Folder/Resource
legacy Editor
standalone Dashboard
product Governance Rule DB
Account.settings
AI legacy product/runtime persistence
stale PortableUserDataV2 internal-model clones
```

## 2. Non-goals

- 不重写 Mastra、Better Auth、PowerSync、Prisma、rrule 或 date-fns；
- 不创建新的 generic God modules（HomeData, EntitySettings, GenericAssignment, GenericRepository 等）；
- 不为了兼容无真实生产价值的 legacy runtime rows 永久维护双轨；
- 不把 system-wide convergence 与新的社交、团队、RBAC、mobile editor 等产品功能混在一起。

## 3. Protected assets

1. Better Auth 单一 cloud auth authority；
2. Desktop Local Profile 独立访问、guest/offline 能力；
3. account closure durable coordinator；
4. Product Time `Instant/Ymd/Hm`、recurrence adapter conformance；
5. SchedulingPort neutral seam、Scheduler lease/retry/recovery；
6. Notification outbox/lease/fencing/replay；
7. Knowledge Git/Vault truth、GitHub App security、confirmed writes；
8. Mastra durable workflow/HITL/restart recovery；
9. PowerSync offline parity；
10. host-owned `ExecutionContext.identityId`；
11. failure/operation governance contracts；
12. existing current-user deep links unless an ADR explicitly provides redirect/migration.

## 4. Global dependency order

```text
PHASE 0  Baseline / locks / dead-surface cleanup
   │
PHASE 1  Foundations
   ├─ Time
   ├─ Preferences + Account/Auth
   ├─ Label Registry
   └─ Data Portability V3 skeleton
   │
PHASE 2  Knowledge identity/projection
   ├─ Editor retirement
   └─ Governance -> Knowledge migration
   │
PHASE 3  Goal + Task
   │
PHASE 4  Routine + Planner/Scheduler + Notification
   │
PHASE 5  Home/Dashboard retirement + AI semantic alignment
   │
PHASE 6  Portable owner cutover + destructive legacy deletion
   │
PHASE 7  whole-system review / exact-head CI / release closure
```

Within a phase, lanes may run in parallel only when they do not write the same contracts/schema/migration.

---

# Phase 0 — Baseline, architecture locks and high-confidence dead surfaces

## SYS-0001 — Capture exact current-system characterization

**Goal:** turn every target-changing behavior into executable characterization before destructive edits.

**Implementation:**

1. record exact HEAD and clean-worktree baseline;
2. add/refresh focused characterization for Time host timezone, Account/Auth closure, DataPortability V2 import safety, Knowledge projection, Dashboard live consumers, Governance migration projection and Editor no-runtime boundary;
3. update test inventory only because implementation now legitimately changes test surfaces;
4. ensure each future delete has a consumer search fixture or architecture lock.

**Tests:** focused package tests + `pnpm test:inventory` + governance.

**Acceptance:** every legacy surface scheduled for deletion is either covered by a migration test or proven to have zero production consumer.

## SYS-0002 — Retire unused Dashboard page-only Vue components

**状态：DONE — 2026-09-09 first implementation checkpoint**

**Goal:** remove code that belonged only to the already-retired Dashboard page without touching current Home behavior.

**Scope:** `DashboardStatsStrip`, `DashboardTrendPanel`, `DashboardActivityTimeline` and tests/keep-boundary references proven unused.

**Out of scope:** `useDashboard`, DashboardData API/IPC/package, Goal progress, ActivityLedger, DashboardConfig.

**Acceptance:** production import graph contains none of the three components; app-vue typecheck/tests green.

**Closure evidence:**

- consumer search found no production imports for the three components before deletion;
- removed obsolete Residual 1237 keep-boundary spec + Dual Registry entry tied only to `DashboardActivityTimeline`;
- focused Vitest: `format-duration` 5/5, `ReminderCapsulePreview` 2/2, `SettingAdvancedActions` 3/3 PASS;
- `app-vue:typecheck` PASS;
- `app-vue:lint` PASS with 13 inherited warnings / 0 errors;
- `pnpm test:inventory` regenerated inventory: 1187 files;
- `pnpm docs:check` PASS;
- `pnpm governance:check` PASS.

## SYS-0003 — Add target no-return architecture manifest

**Goal:** encode retired vocabulary/ownership boundaries from system-wide review as staged governance locks.

Locks activate only after the replacement ticket closes; never fail current code before migration is possible.

---

# Phase 1 — Foundations

## TIME lane — execute existing TIME-1201..1206

Canonical detail: `2026-09-09-time-label-vnext-model-convergence.md`.

Order:

1. TIME-1201 characterization including `TZ=UTC/Asia/Tokyo/America/New_York` fixtures and DST gap/overlap;
2. TIME-1202 branded `TimeZoneId`, `TimeContext`, `TimePresentationStyle`;
3. TIME-1203 timezone-aware Calendar/Input;
4. TIME-1204 locale/timezone-aware Format;
5. TIME-1205 migrate cross-module consumers;
6. TIME-1206 remove raw number/Date compatibility and host-local fallbacks.

**Global gate:** no server business calendar semantics may read ambient host timezone.

## PREF-ACCOUNT-AUTH lane

### ACC-1401 — Characterize Account profile/lifecycle/closure

- prove current Desktop local profile behavior;
- prove cloud Account closure/revocation/retry;
- enumerate real consumers of realName/gender/birthday/phone/Suspended/version.

### SETTING-9202 — Canonical preference namespace foundation

Execute existing Setting plan foundation before Account settings deletion.

### ACC-1402 — Introduce AccountView + CloudIdentitySummary composition

**Goal:** UI can display profile + login email verification without Account owning mutable auth email.

- keep current routes compatible initially;
- compose CloudPrincipal/CloudAuth user safe summary at host/application boundary;
- no token/provider secret fields.

### ACC-1403 — Retire Account.settings

Depends on Setting presentation/regional + Notification preference consumers being live.

Delete AccountSettings VO, `/me/settings`, event, DTO field and persistence column only after migration tests prove parity.

### ACC-1404 — Simplify Account lifecycle

Move to Active/Closed + `closedAt`; remove Suspended if characterization confirms no production control plane. Preserve closure operation state separately.

### ACC-1405 — Remove speculative phone verification if unused

If a real consumer is found, keep only the minimum product contact semantics and move authentication verification to Cloud Auth.

### AUTH-1501 — Narrow Cloud Auth product seam

- document/export only CloudPrincipal/session capability;
- verify no Better Auth private type leaks;
- keep `checkRequestAccess` only for account-closure product policy.

### AUTH-1502 — Make Auth disabled state an enforcement projection

Ensure closure coordinator is the only product path deciding Account closure; auth `disabledAt` follows it and does not form a second business lifecycle.

## LABEL lane — execute LABEL-1301..1305

- pure registry;
- Goal assignment -> Goal owner;
- Task assignment -> Task owner;
- bulk normalized lookup;
- Instant/Clock and typed color contract.

## PORTABILITY foundation lane

### PORT-1601 — Introduce V3 envelope and PortableCapability contract

Add versioned `PortableBackupEnvelopeV3` and a typed capability registration seam without deleting V2 reader yet.

### PORT-1602 — Implement registry/coordinator/dry-run pipeline

- topological capability order;
- host-owned identity;
- strict decode/migration/validate/apply;
- stable portable references;
- receipt and warning ledger.

### PORT-1603 — Add explicit V2 reader/migrator policy

No V2 writer. V2 remains input-only during migration window; retired Editor/Dashboard/runtime sections produce deterministic warnings instead of recreating dead state.

---

# Phase 2 — Knowledge foundation and retired knowledge-like modules

## KNOW-2001 — Implement KnowledgeSpace/binding split (ADR-089)

Separate binding, provider observation, sync fence and projection checkpoint. Preserve GitHub App safety and local Vault semantics.

## KNOW-2002 — Implement stable KnowledgeDocumentId (ADR-090)

- namespaced `memoflow_id`;
- no silent bulk mutation;
- adoption confirmation for existing notes becoming durable refs;
- rename/move identity preservation;
- duplicate-id conflict state.

## KNOW-2003 — Single KnowledgeProjectionEngine (ADR-091)

Unify webhook, confirmed web commit and reconciliation projection application. AI indexing becomes an independent consumer.

## EDITOR-1701 — Remove Editor capability from Portability V3

V3 exports no Editor section; V2 reader returns explicit ignored/retired warning.

## EDITOR-1702 — Drop legacy editor persistence

After 1701:

- Prisma editor models + Account relations;
- PowerSync tables/mappings;
- natural-key script/tests;
- editor projection/importer/adapters/contracts.

## GOV-1901 — Define deterministic Rule -> Knowledge Standard migrator

Pure transformation + fixtures preserving all meaningful Rule fields.

## GOV-1902 — Execute/verify Governance migration path

Use Knowledge write/migration service with no overwrite. Generate manifest: rule id/code -> documentId/path/contentHash.

## GOV-1903 — Move UI route to Knowledge Standards surface

Preserve `/governance/**` compatibility resolver temporarily; new canonical navigation is Knowledge/Standards.

## GOV-1904 — Delete product Governance bounded context

Remove Rule/Revision package/contracts/Prisma/PowerSync/API/IPC/Vue. Replace repository standards that cite Governance as reference implementation with a maintained real module.

**Hard guard:** repository engineering governance remains fully operational.

---

# Phase 3 — Goal and Task convergence

## GOAL lane — execute GOAL-7202..7211

Use Goal active plan as scoped detail. Hard dependency: KnowledgeDocumentId before durable Note relations.

Core outputs:

- lifecycle Planned/InProgress/Completed/Abandoned;
- GoalTimeframe target, no fake due/overdue;
- KR Measurement V3;
- Goal Brief as Knowledge;
- shared Labels/Relations;
- Goal Workspace read model;
- AI GoalPlanDraft V2 contract.

## TASK lane — continue Task plan from clean checkpoint

Resume only after Time/Label owner seams are ready. Continue from the existing TaskPlan/TaskOccurrence/schedule checkpoint, not from legacy templates.

Core outputs:

- Plan no longer owns occurrence collection;
- occurrence/result/checklist truth;
- reminder persistence parity;
- statistics read model;
- Goal link contribution semantics;
- Workspace composition.

---

# Phase 4 — Routine, Planner/Scheduler and Notification

## ROUTINE-2201 — Legacy Reminder -> Routine migration

Implement ADR-076~079:

- Definition/Profile/Trigger/RuntimeContext/TemporaryOverride;
- WallClock/Elapsed/ActiveUsage;
- Occurrence + Interaction;
- preserve reliability/fencing until scheduler path proves parity;
- delete ReminderTemplate/Group/Instance/Response legacy paths after migration.

## PLAN-2301 — CalendarEntry vNext

Implement ADR-080:

- Timed/AllDay range;
- remove duration/conflict/priority truth;
- occupancy projection;
- cross-source conflict read model;
- update Goal/Task/Routine projections.

## SCHED-2302 — ScheduledInvocation + InvocationAttempt

Implement ADR-081~083 while preserving SchedulingPort/reconcile and runtime reliability.

Delete legacy ScheduleTask/config/source-module only after parity.

## NOTIF-2401 — NotificationFact + Inbox lifecycle

Implement ADR-084/085:

- immutable content snapshot;
- readAt/archiveAt;
- WorkflowDefinition registry;
- tone/entity ref cleanup;
- retire template/category/type duplication.

## NOTIF-2402 — Delivery/Interaction boundary

Implement ADR-086~088:

- remove NotificationChannel aggregate truth;
- keep decision + outbox/receipt execution truth;
- typed action intents + Interaction;
- QuietHours with Product Time;
- product vs operations port split.

---

# Phase 5 — Home/Dashboard retirement and AI alignment

## HOME-1801 — Goal-owned progress summary

Add the minimum Goal read model required by TodayOverview and Goal capsule preview. Use Goal vNext lifecycle/target semantics; no `dueDate` compatibility in new contract.

## HOME-1802 — Replace Home Dashboard client

TodayOverview widgets consume owner services directly. Remove `useDashboard()` from Home/Goal capsule.

## HOME-1803 — Replace AI Dashboard analytics dependency

`ControlledAnalyticsReadAdapter` and Desktop equivalent compose explicit Goal/Task/Knowledge/activity read ports. Remove DashboardData cast.

## HOME-1804 — Decide ActivityLedger by evidence

If direct current product value exists, move to a narrow ActivityFeed capability; otherwise delete recorder/table. No generic analytics domain is invented.

## HOME-1805 — Hard-delete Dashboard

Remove package/contracts/API/IPC/Vue module/DashboardConfig/PowerSync mappings and update `/dashboard` compatibility tests.

## AI lane — execute AI-9602..9612 after owner contracts stabilize

Critical order:

- Conversation shell/Mastra authority;
- provider secret/model capability;
- ContextAssembler + UserTimeContext;
- Goal/Task/Routine owner contract alignment;
- stable KnowledgeDocumentId index;
- execution record cleanup;
- UI shadow workflow state removal;
- final eval/ops review.

---

# Phase 6 — Portable owner cutover and destructive residue deletion

## PORT-1610 — Implement owner capabilities for all surviving product facts

Each module registers its canonical V3 portable capability. No central persistence-shaped clone.

## PORT-1611 — Remove legacy V2 writer and old mini repository ports

V2 remains input migrator only for the agreed window; no newly exported backup uses old shapes.

## CLEAN-2601 — Whole-schema legacy sweep

Delete only after capability cutovers:

- old Repository/Folder/Resource tables;
- old Reminder tables;
- old ScheduleTask/Statistic models;
- NotificationTemplate/History/Channel legacy models;
- AI legacy quota/generation/message rows as approved by AI characterization;
- Account settings/contact residue;
- any orphan Dashboard/Editor/Governance schema.

Prisma + PowerSync parity is mandatory in the same batch.

---

# Phase 7 — Unified closure

## SYS-3001 — Cross-domain model review

Re-run the ownership matrix against actual code. Search for all retired vocabulary and forbidden imports. Every exception requires owner + reason + retire-by.

## SYS-3002 — Five-layer batch review

1. contract correctness;
2. vertical completeness;
3. behavioral completeness;
4. engineering quality;
5. plan/document truth.

Repair all P0/P1/P2 before delivery.

## SYS-3003 — Full validation

At minimum:

```bash
pnpm test:inventory
pnpm docs:check
pnpm governance:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Plus affected integration/E2E, PowerSync parity, Prisma migration checks, local Docker product journeys, AI eval replay, and exact-head CI.

## SYS-3004 — Documentation truth and plan archive

- current product module docs describe actual implementation;
- target notices removed once code is canonical;
- completed module active plans archived;
- this system-wide plan archives only after exact-head required CI and final review are green.

## 5. Parallelism / single-writer matrix

| Lane           | Can parallel with           | Must not share writer with                                           |
| -------------- | --------------------------- | -------------------------------------------------------------------- |
| Time           | Label, portability skeleton | Setting regional contracts, Task schedule contracts during same edit |
| Label Registry | Time, Auth                  | Goal/Task assignment schema migration                                |
| Account/Auth   | Time, Portability skeleton  | Setting preference contract cutover                                  |
| Knowledge      | Account/Auth                | Governance migration, AI index schema                                |
| Goal           | Routine foundation          | Task shared relation/contracts without coordination                  |
| Task           | Routine foundation          | Goal shared link/contracts without coordination                      |
| Scheduler      | Notification                | Planner shared schedule contracts                                    |
| Notification   | Scheduler                   | Routine intervention contracts without coordination                  |
| AI             | Home cleanup                | owner workflow DTOs until owner contracts frozen                     |
| Portability    | most lanes                  | destructive owner-table deletion before portable migration           |

## 6. Rollback strategy

- additive foundations first, destructive deletes last;
- each phase has a clean commit/checkpoint before deleting old paths;
- no long-lived runtime dual truth: compatibility adapters may exist only during a bounded phase;
- schema deletion requires both Prisma/PowerSync parity and importer migration evidence;
- if a vertical journey fails after cutover, revert the coherent batch rather than revive a second permanent truth.

## 7. Immediate next ticket

**SYS-0001 — capture exact current-system characterization** is now the next system-level ticket. SYS-0002 has closed the first low-risk dead surface; before broader contract/schema migrations, Phase 0 must establish executable characterization for Time timezone behavior, Account/Auth closure, Data Portability V2 safety, Knowledge projection, remaining Dashboard live consumers, Governance migration and Editor no-runtime residue.
