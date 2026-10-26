# ADR-033: Cross-Module Communication Patterns

**Status:** Accepted
**Date:** 2026-07-10
**Context:** Monorepo module coupling, event bus scope, plugin-style composability.

## Context

随着 feature 数量增长（Goal↔Task、Setting↔Repository、AI↔多模块、后续更多联动），我们需要一份**明确的判定规则**来回答：两个模块要协作时，该走哪种通信机制？

历史上，`CrossPlatformEventBus`（`packages/utils/src/domain/cross-platform-event-bus.ts`）在同一个类里同时提供 `send`/`on`（事件）与 `invoke`/`handle`（RPC）。前者被 13+ 个 feature 使用、支撑 DDD 领域事件传播；后者**全仓零生产调用**——真实的请求-响应需求要么走 Port（同进程）、要么走 Electron IPC / HTTP（跨进程），从未落到 mitt-RPC 上。

同时，Goal↔Task 的"任务完成 → 更新 KR 进度"逻辑目前只在 `apps/desktop/src/main/events/initialize-event-listeners.ts` 实现，API 后端未挂载同款监听器；handler 还回头查了 Task 的 repository（隐性耦合）。这反映了我们缺少统一的跨模块协作范式。

本 ADR 固化范式选择，替代零散约定。

## Decision

跨模块协作按**语义**（不是按"想不想拿返回值"这种表层需求）分为三种，对应三种落地机制。**禁止**用同进程消息式 RPC（mitt-invoke）作为通用手段。

### 判定表

| #   | 语义              | 是否需要返回值 | 是否跨进程/网络 | 选用机制                                                                           |
| --- | ----------------- | -------------- | --------------- | ---------------------------------------------------------------------------------- |
| 1   | 通知式反应        | 否             | 否              | **事件总线 `send`/`on`**（`@memoflow/utils/domain` 的 typed publisher/subscriber） |
| 2   | 查询 / 命令回执   | 是             | 否              | **Port（依赖倒置）+ 宿主组装注入**                                                 |
| 3   | 跨进程 / 网络请求 | 是             | 是              | **Electron IPC（`@memoflow/ipc-client`）或 HTTP**                                  |

对应到范式：

### 范式 A — 事件（Pub/Sub）

- 用于领域事件传播、"某事发生 → 别处反应"的联动。
- 发布方**不关心也不等待**订阅方的返回。
- 事件形状在 `@memoflow/contracts/<module>/protocol/*-event-map.ts` 集中声明。
- 生产代码通过 `createTypedEventPublisher` / `createTypedEventSubscriber` 收窄类型面（见 raw-event-bus-audit）。
- **Payload 自包含**：订阅方不应因为处理事件而回头查发布方的 repository，需要的字段应放进 payload。

**代表用例：** 任务完成 → 更新关联 KR 进度（`task:instance-completed`）。

### 范式 B — Port（同进程请求-响应）

模块声明"**我需要什么**"的接口（inbound Port），另一模块（或基础设施）**实现**该接口，**宿主**在组装根注入具体实现。依赖方向永远指向抽象。

- Port 定义在**需要方**的 `application-server/ports/` 下（依赖倒置：调用方拥有抽象）。
- 实现方作为 adapter 提供 —— 通常在实现方包的 infrastructure 层或独立适配器包。
- 宿主（`apps/api`、`apps/desktop`）通过 `createXxxModule({...ports})` 工厂完成组装（见 ADR-025 Module Composition Pattern）。
- 调用即普通 `await port.method(...)`，返回 `Result<T>`（见 ADR-030）。类型、堆栈、事务、mock 全部保留。

**代表用例：** `createAIApiModule` 声明 `IAnalyticsReadPort` / `IKnowledgeNotePersistencePort` / `IKnowledgeSourcePort`，由 `apps/api/src/main.ts` 用 `RepositoryKnowledgeSourceAdapter` 等注入。Setting 改字体 → Repository 应用 → 回执，同构。

### 范式 C — 跨进程 / 网络（消息式 RPC）

跨 Electron 主/渲染进程用 `@memoflow/ipc-client` 的 `ResultIpcClient` / `createResultIpcClient`（自动识别 `IpcResult` 信封、返回 `Result<T>`、支持超时；无 throw 风格双轨客户端）；Web↔API 用 `ResultHttpClient`。两者作为 client-side adapter 出现在 `packages/<feature>/src/infrastructure-client/adapters/{ipc,http}/`，实现同一个 client Port，保证 UI 层写法不变。

### 明确弃用

