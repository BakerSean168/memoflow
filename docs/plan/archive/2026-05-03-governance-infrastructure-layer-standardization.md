# Governance Infrastructure Layer — 注释标准化计划

## Context

`governance` 包的 `infrastructure-server` 和 `infrastructure-client` 是整个 monorepo 的参考模块（gold standard）。PowerSync 适配器已经有非常好的中英双语注释，但 Prisma 适配器、组合根、barrel 文件等注释质量不一致。本次优化目标：

1. 将所有 infrastructure 文件的注释统一到 PowerSync 适配器的同等质量
2. 每个文件补充：中英双语 JSDoc、`@param`/`@returns`、架构模式说明、`@internal`/`@deprecated` 标签
3. 其他业务模块以后可直接参考 governance 的写法

## 范围

18 个文件（infrastructure-server 11 个 + infrastructure-client 7 个），仅修改注释，不改逻辑。

## 详细变更清单

### Phase 1: Prisma 适配器（4 文件，最大差距）

| #   | 文件                                                                           | 当前状态                             | 变更内容                                                                                                            |
| --- | ------------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 1   | `infrastructure-server/adapters/prisma/rule-prisma.repository.ts`              | 英文短 JSDoc，无 `@param`/`@returns` | 升级为中英双语；每个方法加 `@param`/`@returns`；补充 upsert 逻辑、事务、过滤语义说明；说明 `Result<T>` 错误处理模式 |
| 2   | `infrastructure-server/adapters/prisma/rule-revision-prisma.repository.ts`     | 同上                                 | 同上；补充 append-only 审计日志说明                                                                                 |
| 3   | `infrastructure-server/adapters/prisma/mappers/rule-prisma.mapper.ts`          | 中文 JSDoc，缺 `@param`/`@returns`   | 转为中英双语；补充 `@param`/`@returns`；说明 `Rule.load()` 重建模式、SQLite JSON 序列化策略                         |
| 4   | `infrastructure-server/adapters/prisma/mappers/rule-revision-prisma.mapper.ts` | 中文 JSDoc，缺 `@param`/`@returns`   | 补充 `@param`/`@returns`；说明 Set → 数组序列化                                                                     |

### Phase 2: Barrel 文件（4 文件）

| #   | 文件                                                     | 变更内容                                                |
| --- | -------------------------------------------------------- | ------------------------------------------------------- |
| 5   | `infrastructure-server/index.ts`                         | 补充文件夹结构示意图注释；说明 barrel export 的组织原则 |
| 6   | `infrastructure-server/adapters/prisma/index.ts`         | 补充中英双语 JSDoc；加 `@internal` 标签                 |
| 7   | `infrastructure-server/adapters/prisma/mappers/index.ts` | 补充中英双语 JSDoc；加 `@internal` 标签                 |
| 8   | `infrastructure-server/adapters/powersync/index.ts`      | 补充 `@internal` 标签                                   |

### Phase 3: Client 适配器（5 文件）

| #   | 文件                                                       | 变更内容                                            |
| --- | ---------------------------------------------------------- | --------------------------------------------------- |
| 9   | `infrastructure-client/index.ts`                           | 补充架构上下文（客户端基础设施的职责）              |
| 10  | `infrastructure-client/adapters/types.ts`                  | 补充依赖倒置模式说明                                |
| 11  | `infrastructure-client/adapters/http/index.ts`             | 补充工厂聚合模式说明；中英双语                      |
| 12  | `infrastructure-client/adapters/http/rule-http.adapter.ts` | 加 `@param`/`@returns`；说明 URL 构造模式和错误委托 |
| 13  | `infrastructure-client/adapters/ipc/index.ts`              | 补充工厂聚合模式说明；中英双语                      |
| 14  | `infrastructure-client/adapters/ipc/rule-ipc.adapter.ts`   | 加 `@param`/`@returns`；说明 channel 命名模式       |

### Phase 4: 其他（2 文件）

| #   | 文件                                               | 变更内容                                                                              |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 15  | `infrastructure-server/powersync.ts`               | 当前仅 3 行；补充架构上下文（Electron 专用组合根、如何包装 `createGovernanceModule`） |
| 16  | `infrastructure-server/di/governance-container.ts` | 已有 `@deprecated`，无需变更                                                          |

### 跳过（已达标）

- `infrastructure-server/adapters/mapper-helpers.ts` — 已有完善的中英双语注释
- `infrastructure-server/adapters/powersync/rule-powersync.repository.ts` — 已有完善的中英双语注释
- `infrastructure-server/adapters/powersync/rule-revision-powersync.repository.ts` — 已有完善的中英双语注释
- `infrastructure-server/adapters/powersync/mappers/powersync-rule.mapper.ts` — 已有完善的中英双语注释
- `infrastructure-server/adapters/powersync/mappers/powersync-rule-revision.mapper.ts` — 已有完善的中英双语注释
- `infrastructure-server/adapters/powersync/mappers/index.ts` — 已达标
- `infrastructure-server/governance.module.ts` — 已有 "living documentation" 注释，仅需微调
- `infrastructure-client/adapters/index.ts` — 已达标

## 验证

变更后运行：

```bash
pnpm nx run governance:lint
pnpm nx run governance:typecheck
```

仅改注释，不改逻辑，测试不受影响。

## 执行顺序

1. Prisma 适配器（4 文件 — 差距最大）
2. Barrel 文件（4 文件）
3. Client 适配器（5 文件）
4. `powersync.ts` 组合根（1 文件）
5. 验证：lint + typecheck
