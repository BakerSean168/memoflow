---
tags:
  - analysis
  - event-bus
  - emittery
  - event-driven
  - reliable-messaging
  - open-source
  - architecture
description: MemoFlow runtime-local EventBus 当前问题、Emittery/Cordis/Medusa 对照、事件分层决策与 Emittery 迁移实施证据
created: 2026-08-25T19:05:00+08:00
updated: 2026-08-25T19:05:00+08:00
---

# Runtime EventBus 开源调研与 Emittery 重构实施记录

> 调研与实施日期：2026-08-25  
> 状态：**已实施**  
> 核心结论：MemoFlow 不再继续扩展自研的 `mitt + inFlight + pendingErrors + awaitDrain()` async delivery；runtime-local EventBus 直接复用 Emittery。插件化与 Cordis 另行评估，不作为本次 EventBus 改造前提。

## 1. Executive Summary

本轮先重新检查 MemoFlow 当前代码，再对照 Emittery、Cordis / DeepSeek Harness、Medusa Event Module。最终决策不是重造一个“超级事件运行时”，而是把问题分层：

```text
业务模块中的事实通知
        ↓
Runtime-local Domain Events
        ↓
CrossPlatformEventBus
        ↓
Emittery

关键跨进程 / 可重试交付
        ↓
Durable Integration Events
        ↓
Transactional Outbox / Worker / Queue

服务端通知 UI 刷新
        ↓
SSE / IPC / PowerSync invalidation
```

本次只替换第一层的 async delivery implementation。

实施结果：

1. `mitt` 从 MemoFlow EventBus 的直接依赖中移除，`@memoflow/utils` 改用 `emittery@^2.0.0`。
2. 删除 EventBus 自己维护的全局 `inFlight`、`pendingErrors`、`awaitDrain()`。
3. 保留 `send()` 作为 ADR-033 的 fire-and-forget 通知入口。
4. 新增 `dispatch()` 作为 delivery-scoped async 发布入口；每一次 delivery 都由 Emittery 自己返回独立 Promise。
5. `createEventBusAdapter()` 的可靠发布从“`send()` + `awaitDrain()`”变成直接 `await dispatch()`。
6. 新增并发隔离、同步/异步失败、metadata、unsubscribe/destroy 等 characterization tests。
7. 明确 `GlobalEventBus` 仅是“当前 JavaScript runtime 单例”，不是 API + Desktop + Web 共用的 distributed bus。

这次重构解决的是一个非常具体的工程问题：**可靠发布不再依赖 bus-global drain state，因此两个并发 publish 不再互相等待、互相覆盖错误状态。**

---

## 2. 改造前：MemoFlow 实际在做什么

### 2.1 原实现不是单纯的 mitt

原始 `packages/utils/src/domain/cross-platform-event-bus.ts` 底层虽然使用 `mitt`，但 MemoFlow 已经在其上自行实现一层 async runtime：

```text
mitt
 │
 ├─ emitter.all.get(type)
 │
 ├─ 手工逐 handler invoke
 │
 ├─ inFlight: Set<Promise>
 │
 ├─ pendingErrors: unknown[]
 │
 └─ awaitDrain()
```

这么做的原因是合理的：`mitt.emit()` 本身是非常轻量的同步 emitter，而 MemoFlow 的 Repository / Outbox 路径需要知道 async event consumer 是否真正完成，不能在 handler 仍失败时错误地 ack。

问题不在 `mitt` 本身，而在于 MemoFlow 的需求已经越过了它的设计边界。

### 2.2 `awaitDrain()` 的核心并发缺陷

原实现的：

```ts
private inFlight = new Set<Promise<unknown>>()
private pendingErrors: unknown[] = []
```

属于**整个 EventBus 实例**，而不是某次发送。

因此理论上会出现：

```text
Delivery A
  └─ slow handler A 仍在执行

Delivery B
  └─ handler B 很快完成

awaitDrain(A/B)
  └─ 看见的是整个 bus 当前所有 in-flight
```

更危险的是 `send()` 会重置共享 `pendingErrors`。这使“哪个错误属于哪次 delivery”的边界不再严格。

对于普通 fire-and-forget 通知，这通常不暴露为用户可见 bug；但一旦 `AggregateRepositoryBase` 把这个 drain 当成 reliable publisher 的 ack 边界，就不够稳健。

### 2.3 `GlobalEventBus` 名称容易造成错误理解

当前 `eventBus` singleton 是模块级 singleton，因此只是：

```text
API Node process       → singleton A
Electron main process  → singleton B
Browser renderer       → singleton C
```

