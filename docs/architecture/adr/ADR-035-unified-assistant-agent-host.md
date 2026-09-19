---
tags:
  - adr
  - ai
  - agent
  - assistant
  - workflow
  - plugin
description: ADR-035 - 统一助手、Agent Host 与可插拔 Workflow、Turn Engine、Model Gateway 边界
created: 2026-07-17T00:00:00
updated: 2026-08-15T00:00:00
---

# ADR-035: 统一助手与可插拔 Agent Host

**状态：** 已被 ADR-050 取代
**日期：** 2026-07-17  
**影响范围：** AI、Goal、Task、Repository、Desktop、Web、Mobile、ai-service

> **2026-08-20:** 本 ADR 的目标态已被 [ADR-050](./ADR-050-mastra-native-ai-runtime.md) 取代。本文仅保留历史决策背景；其中业务安全不变量由 ADR-050/051/052 重新定义。

## 1. 背景

MemoFlow 已经具备两类 AI 运行能力：

- TypeScript AI 模块负责 Conversation、Provider 配置、AgentRun 投影、审批后业务执行和跨模块适配。
- Python `ai-service` 使用 LangGraph 承担 Goal 与 Knowledge 等可恢复工作流、checkpoint 和 interrupt。

后续还需要支持：

- 嵌入式通用 Agent loop，例如 Pi。
- 用户配置的 OpenAI-compatible、Anthropic 或其他模型 API。
- 已经在 Desktop 本机登录的 Codex、Claude Code、Pi 等 CLI。
- 未来的远程 Agent API 或新的工作流实现。

专项调研确认，这些能力不属于同一抽象层：模型 API 只负责模型请求，Pi 负责单次 Agent turn 与工具循环，LangGraph 负责持久业务流程，本地 CLI 通常同时包含模型、Agent loop、原生工具和自己的 session。若把它们压入一个万能 `AgentProvider`，会泄漏框架状态、形成大量能力分支，并削弱审批和业务写入边界。

产品侧同时确认：用户面对一个统一助手，中间区域用于对话，右侧业务面板作为结构化工作台；用户不需要先理解或选择 Goal Agent、Knowledge Agent 等内部实现。

## 2. 决策

### 2.1 采用统一助手产品模型

前端只面向一个 `AssistantFacade` 和统一事件流：

- 对话区承载意图、追问、流式回答和可验证的活动状态。
- 右侧工作台承载 Artifact、Citation、Proposal、审批、执行结果和恢复操作。
- Goal、Knowledge、Task 等是内部 workflow/capability，不作为用户必须选择的独立机器人。
- UI 不根据 Pi、LangGraph、Codex CLI 或 Provider 名称实现业务逻辑。

### 2.2 MemoFlow Agent Host 是稳定宿主

Agent Host 负责：

- AgentRun、Conversation、Event、Artifact 和 Proposal 的产品语义。
- Context 组装、Capability 解析、Tool Policy 和运行计划固定。
- 审批、幂等、业务执行、审计、错误归一和 UI projection。
- 在组合根中显式装配受信任的 Workflow Engine、Turn Engine 和 Model Gateway。

第三方框架和外部进程只提供执行能力，不能成为业务状态、权限或写入事实源。

### 2.3 分离三个执行扩展轴

1. **Workflow Engine**：拥有可恢复流程、节点推进、checkpoint 和 interrupt。当前实现是 LangGraph。
2. **Turn Engine**：拥有一次智能回合中的推理、流式输出和受控工具循环。候选实现包括内置轻量实现、Pi、远程 Agent API 和本地 CLI adapter。
3. **Model Gateway**：拥有模型目录、认证解析和 completion/stream。用户自定义 AI API 接入这一层。

组合关系：

```text
LangGraph Workflow Engine
  -> 可调用 Turn Engine 完成 research/draft/plan activity

Pi Turn Engine
  -> 可调用 Model Gateway

Codex/Claude CLI Turn Engine
  -> 自带模型与 session，可以不使用 Model Gateway
```

### 2.4 业务状态与框架状态分离

MemoFlow 的持久产品状态包括：

- AgentRun 与状态机。
- Conversation transcript。
- Artifact、Citation、Proposal、Approval 和 ExecutionReceipt。
- CapabilitySnapshot、运行计划和审计事件。

框架私有状态包括：

- LangGraph checkpoint/thread config。
- Pi session、queue、compaction 和 continuation。
- CLI session ID、PID、命令参数和 stdout/stderr framing。
- Provider 原始消息、SDK response 和 retry state。

框架私有状态必须由 adapter 隐藏。它可以作为恢复优化保存，但不能替代 MemoFlow 产品状态，也不能进入 UI 公共契约。

