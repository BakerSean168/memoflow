---
tags:
  - analysis
  - ai
  - reuse
  - mastra
  - oss
  - architecture
  - vnext
description: AI vNext Model Convergence reference/reuse ledger——明确直接复用、薄适配、owner-domain 复用与禁止自研项
created: 2026-09-09T00:00:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# AI vNext Model Convergence — Reference & Reuse Ledger

## 1. 目的

本文件不再重新做一轮“选 Agent 框架”。

2026-08 ADR-050/051 已经完成框架选择并实施：**Mastra 是唯一核心 Agent/Workflow runtime**。

本轮 ledger 只回答：

1. 哪些能力直接复用现有成熟实现；
2. 哪些能力只需要 MemoFlow-owned thin adapter；
3. 哪些业务语义必须复用 owner-domain contract；
4. 哪些东西明确不再自研；
5. 哪些 legacy object 不应该因为“已经写过”继续保留。

## 2. 总原则

```text
标准能力 -> 优先复用成熟库/现有实现
产品业务 truth -> MemoFlow owner domain
跨边界 -> thin typed adapter
AI runtime state -> Mastra
```

不要把：

```text
“需要隔离第三方”
```

误解成：

```text
“重新实现第三方框架的全部功能”
```

## 3. Direct reuse ledger

| Capability                 | Canonical reuse                                                            | MemoFlow responsibility                     | 不做什么                                  |
| -------------------------- | -------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------- |
| Agent runtime              | Mastra Agent / AgentController                                             | identity、tools、product policy 注入        | 不再造 AgentHost                          |
| Durable workflow           | Mastra Workflow / suspend-resume snapshot                                  | typed product draft、owner apply            | 不再造 WorkflowEngine/checkpoint          |
| Agent memory/thread        | Mastra Memory + storage                                                    | conversation shell association              | 不再双写 AiMessage                        |
| Server runtime storage     | Mastra persistent storage on PostgreSQL-backed host                        | lifecycle/composition                       | 不在 Prisma 复制 workflow checkpoint      |
| Desktop runtime storage    | Mastra LibSQL/local persistent storage                                     | profile binding/lifecycle                   | 不用 localStorage 做 runtime DB           |
| Structured validation      | Zod contracts                                                              | domain preview validation + failure mapping | 不让 LLM 自己证明 invariant               |
| Provider protocol          | current OpenAI-compatible execution path / Mastra-AI SDK model integration | BYOK connection/secret/model policy         | 不造万能 ModelGateway                     |
| Product time               | `@memoflow/time`                                                           | AI Context 注入 UserTimeContext             | 不在 AI 自建 timezone/date algebra        |
| Stable Knowledge identity  | ADR-090 `KnowledgeDocumentId`                                              | AI index adapter                            | 不以 mutable path 为 identity             |
| Knowledge owner projection | ADR-089～091 Knowledge/Repository ports                                    | retrieval/index compose                     | 不把 AI index status写成 Repository truth |
| Task schedule              | ADR-072 canonical `TaskPlanSchedule`                                       | Task draft/tool adapter                     | 不维持 AI cadence DSL                     |
| Routine trigger            | ADR-076～079 Routine contracts                                             | AI tool projection/approval                 | 不保留 FixedTime/Interval legacy DSL      |
| Notification               | ADR-084～088 Fact/Inbox/Preference boundaries                              | read/query tool adapter                     | 不操作 channel delivery worker            |
| Scheduler                  | ADR-081～083 ScheduledInvocation runtime                                   | none for normal Assistant                   | 不让 AI 操作 lease/fencing/retry          |
| Local/cloud sync           | PowerSync current infrastructure                                           | schema parity/migration                     | 不自建 AI-specific sync protocol          |
| Product persistence        | Prisma + existing repository pattern                                       | product shell/config/index/ops rows         | 不把 Mastra private state镜像进 Prisma    |

## 4. Existing Mastra assets to preserve

当前已经落地并应继续复用：

```text
packages/ai/src/server/mastra/runtime/mastra-ai.runtime.ts
packages/ai/src/server/mastra/runtime/assistant-history.service.ts
packages/ai/src/server/mastra/models/model-resolver.ts
packages/ai/src/server/mastra/agents/memoflow-assistant.ts
packages/ai/src/server/mastra/agents/goal-planner.worker.ts
packages/ai/src/server/mastra/agents/task-planner.worker.ts
packages/ai/src/server/mastra/agents/knowledge-capture.planner.ts
packages/ai/src/server/mastra/workflows/goal-create.workflow.ts
packages/ai/src/server/mastra/workflows/task-create.workflow.ts
packages/ai/src/server/mastra/workflows/knowledge-capture.workflow.ts
packages/ai/src/server/mastra/workflows/apply-goal-plan.service.ts
packages/ai/src/server/mastra/workflows/apply-task-plan.service.ts
packages/ai/src/server/mastra/workflows/apply-knowledge-note.service.ts
```

本轮这些文件可能需要 contract/model alignment，但不以“重写 runtime”为目标。

## 5. Provider reuse posture

### 5.1 保留 Provider Onboarding V2

现有：

```text
Provider Catalog
probe
onboarding session
model discovery
model test
commit/replacement
```

已经提供成熟骨架。

目标是让它演化为：

```text
ProviderDefinition
ProviderConnection
SecretVault
ModelCatalogSnapshot
ModelCapabilitySnapshot
```

而不是再新建另一套 onboarding service。

### 5.2 复用现有 secret encryption primitive

`AISecretCipher` / `IAIProviderSecretVault` 的加密实现继续复用。

本轮改变的是 **plaintext secret 的生命周期边界**：

```text
普通 Provider DTO
  X apiKey

execution edge
  ✓ vault.resolve(credentialRef)
```

