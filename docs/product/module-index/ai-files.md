---
tags:
  - product
  - module-index
  - ai
description: AI 模块相关文件索引
created: 2026-06-02T00:00:00
updated: 2026-09-08T09:00:00+08:00
---

# AI 模块文件索引

AI-VNEXT-07 后，MemoFlow 的核心 AI execution runtime 已收敛为 **TypeScript + Mastra**。本索引只列当前生产路径；Python `apps/ai-service`、LangGraph bridge、Agent Host、TurnEngine、ProposalKernel 与双 runtime 路径已退役。

## 前端工作区

| 文件 | 说明 |
| --- | --- |
| [`packages/app-vue/src/modules/ai/views/AIChatView.vue`](../../../packages/app-vue/src/modules/ai/views/AIChatView.vue) | AI Chat / Workflow 主工作区 |
| [`packages/app-vue/src/modules/ai/composables/useAIChatView.ts`](../../../packages/app-vue/src/modules/ai/composables/useAIChatView.ts) | 工作区投影与会话协调 |
| [`packages/app-vue/src/modules/ai/composables/useAIChatSession.ts`](../../../packages/app-vue/src/modules/ai/composables/useAIChatSession.ts) | Mastra Assistant 会话生命周期 |
| [`packages/app-vue/src/modules/ai/composables/useAIGoalWorkflow.ts`](../../../packages/app-vue/src/modules/ai/composables/useAIGoalWorkflow.ts) | `goal.create` WorkflowRunView 薄投影 |
| [`packages/app-vue/src/modules/ai/composables/useAITaskWorkflow.ts`](../../../packages/app-vue/src/modules/ai/composables/useAITaskWorkflow.ts) | `task.create` WorkflowRunView 薄投影 |
| [`packages/app-vue/src/modules/ai/composables/useAIKnowledgeCapture.ts`](../../../packages/app-vue/src/modules/ai/composables/useAIKnowledgeCapture.ts) | `knowledge.capture` WorkflowRunView 薄投影 |
| [`packages/app-vue/src/modules/ai/composables/useAIKnowledgeQaWorkflow.ts`](../../../packages/app-vue/src/modules/ai/composables/useAIKnowledgeQaWorkflow.ts) | Knowledge QA 查询投影 |
| [`packages/app-vue/src/modules/ai/components/AIGoalWorkflowPanel.vue`](../../../packages/app-vue/src/modules/ai/components/AIGoalWorkflowPanel.vue) | Goal workflow review/recovery/result |
| [`packages/app-vue/src/modules/ai/components/AITaskWorkflowPanel.vue`](../../../packages/app-vue/src/modules/ai/components/AITaskWorkflowPanel.vue) | Task workflow review/recovery/result |
| [`packages/app-vue/src/modules/ai/components/AIKnowledgeCapturePanel.vue`](../../../packages/app-vue/src/modules/ai/components/AIKnowledgeCapturePanel.vue) | Knowledge capture review/recovery/result |
| [`packages/app-vue/src/modules/ai/components/AIConversationSidebar.vue`](../../../packages/app-vue/src/modules/ai/components/AIConversationSidebar.vue) | 会话列表 |
| [`packages/app-vue/src/modules/ai/components/AIMessagePanel.vue`](../../../packages/app-vue/src/modules/ai/components/AIMessagePanel.vue) | 消息展示 |
| [`packages/app-vue/src/modules/ai/components/AIFooterComposer.vue`](../../../packages/app-vue/src/modules/ai/components/AIFooterComposer.vue) | 输入与工具入口 |

## Mastra Runtime

