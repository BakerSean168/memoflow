---
tags:
  - adr
  - ai
  - workflow
  - draft
  - apply
  - execution
  - observability
  - migration
  - vnext
description: ADR-099 - AI Workflow Draft/Apply、stable draftRef、ExecutionRecord 与 legacy AI persistence retirement
created: 2026-09-09T00:00:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# ADR-099: AI Workflow Draft、Apply 与 Execution Record Boundary

**状态：** 已采纳（待实施）
**日期：** 2026-09-09
**影响范围：** Goal/Task/Knowledge AI Workflows、Routine tools、AI execution log、Prisma/PowerSync、Data Portability、Eval/Operations、Vue workflow editors
**依赖：** ADR-050～052、ADR-067～079、ADR-089～091、ADR-096～098
**修订：** ADR-070 的 GoalPlanDraft V2 继续作为 Goal draft 真值；本 ADR 将同一原则推广到 Task/Knowledge/owner-domain alignment 与 AI operations persistence

## 1. 决策摘要

MemoFlow AI durable workflow 继续使用：

```text
Mastra Workflow
 -> typed draft
 -> HITL review
 -> deterministic Apply
 -> owner application ports
```

本 ADR 冻结四个收敛原则：

1. Workflow Draft 只表达 owner-domain 的 canonical target semantics，不长期维护 AI-only 业务 DSL；
2. draft 内跨实体关系统一使用 stable `draftRef`，不使用数组下标作为 semantic identity；
3. Apply 的 child idempotency 由 `workflowRunId + revision + draftRef + operation` 派生；
4. 当前 `AiGenerationTask` 改义/迁移为 `AIExecutionRecord`，只承载 operations/usage projection，不复制 workflow state；无 current product consumer 的 `AiUsageQuota`、`KnowledgeGenerationTask` 进入明确 deletion candidate 队列。

## 2. Workflow state 与 product fact 再确认

### 2.1 Workflow state

Mastra owns：

```text
run status
step/snapshot
clarification
review suspension
runtime draft
retry/recovery cursor
cancel state
result projection
```

### 2.2 Product fact

Owner modules own：

```text
Goal / KR
TaskPlan / TaskOccurrence
RoutineDefinition / RoutineOccurrence
KnowledgeDocument
Notification Fact
```

### 2.3 Draft 的地位

Draft 是：

```text
workflow intermediate state
```

不是：

```text
persistent Product Aggregate
```

除非未来用户明确获得“保存草稿”产品能力，否则不新建 GoalDraft/TaskDraft/KnowledgeDraft 数据表。

## 3. GoalPlanDraft V2

ADR-070 继续有效：

```text
GoalPlanDraftV2
├── goal
├── keyResults[]
├── tasks[]
├── knowledge[]
├── rationale
├── warnings[]
└── revision
```

### 3.1 Goal target vocabulary

Goal draft 跟随 ADR-067：

```text
name
summary?
status: Planned | InProgress
startDate?: Ymd
target?: GoalTimeframe
labels?
```

不再把旧：

```text
description
motivation
feasibilityAnalysis
dueDate
```

写入 Goal target model。

需要长期 Why/Feasibility/Strategy 时，通过 Knowledge draft 创建/关联 Goal Brief。

### 3.2 KR target vocabulary

跟随 ADR-068：

```text
initialValue
currentValue
targetValue
aggregationMethod
weight
target?
```

旧：

```text
startingValue
progressBaselineValue
```

只允许存在于 migration adapter/fixture，不再是 AI canonical draft。

## 4. Stable `draftRef`

跨 draft entity 关系不使用数组位置：

```text
keyResultIndex
index-based deterministic entity id
```

目标：

```text
GoalDraft.draftRef = goal
KeyResultDraft.draftRef = kr:applications
TaskDraft.draftRef = task:daily-search
KnowledgeDraft.draftRef = note:goal-brief
```

引用：

```text
TaskDraft.goalRef = goal
TaskDraft.keyResultRef = kr:applications
```

### 4.1 `draftRef` 性质

`draftRef`：

- workflow-local；
- stable across reorder；
- stable across structured edits；
- 不等于数据库 id；
- 不由 LLM 伪造真实 persistent id；
- 同一 revision 内唯一。

## 5. DraftReferenceMap

Apply 阶段建立：

```text
DraftReferenceMap
├── goal -> GoalId
├── kr:applications -> KeyResultId
├── task:daily-search -> TaskPlanId
└── note:goal-brief -> KnowledgeDocumentId
```

该 mapping 由 deterministic Apply service 生成和消费，LLM 不参与 persistent id resolution。

