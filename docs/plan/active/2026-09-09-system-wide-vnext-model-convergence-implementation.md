---
tags: [plan, active, vnext, system-wide, convergence]
description: MemoFlow 全模块模型收敛唯一执行顺序、destructive cutover、验证与最终删除计划
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-09T11:15:00+09:00
---

# MemoFlow System-wide vNext Model Convergence — Implementation Plan

> **Execution-order authority:** 本文是本轮系统级重构的唯一执行顺序真值。Goal/Task/Setting/AI/Time+Label 既有 active plans 继续提供模块内部实施细节，但不得绕过本文依赖顺序并行写同一 contract/schema。
>
> **Control plane:** Pixel control plane `127.0.0.1:8320` 在本计划创建时不可用，因此当前 canonical execution truth 是 GCP Dev repository branch/commit + 本计划。Pixel 恢复后只允许 attach/recover 一个 durable plan，不创建重复 writer。
>
> **ADR-111 execution override:** 当前无需要保留的 MemoFlow 生产业务数据，也不要求兼容旧客户端/旧备份。本计划从此采用 destructive cutover：不写 legacy data backfill、不保留 old/new dual-read/write、不保留 V2 reader/migrator、不保留旧 route/API alias。当前 consumer 原子切到 canonical contract 后直接删除旧 surface，并 reset/reseed persistence。

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
Governance   permanent executable reference feature + dev standards workbench
```

并物理退休：

```text
legacy Reminder model
legacy ScheduleTask model
legacy Repository/Folder/Resource
legacy Editor
standalone Dashboard
Account.settings
AI legacy product/runtime persistence
stale PortableUserDataV2 internal-model clones
```

## 2. Non-goals

- 不重写 Mastra、Better Auth、PowerSync、Prisma、rrule 或 date-fns；
- 不创建新的 generic God modules（HomeData, EntitySettings, GenericAssignment, GenericRepository 等）；
- 不为旧 MemoFlow 数据、旧客户端或旧备份维护任何 compatibility layer / migration window；
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
12. canonical current-user journeys/deep links；legacy redirects/aliases are not protected under ADR-111；
13. Governance executable reference feature: Rule/RuleRevision + Prisma/PowerSync + API/IPC + client/Vue + reference tests.

## 4. Global dependency order

```text
PHASE 0  Baseline / locks / dead-surface cleanup
   │
PHASE 1  Foundations
   ├─ Time
   ├─ Preferences + Account/Auth
   ├─ Label Registry
   └─ Data Portability V3 skeleton

PARALLEL  Governance reference hardening (GOV-1901..1904)
          starts after Phase 0 and is never a retirement lane
   │
PHASE 2  Knowledge identity/projection
   └─ Editor retirement
   │
PHASE 3  Goal + Task
   │
PHASE 4  Routine + Planner/Scheduler + Notification
   │
PHASE 5  Home/Dashboard retirement + AI semantic alignment
   │
PHASE 6  Portable V3 owner registration + whole-schema residue deletion
   │
