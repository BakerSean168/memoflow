---
tags: [plan, active, mcp, workflow]
description: EAG-10 复用现有 Durable Workflow 并添加 headless review、handle 与可选协议扩展
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# EAG-10：Assisted Workflow Adapter

状态：待实施，属于后续高级能力。依赖：EAG-08、所需 EAG-09 owner 能力、[已归档的 Durable Workflow 重构](../../archive/2026-10-07-ai-durable-workflow-runtime.md) 对应的稳定 public seam。入口：[总方案](../2026-10-07-external-agent-gateway.md)、[ADR-118](../../../architecture/adr/ADR-118-external-agent-mutations-and-assisted-workflows.md)。

## 交付行为

用户明确选择 MemoFlow 自己的 Goal Planner，生成可审阅草稿；客户端退出后可重新查询/继续/取消。只有 owner apply receipt 已成立时才报告创建完成。

## 实施步骤

1. 先核对当时 runtime 的 startDetached/get/resumeDetached/cancel public seam、owner-first decode、durability 与 provider/model/费用配置。不要从本轮路径假定未来 private class 是稳定 API。
2. 以 goal_create_assisted 为唯一首个 workflow，定义 workflows:read/execute 与实际 owner scopes；启动前展示使用 MemoFlow 模型配置与费用归属。禁止匿名启动消耗额度。
3. 在 durable run 接受时持久化 connection binding 与授权引用，返回前能通过 workflow_get 查询；handle 不透露原始内部路径或承担凭证作用。
4. 先用普通 workflow_get/resume/cancel 完成 headless clarification/review/apply。revision 每次匹配，批准以可信 server intent 或明确 delegated write policy 为依据，不能把 MCP 的 accept 回答当批准凭证。
5. review 若需要用户确认，提供 MemoFlow 可访问的可信 review surface 并绑定参数/version；审批变化和消费与 owner apply 的原子性按 ADR-118。尚无 headless apply 闭环时只返回 draft，不宣称操作完成。
6. 再为声明支持的请求映射 MCP Tasks：get/update/cancel 对应同一 run，无第二 executor/store 真值；业务 isError 与 task status 分别投影。
7. MRTR requestState 采用有完整性保护的 opaque state 或服务器查询句柄，绑定主体、connection、run/revision、输入摘要、expiry；失败或重放不得扩权。
8. 分别验证支持扩展与普通 tool 客户端；任何 unsupported extension 都不影响既有 deterministic read/write。

## 保护契约

不为外部客户端重写 Mastra workflow，不把 requestId 当 runId，不等待长 HTTP 连接内的用户输入。Native Edit Session 保持内部 UI 路径；其 requestSubmit 不能成为无 UI 服务端的假实现。

取消只阻止尚可取消的后续工作。若 Goal 已提交而后续 Task 失败，返回真实部分 receipt 与恢复选择，不用“cancelled”掩盖事实。

## 验收与验证

- start 回复前 run 已 durable；kill/restart 后可查询，跨账户/connection 不能读取或接管。
- 并发 resume、旧 revision、篡改 continuation、过期 approval、撤销 grant、关闭账户都按确定结果处理。
- 客户端断线不等于取消；cancel/apply race 下不得重复 apply，已提交事实可查询。
- provider 故障、budget 不足、用户拒绝、partial apply、recovery 都使用现有 owner/workflow outcome。
- 无 Tasks 客户端完整可用；Tasks/MRTR 实际宣称支持的组合有记录。完成 EAC-13，相关 AI/owner/api integration、prod-like 与治理通过。

## 回退与移交

关闭 assisted 新启动 lane；已有 run 保持可查询、取消或按既定策略恢复。保留原内部 Assistant/Workflow 与 deterministic MCP；SDK/CLI/skill/webhook 另按真实需求立项。
