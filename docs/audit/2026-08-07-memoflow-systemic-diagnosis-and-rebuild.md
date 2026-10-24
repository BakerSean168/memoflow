---
tags:
  - audit
  - architecture
  - business-loop
  - ui
  - refactor
  - codegraph
description: MemoFlow 从桌面壳层到业务闭环的系统性问题台账与大重构蓝图
created: 2026-08-07T00:00:00Z
---

# MemoFlow 系统性诊断与大重构蓝图

## 1. 文档定位

这是一份面向后续重构的总诊断文档，合并以下审查结果：

- [基础 UI 与 Shell 系统诊断](./2026-08-06-ui-foundation-shell-system-diagnosis.md)；
- [业务架构深度审查](./2026-08-07-business-architecture-deep-audit.md)；
- CodeGraph 对生产符号、调用者、runtime、repository、projection、AI executor 和跨模块写入链路的查询结果。

本文先记录问题，再定义目标结构和迁移顺序。问题按根因而不是按页面排列，避免通过增加组件、事件或 adapter 把同一个问题复制到更多地方。移动端不在本轮范围内。

本轮只新增审查文档，没有修改业务实现，也不把当前工作区中已有的 UI 未提交改动视为本轮产物。

## 2. 总体判断

MemoFlow 已经拥有 Goal、Task、Reminder、Schedule、Notification、Knowledge、AI、Dashboard、Repository 等大量功能资产，但当前更接近“多个功能模块的集合”，还不是一个具有统一业务真值和恢复语义的个人操作系统。

根因可以归结为四个结构性问题：

1. 计划、执行、投递、贡献、活动和复盘没有统一的业务账本。
2. 事件、timer 和 process-local runtime 被当作可靠基础设施使用，数据库没有完整的 outbox/inbox、claim、lease、receipt 和 cursor。
3. API、Desktop、Prisma、PowerSync、AI 各自拥有不同的组合根、生命周期和边界行为，同一个命令并不天然等价。
4. 跨模块关系通过散落的外键字段、中央 registry 和长 switch 表达，导致新增模块必须修改既有模块，业务耦合不断扩大。

因此不建议继续采用“发现一个缺口就加一个 handler/事件/字段”的策略。正确方向是先建立共享内核合同，再把现有模块迁移到该合同上。

## 3. 问题严重级别

- **P0**：会造成重复执行、永久丢失、不可恢复或核心业务真值错误，必须在继续扩展前处理。
- **P1**：功能看似可用但业务闭环不成立，或并发、同步、失败恢复语义不可靠。
- **P2**：扩展成本、认知成本、维护成本持续上升，应在共享内核稳定后收敛。

## 4. P0 根因问题

### P0-01 Schedule 没有 exactly-once 语义

证据：[`schedule.runtime.ts`](/home/ubuntu/projects/memoflow/packages/schedule/src/server/infrastructure/runtime/schedule.runtime.ts:133) 与 API/Desktop composition root 都能启动 Schedule Runtime；[`schedule-task-queue.ts`](/home/ubuntu/projects/memoflow/packages/schedule/src/server/application/scheduler/schedule-task-queue.ts:375) 是进程内优先队列。

当前 Reminder 执行路径会分步更新 Reminder、创建 Notification、保存 ScheduleTask。没有数据库级 occurrence key、原子 claim、租约、幂等账本或统一事务。

后果：

- API 与 Desktop 同时启动会重复执行；
- 进程在任意步骤崩溃会产生漏提醒、重复提醒或状态漂移；
- 重试无法判断是“重新执行”还是“继续执行”；
- runtime 停止不等待进行中的 handler；
- `handlerType/priority/enabled` 的创建语义没有完整贯穿；
- SourceModule 支持范围和 execution router 支持范围不一致。

这不是 queue 优先级问题，而是缺少“一个业务 occurrence 只能完成一次”的事实模型。

### P0-02 Projection 启动不对账，重建不可原子恢复

证据：[`task-projection-runtime.ts`](/home/ubuntu/projects/memoflow/packages/schedule-orchestration/src/runtime/task-projection-runtime.ts:31)、[`goal-projection-runtime.ts`](/home/ubuntu/projects/memoflow/packages/schedule-orchestration/src/runtime/goal-projection-runtime.ts:31)、[`reminder-projection-runtime.ts`](/home/ubuntu/projects/memoflow/packages/schedule-orchestration/src/runtime/reminder-projection-runtime.ts:31) 的 `start()` 只注册监听器，不执行初次 rebuild/reconcile。共享 projection [`shared-projection.ts`](/home/ubuntu/projects/memoflow/packages/schedule-orchestration/src/projectors/shared-projection.ts:60) 使用先删后逐条保存。

