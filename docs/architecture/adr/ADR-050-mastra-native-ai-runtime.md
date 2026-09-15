---
tags:
  - adr
  - ai
  - agent
  - mastra
  - runtime
  - workflow
  - observability
description: MemoFlow AI vNext - Mastra-native runtime、单一状态所有权与 TypeScript 模块化单体
created: 2026-08-20T00:00:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# ADR-050: MemoFlow AI vNext — Mastra-native Runtime 与单一状态所有权

> **2026-09-09 后续收敛：** 本 ADR 关于 Mastra 单一 runtime、MemoFlow product truth、owner application port 与 observability/accounting 分离的决策继续有效；Conversation shell、UI durable state、Provider secret/model capability、Context/Knowledge index 与 execution persistence 由 ADR-096～099 进一步收敛。ADR-096～099 不引入第二 runtime。

**状态：** 已采纳  
**日期：** 2026-08-20  
**取代：** ADR-035 中关于自研 Agent Host、Workflow/Turn/Model 三引擎宿主、Python LangGraph 长期保留的目标态决策  
**影响范围：** `packages/ai`、`packages/contracts/ai`、`apps/api`、`apps/desktop`、`packages/app-vue`、`apps/ai-service`、AI 数据表与部署

## 1. 决策摘要

MemoFlow AI vNext 采用 **TypeScript + Mastra-native** 作为唯一核心 Agent runtime。MemoFlow 不再维护一套自研 Agent Framework 去包装 Mastra，也不再以独立 Python FastAPI/LangGraph 服务作为核心 AI 执行面。

核心原则：

> **现有实现只决定迁移成本，不决定目标架构；已经正确的业务/domain invariant 继续约束目标架构。**

> **Mastra 拥有 Agent 技术状态；MemoFlow 拥有产品业务事实。每个状态转移只允许一个 authoritative owner。**

目标物理拓扑：

```text
Web / Desktop / Mobile
        |
        v
Existing Node / Express host
        |
        +---------------- MemoFlow Application Domains
        |                  Goal / Task / Habit / Reminder / Knowledge
        |
        `---------------- Mastra Runtime
                           |- AgentController
                           |- MemoFlow Assistant
                           |- Worker Agents
                           |- Workflows
                           |- Memory
                           |- Storage
                           |- Tools / Skills / Workspace
                           |- Models
                           |- Evals
                           `- Observability
```

明确删除目标：

```text
Node -> HTTP/HMAC -> Python FastAPI -> LangGraph -> HTTP -> Node checkpoint/domain
```

以及为该拓扑产生的双重运行状态、双重审批、provider loop、checkpoint bridge 和 engine abstraction。

## 2. 背景与证据

### 2.1 当前事实

当前 API lane 的 `compose-ai.ts` 会构造八个 `AIService*Adapter`，将 chat、goal、knowledge、analytics、agent runtime 转发到 `apps/ai-service`。Python 服务使用 FastAPI + LangGraph；生产持久化又通过 `TSLangGraphCheckpointSaver` / `TSCheckpointClient` 回调 Node 内部 checkpoint routes。

当前同一个 Goal 创建路径同时存在多套状态：

- Vue `useAIGoalWorkflow` 的 UI workflow state；
- TypeScript `GenerateAIGoalUseCase` 的 draft/prepare/execute state；
- TypeScript Host `AgentRun` / Proposal lifecycle；
- Python LangGraph graph state / checkpoint；
- 最终 Goal/Task/Reminder domain state。

这不是必要的“解耦”，而是 orchestration ownership 重复。

### 2.2 外部框架事实

截至本 ADR 日期，Mastra 已提供稳定 TypeScript Agent/Workflow runtime、AgentController、持久 thread/session、workflow suspend/resume + snapshot、tools、memory、workspace/skills、eval/dataset/experiment、observability，以及可嵌入既有 Express 的 server adapter。MemoFlow 因此不再需要为了 durable workflow 保留 Python，也不需要自行复制完整 Agent Host runtime。

### 2.3 为什么不继续 ADR-035 目标态

ADR-035 在当时正确识别了产品业务边界、安全审批和框架私有状态，但把“框架可能替换”推导成了长期维护：

```text
MemoFlow Agent Host
  + WorkflowEngine abstraction
  + TurnEngine abstraction
  + ModelGateway abstraction
```

当核心 Agent runtime 已明确收敛到 Mastra 时，这些抽象不再提供现实替换价值，反而要求 MemoFlow 同时维护自己的 run/session/capability/proposal 语义与 Mastra 原生语义。vNext 选择删除这种 speculative abstraction。

## 3. North-Star Ownership

