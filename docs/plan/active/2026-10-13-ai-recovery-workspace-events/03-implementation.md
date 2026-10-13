---
tags: [plan, implementation, ai, goal, events]
created: 2026-10-13T00:00:00Z
updated: 2026-10-13T00:00:00Z
description: 失败恢复与事件驱动状态同步的依赖切片
---

# 实施切片

各切片交付后系统必须可用，未接入事件的 owner 保持原读取行为；接入成功时删除其轮询，不增加永久双轨。当前授权包括落文档并开始实施，S0 先执行。后续切片在实际完成并验证前保持待实施。

## S0 · 失败后的原生草稿脱离（首个实施切片）

状态：S0 已实现并通过本地验证，已形成本地检查点 `9f6e9e33237`，尚未推送。S1–S5 已完成定向实现与验证；S6/S7 也已有工作区实现及部分真实测试，但尚未通过全部集成、prod-like 与交付门禁。

依赖：现有 Goal native session、server surface lease、owner-first 保存恢复。

修改 `goalNativeEditSession.ts`、`GoalDialog.vue`、`useGoalNativeReviewCoordinator.ts` 和 `useAIGoalWorkflow.ts`。增加原子 detachWorkflow；failed projection 调用保留表单的失效清理，屏蔽旧异步投影。普通审核 handoff 保留原语义。

交付：已填字段、KR、dirty 原地保留；失效 callbacks 解除；旧 AI handle 拒绝写入；用户原生验证、保存、取消可用；租约停止续租并释放。pending owner attempt / 已保存 Goal 不进入自由 create。

验证：真实 GoalDialog 的 coordinator/native persistence 测试，composable 的 live/review/manual-handoff failed 测试，projection race 与 owner 不确定性回归。先运行新增测试观察 RED，再实现 GREEN。

## S1 · 一处轻量中断与安全错误分类

状态：已实现，定向测试通过；最终集成验收待完成。包括 lease 失权时冻结原表单及显式重新核验控制权。

依赖：S0。

修改 terminal failure schema、provider adapter mapper、durable failure projection、HTTP/IPC、`error.ts`、timeline projection、Goal runtime status 与中英文 locale。复用 failure registry/ retry hint 规范；实现分类前盘点当前安全错误 mapper。

交付：同一 run 在原状态项显示中断，停止加载；已保留草稿说明准确；不叠加重复 Toast/错误消息。429 仅在有结构化证据时区分限流与配额不足；等待建议不触发自动调用。

同时收敛未确认终止的传输/lease 失权路径：草稿保持只读，停止旧 AI patch，核验 run/owner 后才提供可用恢复操作；不再由失权回调自动关闭内容，不授予第二次 create。

验证：provider 结构化 fixture、secret-negative、HTTP/IPC parity、locale 完整性和每种 failure UI 场景。读取失败与业务失败保持区分。

## S2 · 基于现有草稿重新规划

状态：已实现，原生表单及真实 runtime 定向测试通过；最终集成验收待完成。保存结果已知或不确定时继续保护，不能再授予自由 create。

依赖：S0/S1。

修改 start request schema、native draft-to-plan mapping、Goal start coordinator 和表单重新授权流程。显式重试创建新 run；捕获 current draft/version，新 fence 获取后开始动作，禁止重开空表单。

交付：切模型/渠道、稍后重试、继续编辑三种操作符合状态；旧 run 不能 resume；用户编辑期间的并发启动被拒绝或明确重新确认；取消启动和 late response 不覆盖草稿。

验证：新 run input 包含手动修改；failed run 不被 resume；新旧 run race；有已保存 owner receipt 时禁止再次创建。

## S3 · Goal durable 状态通知试点

状态：已实现并通过定向验证，最终集成/部署验收进行中。LibSQL 与 Postgres 的真实存储、回滚、身份隔离、晚提交游标和连接恢复已验证；真实 HTTP SSE 另进程写入、推送和断线补齐已验证。认证 SSE 与带 ACK 的 Desktop IPC 已接入。

依赖：S1 的安全 failure 契约；事件设计可以与 S2 独立推进。

落点：`mastra-durable-workflow.runtime.ts`、`goal-business-action-journal.ts`、真实 storage adapter seam、AI contracts 与 transport composition root。先补 characterization/contract tests，列全实际写入点。

第一步验证 Postgres/LibSQL transaction seam，确定 snapshot + durable handoff 的原子路径或可证明完整的恢复路径。覆盖 live action、suspend、failed/completed、resume/cancel。不能仅在路由返回时 emit。定义 resource revision、operation id、committed delivery cursor；用 fault injection 证明崩溃恢复。然后把 Goal 事件从目标 Workspace endpoint/IPC 输出，保持独立 notification endpoint。

交付：第二进程订阅者可收到每次已提交变化；没有写入的数据不发成功事件；cursor 可补齐；事件仅含已鉴权安全 projection。没有经过真实存储证明，不得进入移除轮询阶段。