后果：

- 停机期间丢失的事件没有补偿路径；
- 历史 handler 失败不会自动回放；
- runtime 启动顺序决定读模型是否完整；
- 重建中途失败会把已有读模型变成半成品；
- projection 被误当成业务真值后，无法判断是源表错还是读模型错。

projection 必须有 durable cursor、版本、对账任务和原子交换机制，而不能只依赖“启动时监听未来事件”。

### P0-03 跨模块副作用没有统一持久化边界

Task -> Goal 使用了专用 TaskGoalOutbox，但 Schedule -> Reminder -> Notification、Goal -> Reminder、Knowledge -> AI index、Notification -> Desktop push 等链路仍大量依赖进程内 EventBus 或 fire-and-forget。

这导致系统存在多种不兼容的成功定义：源聚合保存成功、事件发送成功、projection 更新成功、用户收到通知，被不同模块分别当成“完成”。没有统一状态机就无法实现 crash recovery 和运维对账。

## 5. P1 业务闭环问题

### P1-01 Task 实例生成是查询副作用

证据：[`list-task-templates.use-case.ts`](/home/ubuntu/projects/memoflow/packages/task/src/server/application/use-cases/queries/list-task-templates.use-case.ts:53) 在查询模板时为每个 Active 模板启动非阻塞补充，异常只记录日志（:96-109）。

后果：

- 打开页面会偷偷写数据库；
- 并发请求会同时计算同一批实例；
- 生成失败不会反馈给本次查询；
- 查询无法重试，也无法提供生成任务的进度和 receipt；
- 读接口不再具备缓存、重放和水平扩展的纯函数特征。

应移除该副作用，改为独立的维护 worker 或显式 command。

### P1-02 Task occurrence 没有唯一业务键，手动生成忽略区间起点

[`task.prisma`](/home/ubuntu/projects/memoflow/packages/database/prisma/schema/task.prisma:165) 只有 `(templateId, instanceDate)` 普通索引，没有唯一 occurrence key。生成服务使用随机实例 ID，重复日期不会自然冲突。

[`generate-task-instances.use-case.ts`](/home/ubuntu/projects/memoflow/packages/task/src/server/application/use-cases/commands/generate-task-instances.use-case.ts:39) 接收 `fromDate`，但实际只把 `toDate` 传给 generator（:51-54）；[`task-instance-generation-service.ts`](/home/ubuntu/projects/memoflow/packages/task/src/server/domain/services/task-instance-generation-service.ts:35) 强制生成时从当前时间开始，并用固定 `86400000` 推算日期。

后果：重复任务、错误的时间范围、DST 边界漂移和离线重放冲突会同时出现。

### P1-03 Task 版本字段没有成为并发合同

TaskTemplate/TaskInstance 有 `version` 字段，但 [`UpdateTaskTemplateSchema`](/home/ubuntu/projects/memoflow/packages/contracts/src/modules/task/api/task-template.dto.ts:65) 没有 expectedVersion；更新 use case 读取后直接 upsert。complete、uncomplete、skip 同样没有统一版本校验。

后果：Web、Desktop、后台生成器互相覆盖；改时间规则时可能删除另一个客户端刚完成的实例；Goal 贡献无法知道状态转换的顺序。

Goal 已有 expectedVersion，而 Task 没有，说明仓库缺少统一 Command Contract，而不是单个 use case 漏写参数。

### P1-04 Task 完成和撤销完成不是对称状态机

[`complete-task-instance.use-case.ts`](/home/ubuntu/projects/memoflow/packages/task/src/server/application/use-cases/commands/complete-task-instance.use-case.ts:39) 会产生 Goal 贡献所需的完成 payload；[`uncomplete-task-instance.use-case.ts`](/home/ubuntu/projects/memoflow/packages/task/src/server/application/use-cases/commands/uncomplete-task-instance.use-case.ts:9) 只保存实例状态，没有 revert outbox 或 contribution ledger。

后果：Task 变回未完成后，Goal/KR 可能仍保留原贡献；Dashboard、Goal progress 和审计无法重放出一致结果。