| 文件 | 说明 |
| --- | --- |
| [`packages/ai/src/server/mastra/runtime/mastra-ai.runtime.ts`](../../../packages/ai/src/server/mastra/runtime/mastra-ai.runtime.ts) | 单一 Assistant / Workflow runtime owner |
| [`packages/ai/src/server/mastra/runtime/assistant-history.service.ts`](../../../packages/ai/src/server/mastra/runtime/assistant-history.service.ts) | Assistant transcript/history |
| [`packages/ai/src/server/mastra/models/model-resolver.ts`](../../../packages/ai/src/server/mastra/models/model-resolver.ts) | BYOK provider/model resolution |
| [`packages/ai/src/server/mastra/agents/memoflow-assistant.ts`](../../../packages/ai/src/server/mastra/agents/memoflow-assistant.ts) | 用户开放式 Assistant |
| [`packages/ai/src/server/mastra/agents/goal-planner.worker.ts`](../../../packages/ai/src/server/mastra/agents/goal-planner.worker.ts) | Goal planning worker |
| [`packages/ai/src/server/mastra/agents/task-planner.worker.ts`](../../../packages/ai/src/server/mastra/agents/task-planner.worker.ts) | Task planning worker |
| [`packages/ai/src/server/mastra/agents/knowledge-capture.planner.ts`](../../../packages/ai/src/server/mastra/agents/knowledge-capture.planner.ts) | Knowledge capture worker |
| [`packages/ai/src/server/mastra/workflows/goal-create.workflow.ts`](../../../packages/ai/src/server/mastra/workflows/goal-create.workflow.ts) | durable `goal.create` workflow |
| [`packages/ai/src/server/mastra/workflows/task-create.workflow.ts`](../../../packages/ai/src/server/mastra/workflows/task-create.workflow.ts) | durable `task.create` workflow |
| [`packages/ai/src/server/mastra/workflows/knowledge-capture.workflow.ts`](../../../packages/ai/src/server/mastra/workflows/knowledge-capture.workflow.ts) | durable `knowledge.capture` workflow |
| [`packages/ai/src/server/mastra/workflows/apply-goal-plan.service.ts`](../../../packages/ai/src/server/mastra/workflows/apply-goal-plan.service.ts) | deterministic Goal mutation boundary |
| [`packages/ai/src/server/mastra/workflows/apply-task-plan.service.ts`](../../../packages/ai/src/server/mastra/workflows/apply-task-plan.service.ts) | deterministic Task mutation boundary |
| [`packages/ai/src/server/mastra/workflows/apply-knowledge-note.service.ts`](../../../packages/ai/src/server/mastra/workflows/apply-knowledge-note.service.ts) | deterministic Knowledge mutation boundary |
| [`packages/ai/src/server/mastra/tools/product-tools.ts`](../../../packages/ai/src/server/mastra/tools/product-tools.ts) | AI-6102/6103 Routine commands + Planner/Notification read-only tools |
| [`packages/ai/src/server/application/ports/routine-command.port.ts`](../../../packages/ai/src/server/application/ports/routine-command.port.ts) | AI-owned Routine command abstraction |
| [`packages/ai/src/server/application/ports/planner-read.port.ts`](../../../packages/ai/src/server/application/ports/planner-read.port.ts) | AI-owned read-only Planner projection |
| [`packages/ai/src/server/application/ports/notification-read.port.ts`](../../../packages/ai/src/server/application/ports/notification-read.port.ts) | AI-owned Notification Fact reader |

## Transport 与宿主组合

