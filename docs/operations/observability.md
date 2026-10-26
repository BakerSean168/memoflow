# Observability 运维指南（RefArch Phase 6）

> 本指南覆盖 Phase 6 的可观测性能力：结构化日志、有界 `/metrics`、默认关闭的 OpenTelemetry opt-in 链路与共享模块装配契约的治理入口。默认部署**不需要**任何 collector。

## 1. 结构化日志

- 所有 API 日志都从同一个 provider（`@memoflow/utils/logger` 的 `WinstonLogger`）创建；`main.ts` preflight 在导入 server 依赖图之前调用幂等 `initializeLogger()`，因此 feature 模块级 logger 都是 provider-backed。
- 生产环境 console 输出为机器可解析 JSON；开发环境保留 pretty 格式。文件日志在 `LOG_DIR`（默认 `logs/`）下 `app-%DATE%.log` 与 `error-%DATE%.log`（daily rotate）。
- 每次 HTTP attempt 恰好一条 terminal log：
  - `request completed`（`outcome: finished`）或 `request aborted`（`outcome: aborted`）；
  - metadata 含 `requestId`、`traceId`、`method`、`routeTemplate`（带 `:id`，404 为 `__unmatched__`）、`statusCode`、`durationMs`、`source: http`，可选 `identityId`（仅 access log）。
- 用同一个 `requestId` 关联 API 与 Python AI service 日志（Python `RequestContextMiddleware` 回显 `X-Request-Id`）。

## 2. 读 `/metrics` / `/metrics/json`

- `GET /metrics`：Prometheus `text/plain; version=0.0.4`。核心 series：
  - `http_requests_total{method,route,status,outcome}`（counter）；
  - `http_request_duration_ms_bucket{...,le}`（histogram，cumulative，`+Inf == _count`）+ `_sum`/`_count`；
  - `process_memory_*`、`process_uptime_seconds`、`memoflow_operation_metrics`。
- `GET /metrics/json`：`HttpResponse<Result>` envelope，`summary` 按 request count 加权，`allMetrics` 含每 series 的 p50/p95/p99（每 key 固定上限 ring buffer）。
- label 只可能是 method/route/status/outcome；实体 ID、requestId、identity、query 绝不进入 label。若看到 `__unmatched__` 大量增长，说明 route 未被注册（404）。

```bash
curl -s http://localhost:3000/metrics | grep http_requests_total
curl -s http://localhost:3000/metrics/json
```

## 3. 启用外部 OTLP endpoint（opt-in）

默认 `OTEL_TRACING_ENABLED=0`：完全 noop，无 SDK 分配、无网络请求、`traceId === requestId`（ADR-045 行为不变）。

启用时需要**同时**配置 endpoint 与 service name，否则启动 fail-fast：

```bash
OTEL_TRACING_ENABLED=1 \
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318/v1/traces \
OTEL_SERVICE_NAME=memoflow-api \
pnpm nx run api:serve
```

- 每个 API attempt 产生一个 SERVER span；有效的 incoming `traceparent` 会被续接，否则创建新 root span。
- `RequestContext.traceId` 在启用时取有效 span trace ID；`requestId` 不变，二者生命周期不同。
- span attributes 只含 HTTP semantic fields、route template、status/outcome 与 request ID；body/query/header/identity 绝不写入。
- API → Python AI 的 internal HTTP 会额外带上 `traceparent`/`tracestate`（不进入 HMAC canonical payload），因此同一 trace 贯穿 API SERVER span 与 AI internal request。
- 关闭/回滚开关：设回 `OTEL_TRACING_ENABLED=0` 并重启即恢复 noop 路径；metrics/日志不受影响。

### 验证 trace propagation

启用后打两个请求并查看日志/SDK exporter 输出：

```bash
# 带 incoming W3C parent 的请求（验证续接）
curl -s -H 'traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' \
  http://localhost:3000/healthz
```

期望：`traceId` 为 incoming trace ID 且非 `requestId`；AI internal 调用携带同一 `traceId` 的 `traceparent`。

## 4. 敏感字段政策

- 日志 metadata：允许 `requestId`、`traceId`、`method`、`routeTemplate`、`statusCode`、`durationMs`、`identityId`。
- metrics label：只允许 `method`、`route`、`status`、`outcome`。
- span attributes：只允许 HTTP semantic fields、route template、status/outcome、request ID。
- **禁止**：request body、query values、cookie、Authorization、HMAC、provider key、知识正文、proposal payload、identity ID 进入 metrics label 或 span attribute。

## 5. 装配治理入口

- `pnpm nx run memoflow:governance-check` 包含 `architecture-surface-audit.mjs`（`READ_PORT_*`、`AI_APPROVAL_LIFECYCLE_ONLY`、`RELIABLE_RECEIPT_CANONICAL`）与 `public-surface-jsdoc-audit.mjs`。
- `architecture-surface-manifest.json` 声明所有被锁定 path/symbol；删除声明或绕过规则都会使审计变红。
- 双语 JSDoc 要求：所有本阶段公共导出都必须 English first / 中文 second，并带 `@param`/`@returns`/`@typeParam`/`@internal`。
