---
tags: [analysis, architecture, convergence, vnext, review]
description: ADR-067~111 系统级 ownership、冲突、依赖、退休语义与 destructive-cutover 统一审查
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-09T00:31:00+08:00
---

# MemoFlow System-wide vNext Model Convergence Review

## 1. Review scope

本审查统一检查本轮重新建模的所有核心能力：

```text
Goal                 ADR-067~070
Task                 ADR-071~075
Routine              ADR-076~079
Planner/Scheduler    ADR-080~083
Notification         ADR-084~088
Knowledge            ADR-089~091
Settings             ADR-092~095
AI                   ADR-096~099
Product Time         ADR-100~101 (+ ADR-037)
Label                ADR-102~103 (+ ADR-054)
Account              ADR-104
Cloud Auth           ADR-105 (+ ADR-039)
Data Portability     ADR-106
Editor retirement    ADR-107
Dashboard retirement ADR-108
Governance reference   ADR-110 (supersedes ADR-109)
Cutover policy         ADR-111
```

目标不是检查文字风格，而是回答：**同一个事实是否只有一个 owner；一个 runtime 是否只有一个 durable truth；跨模块是否使用稳定 contract 而不是互相复制内部状态。**

## 2. Canonical ownership matrix

| Concern                                 | Canonical owner                           | Other modules may do                    | Forbidden duplicate truth                      |
| --------------------------------------- | ----------------------------------------- | --------------------------------------- | ---------------------------------------------- |
| cloud credential/session/provider       | Better Auth via Cloud Auth                | consume `CloudPrincipal` / capability   | Account/Auth clone tables                      |
| local Desktop access                    | Local Profile Access                      | cloud binding status                    | `isAuthenticated` gating local data            |
| product profile                         | Account                                   | compose cloud email for display         | Better Auth name/image as profile truth        |
| presentation/regional preference        | User Preferences                          | consume via narrow ports                | Account.settings                               |
| user timezone context                   | Preferences value + Product Time behavior | explicit schedule timezone snapshot     | host timezone fallback                         |
| Instant/Ymd/Hm/calendar/recurrence math | Product Time                              | domain owns business schedule semantics | date-fns/private date math in domains          |
| label identity/name/color               | Label Registry                            | Goal/Task own assignments               | Label knows every target domain                |
| Goal direction/measurement              | Goal                                      | Task links, Knowledge refs              | AI/Dashboard copies Goal truth                 |
| Task action plan                        | TaskPlan                                  | Goal link, schedule intent              | legacy template/generation fields              |
| Task happened execution                 | TaskOccurrence                            | Planner projection                      | TaskPlan owns occurrence collection            |
| Routine behavior intent                 | RoutineDefinition/Profile                 | Notification/Planner read projections   | legacy ReminderTemplate as generic reminder DB |
| Planner occupied calendar               | Schedule/Planner                          | project owner items                     | Scheduler worker records as calendar truth     |
| exact reliable wake-up                  | Scheduler                                 | receives ScheduledIntent                | cron/business recurrence in worker aggregate   |
| user-visible notification fact          | NotificationFact                          | owner emits requested intent            | delivery status as Fact child truth            |
| notification delivery                   | Notification policy/runtime               | device final presentation               | Routine/Task owns channels/DND                 |
| knowledge document content              | Vault/Git + Knowledge projection          | Goal/Task reference stable documentId   | legacy DB Resource as knowledge truth          |
| stable knowledge identity               | KnowledgeDocumentId                       | AI index/ref use it                     | path-derived ids                               |
| AI thread/workflow state                | Mastra                                    | thin Conversation shell/read projection | UI localStorage full workflow snapshot         |
| AI provider secret                      | Secret boundary                           | provider connection references it       | plaintext domain/client DTO                    |
| portable backup orchestration           | Data Portability                          | owner capability supplies schema/apply  | giant cloned module DTO model                  |
| Home overview                           | UI composition + owner read models        | cross-widget composition                | Dashboard bounded context/God DTO              |
| structured coding/architecture rules    | Governance Rule/RuleRevision              | Knowledge/AI may reference/project      | Knowledge document replacing Rule lifecycle    |
| engineering governance                  | repository tools/docs/CI                  | consume versioned Governance bundles    | CI depending on live developer Rule DB         |

**Result:** no unresolved canonical-owner collision remains in the target model. Existing collisions are migration work, not target ambiguity.

## 3. Cross-ADR conflict review

### 3.1 Time vs Settings — resolved

Preferences owns the user's chosen `timeZone/weekStartsOn/display style`; Product Time owns validation, conversion, calendar/format/recurrence behavior. Domain entities with explicit schedule timezone keep their snapshot and do not silently mutate when preference changes.

### 3.2 Account vs Cloud Auth vs Settings — resolved

- Better Auth: login credential/email verification/session.
- Account: profile + product lifecycle.
- Preferences: theme/language/timezone.
- Notification: delivery preferences.

`Account.settings` and mutable Account login-email semantics are migration residue.

### 3.3 Goal/Task vs Knowledge — resolved

Goal/Task may reference `KnowledgeDocumentRef`, but Knowledge owns document identity/content. Durable references require stable `KnowledgeDocumentId`; path/blob/commit are not domain identities.

### 3.4 Goal/Task/Routine vs Scheduler — resolved

Business owners decide **when/why** something should happen and reconcile `ScheduledIntent`; Scheduler only guarantees durable invocation. Recurrence remains upstream or in Product Time engine, not in Scheduler persistence.

### 3.5 Routine vs Notification — resolved

