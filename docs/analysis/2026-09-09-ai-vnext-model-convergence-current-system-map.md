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
updated: 2026-09-09T00:00:00+08:00
---

# AI vNext Model Convergence — Current System Map

## 1. 文档目的

本文件只记录 **2026-09-09 当前代码和既有 ADR 能证明的事实、由这些事实推导的问题，以及本轮准备冻结的目标差异**。

它不把目标设计冒充成已经实施的现状。

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

## 3. 当前 AI persistence inventory

当前 Prisma `ai.prisma` 中主要包含：

```text
AiConversation
AiMessage
AiGenerationTask
AiUsageQuota
AiProviderConfig
AiProviderOnboardingSession
KnowledgeGenerationTask
AiKnowledgeIndexEntry
DashboardConfig
```

它们并不都属于同一种“AI Domain Entity”。

当前实际性质更接近：

| 当前模型                      | 当前真实用途/性质                                                        |
| ----------------------------- | ------------------------------------------------------------------------ |
| `AiConversation`              | 产品 conversation shell + legacy child relation                          |
| `AiMessage`                   | legacy transcript/bootstrap source                                       |
| `AiGenerationTask`            | 当前已主要被 execution-log adapter 当作 usage/trace/cost record          |
| `AiUsageQuota`                | schema/VO 存在，但未发现有效 production runtime consumer                 |
| `AiProviderConfig`            | 用户 BYOK connection + secret + endpoint + model/default/fallback config |
| `AiProviderOnboardingSession` | 临时 credential/model onboarding state                                   |
| `KnowledgeGenerationTask`     | schema 仍在，但未发现当前 Mastra workflow production consumer            |
| `AiKnowledgeIndexEntry`       | AI-owned knowledge retrieval/index projection                            |

因此当前最大问题不是“表太多”，而是 **历史命名和 ownership 已经不再反映真实职责**。

## 4. Conversation / Message 当前状态

### 4.1 当前 `AIConversation`

Domain aggregate 当前包含：

```text
AIConversation
├── id
├── identityId
├── name
├── status: Active | Closed | Archived
├── messageCount
├── lastMessageAt
├── messages[]
├── version
└── timestamps
```

同时 Prisma 有 `AiConversation -> AiMessage[]` relation。

### 4.2 当前真正 transcript authority

当前 runtime path 已经把 Mastra thread/memory 作为 authoritative history。

旧 `AiMessage` 只用于一次性 transcript bootstrap；新消息不应长期双写 legacy table。

所以当前存在一个**已经完成 runtime cutover、但 product shell 仍保留旧 aggregate shape** 的过渡状态：

```text
Mastra thread/memory = runtime transcript truth
AiConversation.messages[] = legacy aggregate shape
AiMessage = bootstrap-era persistence
```

### 4.3 `messageCount / lastMessageAt` 是派生数据

它们来自 thread history，本质属于 conversation list/read projection。

如果继续把它们当 aggregate truth，就要求在每次 Mastra message write 后同步第二份业务 row。

### 4.4 `Closed` 暂无强产品行为证据

仓库搜索显示 `ConversationStatus.Closed` 主要存在于 value-object tests，没有发现稳定产品 journey 依赖“Closed 与 Archived 是两个独立生命周期阶段”。

因此它是简化候选，但在删除前仍需做完整 route/UI/portability surface audit。

## 5. UI durable workflow state 当前存在第二份 shadow

`packages/app-vue/src/modules/ai/composables/useAIWorkflowPersistence.ts` 当前把下列对象写入 localStorage：

```text
ai:conversation-workflow-map

- goalWorkflowRun
- taskWorkflowRun
- knowledgeCaptureRun
- knowledgeAnswer
- clarificationAnswers
- editableGoal
- editableKeyResults
- editableTaskTemplates
- editableReminders
- showGoalDraftEditor
```

随后 conversation restore 会：

```text
restore localStorage snapshot
-> workflowRuntime.get(runId)
-> 再投影当前 runtime state
```

这意味着当前 UI 虽然不再拥有 AgentAction DAG，但仍持久保存了一份接近完整 WorkflowRun 的 shadow。

这与 ADR-050 的目标存在张力：

> Mastra Workflow 应是 durable execution state 的唯一 authority。

