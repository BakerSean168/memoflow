---
tags:
  - architecture
  - ai
  - mastra
  - provider
  - context
  - workflow
  - knowledge
  - vnext
description: AI vNext Model Convergence 北极星架构——保留 Mastra runtime，收敛 Conversation、Provider、Context、Workflow Draft、Knowledge Index 与 Execution Record
created: 2026-09-09T00:00:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# AI vNext Model Convergence — North-Star Architecture

## 1. Executive decision

MemoFlow 不再进行第二次 AI runtime rewrite。

2026-08 已完成的 Mastra-native 重构继续作为 AI 地基：

```text
Mastra = Agent / Workflow / Memory / Runtime authority
MemoFlow = Product truth / Provider ownership / Business apply authority
```

2026-09 本轮只做 **Model Convergence**：

1. 把 Conversation 收缩为 product shell；
2. 把 durable workflow state 真正收回 Mastra 单一 authority；
3. 把 Provider 拆成 Definition / Connection / Secret / Model Catalog / Capability；
4. 建立统一 `AIContextEnvelope`；
5. 让 Goal/Task/Routine/Knowledge AI contract 跟随 owner-domain 新模型；
6. 让 AI Knowledge Index 使用 stable `KnowledgeDocumentId`；
7. 把 `AiGenerationTask` 收敛成真实 `AIExecutionRecord`；
8. 删除无 current product consumer 的 legacy AI persistence，而不是继续维护假的 Domain aggregate。

## 2. North-star topology

```text
                         MemoFlow Assistant
                                │
              ┌─────────────────┴─────────────────┐
              │                                   │
              ▼                                   ▼
      Interactive Agent                    Durable Workflows
      Mastra thread                        Mastra snapshot
              │                                   │
              │                         ┌─────────┼──────────┐
              │                         ▼         ▼          ▼
              │                    goal.create task.create knowledge.capture
              │                         │
              └──────────────┬──────────┘
                             ▼
                      AI Context Assembler
                             │
          ┌──────────────────┼───────────────────┐
          ▼                  ▼                   ▼
    UserTimeContext      Domain Facts       Knowledge Evidence
    Setting/Time         owner ports        stable document ids
          │                  │                   │
          └──────────────────┴───────────────────┘
                             │
                             ▼
                      Planner / Worker
                             │
                             ▼
                         Typed Draft
                             │
                       HITL suspend
                             │
                             ▼
                    Deterministic Apply
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
      Goal                  Task              Knowledge/Routine
      owner                 owner                 owner
```

Provider/Model 作为横向 execution capability：

```text
AIProviderDefinition
        │
        ▼
AIProviderConnection ───────> AIProviderSecretVault
        │
        ├──────────> AIModelCatalogSnapshot
        │                 │
        │                 ▼
        │         AIModelCapabilitySnapshot
        │
        ▼
AIExecutionRequirement
        │
        ▼
ModelResolver
        │
        ▼
Mastra / AI SDK invocation
```

Operations 作为旁路投影：

```text
Mastra trace/model/tool events
        │
        ▼
AIExecutionRecord
        │
        ├── usage/cost/latency read model
        └── eval / operations
```

## 3. State ownership constitution

### 3.1 Mastra owns runtime state

Mastra 永久拥有：

- Assistant thread/transcript；
- Agent memory；
- agent/model/tool turn execution；
- workflow run/status/step/snapshot；
- suspend/resume durable state；
- runtime retry/cancel state；
- framework-private telemetry。

MemoFlow 不复制：

```text
WorkflowRun checkpoint
Message transcript
Tool-call lifecycle
Agent memory
```

成为第二本业务账。

### 3.2 MemoFlow AI owns product-facing AI configuration and shell

AI module 可以拥有：

```text
AssistantConversationShell
AIProviderConnection
AIProviderOnboardingSession
AIKnowledgeIndexEntry
AIExecutionRecord
```

它们的共同特点是：

- 是 MemoFlow 产品层需要长期存在的事实/投影；
- 不复制 Mastra private runtime state；
- 不复制其他 owner-domain 业务事实。

### 3.3 Owner domain owns business truth

```text
Goal -> Goal
Task -> Task
Routine -> Routine
Knowledge -> Knowledge/Repository
Notification -> Notification
Settings -> Preferences/Time Context
Scheduler -> Scheduler runtime
```