## 6. Task draft convergence

Task planner 最终使用 Task owner 的 canonical schedule：

```text
TaskDraft
├── draftRef
├── title
├── description?
├── importance
├── schedule: TaskPlanSchedule
├── reminderPolicy?
├── labels?
├── goalRef?
├── keyResultRef?
└── contribution?
```

不再长期维护：

```text
cadence
timeOfDay
daysOfWeek
occurrences
```

作为 AI-only schedule DSL。

### 6.1 Goal link

跟随 ADR-075：

```text
Goal-only link: allowed
Goal + KR link: allowed
Contribution: requires KR
```

AI draft 不重新建立不同规则。

## 7. Knowledge draft convergence

Knowledge draft 继续以两类为核心：

```text
create
linkExisting
```

目标 identity 使用：

```text
KnowledgeDocumentId
```

而不是 path/resource id。

Create draft 必须保留 provenance/source references；LinkExisting 只引用 owner-domain stable document id。

## 8. Routine AI tool convergence

Routine AI capability 不属于 GoalPlanDraft 的默认 child aggregate。

如果某 workflow 需要创建/修改 Routine，必须使用 Routine owner contract：

```text
RoutineTrigger
  WallClock | Elapsed | ActiveUsage

RoutineTemporaryOverride
RoutineInterventionPolicy
```

旧：

```text
ReminderTemplate
FixedTime | Interval
```

不再作为新 AI planning target。

### 8.1 Standalone reminder

“提醒我今天 5 点做 X”是否映射成 one-shot Routine、Planner Automation 或 owner-specific reminder，必须由对应产品 ADR 决定；AI 不能为了兼容旧 `ReminderTemplate` 自己决定永久模型。

## 9. Review / edit semantics

继续使用 typed commands：

```text
answer
approve
cancel
edit_structured
revise_natural_language
regenerate
retry
accept_partial
cancel_remaining
```

### 9.1 Structured edit

UI 结构化修改：

```text
no LLM
-> schema validate
-> deterministic normalization
-> domain preview validation
-> workflow revision +1
```

### 9.2 Natural-language revise

调用 worker agent，但输出仍必须重新通过：

```text
structured schema
-> deterministic normalization
-> owner-domain preview validation
```

## 10. Apply idempotency

根 idempotency key：

```text
workflowRunId + revision
```

child operation key：

```text
workflowRunId + revision + draftRef + operation
```

例如：

```text
run-123/rev-4/kr:interviews/create
run-123/rev-4/task:daily-search/create
```

这使：

- reorder 不改变 child identity；
- partial retry 只重跑失败 child；
- duplicate approve 不重复创建；
- structured edit 产生新 revision 时 lineage 清楚。

## 11. Apply 不做跨模块巨型事务

继续沿用 ADR-070：

```text
Goal owner
Task owner
Knowledge owner
Routine owner
```

各自持有自己的 transaction/invariant。

`ApplyGoalPlanService` / `ApplyTaskPlanService` 等做 durable idempotent orchestration，不直接拿所有 repository 开一个共享 transaction。

### 11.1 Partial failure

回执：

```text
ApplyReceipt
├── status: success | partial | failed
├── created/linked ids
├── failures[]
└── retryable
```

recovery 由 deterministic workflow logic 决定，不交给 LLM 即兴补偿。

## 12. Current `AiGenerationTask` 名实收敛

当前 production adapter 已经把 `ai_generation_tasks` 当 execution log 使用。

目标语义改为：

```ts
interface AIExecutionRecord {
  id: string;
  identityId: IdentityId;
  conversationId?: AIConversationId;
  runtimeRunId?: string;
  workflowKind?: string;
  requestId?: string;
  traceId?: string;
  providerConnectionId?: AIProviderConnectionId;
  modelId?: string;
  outcome: 'succeeded' | 'failed' | 'cancelled';
  usage?: AIUsage;
  estimatedCostUsd?: number;
  latencyMs?: number;
  safeInputMetadata?: Record<string, unknown>;
  safeError?: string;
  createdAt: Instant;
  completedAt?: Instant;
}
```

具体字段可按现有 telemetry contract 调整，但必须保持：

> 它是 operations/read projection，不是 Workflow Aggregate。

## 13. ExecutionRecord 不复制 runtime status machine

允许记录 terminal outcome/usage：

```text
succeeded
failed
cancelled
```

不保存：

```text
workflow current step
suspension payload
resume cursor
full draft
tool pending state
checkpoint
```

这些仍从 Mastra 读取。

## 14. Observability != Accounting

继续 ADR-050：

