---
tags: [analysis, architecture, modules, vnext, convergence, cutover]
description: MemoFlow 所有主要产品模块最终诊断覆盖、文档一致性与 destructive-cutover readiness 审查
created: 2026-09-09T11:10:00+09:00
updated: 2026-09-09T11:10:00+09:00
---

# MemoFlow All-Module Final Convergence & Cutover Review

## 1. Verdict

**MODEL COVERAGE: PASS**

**CROSS-MODULE OWNERSHIP: PASS**

**LEGACY DATA / COMPATIBILITY STRATEGY: superseded by ADR-111**

在 ADR-111 生效后，本轮主要产品模块已经全部完成 current-system diagnosis 与 target-model convergence，可以进入大范围 destructive refactor。

## 2. Module coverage matrix

| Area                      | Current-system diagnosis                                      | Target / ADR          | Final disposition                                 |
| ------------------------- | ------------------------------------------------------------- | --------------------- | ------------------------------------------------- |
| Goal                      | `2026-09-08-goal-vnext-current-system-map.md`                 | ADR-067~070           | keep / rebuild to vNext                           |
| Task                      | `2026-09-08-task-vnext-current-system-map.md`                 | ADR-071~075           | keep / rebuild to Plan+Occurrence                 |
| Routine / legacy Reminder | `2026-09-08-reminder-routine-current-system-map.md`           | ADR-076~079           | Routine keeps; legacy Reminder deleted            |
| Planner / Scheduler       | `2026-09-08-schedule-scheduler-current-system-map.md`         | ADR-080~083           | split Planner vs reliable Scheduler               |
| Notification              | `2026-09-08-notification-current-system-map.md`               | ADR-084~088           | keep / rebuild Fact+Inbox+Delivery                |
| Knowledge / Repository    | `2026-09-08-knowledge-repository-vnext-current-system-map.md` | ADR-089~091           | keep Knowledge; old generic Repository deleted    |
| Settings / Preferences    | `2026-09-08-setting-vnext-current-system-map.md`              | ADR-092~095           | Settings Hub composition + typed preferences      |
| AI                        | `2026-09-09-ai-vnext-model-convergence-current-system-map.md` | ADR-096~099           | Mastra authority + typed owner contracts          |
| Product Time              | `2026-09-09-time-vnext-current-system-map.md`                 | ADR-100~101 + ADR-037 | shared foundation                                 |
| Label                     | `2026-09-09-label-vnext-current-system-map.md`                | ADR-102~103 + ADR-054 | shared registry; assignment owned by domains      |
| Account                   | `2026-09-09-account-current-system-map.md`                    | ADR-104               | Profile + lifecycle                               |
| Cloud Auth                | `2026-09-09-cloud-auth-current-system-map.md`                 | ADR-105 + ADR-039     | Better Auth capability boundary                   |
| Data Portability          | `2026-09-09-data-portability-current-system-map.md`           | ADR-106 + ADR-111     | V3 new-only owner capability registry             |
| Editor                    | `2026-09-09-editor-retirement-current-system-map.md`          | ADR-107 + ADR-111     | delete all remaining persistence residue          |
| Dashboard                 | `2026-09-09-dashboard-retirement-current-system-map.md`       | ADR-108 + ADR-111     | delete bounded context; Home stays UI composition |
| Governance                | `2026-09-09-governance-product-current-system-map.md`         | ADR-110               | permanently keep executable reference feature     |

## 3. Why shared/infrastructure packages do not require separate product modeling

The following repository packages are not missing product domains:

```text
contracts
database
domain-shared
patterns
powersync-schema
http-client
ipc-client
utils
ui-core
ui-vue-shadcn
ui-react-native
assets
app-react/app-vue hosts
```

They are shared contracts, infrastructure, host/UI or reusable engineering foundations. Their boundaries are covered by architecture/governance audits rather than independent business aggregates.

`cloud-auth`, `time`, `label` are exceptions because they expose shared product semantics and therefore received explicit modeling.

## 4. Cross-module ownership check

Canonical owners remain non-overlapping:

```text
Credentials/session          Better Auth / Cloud Auth
Product profile/lifecycle    Account
Presentation/regional prefs  Preferences
Product time math            @memoflow/time
Label identity               Label Registry
Goal truth                   Goal
Task plan/execution          Task
Routine behavior             Routine
Calendar arrangement         Planner
Reliable wake-up             Scheduler
Inbox/delivery               Notification
Knowledge identity/content   Knowledge
AI reasoning/workflow        Mastra + AI capability
Structured coding standards  Governance
Backup orchestration         Data Portability
Home                         UI composition only
```

No target-level ownership collision remains.

## 5. Retire/delete list under clean-slate policy

No data migration gate is required before deleting:

```text
TaskTemplate / TaskInstance legacy symbols/shape
ReminderTemplate / ReminderGroup / ReminderInstance / ReminderResponse legacy storage
ScheduleTask / ScheduleConfig / legacy statistics
NotificationTemplate / NotificationChannel / legacy history shapes not in target
Repository / Folder / Resource legacy knowledge tables
Editor persistence/contracts/portable payload
Dashboard package/contracts/API/IPC/config
Account.settings and duplicate contact/profile residue
legacy UserSetting giant tree
AI legacy message/quota/generation-task persistence without target ownership
path-derived durable Knowledge relation ids
Data Portability V2 reader/writer/migrator
legacy compatibility DTO/API/route adapters
```

Governance is explicitly excluded.

## 6. Database policy

Because there is no data to preserve, implementation may reset all current business data and rebuild from canonical schema.

Preferred operational rule:

```text
change contracts/domain/schema
→ update Prisma + PowerSync in same batch
→ reset/recreate database
→ fresh seed
→ run vertical tests/E2E
```

Do not add backfill code merely to make old rows survive.

## 7. What still requires sequencing

“No migration” removes data-preservation dependencies but does not remove compile/runtime dependencies.

Still sequence:

1. Product Time / shared contracts before consumers;
2. Preferences/Account/Auth foundations before Settings and AI context consumers;
3. KnowledgeDocumentId before Goal/Task durable knowledge relations and AI knowledge index;
4. Task/Routine schedule semantics before final Scheduler/Notification owner adapters;
5. owner read models before Dashboard deletion;
6. canonical owner portable schemas before final Data Portability V3 registration;
7. shared Prisma/PowerSync writers remain single-writer per batch.

## 8. Readiness gate

The project is ready for destructive implementation when:

- ADR-111 is indexed and the system-wide plan adopts it;
- active module plans explicitly defer to ADR-111 for legacy-data/compatibility clauses;
- Governance remains protected by ADR-110;
- repository worktree is clean;
- focused baseline/governance checks remain green.

After those document updates, there is no architectural reason to delay the main refactor for migration compatibility work.