PHASE 7  whole-system review / exact-head CI / release closure
```

Within a phase, lanes may run in parallel only when they do not write the same contracts/schema. No data-migration lane exists under ADR-111.

---

# Phase 0 — Baseline, architecture locks and high-confidence dead surfaces

## SYS-0001 — Capture exact current-system characterization

**状态：DONE — 2026-09-09 characterization baseline frozen**

**Goal:** turn every target-changing behavior into executable characterization before destructive edits.

**Implementation:**

1. record exact HEAD and clean-worktree baseline;
2. add/refresh focused characterization for Time host timezone, Account/Auth closure, Knowledge projection, Dashboard live consumers, Governance executable reference behavior and Editor no-runtime boundary; legacy V2 import behavior is not a preservation target;
3. update test inventory only because implementation now legitimately changes test surfaces;
4. ensure each future delete has a consumer search fixture or architecture lock.

**Tests:** focused package tests + `pnpm test:inventory` + governance.

**Acceptance:** every legacy surface scheduled for deletion is either behavior-characterized for surviving semantics or proven to have zero required current consumer. No old-data migration test is required.

**Closure evidence:**

- Time host drift + explicit IANA + DST gap/overlap + locale/week-start characterization added; recurrence conformance remains green;
- Account closure coordinator and raw Better Auth closure enforcement integration tests green;
- Data Portability security boundary characterization exists; ADR-111 supersedes legacy Editor/V2 backup restoration obligations;
- Knowledge projection + legacy Editor no-runtime boundary green;
- Dashboard remaining Home/Goal/AI consumers frozen in an executable surface test;
- Governance Rule/Revision executable reference behavior and canonical field inventory frozen;
- evidence map: `docs/analysis/2026-09-09-system-vnext-characterization-baseline.md`.

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

**状态：DONE — staged no-return governance active**

**Goal:** encode retired vocabulary/ownership boundaries from system-wide review as staged governance locks.

Locks activate when the canonical replacement ticket closes; then reintroducing the retired surface fails governance. ADR-111 removes compatibility-window requirements.

**Closure evidence:**

- `tools/governance/vnext-retirement-manifest.json` owns active/staged retirement locks;
- active locks protect already-retired Dashboard page-only surfaces and Editor runtime package;
- future Dashboard bounded context, Editor persistence, Account.settings and legacy Reminder/Scheduler/Notification surfaces remain staged; Governance is explicitly excluded from retirement locks by ADR-110;
- audit is part of `memoflow:governance-check` and has dedicated governance-tools tests.

---

# Phase 1 — Foundations

## TIME lane — execute existing TIME-1201..1206

Canonical detail: `2026-09-09-time-label-vnext-model-convergence.md`.

Order:

1. TIME-1201 **DONE** — host drift / IANA / DST / locale / week-start + recurrence characterization frozen;
2. TIME-1202 **DONE** — branded `TimeZoneId`, `TimeContext`, `TimePresentationStyle`; the temporary legacy adapter is now deletion debt under ADR-111;
3. TIME-1203 **DONE** — timezone-aware Calendar/Input + shared wall-clock resolver;
4. TIME-1204 **DONE** — locale/timezone-aware Format + official `@date-fns/tz` fixed-pattern adapter;
5. TIME-1205 atomically switch cross-module consumers;
6. TIME-1206 remove raw number/Date compatibility and host-local fallbacks.

**Global gate:** no server business calendar semantics may read ambient host timezone.

## PREF-ACCOUNT-AUTH lane

### ACC-1401 — Characterize Account profile/lifecycle/closure

- prove current Desktop local profile behavior;
- prove cloud Account closure/revocation/retry;
- enumerate real consumers of realName/gender/birthday/phone/Suspended/version.

### SETTING-9202 — Canonical preference namespace foundation

**状态：DONE — 2026-09-09**

Canonical `presentation | regional` contracts, portable `TimeZoneId`, per-namespace Prisma/PowerSync rows, real revision CAS and creation-race recovery are implemented. Current transports intentionally remain on legacy `UserSetting` until the immediate coordinated cutover; there is no backfill/dual-read/dual-write compatibility lane.

**Next coordination gate:** execute `SETTING-9203` together with `TIME-1205` consumer cutover before retiring Account/Setting legacy preference truth.

### ACC-1402 — Introduce AccountView + CloudIdentitySummary composition

**Goal:** UI can display profile + login email verification without Account owning mutable auth email.

- compose CloudPrincipal/CloudAuth user safe summary at host/application boundary;
- no token/provider secret fields.

### ACC-1403 — Retire Account.settings

Depends on Setting presentation/regional + Notification preference consumers being live.

Delete AccountSettings VO, `/me/settings`, event, DTO field and persistence column in the canonical preference cutover batch. No value backfill or compatibility reader.

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

Add `PortableBackupEnvelopeV3` and a typed capability registration seam as the only supported portable format. Do not retain the V2 reader.

### PORT-1602 — Implement registry/coordinator/dry-run pipeline

- topological capability order;
- host-owned identity;
- strict decode/validate/apply for V3;
- stable portable references;
- receipt and warning ledger.

### PORT-1603 — Delete V2 portability compatibility

Remove V2 reader/writer/migrator contracts and tests. Old backups are unsupported in this refactor. V3 contains only surviving owner facts.

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

V3 exports no Editor section. Delete V2 Editor payload handling entirely; no compatibility warning/import path is required.

## EDITOR-1702 — Drop legacy editor persistence

After 1701:

- Prisma editor models + Account relations;
- PowerSync tables/mappings;
- natural-key script/tests;
- editor projection/importer/adapters/contracts.

# Parallel Governance reference lane — permanent, non-retirement

ADR-110 supersedes the earlier Governance -> Knowledge retirement plan. Governance stays as a deliberately simple but fully executable reference feature.

## GOV-1901 — Freeze executable reference-module invariants

**Goal:** make the reference responsibility explicit and executable.

**Implementation:**

1. characterize Rule CRUD/search/lifecycle/revision behavior;
2. characterize Prisma/PowerSync parity and HTTP/IPC transport parity;
3. lock canonical public seams and host-owned composition;
4. keep README / QUICK_REFERENCE synchronized with the actual package shape.

**Acceptance:** a developer can use Governance as the canonical example for a complete MemoFlow feature without consulting a retired/legacy seam.

## GOV-1902 — Define development-surface policy and smoke path

Governance must remain actually runnable in development/diagnostic mode. Define the surface gate without allowing hidden navigation to become dead code. Add a smoke path that opens the rule list, creates/updates a rule and observes RuleRevision.

**Protected:** package/API/IPC/persistence/UI remain real; production navigation visibility is policy, not ownership.

## GOV-1903 — Add deterministic published rule-bundle boundary

Define a versioned/hashable `GovernanceRuleBundle` projection/export containing Active rules, revision/provenance and executable metadata needed by engineering adapters. Bundle generation must be deterministic and must not mutate repository source.

**Acceptance:** same Governance state + same bundle schema version produces the same semantic bundle/hash.

## GOV-1904 — Bridge Governance rules to engineering check/report/autofix adapters

Add an explicit adapter from a pinned/versioned rule bundle into `tools/governance`-style check/report/autofix proposal flows. CI must consume a repository-versioned or otherwise pinned snapshot, never a developer's live Rule DB. Autofix produces reviewable diffs/proposals rather than silently changing product source.

**Hard guards:**

- never migrate Rule/RuleRevision to Knowledge as replacement truth;
- never place `packages/governance` or Governance contracts in retirement manifests;
- repository engineering governance remains deterministic and independently runnable.

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

## ROUTINE-2201 — Replace Legacy Reminder with Routine

Implement ADR-076~079:

- Definition/Profile/Trigger/RuntimeContext/TemporaryOverride;
- WallClock/Elapsed/ActiveUsage;
- Occurrence + Interaction;
- preserve reliability/fencing behavior through characterization while changing the model;
- delete ReminderTemplate/Group/Instance/Response storage/contracts in the same coordinated cutover; no row converter.

## PLAN-2301 — CalendarEntry vNext

Implement ADR-080:

- Timed/AllDay range;
- remove duration/conflict/priority truth;
- occupancy projection;
- cross-source conflict read model;
- update Goal/Task/Routine projections.

## SCHED-2302 — ScheduledInvocation + InvocationAttempt

Implement ADR-081~083 while preserving SchedulingPort/reconcile and runtime reliability.

Delete legacy ScheduleTask/config/source-module in the canonical Scheduler cutover once reliability behavior tests are green. No legacy row conversion.

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

Remove package/contracts/API/IPC/Vue module/DashboardConfig/PowerSync mappings and delete the `/dashboard` compatibility redirect/tests.

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

# Phase 6 — Portable V3 owner registration and destructive residue deletion

## PORT-1610 — Implement owner capabilities for all surviving product facts

Each module registers its canonical V3 portable capability. No central persistence-shaped clone.

## PORT-1611 — Assert V3-only portability surface

Delete any remaining V1/V2 reader/writer/migrator code, old mini repository ports and compatibility fixtures. Only V3 owner capabilities remain.

## CLEAN-2601 — Whole-schema legacy sweep

Delete only after capability cutovers:

- old Repository/Folder/Resource tables;
- old Reminder tables;
- old ScheduleTask/Statistic models;
- NotificationTemplate/History/Channel legacy models;
- AI legacy quota/generation/message rows as approved by AI characterization;
- Account settings/contact residue;
- any orphan Dashboard/Editor schema. Governance schema is permanent reference-feature state and is not a deletion candidate.

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

Plus affected integration/E2E, PowerSync parity, fresh Prisma bootstrap/reset checks, local Docker product journeys, AI eval replay, and exact-head CI.

## SYS-3004 — Documentation truth and plan archive

- current product module docs describe actual implementation;
- target notices removed once code is canonical;
- completed module active plans archived;
- this system-wide plan archives only after exact-head required CI and final review are green.

## 5. Parallelism / single-writer matrix

| Lane           | Can parallel with           | Must not share writer with                                           |
| -------------- | --------------------------- | -------------------------------------------------------------------- |
| Time           | Label, portability skeleton | Setting regional contracts, Task schedule contracts during same edit |
| Label Registry | Time, Auth                  | Goal/Task assignment schema cutover                                  |
| Account/Auth   | Time, Portability skeleton  | Setting preference contract cutover                                  |
| Knowledge      | Account/Auth                | AI index schema                                                      |
| Goal           | Routine foundation          | Task shared relation/contracts without coordination                  |
| Task           | Routine foundation          | Goal shared link/contracts without coordination                      |
| Scheduler      | Notification                | Planner shared schedule contracts                                    |
| Notification   | Scheduler                   | Routine intervention contracts without coordination                  |
| Governance     | most owner-domain lanes     | tools/governance adapters while SYS governance manifests are edited  |
| AI             | Home cleanup                | owner workflow DTOs until owner contracts frozen                     |
| Portability    | most lanes                  | owner contract/schema edits in the same batch                        |

## 6. Rollback strategy

- each destructive batch starts from a clean commit/checkpoint;
- rollback means source/deployment rollback plus database reset/reseed, not runtime compatibility code;
- Prisma and PowerSync canonical parity must land in the same coherent batch;
- if a vertical journey fails after cutover, revert the coherent batch and recreate persistence from the prior source revision; never revive a second permanent truth.

## 7. Immediate next ticket

**TIME-1204 — make Format locale/timezone aware** is now the next single-writer Product Time ticket. TIME-1203 made Calendar/Input/Codec day and wall-clock semantics explicit and host-independent; TIME-1204 now owns human-facing locale/timezone formatting and removal of fixed Chinese display assumptions.