### P1-05 Goal 与 Task 的 binding 缺少统一关系服务

TaskTemplate 通过 `goalId/keyResultId/goalRecordValue/goalProgressTrigger` 保存绑定。Prisma 通过复合关系部分约束 identity 和 KeyResult，但 BindTaskToGoalUseCase 本身不先调用 Goal owning module 做业务校验；PowerSync 本地表没有等价外键语义。

后果：错误绑定会以基础设施异常暴露，或者在本地落成悬空关系；Goal 删除、KeyResult 删除和 Task binding 变更不能统一决定 block/detach/cascade。

应把 relation 建模为显式跨模块关系，绑定命令由 relation policy 验证并产生关系事件。

### P1-06 Goal Review 是 CRUD，不是反馈环

证据：Goal Review 请求接受 title，但 [`goal.createAndAddReview()`](/home/ubuntu/projects/memoflow/packages/goal/src/server/domain/aggregates/goal.ts:1249) 不保存 title；评分使用 `params.rating || 3`（:1273）；实体字段是 `summary/improvements`：[`goal-review.ts`](/home/ubuntu/projects/memoflow/packages/goal/src/server/domain/entities/goal-review.ts:28)。更新调用 `addAchievement/addChallenge/addImprovement`，语义是追加而非替换。

数据库/portable DTO 又使用 `content/lessonsLearned/nextSteps`，Prisma 和 PowerSync mapper 把 lessonsLearned 映射为 improvements。字段在 domain、Prisma、PowerSync、portable codec 和 client DTO 之间没有一份 canonical contract。

更根本的问题是 `nextActions` 只是文本，不会创建 ActionItem、Task proposal、截止时间或 relation。复盘无法改变下一轮计划。

### P1-07 Goal 删除、子目标和 KeyResult 删除策略不一致

`DeleteGoalUseCase.checkDependencies()` 不是生产删除路径，`hasTaskLinks` 为 false；没有统一处理子目标、绑定 Task、绑定 KeyResult、GoalRecord 和 PowerSync 悬空字段的策略。Prisma 的 `TaskTemplate -> KeyResult` 是 Restrict，而 PowerSync 删除 KR/Goal 时不会清理 TaskTemplate 的 binding。

后果：API 和 Desktop 对同一删除动作可能产生不同结果；基础设施异常暴露为用户错误；父目标层级和关联任务无法保证一致。

### P1-08 Parent Goal 没有明确 rollup policy

Goal 有 `parentGoalId` 和 `children`，但没有稳定的“子目标如何贡献父目标进度”的 policy。当前进度主要按自身 KeyResult 计算，父目标不会自动形成可解释的聚合贡献。

应明确选择：手工汇总、子目标加权、KeyResult 聚合或禁止汇总，并把 policy 作为领域配置和可重放 projection，而不是在页面里临时 reduce。

## 6. P1 提醒、通知和日程问题

### P1-09 Reminder response 只做 analytics，不执行动作

[`reminder.controller.ts`](/home/ubuntu/projects/memoflow/packages/reminder/src/server/transport/reminder.controller.ts:196) 只检查 action 是字符串；[`reminder.module.ts`](/home/ubuntu/projects/memoflow/packages/reminder/src/server/infrastructure/reminder.module.ts:238) 直接 cast，丢弃 responseTime/note。记录用例 [`record-reminder-response.use-case.ts`](/home/ubuntu/projects/memoflow/packages/reminder/src/server/application/use-cases/commands/record-reminder-response.use-case.ts:71) 只保存分析记录。

点击 snooze/dismiss/complete 不会改变 ReminderOccurrence、Task 或 Schedule。`responseTime` 以秒传入，却先包装成 Date 再在 Prisma 中除以 1000：[`reminder-response.ts`](/home/ubuntu/projects/memoflow/packages/reminder/src/server/domain/entities/reminder-response.ts:77)、[`reminder-response-prisma.repository.ts`](/home/ubuntu/projects/memoflow/packages/reminder/src/server/infrastructure/adapters/prisma/reminder-response-prisma.repository.ts:28)。频率 apply 缺少 custom interval 时可能传入 0。record path 也没有先验证 template 属于当前 identity。

### P1-10 Notification 关联、投递和回执没有贯通

ScheduleNotificationRequest、数据库和查询接口有 related entity 字段，但 CreateNotification、Prisma repository、PowerSync repository 和 mapper 没有完整保存和返回，因此 `findByRelatedEntity()` 基本不可用。

