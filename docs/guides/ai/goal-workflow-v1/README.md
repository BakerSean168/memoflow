---
tags:
  - guide
  - ai
  - goal
  - workflow
description: 冻结 2026-04-19 当前 AI 创建 Goal v1 实现的拆分笔记索引
created: 2026-04-19T00:00:00
updated: 2026-04-29T14:40:00
---

# AI Goal Workflow V1

这组笔记用于**定格 2026-04-19 当天仓库里的第一版 AI 创建 Goal 实现**。

它记录的是“现在代码到底怎么跑”，不是未来规划稿，也不是理想架构设计。

注意：这组 v1 笔记里提到的 `AIWorkspaceToolbox.vue`、`ai-goal-automation.service.ts` 等文件已在 2026-04-29 删除。相关描述仅作历史实现参考。

## 这组笔记覆盖什么

- 聊天页里 `生成 goal draft -> 前端编辑 -> goal 模块真实创建`
- 工作区工具箱里 `automation plan -> confirm -> executor 执行`
- `direct-provider` 和 `remote-ai-service` 两种 runtime 下的差异
- 当前 v1 的 DTO、状态持久化、执行边界、限制与调试入口

## 阅读顺序

| 文档                                                                         | 用途                                                 |
| ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| [01-overview-and-boundaries.md](./01-overview-and-boundaries.md)             | 先看整体图，分清两条链路、职责边界和真实落库点       |
| [02-chat-goal-draft-flow.md](./02-chat-goal-draft-flow.md)                   | 详细拆解聊天页生成 goal draft 的完整链路             |
| [03-goal-automation-flow.md](./03-goal-automation-flow.md)                   | 详细拆解 automation 的 plan / confirm / execute 链路 |
| [04-runtime-ports-and-adapters.md](./04-runtime-ports-and-adapters.md)       | 解释 runtime、port、adapter、capability 的实际接线   |
| [05-state-contracts-and-debugging.md](./05-state-contracts-and-debugging.md) | 汇总 DTO、本地状态、v1 限制、测试与调试入口          |

## 当前版本先记住三句话

1. 当前 AI 创建 Goal 有两条链路，`goal draft` 和 `goal automation` 不是一回事。
2. AI 模块负责生成草稿、计划和动作；真实 goal / key result / task template 仍然由 `goal` / `task` 模块创建。
3. v1 里很多工作流状态并不在服务端，而是在前端 `localStorage` 里按 conversation 保存。

## 核心入口

- 聊天页：[../../../packages/app-vue/src/modules/ai/views/AIChatView.vue](../../../packages/app-vue/src/modules/ai/views/AIChatView.vue)
- 工作区工具箱：已删除，仅保留历史说明
- AI 客户端门面：[../../../packages/ai/src/application-client/ai-client-service.ts](../../../packages/ai/src/application-client/ai-client-service.ts)
- goal draft 编排：[../../../packages/ai/src/application-server/use-cases/commands/goal-generation-application-service.ts](../../../packages/ai/src/application-server/use-cases/commands/goal-generation-application-service.ts)
- automation 编排：已并入统一 workflow，原独立 service 已删除
- Python planning：[../../../apps/ai-service/src/ai_service/services/goal_planning_service.py](../../../apps/ai-service/src/ai_service/services/goal_planning_service.py)

## 与现有文档的关系

- 这组文档是对 [`../../development/ai-goal-creation-current-workflow.md`](../../development/ai-goal-creation-current-workflow.md) 的拆分和定格版。
- 未来如果实现发生明显变化，应新开 `goal-workflow-v2` 或直接重写这组笔记，不要把 v1 和 v2 混写。