它从来不是：

```text
A ─┬─ B ─┬─ C
   └──── shared global bus
```

所以本轮文档与注释统一把它描述为 **runtime-local event bus**。类名暂时保留，避免无收益的源码 rename migration。

---

## 3. 开源方案对照

## 3.1 Emittery：最直接解决当前问题

官方项目：<https://github.com/sindresorhus/emittery>  
NPM：<https://www.npmjs.com/package/emittery>

Emittery 的定位就是 async-first event emitter。与 MemoFlow 当前需求直接相关的能力包括：

- Node.js + Browser；
- TypeScript event map；
- listener 永远异步，在下一个 microtask 执行；
- `emit()` 返回属于**这一次 emit** 的 Promise；
- listeners 并行执行；
- Promise 等待所有 listeners 完成；
- listener throw/reject 时以 `AggregateError` 汇总；
- 即使某 listener 失败，其余 listeners 仍会运行完成；
- `emitSerial()` 可用于少数明确要求顺序的情况；
- unsubscribe function、`AbortSignal`、`Symbol.dispose` / `Symbol.asyncDispose`；
- zero dependencies。

MemoFlow 最重要的收益不是多几个 API，而是：

```text
旧：
send A ─┐
        ├→ shared inFlight / pendingErrors → awaitDrain
send B ─┘

新：
dispatch A → Promise A

dispatch B → Promise B
```

每次 delivery 天然独立，不再需要自己实现 delivery bookkeeping。

### 版本与兼容性

本次采用 `emittery@2.0.0`。该版本要求 Node `>=22`；MemoFlow 根仓库当前要求 Node `>=22.13.0`，CI 使用 Node 24，因此不存在 runtime baseline 冲突。

Emittery v2 的 listener 接收 `{ name, data }` envelope。MemoFlow **没有把这一 third-party shape 泄漏到业务层**，而是在 `CrossPlatformEventBus` adapter 内解包，现有 feature handler 继续接收：

```ts
(payload, metadata?)
```

这样未来即使再次替换底层 emitter，业务 contracts 仍不依赖 Emittery。

## 3.2 Cordis / DeepSeek Harness：值得学习，但本次不引入

DeepSeek Harness 官方架构写得非常明确：Cordis 是其底层 framework，插件向 Context 贡献 services、typed events 和 reversible effects；插件卸载时相应注册会自动撤销。

参考：

- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/index.md>
- <https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-06-11-microkernel-event-taxonomy.md>

DSH 对不同扩展点会选择不同 dispatch semantics：

```text
parallel   → awaited fan-out
serial     → ordered checkpoint
waterfall  → middleware / transform chain
```

这非常适合“一切皆插件”的 Agent Harness；但 MemoFlow 当前已经决定**暂缓插件化**。如果为了 EventBus 单独把 Cordis Context/Fiber/Plugin lifecycle 引进来，反而会把一次局部基础设施重构绑定到尚未决定的 Plugin Kernel。

因此本次结论是：

> EventBus 直接用 Emittery；未来如果 MemoFlow 正式采用 Cordis，Cordis Events 可以用于 plugin lifecycle/hooks，届时再评估 adapter，而不是今天提前耦合。

## 3.3 Medusa：最值得学习的是“API 与 transport 分层”

Medusa Event Module 把业务看到的 event API 和 underlying pub/sub implementation 分开：

- Local Event Module：Node EventEmitter，明确只适合单进程开发/测试；
- Redis Event Module：Redis + BullMQ/ioredis，适合 production distributed delivery；
- Event Module 本身是可替换 infrastructure module。

参考：

- <https://docs.medusajs.com/resources/infrastructure-modules/event>
- <https://docs.medusajs.com/resources/infrastructure-modules/event/local>
- <https://docs.medusajs.com/resources/architectural-modules/event/redis>

MemoFlow 不需要照抄“生产一定 Redis”这个结论，因为产品拓扑、已有 Outbox、PowerSync 与调度模型不同；但它清晰证明了一件事：

> **不要让一个进程内 EventEmitter 同时承担 durable distributed messaging。**

这与 MemoFlow 本轮事件分层完全一致。

---

## 4. 最终 Event Taxonomy

### 4.1 Runtime-local Domain Event

用途：同一 JS runtime 内“某件事已经发生，其他模块可独立反应”。

例如：

```text
task:instance-completed
goal:progress-changed
setting:updated
```

实现：

```text
Typed Event Map
     ↓
CrossPlatformEventBus
     ↓
Emittery
```

特点：

