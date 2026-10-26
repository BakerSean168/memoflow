---
tags:
  - standard
  - contract
  - packages-contracts
description: contracts 模块的 boundary-first 开发规范
created: 2026-02-03T00:00:00
updated: 2026-08-17T00:00:00+09:00
---

# Contracts 模块开发规范

适用范围：`packages/contracts`

`packages/contracts` 是 MemoFlow 的**跨边界契约中心**，不是所有 TypeScript 类型、领域实体和实现接口的
绝对注册中心。本文实现 ADR-049，并取代 ADR-017 所定义的 absolute type centralization。

## 1. 核心原则

### 1.1 Boundary-first

只有需要跨以下边界稳定复用的类型才进入 contracts：

- app/process：API、Web、Desktop、worker；
- transport：HTTP、IPC、SSE；
- package public application/client port；
- durable event/message/receipt；
- serialization/language boundary；
- OpenAPI/RPC schema；
- public snapshot/query response。

“Domain 和 Infrastructure 都会用”不自动构成进入 contracts 的理由。内部共享应优先由 owning feature
定义 port/type，并保持依赖方向。

### 1.2 Schema 与类型单一来源

需要 runtime validation 的边界契约必须以一个 schema object 为真值，并从 schema 推导 TypeScript type。
禁止 schema、interface、RPC map 和 OpenAPI request 各自维护平行 shape。

### 1.3 Contract 只表达可传输语义

contracts 不包含：

- 业务方法实现；
- framework/runtime/container wiring；
- Error instance、stack、cause；
- provider/Prisma row；
- logger/trace implementation；
- UI component props；
- feature-private repository type；
- 仅供 domain class `implements` 的数据接口。

### 1.4 Domain model 与 contract 通过 mapper 连接

Domain aggregate/entity 是业务不变量的 source of truth。Contract 是边界投影。

推荐：

```text
CreateTaskSchema -> CreateTaskCommand
Task aggregate -> toTaskSnapshot() -> TaskSnapshot
TaskDomainFault -> mapTaskFaultToFailure() -> TaskFailure
```

禁止让 domain class 因为网络 DTO 而实现 contracts interface。

## 2. Contracts 中允许的类型

| 类型                             | 是否进入 contracts | 示例                      |
| -------------------------------- | ------------------ | ------------------------- |
| API command/query schema         | 是                 | `CreateTaskSchema`        |
| response snapshot                | 是                 | `TaskSnapshot`            |
| public operation outcome         | 是                 | `SignInOutcome`           |
| public failure code/schema       | 是                 | `AuthFailure`             |
| RPC map / HTTP canonical input   | 是                 | `TaskRpcMap`              |
| durable domain event payload     | 是                 | `task:completed@v1`       |
| reliable receipt/timeline schema | 是                 | `OperationReceipt`        |
| shared serialization primitive   | 是                 | `YmdString`、`JsonValue`  |
| domain aggregate class/interface | 否                 | `Task` aggregate          |
| domain fault                     | 否                 | `TaskHierarchyCycle`      |
| repository row/Prisma type       | 否                 | `Prisma.TaskGetPayload`   |
| provider SDK error               | 否                 | BetterAuth/GitHub errors  |
| application-internal helper      | 否                 | local orchestration state |
| component props                  | 否                 | Vue props                 |
| diagnostic cause                 | 否                 | stack/provider response   |

## 3. 推荐目录

新模块优先采用：

```text
modules/{feature}/
├── api/
│   ├── commands.ts
│   ├── queries.ts
│   ├── snapshots.ts
│   └── schemas.ts
├── events/
│   └── *.event.ts
├── failures.ts
├── outcomes.ts
├── protocol/
│   ├── {feature}-event-map.ts
│   └── {feature}-rpc-map.ts
├── primitives/
└── index.ts
```

当前已有 `aggregates/`、`entities/`、`value-objects/` 目录不要求一次性删除，但新增类型前必须判断它是
wire snapshot 还是 domain model：

- wire snapshot：重命名/迁移到 `api/snapshots` 或明确的 transfer 目录；
- domain model：迁回 owning feature；
- shared serialization primitive：保留在 contracts/shared/primitives；
- legacy：登记 owner 和退役条件。

## 4. API 规则

- command/query request 必须有 schema；
- response data 使用 snapshot，不暴露 domain class；
- `identityId`、actor、trace、request metadata 由 ExecutionContext 提供，不进入 public mutation body；
- path/query/body 组合使用命名 schema/projector；
- 时间、ID、nullable、enum 使用明确 transfer representation；
- 不引用 `protocol`，避免反向依赖；
- 不内联复杂匿名 response。

## 5. Outcome 与 Failure 规则

详细规范见
[`failure-and-outcome-contracts.md`](./failure-and-outcome-contracts.md)。最低要求：

- normal alternate state 使用 `*Outcome` union；
- public failure 使用 feature-owned code union；
- shared result 只拥有 generic category/envelope；
- public failure JSON-safe；
- provider code/message 不进入 contracts；
- HTTP status 不进入 failure contract；
- code 必须有 registry、schema、transport/i18n coverage。

