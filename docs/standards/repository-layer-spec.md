---
tags: [standard, infrastructure, repository]
updated: 2026-10-03T10:30:00+09:00
---

# 仓储层开发规范

**版本**: 1.1

**适用范围**: `packages/{domain}/src/server/infrastructure/adapters/`
**读者**: 开发人员、AI 助手

本规范由 repository-native Engineering Governance 维护。ADR-113 已退休 Product Governance Runtime；所有示例必须来自真实业务 owner。

## Engineering Governance input

```bash
node tools/governance/engineering-rule-source-audit.mjs --check
node tools/governance/engineering-input-dependency-audit.mjs
node tools/governance/engineering-rule-adapter.mjs --source tools/governance/engineering-rules.json --mode check
pnpm nx run memoflow:governance-check
```

## 1. 核心职责

仓储层是领域模型与持久化技术之间的 adapter。领域层定义所需 Port，Infrastructure 决定 Prisma / PowerSync 等具体实现。

```text
server/application -> server/domain (IGoalRepository)
                           ^
server/infrastructure/adapters (GoalPrismaRepository / GoalPowerSyncRepository)
```

- Port 定义在 `server/domain/repositories/`；
- concrete adapter 位于 `server/infrastructure/adapters/`；
- application/domain 不能直接依赖 Prisma concrete types；
- transport 不负责构造 repository。

## 2. 已验证模式

### 2.1 AggregateRepositoryBase

需要领域事件发布语义的聚合仓储继承 `AggregateRepositoryBase<T>`，由 base class 统一处理 persist 后的 event publication。

真实 owner：

- [GoalPrismaRepository](../../../packages/goal/src/server/infrastructure/adapters/prisma/goal-prisma.repository.ts)
- [TaskPlanPrismaRepository](../../../packages/task/src/server/infrastructure/adapters/prisma/task-plan-prisma.repository.ts)

### 2.2 结构化异常 + Result 边界

仓储接口返回领域值或抛出结构化 infrastructure/domain error；不要让 persistence adapter 自行发明 HTTP/IPC 失败语义。

```typescript
async findById(id: GoalId): Promise<Goal | null> {
  const row = await this.prisma.goal.findUnique({ where: { id } });
  return row ? this.toDomain(row) : null;
}
```

`Result<T>` / public failure mapping 放在 application/transport boundary。

参考：

- [GoalPrismaRepository](../../../packages/goal/src/server/infrastructure/adapters/prisma/goal-prisma.repository.ts)
- [Goal module composition](../../../packages/goal/src/server/infrastructure/goal.module.ts)
- [resultify](../../../packages/utils/src/result/resultify.ts)

### 2.3 Mapper

Prisma / PowerSync adapter 各自拥有 mapper；mapper 只转换 persistence representation 与 domain/read-model representation，不拥有业务流程。

真实 owner：

- [PrismaGoalMapper](../../../packages/goal/src/server/infrastructure/adapters/prisma/mappers/prisma-goal-mapper.ts)
- [PowerSyncGoalMapper](../../../packages/goal/src/server/infrastructure/adapters/powersync/mappers/powersync-goal.mapper.ts)
- [PrismaTaskPlanMapper](../../../packages/task/src/server/infrastructure/adapters/prisma/mappers/prisma-task-plan-mapper.ts)
- [PowerSyncTaskPlanMapper](../../../packages/task/src/server/infrastructure/adapters/powersync/mappers/powersync-task-plan.mapper.ts)

重复的 parse/normalization 逻辑只在语义相同后抽取；不要为了“统一”合并 persistence 语义不同的 mapper。

### 2.4 多表原子写入

需要同步 aggregate + children/outbox/related records 时，事务 owner 必须显式。

真实 owner：

- [Prisma Goal write transaction runner](../../../packages/goal/src/server/infrastructure/adapters/prisma/prisma-goal-write-transaction-runner.ts)
- [Prisma Task write transaction runner](../../../packages/task/src/server/infrastructure/adapters/prisma/prisma-task-write-transaction-runner.ts)
- [PowerSync Goal write transaction runner](../../../packages/goal/src/server/infrastructure/adapters/powersync/powersync-goal-write-transaction-runner.ts)
- [PowerSync Task write transaction runner](../../../packages/task/src/server/infrastructure/adapters/powersync/powersync-task-write-transaction-runner.ts)