### 3.1 MemoFlow 永久拥有的业务事实

MemoFlow Domain / Application 层是下列事实的唯一真值：

- Identity / Account / Privacy；
- Goal / Plan / KeyResult；
- Task / Habit / Reminder / Schedule 的业务定义；
- Knowledge Note 与 Vault/Git repository 业务语义；
- ProviderConfig 与 credential ownership；
- 用户明确需要长期存在的 product shell metadata（例如 Conversation title/visibility/sync policy）；
- 未来真实收费时的 `AIUsageLedger` / accounting facts；
- 业务 mutation audit / reliable operation / idempotency facts。

模型、Agent、Workflow 均不得绕过 Application Port 直接写 Prisma、PowerSync 或真实 Vault。

### 3.2 Mastra 永久拥有的 AI 技术状态

Mastra 是下列状态的唯一真值：

- AgentController session/thread/mode/permission state；
- Agent turn/run execution state；
- conversation message history 与 agent memory；
- Workflow run、step、snapshot、suspend/resume state；
- worker/subagent runtime state；
- tool-call execution telemetry；
- model invocation trace、token、estimated cost、latency、error；
- scorer/eval/experiment execution state；
- workspace/skill runtime metadata。

MemoFlow 不再复制 `AgentRunCheckpoint` 或 LangGraph checkpoint 成第二本账。

### 3.3 Thin product association 允许存在

若跨端授权、产品列表或业务链接需要稳定关联，允许 MemoFlow 保存**薄关联**：

```text
AIExecutionLink
- id
- identityId
- conversationId
- runtimeKind
- runtimeRunId
- productEntityId?
- createdAt
```

该表不是运行状态机，不复制 status/step/checkpoint/messages。

## 4. 运行形态

### 4.1 Interactive Agent

开放对话、分析、按需调用 query tools：

```text
AgentController -> MemoFlow Assistant -> Tools -> response
```

用户只看到一个 `MemoFlow Assistant`。

### 4.2 Deterministic Durable Workflow

具有明确业务阶段、审批、interrupt、恢复语义的过程使用 Mastra Workflow，例如：

- `goal.create`
- `goal.replan`
- `task.create`
- `habit.setup`
- `weekly.review`
- `knowledge.capture`
- `knowledge.organize`

Workflow 拥有 durable execution；业务 Application Service 拥有最终 mutation。

### 4.3 Long-running Autonomous Execution

文件量大、tool-heavy、可能需要持续自主判断的任务，优先使用 Mastra AgentController / durable agent / subagent 能力。**vNext 不预埋 Pi 双 runtime。** 只有实际 benchmark 证明 Mastra 无法满足产品需求时，才新增隔离 adapter；不得提前恢复 `TurnEngine` 抽象。

## 5. Identity

统一 identity mapping：

```text
MemoFlow identityId      -> Mastra resourceId
MemoFlow conversationId  -> Mastra threadId
Assistant turn           -> Mastra runId
Workflow execution       -> Mastra workflow runId
```

禁止 UI/业务层随机再创建与 Conversation 平行的 `threadId`。

## 6. Provider 与 Model

MemoFlow 保留 `AIProviderConfig` 与加密 credential store，因为它们属于用户产品数据。模型运行由 Mastra/AI SDK provider 完成。

目标：

```text
ProviderConfigRepository
  -> Request-scoped ModelResolver
  -> Mastra Agent / Workflow
  -> provider API
```

不再长期维护：

- Python `LLMProvider`；
- `ProviderFactory`；
- 手写 provider-native tool loop；
- direct-provider/remote-ai-service 两套 runtime；
- 为“也许将来换框架”存在的万能 `ModelGateway`。

BYOK 单机阶段不引入 LiteLLM。LiteLLM Proxy 仅作为未来 SaaS 需要 centralized routing/fallback/quota/budget 时的可选 infrastructure，不得成为核心 runtime 前提。

## 7. Memory 与 Conversation

产品可保留轻量 Conversation shell：id、identity、title、status、privacy/sync metadata。消息、agent memory 和长期 observation 由 Mastra Memory 管理。

同一份 transcript 不允许在 `AiMessage` 与 Mastra memory 双写后再做 reconciliation。迁移完成后 `AiMessage` 退役，除非另有 ADR 明确将 transcript 重新定义为产品法定记录。

## 8. HITL 与业务写入

- Tool-call 风险本身需要确认：使用 Mastra tool approval。
- 整体业务草稿/计划需要审阅：使用 Workflow suspend/resume。
- GoalPlanDraft/KnowledgeDraft 等是 typed workflow intermediate state；默认不创建产品数据库 Draft 表。
- 最终 mutation 只进入 MemoFlow Application Service。
- 所有批准后的 mutation 必须有确定性 idempotency key；网络重试不得重复创建业务实体。

