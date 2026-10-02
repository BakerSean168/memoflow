---
tags:
  - guide
  - ai
  - goal
  - debugging
description: 当前 v1 AI Goal Workflow 的 DTO、状态持久化、限制与调试入口
created: 2026-04-19T00:00:00
updated: 2026-04-19T00:00:00
---

# DTO、状态与调试

> **2026-10-02 current status (PVC-AI-8121):** Goal/Task AI-owned editors and their visibility flags are retired. Normal editing uses GoalDialog, full TaskPlanDialog and Repository KnowledgeCaptureReviewDialog. Mastra retains draft/revision/receipt/recovery authority; Goal supporting Task/Knowledge overlays remain. The older flow examples below describe historical behavior. See [current AI module](../../../product/modules/ai.md).

这篇笔记把当前 v1 最容易遗漏的“契约层”和“排障层”集中到一起。

## 1. 聊天 goal draft 的请求契约

文件：

- [../../../packages/contracts/src/modules/ai/api/ai-goal-generation.dto.ts](../../../packages/contracts/src/modules/ai/api/ai-goal-generation.dto.ts)

当前请求字段：

| 字段                | 含义                                       |
| ------------------- | ------------------------------------------ |
| `idea`              | 对话 transcript 或其他描述，至少 10 个字符 |
| `category`          | 可选分类偏好                               |
| `timeframe`         | 可选时间范围偏好                           |
| `includeKeyResults` | 是否要求一并生成 key results               |
| `providerId`        | 可选 provider 指定                         |
| `model`             | 可选 model override                        |

## 2. 聊天 goal draft 的响应契约

文件：

- [../../../packages/contracts/src/modules/ai/api/response-schemas.ts](../../../packages/contracts/src/modules/ai/api/response-schemas.ts)

当前返回里最关键的结构是：

### `goal`

- `title`
- `description`
- `motivation`
- `category`
- `suggestedStartDate`
- `suggestedEndDate`
- `importance`
- `tags`
- `feasibilityAnalysis`
- `aiInsights`

### `keyResults[]`

- `title`
- `description`
- `valueType`
- `calculationMethod`
- `startValue`
- `currentValue`
- `targetValue`
- `unit`
- `weight`

## 3. automation 的请求与响应契约

文件：

- [../../../packages/contracts/src/modules/ai/api/ai-goal-automation.dto.ts](../../../packages/contracts/src/modules/ai/api/ai-goal-automation.dto.ts)

当前 automation request 比 goal draft 多出这些字段：

- `includeTaskTemplates`
- `confirm`
- `approvedSummary`
- `approvedPlan`
- `approvedActions`

当前 automation response 重点字段：

- `summary`
- `requiresConfirmation`
- `plan`
- `actions`
- `executedActions`

## 4. 直连 provider 路径是“宽松 normalize”，不是严格 schema

文件：

- [../../../packages/ai/src/infrastructure-server/chat-execution/goal-planning-response.ts](../../../packages/ai/src/infrastructure-server/chat-execution/goal-planning-response.ts)

当前 direct-provider parser 会主动做这些事情：

1. 非法或缺失 `title` 时回退成 `'AI generated goal'`
2. 非法或缺失 `description` 时回退成 `'No description provided.'`
3. `suggestedStartDate` 缺失时回退到 `now`
4. `suggestedEndDate` 缺失时用 `suggestedDurationDays` 推导
5. 非法 category 回退成 `other`
6. 非法 importance 回退成 `Moderate`
7. key result 的 `valueType / calculationMethod / targetValue / unit / weight` 都会补默认值

这和 Python ai-service 路径的严格 schema 校验，是两种不同的容错哲学。

## 5. 当前前端 workflow 本地持久化键

文件：

- [../../../packages/app-vue/src/modules/ai/views/AIChatView.vue](../../../packages/app-vue/src/modules/ai/views/AIChatView.vue)

当前涉及的本地 key：

| key                            | 用途                                         |
| ------------------------------ | -------------------------------------------- |
| `ai:last-conversation-id`      | 记住最后活跃会话                             |
| `ai:conversation-workflow-map` | 按 conversation 保存 goal/note workflow 状态 |
| `ai:last-model-key`            | 全局最后一次模型选择                         |
| `ai:conversation-model-map`    | 按 conversation 保存模型选择                 |

## 6. 当前 workflow snapshot 里保存什么

`PersistedWorkflowEntry` 当前包括：

- `mode`
- `goalDraft`
- `editableGoal`
- `editableKeyResults`
- `noteSummary`
- `showGoalDraftEditor`

