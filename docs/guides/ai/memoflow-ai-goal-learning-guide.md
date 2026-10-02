---
tags:
  - guide
  - ai
  - learning
  - goal
  - project
description: 基于当前仓库的 AI 创建 Goal 学习指南，聚焦 Chat Goal Tool 主线、统一 AI Workflow Orchestrator 与 function calling runtime 路线
created: 2026-04-18T00:00:00
updated: 2026-04-29T14:40:00
---

# 基于本项目的 AI 创建 Goal 学习指南

> **2026-10-02 current status (PVC-AI-8121):** Goal/Task AI-owned editors and their visibility flags are retired. Normal editing uses GoalDialog, full TaskPlanDialog and Repository KnowledgeCaptureReviewDialog. Mastra retains draft/revision/receipt/recovery authority; Goal supporting Task/Knowledge overlays remain. The older flow examples below describe historical behavior. See [current AI module](../../product/modules/ai.md).

这篇文档不是泛泛地讲“怎么学 AI Agent”，而是把当前仓库当作主训练项目，围绕 `AI 辅助创建 Goal` 这条链路，明确：

- 当前已经做到什么
- 终极目标应该是什么
- 为了做到那个目标，分别要学哪些技能
- 应该按什么顺序学，学到什么程度算掌握

## 先给结论

这个项目已经不是 AI Demo。

它真正有价值的部分不是“又做一个草稿按钮”，而是已经同时拥有：

- Chat 页的真实 Goal Tool 主入口
- 独立 `ai-service`
- planning / execution 的保留实现
- evaluator / execution log / capability gating 等工程化基础

所以最值得学习的方向不是继续维护两套入口，而是：

`把 AI Chat 页里的 Goal Tool 升级成统一 Goal Workflow，并以 Unified AI Workflow Orchestrator + function calling runtime 为后续主方案`

## 当前项目中与 AI 创建 Goal 最相关的入口

建议先把下面这些入口认清：

- 当前工作流说明：[`../development/ai-goal-creation-current-workflow.md`](../development/ai-goal-creation-current-workflow.md)
- 当前聊天与流式说明：[`../development/ai-chat-streaming-current-implementation.md`](../development/ai-chat-streaming-current-implementation.md)
- 聊天页：[`../../../packages/app-vue/src/modules/ai/views/AIChatView.vue`](../../../packages/app-vue/src/modules/ai/views/AIChatView.vue)
- 旧 workspace 工具箱实现：已于 2026-04-29 删除，不再作为学习入口
- AI 客户端门面：[`../../../packages/ai/src/application-client/ai-client-service.ts`](../../../packages/ai/src/application-client/ai-client-service.ts)
- 统一 goal workflow 编排：[`../../../packages/ai/src/application-server/use-cases/commands/goal-generation-application-service.ts`](../../../packages/ai/src/application-server/use-cases/commands/goal-generation-application-service.ts)
- AI 模块能力判断：[`../../../packages/ai/src/infrastructure-server/ai.module.ts`](../../../packages/ai/src/infrastructure-server/ai.module.ts)
- Python goal planning：[`../../../apps/ai-service/src/ai_service/services/goal_planning_service.py`](../../../apps/ai-service/src/ai_service/services/goal_planning_service.py)
- Python chat service：[`../../../apps/ai-service/src/ai_service/services/chat_service.py`](../../../apps/ai-service/src/ai_service/services/chat_service.py)
- OpenAI provider adapter：[`../../../apps/ai-service/src/ai_service/providers/openai_provider.py`](../../../apps/ai-service/src/ai_service/providers/openai_provider.py)
- API 端执行器：[`../../../apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts`](../../../apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts)
- 知识笔记生成服务：[`../../../packages/ai/src/application-server/use-cases/commands/ai-knowledge-note.service.ts`](../../../packages/ai/src/application-server/use-cases/commands/ai-knowledge-note.service.ts)
- 知识笔记持久化适配器：[`../../../apps/api/src/modules/ai/repository-knowledge-note-persistence.adapter.ts`](../../../apps/api/src/modules/ai/repository-knowledge-note-persistence.adapter.ts)

## 当前现状

先不要把系统想复杂，当前与 `AI 创建 Goal` 直接相关的事实主要是这些。

### 1. 当前主流已经收敛到 Chat Goal Tool

如果按当前产品现实判断，主产品流已经是：

