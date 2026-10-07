---
tags: [adr, mcp, idempotency, workflow, reliability]
description: 外部写入的 durable receipt、并发与审批语义，以及 MCP 对现有 workflow 的投影
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# ADR-118: External Agent Mutation 与 Assisted Workflow

**状态：** 已采纳可靠性方向；用户已授权实施，写入和 assisted workflow 均尚未实现/验证。
**日期：** 2026-10-07
**关联：** ADR-038、ADR-042、ADR-049、ADR-071、ADR-073、ADR-099、ADR-112、ADR-116、ADR-117

## Context

MCP 客户端可能超时、重试、断开或并发调用。既有 deterministic entity ID 和部分 operation receipts 是可复用基础，但不等于已经提供所有外部写入的 request-body 幂等保证。先调用 owner 再写 Gateway receipt 会留下“业务成功、回执丢失、重试重复写”的窗口。

Task 完成与 KR 贡献、Goal 生命周期、Workflow cancellation 均有既有 owner 语义，不能由工具名、客户端批准位或 MCP task 状态替代。

## Decision

### 确定性命令直接执行，并保存确定结果

每个外部写工具显式接收 `idempotencyKey`。归一化请求后，以 owner identity + 稳定 connection/credential identity + capability version + key 作为唯一域，保存输入摘要和 operation receipt。OAuth refresh 不改变 connection identity。

- 同 key、同输入：返回原结果和 `replayed: true`，不重复 effect；先重新验证当前权限，不能用旧 receipt 绕过撤销。
- 同 key、不同输入：返回 `IDEMPOTENCY_CONFLICT`，不执行。
- 同 key 并发：由数据库唯一性/锁序列化；未提交的竞争者返回有界 `OPERATION_IN_PROGRESS` 或等待确定结果，不凭“已见过 key”返回成功。
- owner mutation、必要 outbox 和成功 receipt 处于同一原子提交边界。host 注入受 owner 控制的 transaction-bound execution/receipt port；Gateway 不获取业务 repository，也不在事务外包一层假原子 wrapper。
- commit 成功但 HTTP 响应丢失：重试仍得到原 mutation snapshot，即便对象后来更新也不伪装成原响应。
- 明确未提交的失败可重试；提交结果不确定时先查 durable record，不能换新 key 盲重试。

首版不自动过期删除幂等唯一性记录。回执内容可按明确保留策略精简为 tombstone；若原响应已不可返回，输出 `RESULT_EXPIRED` 且保持禁止重执行。账户删除按既有 owner purge policy 清理。

更新遵循 owner 的 expectedVersion/CAS。Gateway 不能通过“先读最新版本再自动填入”消除用户并发冲突。现有 owner 缺少所需并发检查时，在 owner 中补齐并使 HTTP/IPC 消费同一语义。

### 授权写入与逐操作审批分开

首批普通写操作在明确 `*:write` grant 下执行；客户端可以额外询问用户，但 server 不依赖该确认。删除、批量破坏、账号操作及设备执行默认不发布。

若后续产品要求某操作必须再经 MemoFlow 批准，使用服务器保存的 approval intent，绑定 owner、connection、能力、规范化输入摘要、expectedVersion、expiry；用户在可信 MemoFlow 界面批准。执行时再次校验并与消费 approval/owner mutation 原子提交。`approved: true`、客户端 elicitation 回答、MRTR continuation 均不是批准凭据。

### Task 的完成结果不能被简化掉

`task_occurrence_complete` 操作 Occurrence，返回 owner completion receipt。Prompt KR 绑定时暴露明确的 `record` / `complete_only` 选择；缺少选择返回需要补充输入，不能把 suggestedValue 默认为用户实际测量。当前 UI 允许 complete-only，设计保留该语义。

既有 Task binding 的 Fixed/Prompt 贡献属于 Task completion 的 owner 派生效果，在 `tasks:write` consent 中明确披露；新建或更改 Goal/KR binding 另需 `goals:write`，且检查双方归属。Gateway 不直接写 GoalRecord、不重复发布贡献事件。

### 多 owner 组合不冒充单事务

第一批 `goal_create` 只包含 Goal owner 可原子创建的内容（包括其 initial KRs），不夹带 Task/Knowledge 创建。客户端按返回的 canonical IDs 创建 Task 并设置 binding。中途失败保留已成功的事实和 receipts，不自动删除成功 Goal。

若未来需要一次提交 Goal + Tasks + Knowledge，使用已有明确的应用编排与步骤 receipts，并公开部分成功/恢复语义；不让 Gateway 开跨 owner 数据库事务。

### Assisted Workflow 是显式高级能力

复用现有 startDetached/get/resumeDetached/cancel 及持久化 workflow run，提供服务器生成的不透明 handle。handle 绑定 owner + connection + workflow kind；每次读取/继续/取消都授权，且严格检查 revision。换一个 connection 不能仅凭知道 runId 接管。

MCP Tasks 是可选协议投影：仅对声明支持相应扩展的请求使用；不支持时使用普通工具返回 durable handle 并由 `workflow_get/resume/cancel` 完成闭环。不得建立第二个 task executor、timer、内存恢复注册表或 state machine 真值。

- 返回 accepted/handle 前已有 durable run 与可恢复查询入口。
- clarification / review 使用 typed outcome；MRTR 的 requestState 必须校验完整性、身份、授权、期限和 revision。
- 停止 HTTP 等待不等于取消 workflow；取消是合作取消，不能保证回滚已经提交的业务事实。
- workflow revision、business expectedVersion、idempotencyKey、requestId 是不同身份，不能互换。
- 审批、scope 与 current account state 在真正 apply 前重新验证；provider/model/费用使用 MemoFlow 已有用户配置，并在启动前明确。
- MCP task `completed` 只说明调用返回结果，业务失败仍要读取 tool result；不把 task 状态等同于 Goal 已创建。

## Consequences

写工具上线前必须有真实数据库的并发、崩溃窗口、outbox 和 retry 证据。仅增加 Gateway 中间件无法达标，需对两个真实 owner 的事务 seam 做小范围增强。高级 workflow 晚于确定性读写上线，不阻塞首个外部接入版本。

契约与风险测试见 [架构规格](../external-agent-gateway.md)；具体工作项见 [实施总方案](../../plan/active/2026-10-07-external-agent-gateway.md)。
