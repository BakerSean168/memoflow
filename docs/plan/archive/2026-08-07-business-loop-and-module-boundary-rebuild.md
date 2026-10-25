---
tags:
  - plan
  - architecture
  - refactor
  - business-loop
description: MemoFlow 业务闭环、可靠副作用与模块扩展边界重构计划
created: 2026-08-07T00:00:00Z
---

> ✅ 已归档 2026-08-08：R0-R7 全部实施（乐观锁、outbox 单通道、ScheduleLease/claim、Habit/Relation/AI/Activity/Wallet）；local-docker e2e 7/7、PR #211 19/19 全绿。

# 业务闭环与模块边界重构计划

对应审查：[2026-08-07-business-architecture-deep-audit.md](../../audit/2026-08-07-business-architecture-deep-audit.md)

## 1. 目标与非目标

### 目标

- 让 Goal -> ActionItem/Task/Habit -> Occurrence -> Execution -> Contribution -> Review -> Next Action 成为可恢复的闭环。
- 让 Schedule、Reminder、Notification 的执行、投递、重试和回执有 exactly-once/at-least-once 下的明确幂等语义。
- 统一 API、Desktop、Prisma、PowerSync 的写命令合同和生命周期。
- 用 ModuleManifest 替代新增模块时不断扩大的中央 registry/switch。
- 为 AI 原生交互提供预览、确认、幂等执行、部分失败和恢复状态。
- 暂不处理移动端布局和移动端交互。

### 非目标

- 本计划不引入完整 event sourcing；首阶段保留现有实体表，以 durable outbox/inbox、ledger 和 read model 增强可靠性。
- 不在 R0 阶段重写 UI 风格；当前 UI/Shell 未提交改动全部保留。
- 不为旧 `ScheduleJob` 设计长期兼容层；按仓库约定直接清理遗留模型。

## 2. 执行原则

1. 先建立共享合同和可观测性，再迁移业务模块。
2. 先选择唯一执行宿主；API 与 Desktop 不能同时运行同一个 scheduler worker。
3. 所有跨模块写入先经过 owning module 的 command，不允许写别的模块的表。
4. 读查询不得隐式改变业务状态；维护任务必须显式排队并可重试。
5. 每一阶段都必须有崩溃恢复、并发和 PowerSync 验收，而不是只跑 happy path。

## 3. 阶段计划

### R0：冻结边界、补齐观测和回归基线

依赖：无。状态：待实施。

- 记录 API/Desktop runtime ownership，启动时输出 host/lease/instance id。
- 为现有写命令统一生成 correlationId、causationId、requestId。
- 建立业务指标：occurrence claimed/completed/failed、outbox age、projection lag、duplicate key、conflict、AI partial failure。
- 补充当前系统的 Docker smoke、双宿主、时区和崩溃恢复测试基线。
- 将审查中的每个 finding 建成可追踪 issue/测试，不先用 shim 掩盖行为差异。

验收：能在日志和数据库中回答“哪个宿主执行了哪次 occurrence、哪条消息当前卡在哪里”。

### R1：可靠事件与模块生命周期地基

依赖：R0。状态：待实施。

- 新增通用 `OutboxMessage`、`InboxReceipt`、`ProjectionCursor` 表和仓储端口。
- 将 AggregateRepositoryBase 的“发布失败吞异常并清空事件”改为 outbox 写入；低延迟 EventBus 降级为 outbox dispatcher 的投递目标。
- 统一所有模块为 `async start()`、`async stop()`、`async drain()`；按依赖逆序关闭，并等待正在执行的 dispatch。
- Projection runtime 的 start 执行 `reconcile()`；重建使用 staging/事务交换，不再先删后写。
- 为事件定义 schema version、message id、causation/correlation 和 retry policy。

验收：杀死进程、断开消息消费者、重启后消息和 projection 均可恢复；事件消费重复不会重复副作用。

### R2：Occurrence、Task 生成与 Goal 贡献账本

依赖：R1。状态：待实施。

