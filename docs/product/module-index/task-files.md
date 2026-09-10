---
tags:
  - product
  - module-index
  - task
description: Task vNext（Plan / Occurrence）模块相关文件索引
created: 2026-06-02T00:00:00
updated: 2026-09-10T17:45:00+09:00
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
| [`packages/app-vue/src/modules/task/components/TaskOccurrenceCard.vue`](../../../packages/app-vue/src/modules/task/components/TaskOccurrenceCard.vue) | TaskOccurrence 展示卡片 |

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
| [`packages/task/src/server/application/use-cases/commands/complete-task-occurrence.use-case.ts`](../../../packages/task/src/server/application/use-cases/commands/complete-task-occurrence.use-case.ts) | 完成 TaskOccurrence |
| [`packages/task/src/server/application/use-cases/commands/generate-task-occurrences.use-case.ts`](../../../packages/task/src/server/application/use-cases/commands/generate-task-occurrences.use-case.ts) | 生成 Occurrence |
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
| [`packages/contracts/src/modules/task/api/task-occurrence.dto.ts`](../../../packages/contracts/src/modules/task/api/task-occurrence.dto.ts) | TaskOccurrence API schema |
| [`packages/contracts/src/modules/task/value-objects/task-plan-schedule.ts`](../../../packages/contracts/src/modules/task/value-objects/task-plan-schedule.ts) | OneTime / Recurring schedule algebra |
| [`packages/contracts/src/modules/task/value-objects/task-goal-binding.ts`](../../../packages/contracts/src/modules/task/value-objects/task-goal-binding.ts) | Goal-only link + optional KR + KR-scoped contribution |
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
- Goal link 允许仅关联 Goal；只有 contribution 才要求 KR。
- TaskOccurrence 的 Missed / Skipped / Completed 与 Plan outcome 必须保持可追踪、可重算且幂等。
- HTTP、IPC、Prisma、PowerSync 四条运行时路径必须保持 contract parity。
- Task 只通过 neutral schedule projection / handler registration 接入调度，不恢复中央领域 switch。
