---
tags:
  - analysis
  - ai
  - mastra
  - provider
  - workflow
  - context
  - knowledge
  - vnext
description: AI vNext Model Convergence 当前系统地图——区分 Mastra runtime truth、MemoFlow product truth、legacy persistence 与跨模块 DTO 漂移
created: 2026-09-09T00:00:00+08:00
updated: 2026-09-18T00:00:00+00:00
---

# AI vNext Model Convergence — Current System Map

## 1. 文档目的

本文件记录 **AI-9612 exact-head closure 后当前代码和既有 ADR 能证明的实现事实**。早期
consumer ledger 仍保留在文档中作为删除证据；如果它与下方 as-built 状态冲突，以当前源码、
schema、PowerSync map 与 [AI-9612 closure evidence](./2026-09-18-ai-9612-vnext-closure-evidence.md)
为准。本文不再把已实施的 convergence 描述成未来目标。

## 2A. AI-9612 as-built summary

```text
Mastra = Assistant transcript + Workflow execution/snapshot authority
AIConversation = product shell metadata only
ProviderDefinition + Connection + SecretVault + capability evidence = model boundary
AIContextAssembler = Product Time/trust/token-budget boundary
KnowledgeSpaceId + KnowledgeDocumentId = index/citation identity
Goal/Task/Knowledge/Routine/Planner/Notification = owner-domain contracts
AIExecutionRecord = bounded operations projection
HTTP + Electron IPC = parity transport with stable redacted failure codes
```

The destructive AI-9610 cutover is complete: current production source/schema has no
`AiMessage`, `ai_messages`, `AiGenerationTask`, `ai_generation_tasks`, `AiUsageQuota`, or
`KnowledgeGenerationTask` authority. Data Portability exports/imports Conversation shell metadata
only; Mastra transcript history remains runtime-owned and is not reintroduced as a second backup
aggregate.

本轮源码基线重点包括：

- `packages/ai/src/server/mastra/**`
- `packages/ai/src/server/domain/**`
- `packages/ai/src/server/application/**`
- `packages/contracts/src/modules/ai/**`
- `packages/database/prisma/schema/ai.prisma`
- `packages/powersync-schema/src/index.ts`
- `packages/app-vue/src/modules/ai/**`
- API/Desktop AI composition roots
- ADR-050 / 051 / 052 / 070
- ADR-090 / 091 / 093

## 2. 已确认的当前正确基础

### 2.1 Mastra 已经是唯一核心 AI runtime

ADR-050 的大重构已经实施并归档。当前核心路径是：

```text
Web / Desktop
  -> HTTP / IPC host
  -> MastraAIRuntime
       |- MemoFlow Assistant
       |- goal.create
       |- task.create
       |- knowledge.capture
       |- Mastra Memory / Storage
       |- model resolution
       `- owner-domain tools / application ports