### 2.5 Capability 协商代替引擎名称判断

Workflow 声明所需能力、允许的数据位置和工具执行方式；Engine 声明实际能力。Resolver 生成 `ResolvedRunPlan` 并在一次 Run 开始时固定。

禁止：

- 业务代码使用 `if (engineId === "pi")` 等判断。
- Run 进行中静默更换 Engine。
- 本地 Engine 不可用时静默把本地数据发送到云端。
- 不满足结构化输出、host-managed tools 或数据位置约束时静默降级。

需要更换 Engine 时，应新建或显式 fork Run，并重新建立可解释的标准上下文。

### 2.6 工具与副作用分层

工具分为：

- `query`：读取 Goal、Task、Repository 和索引数据。
- `proposal`：生成结构化 Artifact 和不可变 Proposal。
- `mutation`：创建、修改或删除业务数据，写 Vault 或创建 Git commit。

Turn Engine 只接收 `query` 和 `proposal` 工具。`mutation` 不进入模型或外部 CLI 的工具列表，只能在用户确认特定 Proposal revision 后由 TypeScript Executor 调用。

Engine hook、Prompt、AGENTS 文件或 CLI permission mode 不能替代这一结构性边界。

### 2.7 Context 分层且检索内容不可信

Context Assembler 按以下优先级组织上下文：

1. 系统安全规则。
2. 产品 workflow 规则。
3. 用户结构化偏好。
4. 当前页面、选中实体和任务输入。
5. 按需检索的领域数据和知识内容。

ContextItem 携带来源、信任等级、敏感级别和 token 估算。Vault、GitHub、网页和用户笔记中的内容均不能扩大 Capability、修改 Tool Policy 或绕过确认。

不要求创建固定 `AGENT.md`，也不把某个 Vault 文件设为安全策略来源。

### 2.8 首期采用静态贡献，不开放任意代码插件

首期“可插拔”指普通 Port/Adapter 通过应用组合根显式注入，不建设运行时 npm 插件加载、插件市场或任意 TypeScript extension。

未来若开放第三方扩展，优先使用受版本约束的独立进程/协议隔离；不得把未审核代码直接加载进拥有 API key、Vault 和业务数据库权限的宿主进程。

### 2.9 LangGraph、Pi 和本地 CLI 的定位

- LangGraph 长期保留为 durable Workflow Engine，不承担统一 UI 或跨模块业务写入。
- Pi 只作为候选 Turn Engine；不采用 `pi-coding-agent` 默认文件工具、extension discovery、AGENTS 加载、RPC 产品协议或 JSONL Session 作为 MemoFlow 真值。
- 本地 CLI 首期只用于 Desktop 开放式对话、只读分析、Artifact 和 Proposal 生成。
- 本地 CLI 不直接指向真实 Vault 执行写入；无法可靠关闭自带 bash/write 能力时，不得参与要求 host-managed tools 的工作流。
- Open Design 的本地 CLI adapter 思路可复用，但其进程权限模型和 CLI 原生协议必须封装在 adapter 内。

## 3. 不采用的方案

### 3.1 用 Pi 或任一本地 CLI 取代全部 Agent runtime

不采用。它们不提供 MemoFlow 所需的业务 checkpoint、跨端审批、Proposal revision、业务幂等和跨模块 Executor 边界。

### 3.2 把 Workflow、Agent loop 和 Model API 合并成万能 Provider

不采用。三者的状态、能力、恢复和安全语义不同，合并后只能依赖可选字段和引擎名称分支。

### 3.3 继续以 direct-provider/remote-ai-service 整套二选一作为目标态

不采用。迁移期可以保留现状，但目标态按每次任务所需能力组合 Workflow、Turn Engine、Model 和执行位置，而不是替换整套 AI 模块。

### 3.4 立即建设完整插件 SDK 和动态发现

不采用。当前真实实现数量不足，过早抽象 Transport、Hook、生命周期和第三方安装协议会增加维护面和安全风险。

### 3.5 允许 Engine 直接执行业务 Mutation

不采用。无论 Engine 来自受控代码、Pi、远程 Agent API 还是本地 CLI，所有业务副作用都必须经过 Proposal、用户确认和 TypeScript Executor。

## 4. 影响

### 正面影响

- 保留现有 LangGraph、AgentRun、Provider 和 TS Executor 资产。
- Pi、自定义模型 API、本地 CLI 和未来 Agent API 可以沿独立轴接入。
- UI 和业务模块不依赖具体 Agent 框架。
- 数据位置、工具权限和结构化输出要求可以显式验证。
- Desktop 本地能力与 Web/Server 能力可以使用同一产品契约表达。

### 需要承担的成本

