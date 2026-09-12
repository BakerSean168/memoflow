---
tags:
  - adr
  - goal
  - task
  - knowledge
  - relation
  - read-model
  - powersync
description: Goal Workspace 跨模块上下文、Task Goal Link、Note Relation 与只读聚合模型
created: 2026-09-08T17:55:00+08:00
updated: 2026-09-08T17:55:00+08:00
---

# ADR-069: Goal Workspace 与跨模块 Context Read Model

**状态：** 已采纳，待实施
**日期：** 2026-09-08
**影响范围：** Goal、Task、Repository/Knowledge、Relation、contracts、API/Desktop composition、PowerSync、Goal Detail UI
**修订：** ADR-053 的 Goal Detail 只读上下文细节；ADR-056 的 `keyResultId` 必选约束
**关联：** ADR-033、ADR-034、ADR-038、ADR-053、ADR-054、ADR-056、ADR-067、ADR-068、ADR-070

## 1. 问题

“Goal 不拥有 Task”是正确的领域边界，但不能被误解为“Goal 页面看不到 Task”。用户打开一个 Goal 时需要回答：

1. 这个目标现在是什么状态？
2. 各 KR 做到哪里？
3. 哪些 Task 正在服务这个目标或某个 KR？
4. 哪些 Note / 知识资料与这个目标有关？
5. 最近哪些事实改变了进度？
6. 最近有哪些 Review / 调整？

这些信息来自多个 owner：

```text
Goal owns        Goal/KR/Record/Review
Task owns        Task/Task Plan/Occurrence + TaskGoalLink
Repository owns  Knowledge Note
Label owns       Shared Label
Relation owns    cross-module semantic links
```

如果为了 Goal Detail 把 `taskIds[]`、`noteIds[]` 复制进 Goal aggregate，会重新制造双写与陈旧关系。

## 2. 核心决策：Write Model 与 Workspace Read Model 分离

继续保持：

```text
Goal Aggregate = Direction + Measurement
```

新增只读产品组合：

```text
Goal Workspace = Direction + Measurement + Context
```

结构：

```text
                    GoalWorkspaceReadModel
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
   Goal Aggregate         Task Module      Repository/Knowledge
        │                    │                    │
      KR[]             TaskGoalLink          Relation
        │                    │                    │
        └──────── Shared Label / Activity / Review ────────┘
```

Goal Workspace 是 query/read projection，不是新的 aggregate，也不拥有外部实体生命周期。

## 3. Goal Aggregate 仍然不保存 Task / Note ID 列表

禁止：

```ts
Goal {
  taskIds: string[];
  noteIds: string[];
}
```

因为 Task 和 Note 的事实来源分别在各自 owner 中。

Goal Workspace 通过 owner-provided read ports / Relation reverse lookup 组合上下文。

## 4. Task -> Goal Link

### 4.1 当前事实

当前代码已有 canonical：

```text
TaskGoalLink
- goalId
- keyResultId
- contribution?
```

Task 是 link owner，Goal 通过 reverse query 查看关联 Task。这个所有权继续保留。

### 4.2 修正：`keyResultId` 改为 optional

新模型：

```ts
TaskGoalLink {
  goalId: GoalId;
  keyResultId?: KeyResultId;
  contribution?: GoalContributionRule | null;
}
```

原因：不是每个与 Goal 有关的行动都能自然归属某个 KR。

示例：

```text
Goal: 找到 AI 全栈工作

Task: 整理杭州 AI 公司池
-> goalId only

Task: 完成 100 次高质量投递
-> goalId + keyResultId

Task: 每天投递 5 个岗位
-> goalId + keyResultId + contribution(+5)
```

### 4.3 Contribution 约束

若：

```text
contribution != null
```

则：

```text
keyResultId MUST exist
```

并继续遵守 ADR-068/ADR-056：自动 numeric contribution v1 只允许可安全结算的 Sum KR。

### 4.4 一个 Task 的 Goal ownership

本轮保持一个 Task 最多拥有一个 primary Goal link，避免一个完成事件同时向多个目标产生歧义归因。

未来若真实需求证明需要多目标 context，应新建明确 ADR，不把 `goalBinding` 直接无约束扩展为 many-to-many。

## 5. Goal 侧 Task Read Projection

Task module 必须提供 owner-controlled read capability：

```text
listTasksByGoal(identityId, goalId, page)
listTasksByKeyResult(identityId, goalId, keyResultId, page)
getTaskGoalContextSummary(identityId, goalId)
```

Goal Workspace 不直接读取 Task 表或 Task repository。

建议 read model：

```ts
TaskContextSummary {
  total: number;
  active: number;
  completed: number;
  goalLevel: number;
  byKeyResult: Array<{
    keyResultId: KeyResultId;
    total: number;
    active: number;
  }>;
}
```