Notification 聚合可先标记 Sent，渠道仍 Pending；`NotificationChannel.send/markAsDelivered/retry` 没有生产调用者；Desktop push 只是保存之后的进程内 best-effort 事件。

后果是通知点击无法可靠导航回 Goal/Task/Reminder/Schedule，渠道失败没有 durable retry，也无法区分“创建意图”和“送达用户”。

### P1-11 ScheduleTask optimistic lock 和字段语义未真正生效

ScheduleTask 有 version/expectedVersion 设计，但仓储更新条件没有形成有效的 compare-and-swap；CreateScheduleTaskUseCase 忽略 handlerType、priority、enabled 等请求字段。调度来源声明范围与 execution router 支持范围也不一致。

这说明 Schedule 的问题不是单个 queue bug，而是 schedule definition、occurrence、execution result 三种概念被压在一个实体上。

## 7. P1 可靠基础设施和运行时问题

### P1-12 通用聚合仓储会吞事件发布失败

[`aggregate-repository.base.ts`](/home/ubuntu/projects/memoflow/packages/patterns/src/repository/aggregate-repository.base.ts:35) 在事件发布异常时只写日志，并随后清空 event buffer（:47-58）。数据库已提交但跨模块事件丢失时，调用方仍获得成功。

Task/Goal 的部分路径有 buffered bus，但其他 GoalFolder、Reminder、Schedule、Notification、Knowledge 等路径仍依赖该基类或类似进程内 publisher。日志不能替代 outbox。

### P1-13 Task runtime 生命周期合同无法等待

Task module 的 `start/stop` 仍有 void 合同；outbox 首轮 dispatch 是 fire-and-forget，stop 只清 timer，不 drain 正在执行的任务。readiness 和 database close 无法覆盖后台生命周期。

所有模块需要异步 `start/stop/drain`，并由宿主按依赖逆序关闭。

### P1-14 API/Desktop 是重复的 runtime composition

同一业务模块在 API 和 Desktop 各自创建 repositories、runtime、AI executor 和事件监听器。对于需要单一执行者的 Schedule、索引、通知和维护任务，没有 lease 或 host ownership，因此“两个正常宿主同时运行”就成为重复副作用来源。

目标是把 API 定义为 cloud command/query host，把 Desktop 定义为 local/offline host；需要全局唯一执行的 worker 必须单独部署或通过数据库 lease 选主。

## 8. P1 AI、Knowledge 和 Dashboard 问题

### P1-15 AI 存在三套 side-effect 真值

当前同时存在 ProposalKernel、旧 Goal Automation workflow 和 Agent Runtime interrupt/execution 三套 side-effect 语义。ProposalKernel 主要改变内存状态，不执行领域 mutation；Goal Automation 直接调用 API；Agent Runtime 通过 interrupt 再调用另一个 executor。

后果：同一 AI 意图可能在不同入口产生不同审批、重试、执行回执和审计结果。应统一为“AI 只生成 immutable proposal，CommandGateway 执行批准后的 command”。

### P1-16 AI automation 是多步 best-effort 且没有 durable idempotency

[`generate-ai-goal.use-case.ts`](/home/ubuntu/projects/memoflow/packages/ai/src/server/application/use-cases/commands/generate-ai-goal.use-case.ts:84) 生成 requestId，但主要用于日志/执行记录。API/Desktop executor 顺序创建 Goal、Task、Reminder，单步失败后继续，不回滚已经创建的实体；重复确认会创建重复实体。

approved plan 缺少 plan hash、expiresAt、capability snapshot 和 action receipt。`create_key_result` 在 create_goal 已携带 initialKeyResults 时只是记录结果，不是独立 mutation，执行模型与 action 名称不一致。

### P1-17 Knowledge 自动索引没有 durable retry，关系类型不足

Knowledge note commit 的 GitHub 写入已有 request idempotency、connection lease 和持久化 write request，是当前较成熟的链路。但 note mutation 到 AI index 仍由进程内事件触发，失败只有日志；全 snapshot 会将全库 indexStatus 重置 pending 并发布 ContentUpdated，可能重新向量化全部 Note。

Note 之间有 WikiLink，但 Note 与 Goal/Task/Reminder 没有 typed relation，无法稳定查询反向引用、删除策略和 AI 上下文范围。