UI 可以保存未提交 editor state 或 active run pointer，但不应把 workflow status/suspension/result/draft revision 本身作为第二份 durable truth。

## 6. Provider 当前状态

### 6.1 `AIProviderConfig` 同时拥有多种职责

当前模型同时包含：

```text
name
providerType
baseUrl
apiKey
defaultModel
availableModels (persistence)
isActive
isDefault
priority
```

其中：

- provider/catalog identity；
- 用户 connection/endpoint；
- secret credential；
- model discovery cache；
- default/fallback routing；

都塞在同一个 `ProviderConfig` 概念里。

### 6.2 DB at-rest encryption 是正确的，但 plaintext boundary 仍然偏宽

Prisma/PowerSync repository 会解密 `apiKeyEncrypted`，并把 plaintext API key 放回 `AIProviderConfigServerDTO.apiKey`。

它没有进入 client DTO，这是重要安全保护；但 plaintext secret 仍穿过普通 repository/domain/application DTO，而不是只在 execution edge 被 SecretVault resolve。

### 6.3 Provider resolution 仍有隐含模型假设

`resolveActiveProviderConfig()` 当前策略：

```text
explicit selected provider
-> default active provider
-> first active provider
```

`toChatExecutionProviderConfig()` 当前在缺 default model 时还有：

```text
gpt-4o-mini
```

硬编码 fallback。

这对“任意 OpenAI-compatible endpoint”并不安全：endpoint 未必提供这个 model，也未必支持 structured output/tool calling/streaming。

### 6.4 当前 model verification 主要验证连接/模型可调用，不等于 capability contract

Goal/Task/Knowledge planner 高度依赖 structured output；Assistant 可能依赖 streaming/tool calling。

当前 Provider/Model contract 尚未把：

```text
structuredOutput
streaming
toolCalling
vision
```

作为可验证 capability snapshot 与 workflow execution requirement 对接。

## 7. Workflow Draft 当前与最新 Domain model 已漂移

### 7.1 Goal workflow

ADR-070 已经冻结 GoalPlanDraft V2，但当前 UI/runtime 仍大量消费旧字段：

```text
description
motivation
feasibilityAnalysis
startDate
dueDate
```

KR 仍使用旧：

```text
startingValue
progressBaselineValue
```

Task draft 仍以：

```text
cadence
timeOfDay
daysOfWeek
```

为主，并继续含 `reminders[]` legacy draft。

这与 ADR-067/068/069/070 目标不一致。

### 7.2 Task workflow

当前 Task planner 已经具备：

- Goal-only link；
- contribution 需要 KR；
- apply 最终映射到 canonical Task schedule；

但 AI draft 自己仍维护 `cadence/startDate/timeOfDay/daysOfWeek/occurrences` 等 mini schedule DSL。

Task vNext 已经冻结 `TaskPlanSchedule` 单一时间语言，因此长期保留两套 schedule vocabulary 会再次漂移。

### 7.3 Routine AI tools

当前 AI product tools 仍包含 legacy trigger vocabulary：

```text
FixedTime
Interval
```

而 Routine vNext 目标已经是：

```text
WallClock
Elapsed
ActiveUsage
```

并进一步区分 RoutineDefinition、Runtime Context、TemporaryOverride、InterventionPolicy。

### 7.4 Planner / Notification AI-owned DTO 也有旧词汇残留

AI application ports 自己重新定义了 Planner/Notification tool DTO；这让 owner module 的模型升级后，AI 很容易保留旧：

```text
templateId
instanceDate
dueDate
category
```

等词汇。

## 8. Context / Memory 当前状态

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

但当前实现更多还是由各 worker/workflow 自己拼：

```text
conversation transcript
clarification history
current draft
selected query results
```

尚没有统一、可审查的 `ContextAssembler / ContextEnvelope` 成为所有重要 AI invocation 的共同入口。

### 8.1 User Time Context 尚未正式进入统一 AI context seam

Setting ADR-093 已经冻结 `UserTimeContextPort`。

当前 AI workflow 的 locale/timezone 仍有多处从调用参数/UI state 或业务字段间接携带；未来解释：

```text
今天
明天
本周
下午
Q4
```

应使用 owner-provided Product Time context，而不是 host ambient timezone 或 prompt 猜测。

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

