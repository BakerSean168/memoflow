# 仓储层不优雅问题分析与改造方案

> 归档说明：本文是前置问题分析，相关 server deepening 已完成并转入历史参考。

## Context

在对各模块仓储层做全面审查后，发现多处不一致和反模式。本文档列出所有问题，附带影响分析，供讨论改造方案。

---

## 问题清单

### P0: ScheduleTask 缺少子实体事务包裹

**现状**: `ScheduleTaskPrismaRepository.persist()` 循环 upsert 子实体 `ScheduleExecution`，但没有 `$transaction` 包裹。中间某条 execution 失败时，前面已提交的数据变成孤儿。

**文件**: `packages/schedule/src/infrastructure-server/adapters/prisma/schedule-task-prisma.repository.ts`

**对比**: Goal、Reminder、Notification 的 `persist()` 都有 `$transaction` 包裹。

**改造方案**:

- A. 在 `persist()` 内部加 `$transaction` 包裹（与 Goal/Reminder 一致）
- B. 使用仓储暴露的 `withTransaction()` 由调用方控制

选择：方案A

---

### P1: 错误处理模式不统一 — Result\<T\> vs throw

**现状**: governance 使用 `Promise<Result<T>>`，其余 7 个模块使用 `Promise<T>`（throw on error）。

**影响**: 调用方代码风格不一致。governance 的调用方不需要 try/catch，其他模块必须 try/catch 或信任框架。

**改造方案**:

- A. **全局迁移到 Result\<T\>** — 一致但代价高，而且会把基础设施错误分支扩散到所有 use case
- B. **保持现状，仅在新模块采用 Result\<T\>** — 渐进，但长期不一致
- C. **在 AggregateRepositoryBase 中统一 try/catch → Result\<T\>** — 不成立，基类只覆盖 `save()`，无法统一查询/批量/事务方法
- D. **Repository 统一 throw 结构化异常，Application Port / Use Case 边界统一 Result\<T\>** — 保留边界一致性，同时避免业务层被基础设施分支污染

选择：方案D

---

### P1: toPersistence() 接受的参数类型不统一

**现状**:

| 模块                           | toPersistence 接受                                     |
| ------------------------------ | ------------------------------------------------------ |
| Governance, Reminder, Schedule | 领域聚合根（内部调 `toServerDTO()`）                   |
| Task                           | ServerDTO（调用方先 `aggregate.toServerDTO()` 再传入） |

**影响**: 仓储层职责边界不一致。Task 的仓储需要额外一步 DTO 转换。

**改造方案**:

- A. 统一为接受聚合根（Mapper 内部调 `toServerDTO()`）
- B. 统一为接受 DTO（仓储层先转换）

推荐 A，因为 Mapper 作为持久化层适配器，应该了解领域对象的结构。

选择：方案A

---

### P1: toDate / parseJson 重复实现

**现状**: `toDate()` 函数至少在 3 处独立实现：

- `task/mappers/prisma-task-template-mapper.ts`（inline）
- `task/mappers/prisma-task-instance-mapper.ts`（inline）
- `governance/mapper-helpers.ts`（共享）

`parseJson` / `parseStringArray` / `parseRecord` 同样只在 governance 中共享。

**改造方案**:

- A. 提取到 `@memoflow/database` 包中作为共享工具（Prisma + PowerSync 都可用）
- B. 每个模块创建自己的 `mapper-helpers.ts`（复制 governance 的）
- C. 提取到 `@memoflow/utils` 中

推荐 A。`@memoflow/database` 是持久化相关的共享包，最适合放这些工具。

选择：方案A

---

### P2: 文件命名不一致

**现状**:

| 模块                                            | 文件名                                     | 接口名                                              |
| ----------------------------------------------- | ------------------------------------------ | --------------------------------------------------- |
| task, reminder, notification, schedule, setting | `ITaskTemplateRepository.ts`（PascalCase） | `ITaskTemplateRepository`                           |
| goal, governance, account                       | `i-goal-repository.ts`（kebab-case）       | `IGoalRepository`（接口名统一为 PascalCase I 前缀） |

**改造方案**:

- 统一为 `i-{name}.repository.ts`（kebab-case），接口名统一为 `I{Name}Repository`（PascalCase）
- governance 已经是这个规范

---

### P2: Notification 未继承 AggregateRepositoryBase

**现状**: `NotificationPrismaRepository` 手动在 `save()` 中内联事件发布逻辑，重复了基类功能。`saveMany()` 逐条调用 `save()` 没有批量事务。

**文件**: `packages/notification/src/infrastructure-server/adapters/prisma/notification-prisma.repository.ts`

**改造方案**:

- 继承 `AggregateRepositoryBase<T>`，移除内联事件发布
- `saveMany()` 改用 `$transaction` 批量处理

---

### P2: Task 内存中过滤 JSON 字段

**现状**: `findByGoalId()` 和 `findByTags()` 加载所有行后在 JS 内存中 `.filter()`。

```typescript
const data = await this.prisma.taskTemplate.findMany({
  where: { goalBinding: { not: null } },
});
return data
  .filter((d) => {
    const binding = JSON.parse(d.goalBinding || '{}');
    return binding.goalId === goalId; // 内存过滤
  })
  .map((d) => this.mapToEntity(d));
```

**影响**: 数据量大时性能问题。`goalBinding` 存为 JSON，数据库无法直接过滤。

**改造方案**:

- A. 将 `goalId` 提取为独立列（schema 变更 + 数据迁移）
- B. 使用 Prisma 的 `filter` 做数据库层 JSON 查询（SQLite/PostgreSQL 兼容性需验证）
- C. 保持现状，标记 `@todo` 待数据量增长后处理

选择：方案A

---

### P2: NotificationPreference 内联映射逻辑

**现状**: `serializePreference()` 和 `mapPrismaPreferenceToDomain()` 各 ~60 行嵌入在仓储文件中。

**文件**: `packages/notification/src/infrastructure-server/adapters/prisma/notification-preference-prisma.repository.ts`

**改造方案**: 提取为独立的 Mapper 类 `NotificationPreferencePrismaMapper`。

---

### P3: Account 的 `tx?: unknown` 参数

**现状**: `PrismaAccountRepository` 每个方法都带 `tx?: unknown` 参数。灵活性高但 `unknown` 类型不安全，且污染领域接口。

**文件**: `packages/account/src/domain-server/repositories/i-account-repository.ts`

**改造方案**:

- A. 改用 Schedule 的 `withTransaction()` 模式（推荐）
- B. 将 `tx` 类型改为 `Prisma.TransactionClient`（耦合 Prisma 但类型安全）

选择：方案A

---

### P3: 接口方法数量膨胀

**现状**: `ITaskTemplateRepository` 有 15-25 个方法，包含大量查询方法（`findTodayTasks`、`findOverdueTasks`、`findBlockedTasks` 等）。

**影响**: 接口违反 ISP（接口隔离原则）。PowerSync 实现需要同时实现所有查询方法，即使客户端不需要。

**改造方案**:

- A. 拆分为 `ITaskWriteRepository`（save/delete）+ `ITaskQueryRepository`（复杂查询）
- B. 保持现状，但通过注释标注哪些是服务端专用、哪些是客户端通用

选择：方案A

---

## 下一步

1. 团队讨论每个问题的改造方案
2. 确定优先级和执行顺序
3. 逐个创建独立的改造 PR
