---
tags:
  - adr
  - architecture
  - observability
  - metrics
  - opentelemetry
  - module-contract
description: API 可观测性流水线与宿主装配治理（RefArch Phase 6）——single observer、有界 metrics、默认 noop / opt-in OpenTelemetry、transport-only 模块注册上下文
created: 2026-08-15T00:00:00Z
updated: 2026-08-15T00:00:00Z
---

# ADR-047: API 可观测性流水线与装配治理

**Status:** Accepted
**Date:** 2026-08-15
**Supersedes:** 部分延续 ADR-045（Request/Execution Context）；ADR-047 冻结 Phase 6 的可观测性流水线与装配治理契约。

## Context

Phase 2 已建立 canonical `RequestContext`（`requestId/traceId/startedAt/source`）与唯一的 `X-Request-Id`，但存在四个长期债：

1. **terminal 记录有两个 owner**：RequestContext middleware 负责 finish/abort 结构化日志，performance middleware 另包裹 `res.json`、监听 finish 并跳过 SSE——JSON/SSE/下载的 duration 与日志、metrics 可能不一致，`X-Response-Time` 只覆盖部分 response。
2. **metrics label 无界**：`req.route?.path ?? req.path` 会退化到 raw path，实体 ID 可能撑爆 Prometheus label；旧 `_avg/_p50/_p95/_p99` 输出不是合法 histogram exposition。
3. **trace 未建立 seam**：`traceId === requestId` 固定，无 W3C context、无 exporter、无 shutdown 顺序；要引入 OpenTelemetry 必须 opt-in 且默认零 collector 依赖。
4. **module registration context 暴露 `db`**：`IApiModuleContext extends ServerModuleContext<DatabaseClient>`，PowerSync/Dashboard 在 `register()` 读取 `context.db`，使 transport seam 可能变成第二个组合根。

## Decision

### 1. 单一 terminal observer

- RequestContext middleware 是每次 HTTP attempt 唯一 terminal settlement owner：finish → `finished`，close（无 finish）→ `aborted`，finish 后 close 不二次结算；SSE 正常/断开都进入同一 observer，不读取/包裹 stream body。
- 一次 settlement 产出单个 `HttpRequestObservation`，由 fan-out 消费：结构化 request logger、有界 metrics recorder、（opt-in）trace span；observer/span 异常由 platform logger 报告并隔离，绝不改变 response。
- `routeTemplate` 只来自 Express registered route template + mount path，保留 `:id`、移除 query；无法解析时固定 `__unmatched__`，绝不回退 raw `req.path/originalUrl/url`。
- `identityId` 只进入 access-log metadata，不进入 metrics label 或 span attribute。
- `durationMs` 由 canonical `RequestContext.startedAt` 与同一 injectable clock 计算。
- 退役 `performance.middleware.ts` 的 `res.json` monkey patch、第二个 finish listener、SSE skip 与 `X-Response-Time` 响应头。

### 2. 有界 metrics

- `http_requests_total{method,route,status,outcome}` 是 counter；`status` 使用实际三位 HTTP 状态码。
- `http_request_duration_ms` 是标准 histogram，bucket 固定为 `5,10,25,50,100,250,500,1000,2500,5000,10000,+Inf` 毫秒；`_bucket{le=...}` cumulative，同时输出 `_sum` 与 `_count`。
- 进程内 store 按有界 label key 聚合，不保存每 request 永久对象；`/metrics/json` 的 p50/p95/p99 只来自每 key 固定上限的 ring buffer，Prometheus 不把 quantile 伪装成 histogram。
- `/metrics` 保持 `text/plain; version=0.0.4`；`/metrics/json` 保持 `HttpResponse<Result>` envelope；`memoflow_operation_metrics` 与 process metrics 保留。
- 不把 requestId、identity、query 或实体 ID 放进 label。

### 3. Trace Port（OpenTelemetry opt-in）