不要把跨 repository 原子性隐藏在任意一个 repository 的私有约定里；由明确 transaction runner / unit-of-work owner 表达。

### 2.5 Composition Root

每个真实 feature 的 `server/infrastructure/<module>.module.ts` 负责组装 transport-neutral application port 和 runtime lifecycle。

```typescript
export interface GoalModuleDependencies {
  readonly goalRepository: IGoalRepository;
  readonly goalRecordRepository: IGoalRecordRepository;
  readonly goalWriteTransactionRunner: GoalWriteTransactionRunner;
  readonly goalDeletionTransactionRunner: GoalDeletionTransactionRunner;
  readonly taskBindingReadPort: GoalDependencyReadPort;
  readonly userTimeContextPort: UserTimeContextPort;
}

export function createGoalModule(deps: GoalModuleDependencies): GoalModuleInstance {
  // assemble use cases + api + start/dispose
}
```

参考：

- [Goal module](../../../packages/goal/src/server/infrastructure/goal.module.ts)
- [Task module](../../../packages/task/src/server/infrastructure/task.module.ts)

Host 的 API/Desktop runtime composer 选择 Prisma/PowerSync concrete adapter；package transport module 只负责 transport + lifecycle registration。

### 2.6 PowerSync parity

需要 Web/Prisma 与 Desktop/PowerSync parity 的业务能力，应通过共享 contract + owner-specific characterization tests 验证语义等价，而不是要求两端实现逐行相同。

参考：

- [Goal PowerSync repository](../../../packages/goal/src/server/infrastructure/adapters/powersync/goal-powersync.repository.ts)
- [Task Plan PowerSync repository](../../../packages/task/src/server/infrastructure/adapters/powersync/task-plan-powersync.repository.ts)

## 3. 命名规范

| 元素 | 规范 | 示例 |
| --- | --- | --- |
| 仓储接口 | `I{Name}Repository` | `IGoalRepository` |
| Prisma 实现 | `{Name}PrismaRepository` | `GoalPrismaRepository` |
| PowerSync 实现 | `{Name}PowerSyncRepository` | `GoalPowerSyncRepository` |
| Prisma Mapper | `Prisma{Name}Mapper` | `PrismaGoalMapper` |
| PowerSync Mapper | `PowerSync{Name}Mapper` | `PowerSyncGoalMapper` |
| 文件名 | kebab-case | `goal-prisma.repository.ts` |

以当前 owner package 的既有命名为准；不要只为形式统一做无收益 rename。

## 4. 边界约束

- `server/domain` 与 `server/application` 禁止依赖 `@memoflow/database` / `@prisma/client` concrete implementation；
- concrete persistence imports 只进入 infrastructure、host runtime composer 或 tests；
- package public surface 暴露必要 Port / factory，不暴露 concrete adapter class；
- 不恢复 `domain-server`、`application-server`、`infrastructure-server` 等旧分裂目录；
- cross-feature persistence 必须通过明确 owner Port/read model/transaction contract，而不是直接跨 package 访问对方表。

## 5. 文件结构

```text
server/infrastructure/
  adapters/
    prisma/
      <entity>-prisma.repository.ts
      mappers/
    powersync/
      <entity>-powersync.repository.ts
      mappers/
  runtime/
  <module>.module.ts
  prisma.ts
  powersync.ts
  index.ts
```

真实模块允许因领域复杂度增加 transaction runners、outbox adapters、read ports 等，但 owner 与依赖方向必须明确。

## 6. 验证

Repository architecture 变化至少运行：

```bash
node tools/governance/package-internal-boundary-audit.mjs
node tools/governance/server-feature-shape-audit.mjs
pnpm nx run memoflow:governance-check
```

并补对应 owner package 的 typecheck / test；如果同时修改 Prisma / PowerSync，则两条 runtime lane 都要验证。
