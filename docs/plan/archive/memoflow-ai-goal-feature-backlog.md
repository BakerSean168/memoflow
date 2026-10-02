---
tags:
  - guide
  - ai
  - backlog
  - goal
  - project
description: 面向统一 Goal Workflow 的可执行功能 backlog，聚焦 Chat Goal Tool 主线、Execution Engine 复用与 function calling runtime
created: 2026-04-18T00:00:00
updated: 2026-04-19T00:00:00
---

> Superseded by `docs/plan/archive/2026-04-29-ai-goal-agent-workflow-unification.md`. 本文仅保留为旧阶段 backlog 参考。

# AI 辅助创建 Goal 功能 Backlog

这份 backlog 的作用不是替代需求文档，而是把 [`memoflow-ai-goal-learning-guide.md`](../../guides/ai/memoflow-ai-goal-learning-guide.md) 里的学习路线，进一步压成一份可以直接在仓库里开做的任务列表。

设计原则很简单：

- 只保留一个主产品流：`AI Chat -> Goal Tool`
- automation 的价值优先体现在执行能力层，而不是独立产品入口
- 直接按 `Unified AI Workflow Orchestrator + function calling runtime` 路线规划

## 使用方式

建议你不是一次把所有项做完，而是按下面这个顺序推进：

1. 先做 `P0`，把 chat 主链路补成统一 Goal workflow
2. 再做 `P1`，抽出 Orchestrator、Execution Engine 和 tool contracts
3. 再做 `P2`，升级 provider-native function calling runtime
4. 最后做 `P3`，把 CLI、评测、演示和可观测性补齐

每一项都尽量包含：

- 目标
- 为什么值得做
- 主要代码入口
- 重点学习点
- 验收标准

## P0：把 Chat Goal Tool 做成唯一主工作流

这组 backlog 的目标是让当前 chat 主链路从 `draft -> create` 升级到真正统一的 Goal workflow。

## P0-1 澄清式 Goal 创建

### 目标

在直接生成 goal draft 之前，增加一个 clarification 阶段。

当用户输入的信息不足时，系统先返回 2 到 4 个澄清问题，而不是立刻给出结构化 goal draft。

### 为什么值得做

这是从“AI 表单补全”迈向“Agent 工作流”的关键一步。

它会直接训练你：

- 多轮工作流设计
- AI 输出状态机
- 前后端契约设计
- 工作流级本地状态管理

### 主要代码入口

- [`../../../packages/app-vue/src/modules/ai/views/AIChatView.vue`](../../../packages/app-vue/src/modules/ai/views/AIChatView.vue)
- [`../../../packages/ai/src/application-client/ai-client-service.ts`](../../../packages/ai/src/application-client/ai-client-service.ts)
- goal generation service
- [`../../../apps/ai-service/src/ai_service/services/goal_planning_service.py`](../../../apps/ai-service/src/ai_service/services/goal_planning_service.py)

### 验收标准

- 用户输入模糊 idea 时，系统不会直接生成 draft
- 前端能显示澄清问题列表并收集回答
- 回答补充后可以继续生成 goal draft
- 切换会话或刷新页面时，澄清状态可恢复

## P0-2 Draft / Plan / Execute 三阶段 UI 分层

### 目标

把当前 Chat Goal Tool 明确拆成三个用户可感知的阶段：

- Draft
- Plan
- Execute

不要再让不同阶段的状态混在一起。

### 为什么值得做

这是 Agent 产品化里很关键的“过程可见性”。

### 主要代码入口

- [`../../../packages/app-vue/src/modules/ai/views/AIChatView.vue`](../../../packages/app-vue/src/modules/ai/views/AIChatView.vue)
- `AIGoalDraftEditor.vue` (retired by PVC-AI-8121; [native replacement](../../../packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.vue))

### 验收标准

- 用户始终知道自己当前处于哪个阶段
- 每个阶段的主要动作按钮清晰分离
- 计划未确认时，界面不会误导用户“已经执行”

## P0-3 Goal Draft 与 Execution Plan 字段对齐

### 目标

统一 chat 主链路中的 draft 与 future execution plan 的字段粒度，特别是：

- key result
- task template
- goal metadata

### 为什么值得做

当前 draft 和旧 automation plan 中的业务对象粒度并不一致。

这会导致：

- 前端映射复杂
- execution plan 难以和 draft 无缝衔接
- 默认补值过多

### 主要代码入口

- [`../../../packages/app-vue/src/modules/ai/views/AIChatView.vue`](../../../packages/app-vue/src/modules/ai/views/AIChatView.vue)
- [`../../../apps/ai-service/src/ai_service/services/goal_planning_service.py`](../../../apps/ai-service/src/ai_service/services/goal_planning_service.py)
- [`../../../apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts`](../../../apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts)

