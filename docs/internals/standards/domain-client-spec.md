---
tags:
  - standard
  - client
  - presentation
description: Web/Desktop 客户端快照、交互状态、结果消费和视图模型规范
created: 2026-02-03T00:00:00
updated: 2026-08-17T00:00:00+09:00
---

# 客户端领域开发规范：快照、状态与视图投影

**适用范围**：`packages/app-vue`、`packages/app-react`、feature client/application-client、
`apps/web` 与 `apps/desktop` 的 renderer/presentation 代码。
**依据**：ADR-049、`architecture.md`、`failure-and-outcome-contracts.md`。

## 1. 定位

客户端通常不需要复制一套服务端 Aggregate/Entity。客户端的主要职责是：

1. 消费服务端/public contracts 的 snapshot、outcome 和 public failure；
2. 管理 query/mutation/interaction state；
3. 将稳定业务语义投影成当前平台的 view model、文案和 recovery action；
4. 处理 optimistic view、草稿、selection、focus、navigation 和 native bridge；
5. 保持 Web/Desktop 的产品语义一致，同时允许不同 presentation。

客户端不拥有服务端业务真值、跨实体不变量、持久化事务或 provider error translation。

## 2. 三种客户端模型

不要把所有客户端对象都称为“领域模型”。按责任区分：

| 模型              | 用途                                | 示例                |
| ----------------- | ----------------------------------- | ------------------- |
| Server Snapshot   | 来自 public contract 的只读数据     | `TaskSnapshot`      |
| Application State | query/mutation/outcome/failure 状态 | `TaskDetailState`   |
| View Model        | 展示所需的纯投影                    | `TaskCardViewModel` |

必要时可以有 client-side policy，例如是否显示按钮、如何格式化进度，但它不能替代服务端授权和不变量。

## 3. 依赖规则

### 3.1 允许依赖

- `@memoflow/contracts/<feature>` public snapshot/outcome/failure；
- feature public client/application port；
- presentation-safe shared primitives；
- UI framework（仅 presentation/store/composable 层）；
- host navigation/native bridge interface；
- i18n formatter；
- query/state libraries。

### 3.2 禁止依赖

- server domain/application/infrastructure deep path；
- Prisma、PowerSync internal row、database driver；
- BetterAuth/GitHub/provider SDK error type；
- Express/API middleware；
- server-only aggregate repository；
- raw provider message/status branching；
- 全局 legacy `DomainError`。

### 3.3 `domain-shared`

只有客户端和服务端业务语义完全一致、且不依赖 server runtime 的值对象才可共享。

不要在 client 重复服务器端的复杂 business validation。客户端本地 validation用于及时反馈；服务器仍是 authoritative owner。

## 4. Snapshot Consumption

Public snapshot 是边界数据，不要求再包装成继承 `AggregateRoot` 的 client class。

优先使用纯函数/readonly view model：

```ts
export interface TaskCardViewModel {
  readonly id: string;
  readonly title: string;
  readonly statusLabel: string;
  readonly progressLabel: string;
  readonly canOpen: boolean;
}

export function toTaskCardViewModel(task: TaskSnapshot, t: TranslateFn): TaskCardViewModel {
  return {
    id: task.id,
    title: task.title,
    statusLabel: t(`task.status.${task.status}`),
    progressLabel: `${task.progress}%`,
    canOpen: true,
  };
}
```

允许 class 的条件：

- 确实需要封装多个纯 computed behavior；
- 不复制服务端 state mutation；
- 不继承 server aggregate基类；
- 不要求 `implements` wire DTO；
- 构造通过显式 mapper，而不是将 DTO 与内部状态强耦合。

## 5. Application State Ownership

每个 operation/flow 只有一个 authoritative state owner。State至少区分：

```ts
export type AsyncOperationState<TOutcome, TFailure> =
  | { readonly status: 'idle' }
  | { readonly status: 'pending'; readonly startedAt: number }
  | { readonly status: 'succeeded'; readonly outcome: TOutcome }
  | { readonly status: 'failed'; readonly failure: TFailure };
```

必要时扩展 canceled、paused、waiting_user_action、replaying 等明确状态。

禁止同一个 operation 同时维护：

- local `errorMessage`；
- Pinia `error`；
- query library `error`；
- composable `lastResultError`；
- durable receipt；

却没有一个清楚的 source of truth。不同投影可以派生，但机器语义只能有一个 owner。

## 6. Outcome Consumption

正常下一步按 outcome `kind` 分支：

```ts
const result = await auth.signIn(input);

if (!result.ok) {
  state.value = { status: 'failed', failure: result.error };
  return;
}

switch (result.data.kind) {
  case 'authenticated':
    navigateToWorkspace();
    break;
  case 'email_verification_required':
    scene.value = 'verify-email';
    break;
  default:
    assertNever(result.data);
}
```

禁止把 normal outcome当作 error code：

```ts
if (result.error.code === 'EMAIL_NOT_VERIFIED') { ... }
```

## 7. Public Failure Consumption

### 7.1 保存稳定语义

```ts
const failure = ref<AuthFailure | null>(null);

const failureMessage = computed(() =>
  failure.value ? translateAuthFailure(failure.value, t) : null,
);
```

不要只保存最终 message：

```ts
const errorMessage = ref(result.error.message);
```

原因：message无法重新本地化、无法可靠 recovery、可能泄漏 provider detail，也不能被编译器穷尽。

### 7.2 Recovery 与 Message 分离

```ts
const recovery = computed(() => (failure.value ? authRecovery(failure.value) : null));
```

Message registry负责文案；Recovery registry负责 focus、retry、navigation、disable、reauthenticate。
不要通过文本推断动作。

### 7.3 HTTP status

