---
tags:
  - product
  - module-index
  - task
description: Task vNext（Plan / Occurrence）模块相关文件索引
created: 2026-06-02T00:00:00
updated: 2026-09-29T11:38:00+08:00
---

# Task vNext 文件索引

本索引连接 Task vNext 的产品语义与当前真实代码。2026-09 收敛后，主模型是 **TaskPlan + TaskOccurrence**；旧 TaskTemplate / TaskInstance 文件名不再是当前真值。

## 前端页面、状态与表单

| 文件 | 说明 |
| --- | --- |
| [`packages/app-vue/src/modules/task/router/index.ts`](../../../packages/app-vue/src/modules/task/router/index.ts) | Vue Task 路由入口 |
| [`packages/app-vue/src/modules/task/views/TaskManagementView.vue`](../../../packages/app-vue/src/modules/task/views/TaskManagementView.vue) | Task 管理主页面 |
| [`packages/app-vue/src/modules/task/views/TaskDetailView.vue`](../../../packages/app-vue/src/modules/task/views/TaskDetailView.vue) | TaskPlan 详情页 |
| [`packages/app-vue/src/modules/task/stores/task-store.ts`](../../../packages/app-vue/src/modules/task/stores/task-store.ts) | Task Pinia store |
| [`packages/app-vue/src/modules/task/composables/useTask.ts`](../../../packages/app-vue/src/modules/task/composables/useTask.ts) | TaskPlan / TaskOccurrence 聚合 composable |
| [`packages/app-vue/src/modules/task/composables/useTaskPlanListQuery.ts`](../../../packages/app-vue/src/modules/task/composables/useTaskPlanListQuery.ts) | TaskPlan 列表查询 |
| [`packages/app-vue/src/modules/task/composables/useTaskPlanDetailQuery.ts`](../../../packages/app-vue/src/modules/task/composables/useTaskPlanDetailQuery.ts) | TaskPlan 详情查询 |
| [`packages/app-vue/src/modules/task/composables/useTaskPlanMutations.ts`](../../../packages/app-vue/src/modules/task/composables/useTaskPlanMutations.ts) | TaskPlan mutation |
| [`packages/app-vue/src/modules/task/composables/useTaskOccurrences.ts`](../../../packages/app-vue/src/modules/task/composables/useTaskOccurrences.ts) | TaskOccurrence 查询/操作 |
| [`packages/app-vue/src/modules/task/composables/useTaskPlanForm.ts`](../../../packages/app-vue/src/modules/task/composables/useTaskPlanForm.ts) | TaskPlan 表单模型 |
| [`packages/app-vue/src/modules/task/composables/useTaskGoalBindingOptions.ts`](../../../packages/app-vue/src/modules/task/composables/useTaskGoalBindingOptions.ts) | Goal / KR 绑定选项 |
| [`packages/app-vue/src/modules/task/components/TaskPlanForm/TaskPlanForm.vue`](../../../packages/app-vue/src/modules/task/components/TaskPlanForm/TaskPlanForm.vue) | TaskPlan 编辑表单 |
| [`packages/app-vue/src/modules/task/components/dialogs/TaskPlanDialog.vue`](../../../packages/app-vue/src/modules/task/components/dialogs/TaskPlanDialog.vue) | TaskPlan 创建/编辑弹窗 |
| [`packages/app-vue/src/modules/task/components/dialogs/QuickTaskDialog.vue`](../../../packages/app-vue/src/modules/task/components/dialogs/QuickTaskDialog.vue) | Quick Task；当前 route/deep-link 集成断开，target 保留并修复 |
| [`packages/app-vue/src/modules/task/components/TaskOccurrenceRow.vue`](../../../packages/app-vue/src/modules/task/components/TaskOccurrenceRow.vue) | canonical occurrence 行内执行语义 |
| [`packages/app-vue/src/modules/task/components/widgets/DailyTodoWidget.vue`](../../../packages/app-vue/src/modules/task/components/widgets/DailyTodoWidget.vue) | Today Overview legacy occurrence surface；需迁移到 canonical action semantics |
| [`packages/app-vue/src/modules/task/components/TaskPlanForm/sections/KeyResultLinksSection.vue`](../../../packages/app-vue/src/modules/task/components/TaskPlanForm/sections/KeyResultLinksSection.vue) | 当前 fixed contribution UI；target 三模式 KR record rule |
| [`packages/app-vue/src/modules/goal/components/dialogs/GoalRecordDialog.vue`](../../../packages/app-vue/src/modules/goal/components/dialogs/GoalRecordDialog.vue) | 当前 Sum-biased record dialog；target measurement-aware shared composer |
| [`packages/app-vue/src/modules/goal/components/GoalKeyResultTrajectoryPlot.vue`](../../../packages/app-vue/src/modules/goal/components/GoalKeyResultTrajectoryPlot.vue) | KR trajectory 视觉语法参考；不要直接复用为 record preview contract |