## 6. Protocol 规则

### RPC map

- key 使用 `'feature:kebab-case-operation'`；
- 参数/返回类型从 `../api`、`../outcomes`、`../failures` 导入；
- 禁止在 map 中内联复杂 object；
- HTTP/IPC 使用同一 canonical input/output；
- positional IPC args 通过 projector 转 canonical input，不改变 application contract。

### Event map

- key 使用 `'feature:kebab-action-past-tense'`；
- durable event 必须有 schema version；
- event payload 是不可变事实，不是 domain aggregate；
- messageId、correlationId、causationId、occurredAt 等 envelope metadata 不与业务 payload 混写；
- consumer-specific projection 不反向写入 event contract。

## 7. Snapshot 与 Domain Model

### Snapshot

Snapshot 表达某一边界时刻的可序列化状态：

```ts
export interface TaskSnapshot {
  readonly id: string;
  readonly title: string;
  readonly status: TaskStatusValue;
  readonly version: number;
  readonly updatedAt: number;
}
```

Snapshot：

- 无方法；
- 无 lazy getter；
- 无 repository/provider type；
- 无 private state；
- 不作为 domain aggregate constructor props 的强制接口；
- 由 mapper 显式生成。

### Domain model

Domain model 留在 feature：

```ts
export class Task extends AggregateRoot<TaskId> {
  complete(now: Instant): TaskDecision { ... }
}
```

Domain model 不需要 `implements TaskSnapshot`，也不直接 `toClientDTO()`。

## 8. Shared Primitive 规则

一个 primitive 进入 contracts/shared 或 contracts/primitives，必须满足：

1. 语义跨 bounded context 完全一致；
2. 是 serialization-safe representation；
3. 不依赖 feature business policy；
4. 不包含运行时 I/O；
5. 有 schema/round-trip tests。

业务不变量丰富的 class 值对象优先归 `domain-shared` 或 owning feature；其 wire representation 可以在 contracts。

## 9. Public Port 规则

跨 package consumer 需要调用 feature application 时，可以在 contracts 或 feature root 导出 public port。

- Port 使用 command/query/outcome/failure contract；
- 不暴露 repository/concrete adapter；
- 不返回 provider SDK type；
- 不要求 consumer 知道 HTTP/IPC；
- consumer-owned narrow port 优于 provider-owned万能 service；
- Port 方法必须能通过 fake 实现进行 application test。

## 10. Export Policy

- package root 只导出高频、稳定、无副作用的 public contract；
- feature subpath 导出 feature contract；
- provider/infra/private types 不进入 root；
- legacy re-export 必须登记 owner/reason/retireBy；
- 禁止通过 wildcard barrel 意外导出 domain/infra implementation；
- package-export audit 和 surface specs 必须覆盖新增 public surface。

## 11. 禁止项

- 把“两个文件会用”当作进入 contracts 的唯一理由；
- 新增 domain aggregate/entity interface 并要求 class implements；
- 在 contracts 中定义 Error subclass；
- 在 public failure 中加入 `cause`/stack/provider body；
- 在 contracts/result 中增加 feature-specific HTTP status 表；
- 复制 schema 为 interface；
- protocol map 内联复杂 object；
- DTO 反向依赖 protocol；
- contracts import Vue/Express/Electron/Prisma/provider SDK；
- 将 UI-specific message/recovery action写进业务 code；
- 新增无版本 durable event。

## 12. 测试与治理

每个 contract change 至少需要：

- schema valid/invalid fixtures；
- TypeScript inferred type compile fixture；
- serialization round-trip；
- HTTP/IPC parity（如果两者消费）；
- public failure JSON-safety；
- code registry/i18n/transport coverage；
- package export/surface test；
- compatibility fixture（修改已有 wire shape 时）。

推荐命令：

```bash
node node_modules/vitest/vitest.mjs run --config packages/contracts/vitest.config.ts
pnpm nx run contracts:typecheck
pnpm nx run contracts:lint
pnpm nx run memoflow:governance-check --skip-nx-cache
```

## 13. Migration Checklist

迁移一簇旧 contracts 类型时：

- [ ] 确认它是 wire/public/durable/domain/internal/provider/legacy 中哪一种；
- [ ] 指定唯一 owner；
- [ ] domain 类型迁回 feature，并建立 mapper；
- [ ] 保留必要 snapshot/schema；
- [ ] 更新 RPC/event map；
- [ ] 添加 compatibility re-export（如需要）；
- [ ] compatibility entry 有 retireBy；
- [ ] affected consumers typecheck；
- [ ] wire snapshot/parity 未改变；
- [ ] root export 未泄漏 implementation；
- [ ] ownership inventory 数量下降。

## 14. 结论

Contracts 的单一真值是“边界 shape 和协议”的单一真值，不是“整个系统所有概念”的单一真值。

```text
Domain owns business meaning
Contracts own boundary representation
Mappers own translation
Transports own protocol projection
```

只有保持这四个 owner，集中契约才能减少漂移，而不是制造新的全局耦合。
