---
tags: [plan, active, mcp, planner, routine, knowledge]
description: EAG-09 按真实 owner 子切片扩展聚合查询、云端提醒与知识能力
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# EAG-09：Planner、Routine 与 Knowledge 扩展

状态：待实施。只读依赖 EAG-05，写入依赖 EAG-08。入口：[总方案](../2026-10-07-external-agent-gateway.md)、[工具清单](../../../architecture/external-agent-gateway.md)。

## 交付行为

按下列独立小切片增加高价值能力；每个切片可以单独交付、验证、关闭。不是一次性把 15 个内部工具全部发布出去。

## 实施步骤与逐项验收

### EAG-09a：Planner 与 Notification read

复用 planner_today_summary、planner_conflicts 和 notification_unread_summary 的已有 application ports，正式提取共用 operation descriptor/handler，使 Mastra 和 MCP 使用同源 schema。Planner 要求各来源 scope 并集；Notification action 暂不开放。

验收：相同 owner/context 下两 adapter 的 business result 一致；缺一项 scope 的聚合查询拒绝且不读取子来源；时间范围、分页、超时和冲突内容有测试。完成 EAC-10 的真实双 adapter 证据。

### EAG-09b：Workspace overview

从 Home/analytics composition 的实际 sections 推导固定最小来源清单，冻结 output 与所需 scopes。先支持清晰的小摘要，不读取完整 owner 数据后在 Gateway 裁剪。

验收：同名版本输出来源固定；缺 scopes 不泄露计数、标题、关系或隐式 data；新 section 不自动进入旧 grant。

### EAG-09c：Routine WallClock 与提醒

增加 routine_create 的 hosted WallClock 子集与 temporary override；使用现有 Routine application、Profile membership、Scheduler 与 Notification。验证 count=1 等 owner 表达能否满足一次性提醒；如果不适合，则通过有到期时间和 reminderPolicy 的真实 Task 表达，不恢复 ReminderTemplate。

验收：明确时区/时间、owner/profile 归属、幂等 receipt、Agent 退出后 Scheduler 仍执行；关闭用户通知权限时准确显示 delivery 结果。Hosted 不发现 Elapsed/ActiveUsage/protocol tools，不声称 OS 提示必达。

### EAG-09d：Knowledge search，capture 另门槛

查询仅访问当前 host 持有且属于用户的 KnowledgeSpace/index，输出来源、freshness 和有界片段。unavailable/local-only 与空结果明确区分；知识内容是数据，不能变成工具调用指令。

capture 只有在目标可写、路径受限、owner receipt/恢复机制可兑现后开放；不得让任意路径参数穿透文件系统。

验收：跨 owner/space 拒绝、未同步/过期索引可说明、超长内容截断透明、无任意 URL/path 访问；写入崩溃恢复有证据后才发布 knowledge_capture。

## 保护契约与验证

`reminder_*` CRUD 与设备远程执行不属于本票。每个子切片运行其 owner/api/contracts 和实际共享 Mastra fixture 的最近 targets；需要 timer/outbox/文件存储的切片增加 integration 与 prod-like evidence，不能用工具注册数量当完成度。

## 回退与移交

分别关闭对应 tool family；不删除已接受的 durable schedule、知识文档或 receipts。EAG-10 只依赖其 assisted workflow 实际使用的 owner 子切片。