Routine owns behavior/intervention meaning and user interaction outcome; Notification owns fact/inbox/delivery semantics. Sound/device presentation belongs device surface.

### 3.6 Planner vs Task/Routine/Goal — resolved

Planner owns user-created CalendarEntry and cross-domain temporal projection. It does not mutate foreign projections directly; owner commands route back to Goal/Task/Routine.

### 3.7 AI vs all owner domains — resolved

AI owns reasoning runtime/context/draft/workflow execution only. Deterministic apply calls owner ports. AI contracts must reuse owner semantic contracts rather than maintain old DTO copies.

### 3.8 Data Portability vs owner modules — resolved

Data Portability owns envelope/order/safety/migration, while each domain owns the portable schema and validation for its facts. Runtime/projection/cache data are excluded unless explicitly classified.

### 3.9 Dashboard/Home — resolved by retirement

Home is a view composition, not a domain. No new `OverviewData` replacement God DTO is allowed.

### 3.10 Governance/Knowledge/Engineering Governance — resolved by explicit layering

ADR-110 supersedes the earlier retirement proposal. Product/Reference Governance keeps Rule/RuleRevision as canonical structured standards truth and remains a permanent executable feature. Knowledge may link/index Governance rules but does not replace their lifecycle or revisions. Repository Engineering Governance remains deterministic tooling/docs/CI and may consume only explicitly published, versioned Governance rule bundles rather than a live developer database.

## 4. Retired vocabulary / no-return table

| Retire                                       | Replacement                                  |
| -------------------------------------------- | -------------------------------------------- |
| TaskTemplate                                 | TaskPlan                                     |
| TaskInstance                                 | TaskOccurrence                               |
| ReminderTemplate as routine model            | RoutineDefinition                            |
| ReminderGroup                                | RoutineProfile                               |
| FixedTime/Interval trigger pair              | WallClock/Elapsed/ActiveUsage                |
| ScheduleTask worker aggregate                | ScheduledInvocation                          |
| NotificationChannel as aggregate child truth | delivery decision + execution projection     |
| NotificationTemplate product aggregate       | WorkflowDefinition/render strategy           |
| Repository/Folder/Resource knowledge truth   | KnowledgeSpace/Document projection           |
| path-derived Note identity                   | KnowledgeDocumentId                          |
| UserSetting giant settings tree              | typed user preferences + owner settings      |
| Account.settings                             | Preferences / NotificationPreference         |
| AI full workflow localStorage snapshot       | Mastra run + UI pointer/unsaved state        |
| Dashboard bounded context                    | Home owner-read-model composition            |
| Editor bounded context                       | Knowledge preview/external editor capability |
| Data Portability cloned internal schemas     | owner-driven PortableCapability              |

Architecture locks should reject reintroduction after each migration closes.

## 5. Shared foundations after convergence

Only a small number of genuinely shared concepts remain:

```text
Contracts primitives
Product Time
Label Registry
Relation / stable references
ExecutionContext / Identity
Business Operation reliability contracts
NotificationRequested
SchedulingPort
PowerSync parity infrastructure
Result / failure contracts
```

A shared package is justified only when the concept is domain-neutral and multiple owner modules use the same semantics. `Dashboard`, `Editor` and generic Repository do not meet that test. Governance remains intentionally independent for a different reason: it is a permanent executable reference feature, not a generic shared utility.

## 6. Dependency review

```text
Time + Preferences + Account/Auth + DataPortability V3 foundation
             │
             ├──────── Label Registry ownership cleanup
             │
             ├──────── Knowledge stable identity / projection engine
             │              │
             │              └── AI Knowledge index
             │
             ├──────── Governance reference-module hardening
             │              └── versioned rule-bundle bridge to engineering governance
             │
             └──────── Goal + Task convergence
                            │
                            ├── Routine
                            ├── Planner/Scheduler
                            ├── Notification
                            └── Home/Dashboard retirement
                                   │
                                   └── AI final semantic alignment

DataPortability V3 must precede destructive legacy-table deletion.
```

## 7. Execution policy convergence — ADR-111

本轮不再以旧 MemoFlow 数据或旧客户端兼容为约束。ADR-111 supersede ADR-067~110 中所有仅为 legacy data preservation / compatibility window 服务的实施条款。

因此统一执行语义改为：

```text
old model / old schema / old API
        ↓
change all current consumers in one coordinated batch
        ↓
delete old surface immediately
        ↓
reset/reseed database
```

不再要求 legacy row backfill、V2 reader/migrator、old-route redirect、bounded dual-read/write、before/after old-data parity。

这不改变本文件前面的 owner/domain 决策，也不削弱 Scheduler/Notification/Auth/Knowledge/AI runtime 等 reliability/security invariants。

## 7. Remaining intentional questions, not model conflicts

1. ActivityLedger: keep as independent activity feed only if characterization finds a real Home/AI consumer; otherwise delete.
2. optional Account realName/gender/birthday: keep only if a current product journey consumes them; this does not affect ownership.
3. Label color representation: palette token vs strict hex is a UI/product choice, not ownership ambiguity.
4. Product Time DST gap/overlap policy: must be explicitly selected during implementation, but ownership is already fixed.

None blocks the unified model.

## 9. Review verdict

**PASS — READY FOR DESTRUCTIVE IMPLEMENTATION.** Target ADRs are mutually compatible. ADR-111 removes the remaining legacy-data/compatibility burden. Remaining contradictions are implementation residue in current code/schema and can be deleted through coordinated canonical cutovers rather than migrated.
