---
tags:
  - adr
  - ai
  - context
  - memory
  - knowledge
  - tools
  - ownership
  - vnext
description: ADR-098 - AIContextEnvelope、Product Time Context、Knowledge Index stable identity 与 owner-domain contract reuse boundary
created: 2026-09-09T00:00:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# ADR-098: AI Context、Knowledge Index 与 Owner Contract Boundary

**状态：** 已采纳（待实施）
**日期：** 2026-09-09
**影响范围：** AI Context/Memory/Tools、Goal/Task/Routine/Planner/Notification adapters、Knowledge/Repository、Setting/Product Time、Mastra workers/workflows
**依赖：** ADR-051、ADR-076～079、ADR-080～088、ADR-089～093

## 1. 决策摘要

MemoFlow 建立统一的 invocation-scoped：

```text
AIContextAssembler
  -> AIContextEnvelope
```

作为重要 Agent/Workflow 调用的 canonical context seam。

同时冻结三条边界：

1. AI context 中的用户时间来自 `UserTimeContextPort`，不来自 host ambient timezone 或 prompt 猜测；
2. AI Knowledge Index 以 stable `KnowledgeDocumentId` 为 identity，不再以 path/resource id 作为长期主键语义；
3. AI tool/read port 可以裁剪 owner-domain contract，但不能重新定义 Goal/Task/Routine/Planner/Notification 的核心业务语言。

## 2. 为什么 Context 需要成为正式架构对象

当前各 worker/workflow 自己拼接：

```text
conversation transcript
clarification history
current draft
selected query results
```

ADR-051 已经要求 context 有 source/trust/sensitivity/token-budget metadata，但当前尚未形成统一、可测试的 assembler。

如果继续各自拼 prompt，容易出现：

- 同一用户 timezone 在不同 workflow 解释不同；
- retrieved untrusted text 与 authoritative domain fact 混在同一层；
- token budget 不可预测；
- AI tool adapter 复制旧业务 DTO；
- Knowledge path rename 后 index/reference 失联。

## 3. `AIContextEnvelope` 不是持久业务实体

它是 per-invocation projection：

```ts
interface AIContextEnvelope {
  invocation: {
    identityId: IdentityId;
    conversationId?: AIConversationId;
    surface?: string;
    locale?: string;
  };
  userTimeContext?: UserTimeContext;
  selectedEntities: ContextEntityRef[];
  domainFacts: ContextSection[];
  knowledgeEvidence: KnowledgeEvidence[];
  memoryProjection: ContextSection[];
  sections: ContextSection[];
}
```

它不建 Product aggregate/table，不承担 source-of-truth persistence。

## 4. Context section metadata

每段 context 必须携带足够治理元数据：

```ts
interface ContextSection {
  source: string;
  trust:
    | 'system'
    | 'workflow_instruction'
    | 'authoritative_domain'
    | 'user_input'
    | 'memory'
    | 'retrieved_untrusted'
    | 'external_untrusted';
  sensitivity: 'public' | 'private' | 'secret-prohibited';
  tokenBudget: number;
  content: unknown;
}
```

具体 enum 可以在实施时按现有 contracts 命名调整，但语义必须保持。

## 5. Trust ordering

Context assembler 固定优先级：

```text
system safety / product invariants
        >
workflow/skill instructions
        >
authenticated domain facts
        >
current user input
        >
Mastra memory projection
        >
retrieved knowledge
        >
external/web untrusted content
```

低 trust 内容只能影响内容推理，不得：

- 扩大 tool permission；
- 修改 identity；
- 绕过 review/approval；
- 覆盖 domain invariant；
- 要求 secret 进入 prompt；
- 把外部文本当成系统指令执行。

## 6. Token budget

Assembler 必须有预算策略，而不是把能找到的全部塞进 prompt。

默认优先：

```text
current task required facts
> selected entity
> recent conversation
> relevant knowledge evidence
> stable memory observations
> historical extras
```

每个 workflow/agent 可以声明 context budget profile，但不能绕开 trust/sensitivity policy。

## 7. Product Time Context

Setting ADR-093 已经定义：

```text
UserTimeContextPort
  -> timeZone
  -> weekStartsOn
```

AIContextAssembler 统一消费该 port。

### 7.1 所有自然语言时间解释经过 owner time context

涉及：

```text
今天
明天
后天
本周
周末
下午
今晚
这个季度
Q4
```

的 planner/workflow 必须使用：

```text
@memoflow/time
+
UserTimeContext
```

不能使用：

```text
new Date() + server local timezone
Intl.resolvedOptions() in server business logic
LLM assumption from locale
```

### 7.2 Explicit schedule timezone 继续由 owner domain 决定

Task/Routine/Scheduler object 若已有 explicit timezone snapshot，则 AI 读取并按 owner contract 解释；UserTimeContext 不追溯改写既有 schedule object。

## 8. Selected entity / surface context

Context 只携带当前 invocation 真正需要的 selection：

```text
selected Goal
selected Task
current Knowledge document
current Planner range
current Routine/Profile
```

不要把整个用户所有 Goal/Task/Knowledge 全量注入。

Selection 必须是稳定 entity id/ref，不以 UI component instance 或 mutable path 作为长期 identity。

## 9. Owner-domain contract reuse rule

AI 可以定义：

```text
AI tool input/output envelope
AI-friendly summary projection
```

但不能重新发明 owner domain 的核心语义。

### 9.1 Task

禁止长期维持：

```text
AITaskTemplateId
AITaskInstanceDate
AI-only dueDate semantics
AI-only recurrence vocabulary
```

应读取 Task owner 的：

```text
TaskPlan / TaskOccurrence / TaskPlanSchedule
```

