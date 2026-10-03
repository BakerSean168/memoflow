---
tags:
  - guide
  - ai
  - goal
  - workflow
description: 当前 v1 聊天页生成 goal draft 再手动创建真实目标的完整流程
created: 2026-04-19T00:00:00
updated: 2026-04-19T00:00:00
---

# 聊天 Goal Draft 链路

> **2026-10-02 current status (PVC-AI-8121):** Goal/Task AI-owned editors and their visibility flags are retired. Normal editing uses GoalDialog, full TaskPlanDialog and Repository KnowledgeCaptureReviewDialog. Mastra retains draft/revision/receipt/recovery authority; Goal supporting Task/Knowledge overlays remain. The older flow examples below describe historical behavior. See [current AI module](../../../product/modules/ai.md).

这条链路是当前最显眼、用户最容易直接看到的 AI 创建 Goal 流程。

它的实际形态不是“一键建目标”，而是：

`聊天上下文 -> 结构化 goal draft -> 前端编辑 -> createGoal -> addKeyResult`

## 1. 页面入口在 `AIChatView.vue`

核心文件：

- [../../../packages/app-vue/src/modules/ai/views/AIChatView.vue](../../../packages/app-vue/src/modules/ai/views/AIChatView.vue)
- [GoalDialog (native replacement)](../../../../packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.vue)

当前页面不是单纯聊天页，而是一个共享壳：

- `chat`
- `goal`
- `knowledge-note`

`goal` 模式只是这套聊天壳上的一个 workflow mode。

## 2. 会话消息在服务端，workflow 状态在本地

`AIChatView.vue` 明确把下面两类状态分开了：

### 服务端持久化

- conversation
- messages
- conversation title

### 前端本地持久化

- `toolMode`
- `goalDraft`
- `editableGoal`
- `editableKeyResults`
- `noteSummary`
- `showGoalDraftEditor`

这些 workflow 状态通过 `WORKFLOW_STORAGE_KEY = 'ai:conversation-workflow-map'` 按 conversation id 写进 `localStorage`。

所以调试时要先判断问题落在哪一层：

- 消息没了，先查服务端 conversation / message
- 草稿和编辑状态没了，先查浏览器本地存储

## 3. 生成草稿时，输入给模型的是 transcript，不是表单

触发函数是 `generateGoalDraftFromConversation()`。

它调用 `buildConversationTranscript()`，把当前聊天时间线转成这种文本：

```text
User: ...

Assistant: ...
```

这意味着当前 goal draft 生成是**对话驱动的结构化提取**，不是单独的 goal form AI 补全器。

## 4. 前端只认 `AIClientService`

页面层通过 `useAI()` 拿到 `service`，然后统一调用：

- `service.generateGoal(...)`

UI 不关心自己在 Web 还是 Desktop：

- Web 注入 HTTP adapter
- Desktop 注入 IPC adapter

UI 层看到的始终是同一个门面：

- [../../../packages/ai/src/application-client/ai-client-service.ts](../../../packages/ai/src/application-client/ai-client-service.ts)

## 5. transport 入口是 `/api/v1/ai/generate/goal`

服务端 route：

- [../../../packages/ai/src/api/routes/ai-goal-generation.routes.ts](../../../packages/ai/src/api/routes/ai-goal-generation.routes.ts)

controller：

- [../../../packages/ai/src/api/controllers/ai-goal-generation.controller.ts](../../../packages/ai/src/api/controllers/ai-goal-generation.controller.ts)

当前 controller 只做两件事：

1. 用 `GenerateGoalsSchema` 校验输入
2. 把参数转给 application service

当前请求字段很简单：

- `idea`
- `category`
- `timeframe`
- `includeKeyResults`
- `providerId`
- `model`

其中 `idea` 至少要 10 个字符。

## 6. 真正编排发生在 `GoalGenerationApplicationService`

核心文件：

- [../../../packages/ai/src/application-server/use-cases/commands/goal-generation-application-service.ts](../../../packages/ai/src/application-server/use-cases/commands/goal-generation-application-service.ts)

当前逻辑顺序是：

1. 创建 `requestId`
2. 解析当前 identity 下真正生效的 provider config
3. 应用 `model` override，并把温度设为 `0.3`
4. 调用 `goalPlanningPort.plan(...)`
5. 组装统一返回 DTO
6. 记录 execution log

这里有两个重要事实：

### 事实 1：前端传了 `providerId`，不代表最终一定按这个 provider 直接执行

服务端会重新解析 active provider config。

### 事实 2：聊天页 goal draft 和真实 goal 创建仍然是两件事

这个 service 只负责拿到 `planning.goal` 和 `planning.keyResults`，不负责创建业务实体。

## 7. `goalPlanningPort` 当前有两种实现

### 直连 provider

文件：

- [../../../packages/ai/src/infrastructure-server/chat-execution/direct-provider-goal-planning.adapter.ts](../../../packages/ai/src/infrastructure-server/chat-execution/direct-provider-goal-planning.adapter.ts)
- [../../../packages/ai/src/infrastructure-server/chat-execution/goal-planning-response.ts](../../../packages/ai/src/infrastructure-server/chat-execution/goal-planning-response.ts)

