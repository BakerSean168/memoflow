---
tags:
  - adr
  - architecture
  - contracts
  - domain
  - error-handling
  - outcomes
description: 领域故障、应用结果、公开失败契约、provider 适配和传输映射的所有权决策
created: 2026-08-17
updated: 2026-08-17
---

# ADR-049: Domain Outcomes and Failure Contracts / 领域结果与失败契约

**状态**：已采纳并实施（ACR-R03 设计 Gate 与 #234～#241 closure）

**日期**：2026-08-17

**研究依据**：[失败契约库与开源实现研究](../../analysis/2026-08-17-failure-contract-library-and-open-source-study.md)

**实验依据**：[Failure Contract Spike Evidence and Design Gate](../../analysis/2026-08-17-failure-contract-spike-evidence.md)

## 1. 背景

MemoFlow 已采用 `Result<T>`、`HttpResponse<T>`、`IpcResult<T>`、ExecutionContext、
HTTP/IPC adapter parity 和 feature package 分层，但现有错误模型仍把多个层级混在一起：

- `ResultError.code` 是 `ResultCode | string`，feature/provider/transport code 可任意进入；
- `ResultError` 同时允许 public `message/details/context` 和 internal `cause`；
- `DomainError` 同时携带领域 code、HTTP status、timestamp、operationId、step、原始异常、
  API JSON 和日志格式；
- `packages/contracts/src/result/http.ts` 在 shared contracts 内维护 HTTP status 映射；
- UI 和 E2E 部分路径依赖 raw `message`；
- provider code/status 在 Auth、Repository、AI 等 application/presentation 路径中被直接判断；
- “需要邮箱验证”“等待审批”等正常下一步被建模为 error；
- ADR-010/017 要求绝对类型中心化，使 contracts 同时承担 wire DTO、领域实体接口、协议、
  schema 和内部业务类型。

Auth 登录错误映射回归证明：保留 provider code 可以避免信息损失，但如果没有 MemoFlow-owned
anti-corruption mapping，provider vocabulary 会直接泄漏到 UI、i18n 和测试。

本 ADR 决定整个应用的 fault、outcome、failure、transport 和 diagnostic ownership，而不是只修 Auth。

在形成第一版草案后，本项目又完成了 TypeScript 库、RFC/AIP、Connect、OpenTelemetry、Temporal
以及 Lark CLI、Ardan Labs、Memos、Vendure 的设计研究。研究结论是：MemoFlow 不应引入一个新的
全局 Error runtime，而应保留自有 Result/Zod/envelope，只在穷尽 mapper 和复杂状态机热点选择性使用库。
同时，第一版把 retry 与 recovery 混合在一个 directive 中是不正确的，必须拆分。

## 2. 决策

### 2.1 采用六层语义模型与三类独立政策

MemoFlow 将失败相关语义拆分为六类：

| 层级                            | 责任                                              | 稳定性                  |
| ------------------------------- | ------------------------------------------------- | ----------------------- |
| Domain Fault                    | 表达领域不变量或状态转移拒绝                      | feature 内部稳定        |
| Application Outcome             | 表达用例成功及正常替代分支                        | operation contract 稳定 |
| Public Failure                  | 表达跨边界可处理的失败                            | wire/API 稳定           |
| Provider/Infrastructure Failure | 表达 SDK、DB、网络和第三方实现细节                | adapter 私有            |
| Transport Projection            | 将 public failure 映射为 HTTP/IPC/SSE             | transport-local         |
| Diagnostic Failure              | 保存 cause、stack、provider body、内部 attributes | 仅日志/trace            |

任何类型不得同时承担全部层级。六层语义之外，重试与恢复再拆成三类独立政策：

1. `FailureRetryHint`：服务端/adapter 对失败暂态性的事实描述；
2. `OperationRetryPolicy`：由调用 operation/executor 根据幂等性、transaction、attempt budget 和 deadline 决定；
3. `RecoveryAction`：由 application/presentation 根据 host 与用户上下文推导下一步。

Public Failure 不得单方面命令客户端自动重试一个非幂等写操作，也不得把 UI action 固化成 provider hint。

### 2.2 Domain Fault 归 owning feature domain

领域故障定义在：

```text
packages/<feature>/src/server/domain/faults/**
```

或同等 feature-owned domain 目录。