无需为了建模纯洁重新实现 AES/secret storage。

## 6. Model capability strategy: build only the product seam

MemoFlow 不需要自研模型 benchmark 平台来回答“structured output 能不能用”。

首期只做：

```text
provider/catalog metadata
+
必要的 runtime probe
+
capability snapshot
+
execution requirement validation
```

并只覆盖当前真实需求：

```text
chat
streaming
structuredOutput
toolCalling
vision when product path actually uses it
```

不要提前扩张成：

```text
hundreds of benchmark scores
leaderboard
price optimizer
latency routing market
```

## 7. Context reuse posture

### 7.1 不自研第二套 Product Time

直接复用：

```text
@memoflow/time
ADR-093 UserTimeContextPort
```

AIContextAssembler 只负责：

```text
fetch + label trust + budget + compose
```

不实现 recurrence/calendar/timezone engine。

### 7.2 不复制 owner-domain repository

AIContextAssembler 通过 owner read ports/query services 获取：

```text
Goal facts
Task facts
Routine context
Planner window
Notification inbox
Knowledge evidence
```

不 deep-import 这些模块的 Prisma/PowerSync repository。

## 8. Knowledge reuse posture

### 8.1 Knowledge content identity

直接复用：

```text
KnowledgeSpaceId
KnowledgeDocumentId
Knowledge projection
```

AI 只拥有：

```text
index state
retrieval metadata
embedding/chunks/summary
```

### 8.2 不新建 universal vector-store abstraction

当前 AI index 已经有：

```text
embedding
retrieval_vector
chunks
metadata
```

本轮只改 stable identity/ownership。

除非现有 retrieval benchmark 证明具体 storage/algorithm 不满足需求，否则不因为“向量数据库很流行”引入新的基础设施层。

## 9. Workflow/business contract reuse posture

### Goal

复用：

```text
ADR-067 Goal
ADR-068 KR
ADR-069 Goal Workspace
ADR-070 GoalPlanDraft V2
```

AI 不再独立定义旧 Goal/KR 语义。

### Task

复用：

```text
TaskPlan
TaskOccurrence
TaskPlanSchedule
TaskGoalLink
Task Reminder policy
```

AI draft 的 schedule 应直接向 canonical model 收敛。

### Routine

复用：

```text
RoutineDefinition
RoutineTrigger
RoutineTemporaryOverride
RoutineInterventionPolicy
RoutineRuntimeContext read projection
```

### Notification / Planner

只做 query-oriented thin projection；不复制 owner state machine。

## 10. UI reuse posture

继续复用当前：

```text
AIChatView
AIConversationSidebar
AIMessagePanel
AIFooterComposer
Goal/Task/Knowledge workflow panels
WorkflowRuntimeClient
AssistantRuntimeClient
```

本轮 UI 的主要变化是 ownership：

```text
full local WorkflowRun shadow
 -> active run pointer + unsaved editor overlay
```

不是重建一个全新的 AI workspace。

## 11. Observability / Eval reuse posture

继续复用：

- Mastra/runtime trace source；
- 当前 AI execution-log adapters 的安全 metadata 思路；
- `reports/apps/ai/evals` canonical eval authority；
- recorded replay gate；
- existing requestId/traceId/provider/model/usage/cost correlation。

本轮只把：

```text
AiGenerationTask
```

收敛为真实 `AIExecutionRecord` 语义。

不要建立第二套 observability stack。

## 12. Explicit do-not-build list

除非未来新的 ADR 有真实 evidence，本轮禁止新建：

```text
Custom AgentHost
Custom WorkflowEngine
Custom Agent checkpoint store
Custom Memory DB replacing Mastra
Universal ModelGateway
Mandatory LiteLLM proxy
Universal vector DB abstraction
AI-owned Scheduler engine
AI-owned Notification delivery engine
AI-owned Product Time library
Generic owner-domain mirror DTO registry
Generic Context Record<string, unknown> store
Generic User Memory business database
Speculative AI billing/quota engine
```

## 13. Legacy reuse rule

“现有代码已经存在”不是继续保留的理由。

以下对象只有在 further consumer audit 证明有真实产品语义时才保留：

```text
AiMessage
AiUsageQuota
KnowledgeGenerationTask
ConversationStatus.Closed
AiGenerationTask naming/state model
AI-only old Planner/Routine/Notification DTO
```

否则：

```text
reuse correct capability
retire obsolete model
```

而不是为 obsolete model 继续补测试、补 UI、补 API。

## 14. Thin adapter rule

合理 adapter：

```text
OwnerCanonicalReadModel
  -> AI tool-specific subset
```

例如：

```text
TaskPlan + TaskOccurrence
  -> planner_upcoming_tasks output
```

不合理 adapter：

```text
OwnerCanonicalModel
  -> AIShadowModel with another lifecycle/time algebra
```

前者是 projection，后者是第二份 domain。

## 15. Review checklist

每个 AI-960x ticket review 都要问：

1. 这是标准 runtime 能力还是产品业务语义？
2. Mastra/现有基础设施是否已经提供？
3. owner domain 是否已有 canonical contract？
4. 新 abstraction 是否只是为“将来可能换框架”而存在？
5. 是否创建了第二份 state owner？
6. 是否把 thin adapter 做成了新 domain？
7. 是否有真实 benchmark/consumer 证明需要新基础设施？

如果 2/3 已经有答案，优先复用，不造轮子。

## 16. 结论

本轮最重要的工程策略不是“AI 架构再升级一次”，而是：

```text
保留已经正确的 Mastra runtime
复用已经冻结的 owner-domain contracts
删除历史重复模型
只在边界上增加真正需要的 typed seam
```

这也是 ADR-058 OSS-first/standard capability reuse 在 AI vNext Model Convergence 中的具体执行方式。