`AI Chat -> toolMode=goal -> generate draft -> edit -> create`

旧的 `goal automation` 实现仍然存在，但更适合作为：

- 设计资产
- 执行能力层
- 后续统一工作流的 planning / execution 参考

而不是继续作为并列产品入口。

### 2. 当前已经有运行时模式和能力开关

`packages/ai/src/infrastructure-server/ai.module.ts` 里已经明确区分：

- `direct-provider`
- `remote-ai-service`

并且自动判断：

- 是否支持 goal automation
- 是否支持 knowledge query / reindex
- 是否支持 analytics query
- 是否支持 evaluation reports

这非常重要，因为真正的 AI 工程化不是“功能永远都在”，而是“能力是否可用由运行时条件决定”。

### 3. 当前聊天页不是纯 demo

`AIChatView.vue` 当前已经具备：

- 会话列表
- 消息流式追加
- 占位 assistant message
- 中止生成
- `error / aborted / success / generating` 这类消息状态
- 工作流状态本地恢复

也就是说，它已经足够作为 Agent 前端的训练起点。

### 4. 当前 automation 仍然有高价值能力

`AIGoalAutomationService` 里保留着一套很关键的执行思想：

- 第一次请求只出 plan
- 第二次确认执行时复用 `approvedPlan + approvedActions`
- 不重新让模型规划
- side-effect tools 必须确认

这层价值更多在实现层，而不等于它仍然应该作为独立产品入口保留。

### 5. 当前执行器已经连接到真实业务模块

`BackendAutomationToolExecutorAdapter` 已经不是“打印日志模拟执行”，而是真的会：

- 创建 goal
- 创建 key result
- 创建 task template
- 查询知识笔记
- 查询分析数据

另外，知识笔记生成也已经是一条真实的“AI 生成 -> 应用门面持久化”链路。

### 6. 当前 provider 层还没有真正的 function calling runtime

这点很关键。

当前 `ai-service` 的 provider 层，尤其是 `openai_provider.py`，仍然主要处理：

- 文本 `complete`
- 文本 `stream`

也就是说，当前系统还更接近：

- 模型返回结构化 JSON / `toolCalls`
- 应用层手动解释并执行

而不是完整的 provider-native tool calling agent runtime。

## 这个项目里 AI 创建 Goal 的终极目标

如果把这条链路做成你真正的主训练项目，终极目标应该是下面这条完整能力链：

`用户提出模糊目标 -> Chat Goal Tool 收集上下文 -> Orchestrator 判断是否需要 clarification -> 信息足够后生成结构化 draft -> 用户编辑 -> 系统生成显式 execution plan -> 用户确认 -> 统一执行引擎执行 approved tool calls -> 前端展示 timeline / result / retry -> 整个过程带 request id、日志、评测与回归门禁`

这条终极目标可以拆成 6 个要求。

### 1. 从“单次生成”升级到“澄清式创建”

系统不该急着直接出结果，而应该先补信息缺口，例如：

- 为什么要做这个目标
- 成功标准是什么
- 时间范围是什么
- 是否需要关键结果
- 是否需要拆成任务模板

### 2. 从“草稿展示”升级到“显式 planning”

用户应该能看到：

- 生成依据
- 使用了哪些上下文
- 为什么建议这些 KR
- 为什么需要这些 task template
- 哪些动作会真的产生副作用
- 哪些步骤会触发 tool execution

### 3. 从“可执行”升级到“统一执行引擎”

真正的工程化要求：

- 部分成功可见
- 失败原因明确
- 可重试
- 可幂等
- 可回放
- 可被 CLI 与 Chat 共用

### 4. 从“黑盒 AI”升级到“可调试 function-calling runtime”

你需要能回答：

- 用了哪个 provider / model
- 输入摘要是什么
- 输出 token 和耗时如何
- 失败发生在 planning 还是 execution
- 哪个 action 失败了
- tool call 是模型提议、自动执行，还是等待确认

### 5. 从“体验能用”升级到“可持续迭代”

要能把下面这些沉淀成工程资产：

- regression cases
- baseline expectations
- 失败样本
- prompt 版本
- tool schema 版本

### 6. 从“项目功能”升级到“求职作品”

最后这条链路应该能被你抽象成：

- 一张架构图
- 一条时序图
- 一组关键设计决策
- 一组质量指标
- 一段 demo 录屏

