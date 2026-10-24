---
tags:
  - guide
  - ai
  - runtime
  - architecture
description: 当前 v1 AI Goal Workflow 的 runtime、port、adapter 与 capability 差异
created: 2026-04-19T00:00:00
updated: 2026-04-19T00:00:00
---

# Runtime、Port 与 Adapter

这篇笔记专门回答一个常见问题：

“同样是 AI 创建 Goal，为什么有时能跑 automation，有时只有 draft generation？”

答案在 runtime 接线，不在页面层。

## 1. 当前 capability 是运行时推导出来的

核心文件：

- [../../../packages/ai/src/infrastructure-server/ai.module.ts](../../../packages/ai/src/infrastructure-server/ai.module.ts)

`resolveAICapabilities(...)` 会根据当前注入的依赖来推导：

- `runtimeMode`
- `supportsGoalGeneration`
- `supportsGoalAutomation`
- `supportsKnowledgeQuery`
- `supportsAnalyticsQuery`
- `supportsKnowledgeReindex`
- `supportsEvaluationReports`

所以 capability 不是写死配置，而是“当前模块到底接进来了哪些 port”。

## 2. 当前有两种 runtime mode

| runtime             | 目标草稿 | 目标自动化                                 | 特征                                    |
| ------------------- | -------- | ------------------------------------------ | --------------------------------------- |
| `direct-provider`   | 支持     | 默认不支持                                 | AI 模块自己直接调兼容 OpenAI provider   |
| `remote-ai-service` | 支持     | 支持，但前提是同时注入 planner 和 executor | AI 模块把复杂能力转发给独立 Python 服务 |

`runtimeMode` 的推导规则很直接：

- 如果注入了远程相关 port，就会显示为 `remote-ai-service`
- 否则回落为 `direct-provider`

## 3. current v1 的默认接线思路

### API 侧

文件：

- [../../../packages/ai/src/api/module.ts](../../../packages/ai/src/api/module.ts)

当存在 ai-service runtime config 时，会注入：

- `AIServiceChatExecutionAdapter`
- `AIServiceGoalPlanningAdapter`
- `AIServiceGoalAutomationAdapter`
- 以及知识、分析等其他 remote adapter

同时还会注入：

- `automationToolExecutorPort`

### Desktop 侧

文件：

- [../../../packages/ai/src/electron-entry/index.ts](../../../packages/ai/src/electron-entry/index.ts)

Desktop 侧做的是同样的事情，只是 database / runtime 容器不同。

## 4. 如果没有远程 runtime，goal draft 仍然能工作

这是因为 `createAIServices(...)` 有默认回退：

- `chatExecutionPort ?? new DirectProviderChatExecutionAdapter()`
- `goalPlanningPort ?? new DirectProviderGoalPlanningAdapter()`

也就是说：

- 聊天
- goal draft generation

在没有 remote ai-service 的情况下，仍然可以直接通过 provider 工作。

## 5. 但 automation 不会自动回退到 direct-provider

`goalAutomationService` 只有在下面两个依赖都存在时才会被组装：

- `goalAutomationPlanningPort`
- `automationToolExecutorPort`

也就是说，当前 v1 没有 `DirectProviderGoalAutomationAdapter` 这类 fallback。

automation 当前就是一项更重、更完整的 runtime 能力。

## 6. `AIClientService` 统一了客户端入口，但没有抹平服务端能力差异

客户端统一门面：

- [../../../packages/ai/src/application-client/ai-client-service.ts](../../../packages/ai/src/application-client/ai-client-service.ts)

UI 层统一调用：

- `generateGoal(...)`
- `automateGoal(...)`

但服务端是否真的支持 automation，仍然要看 capability。

当前 `AIWorkspaceToolbox.vue` 会显式读取：

- `supportsGoalAutomation`

而不是盲目假设一定能调用。

## 7. 当前 goal draft 在两种 runtime 下的差异

### direct-provider

文件：

- [../../../packages/ai/src/infrastructure-server/chat-execution/direct-provider-goal-planning.adapter.ts](../../../packages/ai/src/infrastructure-server/chat-execution/direct-provider-goal-planning.adapter.ts)
- [../../../packages/ai/src/infrastructure-server/chat-execution/goal-planning-response.ts](../../../packages/ai/src/infrastructure-server/chat-execution/goal-planning-response.ts)

特点：

- prompt 在 TypeScript 侧
- 输出用手写 parser 宽松解析
- 会自动填默认值、修正非法字段、补时间戳

### remote-ai-service

文件：

- [../../../packages/ai/src/infrastructure-server/chat-execution/ai-service-goal-planning.adapter.ts](../../../packages/ai/src/infrastructure-server/chat-execution/ai-service-goal-planning.adapter.ts)
- [../../../apps/ai-service/src/ai_service/services/goal_planning_service.py](../../../apps/ai-service/src/ai_service/services/goal_planning_service.py)

特点：

- prompt 在 Python 侧
- 用 Pydantic schema 校验
- 结构约束更集中

## 8. 当前 automation 在 runtime 上的真实依赖链

`AIWorkspaceToolbox`

-> `AIClientService.automateGoal(...)`

-> `AIGoalAutomationController`

-> `AIGoalAutomationService`

-> `IGoalAutomationPlanningPort`

-> `AIServiceGoalAutomationAdapter`

-> `apps/ai-service /internal/goals/plan-actions`

-> `IAIAutomationToolExecutorPort`

-> backend 或 desktop executor

这条链说明了一件事：

automation 当前本质上是“AI planning + 本地业务执行器”的组合能力。

## 9. 当前 capability 的用户可见表现

如果 runtime 不完整，用户会看到：

- 目标草稿仍可用
- automation 按钮不可用，或 capability false
- `advancedFeaturesReason` 会提示需要 remote ai-service runtime

当前这条提示文案也定义在：

- [../../../packages/ai/src/infrastructure-server/ai.module.ts](../../../packages/ai/src/infrastructure-server/ai.module.ts)

## 10. 当前 v1 的架构结论

1. 页面层统一，不代表能力总是统一。
2. draft generation 是轻量能力，可以 direct-provider 回退。
3. automation 是重能力，必须同时具备 remote planner 和本地 executor。
4. capability 是运行时推导结果，不是一个纯前端配置开关。