Workspace 首屏返回 summary + 少量 preview items；完整列表走分页 query / deep-link，防止一个长期 Goal 把所有 Task 一次性装入巨大 DTO。

## 6. Goal <-> Note / Knowledge Relation

### 6.1 Note 不保存 `goalId`

禁止：

```ts
KnowledgeNote {
  goalId: string;
}
```

一篇知识笔记可能同时服务多个 Goal，也可能在 Goal 完成后长期保留。

### 6.2 使用跨模块 Relation

MemoFlow 当前已有通用 Relation 表与 `SubjectRef`：

```text
subjectType
subjectId
relationType
objectType
objectId
```

支持：

```text
note | goal | task | reminder | habit | wallet
references | related | depends_on | contributes_to
```

正式的 Goal knowledge attachment 使用 canonical 方向：

```text
Goal --related--> Note
```

这条关系表示：

> 这篇 Note 是这个 Goal 的知识上下文/资源。

同一 Note 可以被多个 Goal 通过多条 Relation 复用。

### 6.3 正向和反向都必须可查

从 Goal：

```text
Knowledge 4 >
- AI 全栈求职指南
- 杭州 AI 公司调研
- 技术面试复习路线
- 简历优化策略
```

从 Note：

```text
Related goals
- 找到 AI 全栈开发工作
```

Relation store 继续支持 forward/reverse lookup；UI 不需要理解 subject/object 方向。

## 7. Relation ownership 必须从 Goal package 抽离

GOAL-7206 已完成该边界切换：旧 `IRelationRepository` / Relation use cases / Prisma mapper+repository / `relation.create` manifest command 已从 `packages/goal` 删除，generic Relation 的唯一 owner 是 `packages/relation`。Prisma 与 PowerSync/Desktop 两条持久化 lane 已对等。

当前 owner 结构：

```text
@memoflow/relation
├── contracts / SubjectRef / RelationType
├── application use cases
├── Prisma adapter
├── PowerSync adapter
└── API/IPC owner surfaces or host contributions
```

Goal、Repository/Knowledge、Task 等模块只通过 Relation application port / typed facade 使用它。

`packages/goal` 不拥有 generic Relation repository class，也不依赖 `@memoflow/relation`；API/Desktop host 通过窄 port/factory 组合 Relation 能力。

## 8. Typed facade：不要让 generic string relation 泄漏到产品 UI

底层可以继续使用 generic Relation，但产品层应提供 typed intent：

```text
linkGoalKnowledge(goalId, knowledgeDocumentRef)
unlinkGoalKnowledge(goalId, knowledgeDocumentRef)
listGoalKnowledge(goalId)
listGoalsForKnowledge(knowledgeDocumentRef)
```

内部映射：

```text
Goal --related--> Note
```

这样以后底层 relation type 调整时，不需要所有 UI/AI consumer 理解 `related` 字符串。

## 9. Shared Labels

Labels 继续属于 Shared Label owner，不进入 Goal aggregate 内部业务状态。

Goal Workspace 可以显示：

```text
labels[]
```

但这是 projection/read context；Goal mutation 继续只通过 canonical `labelIds` / Label port 协作。

## 10. GoalWorkspaceReadModel

GOAL-7207 已实现该 read model。最终 canonical contract 不复制 Goal/KR authority：

```ts
GoalWorkspaceReadModel {
  goal: GoalClientDTO;

  taskContext:
    | { availability: 'Available'; summary: TaskContextSummary; preview: TaskContextItem[] }
    | { availability: 'Unavailable'; summary: null; preview: [] };

  knowledgeContext:
    | { availability: 'Available'; summary: { total: number }; preview: KnowledgeContextItem[] }
    | { availability: 'Unavailable'; summary: null; preview: [] };

  recentProgress: GoalRecordClientDTO[];
  recentReviews: GoalReviewClientDTO[];
}
```

`goal.keyResults` 是唯一 KR authority；Workspace 顶层没有第二份 `keyResults`。Goal aggregate/client DTO 同样没有 `taskIds[]` / `noteIds[]`。

Knowledge preview 由两个 owner seam 组合：

```text
Relation owner: Goal -> stable KnowledgeDocumentId edge
Repository/Local Vault owner: stable KnowledgeDocumentId -> current display projection
```

若 edge 仍存在但当前 KnowledgeDocument 无法解析，Workspace 返回 `state = Missing`，保留 stable `documentId + relationId + linkedAt`。它不是自动清理信号，也不会把 unresolved edge 静默从 count 中消失。

首屏 `knowledgeContext.summary` 只统计 Relation owner 的 `total`，不会为了计算 resolved/missing 全局数量去解析全部文档。

## 11. Composition 位置

`GoalWorkspaceQueryService` 位于 Goal application/read layer，但与 Goal write module 分离。它依赖：

