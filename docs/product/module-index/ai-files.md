---
tags:
  - product
  - module-index
  - ai
description: AI 模块相关文件索引
created: 2026-06-02T00:00:00
updated: 2026-09-18T00:00:00+00:00
---

# AI 模块文件索引

AI-9612 后，MemoFlow 的核心 AI execution runtime 已收敛为 **TypeScript + Mastra**。本索引只列当前生产路径；Python `apps/ai-service`、LangGraph bridge、Agent Host、TurnEngine、ProposalKernel 与双 runtime 路径已退役。

## 前端工作区

| 文件                                                                                                                                                          | 说明                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| [`packages/app-vue/src/modules/ai/views/AIChatView.vue`](../../../packages/app-vue/src/modules/ai/views/AIChatView.vue)                                       | AI Chat / Workflow 主工作区                |
| [`packages/app-vue/src/modules/ai/composables/useAIChatView.ts`](../../../packages/app-vue/src/modules/ai/composables/useAIChatView.ts)                       | 工作区投影与会话协调                       |
| [`packages/app-vue/src/modules/ai/composables/useAIChatSession.ts`](../../../packages/app-vue/src/modules/ai/composables/useAIChatSession.ts)                 | Mastra Assistant 会话生命周期              |
| [`packages/app-vue/src/modules/ai/composables/useAIGoalWorkflow.ts`](../../../packages/app-vue/src/modules/ai/composables/useAIGoalWorkflow.ts)               | `goal.create` WorkflowRunView 薄投影       |
| [`packages/app-vue/src/modules/ai/composables/useAITaskWorkflow.ts`](../../../packages/app-vue/src/modules/ai/composables/useAITaskWorkflow.ts)               | `task.create` WorkflowRunView 薄投影       |
| [`packages/app-vue/src/modules/ai/composables/useAIKnowledgeCapture.ts`](../../../packages/app-vue/src/modules/ai/composables/useAIKnowledgeCapture.ts)       | `knowledge.capture` WorkflowRunView 薄投影 |
| [`packages/app-vue/src/modules/ai/composables/useAIKnowledgeQaWorkflow.ts`](../../../packages/app-vue/src/modules/ai/composables/useAIKnowledgeQaWorkflow.ts) | Knowledge QA 查询投影                      |
| [`packages/app-vue/src/modules/ai/components/AIGoalWorkflowPanel.vue`](../../../packages/app-vue/src/modules/ai/components/AIGoalWorkflowPanel.vue)           | Goal workflow review/recovery/result       |
| [`packages/app-vue/src/modules/ai/components/AITaskWorkflowPanel.vue`](../../../packages/app-vue/src/modules/ai/components/AITaskWorkflowPanel.vue)           | Task workflow review/recovery/result       |
| [`packages/app-vue/src/modules/ai/components/AIKnowledgeCapturePanel.vue`](../../../packages/app-vue/src/modules/ai/components/AIKnowledgeCapturePanel.vue)   | Knowledge capture review/recovery/result   |
| [`packages/app-vue/src/modules/ai/components/AIConversationSidebar.vue`](../../../packages/app-vue/src/modules/ai/components/AIConversationSidebar.vue)       | 会话列表                                   |
| [`packages/app-vue/src/modules/ai/components/AIMessagePanel.vue`](../../../packages/app-vue/src/modules/ai/components/AIMessagePanel.vue)                     | 消息展示                                   |
| [`packages/app-vue/src/modules/ai/components/AIFooterComposer.vue`](../../../packages/app-vue/src/modules/ai/components/AIFooterComposer.vue)                 | 输入与工具入口                             |

## Mastra Runtime