AI 只能通过 owner application/query port 访问。

## 4. Conversation model

目标：

```text
AssistantConversationShell
├── id
├── identityId
├── title
├── archivedAt?
├── createdAt
└── updatedAt
```

不再包含：

```text
messages[]
messageCount as domain truth
lastMessageAt as domain truth
Closed lifecycle
```

Conversation list 需要 message count / preview / latest time 时，从：

```text
ConversationShell
+
Mastra thread summary
```

组成 read model。

### 4.1 Thread identity

继续冻结：

```text
MemoFlow conversationId -> Mastra threadId
MemoFlow identityId     -> Mastra resourceId
```

UI 不再创建平行 thread id。

## 5. UI runtime projection

UI 只允许持久保存：

```text
AssistantConversationUiState
├── activeToolMode?
├── activeWorkflowRunId?
└── unsavedEditorState?
```

禁止保存整个：

```text
AIWorkflowRunView
suspension
result
runtime revision
```

作为 durable shadow。

恢复路径：

```text
conversation shell
-> activeWorkflowRunId
-> workflowRuntime.get(runId)
-> authoritative Mastra projection
-> optional unsaved local editor overlay
```

一旦 editor 提交 `edit_structured` 成功，runtime draft revision 重新成为唯一真值。

## 6. Provider target model

### 6.1 Provider Definition

描述“系统认识什么 provider/protocol”：

```text
AIProviderDefinition
├── id
├── displayName
├── protocol
├── defaultBaseUrl?
├── baseUrlEditable
├── authKind
├── discoveryCapabilities
└── documentation metadata
```

系统 catalog entry 与 Custom OpenAI-compatible 都映射到统一 Definition 语义。

### 6.2 Provider Connection

描述“用户实际连接了什么 endpoint/account”：

```text
AIProviderConnection
├── id
├── identityId
├── name
├── providerDefinitionId
├── baseUrl
├── credentialRef
├── enabled
├── isDefault
├── fallbackOrder
├── defaultModelId?
├── version
└── timestamps
```

### 6.3 Secret boundary

Credential 不进入 ordinary domain DTO：

```text
ProviderConnection
  credentialRef
       │
       ▼
AIProviderSecretVault.resolve()
       │
       ▼
request-scoped ModelResolver
```

plaintext secret 只在 execution edge 的短生命周期对象里存在。

### 6.4 Model Catalog + Capability

```text
AIModelCatalogSnapshot
├── providerConnectionId
├── discoveredAt
├── expiresAt?
└── models[]

AIModelCapabilitySnapshot
├── providerConnectionId
├── modelId
├── verifiedAt
└── capabilities
    ├── chat
    ├── streaming
    ├── structuredOutput
    ├── toolCalling
    ├── vision
    └── reasoning?   // only if product can verify/consume it
```

Capability provenance 必须可区分：

```text
catalog metadata
provider API
runtime probe
```

## 7. Model resolution

Workflow/Agent 不只请求“model id”，而声明最低执行需求：

```text
AIExecutionRequirement
├── streaming: required | optional | none
├── structuredOutput: required | optional | none
├── toolCalling: required | optional | none
├── vision: required | optional | none
└── cost/latency preference? // only if real policy exists
```

示例：

```text
MemoFlow Assistant
  streaming = required
  toolCalling = preferred/required by tool-enabled mode

goal.create planner
  structuredOutput = required

task.create planner
  structuredOutput = required
```

`ModelResolver` 必须 fail closed：

- selected provider/model 不属于 identity -> reject；
- provider disabled -> reject；
- model 未发现且不可 manual verify -> reject；
- capability 不满足 workflow requirement -> reject；
- 不使用硬编码 `gpt-4o-mini` 猜测 fallback。

## 8. Context architecture

目标建立统一：

```text
AIContextAssembler
  -> AIContextEnvelope
```

`AIContextEnvelope` 是 invocation-scoped projection，不是新的持久业务实体：

```text
AIContextEnvelope
├── invocation
│   ├── identityId
│   ├── conversationId
│   ├── surface
│   └── locale
├── userTimeContext
├── selectedEntities[]
├── domainFacts[]
├── knowledgeEvidence[]
├── memoryProjection[]
└── sections[]
    ├── source
    ├── trust
    ├── sensitivity
    ├── tokenBudget
    └── boundedContent
```

