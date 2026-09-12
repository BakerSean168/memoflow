---
tags: [analysis, data-portability, migration, vnext]
description: Data Portability V2 当前契约、旧模块 DTO 与 owner-driven vNext 差距地图
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-09T00:31:00+08:00
---

# Data Portability Current-System Map

## 1. Executive finding

Data Portability 的定位正确：它没有自己的业务 Domain，而是跨 owner 的 export/import orchestrator。问题在于 `PortableUserDataV2` 已经逐渐成为一份 **复制所有模块内部模型的第二套产品 schema**，而上游 Goal/Task/Routine/Planner/Knowledge/Setting/AI 已全面重建，因此 V2 已显著陈旧。

## 2. Current strengths

- `memoflow.user-data-export` 与 `memoflow.server-held-data-disclosure` 完全分离。
- server-held disclosure 明确不可导入。
- import identity 由 trusted ExecutionContext 提供；payload 中持久 ID、auth、token/password/secret 等字段 fail closed。
- 支持 dry-run、warning、created/updated/skipped receipt。
- Web/API 与 Desktop/PowerSync 均有明确 adapter。
- package 自己没有 Domain Aggregate。

这些全部应保留。

## 3. Verified model drift in schemaVersion 2

### Goal

仍包含 `description/motivation/feasibilityAnalysis/dueDate/completedAt/reminderConfig`，KR 仍使用 `startingValue/progressBaselineValue`，与 Goal vNext ADR-067~070 冲突。

### Task

仍包含 `taskType/tags/color/timeConfig/recurrenceRule/reminderConfig/lastGeneratedDate/generateAheadDays` 和 templates/instances 命名，与 TaskPlan/TaskOccurrence + canonical schedule 冲突。

### Reminder/Routine

仍以 legacy `ReminderGroup/ReminderTemplate/ReminderResponse` 为主要 portable truth，而 Routine vNext 已定义 Definition/Profile/Trigger/Occurrence/Interaction。

### Schedule/Scheduler

仍导出 Calendar `duration/priority` 与 legacy `ScheduleTask sourceModule/enabled/schedule/execution/metadata`，与 Planner/ScheduledInvocation target 冲突。Scheduler reliable runtime state 本来也不应该进入普通 user backup。

### Knowledge/Repository

仍导出旧 `Repository/Folder/Resource`，而 Knowledge vNext 已定义 KnowledgeSpace、binding、stable KnowledgeDocument。Git content/projection/cache/lease 也不能混成 importable business truth。

### Editor

仍完整导出/导入已经退休的 EditorWorkspace/Session/Group/Tab。它是阻碍旧 editor tables 最终删除的主要兼容边界。

### AI

仍将 `AIConversation + AiMessage[]` 当作 portable product truth，和 Mastra thread authority + thin Conversation shell target 冲突。Provider secret、execution records、index vectors也不应进入普通 backup。

### Settings

仍是开放 `preferences: Record<string, unknown>`，与 namespace-scoped typed UserPreference vNext 冲突。

### Notification

已有独立 preference portable shape，但仍使用旧 DND/rateLimit envelope；Notification Fact/Delivery runtime 的 portable ownership需要重新区分。

## 4. Structural coupling problem

`DataPortabilityDependencies` 自己定义 GoalRepoPort、TaskPlanRepoPort、ReminderTemplateRepoPort、RepositoryRepoPort、ScheduleTaskRepoPort、EditorWorkspaceRepoPort、AIConversationRepoPort 等 mini-repository interfaces。

这使 Data Portability 必须知道每个模块的 persistence shape，并在每次 owner 重构后同步重写 projection/importer。

## 5. Target

Data Portability 应拥有：

```text
PortableBackupEnvelope
PortableCapabilityRegistry
ImportCoordinator
ReferenceResolver
SafetyPolicy
MigrationPipeline
Receipt
```

各 owner 模块拥有：

```text
GoalPortableCapability
TaskPortableCapability
RoutinePortableCapability
KnowledgePortableCapability
PreferencePortableCapability
...
```

每个 capability 负责自己的：

- schema/version；
- export projection；
- dry-run validation；
- import/apply adapter；
- portable reference production/consumption；
- legacy version migration（如需）。

Data Portability 只编排 dependency order 和 cross-capability refs，不复制 owner internal persistence model。

## 6. Backup classes

必须继续区分：

1. **Importable User Business Backup** — 用户拥有、可恢复的产品事实；
2. **Server-held Disclosure** — 合规/透明度导出，不可导入；
3. **Device-local Optional Export** — 只有明确 host capability 时才导入；
4. **Runtime/Projection/Cache** — 不作为 user backup truth。