特点：

- AI 模块自己调兼容 OpenAI 的 gateway
- 用 TypeScript 侧 prompt
- 要求 JSON 输出
- 用 `parseGoalPlanningResponse()` 做宽松解析和默认值填充

### remote ai-service

文件：

- [../../../packages/ai/src/infrastructure-server/chat-execution/ai-service-goal-planning.adapter.ts](../../../packages/ai/src/infrastructure-server/chat-execution/ai-service-goal-planning.adapter.ts)
- [../../../apps/ai-service/src/ai_service/services/goal_planning_service.py](../../../apps/ai-service/src/ai_service/services/goal_planning_service.py)

特点：

- AI 模块把请求转发给 Python `ai-service`
- Python 侧维护 prompt 和 schema 校验
- 返回结构更严格

## 8. 当前 goal draft 的真实返回结构

当前服务端统一返回：

- `goal`
- `keyResults`
- `tokenUsage`
- `providerId`
- `processingTimeMs`
- `generatedAt`
- `providerUsed`
- `modelUsed`

对应 schema：

- [../../../packages/contracts/src/modules/ai/api/response-schemas.ts](../../../packages/contracts/src/modules/ai/api/response-schemas.ts)

其中 `goal` 不是 goal 实体，而是 `GeneratedGoalDraft`。

## 9. 前端会把 AI 草稿归一化成“可编辑表单状态”

`applyGoalDraft(nextDraft)` 会把服务端返回的 AI 结果，转换成：

- `editableGoal`
- `editableKeyResults`

这里做了几件 v1 很关键的事情：

1. `goal.name` 取 `draft.goal.name ?? draft.goal.title ?? ''`
2. `importance` 默认回落到 `Moderate`
3. key result 的 `valueType` / `calculationMethod` / `currentValue` / `weight` 都会补默认值
4. 草稿原始结构和编辑表单结构被显式分开

这说明当前页面不是直接把模型输出原样渲染，而是先做一次“变成表单友好结构”的归一化。

## 10. 用户点击“创建目标”后，已经不再回到 AI 路由

触发函数：

- `handleCreateGoalFromDraft()`

当前实现非常直接：

1. 调 `createGoal(...)`
2. 如果成功，遍历 `editableKeyResults`
3. 对每个 KR 调 `addKeyResult(created.id, ...)`
4. 成功后跳转到 `/goals/:id`

这里真实创建走的是：

- [../../../packages/goal/src/application-server/use-cases/commands/create-goal.ts](../../../packages/goal/src/application-server/use-cases/commands/create-goal.ts)
- [../../../packages/goal/src/application-server/use-cases/commands/add-goal-key-result.ts](../../../packages/goal/src/application-server/use-cases/commands/add-goal-key-result.ts)

## 11. 当前 v1 在“真实创建”阶段的行为特征

### 特征 1：goal 和 key result 不是一次后端原子提交

当前是前端先 `createGoal`，再循环 `addKeyResult`。

这意味着：

- goal 已经创建成功后，某个 KR 仍然可能失败
- 当前实现没有回滚已创建 goal 的逻辑

### 特征 2：用户编辑的是本地状态，不是服务端 draft

当前没有“保存 AI 草稿到服务端 draft 表”的逻辑。

用户编辑的就是浏览器里的 `editableGoal` / `editableKeyResults`。

### 特征 3：conversation 标题可能会被 AI draft 名称重命名

生成 draft 后，页面会调用 `maybeRenameCurrentConversation(...)`，尝试把当前 conversation 名称更新成 goal 名称。

## 12. 这条链路里的关键文件

- 聊天页：[../../../packages/app-vue/src/modules/ai/views/AIChatView.vue](../../../packages/app-vue/src/modules/ai/views/AIChatView.vue)
- 草稿编辑器：[GoalDialog (native replacement)](../../../../packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.vue)
- AI 客户端门面：[../../../packages/ai/src/application-client/ai-client-service.ts](../../../packages/ai/src/application-client/ai-client-service.ts)
- goal generation controller：[../../../packages/ai/src/api/controllers/ai-goal-generation.controller.ts](../../../packages/ai/src/api/controllers/ai-goal-generation.controller.ts)
- goal generation service：[../../../packages/ai/src/application-server/use-cases/commands/goal-generation-application-service.ts](../../../packages/ai/src/application-server/use-cases/commands/goal-generation-application-service.ts)
- direct-provider parser：[../../../packages/ai/src/infrastructure-server/chat-execution/goal-planning-response.ts](../../../packages/ai/src/infrastructure-server/chat-execution/goal-planning-response.ts)
- goal 创建：[../../../packages/goal/src/application-server/use-cases/commands/create-goal.ts](../../../packages/goal/src/application-server/use-cases/commands/create-goal.ts)
- KR 创建：[../../../packages/goal/src/application-server/use-cases/commands/add-goal-key-result.ts](../../../packages/goal/src/application-server/use-cases/commands/add-goal-key-result.ts)