### 验收标准

- draft 与 future plan 的核心字段结构明显靠拢
- 默认补值逻辑被压缩到必要最小

## P0-4 显式展示“为什么这样规划”

### 目标

让 Chat Goal Tool 中的 draft 和 future execution plan 不只展示结果，还展示理由。

### 为什么值得做

这是从“黑盒生成”走向“可解释 Agent”的关键一步。

### 主要代码入口

- [`../../../packages/app-vue/src/modules/ai/views/AIChatView.vue`](../../../packages/app-vue/src/modules/ai/views/AIChatView.vue)
- [`../../../apps/ai-service/src/ai_service/services/goal_planning_service.py`](../../../apps/ai-service/src/ai_service/services/goal_planning_service.py)

### 验收标准

- draft 或 plan 中至少一类关键建议能展示 rationale
- 用户能理解系统为什么建议这些步骤

## P1：抽出 Unified AI Workflow Orchestrator 与 Execution Engine

这组 backlog 的目标是把保留中的 automation 能力抽成实现层资产，服务于 chat 主链路。

## P1-1 Unified AI Workflow Orchestrator 抽象

### 目标

新增统一 orchestration 抽象，负责：

- 顶层 workflow 路由
- 统一 request / trace / max turns
- 协调 Goal / Knowledge Note / Query / Analytics workflow handlers

### 为什么值得做

如果没有统一 orchestrator，后面 chat、CLI、function calling runtime 很快又会各自长一套逻辑，而且顶层会被 Goal 命名锁死。

### 主要代码入口

- future `ai-workflow-orchestrator` service
- [`../../../packages/ai/src/application-server/use-cases/commands/ai-goal-automation.service.ts`](../../../packages/ai/src/application-server/use-cases/commands/ai-goal-automation.service.ts)
- [`../../../packages/ai/src/application-client/ai-client-service.ts`](../../../packages/ai/src/application-client/ai-client-service.ts)

### 验收标准

- 新文档和新设计中不再默认 chat 与 automation 是并列主产品流
- orchestration 状态与阶段被明确建模
- Goal 被建模为第一批 workflow handler，而不是永久顶层对象

## P1-2 Tool Registry 与 Execution Engine

### 目标

把当前 goal automation executor 演进成可复用的 Tool Registry / Execution Engine。

### 为什么值得做

后续的 chat agent、CLI、approved action execute 都应共享这一层。

### 主要代码入口

- [`../../../apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts`](../../../apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts)
- [`../../../packages/ai/src/application-server/ports/automation-tool-execution.port.ts`](../../../packages/ai/src/application-server/ports/automation-tool-execution.port.ts)
- knowledge note persistence adapters

### 验收标准

- goal / task / knowledge note / notes / analytics 可以被统一描述成工具
- side-effect tool 的确认策略可配置

## P1-3 Action 级执行状态与时间线

### 目标

把未来统一执行引擎的结果从简单列表升级成 action timeline。

### 主要代码入口

- [`../../../packages/app-vue/src/modules/ai/views/AIChatView.vue`](../../../packages/app-vue/src/modules/ai/views/AIChatView.vue)
- [`../../../apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts`](../../../apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts)
- [`../../../packages/contracts/src/modules/ai`](../../../packages/contracts/src/modules/ai)

### 验收标准

- 用户能看出每个 action 的执行先后和结果
- 失败的 action 和成功的 action 在 UI 上明显区分

## P1-4 部分成功与失败恢复

### 目标

支持部分成功的执行结果，不要因为某一步失败就把整次 execution 视为纯失败。

### 主要代码入口

- [`../../../apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts`](../../../apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts)
- unified AI workflow orchestrator
- [`../../../packages/app-vue/src/modules/ai/views/AIChatView.vue`](../../../packages/app-vue/src/modules/ai/views/AIChatView.vue)

### 验收标准

- 如果部分 action 成功，UI 明确展示已成功部分
- 用户能知道哪些实体已经创建
- 失败步骤不会掩盖已完成成果

## P1-5 重试与幂等策略

### 目标

给失败 action 增加安全的重试能力，并审视重复创建风险。

### 主要代码入口

- [`../../../apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts`](../../../apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts)
- [`../../../packages/task`](../../../packages/task)
- [`../../../packages/goal`](../../../packages/goal)

### 验收标准

- 至少一种失败 action 可以安全重试
- 重试不会无脑导致重复创建实体

## P1-6 会话级与工作流级日志串联

### 目标

把 chat、draft、plan、execution 串到统一 request id / execution log 视角下。