推荐 trust taxonomy：

```text
system
workflow_instruction
authoritative_domain
user_input
memory
retrieved_untrusted
external_untrusted
```

低信任内容不能扩大 tool permission 或修改 system/workflow invariant。

## 9. Product Time context

AI 不再从 prompt、host timezone 或 UI 任意 string 推断用户业务时区。

调用：

```text
UserTimeContextPort
  -> timeZone
  -> weekStartsOn
```

所有涉及：

```text
今天 / 明天 / 本周 / 下午 / Q4
```

的 planner/workflow 都使用 `@memoflow/time` + canonical UserTimeContext。

Task/Routine object 自己保存的 explicit schedule timezone snapshot 继续优先于当前 user preference，按 owner-domain contract 解释。

## 10. Owner contract reuse

AI Tool 可以有 tool-specific envelope，但不能再复制 owner-domain 的核心语言。

目标规则：

```text
owner domain canonical contract
     ↓
thin query/command port
     ↓
AI tool input/output adapter
```

禁止稳定态：

```text
AITaskItem with old Task fields
AIRoutineTrigger with legacy trigger algebra
AINotificationCategory shadow
AIPlannerTime DSL shadow
```

AI 适配层可以裁剪字段，但不能重新定义同一业务事实的另一套 lifecycle/time semantics。

## 11. Workflow Draft architecture

### 11.1 Draft 是 runtime intermediate state

```text
TypedDraft
= Mastra Workflow state
!= persistent product Draft entity
```

除非产品未来明确提供“保存草稿”功能，否则不建新的 draft table。

### 11.2 Stable draft refs

所有跨 draft entity 关系使用：

```text
draftRef
```

而不是数组下标。

例如：

```text
kr:applications
kr:interviews

task:daily-search
  -> keyResultRef = kr:applications
```

Apply 阶段建立：

```text
DraftReferenceMap
  draftRef -> persistent entity id
```

### 11.3 Goal Plan V2

ADR-070 继续作为 Goal planning 真值：

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

旧 `motivation / feasibilityAnalysis` 不再写回 Goal aggregate；需要长期说明时生成/关联 Goal Brief Knowledge document。

### 11.4 Task Draft

Task planner 的时间表达最终复用：

```text
TaskPlanSchedule
```

不长期维护 AI-only cadence/timeOfDay DSL。

### 11.5 Routine tools

Routine AI schema 跟随 ADR-076~079：

```text
RoutineTrigger
  WallClock | Elapsed | ActiveUsage

RoutineTemporaryOverride
RoutineInterventionPolicy
RoutineRuntimeContext read projection
```

不继续扩展 legacy `FixedTime | Interval`。

## 12. Deterministic Apply

统一原则：

```text
Mastra durable workflow
  -> typed reviewed draft
  -> deterministic Apply service
  -> owner application ports
```

幂等根：

```text
workflowRunId + revision
```

child operation 推荐：

```text
workflowRunId / revision / draftRef / operation
```

而不是 `array index`。

Apply 不创建跨模块巨型数据库事务；采用 durable idempotent orchestration + owner-specific receipts。

## 13. Knowledge index

目标：

```text
AIKnowledgeIndexEntry
├── identityId
├── knowledgeSpaceId
├── documentId: KnowledgeDocumentId
├── sourceContentHash
├── status
├── summary
├── keywords
├── chunks
├── embedding
├── metadata
├── indexedAt
└── lastRequestedAt?
```

`resourcePath` 最多作为可更新 source/display snapshot，不是 identity。

### 13.1 No index-status writeback truth

```text
Knowledge projection
!= AI index
```

因此：

- Repository/Knowledge 不保存 AI index 的第二份 authoritative status；
- Workspace/read model 在查询时组合两个 owner projection；
- reindex/delete 等 operation 通过 stable document identity 协调。

## 14. Memory boundary

Memory 只保存未来 turn 需要的 agent context：

- thread history；
- stable preference observation；
- working memory；
- high-level prior work summary。

禁止把 Memory 当：

- Goal status；
- Task occurrence truth；
- Routine schedule truth；
- Notification preference；
- UserTimeContext；
- credential；
- Knowledge document 唯一正文。

如果未来需要产品可见、长期 assistant observation，再单独设计可审计 `AssistantMemoryObservation`，本轮不预建。

