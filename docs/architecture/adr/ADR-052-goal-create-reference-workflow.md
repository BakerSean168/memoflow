---
tags:
  - adr
  - ai
  - mastra
  - workflow
  - goal
  - reference-architecture
description: goal.create 作为 MemoFlow AI vNext 的参考 Workflow、HITL 与确定性 mutation 模式
created: 2026-08-20T00:00:00+08:00
updated: 2026-08-20T00:00:00+08:00
---

# ADR-052: `goal.create` Reference Workflow 与确定性业务执行

**状态：** 已采纳  
**日期：** 2026-08-20  
**依赖：** ADR-050、ADR-051

> **2026-09-08 Goal vNext 后续决策：** ADR-052 的 durable Mastra workflow、HITL、deterministic apply 与 owner application port 原则继续有效；`GoalPlanDraft` 的目标 schema 与多实体 apply 范围由 [ADR-070](./ADR-070-ai-goal-plan-orchestration.md) 取代，并使用 [ADR-067](./ADR-067-goal-vnext-product-model-and-lifecycle.md)、[ADR-068](./ADR-068-key-result-measurement-v3.md)、[ADR-069](./ADR-069-goal-workspace-cross-module-context.md) 的 Goal/KR/Context 真值。实施完成前，本 ADR 记录的旧 draft 字段仅是历史背景。

> **2026-08-25 产品模型修订：** 本 ADR 的 Mastra workflow / HITL / idempotent apply 架构继续有效；`GoalPlanDraft` 中的 `category`、`importance`、旧 KR `valueType`、旧 Task binding 等字段不再是目标模型真值。实施时按 [ADR-053](./ADR-053-goal-task-personal-product-boundary.md)、[ADR-054](./ADR-054-shared-labels-and-system-views.md)、[ADR-055](./ADR-055-key-result-measurement-progress-v2.md)、[ADR-056](./ADR-056-task-plan-goal-link-contribution-settlement.md) 更新 draft schema。

## 1. 决策

`goal.create` 是 **由 MemoFlow Assistant 发起的 Mastra durable Workflow**，不是一个 user-facing Goal Agent，也不是通用 `AgentAction[]` 执行计划。

```text
User
 -> AgentController / MemoFlow Assistant
 -> startGoalCreate (orchestration tool)
 -> GoalCreateWorkflow
 -> GoalPlannerAgent (worker)
 -> GoalPlanDraft
 -> workflow suspend (review)
 -> ApplyGoalPlanService
 -> Goal/Task/Reminder Application Ports
```

该 vertical slice 是后续 `goal.replan`、`task.create`、`habit.setup`、`knowledge.capture` 的参考实现。

## 2. Workflow State

唯一运行状态由 Mastra Workflow 保存：

```text
GoalCreateInput
GoalPlanningDecision
ClarificationState
GoalPlanDraft
ReviewDecision
ApplyReceipt
```

UI 不拥有 workflow state machine；数据库不额外保存通用 Proposal/Artifact/Action DAG。

## 3. Input

```ts
GoalCreateInput = {
  identityId
  conversationId
  idea
  locale
  providerId?
  model?
  surfaceContext?
}
```

`identityId` 必须由 trusted host context 注入，客户端 body 不得声明。

## 4. Planning Decision

不再用“输入字数/字符数”决定 clarification。GoalPlannerAgent 输出 typed decision：

```text
status = draft_ready | needs_clarification
questions <= 3
reason
candidateDraft?
```

clarification 最大 3 问/轮，默认最多 3 轮；超限后使用已有信息生成 draft + warnings，而不是无限追问。

## 5. GoalPlanDraft

Draft 是 workflow intermediate state：

```text
GoalPlanDraft
- goal
  - name
  - description
  - motivation
  - feasibilityAnalysis
  - category
  - importance
  - tags
  - startDate
  - targetDate
- keyResults[]
- taskTemplates[]
- reminders[]
- rationale
- warnings[]
- revision
```

它不是 `Goal` aggregate，也不是持久产品 Draft。只有未来产品明确提供“保存草稿”能力时才新建 domain entity。