```text
Goal-owned IGoalRepository / IGoalRecordRepository
GoalWorkspaceTaskContextReadPort
GoalWorkspaceKnowledgeRelationReadPort
GoalWorkspaceKnowledgeContextReadPort
```

其中后三个是 consumer-owned structural ports；Goal package 不 import Task/Relation/Repository concrete package，也不接触 Prisma/PowerSync。

API/Desktop host composition 复用已有 owner 实例：

```text
TaskBindingReadPort --------┬-> Goal core dependency checks
                            └-> Goal Workspace Task context

GoalKnowledgeService -------┬-> Goal Knowledge HTTP/IPC transport
                            └-> Goal Workspace stable edge reads

Goal module repositories ---└-> Goal Workspace Goal/Record/Review reads
```

Cloud 的 current Knowledge display 由 Repository owner resolver 提供；Desktop 由 Local Vault resolver 提供。两端只替换 owner adapter，不复制 Workspace 业务语义。

首屏 external context 是可降级 read projection：Task 或 Knowledge owner 暂时不可用时，仅对应 context 返回 `Unavailable`；Goal 本体、Goal Record/Review 仍可返回。空集合与不可用严格区分：空集合是 `Available + total=0 + preview=[]`。完整分页查询若 owner 不可用则显式返回 `SERVICE_UNAVAILABLE`。

完整 Task/Knowledge 列表必须是 owner-bounded query。Knowledge edge 分页已经下沉到 Relation persistence：Prisma 使用 filtered `count + take/skip`，PowerSync 使用 filtered `COUNT(*) + LIMIT/OFFSET`；禁止先读取 Goal 的全部 Relation 再在 Workspace 内存 `slice`。

HTTP / IPC 均提供：

```text
GET /goals/:goalId/workspace           <-> goal:workspace:get
GET /goals/:goalId/workspace/tasks     <-> goal:workspace:tasks
GET /goals/:goalId/workspace/knowledge <-> goal:workspace:knowledge
```

Goal HTTP/IPC adapters 与 `GoalClientService` 暴露相同方法。Vue 与 React 分别通过只读 `useGoalWorkspace` 消费这一 client surface；GOAL-7209 只负责产品视觉/layout，不重新实现 query semantics。

禁止：

- Goal package import Task concrete repository；
- Goal package import Relation/Repository concrete persistence；
- Goal aggregate / Workspace contract 保存 `taskIds[]` / `noteIds[]`；
- API lane 直接拼一套 Prisma Workspace、Desktop 再写另一套 PowerSync Workspace；
- Relation full scan 后在 Workspace 内存伪分页；
- Web/Desktop/React/Vue 拥有不同 context semantics。

这些约束由 canonical `goal-workspace-read-model-audit` 锁定。

## 12. Goal Detail 产品边界

Goal Detail 可以显示 Task，但不复制完整 Task 执行工作区。

推荐：

```text
Tasks 6 >
- 整理 AI 公司池
- 优化 AI 全栈简历
- 每日筛选并投递岗位
```

点 `>` 进入 Task 模块并携带 `goalId` filter；KR 行可以显示：

```text
2 个关联任务 >
```

并跳转 `goalId + keyResultId` filter。

这保持 ADR-053：

```text
Goal = direction/measurement/context overview
Task = daily action/execution workspace
```

## 13. Delete / Archive safety

Goal 删除前继续通过 Task owner read port 检查 active bindings；新增 knowledge relation cleanup 必须由 Relation owner处理。

推荐删除语义：

```text
Goal hard/soft delete
 -> validate Task binding policy
 -> delete Goal-owned aggregate data
 -> remove cross-module Relation rows by subject/object reference
 -> DO NOT delete Task entities
 -> DO NOT delete Knowledge Notes
```

Goal archive 不删除任何 Task/Note relation。

## 14. PowerSync / Offline parity

Goal <-> Note relation 与 Goal Workspace 均已成为正式产品能力。Desktop 当前具备与 API lane 一致的：

- relation create/delete；
- forward/reverse read；
- Goal Workspace read projection；
- offline local persistence；
- sync round trip；
- identity scoping。

不接受“Web 可关联知识、Desktop 只显示 Goal 本体”的长期降级双轨。

## 15. 验收条件

1. Goal aggregate 无 `taskIds[]/noteIds[]`；
2. `TaskGoalLink.keyResultId` optional，contribution 存在时强制 KR；
3. Task owner 提供 Goal/KR reverse read query；
4. Goal <-> Note 使用共享 Relation，并支持多 Goal 复用同一 Note；
5. generic Relation 从 Goal package ownership 抽离；
6. Prisma 与 PowerSync relation parity；
7. Goal Workspace 能显示 Task/Knowledge context 与数量；
8. 全部写操作仍由各自 owner application port 执行；
9. Goal Detail 展示 context 但不复制 Task execution UI；
10. architecture locks 防止 Goal 重新持久化 external entity ID list。