推荐使用 discriminated union、小型 value object 或 feature-specific typed exception。禁止要求所有
领域故障继承一个包含 HTTP/日志能力的全局 `DomainError`。

Domain Fault：

- 可以携带 domain value object 和不变量上下文；
- 不携带 HTTP status、i18n key、provider code、requestId、traceId、timestamp 或 stack payload；
- 默认不属于 public contract；
- 由 application mapper 决定是否、如何公开；
- 不因为跨包复用而自动移动到 `@memoflow/contracts`。

示例：

```ts
export type TaskDomainFault =
  | { readonly kind: 'TaskAlreadyCompleted'; readonly taskId: TaskId }
  | { readonly kind: 'TaskArchived'; readonly taskId: TaskId }
  | { readonly kind: 'TaskHierarchyCycle'; readonly parentId: TaskId };
```

### 2.3 Application Outcome 归 owning feature application/public contract

Application use case 必须明确区分：

1. 完成的成功结果；
2. 需要调用方采取下一步的正常结果；
3. 失败。

正常替代结果使用 discriminated union，不使用 generic error code：

```ts
export type SignInOutcome =
  | {
      readonly kind: 'authenticated';
      readonly account: CloudAccountSummary;
      readonly session: CloudSessionSummary;
    }
  | {
      readonly kind: 'email_verification_required';
      readonly email: string;
    };
```

适用场景包括但不限于：

- email verification required；
- waiting approval / interrupted；
- accepted for durable processing；
- user confirmation required；
- conflict resolution choice required；
- device/OAuth flow waiting for user action。

Application 层负责：

- Domain Fault → operation outcome/public failure；
- infrastructure port failure → public failure；
- operation-specific retry policy 与 recovery semantics；
- operation-specific state transition。

### 2.4 Public Failure 归 feature contract，通用类别归 shared result contract

跨边界稳定失败定义在：

```text
packages/contracts/src/modules/<feature>/failures.ts
packages/contracts/src/modules/<feature>/outcomes.ts
```

或 feature contract 下等价的 operation-specific 文件。

通用 JSON-safe primitive 定义在 `@memoflow/contracts/result`：

```ts
export type FailureCategory =
  | 'validation'
  | 'unauthenticated'
  | 'permission'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'unavailable'
  | 'timeout'
  | 'canceled'
  | 'internal';

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
```

每个 feature 拥有自己的 code union，例如：

```ts
export type AuthFailureCode =
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_USER_ALREADY_EXISTS'
  | 'AUTH_ACCOUNT_CLOSED'
  | 'AUTH_RATE_LIMITED'
  | 'AUTH_PROVIDER_UNAVAILABLE';
```

禁止建立一个包含所有 feature code 的全局巨型 enum。Shared result 只拥有 category 和 envelope primitive。

每个 public code 的 `details` 必须绑定具体 Zod schema，不允许把
`Record<string, unknown>`、provider body 或任意 context 作为公开扩展。Registry 应从一个定义推导
code union、schema、HTTP policy、i18n、telemetry 和文档，禁止平行维护多份手工 map。

### 2.5 Failure hint、operation retry policy 与 recovery action 分离

```ts
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

自动 retry 必须同时满足：failure retry hint、operation policy、幂等/transaction 状态、attempt budget、
deadline 与 cancellation 状态。`Retry-After` 是 transport/server fact，不是非幂等 operation 的自动执行许可。

### 2.6 Result 保持泛型，但 public error 必须可收窄

`Result<T, E>` 继续作为 application/client/transport boundary 的标准结果：

```ts
export type Result<T, E extends PublicFailure = PublicFailure> =
  | { readonly ok: true; readonly data: T; readonly meta?: ResultMeta }
  | { readonly ok: false; readonly error: E; readonly meta?: ResultMeta };