## 15. Operations / Usage / Eval

当前 `AiGenerationTask` 应改语义为：

```text
AIExecutionRecord
├── id
├── identityId
├── conversationId?
├── runtimeRunId?
├── workflowKind?
├── requestId?
├── traceId?
├── providerConnectionId?
├── modelId?
├── outcome
├── usage
├── estimatedCostUsd?
├── latencyMs?
├── safeInputMetadata?
├── safeError?
└── timestamps
```

它是 operations/read projection，不是 workflow state machine。

### 15.1 Observability != Accounting

继续保留 ADR-050 原则：

```text
trace/estimated cost != financial ledger
```

未来只有真实收费/预算需求出现时才建立：

```text
AIUsageLedger / Entitlement / Budget
```

`AiUsageQuota` 不作为未来需求占位模型长期保留。

## 16. Application surface

当前 `AIApplicationPort` 可以在迁移中保留 facade 兼容，但目标依赖应按 capability 收窄：

```text
AIProviderManagementPort
AssistantConversationPort
AIKnowledgePort
AIEvaluationOperationsPort
```

Settings 只依赖 Provider capability；Assistant workspace 不被迫依赖 Eval 管理接口。

不为“接口拆得漂亮”单独制造 transport churn；以真实 consumer dependency 为拆分依据。

## 17. Persistence target

最终 AI product persistence 目标大体为：

```text
assistant_conversations
ai_provider_connections
ai_provider_onboarding_sessions
ai_model_catalog_snapshots?        // if durable cache is useful
ai_model_capability_snapshots?     // if durable verification is useful
ai_knowledge_index_entries
ai_execution_records
```

明确删除候选：

```text
ai_messages                // bootstrap fully retired after migration proof
ai_usage_quotas            // no current product consumer
knowledge_generation_tasks // replaced by Mastra workflow
```

删除必须经过：

- current consumer search；
- portability/export audit；
- migration fixture；
- Prisma/PowerSync parity；
- anti-resurrection surface lock。

## 18. Migration posture

本轮不做长期 dual model。

顺序：

```text
1. freeze contracts/ADRs/current map
2. converge Conversation/UI state ownership
3. establish Provider secret/capability seams
4. establish ContextAssembler + owner contract adapters
5. migrate Goal/Task/Routine/Knowledge AI drafts/tools
6. migrate Knowledge index identity
7. rename/rebuild execution record
8. prove dead tables unused and delete
9. update UI/product docs + portability
10. full review / exact-head CI / archive
```

迁移中允许短期 adapter，但每个 adapter 必须有删除 ticket。

## 19. Protected contracts

1. Mastra single runtime authority；
2. canonical Assistant/Workflow HTTP/IPC schemas；
3. authenticated ExecutionContext identity；
4. BYOK secret confidentiality；
5. HITL suspend/resume/cancel/retry/recovery；
6. deterministic mutation idempotency；
7. owner-domain write boundaries；
8. Scheduler/Notification delivery internals不暴露给 AI；
9. Product Time semantics；
10. stable KnowledgeDocument identity；
11. Web/Desktop parity；
12. eval/release governance；
13. no permanent legacy/new dual truth。

## 20. Explicit non-goals

本轮不：

- 替换 Mastra；
- 新建 Pi/LangGraph/AgentHost second runtime；
- 引入 LiteLLM 作为核心前提；
- 自建 universal ModelGateway abstraction；
- 为所有 provider 预做复杂智能路由；
- 创建 generic `Context: Record<string, unknown>` 大包；
- 把 Memory 变成业务数据库；
- 让 AI 拥有 Product Goal/Task/Routine/Notification truth；
- 为没有 current consumer 的 quota/billing 功能补造实现。

## 21. Definition of Done

实现完成后能够证明：

```text
Conversation = thin product shell
Mastra = sole thread/workflow durable truth
UI = runtime projection + optional unsaved editor overlay
Provider secret only resolves at execution edge
Model capabilities gate workflow execution
AI context has source/trust/sensitivity/token budget
Goal/Task/Routine/Knowledge AI vocabulary follows owner domains
AI index keys by stable KnowledgeDocumentId
ExecutionRecord != workflow state != billing ledger
legacy AI tables removed after evidence
Prisma/PowerSync/HTTP/IPC/UI/docs agree on one track
```