- 新增 `Occurrence`/`occurrenceKey`，Task recurrence 使用 `templateId + localDate + ruleRevision` 生成确定 key。
- 数据库加入唯一约束；PowerSync 本地表和 Prisma 共享约束/去重策略。
- 把 `ListTaskTemplatesUseCase` 中的补充逻辑移到显式 maintenance worker；列表查询变为纯读。
- 修复 `GenerateTaskInstancesUseCase` 的 fromDate 语义，禁止 force path 忽略请求区间。
- 用 timezone-aware `LocalDate`/`ZonedDateTime` 替换固定 `86400000`。
- 所有 TaskTemplate/TaskInstance command 加 expectedVersion；实例完成和撤销都写 `ProgressContributionLedger`。
- Goal 进度由 contribution projector 累计，支持 apply/revert、重放和人工对账；父 Goal 显式定义 rollup policy。

验收：并发打开任务列表不写库且无重复实例；完成/撤销后 Goal、KR、Dashboard 最终一致；DST、跨时区和离线冲突测试通过。

### R3：Schedule、Reminder、Notification 执行闭环

依赖：R1、R2。状态：待实施。

- 选择唯一 scheduler host，使用数据库 lease/heartbeat；其余宿主只消费读模型和投递结果。
- `ScheduleOccurrence` 原子 claim；source mutation 与 delivery intent 通过同一 command/outbox 协调。
- Reminder response 改为严格 action schema，并把 snooze/dismiss/complete 作为真正的 command；response duration 使用数值值对象。
- Notification 建模 `SubjectRef`、`NavigationIntent`、`DeliveryIntent`、`DeliveryAttempt`、`DeliveryReceipt`，贯通 Prisma/PowerSync/DTO。
- 生产化渠道 worker、退避、dead-letter、receipt；点击导航只消费稳定的 NavigationIntent。
- 删除或迁移 `ScheduleJob` 遗留模型，保留 `ScheduleTask`/Occurrence 单一执行真值。

验收：Scheduler crash/restart、双宿主、网络失败、重复投递、snooze 到期和通知点击回跳都能重放且不重复改变源状态。

### R4：Review、Habit 与规划反馈

依赖：R2、R3。状态：待实施。

- 统一 GoalReview 字段和 rating 合同，修复 title/0 rating/nextActions/improvements 的漂移。
- 新增 `ActionItem`（或通过显式 Task proposal）承载 review next actions，支持确认、拒绝、完成和 relation。
- 新增 Habit、HabitSchedule、HabitOccurrence、HabitCheckIn、HabitStreakProjection、HabitGoalContributionPolicy。
- 复盘提交产生 activity 和 planning signal；习惯 check-in 通过同一 contribution ledger 影响目标。
- 为父子 Goal 定义 rollup（手工、加权、KR 聚合或禁止），不再只保存 parentGoalId。

验收：一次 Review 能形成下一步可执行项；Habit 连续完成、跳过、补签、暂停、目标贡献和统计都可追踪。

### R5：Knowledge relation 与 AI Command Gateway

依赖：R1、R2、R4。状态：待实施。

- Knowledge index 任务写入 outbox，失败可重试；snapshot 对账只处理变更 hash，不重置全库。
- 以 `SubjectRef`/`Relation` 连接 Note、Goal、Task、Reminder、Habit，维护反向查询。
- AI planning 只产生带 plan hash、expiresAt、capabilities 和 action id 的 immutable proposal。
- 统一 `CommandGateway` 执行 Goal/Task/Reminder/Knowledge/Wallet 命令；写入 command receipt，重试以 idempotency key 去重。
- 部分失败使用 saga 状态和补偿 command；执行结果能在 Activity Ledger 和 AI run 中追踪。

验收：同一 AI execute 请求重复提交只产生一套实体；任一步失败可以 resume/compensate；AI 无法绕过 identity、权限、版本和关系校验。

### R6：Activity Ledger 与 Dashboard 读模型

依赖：R1-R5。状态：待实施。