这样它才真正能转化成岗位竞争力。

## 围绕这个目标要学的技能

不要按学科分散地学，而要按工作流分层学。

## 一、AI 前端交互层

你要掌握：

- SSE / streaming UI
- 消息状态机
- 长任务反馈
- 审批与确认交互
- 多阶段工作流 UI
- 本地工作流状态恢复

在本项目中的对应入口：

- `AIChatView.vue`
- chat workflow state
- `AIGoalDraftEditor.vue`

## 二、结构化输出与 schema 约束

你要掌握：

- Prompt 设计
- JSON-only 输出
- schema 校验
- DTO 映射
- 宽松解析与兜底
- function/tool schema 设计

在本项目中的对应入口：

- `goal_planning_service.py`
- `GenerateGoalsReq / Res`
- `GenerateGoalAutomationReq / Res`
- tool call contracts

## 三、Unified AI Workflow Orchestrator

你要掌握：

- 顶层统一编排与具体 workflow handler 的职责拆分
- plan 与 execute 分离
- clarification / draft / plan / confirm / execute 阶段建模
- side-effect tool 判定
- approved actions 复用
- tool loop 控制
- CLI 与 Chat 共用 orchestration

在本项目中的对应入口：

- `goal-generation-application-service.ts` 中统一后的 `plan / execute` 分支
- `backend-automation-tool-executor.adapter.ts`
- `chat_service.py`
- future `GoalWorkflowHandler`
- future `KnowledgeNoteWorkflowHandler`

## 四、Function Calling Runtime

你要掌握：

- provider-native tool calling 的接口形态
- message / tool / tool_result 的多轮编排
- read-only tools 与 side-effect tools 的策略差异
- 最大轮次、失败策略、超时与中止传播

对应入口：

- `chat_service.py`
- `openai_provider.py`
- provider adapters

## 五、后端闭环与业务边界

你要掌握：

- AI 模块和 goal/task/repository 领域模块的职责边界
- application service 编排
- repository / module 接口复用
- 错误分类和 request id

对应入口：

- `packages/ai`
- `packages/goal`
- `packages/task`
- `packages/repository`

## 六、知识与分析上下文增强

你要掌握：

- 知识检索如何为 goal planning 提供上下文
- 统计信息如何影响 action plan
- 什么时候该查 notes
- 什么时候该查 analytics

对应入口：

- `AIChatView.vue`
- `RepositoryKnowledgeSourceAdapter`
- `ControlledAnalyticsReadAdapter`

## 七、评测与可观测性

你要掌握：

- deterministic eval
- live eval
- regression case 设计
- 失败样本沉淀
- prompt / schema / tool schema 变更回归

对应入口：

- `apps/ai-service/src/ai_service/evals`
- execution log
- evaluation overview UI

## 八、CLI 与开发者入口

你要掌握：

- dry-run CLI
- approved plan execute CLI
- eval CLI
- CLI 与 Chat 共用 orchestrator 的设计

对应入口：

- `apps/ai-service/src/ai_service/evals/runner.py`
- future TS-side CLI entry

## 九、部署与运行时能力设计

你要掌握：

- direct-provider 和 remote-ai-service 的差异
- capability gating
- 环境变量与 provider 配置
- 运行时能力不可用时的降级提示

对应入口：

- `ai.module.ts`
- `.env.example`
- Docker 相关配置

## 学习流程

下面这条流程不按时间拆，而按“掌握顺序”和“产出物”拆。

## 第 0 步：先建立系统地图

你要做的事：

- 读完 `ai-goal-creation-current-workflow.md`
- 对照当前代码，确认主入口已经收敛到 chat goal workflow
- 画一张从 Chat Goal Tool 到真实业务落库的时序图
- 再画一张“automation 可复用资产”图

完成标准：

- 你能不用看文档，口头讲清“主产品流”和“保留执行能力层”的区别

## 第 1 步：把聊天与 Goal draft 链路彻底吃透

你要重点看的代码：

- `AIChatView.vue`
- `generateGoalDraftFromConversation()`
- `handleCreateGoalFromDraft()`
- `AIGoalDraftEditor.vue`

你要学会的东西：

- transcript 驱动 planning
- draft 与真实业务创建的边界
- 会话级工作流状态恢复

完成标准：

- 你能解释为什么当前主流适合作为后续唯一主入口