## 6. Validation

顺序：

```text
LLM structured output
 -> Zod structural validation
 -> deterministic normalization
 -> Domain preview validation
 -> review suspend
```

LLM 不负责证明 domain invariant。

## 7. Review / Revision

review step 调用 workflow `suspend`，payload 只包含 UI 需要的 typed draft、warnings、revision。

用户操作：

- `approve`：进入 Apply；
- `cancel`：workflow cancelled；
- `edit_structured`：不调用模型，校验修改后的 draft；
- `revise_natural_language`：调用 GoalPlannerAgent 基于 draft + instruction 生成新 revision；
- `regenerate`：重新规划但保留同一 workflow run lineage。

不再通过 `ProposalKernel` 桥接第二套 approval lifecycle。

## 8. ApplyGoalPlan

审批后只执行一个领域语义 command：

```text
ApplyGoalPlanCommand
- workflowRunId
- revision
- identityId
- requestId
- draft
```

由 `ApplyGoalPlanService` 依次调用现有 Goal/Task/Reminder application ports。

禁止将 draft 拆成模型可编辑的通用：

```text
AgentAction[]
create_goal
create_key_result
create_task_template
create_reminder
dependsOn[]
```

业务执行顺序由 application service 决定，而不是由 LLM action graph 决定。

## 9. Idempotency

`workflowRunId + revision` 是 apply 根 idempotency key。每个 child mutation 派生 deterministic key。重复 approve、断线重试、进程重启恢复都不得创建重复实体。

Apply receipt：

```text
GoalPlanExecutionReceipt
- status: success | partial | failed
- goalId?
- keyResultIds[]
- taskIds[]
- reminderIds[]
- failures[]
- retryable
```

## 10. Partial Failure

partial failure 的 recovery 是确定性 workflow 逻辑，不交给 LLM 即兴决定。

- 已成功的幂等 child operation 不重复执行；
- retry 只重跑失败/未执行子项；
- 无法安全自动 retry 时 suspend 为 `recovery_required`；
- 用户可 retry、accept_partial、cancel_remaining；
- 不回滚已经成为业务事实且无法安全补偿的 mutation，除非对应 domain 明确提供补偿语义。

## 11. UI Projection

UI 消费薄事件/查询：

```text
workflow.started
workflow.suspended
  - clarification
  - goal_draft_review
  - recovery_required
workflow.resumed
workflow.completed
workflow.failed
usage.updated
```

Vue composable 只负责 display state 与命令，不再：

- rebuild AgentAction；
- patch dependsOn；
- 同步 Host Proposal 与 AgentRun；
- 解析 LangGraph node lifecycle；
- 自己持久化 workflow stage。

## 12. Context

Goal planner context 按预算加载：

- 当前 conversation intent；
- active/related goals；
- relevant task/habit analytics；
- 少量 related knowledge notes；
- user stable planning preference memory。

检索结果为 untrusted data，只能影响 draft 内容，不能扩大 tools 或绕过 review。

## 13. Observability / Eval

每个 workflow run 必须可关联：identity、conversation、workflow run、model/provider、prompt/skill version、tokens、estimated cost、latency、suspend count、revisions、final outcome。

Goal planning eval 最少覆盖：

- clarification necessity/quality；
- measurable outcome / KR quality；
- plan feasibility；
- domain schema correctness；
- unsafe mutation absence；
- cost/latency；
- production review/rejection rate。

## 14. Reference acceptance journey

```text
用户：今年年底通过 JLPT N1
 -> Assistant 识别 goal.create
 -> Goal workflow 要求补充每天可投入时间
 -> 用户：每天 1 小时
 -> 生成 GoalPlanDraft
 -> 用户结构化把 target date 改为次年 3 月
 -> 不调用 LLM，draft revision +1
 -> 用户批准
 -> ApplyGoalPlanService
 -> Goal + KR + tasks + reminder 创建
 -> workflow completed
 -> UI deep-link /goals/:id
```

必须验证：关页/重启后 review 可恢复；重复 approve 不重复创建；apply 中单项失败可安全 retry；用户取消不产生业务实体。
