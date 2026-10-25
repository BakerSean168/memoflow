---
tags:
  - audit
  - architecture
  - business-loop
  - codegraph
description: MemoFlow 业务闭环、可靠性与模块扩展性的深度审查
created: 2026-08-07T00:00:00Z
---

# MemoFlow 业务架构深度审查

## 1. 结论先行

MemoFlow 已经具备 Goal、Task、Reminder、Schedule、Notification、Knowledge 和 AI 的大量实体、页面与 API，但当前仍不能把它们视为一个可靠的业务系统。主要断点不是“缺少几个按钮”，而是以下三个事实：

1. 关键副作用仍由进程内事件和 timer 驱动，数据库没有统一的幂等、租约、投递回执和恢复账本。
2. 多个领域对象只保存了“描述业务的字段”，没有完成从计划到执行、从执行到贡献、从复盘到下一行动的状态迁移。
3. API、Desktop、Prisma、PowerSync 和 AI 各自有一套组合与行为，导致同一个命令在不同宿主上的一致性、并发和恢复语义不稳定。

本审查使用 CodeGraph 的 `explore`、`node`、`callers` 查询追踪生产调用链；对 CodeGraph 未覆盖或返回编译产物的局部位置，再用源码行号确认。范围不包含移动端。当前只写入审查与计划文档，没有修改业务代码，也没有宣称测试通过。

## 2. P0：必须先治理的正确性风险

### P0-1 Schedule 仍没有 exactly-once 执行语义

证据：[`schedule.runtime.ts`](/home/ubuntu/projects/memoflow/packages/schedule/src/server/infrastructure/runtime/schedule.runtime.ts:133) 与 API/Desktop 两套 composition root 都可以启动 runtime；[`schedule-task-queue.ts`](/home/ubuntu/projects/memoflow/packages/schedule/src/server/application/scheduler/schedule-task-queue.ts:375) 使用进程内优先队列。执行 Reminder 时会先改 Reminder，再写 Notification，最后保存 ScheduleTask，步骤之间没有同一事务、occurrence key、数据库 claim 或 lease。

影响：API 与 Desktop 同时运行时可能重复执行；进程崩溃可能漏通知或留下“已执行但未投递”；重试可能重复写通知。当前的 `handlerType`、`priority`、`enabled` 也没有完整进入创建语义，SourceModule 可以声明 Notification/System/Custom，但 router 只支持部分来源。

目标：调度只产生一个可 claim 的 `ScheduleOccurrence`，使用数据库原子租约抢占；执行产生 `DeliveryIntent`，通过 outbox 投递；完成、失败、重试都由 occurrence ledger 记录。

### P0-2 Projection 没有启动对账，停机期间的事件无法自动修复

证据：[`task-projection-runtime.ts`](/home/ubuntu/projects/memoflow/packages/schedule-orchestration/src/runtime/task-projection-runtime.ts:31)、[`goal-projection-runtime.ts`](/home/ubuntu/projects/memoflow/packages/schedule-orchestration/src/runtime/goal-projection-runtime.ts:31)、[`reminder-projection-runtime.ts`](/home/ubuntu/projects/memoflow/packages/schedule-orchestration/src/runtime/reminder-projection-runtime.ts:31) 的 `start()` 只注册监听器，没有首次 rebuild/reconcile。共享 projection 的重建先删除再逐条保存：[`shared-projection.ts`](/home/ubuntu/projects/memoflow/packages/schedule-orchestration/src/projectors/shared-projection.ts:60)。

影响：运行时启动顺序、事件丢失和历史处理失败会永久形成脏读模型；重建中途失败还会留下半个 projection。读模型不能作为业务真值。

目标：每个 projection 具有 durable cursor、版本和对账任务；启动时先读取 cursor 并补事件，再用 staging 表或单事务交换快照，重建失败不破坏旧读模型。

## 3. P1：当前闭环中最严重的断点

### P1-1 Task 实例生成是查询副作用，且重复发生没有数据库护栏

