---
tags: [architecture, vnext, domain-model, north-star]
description: MemoFlow 全产品 vNext 统一领域模型与依赖方向
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-09T00:31:00+08:00
---

# MemoFlow vNext Unified Domain Model

## 1. North Star

```text
Cloud Auth ──> ExecutionContext ───────────────────────────────────────┐
Account/Profile                                                       │
Preferences ──> UserTimeContext ──> Product Time                      │
                                                                       │
Label Registry <──────────── Goal / Task owner assignments             │
                                                                       │
KnowledgeSpace ──> KnowledgeDocument                                  │
      ▲                  ▲                                             │
      │ stable refs      │ AI index                                    │
      │                  │                                             │
Goal ─┼──── Task ───── Routine ───── Planner                           │
      │       │           │            │                               │
      │       └──── SchedulingPort ────┴────> Scheduler                │
      │                                durable invocation               │
      │                                                                │
      └──── owner events / semantic intent ──> Notification            │
                                                │                      │
                                                └─ delivery runtime    │
                                                                       │
Assistant/Mastra ── ContextAssembler ── typed owner ports ─────────────┘

Settings UI = composition of owner capabilities
Home UI     = composition of owner read models
Portability = composition of owner portable capabilities
```

## 2. Product domain definitions

- **Goal** = Direction + Measurement + Context.
- **Task** = Action Plan + Occurrence + Context.
- **Routine** = Behavior Definition + Runtime + Occurrence + Intervention.
- **Planner** = Temporal Projection + User Arrangement.
- **Scheduler** = Durable Invocation + Attempt + Reliable Execution.
- **Notification** = User-visible Fact + Inbox State + Delivery policy/runtime.
- **Knowledge** = Stable Document Identity + Source Binding + Projection.
- **Account** = Product Profile + Product Lifecycle.
- **AI** = Reasoning/Workflow Capability; never owner-domain truth.

## 3. Composition surfaces, not domains

The following are intentionally **not** bounded contexts:

```text
Settings Hub
Home / Today Overview
Data Portability UI
Editor surface
```

They compose capabilities/read models from real owners.

## 4. Retired domains

- legacy Editor;
- standalone Dashboard;
- product Governance Rule DB;
- old generic Repository/Folder/Resource knowledge model;
- generic ReminderTemplate-as-routine model.

## 5. Dependency rule

Dependencies point inward toward stable foundations and owner contracts:

```text
UI/AI/Portability
    -> owner application/read/portable ports
       -> domain
          -> shared primitives/foundations
```

Forbidden:

```text
foundation -> Goal/Task/etc
Label Registry -> Goal/Task repositories
AI -> raw Prisma owner tables
Dashboard -> all module internals
DataPortability -> all persistence repositories
Scheduler -> business recurrence/domain meaning
```

## 6. Durable truth rule

Every state family has exactly one durable authority:

- business facts: owner domain;
- AI run/thread: Mastra;
- cloud auth session/credential: Better Auth;
- Git knowledge content: Vault/Git + Knowledge projection;
- scheduler execution: Scheduler invocation/attempt;
- notification delivery: delivery operation facts;
- user preferences: typed preference records;
- portable backup: generated snapshot, never live product truth.