**不使用 mitt 版 `invoke`/`handle` 做同进程 RPC**。同进程需要请求-响应时一律走范式 B。理由见 Rationale。

## Rationale

**为什么进程内 RPC 不该用消息总线？** 消息式 RPC 相对 Port 有三个硬伤：

1. **丢类型与堆栈** —— 通过字符串 channel 分发的调用编译期无法校验，出错时堆栈断裂。Port 是真函数调用，全部保留。
2. **丢事务** —— 同一业务事务内需要多次同进程调用时（如 Setting 更新配置后立即写审计记录），消息式 RPC 无法共享同一个 DB 事务上下文；Port 直接透传。
3. **丢可组合性** —— 消息式 RPC 隐藏了模块依赖（"我 invoke 一下就好"），而 Port 强制在组装根显式声明依赖，是宿主可插拔组装的前提。

真跨进程时（范式 C），序列化不可避免，上述损失被物理边界"合法化"；同进程再引入消息层是主动制造损失。

**为什么事件仍然要保留？** 事件的价值不在返回值，在**解耦发布方与订阅方**：发布方不需要知道谁在听，新增/移除订阅方不改动发布方。这是范式 B 无法替代的。判据是"我需不需要对方回答"—— 需要就用 B/C，不需要就用 A。

## Consequences

**正面：**

- 判定明确，新联动场景不再需要临场讨论。
- 三个范式各自的最佳实践已在仓库有代表实现，无学习成本。
- 支持模块插件化：模块只暴露 contracts、inbound Port、module 工厂；实现完全隐藏。宿主是唯一组装点。
- 允许删除 `CrossPlatformEventBus` 中未接线的 `invoke`/`handle`/`pendingRequests` 逻辑，收敛为纯事件总线。

**负面 / 需承担的成本：**

- Port 数量会随联动增多而增加。约定：每个跨模块协作**先建 Port**，即使当前只有一个实现；避免以后被迫大改。
- 事件 payload 需要保持"自包含"，聚合根侧要为跨模块订阅者预留必要字段，可能略微增加 payload 体积。
- 宿主组装代码会更长（每个 Port 一条注入），换来的是显式依赖与可测试性。

## Migration & Enforcement

- **删除 mitt-RPC**：见 `docs/plan/archive/2026-07-10-event-bus-and-governance-hardening.md` 阶段一 H1。
- **Goal↔Task 联动重构**：见同计划 M6。反应逻辑搬入 Goal 包 `application-server/event-handlers`（替换现有空壳桩 `registerGoalEventListeners`），事件 payload 由 Task 侧填齐所需信息，`apps/api` 与 `apps/desktop` 两宿主分别挂载。
- **未来所有 AI ↔ 其他模块、Setting ↔ 其他模块** 的联动一律遵循本 ADR。
- **治理**：`raw-event-bus-audit.mjs` 已确保 `send`/`on` 走 typed seam；后续可增加 audit 检查"是否在业务代码中出现 `.invoke(` / `.handle(` 且不属于 IPC/HTTP adapter"。
- **Phase 6 跨模块读取 Port 治理**：`tools/governance/architecture-surface-audit.mjs` + `architecture-surface-manifest.json` 的 `READ_PORT_GOAL_TASK_BINDING` / `READ_PORT_AI_ANALYTICS` / `READ_PORT_AI_KNOWLEDGE_SOURCE` 规则锁定消费者拥有契约、Application 只依赖抽象、宿主 composer 注入 adapter、消费者不 deep-import provider 基础设施；删除注入或绕过 Port 会使审计变红。

## 2026-08-25 实现层修订（ADR-064）

本 ADR 的三范式语义不变；runtime-local EventBus 的 async delivery implementation 由 ADR-064 修订：底层从 `mitt` + bus-global `awaitDrain()` 改为 Emittery。业务通知仍使用 fire-and-forget `send()`；需要把本次 handler completion 作为可靠发布边界的 infrastructure adapter 使用 delivery-scoped `dispatch()`。这不授权业务代码把 `dispatch()` 当作 EventBus RPC；请求-响应仍必须使用 Port / IPC / HTTP。

## References

- ADR-002 采用 DDD 架构模式
- ADR-003 事件驱动架构
- ADR-023 Server-Side Layer Decoupling & Pure Dependency Injection
- ADR-025 Module Composition Pattern
- ADR-030 Standard Result Pattern
- ADR-031 Server Feature Standard Shape
- `docs/plan/archive/2026-07-10-event-bus-and-governance-hardening.md`