```

旧 Python FastAPI/LangGraph、AgentHost、ProposalKernel、TurnEngine、AgentAction DAG 已经退出当前核心 execution path。

**本轮必须保护这一点，不重新发明第二个 Agent Framework。**

### 2.2 产品事实与 runtime 技术状态的 ownership 原则已经正确

ADR-050/051 已经明确：

```text
MemoFlow owns product truth
Mastra owns AI runtime truth
```

因此：

- Goal / Task / Routine / Knowledge / Notification 等业务事实由 owner domain/application port 持有；
- conversation thread message、memory、workflow run/snapshot、tool/model invocation state 由 Mastra 持有；
- AI 不应直接写 owner module 的 Prisma/PowerSync implementation。

### 2.3 HITL durable Workflow 模式已经成熟

当前 Goal/Task/Knowledge workflow 都已经具备：

```text
planning
-> clarification
-> review suspend
-> approve/edit/revise/cancel
-> deterministic apply
-> recovery/retry
-> completed/failed/cancelled
```

这套控制流是本轮应保护的资产，不需要重写。

### 2.4 Provider Onboarding V2 的 secret handling 方向正确

当前 onboarding 使用：

```text
probe
-> opaque onboardingId
-> optional model verification
-> commit
```

`AIProviderOnboardingSessionRecord.apiKey` 只在 server/application repository 解密后的内部 record 中使用，不进入公开 transport DTO；credential 有 expiry/consumed 状态。

这是本轮 Provider 目标模型的重要参考。

## 3. 当前 AI persistence inventory（AI-9612 as-built）

当前 Prisma `ai.prisma` 中主要包含：

```text
AiConversation
AiProviderConfig
AiProviderOnboardingSession
AiKnowledgeIndexEntry
AiExecutionRecord
```

`DashboardConfig` was the standalone Dashboard persistence model. HOME-1805
retired it destructively; it is intentionally absent from the current Prisma,
PowerSync, and AI persistence surfaces.

它们并不都属于同一种“AI Domain Entity”。

当前实际性质更接近：

| 当前模型                      | 当前真实用途/性质                                                        |
| ----------------------------- | ------------------------------------------------------------------------ |
| `AiConversation`              | 产品 conversation shell metadata；Mastra 持有 transcript                   |
| `AiExecutionRecord`           | bounded usage/trace/cost/outcome operations projection                      |
| `AiProviderConfig`            | 用户 BYOK Connection；只保存 credentialRef，不保存 plaintext secret       |
| `AiProviderOnboardingSession` | 临时 credential/model onboarding state                                   |
| `AiKnowledgeIndexEntry`       | AI-owned knowledge retrieval/index projection keyed by stable document id |

因此当前 persistence 已按 runtime/product/operations ownership 分离；历史名称只保留在
archived characterization prose，不再出现在 production authority path。

## 4. Conversation / Message 当前状态

### 4.1 当前 `AIConversation` shell

Domain aggregate 当前包含：

```text
AIConversation
├── id
├── identityId
├── name
├── status: Active | Archived
├── deletedAt
├── version
└── timestamps
```

Prisma/PowerSync stores contain the shell only; there is no `AiConversation -> AiMessage[]`
relation and no `ai_messages` table.

### 4.2 当前真正 transcript authority

当前 runtime path 已经把 Mastra thread/memory 作为 authoritative history。

AI-9610 direct cutover removed the bootstrap source and all legacy transcript persistence. The
current boundary is:

```text
Mastra thread/memory = runtime transcript truth
AIConversation = shell metadata and owner-scoped delete/rename state
Data Portability = shell metadata only
```

### 4.3 `Closed` 已退休

The accepted AI-9602 characterization found no independent `Closed` journey. The contract/server
value was removed; `Active` and explicit `Archived` remain.

## 5. UI durable workflow state（AI-9603 as-built）

`packages/app-vue/src/modules/ai/composables/useAIWorkflowPersistence.ts` 现在只把下列可恢复
UI state 写入 localStorage：

```text
ai:conversation-workflow-map:v3