- publisher 不知道 subscribers；
- 不用于 request/response；
- 不承诺进程崩溃后 replay；
- 不跨 API/Electron/Browser runtime；
- 默认多个 handlers 独立并行。

### 4.2 Durable Integration Event

用途：事件不能因为 crash/restart 消失，需要 retry、dedupe、receipt/lease 等可靠性语义。

继续使用当前 MemoFlow 已经存在的：

```text
business transaction
       ↓
transactional / domain-specific outbox
       ↓
claim / lease / worker
       ↓
consumer receipt / idempotency
```

本次 **不引入 Redis、NATS、Kafka**，也不把 Emittery 宣称成 durable event system。

### 4.3 UI / Realtime Invalidation Event

Web 当前的 SSE、Desktop IPC / PowerSync 等继续保持自己的 transport responsibility。

推荐语义仍是：

```text
server tells UI: authoritative state may be stale
                ↓
UI refetches authoritative state
```

而不是把完整 domain aggregate 在 EventBus → SSE → client cache 一路复制。

---

## 5. 新的 Runtime EventBus API 语义

## 5.1 `send()`：通知式 fire-and-forget

```ts
bus.send(type, payload, metadata?)
```

语义：

- 返回 `void`；
- 不等待 subscriber；
- subscriber failure 不冒泡给业务调用方；
- failure 会写日志；
- handlers 由 Emittery 在后续 microtask 异步调度。

它对应 ADR-033 范式 A。

### 一个明确的行为变化

旧 mitt wrapper 中同步 handler 会在 `send()` 返回前被调用；Emittery 则保证 listener 在下一个 microtask 执行。

因此：

```ts
bus.send('x', payload);
// 这里不能假定 listener side effect 已经完成
```

这不是一个需要“兼容回去”的缺陷，反而更符合 ADR-033 已经定义的通知语义：publisher 不应依赖 subscriber 的即时完成。如果调用方**确实必须知道处理完成**，就不该偷依赖同步 `send()`，而应选择 `dispatch()`（基础设施可靠边界）或 Port（真正的 request/response）。

## 5.2 `dispatch()`：delivery-scoped awaited publish

```ts
await bus.dispatch(type, payload, metadata?)
```

语义：

- Promise 只属于这一次 delivery；
- 同一次 delivery 的 handlers 并行；
- 所有 handlers 完成后 resolve；
- 任一 handler throw/reject 时，所有 handlers 仍有机会完成；单个失败向上恢复原始 error，多独立失败保留 Emittery 的 `AggregateError`；
- 两个 concurrent dispatch 不共享 drain state。

它主要给 infrastructure/reliable publisher 使用，而不是鼓励业务模块把事件当 RPC。

## 5.3 `on()` / `off()` / `destroy()`

MemoFlow 继续保留原有 payload-first API；wrapper 内部持有 Emittery 返回的 unsubscribe function，从而可以用原始 handler reference 做 `off()`。

`destroy()` 同时清空 Emittery listeners 与 wrapper tracking map。

---

## 6. Repository / Outbox 路径怎么变化

改造前：

```text
AggregateRepositoryBase
        ↓
IEventBus.publish(event)
        ↓
createEventBusAdapter
        ↓
sender.send(event)
        ↓
sender.awaitDrain()
```

改造后：

```text
AggregateRepositoryBase
        ↓
IEventBus.publish(event)
        ↓
createEventBusAdapter
        ↓
await sender.dispatch(event)
        ↓
Emittery emit Promise for THIS delivery
```

因此 Outbox fallback 的判断不再受另一个 concurrent event 的 handler 影响。

需要再次强调：现有 generic repository 的“publish 失败后写 outbox”并不自动等于严格 transactional outbox；业务数据 commit 与 fallback outbox write 之间仍可能存在 crash window。需要严格 durable semantics 的链路继续由各业务专用 transactional outbox 负责，本次 EventBus 重构不声称解决这一更高层问题。

---

## 7. 受保护的 Contract

本次明确保持：

| Contract                                     | 处理           |
| -------------------------------------------- | -------------- |
| `AppEventRegistry` / feature event maps      | 保留           |
| `CrossPlatformEventBus` class                | 保留           |
| `GlobalEventBus` / `eventBus` export         | 保留           |
| `eventBus.send()` fire-and-forget caller API | 保留           |
| `on()` / `off()` payload-first handler       | 保留           |
| `EventDeliveryMetadata`                      | 保留           |
| `IEventBus.publish(): Promise<void>`         | 保留           |
| Repository publish failure → outbox fallback | 保留           |
| ADR-033 Port / Event / IPC-HTTP 分类         | 保留           |
| durable outbox、SSE、IPC、PowerSync          | 不迁移、不替换 |