或由 Task owner 提供专门 read projection。

### 9.2 Routine

AI tool schema 跟随 ADR-076～079：

```text
RoutineDefinition
RoutineTrigger: WallClock | Elapsed | ActiveUsage
RoutineTemporaryOverride
RoutineInterventionPolicy
RoutineRuntimeContext read projection
```

不继续扩展 legacy `FixedTime | Interval` vocabulary。

### 9.3 Planner

AI 只读：

```text
PlannerWindow / occupancy / conflicts / owner projections
```

不直接读取 Scheduler invocation/lease/retry state。

### 9.4 Notification

AI 读取 Notification Fact/Inbox projection；不复制已退休的中央 category/template/channel delivery model，也不操作 dispatch worker state。

## 10. AI tool boundary

Tool 必须继续遵守 ADR-051：

```text
query
mutation
integration
orchestration
```

### 10.1 Query tools

只读 owner facts/projections，不持久化 shadow state。

### 10.2 Mutation tools

必须调用 owner application/command port；有高影响行为时使用 Mastra approval/HITL。

### 10.3 Scheduler/Delivery internal state

AI tool public schema 中禁止出现：

```text
lease token
fencing token
retry counter
worker attempt
channel delivery implementation state
raw ScheduleTask/ScheduledInvocation mutation
```

除非未来明确有 operations/admin AI，并单独通过受控 capability 设计。

## 11. Knowledge identity

ADR-090 已冻结 stable `KnowledgeDocumentId`。

AI index target：

```ts
interface AIKnowledgeIndexEntry {
  identityId: IdentityId;
  knowledgeSpaceId: KnowledgeSpaceId;
  documentId: KnowledgeDocumentId;
  sourceContentHash: string;
  status: AIKnowledgeIndexStatus;
  summary?: string;
  keywords: string[];
  chunks?: unknown;
  embedding?: unknown;
  metadata: Record<string, unknown>;
  indexedAt: Instant;
  lastRequestedAt?: Instant | null;
}
```

## 12. Path is projection, not identity

当前 `resourcePath` 可以在 migration/read model 中保留，但语义只能是：

```text
current source/display snapshot
```

rename/move 后：

```text
same KnowledgeDocumentId
new path projection
same AI index semantic identity
```

禁止：

```text
path rename
-> delete old semantic document
-> create unrelated new AI document identity
```

## 13. Knowledge projection / AI index separation

ADR-091 继续有效：

```text
Knowledge/Repository
= document/source projection truth

AI
= index/retrieval projection truth
```

因此：

- AI 不回写 Repository 的 canonical `indexStatus`；
- Repository 不保存 AI embedding/chunk truth；
- Workspace/read model 组合两边状态；
- reindex/delete 使用 stable document id 协调。

## 14. Knowledge evidence contract

注入 planner/assistant 的 retrieval result 必须保留 provenance：

```ts
interface KnowledgeEvidence {
  documentId: KnowledgeDocumentId;
  title?: string;
  excerpt: string;
  score?: number;
  sourceRef?: string;
  contentHash?: string;
  trust: 'retrieved_untrusted';
}
```

即使来源是用户自己的知识库，正文中仍可能包含提示注入文本，所以对 runtime instruction hierarchy 仍按 retrieved data 处理。

## 15. Memory boundary

Mastra Memory 只回答：

> 未来 turn 为了更好帮助用户，需要保留什么 agent context？

允许：

```text
thread transcript
stable user preference observation
working memory
high-level prior-work summary
```

禁止作为 Memory truth：

```text
Goal lifecycle
Task completion
Routine schedule state
Notification preference
UserTimeContext
Provider credential
Knowledge document only copy
billing/accounting balance
```

这些必须每次从 owner source 读取。

## 16. Future assistant observation

若未来确有“长期 AI 观察”产品需求，另建：

```text
AssistantMemoryObservation
├── observation
├── provenance
├── confidence
├── visibility
├── createdAt
└── expiresAt?
```

本轮不预建，不用 generic Memory table 替代明确产品设计。

## 17. Context observability

可以记录安全 metadata：

```text
section source
trust level
token count
document ids
selected entity ids
```

禁止把：

```text
raw secret
full private document content
Authorization
provider credential
```

为 observability 方便写入 trace。

## 18. Protected contracts

1. ADR-037 Product Time；
2. ADR-093 UserTimeContext owner；
3. ADR-090 stable KnowledgeDocument identity；
4. ADR-091 projection/index boundary；
5. owner-domain write ports；
6. Mastra Memory 非业务 source of truth；
7. Scheduler/Notification delivery internals不暴露给普通 AI；
8. retrieval provenance/citations 保留；
9. authenticated identity 不从 context data 覆盖；
10. no arbitrary `Context: Record<string, unknown>` public bag。

## 19. 明确拒绝

本 ADR 拒绝：

- 每个 worker 自己无限拼 prompt context；
- server ambient timezone；
- AI 复制所有业务 DTO 成 `AI*` 版本；
- path 作为 Knowledge semantic identity；
- Repository/AI 双写 index status；
- Memory 替代 Settings/Goal/Task/Knowledge 数据库；
- retrieved note 改写 tool permission/system instruction。

## 20. Acceptance target

实现完成后能够证明：

```text
same user + same selected entity + same domain facts
```

在不同 server host timezone 上产生相同 AI time interpretation context；

并证明：

```text
Knowledge document rename/move
 -> KnowledgeDocumentId unchanged
 -> AI index entry remains same semantic document
 -> retrieval citation points to updated source projection
```

同时 production AI ports 中不再出现已经退休的 Task/Routine/Notification 核心 vocabulary shadow。