客户端可以将 401/403 等用于 transport/session通用处理，但具体业务原因仍依赖 public failure code/outcome。

```text
401 + AUTH_INVALID_CREDENTIALS -> 留在登录页
401 + AUTH_SESSION_EXPIRED     -> 清理会话并重新登录
```

不得只看 status就推断业务 scene。

## 8. i18n

- 每个 public failure code 必须有所有支持 locale 的 key；
- translation mapping使用 `satisfies Record<FailureCode, string>`；
- params经过schema allowlist；
- locale变化时computed message立即变化；
- provider/server raw message不作为生产fallback；
- 文案测试与业务code测试分层。

## 9. Optimistic State

允许客户端有 optimistic projection，但必须明确：

1. server command仍是authoritative；
2. optimistic item带client mutation ID/idempotency key；
3. server outcome成功后reconcile；
4. public failure后rollback或显示conflict resolution；
5. 不在客户端重新执行复杂domain validation；
6. offline queue使用versioned command contract和durable receipt，不保存UI-only object。

## 10. Draft、Dirty 与 Busy

Draft是presentation/application state，不是server aggregate。

- draft可以包含未提交输入；
- dirty比较基于canonical form state；
- busy表示operation不能安全中断；
- shell/navigation通过surface status registry询问能否离开；
- draft持久化不得包含token/password/provider error；
  -提交时通过contract schema构造command。

## 11. Durable Failure Receipt

可持久化：

- public failure code/category；
- safe params；
- retry directive；
- operation；
- requestId/traceId reference；
- failedAt；
- version。

禁止持久化：

- `Error` instance、stack、cause；
- arbitrary server/provider message；
- password/reset token/OAuth code；
- cookies/headers；
- unfiltered context。

Receipt恢复后重新根据当前locale投影文案。

## 12. View Model

View model是纯函数或只读class：

- 输入snapshot/current locale/presentation preference；
- 输出label、formatted value、visibility、semantic action descriptor；
- 不发请求；
- 不修改server state；
- 不持有provider/transport object；
- 不把UI文案写回domain/contract；
- 可被unit test独立验证。

避免 `toClientDTO()` 循环序列化。Snapshot本身已经是contract；view model不是另一个public transport DTO。

## 13. Host-specific Adapter

Web和Desktop可分别实现：

- browser redirect/deep link；
- Electron native dialog/filesystem bridge；
- platform notification；
- secure credential storage；
- network/offline detection。

Host adapter消费/实现Port，不复制application state machine和failure mapping。

例如 Auth：

```text
shared Auth application semantics
  -> Web redirect adapter
  -> Desktop device authorization adapter
```

不同presentation不等于不同错误协议。

## 14. Global Error Boundary

区分两种错误：

1. Public operation failure：由feature state owner渲染可恢复UI；
2. Programmer/render crash：由global error boundary捕获，显示safe generic fallback并记录diagnostic。

GlobalErrorBoundary不应把任意 `err.message` 原样展示给用户。

## 15. 测试规范

### State/composable tests

- pending/success/normal outcome/failure/cancel；
- stale request和并发提交；
- retry/recovery；
- unmount/remount receipt；
- locale live retranslation；
- unknown failure safe fallback。

### View model tests

- snapshot → formatted display；
- locale/timezone；
- empty/edge values；
- 无I/O/side effect。

### Security negative tests

- provider raw message不渲染；
- password/token不进store/localStorage/log；
- arbitrary context不持久化；
- Error/stack不进IPC/HTTP UI receipt。

### E2E

- fixture通过API/DB/global setup准备；
- helper不根据UI message修改数据库；
- 文案只在专门i18n contract场景断言；
- user journey断言stable state/testid/behavior；
- suite开始校验build revision。

## 16. 禁止模式

```ts
// 禁止：provider code进入UI
if (error.code === 'EMAIL_NOT_VERIFIED') { ... }

// 禁止：raw message成为state
errorMessage.value = result.error.message;

// 禁止：message驱动recovery
if (message.includes('not found')) createFixture();

// 禁止：复制server aggregate
class ClientTask extends AggregateRoot<TaskId> {
  complete() { /* duplicated business rule */ }
}

// 禁止：用wire DTO约束view model
class TaskCard implements TaskSnapshot { ... }
```

## 17. Legacy 迁移

现有“Client Domain Aggregate”不要求一次删除。迁移顺序：

1. 确认对象是snapshot wrapper、view model还是duplicated domain；
2. 纯展示逻辑迁为view model；
3. operation state迁入单一state owner；
4. duplicated business rule删除，改为server command/outcome；
5. raw message迁为typed failure；
6. 去掉不必要的AggregateRoot/Entity继承；
7. 保留compatibility adapter直到调用方更新；
8. 添加surface和behavior tests后删除旧轨。

## 18. Code Review Checklist

- [ ] 这是snapshot、application state还是view model？
- [ ] 是否复制了server domain rule？
- [ ] 是否深路径import server/infra/provider？
- [ ] operation是否只有一个state owner？
- [ ] normal state是否使用outcome？
- [ ] failure是否保留code/category/params而非message？
- [ ] recovery是否和translation分离？
- [ ] locale变化是否无需重新请求？
- [ ] receipt是否只持久化safe fields？
- [ ] Web/Desktop差异是否封装在host adapter？
- [ ] tests是否不依赖UI文案准备fixture？

## 19. 结论

客户端的“领域性”体现在正确消费业务语义和维护交互状态，而不是复制服务端aggregate。

```text
Server/domain owns business truth
Contracts carry stable snapshots/outcomes/failures
Client state owns interaction lifecycle
View model owns presentation projection
Host adapter owns platform behavior
```

这样Web和Desktop可以有不同界面，却不会产生两套业务规则和错误协议。