证据：[`list-task-templates.use-case.ts`](/home/ubuntu/projects/memoflow/packages/task/src/server/application/use-cases/queries/list-task-templates.use-case.ts:53) 在列出模板时对每个 Active 模板启动非阻塞补充，补充异常只打印日志（:96-109）。[`task.prisma`](/home/ubuntu/projects/memoflow/packages/database/prisma/schema/task.prisma:165) 只有 `(templateId, instanceDate)` 普通索引，没有唯一约束或 occurrence key。[`generate-task-instances.use-case.ts`](/home/ubuntu/projects/memoflow/packages/task/src/server/application/use-cases/commands/generate-task-instances.use-case.ts:39) 接收 `fromDate`，但实际调用 generator 时只传 `toDate`，generator 又以当前时间作为强制生成起点（:51-54）。

影响：两个并发列表请求可以同时生成相同日期的随机 ID 实例；用户打开页面就触发写入，失败不反馈；手动按区间生成会忽略起始边界。`lastGeneratedDate` 和固定 `86400000`（[`task-instance-generation-service.ts`](/home/ubuntu/projects/memoflow/packages/task/src/server/domain/services/task-instance-generation-service.ts:35)）还把“日期”当成 UTC 毫秒，DST 会造成边界漂移。

目标：将生成改为独立维护 worker；以 `templateId + occurrenceKey` 唯一约束保证幂等；生成命令明确使用业务时区的 `LocalDate` 和请求区间；查询只读。

### P1-2 Task 模板与实例的并发版本字段没有形成命令合同

`TaskTemplate` 和 `TaskInstance` 有 `version` 字段，但 [`UpdateTaskTemplateSchema`](/home/ubuntu/projects/memoflow/packages/contracts/src/modules/task/api/task-template.dto.ts:65) 没有 `expectedVersion`，[`update-task-template.use-case.ts`](/home/ubuntu/projects/memoflow/packages/task/src/server/application/use-cases/commands/update-task-template.use-case.ts:79) 直接读取后 upsert。实例的 complete/uncomplete/skip 也没有 expected version。

影响：Web、Desktop、后台生成器的最后写入者覆盖前一个写入者；模板改时间规则时可能删除另一个客户端刚刚完成的实例。Goal 已经有 expected version，Task 却没有同一合同，跨模块贡献无法判断哪一个状态是真值。

目标：所有写命令使用 `CommandEnvelope`（commandId、identity、expectedVersion、correlationId），仓储使用 `UPDATE ... WHERE version = expectedVersion`，冲突返回业务错误。

### P1-3 完成任务和撤销完成不是对称的业务操作

[`complete-task-instance.use-case.ts`](/home/ubuntu/projects/memoflow/packages/task/src/server/application/use-cases/commands/complete-task-instance.use-case.ts:39) 会在事务内写实例，并为 Goal 贡献准备 payload；TaskGoal outbox 只覆盖完成。[`uncomplete-task-instance.use-case.ts`](/home/ubuntu/projects/memoflow/packages/task/src/server/application/use-cases/commands/uncomplete-task-instance.use-case.ts:9) 直接保存状态，没有撤销贡献的 durable outbox。

影响：撤销完成后 Goal/KR 仍可能保留原贡献，Dashboard 和 Goal 读模型出现漂移。事件重放也无法区分“完成一次”和“完成后撤销”。

目标：建立不可变 `ProgressContributionLedger`，用 `contributionId = taskInstanceId + transitionVersion` 记录 apply/revert；Goal projection 只消费账本，不直接猜测当前 Task 状态。

### P1-4 Goal 复盘模型存在字段丢失和语义漂移，不能产生下一步行动

