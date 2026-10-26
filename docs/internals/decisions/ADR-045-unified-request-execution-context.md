---
tags:
  - adr
  - architecture
  - request-context
  - observability
  - ai
description: 统一 HTTP/IPC/System 的 Request/Execution Context 决策（RefArch Phase 2）
created: 2026-08-15T00:00:00
updated: 2026-08-15T00:00:00
---

# ADR-045: 统一 Request/Execution Context

**Status:** Accepted  
**Date:** 2026-08-15  
**Supersedes:** 无（Phase 2 冻结契约；延续 ADR-039 的 Better Auth 身份来源）

## Context

API、Electron IPC 与 system 入口各自构造“上下文”，但字段重叠而不一致：

- HTTP adapter 从 request/body 组装旧 `Context`（identityId/deviceId/device）；
- IPC adapter 默认返回静态 `{ identityId: '', deviceId: 'desktop' }` stub；
- governance 维护第三份 branded `ExecutionContext`；
- AI 路由多处 `{ identityId } as ExecutionContext` 丢弃 request metadata，use case 再用局部 `requestId` 兼作 run/log/proposal reference。

结果：API 与 Python AI service 的日志无法用同一个 `requestId` 关联，Principal 与 request metadata 也没有单一汇合点。

## Decision

### 1. 唯一 canonical 类型

- `packages/contracts/src/shared/execution-context.ts` 冻结唯一 `ExecutionContext` interface body：
  `RequestContext { requestId, traceId, startedAt, source }` 为必填，`ExecutionContext` 再必填 `identityId`，外加可选 `deviceId?`、`device?`、`agentRunId?`、`threadId?`、`checkpointId?`。
- `Context` 只是 `ExecutionContext` 的 deprecated alias；governance 不再维护私有 body。
- `requestId`/`traceId`/`startedAt`/`source` 必须 required；禁止用 optional 字段维持 identity-only 调用。
- `startedAt` 是 entry 创建的 Unix epoch 毫秒；`source` 是 `http | ipc | system`，向下游传播不得改成 `internal`。
- context 只放 request/run-scoped metadata；不放 Prisma、repository、authorization、emailVerified、sessionId、approvalState 或业务 aggregate。

### 2. HTTP 入口 producer

- 新增全局 RequestContext middleware（`request-context.middleware.ts`），作为第一个 `app.use`，早于 Helmet/CORS/body/auth/route/error handler。
- incoming `X-Request-Id` 仅在 trim 后匹配 `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$` 时接受；缺失/非法/重复/超长一律生成 UUID，绝不返回 400。
- 该 ID 只用于 correlation/logging，不是认证、授权、幂等键、run ID、proposal ID 或 checkpoint ID。
- middleware 在 `next()` 前写 `X-Request-Id` 响应头，因此 JSON、204、auth failure、404、500、SSE `flushHeaders()` 都回传同一值。
- `traceId === requestId` 是默认；只有显式启用 OpenTelemetry（`OTEL_TRACING_ENABLED=1`，见 ADR-047）时 `traceId` 才由 SERVER span 提供并可与 `requestId` 分离。
- incoming W3C `traceparent/tracestate` 只用于（opt-in）trace 续接，不是认证、授权、幂等键或安全边界；无有效 W3C context 时创建新 root span。
- 每个 HTTP attempt 恰好一条 terminal observation（finished/aborted）由同一个 observer 独占结算：结构化 request log、有界 HTTP metrics 与（opt-in）trace span 都来自这一次 settlement；finish 后 close 不二次结算。
- Phase 6 退役 `performance.middleware.ts` 的 `res.json` monkey patch、第二个 finish listener 与 `X-Response-Time` 响应头；terminal duration 以 observer 计算值为真值。

### 3. Principal 只在入口解析

- Cloud Auth middleware 仍只解析一次 Principal 并写 `req.user`；RequestContext middleware 不读取 auth。
- Express adapter（`expressAdapter` / `expressAdapterWithValidation`）在 seam 处合成完整 `ExecutionContext`（carrier + `req.user` + device metadata），envelope 从同一 carrier 读取 trace/start。
- adapter 缺失 carrier 时 fail closed，不在 adapter 内生成第二个 request ID。
- IPC：`IElectronAuthContext.requireRequestContext()` 每次 invocation 解析一次 owner，返回完整 `ExecutionContext`（`source: 'ipc'`）；`createAuthenticatedIpcWrapper` 原样交给 handler。
- 无 transport 的 manifest/后台命令使用 `source: 'system'` context，每次生成独立 request ID。

### 4. AI/Python correlation

- AI 普通路由直接透传 adapter 的 `ctx`；SSE 专用路由使用共享 Express extractor 合成 context。
- 对 Python 的 outbound `requestId` 优先级：entry `cx.requestId` → 显式 internal/background caller ID → `AIServiceInternalClient` 内 `randomUUID()` fallback。
- 同一个 resolved ID 同时进入 structured logs、`AIServiceInternalRequestError.requestId` 与 `X-Request-Id`；body/header 不各生成一次。
- durable `runId`/`agentRunId`/proposal/confirmation reference/checkpoint ID/幂等键保持独立生命周期，不与 transport request ID 混用。
- HMAC canonical signing inputs（method/path/timestamp/body）不变；`X-Request-Id`/`X-Identity-Id` 不进入签名算法。

## Consequences

- Web/HTTP、Desktop IPC 与 Python AI service 可用同一个 `requestId` 检索日志。
- 所有 feature 的 context 都来自入口，Controller/Application 不再二次解析 Principal 或重建 context。
- 强制 required fields 带来迁移 blast radius：按 governance-first 顺序迁移 fixtures，不得用 `as ExecutionContext` 或 optional 字段掩盖。
- 默认（OTel 关闭）仍保持 `traceId === requestId`；引入 tracing 前不得分离二者。OTel enabled 时 `traceId`/`requestId` 拥有不同生命周期：request ID 持续用于 correlation/logging/幂等边界，trace ID 只用于 span 关联。

## Enforcement

- `packages/contracts/src/shared/dual-registry.surface.spec.ts` 的 fail-closed inventory：唯一 `ExecutionContext` body、无 identity-only casts、无 route-local request-ID producer、context 无业务对象字段。
- API smoke 覆盖 client-supplied/generated request ID、envelope trace、auth/404/SSE header echo。
- AI internal client 测试锁定精确 forward、single fallback、HMAC 不变、abort/error 携带 resolved ID。