```

迁移期保留当前 `ResultError` 和 envelope shape，但新 feature/新 operation 必须提供具体 failure generic。
现有 `ResultError.code: string` 不再被视为目标设计。

### 2.7 Public Failure 与 Diagnostic Failure 类型隔离

Public Failure 必须：

- JSON-safe；
- 不含 `cause`、Error instance、stack、provider response、SQL、token 或任意未审计 context；
- params/details 使用 operation schema allowlist；
- 可通过 HTTP、IPC、durable receipt 安全传输。

内部诊断信息使用独立对象或 observer API：

```ts
export interface DiagnosticFailure {
  readonly operation: string;
  readonly cause?: unknown;
  readonly provider?: string;
  readonly providerCode?: string;
  readonly attributes?: Record<string, unknown>;
}
```

`DiagnosticFailure` 不能成为 HTTP/IPC contract，也不能持久化到用户可读取的 receipt。
requestId/traceId 继续由 `ResultMeta` / ExecutionContext / observer 管理，不进入 Domain Fault。

### 2.8 Provider errors 必须止于 infrastructure anti-corruption layer

BetterAuth、Prisma、GitHub、OpenAI-compatible provider、PowerSync、filesystem、Electron native API 等
错误只能在 infrastructure adapter 中解析。

Adapter 输出 MemoFlow-owned outcome/failure：

```text
BetterAuth EMAIL_NOT_VERIFIED
  -> Auth SignInOutcome.email_verification_required

BetterAuth INVALID_EMAIL_OR_PASSWORD
  -> AUTH_INVALID_CREDENTIALS

GitHub 404 in selected operation
  -> REPOSITORY_NOT_FOUND

Prisma P2002 in create operation
  -> feature-specific conflict failure