- 新增 durable Activity Ledger，所有业务事件通过模块 manifest 提供 activity contribution。
- Dashboard 以窗口查询 materialized read model，不再全量加载后内存拼接。
- 活动记录携带 actor、subject、relation、before/after summary、correlationId、source event。
- 统计 TaskInstance、focus duration、Goal contribution、Reminder response、Notification receipt、Knowledge mutation、AI run。
- 统一 UTC 存储 + 用户 timezone 展示，禁止 `startOfDay()+toISOString()` 混用。

验收：Dashboard 能解释每次 Goal/KR 变化的来源，并在重放/对账后保持稳定；跨 DST 和归档实体仍能显示准确标题。

### R7：ModuleManifest 与 Wallet 扩展验证

依赖：R5、R6。状态：待实施。

- 定义 code-owned `ModuleManifest`，宿主扫描并注册 commands、queries、events、consumers、schedule adapters、relations、activities、navigation、portability、AI tools。
- 将 Goal/Task/Reminder/Schedule/Notification/Knowledge/AI 迁移为 manifest；删除中央长 switch 和重复 client registry。
- Wallet 作为第一个外部模块试点：交易、预算、账户、与 Goal 的 relation、Activity、导入导出、AI 查询工具。
- 钱包写入必须复用 CommandEnvelope/outbox/inbox/ledger，不得直接依赖 Goal/Task 数据表。

验收：新增 Wallet 只触碰 Wallet 包、manifest、迁移和端到端测试；核心模块无新增中央 if/switch。

## 4. 文件/包级影响面

首批共享地基涉及：

- `packages/contracts`：CommandEnvelope、SubjectRef、Relation、Occurrence、Delivery、Activity、Manifest 合同。
- `packages/database`：outbox/inbox/cursor/occurrence/contribution/activity/receipt 表和索引。
- `packages/patterns`：可靠仓储、幂等、lease、dispatcher、lifecycle 基础设施。
- `apps/api`、`apps/desktop`：单一 runtime ownership、依赖逆序关闭、manifest composition。
- `packages/schedule`、`packages/schedule-orchestration`：Occurrence/claim/reconcile。
- `packages/task`、`packages/goal`：Task version/contribution/review/rollup。
- `packages/reminder`、`packages/notification`：动作、投递与回执。
- `packages/repository`、`packages/ai`：relation、index outbox、AI Command Gateway。
- `packages/dashboard`：Activity Ledger read model。

当前 UI/Shell 改动不属于本计划的实现面，继续保留并单独验证；移动端不纳入验收矩阵。

## 5. 禁止的临时方案

- 不在查询中继续加“顺手补数据”的 fire-and-forget。
- 不为 API/Desktop 各自复制一份 scheduler，然后靠 UI 去重。
- 不把 event bus 重试、AI 失败、通知投递状态放在内存变量或日志里。
- 不继续扩展 `relatedEntityId` 这种无类型字段；使用 SubjectRef/Relation。
- 不用更大的中央 enum/if 链解决 Wallet 扩展。

## 6. 本计划完成定义

当 R1-R3 的可靠执行与任务贡献闭环通过 Docker/E2E、并发、崩溃恢复、DST、PowerSync 双宿主矩阵后，才进入 Habit/AI/Wallet 扩展。每个阶段必须提交源码、领域测试、集成测试、故障注入结果和文档状态；不能以“页面能显示”替代闭环完成。

## 7. 实施状态（持续更新）