```text
AIExecutionRecord / Mastra trace
!= financial source of truth
```

`estimatedCostUsd` 只用于产品 usage/operations/eval。

未来如果出现真实：

```text
subscription quota
billed amount
prepaid budget
```

必须新建：

```text
AIEntitlement / AIUsageLedger / Budget
```

并使用 provider-reported/billing-grade facts。

## 15. `AiUsageQuota` retirement policy

本轮 current-system audit 未发现有效 production runtime consumer。

因此状态定义为：

```text
high-confidence deletion candidate
```

删除前必须完成：

- current code consumer grep；
- API/IPC surface audit；
- data portability audit；
- migration/schema audit；
- tests/generated code cleanup；
- anti-resurrection lock。

不得为了“未来也许有套餐”补造当前 quota 功能。

## 16. `KnowledgeGenerationTask` retirement policy

当前知识生成已经由 Mastra `knowledge.capture` workflow 承载。

本轮未发现该 Prisma model 的 current product consumer，因此同样为：

```text
high-confidence deletion candidate
```

如果进一步 audit 证明只剩 generated code/schema，则删除；如发现真实 consumer，则先迁到 Mastra workflow/read projection，再删除旧表。

## 17. AI application capability split

当前 `AIApplicationPort` 可以作为迁移 facade，但长期 consumer dependency 收窄为：

```text
AIProviderManagementPort
AssistantConversationPort
AIKnowledgePort
AIEvaluationOperationsPort
```

分拆条件是有真实独立 consumer，并能降低依赖面；不为了接口数量做纯形式重构。

## 18. Data portability

AI portability 必须按 owner 类型分别处理：

```text
Conversation shell metadata
Provider connection metadata
Provider secret policy
Knowledge index: generally rebuildable, not portable user truth
Execution record: operations/history policy
```

原则：

- AI index 可重建，不冒充 Knowledge document；
- secret 默认不以 plaintext 导出；
- execution telemetry 是否导出由 privacy/product policy决定；
- legacy tables 删除前必须确认 portable user data 不被静默丢失。

## 19. Persistence target

本 ADR 相关目标表语义：

```text
ai_execution_records
```

替代：

```text
ai_generation_tasks
```

删除候选：

```text
ai_usage_quotas
knowledge_generation_tasks
```

物理 rename/migration 可以分阶段，但稳定态不保留两个公开概念。

## 20. Verification matrix

至少覆盖：

| Invariant                                      | Required evidence              |
| ---------------------------------------------- | ------------------------------ |
| draft reorder 不改变 child identity            | `draftRef` idempotency fixture |
| duplicate approve 不重复创建                   | workflow apply integration     |
| partial retry 只重跑失败 child                 | recovery fixture               |
| GoalPlanDraft 使用 V2 owner fields             | contract/surface lock          |
| Task draft 只用 canonical schedule             | contract + mapper tests        |
| Routine tools 无 legacy trigger                | tool schema surface lock       |
| ExecutionRecord 不存 workflow snapshot         | schema/repository tests        |
| `AiUsageQuota` 无 consumer 后才删除            | consumer audit + source lock   |
| `KnowledgeGenerationTask` 无 consumer 后才删除 | consumer audit + source lock   |
| Prisma/PowerSync parity                        | round-trip/schema tests        |

## 21. Protected contracts

1. Mastra durable workflow semantics；
2. ADR-070 GoalPlanDraft V2；
3. TaskPlanSchedule canonical language；
4. Routine ADR-076～079；
5. Knowledge stable document identity；
6. deterministic owner application ports；
7. HITL approval/cancel/retry；
8. no cross-module giant transaction；
9. execution telemetry sanitized；
10. no financial claims from estimated observability cost。

## 22. 明确拒绝

本 ADR 拒绝：

- AI-only permanent business DSL；
- array index 作为跨 draft relation identity；
- LLM 预造 persistent database ids；
- `AiGenerationTask` 继续同时冒充 workflow task + telemetry；
- 为无 consumer 的 `AiUsageQuota` 补造业务；
- Knowledge generation 同时维护 Mastra workflow + legacy task table 双状态；
- 将 workflow snapshot/draft 全量写入 execution log。

## 23. Acceptance target

实现完成后可以证明：

```text
Goal/Task/Knowledge/Routine AI output
 -> canonical owner-domain semantics
 -> stable draftRef relations
 -> deterministic idempotent apply
```

以及：

```text
Mastra = workflow truth
AIExecutionRecord = operations projection
AIUsageLedger = absent unless real accounting product exists
```

三者没有重叠 ownership。