真正 retire 的只是内部实现 seam：

```text
mitt direct dependency
inFlight
pendingErrors
awaitDrain()
```

---

## 8. 实施文件

核心变更：

```text
packages/utils/src/domain/cross-platform-event-bus.ts
packages/utils/src/domain/global-event-bus.ts
packages/patterns/src/events/index.ts
packages/utils/src/domain/__tests__/cross-platform-event-bus.spec.ts
packages/patterns/src/events/create-event-bus-adapter-dual.surface.spec.ts
packages/utils/package.json
package.json
pnpm-lock.yaml
packages/utils/README.md
```

依赖治理：根 package 不再把 `mitt` 当 direct dependency；lockfile 中仍可能存在别的第三方包对 `mitt` 的 transitive dependency，这不属于 MemoFlow EventBus implementation。

---

## 9. 验证矩阵

本次新增/强化的关键 EventBus tests：

```text
send + sync subscriber failure       → publisher 不 throw，其余 subscriber 仍执行
send + async subscriber rejection    → publisher 不受影响，无 unhandled rejection
dispatch + sync failure              → 当前 delivery reject
dispatch + async failure             → 当前 delivery reject
dispatch + multiple async handlers   → 等全部完成
concurrent dispatch A/B               → B 不等待被阻塞的 A
metadata                              → payload-first contract 保持
off / destroy                         → listener cleanup 正确
```

实施阶段已通过：

```text
pnpm nx run utils:typecheck
pnpm nx run patterns:typecheck
pnpm nx run utils:test --skip-nx-cache
  → 17 files / 144 tests passed
pnpm nx run patterns:test --skip-nx-cache
  → 6 files / 35 tests passed
```

并进一步验证：

```text
pnpm nx run schedule:typecheck
  → PASS

pnpm exec vitest run --config vitest.integration.config.ts \
  src/server/infrastructure/adapters/prisma/schedule-event-delivery-log-consumer.integration.test.ts
  → 6 / 6 passed


pnpm typecheck
  → 35 projects PASS
pnpm docs:check
  → PASS
pnpm governance:check
  → PASS
```

集成测试还捕获并确认了一个兼容性边界：Emittery 对 listener failure 原生返回 `AggregateError`，而现有 Schedule outbox 会把 `Error.message` 持久化为 retry 诊断信息。因此 wrapper 在“只有一个 subscriber failure”时恢复原始 error；只有多个独立 subscribers 同时失败时才保留 aggregate error。这样既复用 Emittery 的多错误收集能力，也不破坏已有可靠消息 error contract。

---

## 10. 为什么这次没有继续“抽象更多”

可以很容易继续增加：

```text
DeliveryReceipt
DispatchMode enum
Retry policy
Event middleware
Event tracing graph
Runtime plugin scope
```

但这些都不是当前 observed problem 的最小解。

Emittery 已经把最难且最容易写错的 async fan-out + per-delivery Promise + error aggregation 做好；MemoFlow wrapper 只应该负责：

1. 保持自己的 event contracts；
2. metadata envelope；
3. logging；
4. `send` 与 reliable `dispatch` 两个明确语义；
5. 与 repository adapter 接线。

这符合 ADR-058 的 OSS-first 原则：**标准能力直接复用，MemoFlow 只维护领域与产品特有的边界。**

---

## 11. 后续边界

短期不继续做：

- 不把 runtime event bus 升级为 Redis/NATS；
- 不让 EventBus 承担 request/response；
- 不为了事件系统引入 Cordis；
- 不引入 `bail/waterfall` 等插件 hook semantics；
- 不把 SSE/IPC/PowerSync 合成一个“超级总线”；
- 不借本次改造顺带重写所有 event names/payloads。

未来只有出现真实需求时才继续：

```text
需要 cross-process durable fan-out
→ 先审查现有 Outbox/Queue 是否已经覆盖，再决定 transport

正式采用 Cordis Plugin Runtime
→ 再评估 runtime plugin events 是否由 Cordis 承担

需要 tracing / correlation
→ 扩展 EventDeliveryMetadata / observability adapter，而不是重写 emitter
```

## 12. 最终判断

EventBus 是一个适合**现在就做的小型 OSS replacement**：改动集中、可完整 characterization、收益直接，而且不会提前锁定 MemoFlow 的未来插件架构。

因此状态为：**采用 Emittery，已进入正式实现；插件化与 Cordis 保持独立决策。**