证据：请求接收 `title`，但 [`goal.createAndAddReview()`](/home/ubuntu/projects/memoflow/packages/goal/src/server/domain/aggregates/goal.ts:1249) 没有 title 字段；评分使用 `params.rating || 3`（:1273），0 会被改为 3。领域实体只保存 `summary/achievements/challenges/improvements`：[`goal-review.ts`](/home/ubuntu/projects/memoflow/packages/goal/src/server/domain/entities/goal-review.ts:28)。更新使用 `addAchievement/addChallenge/addImprovement`（:1311-1336），不是替换，且 `nextActions` 被映射为 `improvements`。

数据库和可移植 DTO 又使用 `content/lessonsLearned/nextSteps`：[`goal.prisma`](/home/ubuntu/projects/memoflow/packages/database/prisma/schema/goal.prisma:183)、[`portable-goals.dto.ts`](/home/ubuntu/projects/memoflow/packages/contracts/src/modules/data-portability/dtos/portable-goals.dto.ts:36)。Prisma/PowerSync mapper 将 `lessonsLearned` 映射成 `improvements`，但没有一个统一的行动实体。

影响：复盘内容在不同适配器间变形；更新会不断追加重复文本；复盘的 next action 只是字符串，不会创建/链接 Task，也不能在下一轮计划中被追踪。

目标：统一 `Review` 合同，保留快照；把 next action 建模为 `ActionItem` 或显式 Task proposal，拥有状态、负责人、截止时间和 relation；复盘提交产生 `review.completed`，由规划服务生成可确认的下一步。

### P1-5 Reminder 的“响应”只记录分析，不执行用户请求的动作

[`reminder.controller.ts`](/home/ubuntu/projects/memoflow/packages/reminder/src/server/transport/reminder.controller.ts:196) 只检查 action 是字符串；[`reminder.module.ts`](/home/ubuntu/projects/memoflow/packages/reminder/src/server/infrastructure/reminder.module.ts:238) 将其直接 cast 后调用记录用例，丢弃 responseTime/note。记录用例 [`record-reminder-response.use-case.ts`](/home/ubuntu/projects/memoflow/packages/reminder/src/server/application/use-cases/commands/record-reminder-response.use-case.ts:71) 只创建 `ReminderResponse`、保存并发事件，未修改 Reminder、Schedule 或 Task。

实体将 responseTime（秒）包装为 `Date`，Prisma 又除以 1000：[`reminder-response.ts`](/home/ubuntu/projects/memoflow/packages/reminder/src/server/domain/entities/reminder-response.ts:77)、[`reminder-response-prisma.repository.ts`](/home/ubuntu/projects/memoflow/packages/reminder/src/server/infrastructure/adapters/prisma/reminder-response-prisma.repository.ts:28)。这不是持续时间的稳定表示。`adjustFrequency` 的 apply 路径在 controller/module 中没有从分析结果计算新间隔，缺少 customInterval 时传入 0。

影响：点击“稍后提醒/完成/关闭”不会改变源业务状态；频率建议无法可靠应用；统计本身也可能读到错误响应时长。记录跨 identity 的 templateId 也没有在 record path 先做归属检查。

目标：将用户动作拆成 `ReminderOccurrence.respond()`，由 command gateway 执行 source mutation，再写 response receipt；动作使用严格 schema，response duration 用整数毫秒/秒值对象；频率建议保存为可确认 proposal。

### P1-6 Notification 有关联字段，但关联、投递、回执链路断裂

`ScheduleNotificationRequest` 和数据库包含 related entity 字段，但 CreateNotification 用例、Prisma repository、PowerSync repository 和 mapper 没有把字段贯穿保存，导致 `findByRelatedEntity()` 基本不可用。Notification 聚合会先标记 Sent，而渠道仍 Pending；`NotificationChannel.send/markAsDelivered/retry` 没有生产调用者。Desktop push 是保存后的进程内 best-effort 事件。

影响：通知点击不能稳定导航回 Goal/Task/Reminder/Schedule；渠道失败无法重试或观察；调度成功与用户实际收到通知混为一谈。

目标：统一 `SubjectRef`、`NavigationIntent`、`DeliveryIntent`、`DeliveryAttempt`、`DeliveryReceipt`；Notification 只代表意图，渠道投递由 durable worker 完成。

