---
tags:
  - adr
  - event-bus
  - emittery
  - event-driven
  - reliable-messaging
description: Runtime-local EventBus 采用 Emittery 的 delivery-scoped async publish，保留 send 通知语义并移除全局 awaitDrain 状态
created: 2026-08-25T19:05:00+08:00
updated: 2026-09-08T09:00:00+08:00
---

# ADR-064: Runtime EventBus 采用 Emittery 与 Delivery-scoped Async Publish

**状态：** 已采纳并实施
**日期：** 2026-08-25  
**影响范围：** utils、patterns、所有通过 `createEventBusAdapter()` 发布 domain event 的 server repositories  
**关联：** ADR-003、ADR-033、ADR-042、ADR-058

## 2026-09-08 实现状态

Emittery 仍是唯一 runtime-local EventBus implementation；业务通知使用 `send()`，需要等待本次 delivery handlers 的基础设施边界使用 `dispatch()`。HARD-7102/7103 回归未发现旧 mitt-RPC/global drain 路径复活。

## 1. 背景

MemoFlow 已在 ADR-033 固定三类跨模块通信语义：

```text
notification-style reaction → EventBus
same-process request/response → Port
cross-process request/response → HTTP / Electron IPC
```

当前 `CrossPlatformEventBus` 使用 `mitt`。`mitt` 很适合作为极小型同步 emitter，但 MemoFlow 后来为了让 reliable publisher 能等待 async subscribers，自行增加了：

```text
inFlight: Set<Promise>
pendingErrors: unknown[]
awaitDrain()
```

`createEventBusAdapter()` 再通过：

```text
send(event)
await awaitDrain()
```

把它作为 Repository / Outbox 路径的交付边界。

问题是 `inFlight` 与 `pendingErrors` 属于整个 bus，而不是单次 delivery。当两个 publish 并发时，某次 drain 可能观察到另一事件的 promise/error，无法建立严格的 per-delivery ownership。

与此同时，市场上已经有成熟 async-first emitter，不应继续自研这层并发 bookkeeping。

## 2. 决策

### 2.1 Runtime-local EventBus 底层改用 Emittery

`@memoflow/utils` 使用 `emittery@^2.0.0`，移除 MemoFlow EventBus 对 `mitt` 的直接依赖。

理由：Emittery 原生提供：

- Node / Browser；
- TypeScript event maps；
- async-first listener execution；
- 每次 `emit()` 独立 Promise；
- concurrent listeners；
- 等待所有 listeners 完成；
- `AggregateError` 收集 listener failures；
- unsubscribe / AbortSignal / disposable cleanup。

MemoFlow 不向业务代码暴露 Emittery v2 的 `{ name, data }` listener envelope；adapter 继续暴露既有 payload-first contract。

### 2.2 保留 `send()` 的通知式语义

```ts
send(eventType, payload, metadata?): void
```

仍表示：

> 发布一个 runtime-local notification，publisher 不等待 subscribers，也不从 subscribers 获取返回值。

Subscriber failure 被记录并隔离，不同步冒泡给 publisher。

Emittery listeners 总是在后续 microtask 运行，因此调用方不得依赖 `send()` 返回前完成 subscriber side effect。这与 ADR-033 的 notification semantics 一致。

### 2.3 新增 `dispatch()` 作为 awaited delivery seam

```ts
await dispatch(eventType, payload, metadata?)
```

`dispatch()` 只等待**当前这次 delivery** 的 subscribers。

如果 handler throw/reject：

- 同次 delivery 的其他并行 handlers 仍可运行完成；
- Promise 最终 reject；
- reliable publisher 可以阻止 ack / 进入 retry 或 fallback。

### 2.4 Repository adapter 直接使用 `dispatch()`

`createEventBusAdapter()` 从：

```text
sender.send()
+ sender.awaitDrain()
```

改为：

```text
await sender.dispatch()
```

`awaitDrain()` 被 retire，不提供兼容层；继续保留它反而会重新引入“bus-global drain”这一错误抽象。