### P1-18 Dashboard 是合成时间线，不是 Activity Ledger

Dashboard 通过实体时间戳拼接 Goal/Task/Schedule 活动。Goal 任意编辑可能显示成“更新目标进度”；缺少 Reminder trigger、Notification receipt、Review、Knowledge mutation、AI run。`focusMinutes` 固定为 0，`tasksCreated` 统计模板而非实例，已归档 Task 的标题映射可能退化为未命名。

API/Desktop 都把大量数据全量加载后在内存过滤；本地 `startOfDay()`、`toISOString()` 和固定 DAY_MS 混用，非 UTC 与 DST 会出现日期偏移。

应建立 durable Activity Ledger 和窗口化 read model，由每个模块贡献可解释活动。

## 9. P2 扩展和数据一致性问题

### P2-01 Habit 不是领域能力

CodeGraph 没有发现 Habit aggregate、check-in、streak、occurrence 或 Goal contribution policy。重复 Task/Reminder 不能表达连续完成、跳过、补签、暂停和周期统计。

### P2-02 PowerSync 是第二套业务实现

PowerSync 本地表缺少 Prisma 等价的外键和删除策略。Goal/KR 删除后 TaskTemplate 的 goal_id/key_result_id 可能悬空；Prisma 的 Restrict/Cascade 与本地同步清理不一致。离线冲突和重放因此不是同一业务规则。

### P2-03 Data Portability 不是模块自描述

Data portability 使用固定 ExportableModule 枚举和长 if 链；新增 Wallet 需要修改多个中央文件。GoalReview、Task、Reminder 的 portable 字段还与领域字段存在 content/summary、lessonsLearned/improvements、nextSteps/nextActions 等语义转换。

目标是每个 module manifest 自带 export/import codec、schema version、relation resolver 和 round-trip contract。

### P2-04 ScheduleJob 是遗留存储模型

`ScheduleJob` 只有 Prisma schema、PowerSync schema 和 table mapping，没有领域代码和生产调用；当前真实执行模型是 ScheduleTask。开发阶段没有兼容要求，应直接删除遗留表及同步映射。

### P2-05 新模块依赖中央 registry

新增 Wallet 至少要改全局 Event/RPC registry、API/Desktop composition root、DashboardReadSource、Data Portability、Schedule SourceModule/router、前端 client registry 和 navigation。模块边界不开放，导致核心模块成为所有未来能力的变更中心。

## 10. UI 与桌面壳层问题

UI 问题不是独立的“样式问题”，而是业务状态和导航状态没有统一协议。

### UI-01 P0：Settings 场景会销毁 Workspace 和 AI 实例

`AppShell.vue` 通过 `StandaloneSettingsLayout v-if` 与 workspace `v-else` 切换。进入设置会卸载 AIChatView、业务 Tab 实例、流式会话和 Teleport 宿主。Pinia 中保留的 Tab 元数据不能恢复被销毁的组件状态。

`openSettings()` 没有统一调用 `canLeaveSurface()`；AI lifecycle helper 在卸载时会 abort active stream。未保存 Goal/Task/Repository 编辑和 AI 流式任务可能被静默打断。

目标是持久 WorkspaceSceneHost + 独立 SettingsSceneHost，不用互斥 v-if 销毁工作区。

### UI-02 P1：导航入口分叉，Route、Tab、Surface 和 Scene 没有单一协议

Header capsule 通过 `useShellRouterSync`，Home widget 直接 `router.push`，AI shortcut 又直接跳 route，设置返回自行决定目标，浏览器 back/forward 走另一条路径。

缺少 `landing`、`deep-link`、`activate-tab`、`enter-settings`、`surface-switch` 等导航意图，导致 dirty/busy 检查、Tab 复用、URL push/replace 和 origin 恢复不一致。

### UI-03 P1：复合胶囊的主入口和预览入口语义没有完全固定

复合胶囊的“左侧主按钮进入模块、右侧按钮预览”方向正确。主按钮应永远进入 landing；预览对象应进入精确 deep-link；查看全部应进入 landing。当前已有 Tab 时可能恢复旧详情 Tab，预览对象 ID 也可能在壳层 handler 中被忽略。

Schedule/Notification 入口应保留，Schedule preview 至少展示当前事件、接下来 2-3 条和当天剩余数量，不能只显示一段当前字符串。

### UI-04 P1：Dirty/Busy 保护覆盖不完整