- activeRunId
- optional revision-bound unsaved editor overlay
```

conversation restore 会：

```text
read activeRunId/overlay pointer
-> workflowRuntime.get(runId)
-> verify owner + conversation id
-> project current runtime state and rebase/discard stale overlay
```

UI 不保存 workflow status、suspension、result、usage 或 authoritative draft，因此没有第二份
durable WorkflowRun authority。runtime unavailable、unknown run、owner mismatch 都 fail closed。

## 6. Provider 当前状态（AI-9604/9605/9612 as-built）

### 6.1 ProviderDefinition / Connection / SecretVault

Saved `AIProviderConfig` is the Connection projection and contains:

```text
name
providerDefinitionId
baseUrl
credentialRef
defaultModel
isActive
isDefault
priority
```

ProviderDefinition metadata is supplied by the canonical catalog; SecretVault owns plaintext
credentials; catalog/capability snapshots are evidence rather than connection invariants. There
is no parallel provider-template registry or implicit model fallback.

### 6.2 Plaintext boundary and revocation

Repositories and ordinary server/client DTOs carry only `credentialRef`. Plaintext is resolved
only by onboarding/probe/model execution edges. The ModelResolver's injected fetch rechecks the
identity-scoped Connection and Vault value for every provider request, so revoke, replacement,
disable, delete, endpoint change, or ownership mismatch fails closed.

### 6.3 Capability-aware provider resolution

`resolveActiveProviderConfig()` 当前策略：

```text
explicit selected provider
-> default active provider
-> first active provider
```

缺少 selected/default model 时 resolver 返回 `configuration_required`；它不会发明
`gpt-4o-mini` 或从另一 provider 静默切换。

### 6.4 Capability evidence is an execution contract

Goal/Task/Knowledge planner 高度依赖 structured output；Assistant 可能依赖 streaming/tool calling。

Provider/Model resolution now checks fresh, identity-matched catalog/capability evidence for:

```text
structuredOutput
streaming
toolCalling
vision
```

`ExecutionRequirement` rejects unsupported, unknown, stale or mismatched evidence. Assistant,
Goal/Task/Knowledge structured planners and streaming/tool paths therefore fail closed before
execution rather than relying on provider 400/parse failures.

## 7. Workflow Draft 当前与 owner-domain contract 对齐

### 7.1 Goal workflow

Goal planner and apply services use GoalPlanDraft V2 and canonical owner fields:

```text
name
summary
status
startDate
target
```

KR uses canonical:

```text
initial
current
target
```

Task draft uses canonical `TaskPlanSchedule` rather than an AI-only cadence DSL.

The current Task path preserves:

```text
schedule
```

and owner-defined goal-link/contribution/reminder policy.

### 7.2 Task workflow

Current Task planner/apply evidence includes:

- Goal-only link；
- contribution 需要 KR；
- apply 最终映射到 canonical Task schedule；

and no second AI schedule vocabulary.

### 7.3 Routine AI tools

Routine tools use the owner trigger vocabulary:

```text
WallClock
Elapsed
ActiveUsage
```

with separate Definition, Runtime Context, TemporaryOverride and InterventionPolicy contracts.

### 7.4 Planner / Notification are read/command projections

AI tools consume typed owner read/command ports and do not import raw repositories or recreate:

```text
Scheduler worker state, delivery worker state, or retired template/category vocabulary
```


## 8. Context / Memory 当前状态（AI-9606 as-built）

ADR-051 已经定义了正确目标：

```text
system safety
workflow/skill instructions
authenticated settings
surface/entity selection
domain facts
retrieved knowledge
memory projection
```

并要求每段 context 有：

```text
source
trust
sensitivity
token budget
```

`AIContextAssembler` is now the common invocation boundary for Assistant and the important
planner workers. It assembles bounded, schema-validated sections from explicit owner projections:

```text
conversation transcript
clarification history
current draft
selected query results
```

There is no generic repository/context map; owner modules select the projections before assembly.

### 8.1 User Time Context is explicit

Setting ADR-093 已经冻结 `UserTimeContextPort`。

AI invocations receive owner-provided Product Time context. No host ambient timezone/date is used as
AI semantic authority when interpreting:

```text
今天
明天
本周
下午
Q4
```

and the assembled envelope carries trust/sensitivity/budget metadata.

### 8.2 Memory 必须继续保持非业务真值

当前 Mastra Memory 适合：

```text
thread transcript
working memory
stable assistant observations
```

但不能升级为：

```text
Goal status
Task completion
Routine next fire
Settings timezone
Notification preference
```

这些必须在 invocation 时从 owner domain 读取。

## 9. Knowledge AI Index 当前状态（AI-9607 as-built）

`AiKnowledgeIndexEntry` is keyed by:

```text
knowledgeSpaceId
knowledgeDocumentId
```

并存 summary/keywords/embedding/chunks/contentHash。

ADR-090 已经冻结稳定 `KnowledgeDocumentId`，ADR-091 已经冻结：

```text
Knowledge projection truth
!= AI index truth
```

Current behavior therefore:

- rename/move keeps the same semantic index/citation identity;
- path/title/content hash are refreshable source/display projections;
- index state is not written back as Repository truth;
- query and citation compose Knowledge projection with AI index evidence.

## 10. Execution / Usage 当前状态（AI-9610 as-built）

### 10.1 `AIExecutionRecord` is bounded observability

Production adapters are:

```text
AIExecutionRecordPrismaAdapter
AIExecutionRecordPowerSyncAdapter
```

The physical table is `ai_execution_records` and fields are bounded to:

```text
conversationId
runId
requestId
traceId
providerId
model
estimatedCostUsd
tokenUsage
processingMs
error
```

It is an operations/usage projection, never workflow state, draft, resume cursor, tool state, or
accounting ledger.

### 10.2 Quota/generation candidates were removed

The exact-head source/schema audit found no live quota/generation aggregate consumer; the retired
tables, IDs, and mappings are absent.

If a future product needs quota/billing, it must be modeled separately as:

```text
Entitlement / Budget / AIUsageLedger
```

with explicit accounting ownership distinct from observability.

### 10.3 Knowledge generation is the Mastra workflow

Knowledge generation is carried by the durable `knowledge.capture` Mastra workflow; no parallel
generation-task persistence remains.

## 11. AI application capability surface（AI-9611 as-built）

The module exposes four proven consumer capabilities:

```text
Provider onboarding/management
Conversation shell
Knowledge query/reindex/expand
Analytics
Evaluation overview
```

API and Desktop composition use the same four properties. There is no broad public
`AIApplicationPort` or speculative micro-interface layer.

## 12. Current ownership matrix

| State / capability                | Current effective owner        | Current boundary/status                  |
| --------------------------------- | ------------------------------ | ----------------------------------------- |
| Assistant thread/messages         | Mastra                         | none; runtime authority is explicit       |
| Workflow run/snapshot              | Mastra                         | UI keeps pointer/overlay only              |
| Conversation title/list shell      | MemoFlow AI                    | shell-only by contract                    |
| Provider definition/connection     | AI catalog + host persistence  | separate from Vault                       |
| Provider secret at rest            | Host SecretVault               | request-time revocation guard              |
| Model discovery/capability         | AI catalog/evidence + resolver | fail-closed on unknown/stale              |
| Goal/Task/Knowledge product truth  | owner domains                  | typed drafts/apply ports                  |
| Routine commands                   | Routine owner via AI tool port | approval + Product Time boundary           |
| Product time preference            | Setting/Time owner             | explicit AI context input                 |
| Knowledge document identity        | Knowledge owner                | stable space/document ids                 |
| AI index                           | AI projection                  | no Repository status writeback             |
| execution telemetry                | AIExecutionRecord              | bounded operations projection             |
| quota/billing                      | future explicit owner          | no speculative AI quota aggregate         |

## 13. Implemented model summary

AI-9612 exact-head implementation is:

```text
AssistantConversationShell
+ Mastra authoritative Thread/Workflow