## 第 2 步：吃透 automation 的可复用资产

你要重点看的代码：

- `goal-generation-application-service.ts` 中统一后的 `plan / execute` 分支
- `backend-automation-tool-executor.adapter.ts`

你要学会的东西：

- plan 与 execute 分离
- confirmation gate
- side-effect tools 的确认机制
- action index 和实体创建的映射关系
- 为什么这层更适合被抽成执行能力层，而不是继续做独立 UI

完成标准：

- 你能说明 automation 该保留什么、不该保留什么

## 第 3 步：定义 Unified AI Workflow Orchestrator

你要做的事：

- 定义顶层 orchestrator 与 workflow handler 的边界
- 定义统一 workflow state machine
- 统一 chat 主入口与后端 orchestration 契约
- 把 automation 中的 `plan / confirm / execute` 能力抽成统一可复用阶段
- 明确 Goal 是第一落点，knowledge note / query / analytics 是后续 workflow

这一步会训练你：

- 系统边界重构
- agent workflow 设计
- 服务编排抽象

完成标准：

- 文档和实现都不再把 chat 与 automation 视为并列主产品流
- 顶层命名不再被 Goal 锁死

## 第 4 步：补“澄清式 Goal 创建”这一层

你要做的事：

- 在 draft 生成之前，增加 clarification step
- 让系统先判断信息是否足够
- 不足时返回 2 到 4 个关键问题，而不是直接出 goal draft
- 把用户补充回答再次纳入 transcript / planning input

完成标准：

- 系统不再默认“一次输入 -> 一次生成”，而是能在信息不足时主动追问

## 第 5 步：统一 Draft 与 Execution Plan 的 schema 粒度

你要做的事：

- 对齐 key result 字段
- 对齐 task template 的结构化字段
- 把“默认补值”变成更显式的规则
- 减少前端映射层的隐式魔法

完成标准：

- 同一类业务对象在 draft 和 future plan 中不再出现明显字段断层

## 第 6 步：引入 provider-native function calling runtime

你要做的事：

- 给 provider adapter 增加 tool calling 支持
- 设计 tool schema、tool result schema
- 增加有限 agent loop
- 区分 read-only tools 与 side-effect tools

这一步会训练你：

- provider 能力适配
- tool loop runtime
- function calling orchestration

完成标准：

- chat 中的 agent 不再只是“返回 JSON toolCalls”，而是具备真实 tool loop 基础设施

## 第 7 步：补上下文增强，而不是只做单轮生成

你要做的事：

- 在 planning 时把 notes / analytics 变成可选上下文来源
- 明确“为什么查这些上下文”
- 在 UI 中展示所用上下文及其作用

完成标准：

- 用户能看到“计划不是凭空生成的，而是参考了哪些上下文”

## 第 8 步：补执行可靠性

你要做的事：

- 明确 action 级状态
- 支持部分成功显示
- 支持失败原因展示
- 支持可重试 action
- 审视幂等问题和重复创建风险

完成标准：

- 一次 execution 失败时，不再只有“失败了”，而是能知道哪一步失败、为什么失败、下一步怎么做

## 第 9 步：把 CLI、日志、trace 和 eval 接起来

你要做的事：

- 为 unified orchestrator 增加 CLI 入口
- 支持 plan / dry-run / execute-approved-plan
- 把 request id、provider、model、timing、token usage 串起来
- 为 goal planning / execution 增加 regression cases

完成标准：

- Chat 与 CLI 可以共用同一套 orchestration
- 每次改 AI 输出逻辑，都能通过 eval 判断它是变好还是退化

## 第 10 步：沉淀成求职资产

你要做的事：

- 录一段完整 demo
- 画架构图和时序图
- 总结 3 到 5 个关键设计决策
- 写清楚你解决了哪些真实问题

建议重点强调的点：

- Chat Goal Tool 唯一主线
- Unified AI Workflow Orchestrator
- GoalWorkflowHandler 作为第一落点
- provider-native function calling runtime
- side-effect confirmation gate
- execution engine
- evaluation / observability

## 一句话记忆版

在这个项目里，你最值得练的不是“让 AI 写一个目标”，而是把 `Chat Goal Tool` 升级成一条由 `Unified AI Workflow Orchestrator + function calling runtime` 驱动的可靠 workflow，并让 Goal 成为第一批落地的 handler。