## API、控制器与客户端适配器

| 文件 | 说明 |
| --- | --- |
| [`packages/task/src/api/routes/task-plan.routes.ts`](../../../packages/task/src/api/routes/task-plan.routes.ts) | TaskPlan HTTP routes |
| [`packages/task/src/api/routes/task-occurrence.routes.ts`](../../../packages/task/src/api/routes/task-occurrence.routes.ts) | TaskOccurrence HTTP routes |
| [`packages/task/src/server/transport/task-plan.controller.ts`](../../../packages/task/src/server/transport/task-plan.controller.ts) | TaskPlan controller |
| [`packages/task/src/server/transport/task-occurrence.controller.ts`](../../../packages/task/src/server/transport/task-occurrence.controller.ts) | TaskOccurrence controller |
| [`packages/task/src/infrastructure-client/adapters/http/task-plan-http.adapter.ts`](../../../packages/task/src/infrastructure-client/adapters/http/task-plan-http.adapter.ts) | HTTP TaskPlan adapter |
| [`packages/task/src/infrastructure-client/adapters/http/task-occurrence-http.adapter.ts`](../../../packages/task/src/infrastructure-client/adapters/http/task-occurrence-http.adapter.ts) | HTTP TaskOccurrence adapter |
| [`packages/task/src/infrastructure-client/adapters/ipc/task-plan-ipc.adapter.ts`](../../../packages/task/src/infrastructure-client/adapters/ipc/task-plan-ipc.adapter.ts) | IPC TaskPlan adapter |
| [`packages/task/src/infrastructure-client/adapters/ipc/task-occurrence-ipc.adapter.ts`](../../../packages/task/src/infrastructure-client/adapters/ipc/task-occurrence-ipc.adapter.ts) | IPC TaskOccurrence adapter |

## 领域、用例与持久化