- API platform 定义 `HttpRequestTrace`/`HttpRequestSpan` Port；默认 `NoopHttpRequestTrace` 不分配 SDK 对象、不发网络请求。
- `OTEL_TRACING_ENABLED=0`（默认）：忽略 incoming `traceparent/tracestate`，`traceId = requestId`（延续 ADR-045）。
- `OTEL_TRACING_ENABLED=1`：在导入 server graph 前初始化 Node SDK；有效 incoming W3C context 被继续，否则创建新 root span；`RequestContext.traceId` 取有效 span trace ID，`requestId` 仍来自 `X-Request-Id`/UUID 且不改变。
- 启用时必须显式配置 OTLP endpoint 与 service name，配置不完整 fail-fast；export 失败记录错误但不让业务请求失败。
- SERVER span attributes 只含 HTTP semantic fields、route template、status/outcome 与 request ID；禁止 body/query/header/identity/proposal content。
- API → Python AI internal HTTP 在 active context 注入 `traceparent/tracestate`，继续同时发送 `X-Request-Id` 与 HMAC headers；W3C headers 不进入 HMAC canonical payload。
- shutdown 顺序：停止接收/worker → module destroy → DB disconnect → trace forceFlush/shutdown → process exit。

### 4. 共享 module handle 契约

- `packages/contracts/src/shared` 新增 `ServerTransportModuleContext`（app/router/middleware/openApiRegistry，无 `db`）与 `ServerModuleHandle<TContext>`（name/register/destroy）；`IApiModuleContext extends ServerTransportModuleContext`，`IApiModule extends ServerModuleHandle<IApiModuleContext>`。
- 每个 feature `*ApiModuleDef` 显式 extends `ServerModuleHandle<*ApiModuleContext>`，options 必含 required `instance`；`register()` 只做 route/handler 绑定与已注入实例的 start，`destroy()` 只 dispose/stop 同一实例，保持一次注册、失败清理、幂等销毁状态机。
- `DatabaseClient` 只作为 bootstrap 私有依赖；PowerSync 改为 `composePowerSyncApiModule({ db, config? })`，Dashboard 改为 `composeDashboardApiModule({ dashboardReadPort, activityLedgerRuntime })`，DB-backed adapter/ledger 在 runtime factory 先绑定，Dashboard listener 随 `destroy()` 解绑。
- 不兼容旧模块长期保留 `context.db`；本阶段删除所有 `IApiModuleContext & ServerModuleContext<PrismaClient>` intersection。

### 5. 架构表面治理

- `tools/governance/architecture-surface-audit.mjs` + `architecture-surface-manifest.json` 以 TypeScript AST 锁定三组事实，manifest 完整性 fail-closed：
  - `READ_PORT_GOAL_TASK_BINDING` / `READ_PORT_AI_ANALYTICS` / `READ_PORT_AI_KNOWLEDGE_SOURCE`：消费者拥有契约、Application 只依赖抽象、API/Desktop composer 注入 adapter、消费者不 deep-import provider 基础设施。
  - `AI_APPROVAL_LIFECYCLE_ONLY`：Turn Engine/proposal capability 不含 `tool.mutation`，facade approve/revise/reject 仅生命周期，mutation 执行只走显式 approved/confirm 路径。
  - `RELIABLE_RECEIPT_CANONICAL`：`BusinessOperationReceipt`/`ProjectionOperation` 唯一 canonical body 在 contracts，manifest adapters 在输出边界调用 validator。
- `tools/governance/public-surface-jsdoc-audit.mjs` 覆盖本阶段公共表面：English first / 中文 second、`@param/@returns/@typeParam/@internal` 完整；两者都接入 `memoflow:governance-check`。

## Consequences

- 每次 HTTP attempt 恰好一条 terminal log、一份 metric、一个（opt-in）span；JSON/204/404/500/下载/SSE 全覆盖且 exactly once。
- `/metrics` 可直接被 Prometheus scrape，label 有界；默认部署无 collector 依赖。
- 全部 feature module 的注册上下文不再暴露 `db`，transport seam 无法成为第二个组合根。
- OpenTelemetry 是显式 opt-in 的能力；关闭时 Phase 2 request-ID correlation 行为完全不变。
- 代价：observer/审计随 API 演进需保持 route-template 解析与 manifest 与实现一致；启用 OTel 需额外配置 endpoint/service name。

## Enforcement

- 行为测试：`request-context.middleware.spec.ts`、observability specs、API smoke、metrics controller specs（Step 2/3）。
- 架构审计：`architecture-surface-audit.mjs`（rule IDs 见 manifest）、`public-surface-jsdoc-audit.mjs`；mutation fixtures 在 `tools/governance/__tests__/*.test.mjs`。
- 相关 ADR：ADR-025/031（module composition）、ADR-033（cross-module Ports）、ADR-035（AI approval）、ADR-042/043（reliable receipt）、ADR-045（request context）。
