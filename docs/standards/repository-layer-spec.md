---
tags: [standard, infrastructure, repository]
---

# 仓储层开发规范

**版本**: 1.0
**适用范围**: `packages/{domain}/src/server/infrastructure/adapters/`（旧模块在收敛期间可能暂时保留 `src/infrastructure-server/`）
**读者**: 开发人员, AI 助手

## Repository-native Engineering Governance input

Engineering rules use `tools/governance/engineering-rules.json` and the semantic pin in
`tools/governance/pinned-engineering-rules.json`. The native adapter needs no Product UUIDs,
contracts, database, exporter or published Product snapshot. DDD-003 has explicit partial,
read-only package-boundary coverage; DDD-001/002/004/005 remain visible and non-enforcing.
`autofix-proposal` emits review-required guidance without applying changes.

```bash
node tools/governance/engineering-rule-source-audit.mjs --check
node tools/governance/engineering-input-dependency-audit.mjs
node tools/governance/engineering-rule-adapter.mjs --source tools/governance/engineering-rules.json --mode check
node tools/governance/engineering-rule-adapter.mjs --source tools/governance/engineering-rules.json --mode report
node tools/governance/engineering-rule-adapter.mjs --source tools/governance/engineering-rules.json --mode autofix-proposal
```

ADR-113 remains Proposed. AGENT.md Governance-first policy and Product presence guards remain
active. The real-owner vertical slice policy is a proposal only; GOV-7903 remains blocked.

## 1. 核心职责

仓储层是领域模型与持久化技术之间的适配器。它将领域对象的生命周期管理委托给数据库（Prisma / PowerSync），同时向应用层暴露与技术无关的接口。

## 2. 架构位置

```text
server/application  →  server/domain (IGoalRepository 接口)
                           ↑
server/infrastructure (GoalPrismaRepository 实现)
```

- 接口定义在 `server/domain/repositories/`（领域层决定"需要什么"）
- 实现在 `server/infrastructure/adapters/`（基础设施层决定"怎么实现"）

---

## 3. 优秀范式（已验证）

### 3.1 AggregateRepositoryBase — 模板方法

聚合根仓储应继承 `AggregateRepositoryBase<T>`（来自 `@memoflow/patterns`）。

**机制**: `save()` 作为模板方法，先调 `persist()`（子类实现），再自动 `publishDomainEvents()`。

- 参考实现: [TaskTemplatePrismaRepository](../../../packages/task/src/server/infrastructure/adapters/prisma/task-template-prisma.repository.ts)
- 参考实现: [GoalPrismaRepository](../../../packages/goal/src/server/infrastructure/adapters/prisma/goal-prisma.repository.ts)

### 3.2 结构化异常 + 边界 Result（推荐）

The Rule/RuleRevision snippets and Product links below are retained historical compatibility
examples, not native Engineering inputs. Surviving owner evidence includes
[GoalPrismaRepository](../../../packages/goal/src/server/infrastructure/adapters/prisma/goal-prisma.repository.ts)
and [Goal composition root](../../../packages/goal/src/server/infrastructure/goal.module.ts).
The same domain/adapter boundaries apply to real owner implementations.

仓储方法应返回普通的 `Promise<T>` / `Promise<T | null>` / `Promise<void>`。
仓储内部可以 `try/catch`，但失败时应抛出**结构化异常**，而不是返回 `Result<T>`。

`Result<T>` 的统一边界应放在 module `api`、controller 或 use case 外层，由边界层负责把 throw 转成 `fail(...)`。

**规范写法**（仓储层）:

```typescript
async findById(id: RuleId): Promise<Rule | null> {
  try {
    const row = await this.prisma.rule.findUnique({ where: { id } });
    return row ? RulePrismaMapper.toDomain(row) : null;
  } catch (err) {
    throw toResultErrorException(
      mapInfraErrorToResultError(err, 'Failed to find rule by ID'),
    );
  }
}
```

**规范写法**（应用边界）:

```typescript
async execute(req: GetRuleReq): Promise<Result<GetRuleRes>> {
  return resultify(async () => {
    const rule = await this.ruleRepository.findById(req.id);
    if (!rule) {
      throw toResultErrorException({ code: 'NOT_FOUND', message: 'Rule not found' }, 404);
    }
    return rule.toClientDTO();
  }, 'Failed to get rule');
}
```

- 参考实现: [RulePrismaRepository](../../../packages/governance/src/server/infrastructure/adapters/prisma/rule-prisma.repository.ts)
- 参考实现: [createScheduleModule](../../../packages/schedule/src/server/infrastructure/schedule.module.ts)
- 共享工具: [resultify](../../../packages/utils/src/result/resultify.ts)

### 3.3 Mapper 静态类

每个持久化技术（Prisma / PowerSync）为每个实体/聚合根提供一个静态 Mapper 类，方法：`toDomain(raw)` / `toPersistence(entity)` / `toDomainMany(rows[])`。

**规范写法**:

```typescript
export class RulePrismaMapper {
  static toDomain(raw: PrismaRule): Rule {
    /* 反序列化 + 重建值对象 */
  }
  static toPersistence(rule: Rule): Omit<PrismaRule, 'createdAt' | 'updatedAt'> {
    /* 序列化 */
  }
  static toDomainMany(raws: PrismaRule[]): Rule[] {
    return raws.map((r) => this.toDomain(r));
  }
}
```