## S4 · Goal 客户端订阅与轮询收敛

状态：已实现并通过定向验证，最终集成/部署/浏览器验收进行中。Goal 三处进度轮询已移除，健康连接 30 秒无周期 get、动作直接投影、gap/reconnect、迟到读响应、恢复不擅自打开表单和过期 Resume ACK 均有回归测试。

依赖：S3。

落点：Web/Desktop bootstrap、runtime client subscription、`useAIGoalWorkflow`、`useAIChatView`、`useAIWorkflowReconciliation`、`runtime-workflow.ts`。

交付：Goal run 注册到唯一 subscription，初始快照与事件无窗口丢失，action batch 即时更新原生表单，提问/答复/终止在 Chat 投影。Goal-specific 定时 get 删除；generic reconciliation 不再覆盖已订阅 Goal；resume 不靠 500ms 等待取进度。Task/Knowledge 保留现状直到自己的订阅完成，不破坏仍依赖 awaitStableWorkflowRun 的调用语义。

验证：健康连接运行 30 秒零周期 workflow/get；每次字段变化不触发多余读取；重连、gap、乱序、身份切换、dispose、UI patch 拒绝、失效 lease 都可恢复且不越权。

## S5 · Attention 第二 owner 与共享机制提取

状态：已实现并通过定向验证，整体集成/部署验收进行中。真实 PowerSync 事务、回滚、重启、反应式查询、过期投影和 PG 晚提交/已读语义已验证；前端去掉 5 秒 interval，Goal/Attention 共用 host 订阅。

依赖：S3/S4，已有 Attention revision/seenRevision。

落点：attention observer、Prisma/PowerSync persistence adapters、runtime contracts、`useDurableConversationAttention`。将 changed/acknowledged 的持久变更放入可靠事件路径；Web 与 Desktop 都保持 semantics。

交付：去掉 5 秒 interval；初始化、列表作用域变化、前台/重连校准仍读取；已读 N 不覆盖 N+1；重新登录和跨窗口实时徽标正确。Goal 与 Attention 两个真实 owner 验证后才提取复用的 stream/dispatcher/cursor 设施。

验证：重复事件、ack 与新版本 race、第二进程更新、断线多于一页历史、健康连接零周期 attention/list。

## S6 · Conversation 精确同步

状态：已有 PostgreSQL/PowerSync 持久事件写入、服务端 resourceVersion 与前端按 ID 更新/删除投影；2026-10-14 使用专用测试库补跑 PostgreSQL 事务、版本与 tombstone 测试通过，PowerSync 和多 owner 游标定向测试也通过。仍需全量前端竞争回归、部署与当前候选 CI 验收。

依赖：S5。

落点：Conversation 写入 owner、标题生成调用、摘要 contract 与单条查询、`useConversationProjection`、bootstrap subscription。

交付：服务端确认创建后仍立即 upsert；标题/活动/删除发 revision 事件，按 ID 更新；服务端版本替代时间戳覆盖判断。完整列表只用于初始化、分页、显式刷新、断线校准。乐观 pending 的接受/拒绝与对应 operationId 明确，删除 tombstone/version 不能被晚到列表复活。

验证：并发两个客户端改标题、列表请求期间创建/删除、乱序事件、客户端时钟偏差、事件与初始快照交错、分页之外资源更新。

## S7 · 独立草稿检查点

状态：已引入 IndexedDB 检查点与 CAS、多窗口冲突、身份作用域、稳定 Goal create ID、刷新恢复及 owner 回执核验，并已有单元/浏览器回归。2026-10-14 修正字符串 Goal ID 的结果核验，GoalDialog 48 项回归通过；仍须完整集成和部署验收，不视为已交付。

依赖：S0/S2；不依赖所有 owner 的 SSE 都完成。

落点由 Goal owner 决定，新增独立 validated checkpoint 存储与 CAS 命令。正式 Goal Save 仍由原生 Goal owner，checkpoint 与正式数据分开。

交付：刷新、断线、重新登录后按身份恢复人工字段，旧 AI 不覆盖；提交/丢弃的清理及多窗口冲突明确。不能以持久 workflow candidate draft 替代人工表单 checkpoint。

验证：refresh/relogin、两窗口 CAS conflict、旧身份不可见、正式 Goal 未提前创建、保存响应丢失不会重复创建。

## 收尾要求

每个切片完成后更新验收证据与状态。涉及 runtime/storage/SSE/部署配置的 S3 及以后须按仓库 `validate-local-deploy` 工作流执行 prod-like 验证，补真实 HTTP/PG 与 Desktop LibSQL/IPC 证据。PR 合并前核验该 HEAD CI；交付目标是否上线属于独立 delivery verification。本轮不据历史 CI 宣称当前更改已验证。