| 文件                                                                                                                                                          | 说明                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`packages/ai/src/server/mastra/runtime/mastra-ai.runtime.ts`](../../../packages/ai/src/server/mastra/runtime/mastra-ai.runtime.ts)                           | 单一 Assistant / Workflow runtime owner                              |
| [`packages/ai/src/server/mastra/runtime/assistant-history.service.ts`](../../../packages/ai/src/server/mastra/runtime/assistant-history.service.ts)           | Assistant transcript/history                                         |
| [`packages/ai/src/server/mastra/models/model-resolver.ts`](../../../packages/ai/src/server/mastra/models/model-resolver.ts)                                   | BYOK provider/model resolution                                       |
| [`packages/ai/src/server/mastra/context/ai-context-assembler.ts`](../../../packages/ai/src/server/mastra/context/ai-context-assembler.ts)                         | Product Time、trust metadata 与 token budget boundary                 |
| [`packages/ai/src/server/mastra/agents/memoflow-assistant.ts`](../../../packages/ai/src/server/mastra/agents/memoflow-assistant.ts)                           | 用户开放式 Assistant                                                 |
| [`packages/ai/src/server/mastra/agents/goal-planner.worker.ts`](../../../packages/ai/src/server/mastra/agents/goal-planner.worker.ts)                         | Goal planning worker                                                 |
| [`packages/ai/src/server/mastra/agents/task-planner.worker.ts`](../../../packages/ai/src/server/mastra/agents/task-planner.worker.ts)                         | Task planning worker                                                 |
| [`packages/ai/src/server/mastra/agents/knowledge-capture.planner.ts`](../../../packages/ai/src/server/mastra/agents/knowledge-capture.planner.ts)             | Knowledge capture worker                                             |
| [`packages/ai/src/server/mastra/workflows/goal-create.workflow.ts`](../../../packages/ai/src/server/mastra/workflows/goal-create.workflow.ts)                 | durable `goal.create` workflow                                       |
| [`packages/ai/src/server/mastra/workflows/task-create.workflow.ts`](../../../packages/ai/src/server/mastra/workflows/task-create.workflow.ts)                 | durable `task.create` workflow                                       |
| [`packages/ai/src/server/mastra/workflows/knowledge-capture.workflow.ts`](../../../packages/ai/src/server/mastra/workflows/knowledge-capture.workflow.ts)     | durable `knowledge.capture` workflow                                 |
| [`packages/ai/src/server/mastra/workflows/apply-goal-plan.service.ts`](../../../packages/ai/src/server/mastra/workflows/apply-goal-plan.service.ts)           | deterministic Goal mutation boundary                                 |
| [`packages/ai/src/server/mastra/workflows/apply-task-plan.service.ts`](../../../packages/ai/src/server/mastra/workflows/apply-task-plan.service.ts)           | deterministic Task mutation boundary                                 |
| [`packages/ai/src/server/mastra/workflows/apply-knowledge-note.service.ts`](../../../packages/ai/src/server/mastra/workflows/apply-knowledge-note.service.ts) | deterministic Knowledge mutation boundary                            |
| [`packages/ai/src/server/mastra/tools/product-tools.ts`](../../../packages/ai/src/server/mastra/tools/product-tools.ts)                                       | AI-6102/6103 Routine commands + Planner/Notification read-only tools |
| [`packages/ai/src/server/application/ports/routine-command.port.ts`](../../../packages/ai/src/server/application/ports/routine-command.port.ts)               | AI-owned Routine command abstraction                                 |
| [`packages/ai/src/server/application/ports/planner-read.port.ts`](../../../packages/ai/src/server/application/ports/planner-read.port.ts)                     | AI-owned read-only Planner projection                                |
| [`packages/ai/src/server/application/ports/notification-read.port.ts`](../../../packages/ai/src/server/application/ports/notification-read.port.ts)           | AI-owned Notification Fact reader                                    |

## Application capabilities 与 failure boundary

| 文件                                                                                                                                                                      | 说明                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`packages/ai/src/server/application/ai.application.capabilities.ts`](../../../packages/ai/src/server/application/ai.application.capabilities.ts)                         | Provider、Assistant、Knowledge、Evaluation 四个真实 consumer capability ports               |
| [`packages/ai/src/server/transport/ai-controller-errors.ts`](../../../packages/ai/src/server/transport/ai-controller-errors.ts)                                           | API/IPC 共用的 stable AI failure code、HTTP projection 与 secret-safe message mapping         |
| [`packages/ai/src/server/infrastructure/security/provider-safe-fetch.ts`](../../../packages/ai/src/server/infrastructure/security/provider-safe-fetch.ts)                   | provider HTTPS/SSRF/DNS 与 request-time credential guard                                     |

