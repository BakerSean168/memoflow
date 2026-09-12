---
tags:
  - analysis
  - label
  - vnext
  - current-system
description: Label vNext 当前系统地图——共享 Label registry、Goal/Task assignment、Prisma/PowerSync 与 ownership 漂移证据
created: 2026-09-09T00:00:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# Label vNext Current System Map

## 1. Executive conclusion

`@memoflow/label` 的产品方向正确：它应该是 identity-scoped Shared Label Registry，让 Goal/Task 等用户可分类实体复用同一套 `#工作 / #AI / #健康` 用户资产。

当前 registry 本身已经较成熟；第二轮需要修的是 **assignment ownership 漂移**：ADR-054 规定 Goal/Task 各自拥有 assignment，但当前 `LabelRepository`/`LabelService` 已直接认识 Goal/Task，并负责 GoalLabel/TaskLabel 查询、替换与 AND filter。

目标不是删除 Label package，而是把它纯化成：

```text
Label Registry = label identity/name/color only
Owner Domain   = assignment + owner query semantics
```

## 2. Current model

```text
Label
├── id
├── identityId
├── name
├── normalizedName
├── color?
└── timestamps

GoalLabel(identityId, goalId, labelId)
TaskLabel(identityId, taskPlanId, labelId)
```

数据库约束：

```text
unique(identityId, normalizedName)
```

Normalization：

```text
trim
NFKC
lowercase
```

## 3. Current good assets

### 3.1 Shared user asset

同一 identity 下 Goal/Task 可以共享一个 canonical Label row，不再维护各自 `tags: string[]`。

### 3.2 System Views 正确与 Label 分离

`Today / Upcoming / Completed / Active` 是 owner query 派生视图，不创建 Label row。

### 3.3 AI name resolution

`LabelService.resolveNames()` 允许 AI/workflow 提出人类可读 label name：

```text
["工作", "AI"]
```

服务负责 normalize、复用已有 label、并发 unique race 后 re-read。这个 adapter 很适合作为 AI → user taxonomy seam。

### 3.4 Prisma/PowerSync parity foundation

Label registry 与 assignment 已有 Prisma/PowerSync repository tests；identity ownership 与 foreign-label rejection 有覆盖。

## 4. Observed gaps

### LABEL-G1 — Label Repository 认识 Goal / Task

当前 `LabelRepository` 包含：

```text
replaceGoalLabels
replaceTaskLabels
listGoalLabels
listTaskLabels
listGoalLabelsByGoalIds
listTaskLabelsByTaskPlanIds
findGoalIdsMatchingAllLabels
findTaskPlanIdsMatchingAllLabels
```

Observed：共享 Registry 反向依赖具体 owner vocabulary。

Desired：

```text
LabelRegistryRepository
= create/update/delete/find/list/findByNormalizedNames

Goal repository/query
= GoalLabel assignment + goal label filtering

Task repository/query
= TaskLabel assignment + task label filtering
```

Impact：如果未来 Routine/Knowledge 接 Label，现设计会不断把 `setRoutineLabels / setKnowledgeLabels` 加进 Label，最终形成 God module。

### LABEL-G2 — Label contracts 包含 owner-specific commands

`@memoflow/contracts/label` 当前公开：

```text
GoalLabelAssignmentCommand
TaskLabelAssignmentCommand
```

这使 shared label contract 也认识业务 owner。

### LABEL-G3 — `resolveNames()` 全量列举最多 500 Label

当前每次 resolve 会 `list(identityId, limit: 500)` 再内存匹配。个人用户短期没问题，但 repository 能力更合适的是：

```text
findByNormalizedNames(identityId, names[])
```

### LABEL-G4 — 时间字段未对齐 Product Time

Label DTO/domain 仍使用裸 `number` 与 `Date.now()`，没有直接使用 `Instant / Clock`。

### LABEL-G5 — `color: string` 语义过宽

当前仅有长度上限，不限定 palette token 或 `#RRGGBB`。如果未来从 UI 输入，可能演化为任意 CSS-like string。

### LABEL-G6 — Delete semantics 需要显式 owner cleanup contract

当前数据库 cascade 可以清 assignment，但当 assignment ownership 回归 Goal/Task 后，应明确：

```text
Delete Label
→ registry deletes canonical label
→ DB FK cascade removes assignments
```

owner 不需要收到“业务状态变化”来补写另一份 truth，但 read model/cache invalidation 需要有明确策略。

## 5. Protected assets

第二轮不得破坏：

1. identity-scoped canonical Label registry；
2. `(identityId, normalizedName)` 唯一性；
3. trim + Unicode normalization + case-insensitive uniqueness；
4. Goal/Task 使用 `labelIds` / `labels[]` projection；
5. AND filter 语义；
6. System Views 与 user labels 分离；
7. AI `resolveNames` 的 replay-safe / concurrent-create-safe 行为；
8. Prisma/PowerSync parity；
9. foreign identity label 不允许 assignment。

## 6. Current → target mapping

| Current                                          | Target                                        |
| ------------------------------------------------ | --------------------------------------------- |
| `LabelRepository` owns registry + assignments    | `LabelRegistryRepository` only                |
| `LabelService.setGoalLabels/setTaskLabels`       | owner-domain assignment services/repositories |
| owner-specific label commands in label contracts | Goal/Task contracts own assignment mutation   |
| list first 500 then match                        | `findByNormalizedNames`                       |
| `createdAt/updatedAt: number`                    | `Instant`                                     |
| `Date.now()`                                     | injected `Clock`/now seam                     |
| `color: string`                                  | typed `LabelColor` policy                     |

## 7. Deliberately rejected generic polymorphic assignment

不采用：

```text
LabelAssignment(targetType, targetId, labelId)
```

作为统一万能表。

原因：

- FK 完整性下降；
- cascade ownership 模糊；
- owner-specific query/permission/filter 仍然存在；
- 容易退化成 generic relation bag。

目标仍是：

```text
GoalLabel
TaskLabel
RoutineLabel // only if Routine later has a real use case
```

共享的是 Label identity，不是 assignment table。

## 8. Evidence paths

- `docs/architecture/adr/ADR-054-shared-labels-and-system-views.md`
- `packages/label/src/domain/label.ts`
- `packages/label/src/domain/label-repository.ts`
- `packages/label/src/application/label-service.ts`
- `packages/label/src/infrastructure/{prisma,powersync}`
- `packages/contracts/src/modules/label/index.ts`
- `packages/database/prisma/schema/label.prisma`
- API/Desktop Label modules
- AI Goal/Task mutation adapters
