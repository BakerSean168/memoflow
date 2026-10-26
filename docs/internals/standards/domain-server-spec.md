---
tags:
  - standard
  - domain
  - server
description: 服务端领域模型、领域故障、领域事件与边界映射规范
created: 2026-02-03T00:00:00
updated: 2026-08-17T00:00:00+09:00
---

# 服务端领域开发规范：模型、故障与边界

**适用范围**：`packages/<feature>/src/server/domain/**` 及同等 feature-owned 领域代码。
**依据**：ADR-049、`failure-and-outcome-contracts.md`、`architecture.md`。
**读者**：开发人员、代码审查者、AI Agent。

## 1. 领域层的职责

领域层拥有业务含义和不变量，不拥有网络、数据库、UI 或日志协议。

领域层负责：

1. 聚合、实体和值对象；
2. 状态转换及不变量；
3. 领域服务和 policy；
4. feature-owned Domain Fault；
5. 领域事实和待发布事件的业务内容；
6. 领域需要的 Port 抽象。

领域层不负责：

- HTTP status、header、cookie、Express；
- IPC channel、Electron event；
- Zod/OpenAPI wire validation；
- Vue/Pinia/i18n/toast；
- Prisma、PowerSync、SQL、filesystem、SDK；
- provider error code/message；
- public API failure code 的 transport 投影；
- stack、trace、requestId、operationId、日志格式；
- client DTO 或 persistence DTO 的最终 shape。

## 2. 依赖规则

### 2.1 允许依赖

- feature 内部纯 domain module；
- `@memoflow/domain-shared` 中真正跨 bounded context 且语义一致的值对象；
- `@memoflow/utils` 中不带 transport/runtime 语义的纯基类或算法；
- 少量 serialization-neutral primitives；
- TypeScript 标准库和纯计算依赖。

### 2.2 有条件依赖 contracts

领域层不应为了实现 wire DTO 而依赖 `@memoflow/contracts`。只有以下情形允许 type-only 依赖：

1. 领域事件的 canonical business fact 已明确同时是跨边界 durable contract，且不存在额外 transport 字段；
2. 共享 ID/时间 primitive 的语义在 domain 与 transfer 边界完全一致；
3. 已有迁移期 compatibility contract，且有 owner/retireBy。

即使允许依赖，领域类也不应 `implements` request/response/snapshot interface。

### 2.3 禁止依赖

- `@memoflow/database`、Prisma client/generated row；
- `@memoflow/http-client`、Axios、fetch adapter；
- IPC/client/UI packages；
- 其他 feature 的 infrastructure/application implementation；
- host app/runtime composer；
- provider SDK；
- `@memoflow/utils/errors` 中携带 HTTP/日志职责的 legacy `DomainError`。

跨 feature 业务校验使用 consumer-owned Port，由 application/host 注入；领域不直接调用对方 concrete service。

## 3. 领域模型不是 Wire DTO

领域模型是业务行为和不变量的 source of truth；contracts 中的 request、snapshot、event 和 public failure
是边界投影。

禁止：

```ts
export class Task implements TaskServerDTO {
  // 领域类被 wire shape 约束
}
```

推荐：

```text
CreateTaskCommand contract
  -> application mapper
  -> Task.create(domain input)

Task aggregate
  -> application mapper
  -> TaskSnapshot contract

TaskDomainFault
  -> application mapper
  -> TaskFailure contract
```

领域对象不提供 `toClientDTO()`。也不强制提供 `toPersistenceDTO()`；持久化 shape 属于 infrastructure mapper。

## 4. 聚合、实体和值对象

### 4.1 状态封装

- 状态默认 private；
- 外部通过只读 getter 或明确 snapshot 访问；
- 状态变化只通过业务动词方法；
- 禁止通用 `setStatus()`、`setField()` 绕过规则；
- 对集合返回 readonly view 或复制，避免外部直接 mutation。

### 4.2 构造

推荐区分：

- `create(...)`：新建，执行创建不变量，产生创建事实；
- `rehydrate(...)`：从 domain state 重建，不执行会改变历史含义的新业务动作；
- infrastructure mapper：Prisma/PowerSync row ↔ domain state；
- application mapper：contract command/snapshot ↔ domain input/output。

不要把 Prisma row 或 public DTO 直接作为 aggregate constructor props。

### 4.3 ID 和时间

- ID 使用 feature/domain-owned value object；
- 字段命名使用 `*Id`；
- domain time 使用项目时间体系中的 domain primitive；
- wire timestamp/date 由 mapper 转换；
- 不在领域方法中直接调用 `new Date()`/`Date.now()` 作为不可替换全局依赖，优先显式传入 `now`/clock。

## 5. Domain Fault

### 5.1 定义位置

```text
packages/<feature>/src/server/domain/faults/**
```

Domain Fault 表达业务规则为什么拒绝，不等同于 HTTP error 或 UI message。

推荐 discriminated union：

