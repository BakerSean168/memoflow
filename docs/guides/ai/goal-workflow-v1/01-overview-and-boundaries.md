---
tags:
  - guide
  - ai
  - goal
  - workflow
description: 当前 AI Goal Workflow v1 总览、职责边界与核心结论
created: 2026-04-19T00:00:00
updated: 2026-04-19T00:00:00
---

# 总览与边界

> **2026-10-02 current status (PVC-AI-8121):** Goal/Task AI-owned editors and their visibility flags are retired. Normal editing uses GoalDialog, full TaskPlanDialog and Repository KnowledgeCaptureReviewDialog. Mastra retains draft/revision/receipt/recovery authority; Goal supporting Task/Knowledge overlays remain. The older flow examples below describe historical behavior. See [current AI module](../../../product/modules/ai.md).

## 先看核心结论

当前版本的 AI 创建 Goal，不是“模型直接帮你把 goal 建进数据库”。

当前真实实现是：

1. AI 先返回一个**结构化草稿**，或者一个**结构化动作计划**。
2. 用户或执行器再把这份结构化结果，转换成真实业务模块调用。
3. 真正落库仍然发生在 `goal` / `task` 模块，而不是 AI 模块自己写表。

## 两条链路

| 链路            | 入口                     | AI 先返回什么              | 谁做最终创建                               | 是否需要二次确认               |
| --------------- | ------------------------ | -------------------------- | ------------------------------------------ | ------------------------------ |
| 聊天 goal draft | `AIChatView.vue`         | `goal + keyResults` 草稿   | 前端调用 `useGoal.createGoal/addKeyResult` | 需要，用户编辑后手动点创建     |
| Goal automation | `AIWorkspaceToolbox.vue` | `summary + plan + actions` | automation executor 调 goal/task 模块      | 需要，先 plan，再 confirm 执行 |

这两条链路共享 provider、planner、execution log 等基础设施，但它们不是同一个工作流的前后半段。

## 当前职责边界

| 层                      | 当前职责                                                                       | 不负责什么                                    |
| ----------------------- | ------------------------------------------------------------------------------ | --------------------------------------------- |
| Vue 页面                | 收集上下文、触发请求、展示草稿、做本地状态持久化                               | 不直接决定最终 provider 配置，不直接拼 prompt |
| `AIClientService`       | UI 统一门面，转发到 HTTP / IPC adapter                                         | 不做业务判断                                  |
| controller              | 校验 transport DTO，转 Result 错误                                             | 不做 prompt，不直接落库                       |
| application service     | 解析 provider、调用 planning port、记录 execution log、决定是否执行 automation | 不直接访问前端状态                            |
| planning port / adapter | 调模型，返回结构化结果                                                         | 不创建真实业务实体                            |
| `goal` / `task` 模块    | 创建真实 goal、KR、task template                                               | 不负责 AI 推理                                |

## 当前版本的数据分层

### 第 1 层：原始上下文

- 聊天消息
- conversation 标题
- 运行时选中的 provider / model

### 第 2 层：AI 结构化结果

- `GeneratedGoalDraft`
- `KeyResultPreview[]`
- `GoalAutomationPlanDTO`
- `GoalAutomationAction[]`

### 第 3 层：真实业务实体

- `Goal`
- `KeyResult`
- `TaskTemplate`

关键点是：第 2 层不是正式业务实体，只是可以被编辑、批准、执行的中间结果。

## 为什么要这样分层

当前 v1 这样设计，有三个直接收益：

1. 模型输出不可信时，不会直接污染正式数据。
2. 聊天页可以让用户先改草稿，再创建目标。
3. automation 可以把“规划”和“执行”拆成两步，并做 capability 开关。

## 当前系统里的四个关键词

### controller

例如：

- [../../../packages/ai/src/api/controllers/ai-goal-generation.controller.ts](../../../packages/ai/src/api/controllers/ai-goal-generation.controller.ts)
- [../../../packages/ai/src/api/controllers/ai-goal-automation.controller.ts](../../../packages/ai/src/api/controllers/ai-goal-automation.controller.ts)

只处理 transport 入口和 schema 校验。

### application service

例如：

- [../../../packages/ai/src/application-server/use-cases/commands/goal-generation-application-service.ts](../../../packages/ai/src/application-server/use-cases/commands/goal-generation-application-service.ts)
- [../../../packages/ai/src/application-server/use-cases/commands/ai-goal-automation.service.ts](../../../packages/ai/src/application-server/use-cases/commands/ai-goal-automation.service.ts)

这里才是编排核心。

### port

例如：

- `IGoalPlanningPort`
- `IGoalAutomationPlanningPort`
- `IAIAutomationToolExecutorPort`

port 用来描述“系统需要一种能力”，而不是“系统必须用某个具体实现”。

### adapter

例如：

- `DirectProviderGoalPlanningAdapter`
- `AIServiceGoalPlanningAdapter`
- `AIServiceGoalAutomationAdapter`
- `BackendAutomationToolExecutorAdapter`
- `DesktopAutomationToolExecutorAdapter`

adapter 才是具体实现。

## 当前 v1 最容易误解的地方

### 误解 1：聊天页生成草稿后，点击创建目标，会继续走 AI goal route 的后半段

不是。

聊天页里点击“创建目标”以后，已经不再回到 `/ai/generate/goal`。

它会直接走前端的 `useGoal.createGoal(...)`，然后循环调用 `addKeyResult(...)`。

### 误解 2：automation 和聊天 draft 只是 UI 不同，后端是一套逻辑

不是。

聊天 draft 走 `goalPlanningPort.plan(...)`。

automation 走 `goalAutomationPlanningPort.plan(...)`，并且还会额外经过 `toolExecutorPort.executeGoalAutomation(...)`。

### 误解 3：当前 AI 工作流状态都在服务端

不是。

conversation / messages 在服务端。

但 `toolMode`、`goalDraft`、`editableGoal`、`editableKeyResults`、`noteSummary`、`showGoalDraftEditor` 当前都按 conversation 写在 `localStorage`。

## 推荐阅读代码顺序

1. [../../../packages/app-vue/src/modules/ai/views/AIChatView.vue](../../../packages/app-vue/src/modules/ai/views/AIChatView.vue)
2. [../../../packages/app-vue/src/modules/ai/components/AIWorkspaceToolbox.vue](../../../packages/app-vue/src/modules/ai/components/AIWorkspaceToolbox.vue)
3. [../../../packages/ai/src/application-client/ai-client-service.ts](../../../packages/ai/src/application-client/ai-client-service.ts)
4. [../../../packages/ai/src/application-server/use-cases/commands/goal-generation-application-service.ts](../../../packages/ai/src/application-server/use-cases/commands/goal-generation-application-service.ts)
5. [../../../packages/ai/src/application-server/use-cases/commands/ai-goal-automation.service.ts](../../../packages/ai/src/application-server/use-cases/commands/ai-goal-automation.service.ts)
6. [../../../apps/ai-service/src/ai_service/services/goal_planning_service.py](../../../apps/ai-service/src/ai_service/services/goal_planning_service.py)
7. [../../../apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts](../../../apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts)
8. [../../../apps/desktop/src/main/modules/ai/desktop-automation-tool-executor.adapter.ts](../../../apps/desktop/src/main/modules/ai/desktop-automation-tool-executor.adapter.ts)
