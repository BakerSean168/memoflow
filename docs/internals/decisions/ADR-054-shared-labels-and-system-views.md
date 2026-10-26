---
tags:
  - adr
  - labels
  - goal
  - task
  - filtering
  - taxonomy
description: Shared Label Registry、Goal/Task 标签关联与系统派生视图分离决策
created: 2026-08-25T14:28:00+08:00
updated: 2026-09-09T00:30:00+08:00
---

# ADR-054: Shared Labels 与 System Views 分离

> **2026-09-09 第二轮收敛：** Shared Label registry、normalized uniqueness、System Views 分离与 Goal/Task 用户路径继续有效；当前实现中 LabelRepository/LabelService 反向拥有 Goal/Task assignment 的 ownership 漂移由 ADR-102/103 修正。

**状态：** 已采纳并实施
**日期：** 2026-08-25  
**影响范围：** Goal、Task、contracts、database、shared UI、query/filter  
**关联：** ADR-053

## 2026-09-08 实现状态

Shared Label 已成为 Goal/Task 唯一用户分类真值：identity-scoped Label registry + GoalLabel/TaskLabel assignment，客户端读取 `labels[]`、写入 `labelIds`，AND 过滤使用 `labelIdsAll`。Task 旧 `tags/color` 已通过 fail-closed、可重放迁移转入 Label/TaskLabel 后删除；Web/Desktop/Mobile/AI 均已切到同一语义。

## 1. 背景

当前 MemoFlow 同时存在：

- Goal `category`；
- Goal `tags: string[]`；
- GoalFolder；
- Task `tags: string[]`；
- TaskFolder；
- Goal/Task 自己的状态筛选。

这些概念存在明显重叠。对于个人产品，Goal 数量有限，没有必要同时维护 folder + category + tags；TaskFolder 在当前 Web 主路径中也已经近乎失去产品入口。

与此同时，系统状态与用户分类不是同一种事实：

- “进行中 / 已完成 / 今天 / 即将到来”由业务状态或日期派生；
- “工作 / 个人 / AI / 健康 / 二课”由用户定义。

若把两者都塞成 tag，会造成多份事实和失效同步。

## 2. 决策

### 2.1 使用一等 Shared Label

Goal 与 Task 共享同一个 identity-scoped Label registry：

```text
Label
- id
- identityId
- name
- normalizedName
- color?
- createdAt
- updatedAt
```

约束：

```text
unique(identityId, normalizedName)
```

推荐 normalize：

- trim；
- Unicode normalization；
- case-insensitive uniqueness（展示保留用户原始大小写）；
- 不把空格强制转换为 `-`，除非产品最终明确选择 slug UX。

Label 是用户可见资产，而不是 Goal/Task 内部字符串数组。

### 2.2 Assignment 由目标模块拥有

数据关系：

```text
GoalLabel(goalId, labelId, identityId)
TaskLabel(taskDefinitionId/templateId, labelId, identityId)
```

Label registry 只拥有 label identity / name / color；Goal 与 Task 各自拥有“这个对象贴了哪些 label”的业务关系。

不让 Label 模块反向拥有 Goal/Task repository。

### 2.3 退役旧组织结构

实施后删除：

```text
Goal.category
Goal.tags string[]
Goal.folderId
GoalFolder
Task.tags string/JSON
Task.folderId
TaskFolder
```

客户端 DTO 统一返回轻量 `labels[]` projection。

### 2.4 System View 不是 Label

采用 Super Productivity `TODAY_TAG` pattern 的核心思想，但在 MemoFlow 中更进一步：系统视图不伪装成用户 label。

Goal system views：

```text
Active
Completed
All
```

可选历史/隐藏入口：

```text
Archived
Abandoned
```

Task system views：

```text
Today
Upcoming
All
Completed
```

这些视图通过 status/date query 计算，不创建 Label row，不把诸如 `TODAY`、`ACTIVE` 写进 assignment table。

## 3. Label 交互

### 3.1 创建时即时创建

参考 Vikunja：用户在 Goal/Task 的 label picker 中可以：

1. 搜索已有 label；
2. 多选；
3. 输入不存在的名称时直接 `Create "..."`；
4. 创建后立即选中。