| 文件 | 说明 |
| --- | --- |
| [`packages/task/src/server/domain/aggregates/task-plan.ts`](../../../packages/task/src/server/domain/aggregates/task-plan.ts) | TaskPlan 聚合根 |
| [`packages/task/src/server/domain/aggregates/task-occurrence.ts`](../../../packages/task/src/server/domain/aggregates/task-occurrence.ts) | TaskOccurrence 聚合根 |
| [`packages/task/src/server/domain/aggregates/task-plan-lifecycle.policy.ts`](../../../packages/task/src/server/domain/aggregates/task-plan-lifecycle.policy.ts) | TaskPlan 生命周期策略 |
| [`packages/task/src/server/domain/aggregates/task-plan-goal.policy.ts`](../../../packages/task/src/server/domain/aggregates/task-plan-goal.policy.ts) | Goal binding / contribution 策略 |
| [`packages/task/src/server/domain/services/task-occurrence-generation-service.ts`](../../../packages/task/src/server/domain/services/task-occurrence-generation-service.ts) | Occurrence 生成服务 |
| [`packages/task/src/server/application/use-cases/commands/create-task-plan.use-case.ts`](../../../packages/task/src/server/application/use-cases/commands/create-task-plan.use-case.ts) | 创建 TaskPlan |
| [`packages/task/src/server/application/use-cases/commands/complete-task-occurrence.use-case.ts`](../../../packages/task/src/server/application/use-cases/commands/complete-task-occurrence.use-case.ts) | 完成 TaskOccurrence；target 携带 optional Goal measurement intent |
| [`packages/task/src/server/application/use-cases/commands/abandon-task-plan.use-case.ts`](../../../packages/task/src/server/application/use-cases/commands/abandon-task-plan.use-case.ts) | canonical End Plan command；当前尚未清理 materialized future occurrence / Schedule projection |
| [`packages/task/src/server/application/use-cases/commands/pause-task-plan.use-case.ts`](../../../packages/task/src/server/application/use-cases/commands/pause-task-plan.use-case.ts) | Pause reference；已清理未来未完成 occurrence，可作为 Abandon closure 对照 |
| [`packages/task/src/server/domain/services/task-plan-outcome-evaluator.ts`](../../../packages/task/src/server/domain/services/task-plan-outcome-evaluator.ts) | 当前 completionPolicy-based outcome evaluator；target 收敛 canonical evaluator |
| [`packages/task/src/server/application/use-cases/commands/generate-task-occurrences.use-case.ts`](../../../packages/task/src/server/application/use-cases/commands/generate-task-occurrences.use-case.ts) | 生成 Occurrence |
| [`packages/task/src/server/infrastructure/task-goal-outbox.ts`](../../../packages/task/src/server/infrastructure/task-goal-outbox.ts) | Task→Goal durable settlement intent |
| [`packages/task/src/server/application/outbox/task-goal-outbox-dispatcher.ts`](../../../packages/task/src/server/application/outbox/task-goal-outbox-dispatcher.ts) | at-least-once Task→Goal dispatcher |
| [`packages/goal/src/server/application/event-handlers/task-goal-progress.handler.ts`](../../../packages/goal/src/server/application/event-handlers/task-goal-progress.handler.ts) | Goal-owned Task settlement consumer |
| [`packages/task/src/server/infrastructure/schedule-projection-source.ts`](../../../packages/task/src/server/infrastructure/schedule-projection-source.ts) | Task→Schedule projection event source；target 补 Abandon closure |
| [`packages/task/src/server/application/ports/task-goal-context-read.port.ts`](../../../packages/task/src/server/application/ports/task-goal-context-read.port.ts) | Task-owned Goal/KR context read port；供跨模块读取，不泄漏 repository |
| [`packages/task/src/server/infrastructure/adapters/prisma/prisma-task-binding-read-port.ts`](../../../packages/task/src/server/infrastructure/adapters/prisma/prisma-task-binding-read-port.ts) | Prisma Goal 删除检查 + Goal/KR context read adapter |
| [`packages/task/src/server/infrastructure/adapters/powersync/powersync-task-binding-read-port.ts`](../../../packages/task/src/server/infrastructure/adapters/powersync/powersync-task-binding-read-port.ts) | PowerSync Goal 删除检查 + Goal/KR context read adapter |
| [`packages/task/src/server/infrastructure/adapters/prisma/task-plan-prisma.repository.ts`](../../../packages/task/src/server/infrastructure/adapters/prisma/task-plan-prisma.repository.ts) | Prisma TaskPlan repository |
| [`packages/task/src/server/infrastructure/adapters/prisma/task-occurrence-prisma.repository.ts`](../../../packages/task/src/server/infrastructure/adapters/prisma/task-occurrence-prisma.repository.ts) | Prisma TaskOccurrence repository |
| [`packages/task/src/server/infrastructure/adapters/powersync/task-plan-powersync.repository.ts`](../../../packages/task/src/server/infrastructure/adapters/powersync/task-plan-powersync.repository.ts) | PowerSync TaskPlan repository |
| [`packages/task/src/server/infrastructure/adapters/powersync/task-occurrence-powersync.repository.ts`](../../../packages/task/src/server/infrastructure/adapters/powersync/task-occurrence-powersync.repository.ts) | PowerSync TaskOccurrence repository |

## Contracts 与时间/目标语义