### 主要代码入口

- unified AI workflow orchestrator
- AI execution log
- eval reports

### 验收标准

- 一次 Goal workflow 能追到同一条 request 链
- planning 和 execution 可以被明确区分

## P2：升级 provider-native function calling runtime

这组 backlog 的目标是让 chat 中的 Goal workflow 具备真正的 tool loop 能力，而不是只靠手工 JSON `toolCalls`。

## P2-1 Provider Adapter 增加 tool calling 支持

### 目标

扩展 `ai-service` provider adapters，使其支持 provider-native function calling。

### 主要代码入口

- [`../../../apps/ai-service/src/ai_service/services/chat_service.py`](../../../apps/ai-service/src/ai_service/services/chat_service.py)
- [`../../../apps/ai-service/src/ai_service/providers/openai_provider.py`](../../../apps/ai-service/src/ai_service/providers/openai_provider.py)
- other providers

### 验收标准

- provider adapter 可以返回 tool call 信息
- chat service 能识别 tool call 与普通 assistant content 的区别

## P2-2 Function Calling Runtime / Tool Loop

### 目标

为 unified AI workflow orchestrator 增加受控 tool loop。

### 主要代码入口

- unified AI workflow orchestrator
- `chat_service.py`
- tool registry / execution engine

### 验收标准

- 至少一种 read-only tool 能在 chat 中自动调用
- side-effect tool 不会未经批准直接落库

## P2-3 上下文增强：Notes 与 Analytics 驱动 Goal Planning

### 目标

把 `search_notes` 和 `fetch_stats` 从“可选动作”提升为更明确的上下文增强能力。

### 主要代码入口

- [`../../../packages/app-vue/src/modules/ai/views/AIChatView.vue`](../../../packages/app-vue/src/modules/ai/views/AIChatView.vue)
- [`../../../apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts`](../../../apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts)
- unified AI workflow orchestrator

### 验收标准

- 用户知道本次 planning 是否引用了 notes / stats
- 至少一类上下文会真实影响 plan 输出

## P2-4 Goal Planning Regression Cases

### 目标

为 Goal draft、Goal plan、Goal execution 新增更系统的 regression cases。

### 主要代码入口

- `apps/ai-service/evals`
- eval runner

### 验收标准

- Goal planning / execution 有一批高信号 case
- prompt 或 schema 改动后可以跑回归

## P2-5 Prompt / Tool Schema 版本化记录

### 目标

对核心 Goal planning prompt 和 tool schema 改动增加版本意识和变更说明。

### 验收标准

- 核心 prompt / schema / tool schema 的重要改动有记录
- 你能说清每次改动解决了什么问题

## P3：CLI、演示与开发者入口

## P3-1 AI Workflow CLI

### 目标

新增 TS-side CLI，支持：

- `plan`
- `dry-run`
- `execute-approved-plan`
- `replay`

### 为什么值得做

CLI 应该成为 chat 之外的开发者入口、调试入口和回归入口。

### 主要代码入口

- future TS CLI entry
- unified AI workflow orchestrator
- execution engine

### 验收标准

- CLI 能跑通至少一种 Goal workflow
- CLI 与 Chat 的 orchestration 内核一致

## P3-2 Goal Workflow Demo 面板

### 目标

增加一个更适合展示的 Goal workflow demo 面板或调试页。

### 验收标准

- 不看控制台也能完整演示 Goal workflow 全流程
- 页面能作为作品录屏入口

## 推荐实现顺序

1. `P0-1` 澄清式 Goal 创建
2. `P0-2` Draft / Plan / Execute 三阶段 UI
3. `P0-3` Draft 与 Execution Plan 字段对齐
4. `P1-1` Unified AI Workflow Orchestrator
5. `P1-2` Tool Registry / Execution Engine
6. `P1-3` Action timeline
7. `P2-1` provider adapter tool calling
8. `P2-2` function calling runtime
9. `P2-4` regression cases
10. `P3-1` CLI
11. `P3-2` demo 面板

## 每做完一项都要补的资产

为了让这个项目真正变成你的学习与求职资产，建议每做完一项 backlog，都同步补下面这些内容：

- 更新对应指南文档
- 记录一次前后行为差异
- 补一张小时序图或状态图
- 记录一个最能说明价值的截图或录屏片段
- 如果涉及 AI 输出变化，补一个 regression case

## 一句话记忆版

这份 backlog 的核心目标，不是继续维护两条旧链路，而是把 `Chat Goal Tool` 做成由 `Unified AI Workflow Orchestrator + Function Calling Runtime + Execution Engine` 驱动的单一 Goal workflow，并让 Goal 作为第一批落地 handler。