- 需要维护稳定的标准事件、Proposal 和 Capability 词汇。
- Engine 归一化会舍弃部分厂商特性，特有信息只能作为不影响业务的诊断数据保存。
- LangGraph 在迁移期仍可能直接调用 Provider，与新 Turn Engine 并存。
- Server workflow 若未来等待 Desktop CLI，需要额外的 durable activity lease 协议。
- 本地 CLI 不能仅靠工作目录形成安全沙箱，仍需明确授权和风险提示。

## 5. 验收标准

- 前端只通过统一助手 contract 驱动对话和右侧工作台。
- LangGraph、Pi、Provider SDK 和 CLI 原生类型不进入公共 contracts。
- 同一 Conversation 可以启动多个 AgentRun，Run 可独立恢复和审计。
- 每次 Run 固定 ResolvedRunPlan 与 CapabilitySnapshot。
- Engine 只获得本次 Run 允许的 Query/Proposal 工具。
- 所有 Mutation 只由用户确认后的 TypeScript Executor 执行。
- 自定义模型 API、本地 CLI 和嵌入式 Turn Engine 有不同 adapter，不伪装成同一 Provider。
- 本地/云端 fallback 不改变数据外传边界，不能静默发生。
- 现有 LangGraph workflow 可以在不重写 Python graph 的前提下被 Host 包装。
- 新增第二个 Turn Engine 后，无需修改 UI、业务模块或 Proposal/Executor contract。

### 验收治理（Phase 6）

- `tools/governance/architecture-surface-audit.mjs` 的 `AI_APPROVAL_LIFECYCLE_ONLY` 规则：AST 锁定 Turn Engine/proposal capability 不含 `tool.mutation`，`AssistantFacade.dispatchApprove/Revise/Reject` 不调用 `executeApproved`，mutation 执行只走显式 approved/confirm 路径；行为由 `proposal.kernel.spec.ts`、`assistant.facade.spec.ts`、`agent-host-stage0-composition.surface.spec.ts` 与 host task journey 覆盖。

## 5.1 窄版本兼容例外（2026-08-15，plan §4.5 / Step D）

产品 open-chat 的默认路径始终是 `dispatchAssistant`；legacy `streamMessage` 不是产品默认路径。
唯一的窄版本兼容例外是 `AIClientService.dispatchAssistant` 内部的 version-compat adapter：

- **允许条件（全部成立才 fallback 一次）**：command 为 `message` 且 profile 缺省或
  `direct_turn`；dispatch 未产出任何 `AssistantEvent`（未收到 `run.started`）；错误码为稳定
  `ASSISTANT_DISPATCH_UNAVAILABLE`（Web bootstrap 404/405/501；Desktop bridge/handler 在
  START 接受前明确 `NOT_SUPPORTED/NOT_FOUND`）；`conversationId/content/providerId/model`
  可无损映射。
- **禁止条件（fail-closed）**：`pi_readonly`、proposal approve/revise/reject、`cancel_run`；
  已收到任意事件；普通网络/timeout/abort/`STREAM_TERMINATED`；auth/validation/rate
  limit/provider/Facade application error；protocol error（malformed frame、未知 event
  type、done/result schema 错误）；Desktop START 接受后的 crash/sender destroy/stream error。
- fallback 投影 `message.delta` / `message.completed`，保留 command runId 与持久化消息，
  绝不伪造 `run.started`，不新增 fallback-specific 公共事件；命中只能通过内部 log/metric 观察。
- `dispatchPolicy`（`prefer_dispatch` / `dispatch_only` / `legacy_only`）由 host composition
  显式传入 client factory；生产缺省 `prefer_dispatch`，紧急回滚必须显式配置并记录 telemetry。
- Vue 层不获得 `streamMessage` 依赖，不分支判断 transport，不展示 fallback-specific 产品事件。

**移除条件**：旧 Server/Desktop host 全部升级到支持 dispatch 后，删除该 adapter 与
`legacy_only` 开关；`streamMessage` 不长期作为双默认路径存在。

## 6. 相关资料

- [统一助手与可插拔 Agent Host 实施方案](../../plan/archive/2026-07-17-unified-assistant-agent-host.md)
- [AI 模块说明](../../product/modules/ai.md)
- [ADR-034: 本地 Obsidian Vault 与可选 GitHub 知识仓库](./ADR-034-obsidian-vault-repository.md)
- [ADR-025: Module Composition Pattern](./ADR-025-module-composition-pattern.md)
- [ADR-033: Cross-Module Communication Patterns](./ADR-033-cross-module-communication-patterns.md)
- [AI Agent checkpoint persistence](../ai-agent-checkpoint-persistence.md)