| 文件 | 说明 |
| --- | --- |
| [`packages/ai/src/api/routes/ai-runtime.routes.ts`](../../../packages/ai/src/api/routes/ai-runtime.routes.ts) | Canonical Assistant / Workflow HTTP surface |
| [`packages/ai/src/api/routes/ai-chat.routes.ts`](../../../packages/ai/src/api/routes/ai-chat.routes.ts) | Conversation shell HTTP surface |
| [`packages/ai/src/api/routes/ai-provider.routes.ts`](../../../packages/ai/src/api/routes/ai-provider.routes.ts) | Provider/BYOK HTTP surface |
| [`packages/ai/src/api/routes/ai-knowledge-query.routes.ts`](../../../packages/ai/src/api/routes/ai-knowledge-query.routes.ts) | Knowledge QA HTTP surface |
| [`packages/ai/src/api/routes/ai-analytics-query.routes.ts`](../../../packages/ai/src/api/routes/ai-analytics-query.routes.ts) | Analytics query HTTP surface |
| [`packages/ai/src/server/infrastructure/ai.module.ts`](../../../packages/ai/src/server/infrastructure/ai.module.ts) | AI module composition root |
| [`apps/api/src/runtime/compose-ai.ts`](../../../apps/api/src/runtime/compose-ai.ts) | API host Mastra composition |
| [`apps/desktop/src/main/runtime/compose-ai.ts`](../../../apps/desktop/src/main/runtime/compose-ai.ts) | Desktop host Mastra composition |
| [`apps/api/src/modules/ai/routine-command.adapter.ts`](../../../apps/api/src/modules/ai/routine-command.adapter.ts) | API host AI → Routine owner-command adapter |
| [`apps/api/src/modules/ai/planner-read.adapter.ts`](../../../apps/api/src/modules/ai/planner-read.adapter.ts) | API host read-only Planner/Task projection |
| [`apps/api/src/modules/ai/notification-read.adapter.ts`](../../../apps/api/src/modules/ai/notification-read.adapter.ts) | API host Notification Fact projection |
| [`apps/desktop/src/main/modules/ai/routine-command.adapter.ts`](../../../apps/desktop/src/main/modules/ai/routine-command.adapter.ts) | Desktop AI → Routine owner-command adapter |
| [`packages/ai/src/server/infrastructure/adapters/openai-compatible-chat-execution.adapter.ts`](../../../packages/ai/src/server/infrastructure/adapters/openai-compatible-chat-execution.adapter.ts) | OpenAI-compatible BYOK execution adapter |
| [`packages/ai/src/server/infrastructure/adapters/openai-compatible-knowledge-query.adapter.ts`](../../../packages/ai/src/server/infrastructure/adapters/openai-compatible-knowledge-query.adapter.ts) | Knowledge query provider adapter |
| [`packages/ai/src/server/infrastructure/adapters/openai-compatible-analytics-query.adapter.ts`](../../../packages/ai/src/server/infrastructure/adapters/openai-compatible-analytics-query.adapter.ts) | Analytics query provider adapter |
| [`packages/ai/src/server/infrastructure/adapters/deterministic-knowledge-ingestion.adapter.ts`](../../../packages/ai/src/server/infrastructure/adapters/deterministic-knowledge-ingestion.adapter.ts) | deterministic knowledge ingestion adapter |

## Contracts 与持久化

| 文件 | 说明 |
| --- | --- |
| [`packages/contracts/src/modules/ai/api/ai-runtime.dto.ts`](../../../packages/contracts/src/modules/ai/api/ai-runtime.dto.ts) | Canonical Assistant/Workflow cross-boundary contract |
| [`packages/contracts/src/modules/ai/api/ai-goal-create-workflow.dto.ts`](../../../packages/contracts/src/modules/ai/api/ai-goal-create-workflow.dto.ts) | Goal workflow contract |
| [`packages/contracts/src/modules/ai/api/ai-task-create-workflow.dto.ts`](../../../packages/contracts/src/modules/ai/api/ai-task-create-workflow.dto.ts) | Task workflow contract |
| [`packages/contracts/src/modules/ai/api/ai-knowledge-capture-workflow.dto.ts`](../../../packages/contracts/src/modules/ai/api/ai-knowledge-capture-workflow.dto.ts) | Knowledge capture workflow contract |
| [`packages/contracts/src/modules/ai/protocol/ai-rpc-map.ts`](../../../packages/contracts/src/modules/ai/protocol/ai-rpc-map.ts) | AI RPC map |
| [`packages/database/prisma/schema/ai.prisma`](../../../packages/database/prisma/schema/ai.prisma) | 当前 AI product persistence schema |

## 重点边界

- Mastra 是唯一核心 Agent/Workflow runtime；不得重新引入 Python/LangGraph/AgentHost 双 runtime。
- `identityId` 只来自宿主认证 `ExecutionContext`，客户端不得提交。
- Provider credential 不进入客户端、prompt、event、snapshot 或 trace payload。
- Goal/Task/Knowledge/Routine mutation 必须经过 owner application/command port；Planner/Notification tools 只读；AI tool/adapter 禁止 import 或 mutation raw Scheduler worker state。
