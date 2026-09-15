---
tags:
  - adr
  - ai
  - goal
  - task
  - knowledge
  - workflow
  - orchestration
  - hitl
description: AI GoalPlanDraft V2 同时规划 Goal、KR、Task、Knowledge 与 Relation 的 durable apply 工作流
created: 2026-09-08T17:55:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# ADR-070: AI GoalPlanDraft V2 与多实体 Goal Context Orchestration

> **2026-09-09 AI model convergence follow-up：** 本 ADR 的 GoalPlanDraft V2、多实体 `draftRef`/mapping、HITL 与 owner application port 原则继续作为 Goal planning 真值；stable `draftRef` idempotency、Task canonical schedule、Knowledge stable document identity、Routine target vocabulary 与 execution-record boundary 由 ADR-098/099 继续收敛。

**状态：** 已采纳，待实施
**日期：** 2026-09-08
**影响范围：** AI/Mastra workflow、Goal、Task、Repository/Knowledge、Relation、Labels、Reminder、contracts、Web/Desktop AI preview
**修订：** ADR-052 的 GoalPlanDraft schema 与 ApplyGoalPlan 范围；ADR-052 的 durable workflow / HITL / owner application port 原则继续有效
**关联：** ADR-050、ADR-051、ADR-052、ADR-053、ADR-056、ADR-067、ADR-068、ADR-069

## 1. 产品目标

AI 创建 Goal 不应只是“帮用户填一张 Goal 表单”。目标体验是：

> 用户决定一个长期目标后，AI 能同时建立可衡量结果、可执行行动和可复用知识上下文，并让用户在一次预览中确认。

示例输入：

```text
我想在三个月内找到 AI 全栈开发工作。
```

AI draft 可以提出：

```text
Goal
- 找到 AI 全栈开发工作
- Target: 2026 Q4

Key Results
- 完成 100 次高质量投递
- 获得 10 次技术面试
- 获得 1 个正式 Offer

Tasks
- 整理目标公司池
- 优化 AI 全栈简历
- 每日筛选岗位
- 每周复盘投递回复率

Knowledge
- AI 全栈岗位求职指南
- 杭州/深圳目标公司调研
- 技术面试准备路线
- 求职策略与约束说明
```

用户确认后，这些内容成为普通 MemoFlow Goal/KR/Task/Knowledge/Relation 实体，不存在一套 AI 专用平行数据模型。

## 2. 保留 ADR-052 的 durable workflow 原则

继续采用：

```text
User
 -> MemoFlow Assistant
 -> goal.create orchestration tool
 -> Mastra durable GoalCreateWorkflow
 -> GoalPlannerAgent
 -> typed GoalPlanDraft
 -> suspend for review
 -> user edit / approve
 -> ApplyGoalPlanService
 -> owner application ports
```

继续禁止：

- AI 直接写数据库；
- AI 直接 import Goal/Task/Repository concrete repository；
- UI 自己拥有 workflow state machine；
- 把 LLM 输出当成未经 deterministic validation 的 mutation command。

## 3. GoalPlanDraft V2

Draft 是 workflow intermediate state，不是 Goal aggregate，也不是持久 GoalStatus。

建议 canonical schema：

```ts
GoalPlanDraftV2 {
  goal: {
    draftRef: 'goal';
    name: string;
    summary?: string;
    status: 'Planned' | 'InProgress';
    startDate?: Ymd;
    target?: GoalTimeframe;
    labels?: GoalDraftLabel[];
    reminderConfig?: GoalReminderDraft;
  };

  keyResults: KeyResultDraft[];
  tasks: TaskDraft[];
  knowledge: KnowledgeDraft[];

  rationale: string;
  warnings: GoalPlanWarning[];
  revision: number;
}
```

### 3.1 KeyResultDraft

```ts
KeyResultDraft {
  draftRef: string;
  title: string;
  description?: string;

  initialValue: number;
  currentValue: number;
  targetValue: number;
  unit?: string;
  aggregationMethod: KeyResultCalculationMethod;
  weight: number;
  target?: GoalTimeframe;
}
```