通用 `ProposalKernel + AgentAction[] + dependsOn[]` 不再作为业务执行模型。

## 9. Observability / Eval / Billing

Mastra Observability 是 Agent/Workflow/model/tool telemetry 的默认系统，记录 trace、token、estimated cost、latency、error、score。

MemoFlow 业务审计保持在 domain/application 层。未来收费账本必须独立：

```text
Observability != Accounting
```

`AIUsageLedger` 若引入，保存 provider-reported usage/cost 与 billed amount，不能以 trace store 作为财务 source of truth。

Langfuse 仅作为可选 OTel/exporter 后端；默认开源单机形态不要求额外部署它。

## 10. Storage 与部署

Server/API lane 使用与产品部署同生命周期的 Mastra persistent storage；Desktop/local-only lane 使用本机持久 storage。具体 provider 由 host composition root 决定，但同一个 run 只允许一个 storage owner。

首选：

- Server：PostgreSQL-backed Mastra storage；
- Desktop 本地：LibSQL/SQLite-backed Mastra storage；
- 不新增独立 Python process；
- 不为 Mastra 单独新增 HTTP service，除非未来部署拓扑有独立扩容证据。

## 11. 保留与退休

### 保留

- Goal/Task/Reminder/Knowledge application/domain ports；
- ProviderConfig domain + secret encryption；
- HTTP/IPC authentication 与 ExecutionContext；
- Obsidian/Git adapter 边界；
- Result/failure contracts；
- user-facing routing/deep-link/工作台 UX 目标；
- eval golden cases 中仍表达正确业务质量的案例。

### 退休

- `apps/ai-service` 核心 runtime；
- `AIService*Adapter` + HMAC transport；
- Python LangGraph graph/checkpoint/client；
- `AgentRunCheckpoint` / `LangGraphCheckpoint*`；
- `TurnEngine` / `WorkflowEngine` / `CapabilityResolver` / `ResolvedRunPlan`；
- `ProposalKernel` 作为 Goal/Task/Knowledge 通用生命周期；
- `AgentAction[]` 通用 mutation DAG；
- UI 对 pending/approved/executed action 的 orchestration；
- open-chat legacy/direct/remote 多默认路径。

## 12. 安全不变量

1. 身份只从 trusted ExecutionContext 注入，客户端不得覆盖。
2. API key 不进入 prompt、memory、workflow snapshot 或 UI event。
3. 检索的 Vault/Git/Web 内容均为 untrusted context，不能扩大 tool permissions。
4. Agent 不得拿真实 Prisma client 或 unrestricted Vault filesystem。
5. 真实业务 mutation 通过 typed application command；高风险 mutation 需要审批。
6. Desktop 不因 runtime fallback 静默把本地数据发送到云端。
7. Workspace 面向真实 Vault 时默认只读/ staging；批量写采用 diff + approval + apply。

## 13. License 治理

MemoFlow 开源运行时只依赖 Mastra Apache-2.0 core surface。任何 Mastra Enterprise-only (`ee/`) 能力不得成为默认运行依赖；若未来采用，必须单独 ADR 评估许可证与分发影响。

## 14. 后果

### 正面

- Python/Node 双运行时和双 checkpoint 消失；
- Agent/Workflow/Memory/Observability 使用同一套原生 primitive；
- UI 不再承担 workflow engine 职责；
- BYOK、token/cost、eval、HITL 有统一实现；
- 业务 domain invariant 不受框架替换污染。

### 成本

- 这是 breaking refactor，需要同批迁移 API/IPC/contracts/UI/tests；
- 旧 Agent Host 大量 surface test 将被删除或重写；
- Mastra 版本升级成为核心依赖治理事项；
- 迁移期间必须清晰处理旧 transcript/checkpoint 数据的 retire policy。

## 15. 验收

- Core AI runtime 生产代码不依赖 Python `ai-service`。
- 无 `AIService*Adapter` 生产 wiring。
- 无 LangGraph checkpoint HTTP 回调链。
- `goal.create` 完整运行在 Mastra Workflow，含 clarify/review/resume/apply。
- open chat 运行在 Mastra Agent/AgentController 路径。
- UI 不再维护 `pendingActions/approvedActions/dependsOn`。
- Goal/Task/Reminder 写入只走现有 application ports。
- token/cost/trace 可按 run/thread 关联。
- 全量 typecheck/lint/test/build/governance/docs checks 通过。