## Transport 与宿主组合

| 文件                                                                                                                                                                                                  | 说明                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| [`packages/ai/src/api/routes/ai-runtime.routes.ts`](../../../packages/ai/src/api/routes/ai-runtime.routes.ts)                                                                                         | Canonical Assistant / Workflow HTTP surface |
| [`packages/ai/src/api/routes/ai-chat.routes.ts`](../../../packages/ai/src/api/routes/ai-chat.routes.ts)                                                                                               | Conversation shell HTTP surface             |
| [`packages/ai/src/api/routes/ai-provider.routes.ts`](../../../packages/ai/src/api/routes/ai-provider.routes.ts)                                                                                       | Provider/BYOK HTTP surface                  |
| [`packages/ai/src/api/routes/ai-knowledge-query.routes.ts`](../../../packages/ai/src/api/routes/ai-knowledge-query.routes.ts)                                                                         | Knowledge QA HTTP surface                   |
| [`packages/ai/src/api/routes/ai-analytics-query.routes.ts`](../../../packages/ai/src/api/routes/ai-analytics-query.routes.ts)                                                                         | Analytics query HTTP surface                |
| [`packages/ai/src/server/infrastructure/ai.module.ts`](../../../packages/ai/src/server/infrastructure/ai.module.ts)                                                                                   | AI module composition root                  |
| [`apps/api/src/runtime/compose-ai.ts`](../../../apps/api/src/runtime/compose-ai.ts)                                                                                                                   | API host Mastra composition                 |
| [`apps/desktop/src/main/runtime/compose-ai.ts`](../../../apps/desktop/src/main/runtime/compose-ai.ts)                                                                                                 | Desktop host Mastra composition             |
| [`apps/api/src/modules/ai/routine-command.adapter.ts`](../../../apps/api/src/modules/ai/routine-command.adapter.ts)                                                                                   | API host AI → Routine owner-command adapter |
| [`apps/api/src/modules/ai/planner-read.adapter.ts`](../../../apps/api/src/modules/ai/planner-read.adapter.ts)                                                                                         | API host read-only Planner/Task projection  |
| [`apps/api/src/modules/ai/notification-read.adapter.ts`](../../../apps/api/src/modules/ai/notification-read.adapter.ts)                                                                               | API host Notification Fact projection       |
| [`apps/desktop/src/main/modules/ai/routine-command.adapter.ts`](../../../apps/desktop/src/main/modules/ai/routine-command.adapter.ts)                                                                 | Desktop AI → Routine owner-command adapter  |
| [`packages/ai/src/server/infrastructure/adapters/openai-compatible-chat-execution.adapter.ts`](../../../packages/ai/src/server/infrastructure/adapters/openai-compatible-chat-execution.adapter.ts)   | OpenAI-compatible BYOK execution adapter    |
| [`packages/ai/src/server/infrastructure/adapters/openai-compatible-knowledge-query.adapter.ts`](../../../packages/ai/src/server/infrastructure/adapters/openai-compatible-knowledge-query.adapter.ts) | Knowledge query provider adapter            |
| [`packages/ai/src/server/infrastructure/adapters/openai-compatible-analytics-query.adapter.ts`](../../../packages/ai/src/server/infrastructure/adapters/openai-compatible-analytics-query.adapter.ts) | Analytics query provider adapter            |
| [`packages/ai/src/server/infrastructure/adapters/deterministic-knowledge-ingestion.adapter.ts`](../../../packages/ai/src/server/infrastructure/adapters/deterministic-knowledge-ingestion.adapter.ts) | deterministic knowledge ingestion adapter   |

## Contracts 与持久化