当前没有保存：

- 服务端消息副本
- 完整 note 内容
- automation result

这意味着 automation 对话框状态不是 `AIChatView` 这套本地 conversation workflow 的一部分。

## 7. 当前 v1 的几个实现限制

### 限制 1：goal draft 创建阶段不是事务式

聊天页创建真实目标时，前端先建 goal，再逐个建 KR。

如果中间失败，当前没有自动回滚。

### 限制 2：automation 执行阶段也是逐 action 尝试

executor 对每个 action 独立 `try/catch`，失败不会自动回滚之前成功动作。

### 限制 3：task template 和 key result 的绑定依赖相同 index

当前 executor 默认假设：

- `taskTemplates[index]` 对应 `keyResults[index]`

这是一种简单约定，不是显式引用关系。

### 限制 4：聊天页 workflow 工件不在服务端

换端、清浏览器数据、或 `localStorage` 损坏时，消息可能还在，但草稿编辑状态可能已经丢失。

### 限制 5：执行确认阶段默认信任 approved plan

`confirm: true` 时如果带了 `approvedPlan + approvedActions`，当前 service 不会重新规划，而是直接执行它们。

## 8. 调试时建议从哪一层切

### 页面层

- 聊天 workflow：[../../../packages/app-vue/src/modules/ai/views/AIChatView.vue](../../../packages/app-vue/src/modules/ai/views/AIChatView.vue)
- automation UI：[../../../packages/app-vue/src/modules/ai/components/AIWorkspaceToolbox.vue](../../../packages/app-vue/src/modules/ai/components/AIWorkspaceToolbox.vue)
- goal draft editor：[GoalDialog (native replacement)](../../../../packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.vue)

适合排查：

- 为什么按钮不可点
- 为什么本地草稿没恢复
- 为什么选中的 model / provider 和预期不一致

### TS 服务端编排层

- goal generation service：[../../../packages/ai/src/application-server/use-cases/commands/goal-generation-application-service.ts](../../../packages/ai/src/application-server/use-cases/commands/goal-generation-application-service.ts)
- goal automation service：[../../../packages/ai/src/application-server/use-cases/commands/ai-goal-automation.service.ts](../../../packages/ai/src/application-server/use-cases/commands/ai-goal-automation.service.ts)

适合排查：

- provider 解析不符合预期
- execution log 为什么没记上
- `requiresConfirmation` 为什么是这个值

### Python planning 层

- planner service：[../../../apps/ai-service/src/ai_service/services/goal_planning_service.py](../../../apps/ai-service/src/ai_service/services/goal_planning_service.py)
- route：[../../../apps/ai-service/src/ai_service/api/routes/goals.py](../../../apps/ai-service/src/ai_service/api/routes/goals.py)

适合排查：

- prompt 是否正确
- 模型返回 JSON 为什么过不了 schema
- `suggestedDurationDays` 如何被转换成时间戳

### 真实执行层

- API executor：[../../../apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts](../../../apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts)
- Desktop executor：[../../../apps/desktop/src/main/modules/ai/desktop-automation-tool-executor.adapter.ts](../../../apps/desktop/src/main/modules/ai/desktop-automation-tool-executor.adapter.ts)

适合排查：

- 为什么 create_goal 成功但 create_key_result 失败
- 为什么 task template 没绑到 key result
- 为什么 `search_notes` / `fetch_stats` 只有消息没有副作用

## 9. 当前已有测试入口

- TS：[`../../../packages/ai/src/application-server/use-cases/commands/__tests__/goal-generation-application-service.test.ts`](../../../packages/ai/src/application-server/use-cases/commands/__tests__/goal-generation-application-service.test.ts)
- TS：[`../../../packages/ai/src/application-server/use-cases/commands/__tests__/ai-goal-automation.service.test.ts`](../../../packages/ai/src/application-server/use-cases/commands/__tests__/ai-goal-automation.service.test.ts)
- Python：[`../../../apps/ai-service/tests/test_goal_planning.py`](../../../apps/ai-service/tests/test_goal_planning.py)
- Python：[`../../../apps/ai-service/tests/test_goal_automation.py`](../../../apps/ai-service/tests/test_goal_automation.py)

## 10. Desktop 开发模式日志路径

当前仓库约定的 Desktop 开发日志路径：

`C:\Users\xx\AppData\Roaming\MemoFlow-Dev\logs`

当问题只在 Desktop 端复现时，这个路径通常比前端页面提示更接近根因。