```

Application、UI 和 E2E 不得 import provider error class、依赖 provider code、解析 provider message 或
直接判断 provider HTTP status。

### 2.9 HTTP status 归 HTTP adapter，不归 domain/contracts primitive

`FailureCategory` 提供 transport-neutral default semantics。HTTP adapter 负责：

- category → default status；
- operation/code → explicit override；
- `Retry-After`、authentication challenge、cache/header policy；
- safe response serialization。

IPC/SSE 使用自己的 projection。`@memoflow/contracts/result` 不再是 feature-specific HTTP status
registry 的长期 owner。

兼容期保留当前 `ResultCodeToHttpStatus`，但新增 feature public code 必须通过 feature HTTP registry 或
category mapping，不再扩张全局 string map。

### 2.10 UI 只根据 stable semantics 本地化和恢复

Presentation state 可以保存：

- outcome `kind`；
- public failure `code/category/details/retryHint`；
- operation-owned retry state；
- application/presentation-derived recovery action；
- safe request/trace reference。

禁止保存或根据以下内容分支：

- provider message；
- arbitrary server message；
- English substring；
- HTTP status 单独推断业务原因。

locale 改变时，UI 根据 code + typed details 重新计算文案。`message` 在兼容期只是安全 fallback，
不是状态真值；recovery 也不得从 translated message 或 retry hint 推导。

### 2.11 contracts 采用 Boundary-First，而非 Absolute Type Centralization

以下内容必须在 contracts：

- 跨 package/process/language 的 request/response schema；
- public operation outcome/failure；
- durable message/event schema；
- HTTP/IPC canonical input/output；
- external client/application port；
- serialization-safe snapshot/primitive。

以下内容默认不在 contracts：

- domain aggregate/entity interface；
- domain fault；
- repository implementation/private port；
- provider/Prisma row；
- UI component props；
- feature-internal helper types；
- logger/trace/cause object。

Domain model 是业务不变量的 source of truth，contracts 是边界投影。两者通过命名 mapper 连接，不要求
Domain class `implements` wire DTO。

### 2.12 组合根和跨 feature 依赖使用 Port/Contract

跨 feature orchestration 必须依赖 consumer-owned port 或 feature public application port，由 apps/runtime
composer 注入 adapter。禁止通过解析对方异常/message 获得业务语义。

长期将 feature Nx tag 从误导性的 package-level `layer:domain` 调整为 vertical feature tag；包内
source-layer 依赖由 AST governance 执行。

### 2.13 库采用边界与设计验证结论

ACR-R02 隔离实验和 ACR-R03 Gate 已完成。本 ADR 的 library 决策如下：

| 方案                                 | 决策                                                              |
| ------------------------------------ | ----------------------------------------------------------------- |
| TypeScript discriminated union + Zod | 采用；Zod details 必须 strict，只依赖公共 API                     |
| native `switch + assertNever`        | 采用；作为 mapper 和 reducer 的默认穷尽模式                       |
| `ts-pattern`                         | 延期；本轮不加入依赖，未来仅允许 bounded benchmark 后单独提出     |
| `neverthrow`                         | 拒绝作为依赖；不替换 MemoFlow Result，只借鉴 combinator 思想      |
| XState                               | Auth 不采用；复杂 nested/parallel/invoked workflow 需新 ADR/spike |
| Effect                               | 本轮拒绝作为全仓底座                                              |
| RFC 9457 / Connect / Temporal        | 借鉴语义与 retry/projection 模型，不替换 transport/runtime        |

任何 library type 不得成为 MemoFlow wire contract、Domain Fault identity 或 durable fact 的 owner。
生产实现从 ACR-001 起解锁；后续每批仍必须遵循 active plan 的 protected contracts、review 和 repair gate。

## 3. 命名与位置规则

### 3.1 命名

| 概念                | 后缀/字段                                             |
| ------------------- | ----------------------------------------------------- |
| Domain fault union  | `*DomainFault`，discriminator `kind`                  |
| Public failure code | `*FailureCode`，大写稳定 code                         |
| Public failure type | `*Failure`                                            |
| Normal outcome      | `*Outcome`，discriminator `kind`                      |
| Provider mapper     | `map<Provider>Error` / `<provider>-failure.mapper.ts` |
| Domain mapper       | `map<Feature>FaultToFailure`                          |
| HTTP map            | `<feature>-failure-http.ts`                           |
| UI localization     | `getLocalized<Feature>Failure` 或 registry            |

### 3.2 推荐目录

```text
packages/task/src/server/domain/faults/
packages/task/src/server/application/failures/
packages/task/src/server/infrastructure/adapters/prisma/prisma-task-failure.mapper.ts
packages/task/src/server/transport/http/task-failure-http.ts
packages/contracts/src/modules/task/outcomes.ts
packages/contracts/src/modules/task/failures.ts
```

目录名可按 feature 现有结构调整，但所有权不得改变。

## 4. 兼容迁移

### 4.1 兼容期 wire shape

第一阶段不破坏：

```ts
{ ok: false, error: { code, message, details?, context? }, meta? }
```

但要求：

- `code` 来自 MemoFlow registry；
- `message` 是安全 fallback；
- `context` 逐步替换为 per-code typed `details`；
- `cause` 不进入 serializer；
- client/UI 不再 branch on message。

### 4.2 Auth 作为首个 vertical slice

Auth 迁移顺序：

1. BetterAuth code → adapter-private mapping；
2. `EMAIL_NOT_VERIFIED` → `email_verification_required` outcome；
3. invalid credentials → MemoFlow public failure；
4. Web/Desktop consuming same outcome/failure；
5. i18n by public code；
6. E2E deterministic fixture；
7. provider code leakage governance。

### 4.3 `DomainError` 退役

不得一次删除所有 subclass。迁移方式：

1. 禁止新 feature subclass；
2. 将 HTTP/diagnostic fields 标记 legacy；
3. feature-by-feature 引入 domain fault + application mapper；
4. transport 不再读取 `DomainError.httpStatus`；
5. 清零引用后删除基类。

### 4.4 contracts 收缩

不执行一次性大搬家。每个 feature 在修改相关能力时分类：

- wire/public contract：保留；
- domain type：迁回 feature；
- duplicated type：选择 owner 并用 mapper；
- provider/infra type：迁回 adapter；
- unused/legacy：删除。

迁移期间通过 subpath compatibility alias 保持调用方可逐步更新；alias 必须有 retire date。

## 5. Governance 要求

必须新增机器门禁：

1. single-source public failure registry/schema/HTTP/i18n coverage；
2. provider code 只允许出现在 adapter/fixture allowlist；
3. production `message.includes/match` failure branching 禁止；
4. `throw new Error(result.error.message)` 禁止；
5. UI public failure i18n coverage；
6. HTTP/IPC projection coverage；
7. public failure JSON-safety 与 per-code details schema；
8. unknown code fail-closed diagnostics；
9. compatibility alias owner/retire date；
10. mutation fixture 证明删除 mapper/registry 会使 gate 失败；
11. failure retry hint 不得绕过 operation idempotency/attempt policy；
12. library adoption 必须符合本 ADR 的 approved scope。

## 6. 被取代或修订的决策

- **ADR-017 Absolute Type Centralization**：被本 ADR 取代。以后只集中边界契约，不集中所有领域类型。
- **ADR-010 Centralized Contracts**：被修订。“共享”限定为跨边界/public contract，不包括 Domain ↔ Infra
  只因跨层使用的内部类型。
- **ADR-012 Error Handling**：被修订。取消全局 AppError/DomainError 携带 HTTP 的目标，改为六层模型。
- **ADR-030 Result Pattern**：保留 Result 作为 application boundary，但不要求所有 domain/internal control
  flow 都使用同一个 untyped `ResultError`。
- **ADR-048 Transport Contract Parity**：继续有效；本 ADR 为 parity 增加 public failure/outcome 语义要求。

## 7. 拒绝的方案

### 7.1 一个全局 `ErrorCode` enum

拒绝。它会成为跨 bounded context 的中央修改点，并混合 provider、domain、application 和 transport code。

### 7.2 把所有错误 class 移到 contracts

拒绝。Error instance、stack、cause 和继承层级不是稳定 wire contract。

### 7.3 只增加 i18n key 覆盖 provider code

拒绝。虽然能修复当前 UI，但会把 BetterAuth/GitHub/OpenAI vocabulary 固化成 MemoFlow public API。

### 7.4 所有 domain method 统一返回 Result

拒绝。Result 是边界语言；领域内部可以使用更贴近模型的 decision/fault。统一形状不等于统一语义。

### 7.5 继续用 message 作为 fallback protocol

拒绝。message 可以临时展示，但永远不能承担分支、retry、status 或 fixture 协议。

### 7.6 将所有映射放入 `packages/utils/errors`

拒绝。通用工具包不能拥有每个 feature 的 business semantics。Mapper 必须靠近 owning boundary。

## 8. 影响

### 正面

- provider 升级只影响 adapter；
- Web、Desktop、HTTP、IPC 使用同一业务语义；
- locale 和文案变化不改变行为；
- domain 不再依赖 HTTP/日志；
- public failure 可进行 schema、security 和 compatibility 检查；
- contracts 变化原因更单一；
- feature code 不再默认掉入 500；
- E2E 可按 outcome/state 测试，而不是猜 message；
- governance 可以在合并前阻止同类问题。

### 代价

- 需要显式 mapper 和 registry；
- 同一业务原因可能同时存在 domain fault identity 与 public failure code，但二者职责不同；
- contracts 收缩和 `DomainError` 退役需要多阶段迁移；
- 兼容期会短暂存在 legacy `message/context` 与新 `params/category`；
- 每个 feature 必须维护自己的 failure vocabulary 和 transport projection tests。

## 9. 研究与参考

- [失败契约库与开源实现研究](../../analysis/2026-08-17-failure-contract-library-and-open-source-study.md)
- RFC 9457: <https://www.rfc-editor.org/rfc/rfc9457.html>
- Google AIP-193: <https://google.aip.dev/193>
- Google AIP-194: <https://google.aip.dev/194>
- Connect errors: <https://connectrpc.com/docs/web/errors/>
- OpenTelemetry error recording: <https://opentelemetry.io/docs/specs/semconv/general/recording-errors/>
- Temporal retry policies: <https://docs.temporal.io/encyclopedia/retry-policies>
- Lark CLI error contract: <https://github.com/larksuite/cli/blob/main/errs/ERROR_CONTRACT.md>
- Memos auth/client: <https://github.com/usememos/memos>
- Vendure expected errors: <https://docs.vendure.io/guides/developer-guide/error-handling/>

## 10. 验收标准

本 ADR 被视为实施完成，必须满足：

- [ ] 库/开源研究、三个 design spike 与 adopt/borrow/defer/reject 记录完成；
- [ ] Auth vertical slice 不暴露 BetterAuth code/message；
- [ ] 至少 Auth、Account、Repository、AI、Task 完成 typed public failure/outcome 迁移；
- [ ] production message-based branch inventory 清零或全部有到期 allowlist；
- [ ] UI 不直接展示任意 `result.error.message`；
- [ ] `DomainError` 不再携带或决定 HTTP status；
- [ ] feature public codes 有 registry、schema、i18n 和 HTTP/IPC coverage；
- [ ] contracts 中 domain/interface inventory 有 owner 分类并持续下降；
- [ ] provider code leakage、raw message rethrow 和 JSON-safety governance 接入主门禁；
- [ ] current Result/HTTP/IPC protected contracts 有明确 migration/compatibility tests；
- [ ] API/Desktop/local Docker build identity 与源码 revision 可验证一致。