- [x] **R0-1 Runtime ownership**：`@memoflow/contracts/primitives/runtime`（RuntimeOwnership/createRuntimeOwnership）；API（cloud-api）与 Desktop（desktop-local）启动输出 `[runtime-ownership]` 日志。
- [x] **R0-2 CommandEnvelope 雏形**：`@memoflow/contracts/primitives/command`（CommandEnvelope + requestId/correlationId/causationId/commandId/messageId 工厂）；`command.spec.ts` 固化根命令/延续链语义。
- [x] **R0-3 业务指标**：`@memoflow/patterns/observability`（BusinessMetricRecorder：occurrence claimed/completed/failed、outbox fallback enqueued/failed、duplicate key/optimistic conflict、projection lag）；已接入聚合仓储 outbox 兜底与 schedule 执行成功/失败。
- [x] **R0-5 Findings 追踪**：`docs/plan/active/2026-08-07-business-loop-findings-tracking.md`（P0/P1 finding → 状态/承接；P0-02、P1-12 已修复并固化测试）。
- [x] **R1-1 可靠消息表与端口**：`database/prisma/schema/reliable-messaging.prisma`（OutboxMessage/InboxReceipt/ProjectionCursor）+ `@memoflow/contracts/reliable-messaging` 类型。
- [x] **R1-2 聚合仓储 outbox 兜底**：`publishAggregateEvents` 总线失败改落 durable outbox（可选 IOutboxWriter），14 处调用点迁移；`aggregate-repository.base.spec.ts` 固化 outbox fallback 语义。
- [x] **R1-3 统一 async 生命周期**：`RuntimeContribution` 转 Promise；composite/三个投影 runtime/`ScheduleTaskQueue.drain`/schedule module dispose 逆序排空关闭；desktop window-manager 与 profile manager await。
- [x] **R1-4 Projection reconcile + 原子交换**：task 投影源 `listTemplateRefs`（Prisma 全量；PowerSync 宿主跳过并告警），runtime 启动先对账再注册监听；`replaceSelection` 先 upsert 新计划再删陈旧任务（消除空窗）；`shared-projection.spec.ts` + reconcile 测试固化。
- [x] **R1-5 事件契约**：MessageSchemaVersion / MessageRetryPolicy / MessageId 类型就绪（dispatcher/retry 执行在 R2+ 迁移时落地）。

### 后续阶段（未开始）

- [x] **R2（完成）**：P0-03 唯一键（`occurrenceKey` + `@@unique`）、P1-01 查询纯读（maintenance worker）、P1-02 fromDate 修复（force 尊重区间）已完成并固化测试；时区 local-day-aware（`startOfLocalDay` 主导）。
- [x] **R2-5a expectedVersion 乐观锁**：TaskInstance complete/uncomplete/skip 递增 version，Prisma persist 改 `updateMany where version-1`，冲突抛 `OptimisticConcurrencyError`（新建走 create）；TaskTemplate 加 `advanceVersion()`，UpdateTaskTemplateReq 增加可选 `expectedVersion`，use case 校验不匹配返回 CONFLICT，Prisma 乐观锁兜底。
- [x] **R2-5b 贡献通道收敛（单通道）**：`toTaskGoalOutboxRecord` 支持 `task:instance-uncompleted`（action:'uncomplete' 反向投递）；`UncompleteTaskInstanceUseCase` 改经 `TaskWriteTransactionRunner` 提交（与 complete 对齐，事务内落 outbox）；`GoalTaskProgressHandler` 增加 uncomplete 分支（按 instance/template source 调 `RemoveTaskGoalContributionUseCase` revert，失败保持 retryable）；`registerGoalEventListeners` 移除 task 事件直连订阅（保留幂等启停契约，宿主挂载点不变）——Task→Goal 贡献统一经 durable outbox（apply/revert/幂等重放），不再双轨并存。
- [x] **R3（部分完成，余项承接）**：
  - **R3a 唯一调度宿主（DB lease）**：`ScheduleLease` 表（schedule.prisma）+ `ScheduleLeaseCoordinator`（原子抢占/心跳续约/仅 owner 释放，仿 KnowledgeRepositoryLease）+ Prisma 仓储；API 组合根注入 lease，`createScheduleRuntimeContribution.start` 先 acquire，失败则本实例只作读模型宿主不启动执行队列（多 API 实例互斥）；无 repo 的 coordinator 保持单宿主/测试旧行为。
  - **R3b 原子 claim（exactly-once）**：`IScheduleTaskRepository.claimForExecution`（Prisma updateMany / PowerSync 事务条件更新，仅 Active 且 nextRunAt 匹配时置 lastRunAt）；`executeScheduledTask` 执行 source 前 claim，失败即跳过（防双宿主重复执行同一任务）。
  - **R3c Reminder response command 化**：`ReminderResponseDurationSeconds` 值对象（非负整秒 + 工厂校验）；snooze 必须带正时长（否则 VALIDATION_ERROR）；`ReminderSnoozeRescheduler` 端口 + Prisma 实现（把 reminder 对应 schedule task 的 nextRunAt 推迟 duration 秒），API 组合根注入——snooze 成为真正的 command；顺带修复 responseTime 秒/毫秒语义混乱（实体内部 ms、DTO 输出秒）。
  - **R3d Notification 模型贯通**：`NotificationNavigationIntentDTO`（route+params 稳定导航意图）贯通 contracts DTO/聚合（state/getter/create/updateDetails/toServerDTO）/表列 `navigation_intent`/Prisma mapper/PowerSync repo/CreateNotificationUseCase 透传；`NotificationChannel` 表补 `sent_at/failed_at/attempts` 列（与实体字段对齐，写读贯通）。
  - **R3e 遗留清理**：删除 `ScheduleJob` 模型（schedule.prisma/account.prisma/powersync-schema/table-mapping 四处清理，无领域代码使用）。