## 9. Knowledge AI Index 当前状态

当前 `AiKnowledgeIndexEntry` key 仍围绕：

```text
repositoryId
resourceId
resourcePath
```

并存 summary/keywords/embedding/chunks/contentHash。

ADR-090 已经冻结稳定 `KnowledgeDocumentId`，ADR-091 已经冻结：

```text
Knowledge projection truth
!= AI index truth
```

因此 AI index 后续需要：

- 以 stable document identity 为 canonical key；
- `resourcePath` 只作为可更新 display/source snapshot；
- 不再把 AI indexing status 回写成 Repository 的第二份 truth；
- Workspace/read model 在查询时组合 Knowledge projection 与 AI index state。

## 10. Execution / Usage 当前状态

### 10.1 `AiGenerationTask` 已经名实不符

当前 production adapter 名称是：

```text
AIExecutionLogPrismaAdapter
AIExecutionLogPowerSyncAdapter
```

但底层表仍叫：

```text
ai_generation_tasks
```

字段已经是：

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

它实际是 observability/usage record，而不是 durable generation task aggregate。

### 10.2 `AiUsageQuota` 是高置信度 legacy candidate

本轮代码搜索没有发现真实 runtime/use-case 在执行 `AiUsageQuota` 的 quota state machine；主要剩 Prisma/generated code/ID VO tests。

当前不能只因名字看起来合理就继续保留。

如果未来 SaaS 真有配额/计费，应重新以：

```text
Entitlement / Budget / AIUsageLedger
```

建模，并区分 observability 与 accounting。

### 10.3 `KnowledgeGenerationTask` 同样是高置信度 legacy candidate

当前知识生成已经由 `knowledge.capture` Mastra durable Workflow 承载，本轮搜索未发现 `KnowledgeGenerationTask` 的 current product consumer。

删除前仍需完整 migration/portability/surface audit，但它不应继续作为目标态模型。

## 11. `AIApplicationPort` 当前职责偏宽

当前一个 `AIApplicationPort` 同时提供：

```text
Provider onboarding/management
Conversation shell
Knowledge query/reindex/expand
Analytics
Evaluation overview
```

目前尚未失控，但这些能力的调用方、风险和 ownership 已经不同。

如果继续扩张，Settings、Assistant、Operations/Eval 会被迫依赖同一个大接口。

目标应倾向窄 capability ports，而不是继续把所有“AI-related” API 塞进一个 facade。

## 12. Current ownership matrix

| State / capability                | Current effective owner        | Current problem                           |
| --------------------------------- | ------------------------------ | ----------------------------------------- |
| Assistant thread/messages         | Mastra                         | `AiMessage`/Conversation child shape 仍在 |
| Workflow run/snapshot             | Mastra                         | UI localStorage 保存 full shadow          |
| Conversation title/list shell     | MemoFlow AI                    | aggregate 仍过胖                          |
| Provider connection               | MemoFlow AI                    | config/secret/catalog/routing 混合        |
| Provider secret at rest           | AI SecretCipher/Vault          | plaintext DTO boundary 偏宽               |
| Model discovery                   | AI Provider path               | 尚无 capability contract                  |
| Goal/Task/Knowledge product truth | owner domains                  | AI draft 仍复制旧业务 schema              |
| Routine commands                  | Routine owner via AI tool port | tool schema 仍旧 trigger vocabulary       |
| Product time preference           | Setting/Time owner             | 未统一进入 AI Context seam                |
| Knowledge document identity       | Knowledge owner                | AI index 仍用 resourceId/path             |
| AI index                          | AI                             | 需要与 Knowledge projection 解耦彻底      |
| execution telemetry               | AI execution log               | `AiGenerationTask` 命名/状态语义过时      |
| quota/billing                     | 无已证实 current owner         | `AiUsageQuota` 高概率 legacy              |

## 13. 目标模型差异摘要

本轮设计准备收敛为：

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

当前 AI 的问题不是 runtime 地基错误，而是：

```text
Mastra runtime 已经正确
但周边 product shell / provider / context / drafts / persistence
仍保留上一代模型的形状
```

因此下一轮应称为：

> **AI vNext Model Convergence / Domain Alignment**

而不是第二次 AI runtime rewrite。
