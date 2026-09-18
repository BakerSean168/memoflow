---
tags:
  - architecture
  - ai
  - path-map
  - mastra
description: MemoFlow AI vNext 当前运行路径地图——Mastra 是唯一 Assistant/Workflow runtime
created: 2026-07-26T00:00:00
updated: 2026-09-18T00:00:00+00:00
---

# AI 运行路径地图

> ADR-050 / ADR-051 / ADR-052 与 AI-9612 已完成目标态切换。**TypeScript + Mastra 是唯一核心 AI execution runtime。**
> Python `apps/ai-service`、Agent Host、LangGraph bridge、TurnEngine、ProposalKernel、AgentRun checkpoint 双轨均已退役。

## 当前权威路径

| 路径                             | Client / Transport                                                              | Runtime authority                                    | Product authority                          |
| -------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| Open chat                        | `AssistantRuntimeClient` → `/ai/runtime/assistant/*` / `ai:runtime:assistant:*` | `MastraAIRuntime` + Mastra thread/memory             | Conversation shell + provider config       |
| Goal / Task / Knowledge workflow | `WorkflowRuntimeClient` → `/ai/runtime/workflow/*` / `ai:runtime:workflow:*`    | `MastraAIRuntime` + durable Mastra workflow snapshot | Goal / Task / Repository application ports |
| Usage / cost                     | `RuntimeUsageClient` → `/ai/runtime/usage` / `ai:runtime:usage:get`             | indexed `ai_execution_records` bounded projection    | Host-injected identity boundary            |
| Eval / release gate              | `ai:eval:replay` + canonical report adapter                                     | TypeScript eval runner                               | `reports/apps/ai/evals`                    |

## 1. Open chat

```text
AIChatView / useAIChatSession
  → AI_ASSISTANT_RUNTIME_KEY
    → Web: AssistantRuntimeHttpClient
       → POST /ai/runtime/assistant/history
       → POST /ai/runtime/assistant/delete
       → POST /ai/runtime/assistant/sse
       → POST /ai/runtime/assistant/cancel
    → Desktop: AssistantRuntimeIpcClient
      → MastraAIRuntime.dispatchMessage()
        → Mastra Assistant
        → provider/model resolved from ProviderDefinition + Connection + SecretVault + capability evidence
        → canonical assistant.* events
        → Mastra thread/memory persistence
        → AIExecutionRecord (request/trace/provider/model/token/cost)
```

### Contract rules

- Client command 永不携带 `identityId`；HTTP auth / authenticated IPC 在 host boundary 注入。
- `identityId` 映射 Mastra resource，`conversationId` 映射 thread。
- BYOK credential 只存在于 server-side model resolver；transport/event/log 不返回 API key。
- UI 只消费 canonical `assistant.*` event，不消费 provider/Mastra 私有 event。
- cancel 使用 runtime 生成的 `runId` 并进行 owner check。
- stream 中可显示即时 usage；terminal/history restore 后通过 `RuntimeUsageClient` 读取 durable conversation 累计 usage。
- history authority 是 Mastra thread；Conversation shell 只保存产品 metadata。生产路径没有 `AiMessage`/`ai_messages` transcript fallback 或双写。
- 禁止默认聊天回退 `AIClientService.dispatchAssistant` / `AssistantFacade`；不存在 legacy open-chat fallback。

## 2. Durable workflows

```text
Goal / Task / Knowledge panel
  → WorkflowRuntimeClient
    → start / resume / get / list / cancel
      → MastraAIRuntime
        → goal.create / task.create / knowledge.capture workflow
          → typed PlannerWorker
          → optional clarification/revise/reject
          → explicit approve/confirm
          → product mutation port
             ├─ GoalApplicationPort
             ├─ TaskApplicationPort
             └─ Repository knowledge persistence
```

Mastra 只拥有 workflow execution/snapshot。业务事实仍由 MemoFlow domain/application module 拥有；Mastra tool/workflow 不允许直写 Prisma/PowerSync repository。

`AIWorkflowRunView` 是 Web/Desktop 的唯一 workflow view contract。UI 不维护 AgentAction DAG、`pendingActions`、`approvedActions`、`dependsOn` 或第二套 approval lifecycle。

## 3. Usage / tracing / cost

Assistant turn 与 Goal/Task/Knowledge planner 调用都写入统一 execution log：

- 一等索引：`identity_id`, `conversation_id`, `run_id`, `request_id`, `trace_id`, `provider_id`, `model`；
- usage：prompt/completion/total token；
- cost：静态 pricing catalog 的 `estimated_cost_usd`；
- input 只记录安全元数据（例如 `contentLength` / planner `mode`），不记录 raw prompt；
- failure/cancel 使用稳定公开分类，不持久化 raw provider exception；HTTP/SSE/IPC 使用同一 redacted mapping。

`IAIUsageReadPort` 必须把 authenticated identity 放进数据库查询条件，再按 conversation/run 聚合；禁止从 JSON payload 全表扫描后在内存做 owner filtering。

## 4. Evaluation / release gate

Canonical report root：`reports/apps/ai/evals`。

`pnpm nx run ai:eval:replay` 使用同一 TypeScript runner 比较完整 configuration bundle（runtime/provider/model/prompt/tool-policy），覆盖：

- open chat；
- goal planning；
- knowledge answer；
- quality / case regression；
- estimated cost；
- p95 latency。

当前 `recorded_replay` 是离线、可复现的 CI 证据，不冒充 live model evaluation。未来 live executor 复用同一 dataset、comparison policy 与 report schema。

旧 `reports/apps/ai-service/evals` 只保留为版本历史证据；当前 runtime adapter 不读取该目录，也不存在 legacy report fallback。

## 5. Host composition

API 与 Desktop 都只创建一个 `MastraAIRuntime`，并将同一对象同时作为：

- `mastraRuntime`（Assistant）；
- `workflowRuntime`（durable Workflow）；
- execution-log producer；
- durable usage read consumer。

API 使用 PostgreSQL-backed Mastra storage；Desktop 使用 profile-local LibSQL storage。两端共享 contracts/client 语义，不共享 framework private types。

## 6. 反回退锁

- `ai-vnext-no-legacy.surface.spec.ts`：旧 Python/AgentHost/dual-runtime 文件、transport token、AgentAction DAG、deploy env 不得回归。
- `architecture-surface-audit.mjs` 的 `AI_MASTRA_RUNTIME_AUTHORITY`：锁 `MastraAIRuntime`、API/Desktop composition root 与 retired files。
- package/public-surface audits：禁止重新把 concrete legacy runtime adapter 暴露到 public root。
- HTTP/IPC parity tests：锁 host-owned identity、runtime usage、Assistant/Workflow transport。

## 相关

- [ADR-050 — Mastra Native AI Runtime](./adr/ADR-050-mastra-native-ai-runtime.md)
- [ADR-051 — AI Primitive Taxonomy](./adr/ADR-051-ai-primitive-taxonomy.md)
- [ADR-052 — Goal Create Reference Workflow](./adr/ADR-052-goal-create-reference-workflow.md)
- [AI vNext archived implementation plan](../plan/archive/2026-08-20-mastra-native-ai-vnext-refactor.md)
