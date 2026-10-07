---
tags: [plan, active, mcp, task, reliability]
description: EAG-07 TaskPlan create/update 复用 owner 语义并验证第二条可靠写入链路
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# EAG-07：TaskPlan 可靠写入

状态：待实施。依赖：EAG-06。入口：[总方案](../2026-10-07-external-agent-gateway.md)。

## 交付行为

task_plan_create/update 支持真实 Task schedule、提醒策略与经过授权的 Goal/KR binding；可靠重试不重复生成 TaskPlan 或调度效果。

## 实施步骤

1. 对照 TaskApplicationPort 的实际输入规范化 identity 和 ExecutionContext 传递，复用 Task schema；ID 与 idempotencyKey 分开，Gateway 不增加内部 owner 字段入口。
2. create/update schema 明确 schedule algebra、reminderPolicy、checklist 和 expectedVersion；未提供/显式清空保留 owner 语义。
3. 新建/修改 Goal binding 需要 tasks:write + goals:write，且 owner 验证 Goal/KR 归属；取消或改动 binding 也不能绕过明确的 scope policy。现有 binding 的后续完成派生效果见 ADR-118。
4. 将 TaskPlan 写入、相关 scheduling/outbox 意图和 receipt 接入 Task owner 原子边界。查询、验证和写入的版本条件必须在 transaction/CAS 中成立，不能只靠 Gateway 先读。
5. 复用 EAG-06 的并发/故障场景；只有这两个 owner 稳定重复的 receipt port/normalization 逻辑才提取共享机制，保留各自业务事务。
6. 验证 Goal create 返回 IDs 可被明确用于 TaskPlan binding；第二步失败返回该 Task 的失败，不能自动删除已创建的 Goal。

## 保护契约

不把 TaskPlan 完成等同于 Occurrence 完成，不绕过 owner 创建 occurrence，不增加跨 Goal/Task 的共享数据库事务。write 权限不等于可扩展查询目标的全部内容。

## 验收与验证

- 同 key create/update 重放、异 body 拒绝、commit/receipt 故障、restart 与多实例并发全部有真实 DB 证据。
- 更新旧版本 conflict；Task schedule/reminderPolicy 不被工具层重写为字符串时间。
- 非本人 Goal/KR、缺 goals:write 的 binding 变更都无业务写；合法 binding 与相关后续事件保持。
- 创建带提醒 Task 后，调度由 owner scheduler 负责，HTTP/Agent 退出不影响已接受的 durable intent。
- Task integration、goal/api/contracts 最近 targets、prod-like 与治理通过，补齐 EAC-07/08 的第二 owner 证据。

## 回退与移交

关闭 Task write tools，保留 receipts 与已接受调度事实；用户仍通过原 UI 管理 Task。移交 EAG-08 增加独立 Occurrence completion。