### P1-7 通用聚合仓储会吞掉事件发布失败

[`aggregate-repository.base.ts`](/home/ubuntu/projects/memoflow/packages/patterns/src/repository/aggregate-repository.base.ts:35) 在发布单个事件失败时只记录日志，随后仍清空 aggregate event buffer（:47-58）。这让“数据库写成功、事件没发出”看起来像成功。Task/Goal 部分路径有专用 buffered bus，但其他模块仍走此基类。

影响：读模型、通知、AI 索引和审计可能静默丢事件，且没有补偿任务。日志不是可靠消息队列。

目标：所有跨边界事件先写同事务 outbox；发布失败只改变 outbox 状态，不清除待投递消息；消费方用 inbox 去重并可重放。

### P1-8 AI 自动化是多步 best-effort，重复执行会重复创建实体

[`generate-ai-goal.use-case.ts`](/home/ubuntu/projects/memoflow/packages/ai/src/server/application/use-cases/commands/generate-ai-goal.use-case.ts:84) 生成 requestId，但 requestId 只用于日志和 execution log。API/Desktop executor 按 action 顺序逐个调用 Goal、Task、Reminder：[`backend-automation-tool-executor.adapter.ts`](/home/ubuntu/projects/memoflow/apps/api/src/modules/ai/backend-automation-tool-executor.adapter.ts:49)。单步失败会记录 failed 后继续，已创建的 Goal 不会回滚；`create_key_result` 实际依赖 create_goal 的 initialKeyResults 并只记录“executed”。

影响：网络重试或用户重复确认会创建重复 Goal/Task/Reminder；部分成功需要人工判断；approved plan 没有过期、哈希或 command id 约束。

目标：AI 只生成 immutable plan；执行通过统一 `CommandGateway`，以 plan hash + action id 幂等；可选择原子批处理，或明确的 saga/补偿状态；每一步有 durable execution receipt。

## 4. P2：结构性和扩展性问题

### P2-1 Habit 不是领域能力

CodeGraph 未发现 Habit aggregate、check-in、streak、occurrence 或 Goal contribution policy。重复 Task/Reminder 只能模拟提醒，不能表达“连续完成、跳过、补签、周期统计”等习惯语义。

### P2-2 Dashboard 是实体时间戳拼接，不是活动账本

Dashboard projection 把 Goal/Task/Schedule 的更新时间拼成活动，缺少 Reminder trigger、Notification receipt、Review、Knowledge mutation、AI run；focusMinutes 固定为 0，Task 统计偏向 template。它无法回答“为什么目标进度变化”以及“通知是否真的送达”。

### P2-3 Knowledge 的索引恢复和关系查询仍依赖进程内事件

Note mutation 之后由进程内事件触发 AI index，失败只有日志；全量 snapshot 会把所有 Note 标成 pending 并发布 ContentUpdated，可能触发全库重新向量化。WikiLink 有图，但 Note 与 Goal/Task/Reminder 没有 typed relation 和反向维护。

### P2-4 PowerSync 是第二套业务实现

PowerSync 没有完整外键，删除 Goal/KR 后不会清理 TaskTemplate 绑定；Prisma 的 Restrict/Cascade 语义和本地 SQL 不一致。任何跨模块删除、冲突解决和重放都必须同时维护两套规则。

### P2-5 新模块仍需要修改多个中央清单

新增 Wallet 至少需要修改全局 event/RPC registry、API/Desktop composition root、Dashboard source、Data portability enum/if 链、Schedule SourceModule/router、前端导航和 client registry。应由 code-owned `ModuleManifest` 声明这些能力，宿主只扫描 manifest。

### P2-6 ScheduleJob 是遗留存储模型

`ScheduleJob` 只有 Prisma、PowerSync 和同步映射，没有领域代码或生产调用；当前执行模型是 `ScheduleTask`。在没有兼容需求的开发阶段应删除遗留表与映射，避免新功能继续误接入。