当前主要覆盖 Goal/Task，Reminder、Schedule、Governance RuleEditor、Repository mutation 等没有统一注册 surface status。关闭 Tab、进入设置、切换模块和浏览器导航的保护行为不一致。

应建立按 route owner/Tab 管理的 status registry：busy 禁止离开，dirty 请求确认，clean 直接离开。

### UI-05 P1：KeepAlive 上限和 Tab 列表上限不一致

Tab 列表可能继续增长，而 KeepAlive `max=8` 会静默驱逐旧实例。于是 Tab 看起来仍存在，但表单草稿和局部组件状态已经被销毁。

必须选择显式策略：真正限制 Tab 数量、关闭时提示、或把持久草稿移入 store/持久化层；不能依靠 KeepAlive 隐式淘汰。

### UI-06 P1：BusinessPanel 与模块内部重复创建 scroll host

BusinessPanel wrapper、Task/Goal/Reminder/Notification/Repository 页面都可能声明 `overflow-auto`，造成嵌套滚动、滚轮抢占和 sticky 参照错误。

每个 surface 只能有一个主 scroll host；外层只负责尺寸裁剪，模块内部局部列表滚动必须显式标记。

### UI-07 P1/P2：设置页、模块骨架和摘要读模型不一致

设置页已移除遗留左侧场景栏，方向正确；但分类导航 sticky/ARIA 语义、实际分组数量与注释存在漂移。Goal、Task、Reminder、Schedule、Notification、Repository、Governance 各自重复 header、breadcrumb、secondary nav、返回和 content width。

Preview、Home widget、完整页面分别拉取数据，未共享同一 summary read model；Notification badgeSource 可能注册却没有传给 Header。

目标是统一 `ModuleFrame -> ModuleHeader -> ModuleSubnav -> ModuleContent`，由共享读模型提供摘要、未读和进度。

### UI-08 P2：Workflow 和 Help 的可见层级不清

AI workflow 状态同时出现在消息时间线、ActionBar、ContextPanel。应分别固定为历史、下一步操作、结构化审批/执行回执。Help 菜单全部 disabled/soon 时应隐藏未实现入口，而不是制造可见功能债务。

移动端 overlay sidebar、窄屏入口优先级、触屏手势和移动端截图矩阵延后，不在本总方案实施。

## 11. 目标业务模型：从功能集合到闭环

```text
Outcome / Goal
  -> KeyResult + ActionItem
  -> Task / Habit / ScheduleOccurrence
  -> atomic claim + execution
  -> ProgressContributionLedger (apply/revert)
  -> Notification DeliveryIntent/Receipt
  -> Activity Ledger + read models
  -> Review / learning
  -> next ActionItem / revised plan
```

各模块职责：

- Goal 拥有 Outcome、KeyResult、Review 和 rollup policy；不直接修改 Task 表。
- Task 拥有 Template、Occurrence、Execution transition 和 contribution intent；不直接更新 Goal progress。
- Habit 拥有 Schedule、Occurrence、CheckIn、Streak 和 Goal contribution policy。
- Schedule 只负责 occurrence planning/claim，不把所有业务动作塞进 ScheduleTask。
- Reminder 负责 reminder definition 和 occurrence response；Notification 负责 delivery intent/attempt/receipt。
- Knowledge 负责 Note、typed relations 和 indexing job；AI 只读取/提议/调用 command。
- Dashboard 只读取 Activity/Projection，不从任意实体 updatedAt 猜业务事实。

## 12. 目标共享内核

### 12.1 CommandEnvelope

```typescript
interface CommandEnvelope<T> {
  commandId: string;
  idempotencyKey: string;
  identityId: string;
  actorId: string;
  expectedVersion?: number;
  correlationId: string;
  causationId?: string;
  occurredAt: number;
  timezone: string;
  payload: T;
}
```

所有 Web、Desktop、AI 和 worker 写入都进入 owning module 的 CommandGateway。API/IPC 只负责 transport validation，不再各自拼装业务规则。

### 12.2 SubjectRef 与 Relation

```typescript
interface SubjectRef {
  module: string;
  type: string;
  id: string;
  identityId: string;
}

interface Relation {
  relationId: string;
  type: string;
  from: SubjectRef;
  to: SubjectRef;
  policy: 'required' | 'optional' | 'derived';
  createdAt: number;
  deletedAt?: number;
}
```