### 2.5 Runtime EventBus 不承担 durable / distributed messaging

`GlobalEventBus` 只是当前 JavaScript runtime 的 singleton。

```text
API process       ≠
Electron main     ≠    shared EventBus
Browser renderer  ≠
```

跨进程与 durable delivery 继续使用现有专用机制：

```text
HTTP / IPC
SSE / PowerSync invalidation
transactional/domain-specific Outbox
worker / retry / receipt / idempotency
```

本 ADR 不引入 Redis、NATS、Kafka，也不以 Emittery 替代 Outbox。

### 2.6 不绑定未来 Plugin Kernel

Cordis / DeepSeek Harness 的 plugin-scoped events/effects 很有参考价值，但 MemoFlow 当前正式决定暂缓全面插件化。

因此 EventBus 不引入 Cordis dependency。未来若 Plugin Kernel 重新启动，应通过 adapter/extension boundary 再评估 Cordis events，而不是让 domain events 今天就依赖未来框架。

## 3. 受保护 Contract

保持：

- `AppEventRegistry` / feature event maps；
- `CrossPlatformEventBus`；
- `GlobalEventBus` 与 `eventBus` export；
- `send()` caller API；
- payload-first `on()` / `off()`；
- `EventDeliveryMetadata`；
- `IEventBus.publish(): Promise<void>`；
- Repository event publish failure fallback；
- ADR-033 的 Event / Port / IPC-HTTP 分类。

退休：

- EventBus 直接使用 `mitt`；
- `inFlight`；
- `pendingErrors`；
- `awaitDrain()`。

## 4. Consequences

### 正面

1. 并发 publish 的 completion/error 具有严格 delivery ownership。
2. 删除自研 async promise tracking，减少基础设施并发状态。
3. 同一次 delivery 的多个失败不会被静默丢失；单失败保持历史原始 error，多失败以 aggregate failure 表达。
4. 保持上层 event contracts 与 Repository API 不变。
5. Node/Browser 共用同一成熟 implementation。
6. 不与未来 Cordis/Plugin Kernel 决策绑定。

### 代价 / 行为变化

1. `send()` subscribers 从“可能同步执行”统一变成后续 microtask 执行。
2. `dispatch()` 单一 subscriber failure 保持原始 error；多个 subscriber 同时失败时为 aggregate failure，调用方不应假定只有第一个 handler error。
3. `CrossPlatformEventBus` 为保持原有 payload-first `off(handler)` contract，仍需要维护一层 handler → unsubscribe tracking。
4. Emittery 是 third-party dependency，需要由 lockfile / dependency governance 管理。

## 5. 验证要求

必须长期保持以下 characterization：

- fire-and-forget send 不抛 subscriber error；
- failing subscriber 不阻止同 delivery 其他 subscriber；
- async rejection 不产生 unhandled rejection；
- dispatch 等待所有 handlers；
- concurrent dispatch 的 completion/error 互不污染；
- metadata contract 保持；
- `off()` / `destroy()` cleanup 保持；
- Repository adapter 使用 `dispatch()`，不重新引入全局 drain。

首批实施验证：

```text
utils typecheck                    PASS
patterns typecheck                 PASS
utils tests: 17 files / 144 tests  PASS
patterns tests: 6 files / 35 tests PASS
schedule typecheck                   PASS
schedule reliable-delivery integration: 6 / 6 PASS
root typecheck: 35 projects           PASS
docs check                           PASS
governance check                     PASS
```

## 6. References

- ADR-033 — Cross-Module Communication Patterns
- ADR-042 — Unified Business Operation and Delivery Contracts
- ADR-058 — OSS-first Standard Capability Reuse
- Emittery: <https://github.com/sindresorhus/emittery>
- Emittery npm: <https://www.npmjs.com/package/emittery>
- Medusa Event Module: <https://docs.medusajs.com/resources/infrastructure-modules/event>
- DeepSeek Harness architecture: <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- 调研与实施证据：`docs/analysis/2026-08-25-runtime-event-bus-oss-study-and-emittery-refactor.md`