AIProviderDefinition
AIProviderConnection
AIProviderSecretVault
AIModelCatalogSnapshot
AIModelCapabilitySnapshot
AIExecutionRequirement
ModelResolver

AIContextEnvelope / ContextAssembler
+ UserTimeContextPort
+ owner-domain read contracts
+ KnowledgeDocumentId based AI index

Typed Workflow Drafts
+ stable draftRef
+ deterministic owner Apply

AIExecutionRecord
+ future separate AIUsageLedger only if real billing exists
```

## 14. 必须保护的 contracts

整个 AI model convergence 必须保护：

1. Mastra 是唯一 Agent/Workflow runtime；
2. HTTP/IPC canonical Assistant/Workflow contracts；
3. `identityId` 只从 trusted ExecutionContext 注入；
4. credential 不进入 client/event/prompt/snapshot/trace；
5. Goal/Task/Routine/Knowledge mutation 只走 owner application/command port；
6. Scheduler/Notification delivery runtime 不暴露给 AI；
7. HITL suspend/resume、cancel、retry、partial recovery 语义；
8. process restart 后 Mastra workflow/thread 可恢复；
9. Web/Desktop transport parity；
10. ADR-037 Product Time；
11. ADR-090 stable KnowledgeDocument identity；
12. ADR-091 Knowledge projection/index boundary；
13. ADR-093 UserTimeContext owner；
14. 不为迁移永久保留 old/new dual truth。

## 15. 本轮不做的事情

本轮设计不要求：

- 替换 Mastra；
- 恢复 Python/LangGraph；
- 新建 universal AgentHost；
- 引入 LiteLLM 作为 BYOK 前置；
- 新建通用 vector database abstraction；
- 把 Memory 做成用户全部业务信息数据库；
- 为未证实 SaaS 需求提前实现收费/Quota 系统；
- 让 AI 直接操作 Scheduler lease/retry/channel delivery；
- 在 owner domain 尚未冻结时让 AI 自建第二套业务模型。

## 16. 结论

AI-9612 closes the surrounding ownership drift without rewriting the runtime:

```text
Mastra runtime remains sole authority
product shell / provider / context / drafts / persistence now match the accepted model
```

Remaining follow-up is non-blocking P3 documentation/history cleanup only; there are no
unresolved P0/P1/P2 AI convergence findings. PORT-1611 remains a separate downstream ticket.

而不是第二次 AI runtime rewrite。