- 参考实现: [RulePrismaMapper](../../../packages/governance/src/server/infrastructure/adapters/prisma/mappers/rule-prisma.mapper.ts)
- 参考实现: [PowerSyncRuleMapper](../../../packages/governance/src/server/infrastructure/adapters/powersync/mappers/powersync-rule.mapper.ts)

### 3.4 Mapper 共享工具

防御性解析（JSON、Date、SQL 转义）应集中在 `adapters/mapper-helpers.ts`，Prisma 和 PowerSync 的映射器复用同一套工具。

- 参考实现: [mapper-helpers.ts](../../../packages/governance/src/server/infrastructure/adapters/mapper-helpers.ts)

### 3.5 多表聚合同步（事务内 delete-removed + upsert）

子实体应包裹在 `$transaction` 中，同步策略：删除已移除的子实体 + upsert 当前子实体。

**规范写法**（参考 Goal）:

```typescript
protected async persist(goal: Goal): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    await tx.goal.upsert({...});
    // 1. 删除已移除的子实体
    await tx.keyResult.deleteMany({ where: { goalId: id, id: { notIn: currentIds } } });
    // 2. Upsert 当前子实体
    for (const kr of dto.keyResults) {
      await tx.keyResult.upsert({...});
    }
  });
}
```

- 参考实现: [GoalPrismaRepository.persist()](../../../packages/goal/src/server/infrastructure/adapters/prisma/goal-prisma.repository.ts)

### 3.6 跨实体原子保存（saveWithXxx）

当一个操作需要同时持久化多个实体时，提供 `saveWithXxx()` 方法，在单个 `$transaction` 中完成。

- 参考实现: [RulePrismaRepository.saveWithRevision()](../../../packages/governance/src/server/infrastructure/adapters/prisma/rule-prisma.repository.ts)

### 3.7 事务控制封装（withTransaction）

仓储接口暴露 `withTransaction(fn)` 方法，创建包装了事务客户端的新仓储实例。调用方自行决定是否需要事务。

- 参考实现: [ScheduleTaskPrismaRepository.withTransaction()](../../../packages/schedule/src/server/infrastructure/adapters/prisma/schedule-task-prisma.repository.ts)

### 3.8 组合根（Composition Root）

每个模块的 `server/infrastructure/` 提供 `create<Module>Module(dependencies)` 工厂函数作为组合根。依赖通过构造函数注入，不使用 Service Locator / DI 容器。

**规范结构**:

```typescript
export interface GovernanceModuleDependencies {
  readonly ruleRepository: IGoalRepository;
  readonly revisionRepository: IRuleRevisionRepository;
  readonly runtimeAdapters?: GovernanceRuntimeAdaptersInput;
}

export function createGovernanceModule(deps: GovernanceModuleDependencies): GovernanceModuleInstance {
  const api: GovernanceApplicationPort = { /* 委托给 useCases */ };
  return { api, start(), dispose() };
}
```

- 参考实现: [governance.module.ts](../../../packages/governance/src/server/infrastructure/governance.module.ts)

### 3.9 PowerSync 适配器 — SQL 提取复用

在 PowerSync 实现中，共享的 SQL 逻辑应提取为私有方法，避免 `save()` 和 `saveWithXxx()` 之间的重复。

- 参考实现: [PowerSyncRuleRepository._upsertRule()](../../../packages/governance/src/server/infrastructure/adapters/powersync/rule-powersync.repository.ts)

---

## 4. 命名规范

| 元素      | 规范                     | 示例                                              |
| --------- | ------------------------ | ------------------------------------------------- |
| 仓储接口  | `I{Name}Repository`      | `IGoalRepository`                                 |
| 仓储实现  | `{Name}{Tech}Repository` | `RulePrismaRepository`, `PowerSyncRuleRepository` |
| Mapper 类 | `{Name}{Tech}Mapper`     | `RulePrismaMapper`, `PowerSyncRuleMapper`         |
| 文件名    | `kebab-case`             | `rule-prisma.repository.ts`                       |
| 接口文件  | `i-{name}.repository.ts` | `i-rule-repository.ts`                            |

## 5. 注释规范

- 所有文件使用**中英双语 JSDoc**（English first, 中文 second）
- 公开方法必须有 `@param` / `@returns` 标注
- 具体实现类标记 `@internal`（消费方应使用接口）
- 遗留代码标记 `@deprecated` 并指向替代方案

## 6. 文件夹结构

```text
server/infrastructure/
  adapters/
    mapper-helpers.ts           ← 共享解析工具
    prisma/
      index.ts                  ← barrel export
      <entity>-prisma.repository.ts
      mappers/
        index.ts
        <entity>-prisma.mapper.ts
    powersync/
      index.ts
      <entity>-powersync.repository.ts
      mappers/
        index.ts
        <entity>-powersync.mapper.ts
  runtime/
    module-runtime.ts           ← runtime adapter seam
    <module>-event-log.runtime.ts
  <module>.module.ts            ← 规范化组合根
  prisma.ts                     ← Prisma 便捷组合根（可选）
  powersync.ts                  ← PowerSync 便捷组合根（可选）
  index.ts                      ← barrel export
```