`draftRef` 是 workflow-local stable ref，不是数据库 ID。

### 3.2 TaskDraft

```ts
TaskDraft {
  draftRef: string;
  title: string;
  description?: string;
  timeConfig?: TaskTimeDraft;
  recurrence?: RecurrenceDraft;
  reminder?: TaskReminderDraft;
  labels?: DraftLabel[];

  goalRef: 'goal';
  keyResultRef?: string;
  contribution?: GoalContributionRuleDraft;
}
```

如果 `contribution` 存在，`keyResultRef` 必须存在。

### 3.3 KnowledgeDraft

Knowledge 支持两种动作：

```ts
type KnowledgeDraft =
  | {
      draftRef: string;
      mode: 'create';
      title: string;
      content: string;
      sourceRefs?: KnowledgeSourceRef[];
      relation: 'goal-related';
    }
  | {
      draftRef: string;
      mode: 'linkExisting';
      noteId: string;
      relation: 'goal-related';
    };
```

这样 AI 可以：

- 创建一篇新的 Goal Brief / 求职指南；
- 复用用户已经存在的知识笔记；
- 不必每次重复生成相同知识。

## 4. Goal Brief 替代 Goal 内部 motivation / feasibilityAnalysis

当 AI 判断需要解释动机、可行性、风险与策略时，生成关联 Note：

```text
Goal Brief: 找到 AI 全栈开发工作

## Why
## Success definition
## Feasibility
## Constraints
## Risks
## Strategy
## References
```

因此 Goal aggregate 只保留 `name + summary`，但 AI 仍能输出比当前 `motivation / feasibilityAnalysis` 更丰富、可编辑、可引用、可持续演化的内容。

## 5. Existing Knowledge reuse

GoalPlanner 在生成 KnowledgeDraft 前可以通过 Knowledge Search/Retrieval tool 查询用户知识库：

```text
search existing notes
 -> relevant result exists
    -> propose linkExisting
 -> missing / insufficient
    -> propose create
```

AI 不应在已有“AI Agent 求职指南”时机械再建一篇重复笔记。

若用了外部研究/检索，KnowledgeDraft 必须保留 provenance/source references；不能把无来源 web 内容伪装成用户既有知识。

## 6. HITL Preview

Workflow 在 apply 前 suspend，用户看到一个完整 plan preview：

```text
Goal
[edit]

Key Results (3)
[edit/reorder/delete]

Tasks (5)
[edit/delete]

Knowledge (4)
[create/link existing/edit/delete]

Warnings
```

用户可以只接受一部分：

- 删除某个 Task；
- 不创建某篇 Note；
- 修改 KR target；
- 把 Goal status 从 Planned 改成 InProgress；
- 改 Target 从 Day 改成 Quarter。

最终 apply 的唯一输入是用户确认后的 typed draft revision。

## 7. Draft Ref -> Persistent ID 映射

AI draft 中不能预造数据库 ID 来连接未创建实体。

Apply 阶段维护：

```text
DraftReferenceMap
- goal -> GoalId
- kr:applications -> KeyResultId
- task:company-pool -> TaskTemplateId
- note:goal-brief -> NoteId
```

流程：

```text
keyResultRef = "kr:interviews"
        ↓
Create Goal + KRs
        ↓
"kr:interviews" -> IKeyResultId_...
        ↓
Create Task(goalId, keyResultId)
```

这个 mapping 由 deterministic Apply service 生成，不能让 LLM 猜测。

## 8. ApplyGoalPlanService：跨模块编排，不做跨模块巨型事务

MemoFlow owner boundary 已明确：Goal、Task、Knowledge、Relation 各自负责自己的写入。

因此 Apply 不使用一个共享 repository transaction 强行包住全部模块，而采用 durable idempotent orchestration：

```text
Resolve/Create Labels
       ↓
Create Goal + KRs
       ↓
Create / resolve Knowledge Notes
       ↓
Link Goal -> Notes through Relation
       ↓
Create Tasks with Goal/KR links
       ↓
Apply remaining reminder/config intents
       ↓
Build final ApplyReceipt
```