Goal/Task/Note/Reminder/Wallet 的关系通过同一合同表达，删除和反向查询通过 relation policy 处理，不再靠任意 `goal_id` 字段猜测。

### 12.3 Occurrence

```text
Occurrence
  sourceRef
  occurrenceKey
  ruleRevision
  scheduledAt / timezone
  claimedBy / leaseUntil
  status: planned -> claimed -> executing -> completed|failed|cancelled
  attemptCount / nextAttemptAt
```

Occurrence key 必须 deterministic，数据库唯一约束必须覆盖 sourceRef + occurrenceKey。claim 使用原子条件更新，worker 重启可以继续处理 expired lease。

### 12.4 Outbox/Inbox/Receipt

```text
OutboxMessage(messageId, type, aggregateRef, payload, availableAt, attempts, status)
InboxReceipt(consumer, messageId, processedAt, result)
DeliveryAttempt(deliveryId, channel, attempt, status, error, nextRetryAt)
DeliveryReceipt(deliveryId, providerMessageId, deliveredAt, openedAt, failedAt)
```

进程内 EventBus 只做低延迟 wake-up；不能成为唯一投递路径。消费方必须幂等，失败必须保留消息，不得用日志代替状态。

### 12.5 ContributionLedger 与 ActivityLedger

Goal progress 不直接接受 Task/ Habit 事件改变，而由不可变 contribution 记录累计：

```text
Contribution
  contributionId
  sourceRef
  targetRef
  amount
  operation: apply | revert
  sourceTransitionVersion
  occurredAt
```

Activity 记录“谁在何时对什么做了什么，以及由哪个 command/event 导致”，Dashboard 只读取 Activity projection。

## 13. ModuleManifest：可扩展而非中央清单

```typescript
interface ModuleManifest {
  module: string;
  commands: CommandDescriptor[];
  queries: QueryDescriptor[];
  events: EventDescriptor[];
  consumers: ConsumerDescriptor[];
  scheduleAdapters: ScheduleAdapterDescriptor[];
  relationTypes: RelationTypeDescriptor[];
  activityContributions: ActivityContributionDescriptor[];
  navigationResolvers: NavigationResolverDescriptor[];
  portability: PortabilityCodec;
  aiTools: AIToolDescriptor[];
}
```

宿主只扫描 manifest 并注入基础设施。新增 Wallet 时，Wallet 自己声明交易事件、预算关系、活动贡献、导入导出 codec、查询和 AI tools，不修改 Dashboard、Schedule、Data Portability 的中央 switch。

## 14. 大刀阔斧的迁移顺序

### R0：建立真值和运行时 ownership

- 明确 API、Desktop、worker 的职责和 scheduler ownership；
- 所有 command 生成 correlation/idempotency/actor 信息；
- 增加 occurrence、outbox、projection lag、delivery、conflict、AI partial failure 指标；
- 建立双宿主、崩溃恢复、DST、PowerSync、导入导出基线。

### R1：可靠消息和异步生命周期

- 新增 OutboxMessage、InboxReceipt、ProjectionCursor；
- 改造 AggregateRepositoryBase，不再吞事件失败；
- 所有 runtime 统一 async start/stop/drain，按依赖逆序关闭；
- projection 启动 reconcile，重建使用 staging + 原子交换；
- 所有消息带 schema version、messageId、correlationId 和 retry policy。

### R2：Occurrence、Task 和 Goal contribution

- 生成 deterministic occurrenceKey 和数据库唯一约束；
- 移除查询补充，改为独立 maintenance worker；
- 修复 fromDate、LocalDate、timezone 和 DST；
- TaskTemplate/TaskInstance 写命令加入 expectedVersion；
- 完成/撤销统一写 contribution ledger；
- Goal 进度和父子 rollup 改为可重放 projection。

### R3：Schedule、Reminder、Notification

- scheduler 使用 database lease/heartbeat，只有一个 active host；
- ScheduleOccurrence 原子 claim；
- Reminder action 直接执行 occurrence command；
- Notification 建模 subject/navigation/delivery/attempt/receipt；
- 生产化渠道 retry/dead-letter；
- 删除 ScheduleJob 遗留模型。

### R4：Review、ActionItem 和 Habit

- 统一 Review contract，修复 title/rating/nextActions 字段漂移；
- next action 变成 ActionItem 或可确认 Task proposal；
- 新增 Habit、HabitOccurrence、CheckIn、StreakProjection、ContributionPolicy；
- 复盘和 check-in 都产生 Activity 和 planning signal。

