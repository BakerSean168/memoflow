---
tags: [plan, active, mcp, task, goal]
description: EAG-08 Occurrence 完成、Prompt 测量选择、并发与 Goal contribution 闭环
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# EAG-08：TaskOccurrence 完成

状态：待实施。依赖：EAG-07。入口：[总方案](../2026-10-07-external-agent-gateway.md)、[ADR-118](../../../architecture/adr/ADR-118-external-agent-mutations-and-assisted-workflows.md)。

## 交付行为

用户明确完成某个 occurrence；Prompt KR 关联时可以记录实际值或只完成。最终 Task result 与 Goal contribution 由原 owner 流程兑现，重复请求不重复贡献。

## 实施步骤

1. characterization 当前 CompleteTaskOccurrenceUseCase、Task action coordinator 的 record/complete-only、Fixed/LinkOnly、已完成 replay、contribution delivery。
2. 明确工具输入：occurrenceId、idempotencyKey、并发版本以及 Prompt 的 `measurementDecision`（record + value/note，或 complete_only）。不知道 decision 时返回 needs_input 且零写入。
3. 把所需 version/decision 约束放入 Task-owned callable seam；现有 complete schema 无 expectedVersion，需补齐 canonical application/HTTP/IPC 契约与相关调用方。不要把新约束只藏在 MCP adapter。
4. Prompt context 查询需要 goals:read；无权取上下文时仍可明确 complete-only，不能返回目标私密详情或默认 suggestedValue。record 必须校验实际 binding。
5. 在事务内验证 occurrence version 与用于决定 measurement 的 plan/binding version，防止读取后 binding 被改导致错误贡献。Task 写、outbox 与 receipt 原子提交；Goal 消费仍走已有可靠事件链。
6. 对 concurrent complete、plan binding 修改、相同 key/不同 measurement、提交后丢响应、Goal consumer 重放分别注入故障。
7. 完成两客户端 write journey 与关闭 write flag 测试，输出第二里程碑的 EAC-06～11/14 证据。

## 保护契约

complete_only 是当前合法语义；不得强制每次完成都写 GoalRecord。Task completion 的 accepted receipt 不等于异步 Goal 投影已完成；响应明确处理状态，不伪造最终进度。

## 验收与验证

- 无绑定、LinkOnly、Fixed、Prompt record、Prompt complete-only、缺 decision 六类行为均明确；零与负 measurement 按 owner schema 处理，不用 truthy 判断。
- 已完成重复调用不重复 effect；同 key 不同 measurement 拒绝，不能悄悄丢弃用户新意图并返回成功。
- 旧 occurrence/plan version 冲突无写；读后绑定改变不能写入过时 Goal 上下文。
- outbox delivery 重试后 Task outcome 与 Goal contribution 仍一致；真实 DB 与 Task/Goal integration 验证。
- Web/Desktop native completion 流程回归通过，新 MCP 没有绕过 owner 语义。

## 回退与移交

单独关闭 occurrence completion tool，已提交 Task/Goal 事实不自动回滚。deterministic write milestone 完成后再开放新的高风险工具或 assisted apply。
