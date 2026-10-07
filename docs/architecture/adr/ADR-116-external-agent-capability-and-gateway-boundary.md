---
tags: [adr, ai, mcp, owner-boundary]
description: External Agent Gateway 复用真实 owner application capabilities，逐步提取协议无关契约
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# ADR-116: External Agent Capability 与 Gateway 边界

**状态：** 已采纳边界；用户已授权实施，Goal 与 TaskPlan/TaskOccurrence 的 PAT 六工具有界只读链路已实现，真实 PostgreSQL/官方 SDK 纵向测试通过；六工具最终 prod-like 验收通过，后续写入与 workflow 未实现。
**日期：** 2026-10-07
**关联：** ADR-025、ADR-045、ADR-049、ADR-050、ADR-076、ADR-112、ADR-113、ADR-117、ADR-118

## Context

MemoFlow 已有 GoalApplicationPort、TaskApplicationPort、Routine owner ports、REST/OpenAPI 和 Mastra tools。外部 Agent 接入缺少协议、委托授权和面向不可靠客户端的调用契约，而非缺少另一套业务数据库。

内部 Owner Native Edit Session 是有 UI 宿主的编辑接口。远程 MCP 客户端未必连接 MemoFlow 浏览器或 Desktop，不能把打开表单作为 headless 命令执行的前提。现有 15 个 Mastra product tools 也不能代表全部 owner 能力或全部宿主可用能力。

## Decision

1. 新增 **External Agent Gateway**，作为 HTTP/MCP adapter 与受控应用入口。确定性调用直接进入真实 owner application port；仅用户明确请求 assisted planning 时进入 MemoFlow AI workflow。
2. 第一部署形态为现有 API 进程内的独立 `/mcp` 路由。API host 负责装配、启动和关闭；Gateway 不自建 Goal/Task persistence，不经 localhost REST 绕一圈，不依赖 Vue 或 Mastra controller。
3. capability 的业务语义继续属于 owner。Agent schema 引用、裁剪或投影现有公开 contract，新增字段只能是接入语义，例如分页和幂等标识。REST 与 MCP 可以有不同协议 envelope，不能产生不同的业务含义。
4. 先完成 Goal 只读 vertical slice，再完成 TaskPlan/TaskOccurrence。按 ADR-113，在两个真实 owner 出现稳定重复后才提取最小 descriptor/adapter helper。**不把新建 `@memoflow/capabilities` 全局框架作为前置工程。**
5. 静态 descriptor 可以声明 id、description、input/output schema、required scopes、effect、宿主要求与 replay policy；handler 由 host 注入。声明不能绕过运行时权限和 owner validation。已复用操作的 Mastra/MCP schema 与业务执行必须同源，二者的工具全集和交互流程不必完全相同。
6. Task 工具明确区分 `task_plan_*` 和 `task_occurrence_*`；旧 Reminder HTTP API 已退役，第一版不新增 `reminder_create/update/cancel`。提醒通过 Task/Goal 提醒配置和经过验证的 Routine WallClock 能力表达。
7. Hosted Gateway 只暴露云端可兑现的能力。Desktop 本地知识文件、Elapsed/ActiveUsage timer、设备 protocol 不因“已有内部 tool”而自动成为远程能力。

目标依赖方向：

```text
Codex / Claude Code -> MCP adapter -> scoped capability invocation
                                              |
MemoFlow Assistant -> Mastra adapter ---------+-> owner application -> domain
Web / Desktop -> existing HTTP / IPC ---------+
```

Native Edit Session 继续服务 MemoFlow 内部 UI；不成为远程写入的依赖。Gateway 的 ExecutionContext 沿用 `source: 'http'`，client/grant 元数据由入口可信生成，不新增第二种 ExecutionContext 或用 requestId 充当幂等键。

## Considered Options

- **把 REST 全量自动生成 MCP**：接入快，但暴露过多工具、legacy aliases 和模糊 Task 语义；只复用 schema，不采用全量发布。
- **把 Assistant 整体暴露为工具**：保留为未来显式 assisted 能力；普通读写不承担二次推理和 UI 依赖。
- **先建设统一 capabilities 平台**：未经过真实 owner 验证，容易成为 ADR-113 所禁止的新框架；采用两 owner 后的小规模提取。
- **独立 MCP 微服务**：增加部署、认证传播和网络故障面；待独立扩容或隔离需求有证据时再拆。

## Consequences

- 新外部操作可能要求补齐 owner application 的分页、并发或结果契约；不能以 adapter 绕开。
- 公共 Tool Contract 是需要管理的产品接口，但这不要求当前仓库为旧内部模型维护兼容层。
- 按权限和宿主条件过滤发现结果，并在调用时重新授权，未知能力默认拒绝。
- 本决策不修改 ADR-112 的内部 UI 路径，也不恢复已退役的 Reminder 或 Product Governance runtime。

具体工具与包边界见 [架构规格](../external-agent-gateway.md)，顺序与验收见 [实施总方案](../../plan/active/2026-10-07-external-agent-gateway.md)。
