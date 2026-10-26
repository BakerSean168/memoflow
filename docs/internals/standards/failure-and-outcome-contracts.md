---
tags:
  - standards
  - architecture
  - contracts
  - error-handling
  - outcomes
description: MemoFlow 领域故障、应用结果、公开失败、provider 映射、传输和 UI 的强制规范
created: 2026-08-17T00:00:00+09:00
updated: 2026-08-17T00:00:00+09:00
---

# Failure and Outcome Contracts / 失败与结果契约规范

## 1. 适用范围

本规范适用于：

- feature domain/application/infrastructure/transport；
- HTTP、IPC、SSE、PowerSync、durable message；
- Web/Desktop presentation；
- BetterAuth、Prisma、GitHub、AI provider 等第三方适配；
- Result envelope、错误本地化、retry hint、operation retry、recovery、日志与 tracing；
- unit/integration/parity/E2E tests；
- 新增或修改任何 machine-readable failure code。

本规范实现 ADR-049。与旧文档冲突时，以 ADR-049 和本文为准。库选型、协议标准和开源实现依据见
[失败契约库与开源实现研究](https://github.com/BakerSean168/memoflow/blob/7a45112e1840950ead1ba98b748fc70fa1b38344/docs/analysis/2026-08-17-failure-contract-library-and-open-source-study.md)。

## 2. 术语

| 术语                    | 定义                                   | 示例                            |
| ----------------------- | -------------------------------------- | ------------------------------- |
| Domain Fault            | 领域规则拒绝或不变量失败               | `TaskHierarchyCycle`            |
| Operation Outcome       | 用例正常结束的分支，包括需下一步的状态 | `email_verification_required`   |
| Public Failure          | 调用方可稳定处理的失败                 | `AUTH_INVALID_CREDENTIALS`      |
| Failure Category        | transport-neutral 通用分类             | `conflict`、`unavailable`       |
| Provider Failure        | 第三方/数据库/SDK 的实现错误           | BetterAuth `EMAIL_NOT_VERIFIED` |
| Transport Projection    | public failure 到 HTTP/IPC/SSE 的投影  | `conflict -> 409`               |
| Presentation Projection | code/details 到文案与 recovery 的投影  | 登录页错误 banner               |
| Diagnostic Failure      | 内部 cause/stack/provider detail       | trace attributes                |

## 3. 快速决策表

遇到一个“错误”时按下表归类：

| 问题                                                 | 是                               | 否                                |
| ---------------------------------------------------- | -------------------------------- | --------------------------------- |
| 这是业务上可预期、需要调用方继续下一步的正常状态吗？ | `OperationOutcome`               | 继续                              |
| 这是领域不变量或状态转换拒绝吗？                     | feature `DomainFault`            | 继续                              |
| 这是跨边界调用方必须稳定处理的失败吗？               | feature `PublicFailure`          | 继续                              |
| 这是第三方/DB/SDK/网络细节吗？                       | adapter-private provider failure | 继续                              |
| 这是 HTTP/IPC/SSE 表达选择吗？                       | transport projection             | 继续                              |
| 这是排障信息吗？                                     | diagnostic only                  | programmer bug / invariant breach |

不得因为“前端要显示”就把 provider code 放入 contracts；不得因为“两个包都用”就把 domain type
自动移入 contracts。

## 4. 通用 Public Failure primitive

目标 primitive 应保持 JSON-safe：

```ts
export const FailureCategories = {
  Validation: 'validation',
  Unauthenticated: 'unauthenticated',
  Permission: 'permission',
  NotFound: 'not_found',
  Conflict: 'conflict',
  RateLimited: 'rate_limited',
  Unavailable: 'unavailable',
  Timeout: 'timeout',
  Canceled: 'canceled',
  Internal: 'internal',
} as const;

export type FailureCategory = (typeof FailureCategories)[keyof typeof FailureCategories];

export interface ValidationIssue {
  readonly path: readonly (string | number)[];
  readonly code: string;
  readonly params?: Readonly<Record<string, JsonValue>>;
}

export type FailureRetryHint =
  | { readonly kind: 'not_retryable' }
  | { readonly kind: 'transient' }
  | { readonly kind: 'after'; readonly afterMs: number };

export interface FailureReference {
  readonly requestId?: string;
  readonly traceId?: string;
}

export interface PublicFailure<Code extends string = string, Details = never> {
  readonly code: Code;
  readonly category: FailureCategory;
  readonly details?: Details;
  readonly retryHint?: FailureRetryHint;
  readonly reference?: FailureReference;
}

export interface OperationRetryPolicy {
  readonly mode: 'never' | 'safe_read' | 'idempotent_write' | 'transaction' | 'workflow_step';
  readonly maxAttempts: number;
  readonly requiresIdempotencyKey: boolean;
  readonly backoff: BackoffPolicy;
}

export type RecoveryAction =
  | { readonly kind: 'none' }
  | { readonly kind: 'reauthenticate' }
  | { readonly kind: 'verify_email'; readonly email: string }
  | { readonly kind: 'correct_input'; readonly fields?: readonly string[] }
  | { readonly kind: 'resolve_conflict'; readonly resource: string }
  | { readonly kind: 'retry_manually' };
```

### 4.1 Zod strict schema requirement

所有 public failure `details` object schema 必须使用 strict mode。Zod 默认会剥离未知键，这不足以
防止 token、provider body 或任意 context 静默进入后续处理。Registry builder 必须使用 MemoFlow-owned
strict-object helper，并为 secret/provider-field 添加负向测试。禁止依赖 Zod 未导出的内部类型。

### 4.1 Public Failure 禁止字段

禁止在 canonical public failure 中加入：

- `cause: unknown`；
- `stack`；
- Error instance；
- provider response body；
- SQL/query；
- access token、reset token、password；
- request headers/cookies；
- arbitrary `context: Record<string, unknown>`；
- HTTP status；
- 已翻译 UI 文案。

### 4.2 兼容期 `message`

现有 Result envelope 仍包含 `message`。兼容期规则：

1. message 必须由 MemoFlow 自己的 safe allowlist 生成；
2. 不允许直接使用 provider/DB/SDK exception message；
3. UI 不根据 message 分支；
4. UI 优先按 code/typed details 本地化；
5. durable receipt 不持久化任意 message；
6. 新 contract 不把 message 视为稳定字段；
7. 最终迁移为 optional `fallbackMessage` 或移出 canonical public failure。

### 4.3 Retry hint、operation policy 与 recovery action 必须分离

`FailureRetryHint` 只表达失败的暂态事实，不表达是否安全自动重放业务命令。
自动 retry 必须由 `OperationRetryPolicy` 结合以下条件决定：

- operation 是 read、idempotent write、transaction 还是 workflow step；
- 是否存在稳定 idempotency key；
- 是否已经产生 durable receipt 或部分副作用；
- attempt budget、deadline、backoff/jitter；
- cancellation、account closure 和 host lifecycle。

`RecoveryAction` 由 application/presentation 推导，例如 reauthenticate、verify email、correct input 或
resolve conflict。禁止把 `reauthenticate`、`show_dialog` 等 UI action 塞入 public failure retry hint。

最终允许自动 retry 的条件是：

```text
failure retry hint
  ∩ operation retry policy
  ∩ idempotency/transaction state
  ∩ attempt budget/deadline
  ∩ cancellation state
```

## 5. Feature Public Failure registry

每个 feature 必须拥有自己的 registry，而不是修改全局巨型 enum。

示例：

```ts
export const AuthFailureCodes = {
  InvalidCredentials: 'AUTH_INVALID_CREDENTIALS',
  UserAlreadyExists: 'AUTH_USER_ALREADY_EXISTS',
  AccountClosed: 'AUTH_ACCOUNT_CLOSED',
  RateLimited: 'AUTH_RATE_LIMITED',
  ProviderUnavailable: 'AUTH_PROVIDER_UNAVAILABLE',
} as const;

export type AuthFailureCode = (typeof AuthFailureCodes)[keyof typeof AuthFailureCodes];

export type AuthFailure =
  | PublicFailure<'AUTH_INVALID_CREDENTIALS'>
  | PublicFailure<'AUTH_USER_ALREADY_EXISTS'>
  | PublicFailure<'AUTH_ACCOUNT_CLOSED'>
  | PublicFailure<'AUTH_RATE_LIMITED', { retryAfterMs?: number }>
  | PublicFailure<'AUTH_PROVIDER_UNAVAILABLE'>;
```

### 5.1 Registry 必须声明的 metadata

机器可读 registry 最终应覆盖：

| 字段              | 含义                                      |
| ----------------- | ----------------------------------------- |
| `code`            | wire-stable code                          |
| `category`        | transport-neutral category                |
| `operations`      | 哪些 operation 可返回                     |
| `detailsSchema`   | 该 code 可出 wire 的 typed details        |
| `retryHint`       | 失败暂态事实，不代表自动执行              |
| `operationPolicy` | operation-owned retry policy reference    |
| `recoveryPolicy`  | application/presentation policy reference |
| `http`            | HTTP adapter override（可选）             |
| `i18n`            | 必须覆盖的 locale key                     |
| `telemetry`       | metric/error class，不含敏感数据          |
| `introducedIn`    | contract version/commit                   |
| `deprecatedBy`    | 替代 code（可选）                         |

### 5.2 Code 命名

- public failure code 使用 `<FEATURE>_<SEMANTIC>`；
- 不使用 provider 名：禁止 `BETTER_AUTH_*`、`PRISMA_*`、`GITHUB_HTTP_422`；
- 不把 HTTP status 写进 code：禁止 `TASK_404`；
- 不把 UI action 写进 code：禁止 `SHOW_LOGIN_DIALOG`；
- code 表达稳定业务语义：`TASK_VERSION_CONFLICT`；
- 一个 code 不能在不同 operation 中表达不同含义；
- 删除/重命名 public code 必须有显式 migration 和 compatibility fixture。

## 6. Domain Fault 规范

### 6.1 所有权

Domain Fault 定义在 owning feature domain，不定义在 `@memoflow/contracts` 或 `@memoflow/utils`。

```text
packages/task/src/server/domain/faults/task-domain-fault.ts
packages/goal/src/server/domain/faults/goal-domain-fault.ts
```

### 6.2 推荐写法

优先使用 discriminated union：

```ts
export type GoalDomainFault =
  | {
      readonly kind: 'GoalArchived';
      readonly goalId: GoalId;
    }
  | {
      readonly kind: 'KeyResultWeightExceeded';
      readonly totalWeight: Weight;
    }
  | {
      readonly kind: 'GoalInvalidDateRange';
      readonly start: Ymd;
      readonly target: Ymd;
    };
```

需要异常控制流时，可以使用 feature-local wrapper：

```ts
export class GoalDomainFaultError extends Error {
  constructor(readonly fault: GoalDomainFault) {
    super(fault.kind);
    this.name = 'GoalDomainFaultError';
  }
}
```

wrapper 只用于内部控制流，不实现 `toJSON`，不携带 HTTP status。

### 6.3 Domain Fault 禁止项

```ts
// 禁止：领域层知道 HTTP 和 UI 文案
class GoalArchivedError extends DomainError {
  constructor() {
    super('GOAL_ARCHIVED', '目标已归档', {}, 409);
  }
}
```

禁止：

- extends 一个提供 HTTP/API/logging 的全局基类；
- import Express、Axios、Electron、Vue、i18n；
- 保存 requestId/traceId/timestamp；
- 保存 provider code/status；
- 返回已本地化字符串；
- 用 arbitrary string 代替 discriminator。

### 6.4 Domain validation 与 programmer error

- 用户输入 shape validation：contract/Zod/transport；
- 业务不变量：domain fault；
- repository/provider failure：infrastructure failure；
- “代码不可能到达”的 invariant breach：可以抛 generic programmer error，但必须 fail closed，
  不能转成用户可处理的 domain failure。

## 7. Application Outcome 规范

### 7.1 正常替代状态使用 outcome

```ts
export type BeginCloudConnectionOutcome =
  | {
      readonly kind: 'connected';
      readonly profile: CloudProfileSnapshot;
    }
  | {
      readonly kind: 'awaiting_authorization';
      readonly userCode: string;
      readonly verificationUrl: string;
      readonly expiresAt: string;
    };
```

不应写成：

```ts
fail({ code: 'AUTHORIZATION_REQUIRED', message: '...' });
```

判断依据：如果该状态是产品流程中的预期节点，并且用户/系统有明确下一步，它通常是 outcome。

### 7.2 Operation contract 要具体

推荐：

```ts
export type SignInResult = Result<SignInOutcome, AuthSignInFailure>;
export type CompleteTaskResult = Result<CompleteTaskOutcome, CompleteTaskFailure>;
```

不推荐：

```ts
Promise<Result<CloudAuthResponse>>;
Promise<Result<TaskDTO>>;
```

后者允许任何 string code，调用方无法穷尽处理。

### 7.3 Application mapper

Application 是 domain semantics 到 public semantics 的 owner：

```ts
export function mapTaskFaultToCompleteFailure(fault: TaskDomainFault): CompleteTaskFailure {
  switch (fault.kind) {
    case 'TaskArchived':
      return {
        code: 'TASK_COMPLETION_REJECTED',
        category: 'conflict',
        details: { reason: 'archived' },
        retryHint: { kind: 'not_retryable' },
      };
    case 'TaskAlreadyCompleted':
      return assertNever(fault, 'TaskAlreadyCompleted must be represented as an outcome');
    default:
      return assertNever(fault);
  }
}
```

Mapper 必须穷尽；新增 domain fault 时编译或测试应失败。

## 8. Provider/Infrastructure Anti-Corruption Layer

### 8.1 Provider code 止于 adapter

```ts
function mapBetterAuthSignInResponse(
  response: BetterAuthResponse,
): Result<SignInOutcome, AuthSignInFailure> {
  if (response.ok && response.token) {
    return ok({ kind: 'authenticated', account: ..., session: ... });
  }

  if (response.status === 403 && response.code === 'EMAIL_NOT_VERIFIED') {
    return ok({ kind: 'email_verification_required', email: response.email });
  }

  if (response.code === 'INVALID_EMAIL_OR_PASSWORD') {
    return fail({
      code: 'AUTH_INVALID_CREDENTIALS',
      category: 'unauthenticated',
      retryHint: { kind: 'not_retryable' },
    });
  }

  return fail({
    code: 'AUTH_PROVIDER_UNAVAILABLE',
    category: 'unavailable',
    retryHint: { kind: 'after', afterMs: 1000 },
  });
}
```

Adapter 外禁止出现 `EMAIL_NOT_VERIFIED` 和 `INVALID_EMAIL_OR_PASSWORD`。

### 8.2 Provider diagnostic

需要排障时：

```ts
observer.recordFailure({
  operation: 'auth.signIn',
  provider: 'better-auth',
  providerCode: payload.code,
  cause,
  attributes: { status: response.status },
});
```

不得把该对象合并进 `PublicFailure.context`。

### 8.3 Provider status 不能进入 application

禁止：

```ts
if (error.status === 404) return fail({ code: 'NOT_FOUND', ... });
```

出现在 application service。

允许：同样代码出现在 GitHub adapter 内，并返回 operation-specific repository failure。

### 8.4 Prisma mapping

Prisma global mapper只能提供最低层 technical classification；最终 public code 必须由 operation context 决定。

例如 P2002：

```text
create account email unique -> AUTH_USER_ALREADY_EXISTS
create task occurrence unique -> TASK_OCCURRENCE_ALREADY_EXISTS / idempotent outcome
create relation unique -> RELATION_ALREADY_EXISTS
```

不能只因为都是 P2002 就全部返回 generic `CONFLICT`。

## 9. Transport Projection 规范

### 9.1 Shared category default

HTTP adapter 可提供默认映射：

| Category        |          默认 HTTP |
| --------------- | -----------------: |
| validation      |                422 |
| unauthenticated |                401 |
| permission      |                403 |
| not_found       |                404 |
| conflict        |                409 |
| rate_limited    |                429 |
| unavailable     |                503 |
| timeout         |                504 |
| canceled        | 499 或 host policy |
| internal        |                500 |

Operation/code 可覆盖，但映射文件属于 HTTP transport，不属于 domain/shared contracts。

### 9.2 HTTP registry

```ts
export const AuthFailureHttpPolicy = {
  AUTH_INVALID_CREDENTIALS: { status: 401 },
  AUTH_USER_ALREADY_EXISTS: { status: 409 },
  AUTH_ACCOUNT_CLOSED: { status: 403 },
  AUTH_RATE_LIMITED: { status: 429, retryAfter: true },
  AUTH_PROVIDER_UNAVAILABLE: { status: 503 },
} satisfies FailureHttpPolicy<AuthFailureCode>;
```

`satisfies` 必须让缺失 code 在编译时失败。

### 9.3 IPC/SSE

- IPC 不携带 HTTP status；
- HTTP 和 IPC 返回相同 outcome/failure code/category/typed details/retryHint；
- SSE terminal failure event 使用同一 public failure schema；
- streaming partial content 与 terminal failure 分开；
- transport parity fixture 必须覆盖 success、normal outcome、public failure 三类。

### 9.4 Unknown failure

未知异常：

- 对用户返回 safe `*_INTERNAL` 或 shared internal category；
- 对 observer 记录真实 cause；
- 不把 `error.message` 作为 public fallback；
- 不猜测 feature code；
- 不将未知 feature code静默映射成业务 200/400。

## 10. Presentation 与 i18n 规范

### 10.1 State 保存语义，不保存文案

```ts
const failure = ref<AuthFailure | null>(null);
const failureMessage = computed(() =>
  failure.value ? translateAuthFailure(failure.value, t) : null,
);
```

禁止：

```ts
const errorMessage = ref(result.error.message);
```

### 10.2 Translation registry

```ts
const AuthFailureMessageKeys = {
  AUTH_INVALID_CREDENTIALS: 'auth.errors.invalidCredentials',
  AUTH_USER_ALREADY_EXISTS: 'auth.errors.userAlreadyExists',
  AUTH_ACCOUNT_CLOSED: 'auth.errors.accountClosed',
  AUTH_RATE_LIMITED: 'auth.errors.rateLimited',
  AUTH_PROVIDER_UNAVAILABLE: 'auth.errors.providerUnavailable',
} satisfies Record<AuthFailureCode, string>;
```

每个支持 locale 必须覆盖全部 code。缺失 key 是 CI failure，不回退 provider message。

### 10.3 Recovery registry

UI action 与文案分开：

```ts
function authRecovery(failure: AuthFailure): AuthRecovery {
  switch (failure.code) {
    case 'AUTH_INVALID_CREDENTIALS':
      return { kind: 'stay_on_login', focus: 'password' };
    case 'AUTH_USER_ALREADY_EXISTS':
      return { kind: 'offer_sign_in' };
    case 'AUTH_RATE_LIMITED':
      return { kind: 'disable_submit', until: ... };
    case 'AUTH_ACCOUNT_CLOSED':
      return { kind: 'account_unavailable' };
    case 'AUTH_PROVIDER_UNAVAILABLE':
      return { kind: 'retry' };
  }
}
```

不要根据 translated message 决定 recovery。

### 10.4 Durable UI receipt

可持久化：

- public code；
- safe typed details；
- failure retry hint；
- evaluated operation retry state；
- requestId/traceId reference；
- operation；
- timestamp。

禁止持久化：

- password/token；
- raw message；
- provider body；
- Error/cause/stack；
- arbitrary context。

## 11. Observability 与安全

### 11.1 Public 与 internal 日志分离

日志最少包含：

- operation；
- public failure code/category；
- requestId/traceId；
- provider/providerCode（仅 internal）；
- retry attempt；
- outcome kind；
- safe entity reference。

不得记录 password、token、cookie、OAuth secret、完整 email body、provider response 中的敏感字段。

已被内部 retry/handle 且 operation 最终正常完成的 exception 不应计入该 operation 的 error rate；
同一个 exception 只在最终负责的 instrumentation boundary 记录一次。`error.type`/failure attributes 必须
低基数，禁止使用 raw message。Expected outcome 使用 `memoflow.outcome.kind`，不标记 span error。

### 11.2 Metrics

建议统一指标：

```text
operation_outcome_total{feature,operation,outcome}
operation_failure_total{feature,operation,code,category}
provider_failure_total{provider,operation,provider_code}
operation_retry_total{feature,operation,reason}
```

业务正常 outcome 不计入 error rate，例如 `email_verification_required`、`waiting_approval`。

### 11.3 用户枚举安全

公开 code 是否暴露资源存在性必须由 feature security policy 决定。例如：

- 登录中的“不存在账号”和“密码错误”统一为 `AUTH_INVALID_CREDENTIALS`；
- 注册是否返回 `AUTH_USER_ALREADY_EXISTS` 是明确产品/安全决策；
- password reset 始终返回中性 accepted outcome；
- webhook signature failure 不返回内部签名细节。

## 12. 库使用边界

### 12.1 默认基础

默认使用 TypeScript discriminated union、`switch + assertNever` 和 Zod boundary schema。
库不能成为 Domain Fault、Public Failure code、wire schema 或 durable fact 的 owner。

### 12.2 `ts-pattern`

ACR-R02 显示 `ts-pattern` 在小型 mapper 中减少了行数，但 isolated median typecheck 比 native switch
高约 44%，而 exhaustiveness 能力可由 `switch + assertNever` 获得。因此本轮不加入依赖。
未来仅当 bounded mapper benchmark 证明显著可读性收益且 affected typecheck 成本可接受时，才可通过
独立 ADR/PR 提出；禁止机械替换简单分支。

### 12.3 XState

Auth 使用 feature-owned typed reducer，不引入 XState。ACR-R02 中 reducer 与 XState 源码规模相近，
XState isolated median typecheck 高约 63%，且会引入第二套 actor/snapshot lifecycle。
未来只有 nested/parallel state、invoked actors、durable resume 等复杂 workflow 才可经独立 ADR/spike 提出；
XState snapshot 永远不替代 durable receipt/approval/session ledger。

### 12.4 不采用的全局 runtime

本轮不引入 `neverthrow`、Effect、Connect 或 Temporal 作为全仓基础。可借鉴其 API/协议/重试思想，
但不能形成第二套 Result、schema、DI、transport 或 durable runtime。MemoFlow 可在现有 Result 上增加
少量自有 combinator，但公共签名仍使用 `@memoflow/contracts/result`。

## 13. 禁止模式

### 13.1 Message branching

```ts
// 禁止
if (error.message.includes('Account not found')) { ... }
if (/timeout/i.test(error.message)) { ... }
```

允许的唯一例外：无法获得结构化 provider code 的 infrastructure parser，并已在治理 allowlist 登记 owner 和退役日期。

### 13.2 Raw message rethrow

```ts
// 禁止：丢 code/meta/cause classification
throw new Error(result.error.message);
```

替代：

```ts
throw toPublicFailureException(result.error, result.meta);
```

或继续返回 typed Result，不从 Result 切换回 generic throw。

### 13.3 UI raw message

```ts
// 禁止
errorMessage.value = result.error.message;
```

替代：保存 typed failure，computed translation。

### 13.4 Domain HTTP status

```ts
// 禁止
new GoalArchivedError(..., 409)
```

HTTP status 由 HTTP adapter 决定。

### 13.5 Provider code leakage

```ts
// 禁止在 UI/application
if (error.code === 'EMAIL_NOT_VERIFIED') { ... }
```

替代：adapter 输出 `email_verification_required` outcome。

### 13.6 Stringly typed status/error

```ts
// 禁止
Promise<{ status: 'failed'; error?: string }>;
```

替代：

```ts
Promise<TurnOutcome>;
// completed | aborted | waiting_approval | failed:{ failure: TurnFailure }
```

### 13.7 Arbitrary public context

```ts
// 禁止
fail({ code, message, context: providerResponse as Record<string, unknown> });
```

替代：为每个 code 定义 typed details schema，并用 secret-negative fixture 验证。

## 14. 测试规范

### 14.1 Domain tests

断言：

- fault `kind`；
- domain value；
- state transition；
- invariant。

不断言 HTTP status、i18n 文案或 provider message。

### 14.2 Application tests

表驱动测试：

```text
domain fault / port failure
  -> operation outcome or public failure code/category/details/retryHint
```

必须覆盖每个 union member，并使用 exhaustive assertions。

### 14.3 Provider adapter tests

使用 provider fixture 测试：

```text
provider code/status/body
  -> MemoFlow outcome/failure
```

断言 provider code/message 不出现在 public payload。

### 14.4 Transport parity tests

同一 canonical fixture 通过 HTTP/IPC：

- data/outcome 相同；
- public code/category/typed details/retryHint 相同；
- HTTP status 仅 HTTP projection；
- unknown/internal failure safe；
- validation details 相同。

### 14.5 Presentation tests

- code → locale message；
- locale 切换无需重新请求；
- code → recovery action；
- raw message 不渲染；
- persisted receipt 无 secret/provider content；
- normal outcome 切换正确 scene/state。

### 14.6 E2E fixture

- fixture 通过 API/DB/global setup 建立；
- login helper 不自动注册；
- 不根据可见文案决定数据库动作；
- signup/login/verification/recovery 分开测试；
- build revision 在 suite 前校验。

## 15. 文件位置与 export

### 15.1 Feature package

```text
server/domain/faults/**
server/application/failures/**
server/application/outcomes/**
server/infrastructure/adapters/<provider>/**failure*.ts
server/transport/http/**failure-http*.ts
```

### 15.2 Contracts

```text
modules/<feature>/api/**
modules/<feature>/failures.ts
modules/<feature>/outcomes.ts
modules/<feature>/events/**
result/public-failure.ts
result/failure-category.ts
result/retry-directive.ts
```

### 15.3 Export policy

- feature root 可以导出 public application/client ports 和 contract-facing types；
- provider mapper/concrete error 不从 root 导出；
- domain fault 只在需要 application mapping 时包内导出；
- contracts subpath 导出 public wire types；
- 不通过 `@memoflow/utils/errors` 汇总 feature semantics。

## 16. 迁移规则

### 16.1 新代码

从本规范生效起：

- 禁止新增 `DomainError` subclass；
- 禁止新增 message branching；
- 禁止新增 provider code 跨 adapter 使用；
- 新 public operation 必须 typed failure/outcome；
- 新 feature code 必须注册 i18n/transport/test metadata。

### 16.2 旧代码

迁移一个 operation 时必须完整闭合：

```text
provider/domain source
  -> application mapping
  -> contracts
  -> HTTP/IPC
  -> client
  -> presentation/i18n
  -> tests/governance
```

禁止只改其中一层并留下 alias dual-track。

### 16.3 兼容 alias

确需兼容旧 code：

```ts
const LegacyAuthFailureAliases = {
  UNAUTHORIZED: 'AUTH_INVALID_CREDENTIALS',
} as const;
```

必须有：

- owner；
- reason；
- source consumers；
- removal condition；
- retire date；
- compatibility test。

## 17. Code Review Checklist

### Ownership

- [ ] 这是 Domain Fault、Outcome、Public Failure、Provider Failure、Transport 或 Diagnostic 中的哪一种？
- [ ] 类型位于正确的 owning feature/contract/adapter 吗？
- [ ] 是否错误地放进 shared/utils/contracts？

### Semantics

- [ ] 正常下一步是否被建模为 outcome，而不是 error？
- [ ] public code 是否为 MemoFlow-owned，且 operation-specific？
- [ ] category、retryHint、operation retry policy 与 recovery action 是否分别明确？
- [ ] code 是否可能泄漏资源存在性或敏感信息？

### Boundary

- [ ] provider code/status/message 是否止于 adapter？
- [ ] HTTP status 是否只在 transport mapping？
- [ ] public payload 是否 JSON-safe、无 cause/stack/token？
- [ ] HTTP/IPC 是否保持 parity？

### Presentation

- [ ] UI 是否保存 code/outcome 而非 message？
- [ ] 所有 locale 是否覆盖？
- [ ] locale 切换是否可重新翻译？
- [ ] recovery 是否基于 code/outcome/typed details，而不是 message 或 retry hint？

### Verification

- [ ] domain/application/adapter/transport/UI tests 是否各自只验证自己的责任？
- [ ] 是否新增或更新 registry/governance fixture？
- [ ] 是否避免 raw message snapshot 成为 contract？
- [ ] compatibility alias 是否有退役条件？
- [ ] 新库是否通过 approved spike，且没有成为 contract owner？
- [ ] 自动 retry 是否同时验证了 idempotency、attempt budget 与 durable side-effect state？

## 18. 最小示例：完整垂直链路

```ts
// 1. Domain
export type RenameGoalFault =
  | { kind: 'GoalArchived'; goalId: GoalId }
  | { kind: 'GoalNameTooLong'; maxLength: number };

// 2. Contracts
export type RenameGoalFailure =
  | PublicFailure<'GOAL_RENAME_REJECTED', { reason: 'archived' }>
  | PublicFailure<'GOAL_NAME_INVALID', { maxLength: number }>;

export type RenameGoalOutcome = {
  kind: 'renamed';
  goal: GoalSnapshot;
};

// 3. Application mapper
export function mapRenameGoalFault(fault: RenameGoalFault): RenameGoalFailure {
  switch (fault.kind) {
    case 'GoalArchived':
      return {
        code: 'GOAL_RENAME_REJECTED',
        category: 'conflict',
        details: { reason: 'archived' },
        retryHint: { kind: 'not_retryable' },
      };
    case 'GoalNameTooLong':
      return {
        code: 'GOAL_NAME_INVALID',
        category: 'validation',
        details: { maxLength: fault.maxLength },
        retryHint: { kind: 'not_retryable' },
      };
  }
}

// 4. HTTP
export const RenameGoalHttpPolicy = {
  GOAL_RENAME_REJECTED: { status: 409 },
  GOAL_NAME_INVALID: { status: 422 },
} satisfies FailureHttpPolicy<RenameGoalFailure['code']>;

// 5. UI
const messageKey = {
  GOAL_RENAME_REJECTED: 'goal.errors.renameRejected',
  GOAL_NAME_INVALID: 'goal.errors.nameInvalid',
} satisfies Record<RenameGoalFailure['code'], string>;
```

这条链路中，domain 不知道 HTTP，contracts 不知道 provider，HTTP 不决定业务 code，UI 不读取 raw
message，observer 仍可记录内部 cause。该结构是 MemoFlow 后续所有 operation 的目标模板。