### R5：Knowledge 和 AI CommandGateway

- Note mutation -> index job outbox，按 content hash 增量索引；
- Note 与 Goal/Task/Reminder/Habit 建 typed relations；
- AI 只生成带 plan hash、expiresAt、capability snapshot 的 immutable proposal；
- 执行通过 CommandGateway 和 action receipt；
- 部分失败使用 saga/补偿，重复提交按 idempotency key 去重；
- Agent Runtime、ProposalKernel、旧 Goal Automation 收敛为一个 side-effect 真值。

### R6：Activity/Dashboard 和统一桌面壳层

- 每个 module manifest 声明 activity contribution 和 summary read model；
- Dashboard 使用窗口化 query，不全量加载到内存；
- AppShell 建立持久 WorkspaceSceneHost + SettingsSceneHost；
- 所有入口使用 ShellNavigationIntent；
- 统一 ModuleFrame、ModuleHeader、ModuleSubnav、唯一 scroll host；
- dirty/busy 状态由 route owner/Tab registry 管理；
- 复合胶囊保持“主入口 landing + 预览入口 summary/deep-link”双动作契约。

### R7：Wallet 作为扩展性验证模块

- Wallet 只拥有自己的聚合、relation、commands、projection、portability 和 AI tools；
- 与 Goal 的关系通过 Relation，不写 Goal/Task 表；
- 以 Activity、Outbox、CommandGateway、ModuleManifest 接入宿主；
- 验证核心模块无新增中央 if/switch。

## 15. 验收矩阵

| 场景                                  | 通过条件                                                  |
| ------------------------------------- | --------------------------------------------------------- |
| 两个 API/worker 同时 claim occurrence | 只有一个成功，另一个可安全重试                            |
| Scheduler 在 source mutation 后崩溃   | 重启最终完成一次 source mutation 和一次 delivery intent   |
| Notification channel 失败             | durable retry、退避、dead-letter 和 receipt 可查询        |
| Projection 首次启动/中断重建          | 自动 reconcile，旧读模型不会变成半成品                    |
| 两客户端编辑 Task                     | 一个成功，一个 CONFLICT，不静默覆盖                       |
| Task 完成后撤销                       | Contribution apply/revert 后 Goal 与 Task 一致            |
| 任务列表并发打开                      | 查询无写副作用，不产生重复 occurrence                     |
| DST/时区切换                          | 本地日期和时间点保持正确                                  |
| Reminder snooze/complete/dismiss      | 源状态、响应、通知回执形成可追踪链路                      |
| Goal review 提交                      | 可生成带状态和 relation 的下一行动                        |
| Habit check-in                        | streak、跳过、补签、暂停和 Goal contribution 可重放       |
| AI execute 重试                       | 同 plan hash/action id 不重复创建实体                     |
| Knowledge 全量对账                    | 只索引内容变化的 Note，不全库重置 pending                 |
| PowerSync 离线冲突                    | 与 Prisma 使用同一版本和 relation policy，无悬空关系      |
| Export -> Import -> Export            | 关系、时间、状态和 Review 字段等价                        |
| Settings 导航                         | dirty/busy 可拦截，Workspace/AI 不被销毁                  |
| Tab 超出缓存上限                      | 有明确限制或持久草稿，不静默驱逐实例                      |
| 各模块滚动                            | 每个 surface 一个主 scroll host，sticky 行为一致          |
| 新增 Wallet                           | 只改 Wallet、manifest、migration 和测试，不改中央核心清单 |

## 16. 完成定义

在 R1-R3 可靠执行和 Task/Goal 闭环没有通过上述矩阵前，不继续添加新的自动化模块或复杂 UI 功能。通过后，Habit、Knowledge、AI 和 Wallet 才能建立在同一共享内核之上。

最终目标不是让每个页面都能“显示一个状态”，而是让系统能回答并证明：

1. 这个目标为什么存在；
2. 哪个任务/习惯/日程正在推进它；
3. 这次执行是否只发生了一次；
4. 进度贡献是否可以撤销和重放；
5. 提醒是否真的投递和送达；
6. 复盘产生了哪一个下一行动；
7. AI 的每一步是否经过授权、可恢复且不重复；
8. 新增模块是否可以通过 manifest 接入而不污染核心。