| 文件                                                                                                                                                                | 说明                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [`packages/contracts/src/modules/ai/api/ai-runtime.dto.ts`](../../../packages/contracts/src/modules/ai/api/ai-runtime.dto.ts)                                       | Canonical Assistant/Workflow cross-boundary contract |
| [`packages/contracts/src/modules/ai/api/ai-goal-create-workflow.dto.ts`](../../../packages/contracts/src/modules/ai/api/ai-goal-create-workflow.dto.ts)             | Goal workflow contract                               |
| [`packages/contracts/src/modules/ai/api/ai-task-create-workflow.dto.ts`](../../../packages/contracts/src/modules/ai/api/ai-task-create-workflow.dto.ts)             | Task workflow contract                               |
| [`packages/contracts/src/modules/ai/api/ai-knowledge-capture-workflow.dto.ts`](../../../packages/contracts/src/modules/ai/api/ai-knowledge-capture-workflow.dto.ts) | Knowledge capture workflow contract                  |
| [`packages/contracts/src/modules/ai/protocol/ai-rpc-map.ts`](../../../packages/contracts/src/modules/ai/protocol/ai-rpc-map.ts)                                     | AI RPC map                                           |
| [`packages/database/prisma/schema/ai.prisma`](../../../packages/database/prisma/schema/ai.prisma)                                                                   | 当前 AI product persistence schema                   |
| [`packages/powersync-schema/src/index.ts`](../../../packages/powersync-schema/src/index.ts)                                                                         | API/Desktop AI schema parity（含 `ai_execution_records`，无 `ai_messages`）                    |
| [`packages/ai/src/server/application/ai-conversation-portability.ts`](../../../packages/ai/src/server/application/ai-conversation-portability.ts) | owner-provided `ai-conversations@3` capability |
| [`packages/ai/src/server/infrastructure/adapters/prisma/ai-execution-record-prisma.adapter.ts`](../../../packages/ai/src/server/infrastructure/adapters/prisma/ai-execution-record-prisma.adapter.ts) | bounded execution observability projection                              |

## Convergence and closure docs（已实施）

| 文件                                                                                                                                                                      | 说明                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`docs/analysis/2026-09-09-ai-vnext-model-convergence-current-system-map.md`](../../analysis/2026-09-09-ai-vnext-model-convergence-current-system-map.md)                 | AI vNext as-built ownership、runtime、provider、workflow 与 persistence 证据地图              |
| [`docs/analysis/2026-09-09-ai-vnext-model-convergence-reference-and-reuse-ledger.md`](../../analysis/2026-09-09-ai-vnext-model-convergence-reference-and-reuse-ledger.md) | Mastra/Time/Knowledge/owner-domain 直接复用、薄 adapter 与禁止自研清单                         |
| [`docs/architecture/ai-vnext-model-convergence.md`](../../architecture/ai-vnext-model-convergence.md)                                                                     | AI vNext Model Convergence 北极星架构                                                          |
| [`docs/plan/archive/2026-09-09-ai-vnext-model-convergence.md`](../../plan/archive/2026-09-09-ai-vnext-model-convergence.md)                                                 | AI-9601～9612 实施顺序、accepted status 与 closure gate                                       |
| [`docs/analysis/2026-09-18-ai-9612-vnext-closure-evidence.md`](../../analysis/2026-09-18-ai-9612-vnext-closure-evidence.md)                                             | AI-9612 五层 exact-head findings/disposition 与 gates evidence                               |

这组文档现在记录已实施的 convergence truth 与 AI-9612 closure evidence；不构成 PORT-1611 的启动授权。

## 重点边界

- Mastra 是唯一核心 Agent/Workflow runtime；不得重新引入 Python/LangGraph/AgentHost 双 runtime。
- `identityId` 只来自宿主认证 `ExecutionContext`，客户端不得提交。
- Provider credential 不进入客户端、prompt、event、snapshot 或 trace payload。
- Provider/model capability evidence 过期、未知或不支持时 fail closed；撤销/替换 credential 在每次 provider request 前阻断。
- Goal/Task/Knowledge/Routine mutation 必须经过 owner application/command port；Planner/Notification tools 只读；AI tool/adapter 禁止 import 或 mutation raw Scheduler worker state。
- Conversation transcript/workflow snapshot 只由 Mastra 持有；`ai_conversations` 是 shell，`ai_execution_records` 是 bounded operations projection，生产路径不存在 `AiMessage`/`ai_messages`。
