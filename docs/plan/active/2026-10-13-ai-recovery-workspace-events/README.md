---
tags: [plan, ai, goal, events]
status: in-progress
created: 2026-10-13T00:00:00Z
updated: 2026-10-13T00:00:00Z
description: Goal Embedded 后续优化：失败恢复、原生草稿交接与可靠事件同步的实施入口
---

# AI 失败恢复与 Workspace 事件同步

用户已授权在 `feat/goal-pane-embedded-editor-20261013` / PR #451 继续优化，先评审并形成系列文档，再开始实施。本计划落实该方向；不将整套事件架构标记为已交付。

## 文档入口

- [代码核验与架构评审](./01-review.md)：纠正请求链、失效控制和既有 SSE 能力的判断。
- [设计方案](./02-design.md)：交互、编辑权、失败契约、持久化事件和传输边界。
- [实施切片](./03-implementation.md)：依赖、落点、保护契约与每步交付条件。
- [验收与证据](./04-acceptance.md)：可执行场景、网络预算与实际验证记录。
- [最终接管审计](./05-final-audit.md)：2026-10-14 当前源码、A01–A23 和最终交付门禁的核验状态。

2026-10-14 接管后，S0–S7 均确认已有实现；发现并修复重连快照失败提前 ACK、初始水位竞态、
失败/晚加入消费者恢复和 Conversation 有界元数据问题。最终状态以 `05-final-audit.md` 为准；
下面的历史状态保留其原始时间与验证范围，不代表当前候选或远端已交付。

## 当前范围

本轮首先实施 S0：Goal 规划失败后保留当前打开表单，解除失效的 AI capability 与提交/取消协调关系，恢复原生编辑和保存。已有 owner 写入或结果不明时继续冻结、校准，禁止借交接再次创建 Goal。

S0 已在本分支工作区实现并通过 93 文件 / 902 测试、app-vue typecheck/lint 与治理检查。相关实现已纳入本地检查点 `9f6e9e33237`，尚未推送；验证细节见验收文档。此切片保留 owner 不确定性冻结状态，不新增终止 run 的人工核验入口。

S1 已实现安全限额分类、HTTP/IPC 失败契约、一处轻量中断提示和失权时保留只读表单。S2 已实现基于原生草稿的新 run、启动关联标识、原地重新授权和取消/迟到响应保护；未知启动结果先核验，不能直接再次创建。相关定向测试已通过，仍需最终集成验收。

S3/S4 已接通 Goal 的持久化事件、认证 Workspace SSE 与 Desktop IPC。LibSQL/Postgres 事务回滚、身份隔离、连接重建、Postgres 晚提交与真实 HTTP 双进程推送/续传测试已通过。Goal 的三处进度轮询已移除；定向测试覆盖健康连接 30 秒无周期 workflow/get、字段增量直接投影、重连/版本缺口校准、恢复时不擅自打开表单和过期 Resume ACK 不覆盖新状态。代码正在进行最终集成、部署与浏览器验收。

S5 已接通 Attention 的 PostgreSQL 原生事务触发器与 Desktop PowerSync 原生写入事务，包含已读确认、心跳、租约到期投影和删除。Goal/Attention 共用认证 SSE/IPC、分别记录两份持久化游标，前端按 host runtime 共用一条订阅；Attention 的 5 秒 interval 已删除。真实双存储补齐、PowerSync 反应式查询/到期通知、PG 晚提交及前端 30 秒请求预算已有定向证据，整体类型检查、浏览器与部署仍待最终验证。

S6 Conversation 精确事件同步与 S7 独立人工草稿检查点现已有工作区代码及定向测试。2026-10-14 续跑已验证 Conversation 的 PowerSync 版本事件、独立测试 PostgreSQL 事务/删除和 Workspace 多 owner 游标；Goal 检查点的原生保存回归与 Workflow 已创建 Goal 的字符串 ID 恢复核验也已通过。当前实现已在本地提交 `9f6e9e33237`、尚未推送，完整 Desktop 集成、prod-like 部署与当前候选 CI 尚未全面通过，不能宣称 S0–S7 最终交付；详见验收文档。

这是 [AI Interaction / Goal Workflow Convergence](../2026-10-04-ai-interaction-goal-workflow-convergence.md) 与 [Ask User + Goal Business Surface](../2026-10-12-ask-user-business-surface.md) 的后续专项；旧文档中的阶段性能力和验证记录不能替代本分支现状。