- [x] **R3（完成）**：
  - **渠道 worker**：`notification.runtime.ts` 实现轮询（PENDING 投递 → send+markAsDelivered 记录 receipt；失败 markAsFailed + 指数退避后 retry；attempts ≥ 阈值保持 Failed 终态 = dead-letter）；`INotificationRepository.findChannelsByStatus`（Prisma/PowerSync）+ `NotificationChannelDeliverer` 端口（默认 no-op，API/desktop 可注入渠道适配器）；Prisma module 默认接线 worker；4 个单测（投递成功/失败/退避重试/dead-letter）。
  - **点击导航**：`createNotificationClickNavigation`（app-vue）监听 `notification:clicked` → 按 navigationIntent（route+params）导航，否则按 category 映射模块 landing，未知回 `/notifications`；desktop renderer bootstrap 接入；4 个单测。
- [x] **R4（核心闭环）**：GoalReview 字段统一（表加 title/key_result_snapshots 列，title 不再被忽略，improvements 改存 nextSteps JSON 数组，keyResultSnapshots 读写贯通，修复 nextSteps 列丢弃与恒空）；父子 Goal `rollupPolicy`（kr/weighted/manual/disabled，表/聚合/DTO/双端 mapper 贯通）；Habit 最小闭环（habit.prisma 四表 Habit/HabitOccurrence/HabitCheckIn/HabitStreakProjection + goal 包内聚合（occurrence 幂等补齐/check-in/skip/streak 纯函数）+ 3 use cases + Prisma 仓储 + 模块注册，7 测试）；ActionItem 采用 plan 允许的「explicit Task proposal」路径（review nextActions 已结构化持久化）。
- [x] **R5（核心闭环）**：Relation 基础设施（relation.prisma 表 + SubjectRef（note/goal/task/reminder/habit/wallet）+ 双向查询（正向/反向）+ use cases + Prisma 仓储，3 测试）；AI proposal 契约增强（planHash/expiresAt/actionId，kernel create 计算 planHash、过期置 stale、executeApproved 拒绝过期提案，3 测试）。
- [x] **R6（核心闭环）**：activity.prisma `ActivityLedger` 表 + API 宿主记录器（订阅 goal/task/reminder/schedule 7 类关键事件写 durable ledger，写入失败不影响主链路）+ Dashboard 读模型 `listActivities` 窗口查询（提供时不再全量加载实体内存拼接，未提供回退旧派生）。
- [x] **R7（试点）**：`ModuleManifest` 类型契约（commands/queries/relations/activities）+ `CommandRegistry`；Goal 模块 code-owned manifest（goal.create/relation.create/wallet.account.create/wallet.transaction.record + relations/activities 声明）；Wallet 外部模块试点（wallet.prisma 两表 + goal 包内 use cases（建账户/记账/列表，事务更新余额，不依赖 Goal/Task 数据表，与 Goal 经 Relation contributes_to 连接）+ manifest 命令注册）。