```ts
export type TaskDomainFault =
  | {
      readonly kind: 'TaskAlreadyCompleted';
      readonly taskId: TaskId;
    }
  | {
      readonly kind: 'TaskArchived';
      readonly taskId: TaskId;
    }
  | {
      readonly kind: 'TaskHierarchyCycle';
      readonly parentId: TaskId;
    };
```

### 5.2 Domain Fault 禁止字段

- HTTP status；
- public failure code（除非二者经决策明确完全同一语义，默认不是）；
- i18n key / 用户文案；
- provider code/status/message；
- Error cause/stack；
- requestId/traceId/timestamp；
- arbitrary `context: Record<string, unknown>`。

### 5.3 Fault、Decision 与异常

领域方法可以采用两种方式：

#### 显式 decision

适合预期拒绝和需要调用方穷尽处理的动作：

```ts
export type CompleteTaskDecision =
  | { readonly ok: true; readonly transition: TaskCompletedTransition }
  | { readonly ok: false; readonly fault: TaskDomainFault };
```

#### feature-local fault exception

适合深层调用需要中断控制流时：

```ts
export class TaskDomainFaultError extends Error {
  constructor(readonly fault: TaskDomainFault) {
    super(fault.kind);
    this.name = 'TaskDomainFaultError';
  }
}
```

该异常只在 feature 内部使用，不实现 `toJSON()`，不携带 HTTP status，不直接出 application boundary。

### 5.4 Programmer Error

非法构造、穷尽 switch 缺失、无法到达状态属于 programmer/invariant error，不要伪装为用户可修复 Domain Fault。
它们应 fail closed，由 observer 记录，边界返回 safe internal failure。

## 6. Domain Outcome 与 Application Outcome

领域方法可返回领域 decision/transition；跨边界的正常分支由 application 定义 Operation Outcome。

例如领域只知道：

```ts
{
  kind: 'CredentialsAcceptedButIdentityUnverified';
}
```

Application 决定公开为：

```ts
{
  kind: ('email_verification_required', email);
}
```

不要让领域层知道 Web scene、toast、HTTP 403 或 BetterAuth code。

## 7. 领域行为模板

```ts
export type RenameGoalFault =
  | { readonly kind: 'GoalArchived'; readonly goalId: GoalId }
  | { readonly kind: 'GoalNameUnchanged'; readonly goalId: GoalId };

export type RenameGoalDecision =
  | {
      readonly ok: true;
      readonly transition: {
        readonly previousName: GoalName;
        readonly nextName: GoalName;
      };
    }
  | { readonly ok: false; readonly fault: RenameGoalFault };

export class Goal extends AggregateRoot<GoalId> {
  private nameValue: GoalName;
  private statusValue: GoalStatus;
  private updatedAtValue: Instant;

  private constructor(state: GoalState) {
    super(state.id);
    this.nameValue = state.name;
    this.statusValue = state.status;
    this.updatedAtValue = state.updatedAt;
  }

  static create(input: CreateGoalDomainInput): Goal {
    const goal = new Goal({
      id: input.id,
      name: input.name,
      status: GoalStatus.Active,
      updatedAt: input.now,
    });

    goal.recordDomainFact({
      kind: 'GoalCreated',
      goalId: goal.id,
      occurredAt: input.now,
    });

    return goal;
  }

  static rehydrate(state: GoalState): Goal {
    return new Goal(state);
  }

  rename(nextName: GoalName, now: Instant): RenameGoalDecision {
    if (this.statusValue.isArchived()) {
      return {
        ok: false,
        fault: { kind: 'GoalArchived', goalId: this.id },
      };
    }

    if (this.nameValue.equals(nextName)) {
      return {
        ok: false,
        fault: { kind: 'GoalNameUnchanged', goalId: this.id },
      };
    }

    const previousName = this.nameValue;
    this.nameValue = nextName;
    this.updatedAtValue = now;

    this.recordDomainFact({
      kind: 'GoalRenamed',
      goalId: this.id,
      previousName,
      nextName,
      occurredAt: now,
    });

    return {
      ok: true,
      transition: { previousName, nextName },
    };
  }
}
```

上例没有：

- `409`；
- `GOAL_RENAME_REJECTED`；
- 中文/英文文案；
- Prisma row；
- provider error；
- requestId/traceId；
- API DTO。

这些由外层 mapper 和 adapter 负责。

## 8. Application Mapper

Application mapper 是领域语义转 public contract 的 owner：

```ts
export function mapRenameGoalFault(fault: RenameGoalFault): RenameGoalFailure {
  switch (fault.kind) {
    case 'GoalArchived':
      return {
        code: 'GOAL_RENAME_REJECTED',
        category: 'conflict',
        params: { reason: 'archived' },
        retry: { kind: 'never' },
      };

    case 'GoalNameUnchanged':
      return {
        code: 'GOAL_RENAME_REJECTED',
        category: 'conflict',
        params: { reason: 'unchanged' },
        retry: { kind: 'never' },
      };

    default:
      return assertNever(fault);
  }
}
```

Mapper 必须：

- operation-specific；
- exhaustive；
- 不解析 message；
- 不读取 HTTP status；
- 只产生 JSON-safe params；
- 由 table-driven tests 锁定。