## 5. 目标业务闭环

```text
Goal / Outcome
  -> KeyResult + ActionItem
  -> Task / Habit / ScheduleOccurrence
  -> atomic claim + execution
  -> ProgressContributionLedger
  -> Notification DeliveryReceipt
  -> Activity Ledger + Goal read model
  -> Review / learning
  -> next ActionItem / revised plan
```

核心原则：

- Goal、Task、Reminder、Habit、Wallet 等模块拥有自己的聚合和写模型，不互相直接修改表。
- 跨模块关系使用 `SubjectRef { module, type, id, identityId }`，业务关系使用 `Relation { type, from, to, policy }`。
- 跨模块副作用只能通过 durable outbox/inbox；进程内 EventBus 只做低延迟通知，不能作为唯一真值。
- 所有计划性执行都有 `Occurrence`，所有外部投递都有 `DeliveryAttempt/Receipt`，所有进度都有不可变 contribution ledger。
- Query 不得隐式写库；补充实例、重建 projection、索引向量必须由 worker/command 执行。

## 6. 统一模块边界

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

宿主只负责发现 manifest、注入基础设施和注册 runtime。Wallet 以后只需声明 `wallet.transaction.created`、预算 relation、Activity contribution、export codec 和 AI tools，不再修改 Dashboard 或 Data Portability 的中央 switch。

## 7. 可靠性合同

所有写命令统一使用：

```text
CommandEnvelope
  commandId / idempotencyKey
  identityId / actorId
  expectedVersion
  correlationId / causationId
  occurredAt / timezone
```

所有异步消息统一使用：

```text
OutboxMessage(messageId, aggregateRef, type, payload, availableAt, attempts, status)
InboxReceipt(consumer, messageId, processedAt, result)
```

所有 occurrence 统一使用：

```text
Occurrence(sourceRef, occurrenceKey, scheduledAt, claimedBy, leaseUntil,
           executionStatus, completedAt, failureCode)
```

## 8. 验收矩阵

| 场景                                                  | 必须证明的结果                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| 两个 API 实例同时抢一个 occurrence                    | 只有一个 claim 成功，另一个可安全重试                                      |
| Scheduler 崩溃于 source mutation 与 notification 之间 | 重启后继续，最终只产生一份 source mutation 和一份 delivery intent          |
| Projection runtime 首次启动                           | 自动从 cursor/账本对账，旧读模型不被半成品覆盖                             |
| 两个客户端更新同一 TaskTemplate                       | 一个成功，一个收到 CONFLICT，不得静默覆盖                                  |
| 完成再撤销 Task                                       | Goal contribution 可 apply/revert，最终与 Task 状态一致                    |
| 任务列表并发打开                                      | 查询无写副作用，occurrence 唯一，不产生重复实例                            |
| DST 春秋切换                                          | LocalDate + timezone 规则保持正确的本地时刻                                |
| Reminder snooze/complete/dismiss                      | 源状态、response、notification receipt 三者可追踪                          |
| Notification 渠道失败                                 | 有 durable retry、退避、最终失败状态和可观测 receipt                       |
| AI execute 重试                                       | 相同 plan hash/action id 不重复创建实体                                    |
| PowerSync 离线冲突                                    | 使用同一版本/幂等合同，不能产生悬空 relation                               |
| Export -> Import -> Export                            | 关系、状态、时间、复盘字段 round-trip 等价                                 |
| 新增 Wallet                                           | 只新增 manifest 和模块代码，不修改中央 dashboard/portability/router switch |

## 9. 结论

当前最优先的工作不是继续增加模块页面，而是先把“计划、occurrence、贡献、投递、活动、关系、命令”做成稳定的共享合同。完成 R0-R3 后，Goal/Task/Reminder/Schedule 才能形成可恢复闭环；Habit、Knowledge、AI 和 Wallet 应建立在这些合同之上，而不是继续增加跨模块直接调用。