不要求先进入独立“标签管理页”再回来创建 Goal/Task。

标签管理页可以存在，但属于低频设置能力。

### 3.2 多标签筛选默认 AND

Goal 主页面多选 label 时采用：

```text
selected = [工作, AI]

match(goal) = has(工作) AND has(AI)
```

原因：用户说“工作 + AI”时通常是在缩窄范围；OR 会随着多选增加结果，反直觉。

服务端 query 明确支持：

```text
labelIdsAll[]
```

而不是含义模糊的：

```text
labels[]
```

如果未来确有 OR 场景，再增加 `labelIdsAny[]`，不让一个字段拥有两种隐式语义。

### 3.3 Task 可复用相同筛选控件

Task 主页面同样支持多选 AND label filter，但仍可叠加系统视图：

```text
Today AND #二课 AND #报名
```

系统视图和 label filter 是正交维度。

## 4. Query / SQL 语义

AND labels 的关系型查询必须保证命中全部选中 label，而不是普通 `IN` 后误变成 OR。

推荐语义等价于：

```sql
WHERE goal_label.label_id IN (...selected...)
GROUP BY goal_id
HAVING COUNT(DISTINCT goal_label.label_id) = selected_count
```

具体 Prisma/PowerSync adapter 可以选择更合适的实现，但行为测试必须固定“全部命中”。

## 5. API 建议

最小 Label API：

```text
GET    /labels?q=
POST   /labels
PATCH  /labels/:id
DELETE /labels/:id
```

Goal / Task assignment 最好通过各自 mutation contract 原子更新，不要求 UI 串行：

```text
PATCH Goal labels
PATCH Task labels
```

创建 Goal/Task 时允许提交：

```text
labelIds[]
```

若 UI 需要“创建新 Label + 创建 Goal”原子完成，可由 app/application orchestration 先 resolve labels，再提交业务 mutation；不要让 Goal domain 创建 Label aggregate。

## 6. Color 决策

Color 属于 Label，而不是 Goal/Task 的第二套分类颜色。

列表中可通过 label chip 表达视觉分类。Goal/Task 自定义边框颜色在 vNext 退役，避免：

```text
Goal color
Task color
Label color
```

三套颜色同时承担分类。

## 7. 外部参考

### Vikunja

- Label 是跨 Project 的一等实体；
- task detail 中可搜索已有 label 或即时创建；
- label 可参与 filters / saved filters；
- backend Task 返回 labels projection，assignment 通过独立关系维护。

借鉴：first-class registry、inline create、跨上下文复用。

### Tasks.org

- filter 由多个 criteria 组成；
- criteria 可用 AND / NOT / OR；
- 主任务体验与复杂 filter builder 分离。

借鉴：简单默认 + 高级组合能力分层。MemoFlow v1 主界面只实现系统视图 + Label AND，不先建设完整 DSL。

### Super Productivity

- `TODAY_TAG` 是 virtual/system membership，不进入普通 `task.tagIds`；
- Today membership 由日期字段计算。

借鉴：系统派生视图与用户标签保持单一事实源。

## 8. License / 复用边界

Vikunja 为 AGPL-3.0-or-later，Tasks.org 为 GPLv3；MemoFlow 当前仓库未声明可据此直接复制代码的许可证策略。

因此：

- 可以借鉴交互、领域思想、query semantics；
- 不直接复制 AGPL/GPL implementation source；
- 若未来真正复用 source/component，必须先完成 license compatibility 决策。

Super Productivity 为 MIT，可在保留 license/notice 且符合项目许可策略的前提下评估小型实现复用；仍优先复用 MemoFlow 已有 shadcn primitives 与本项目架构。

## 9. 验收标准

- Goal/Task 创建都可搜索并即时创建 Label；
- 同一 identity 下同名 label 不重复；
- Goal/Task 可共享同一个 `#工作` label；
- Goal 选择 `#工作 + #AI` 时只返回同时具有两者的 Goal；
- `Active/Completed/Today/Upcoming` 不存在对应 Label row；
- 删除 GoalFolder/TaskFolder/category/string tags 后没有隐藏兼容双轨；
- Web/Desktop/PowerSync 对 Label 过滤语义一致。