每一步只调用 owner application port。

## 9. Idempotency 与 partial apply

多实体 apply 可能在中途失败，例如：

```text
Goal created
Notes created
Task #3 failed
```

禁止：

- retry 时重新创建第二个 Goal；
- 为了模拟“原子”而跨模块共享数据库 transaction；
- UI 把 partial apply 当成功。

Workflow state 必须保存 step receipt：

```ts
GoalPlanApplyState {
  labelReceipts[];
  goalReceipt?;
  knowledgeReceipts[];
  relationReceipts[];
  taskReceipts[];
  reminderReceipts[];
}
```

每个 mutation 使用 stable idempotency/correlation key：

```text
workflowRunId + draftRevision + draftRef + operation
```

retry 只补齐缺失步骤。

## 10. Apply Receipt

最终返回：

```ts
GoalPlanApplyReceipt {
  status: 'success' | 'partial' | 'failed';
  goalId?: GoalId;
  keyResultIds: Record<DraftRef, KeyResultId>;
  taskIds: Record<DraftRef, TaskId>;
  noteIds: Record<DraftRef, NoteId>;
  relationIds: Record<DraftRef, RelationId>;
  warnings: ApplyWarning[];
}
```

只有所有 required intents applied 才是 success。

## 11. Tool / Port reuse

优先复用当前成熟能力：

- Goal application port：创建 Goal + initial KRs；
- Task application port：创建 Task / Task Plan；
- Shared Label application port：resolve/create labels；
- Knowledge capture/persistence workflow / mutation port：创建 Knowledge Note；
- Relation application port：建立 Goal <-> Note；
- Scheduler/Reminder owner port：创建需要的 scheduling intent。

不得为了 Goal AI flow 重造第二套 Note persistence 或第二套 Task creation API。

## 12. AI planning policy

AI 默认遵循：

1. 先确认 Goal success definition；
2. KR 必须可测量，避免只把 Task 改名成 KR；
3. Task 是行动，不默认每个 Task 都 contribution；
4. 没有合理 KR 时 Task 可以仅链接 Goal；
5. Note 是知识与长期上下文，不把一次性操作写成 Note；
6. 尽量复用已有 Note；
7. 不确定精确日期时优先 Quarter/Month/Year，而不是制造假日期；
8. 不擅自把用户的 Goal 标记 Completed/Abandoned；
9. 在 apply 前始终允许用户编辑/删除 draft item。

## 13. Manual Goal creation 与 AI Goal creation 共用同一领域模型

Manual UI：

```text
Goal form -> Goal/KR contracts
```

AI UI：

```text
GoalPlanDraft -> reviewed -> same Goal/KR/Task/Knowledge application ports
```

二者不能形成：

```text
ManualGoal
AIGoal
```

或不同字段/不同 status/不同 measurement 语义。

## 14. Goal Workspace 作为 apply 后 landing page

AI plan apply 成功后默认进入 Goal Workspace，用户立即看到：

```text
Goal header
KR progress
Tasks created/linked
Knowledge created/linked
Recent activity
```

这样用户能验证 AI 实际创建了什么，而不是只收到一条聊天文本“已完成”。

## 15. 验收条件

1. GoalPlanDraft V2 能同时表达 Goal/KR/Task/Knowledge；
2. Draft 使用 stable local refs，不预造数据库 ID；
3. user review 后才 apply；
4. Apply 只调用 owner application ports；
5. partial apply 可幂等 resume，不产生重复实体；
6. AI 可以 create 或 link existing Note；
7. AI 生成的 motivation/feasibility 等长内容进入 Goal Brief Note，而非 Goal aggregate；
8. Task 可以 goal-only 或 goal+KR link；
9. AI-generated artifacts 在 Goal Workspace 中可见；
10. Web/Desktop workflow state 与 apply semantics parity；
11. 不新增 AI 专用 Goal/Task/Note 持久模型。