| 文件 | 说明 |
| --- | --- |
| [`packages/contracts/src/modules/task/index.ts`](../../../packages/contracts/src/modules/task/index.ts) | Task contracts 入口 |
| [`packages/contracts/src/modules/task/aggregates/task-plan-server.ts`](../../../packages/contracts/src/modules/task/aggregates/task-plan-server.ts) | TaskPlan server DTO |
| [`packages/contracts/src/modules/task/aggregates/task-plan-client.ts`](../../../packages/contracts/src/modules/task/aggregates/task-plan-client.ts) | TaskPlan client DTO |
| [`packages/contracts/src/modules/task/aggregates/task-occurrence-server.ts`](../../../packages/contracts/src/modules/task/aggregates/task-occurrence-server.ts) | TaskOccurrence server DTO |
| [`packages/contracts/src/modules/task/aggregates/task-occurrence-client.ts`](../../../packages/contracts/src/modules/task/aggregates/task-occurrence-client.ts) | TaskOccurrence client DTO |
| [`packages/contracts/src/modules/task/api/task-plan.dto.ts`](../../../packages/contracts/src/modules/task/api/task-plan.dto.ts) | TaskPlan API schema |
| [`packages/contracts/src/modules/task/api/task-goal-context.dto.ts`](../../../packages/contracts/src/modules/task/api/task-goal-context.dto.ts) | ADR-069 Goal/KR Task context page + summary contract |
| [`packages/contracts/src/modules/task/api/task-occurrence.dto.ts`](../../../packages/contracts/src/modules/task/api/task-occurrence.dto.ts) | TaskOccurrence API schema |
| [`packages/contracts/src/modules/task/value-objects/task-plan-schedule.ts`](../../../packages/contracts/src/modules/task/value-objects/task-plan-schedule.ts) | OneTime / Recurring schedule algebra |
| [`packages/contracts/src/modules/task/value-objects/task-goal-binding.ts`](../../../packages/contracts/src/modules/task/value-objects/task-goal-binding.ts) | 当前 Goal-only link + optional KR + fixed contribution；target 迁移 discriminated progress rule |
| [`packages/contracts/src/modules/task/value-objects/task-plan-completion-policy.ts`](../../../packages/contracts/src/modules/task/value-objects/task-plan-completion-policy.ts) | 当前兼容字段；target 退休用户可配置 policy，并做 versioned migration |
| [`packages/contracts/src/modules/goal/api/goal-record.dto.ts`](../../../packages/contracts/src/modules/goal/api/goal-record.dto.ts) | GoalRecord user write contract；measurement-aware composer 需要保持 signed finite sample/delta |
| [`packages/contracts/src/modules/goal/entities/goal-record-server.ts`](../../../packages/contracts/src/modules/goal/entities/goal-record-server.ts) | GoalRecord source correlation；target 需要区分 provenance/authorship |
| [`packages/contracts/src/modules/task/value-objects/task-plan-status.ts`](../../../packages/contracts/src/modules/task/value-objects/task-plan-status.ts) | TaskPlan status |
| [`packages/contracts/src/modules/task/value-objects/task-occurrence-status.ts`](../../../packages/contracts/src/modules/task/value-objects/task-occurrence-status.ts) | TaskOccurrence status |
| [`packages/database/prisma/schema/task.prisma`](../../../packages/database/prisma/schema/task.prisma) | Task Prisma schema |

## 关键测试入口

| 文件 | 说明 |
| --- | --- |
| [`packages/task/src/server/domain/aggregates/__tests__/TaskPlan.test.ts`](../../../packages/task/src/server/domain/aggregates/__tests__/TaskPlan.test.ts) | TaskPlan 聚合测试 |
| [`packages/task/src/server/domain/aggregates/__tests__/TaskOccurrence.test.ts`](../../../packages/task/src/server/domain/aggregates/__tests__/TaskOccurrence.test.ts) | TaskOccurrence 聚合测试 |
| [`packages/task/src/server/application/use-cases/commands/__tests__/create-task-plan.test.ts`](../../../packages/task/src/server/application/use-cases/commands/__tests__/create-task-plan.test.ts) | 创建 TaskPlan 用例测试 |
| [`packages/task/src/server/application/use-cases/commands/__tests__/complete-task-occurrence.test.ts`](../../../packages/task/src/server/application/use-cases/commands/__tests__/complete-task-occurrence.test.ts) | 完成 Occurrence 用例测试 |
| [`packages/task/src/api/routes/task-plan.routes.spec.ts`](../../../packages/task/src/api/routes/task-plan.routes.spec.ts) | TaskPlan route contract |
| [`packages/task/src/api/routes/task-occurrence.routes.spec.ts`](../../../packages/task/src/api/routes/task-occurrence.routes.spec.ts) | TaskOccurrence route contract |
| [`packages/app-vue/src/modules/task/components/TaskPlanForm/TaskPlanForm.spec.ts`](../../../packages/app-vue/src/modules/task/components/TaskPlanForm/TaskPlanForm.spec.ts) | TaskPlan form behavior |

## 改动风险

- TaskPlan schedule 必须继续由 Product Time 的 `Ymd/Hm/Instant` 语义解释，不能回退到宿主 `Date` 时区。
- Goal link 允许仅关联 Goal；只有产生 KR Record 时才要求 KR。
- fixed automatic contribution 与 user-authored completion measurement 必须区分 provenance。
- TaskOccurrence 的 Missed / Skipped / Completed 与 Plan outcome 必须保持可追踪、可重算且幂等。
- `End plan` 必须走 Abandon，并清理未来 occurrence/reminder/Schedule projection；Archive 不能承担业务结束。
- Future browsing 由 Schedule owner 提供，Task 不恢复独立 Upcoming 日历。
- 当前 `completionPolicy` 是兼容 contract；target 行为由 canonical evaluator 决定，删除字段前必须 versioned migration。
- HTTP、IPC、Prisma、PowerSync 四条运行时路径必须保持 contract parity。
- Task 只通过 neutral schedule projection / handler registration 接入调度，不恢复中央领域 switch。