## 9. Persistence Mapping

持久化 mapper 位于 infrastructure：

```ts
export function toGoalRow(goal: Goal): GoalPersistenceData { ... }
export function fromGoalRow(row: GoalRow): Goal { ... }
```

规则：

- domain 不 import Prisma/PowerSync；
- mapper 负责 enum、nullable、Decimal、timestamp、ID 转换；
- mapper 不执行业务决策；
- rehydrate 不产生新领域事件；
- persistence error 在 adapter 中映射 technical failure，再由 application 映射 public semantics；
- domain 不提供面向某一数据库的 `toPersistenceDTO()`。

允许 aggregate 暴露一个纯 domain state snapshot，前提是它不包含 persistence-specific 字段和策略。

## 10. 领域事件与 Durable Event

### 10.1 Domain Fact

领域对象记录业务事实：

```ts
{
  kind: ('TaskCompleted', taskId, transitionVersion, occurredAt);
}
```

该事实属于 feature domain，可使用 domain value object。

### 10.2 Public/Durable Event

Application/outbox mapper 将 Domain Fact 投影为 contracts 中的 versioned durable event：

```text
Domain Fact
  -> application event mapper
  -> task:completed@v1 contract payload
  -> outbox
```

原因：durable event 需要 serialization、schema version、correlation/causation/message metadata，这些不应反向污染 aggregate。

如果现有实现直接使用 contracts event payload，迁移期允许保留，但新增事件优先按上述边界设计。

### 10.3 禁止

- domain 直接发送 EventBus/HTTP/IPC；
- domain 知道 outbox row；
- domain event payload 含 provider/transport object；
- 发布失败被日志吞掉后清空 event buffer；
- 未版本化的跨进程 durable event。

## 11. Domain-owned Port

领域需要读取业务事实时，可以定义最小 Port：

```ts
export interface GoalBindingPolicyPort {
  inspectTarget(input: GoalBindingTarget): Promise<GoalBindingFacts>;
}
```

Port 规则：

- consumer-owned；
- 使用 domain/application neutral input/output；
- 不返回 Prisma/provider type；
- 不暴露 HTTP Result；
- implementation 位于 infrastructure/host adapter；
- 跨 feature 由 host composer 注入；
- 不建立万能 repository/service。

纯 repository Port 可以位于 feature domain，但 transaction/orchestration policy通常由 application 组织。

## 12. 测试规范

### Domain tests 只验证

- invariant；
- state transition；
- Domain Fault kind/value；
- idempotency；
- domain fact；
- time/ID/value object semantics。

### Domain tests 不验证

- HTTP status；
- response envelope；
- i18n 文案；
- provider message/code；
- Prisma error code；
- Vue/Pinia scene；
- logging output。

Application mapper、transport、provider adapter 和 UI 分别在各自层测试。

## 13. 代码审查 Checklist

### 模型

- [ ] 状态是否通过业务方法变化？
- [ ] 不变量是否在 owning aggregate/policy 中？
- [ ] 时间和 ID 是否使用 domain primitive？
- [ ] `rehydrate` 是否不产生新业务事实？

### Fault

- [ ] 业务拒绝是否使用 typed Domain Fault？
- [ ] Fault 是否无 HTTP/i18n/provider/trace 字段？
- [ ] programmer error 是否没有伪装成用户错误？
- [ ] application mapper 是否 exhaustive？

### 边界

- [ ] 领域类是否错误地 implements wire DTO？
- [ ] 是否存在 `toClientDTO()` 或 persistence-specific serialization？
- [ ] 是否 import Prisma/HTTP/UI/provider SDK？
- [ ] Domain Fact 与 durable event 是否有明确 mapper？

### 测试

- [ ] Domain test 是否只断言 domain semantics？
- [ ] 新 Fault 是否触发 mapper compile/test 更新？
- [ ] 没有通过 message snapshot 固化业务协议？

## 14. Legacy 迁移

现有代码中的以下模式按 active architecture plan 分阶段退役：

- `extends DomainError`；
- domain 返回 generic `ResultError`；
- domain class `implements` contracts Server DTO；
- aggregate `toPersistenceDTO()` 绑定数据库 shape；
- domain method `throw new Error('business message')`；
- domain 直接使用 public failure/HTTP code；
- domain 直接发布 raw event bus。

迁移一个 operation 时应同时闭合：Domain Fault → Application Outcome/Failure → Contract → Transport → UI/Test。
不得只替换 Error class 而保留 message-based protocol。

## 15. 结论

服务端领域层的纯度不是“没有 import Prisma”这么简单。真正的边界是：

```text
Domain owns business truth and rejection reasons
Application owns use-case meaning and caller next step
Contracts own stable boundary representation
Infrastructure owns technical translation
Transport owns protocol projection
```

领域模型越少知道边界细节，MemoFlow 的 Web、Desktop、API、PowerSync 和 provider 才越能共享同一业务语义，
而不是共享同一批偶然的数据结构。
