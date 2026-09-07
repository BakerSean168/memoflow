---
tags:
  - product
  - module-index
  - task
description: 任务模块相关文件索引
created: 2026-06-02T00:00:00
updated: 2026-08-26T00:00:00
---

# 任务模块文件索引

本索引用于连接任务模块的业务说明和真实代码。它不是代码注释替代品；做优化前仍需以当前代码、配置和测试为准。

## 前端页面与路由

| 文件                                                                                                                                        | 说明                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| [`packages/app-vue/src/modules/task/router/index.ts`](../../../packages/app-vue/src/modules/task/router/index.ts)                           | Vue 任务模块路由，定义列表和详情入口 |
| [`packages/app-vue/src/modules/task/views/TaskManagementView.vue`](../../../packages/app-vue/src/modules/task/views/TaskManagementView.vue) | 任务管理主页面，含搜索、任务计划和执行入口       |
| [`packages/app-vue/src/modules/task/views/TaskDetailView.vue`](../../../packages/app-vue/src/modules/task/views/TaskDetailView.vue)         | 任务模板详情页                                 |

## 前端状态、组合函数与组件

| 文件                                                                                                                                                                                        | 说明                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| [`packages/app-vue/src/modules/task/stores/task-store.ts`](../../../packages/app-vue/src/modules/task/stores/task-store.ts)                                                                 | 任务模块 Pinia store                   |
| [`packages/app-vue/src/modules/task/composables/useTask.ts`](../../../packages/app-vue/src/modules/task/composables/useTask.ts)                                                             | 任务编排组合函数，组合任务计划与实例 |
| [`packages/app-vue/src/modules/task/composables/useTaskTemplateListQuery.ts`](../../../packages/app-vue/src/modules/task/composables/useTaskTemplateListQuery.ts)                           | 任务模板列表查询组合函数               |
| [`packages/app-vue/src/modules/task/composables/useTaskTemplateDetailQuery.ts`](../../../packages/app-vue/src/modules/task/composables/useTaskTemplateDetailQuery.ts)                       | 任务模板详情查询组合函数               |
| [`packages/app-vue/src/modules/task/composables/useTaskTemplateMutations.ts`](../../../packages/app-vue/src/modules/task/composables/useTaskTemplateMutations.ts)                           | 任务模板 CRUD 组合函数                 |
| [`packages/app-vue/src/modules/task/composables/useTaskInstances.ts`](../../../packages/app-vue/src/modules/task/composables/useTaskInstances.ts)                                           | 任务实例操作组合函数                   |
| [`packages/app-vue/src/modules/task/composables/useTaskTemplateForm.ts`](../../../packages/app-vue/src/modules/task/composables/useTaskTemplateForm.ts)                                     | 模板表单验证聚合                       |
| [`packages/app-vue/src/modules/task/composables/useTaskGoalBindingOptions.ts`](../../../packages/app-vue/src/modules/task/composables/useTaskGoalBindingOptions.ts)                         | 目标绑定选项加载                       |
| [`packages/app-vue/src/modules/task/views/TaskManagementView.vue`](../../../packages/app-vue/src/modules/task/views/TaskManagementView.vue)                                                 | 模板列表管理组件                       |
| [`packages/app-vue/src/modules/task/components/TaskTemplateForm/TaskTemplateForm.vue`](../../../packages/app-vue/src/modules/task/components/TaskTemplateForm/TaskTemplateForm.vue)         | 多分区模板编辑表单                     |
| [`packages/app-vue/src/modules/task/components/dialogs/TaskTemplateDialog.vue`](../../../packages/app-vue/src/modules/task/components/dialogs/TaskTemplateDialog.vue)                       | 模板创建/编辑弹窗                      |
| [`packages/app-vue/src/modules/task/components/widgets/TodayTasksWidget.vue`](../../../packages/app-vue/src/modules/task/components/widgets/TodayTasksWidget.vue)                           | Dashboard 今日任务小组件               |
| [`packages/app-vue/src/modules/task/components/widgets/DailyTodoWidget.vue`](../../../packages/app-vue/src/modules/task/components/widgets/DailyTodoWidget.vue)                             | Dashboard 每日待办小组件               |

## 移动端入口

| 文件                                                                                                                  | 说明                      |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| [`apps/mobile/src/app/tasks/index.tsx`](../../../apps/mobile/src/app/tasks/index.tsx)                                 | 移动端任务列表入口        |
| [`apps/mobile/src/app/tasks/editor.tsx`](../../../apps/mobile/src/app/tasks/editor.tsx)                               | 移动端任务编辑入口        |
| [`apps/mobile/src/app/tasks/[id].tsx`](../../../apps/mobile/src/app/tasks/[id].tsx)                                   | 移动端任务详情入口        |
| [`packages/app-react/src/screens/TasksScreen.tsx`](../../../packages/app-react/src/screens/TasksScreen.tsx)           | React Native 任务列表屏幕 |
| [`packages/app-react/src/screens/TaskEditorScreen.tsx`](../../../packages/app-react/src/screens/TaskEditorScreen.tsx) | React Native 任务编辑屏幕 |
| [`packages/app-react/src/screens/TaskDetailScreen.tsx`](../../../packages/app-react/src/screens/TaskDetailScreen.tsx) | React Native 任务详情屏幕 |

## API、控制器与适配器

| 文件                                                                                                                                                                                      | 说明                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| [`packages/task/src/api/routes/task-template.routes.ts`](../../../packages/task/src/api/routes/task-template.routes.ts)                                                                   | 任务模板 HTTP routes（14 个端点）      |
| [`packages/task/src/api/routes/task-instance.routes.ts`](../../../packages/task/src/api/routes/task-instance.routes.ts)                                                                   | 任务实例 HTTP routes（7 个端点）       |
| [`packages/task/src/server/transport/task.transport-handlers.ts`](../../../packages/task/src/server/transport/task.transport-handlers.ts)                                                 | 传输层处理器，映射模块 facade 到控制器 |
| [`packages/task/src/server/transport/task-template.controller.ts`](../../../packages/task/src/server/transport/task-template.controller.ts)                                               | 任务模板控制器                         |
| [`packages/task/src/server/transport/task-instance.controller.ts`](../../../packages/task/src/server/transport/task-instance.controller.ts)                                               | 任务实例控制器                         |
| [`packages/task/src/infrastructure-client/adapters/http/task-template-http.adapter.ts`](../../../packages/task/src/infrastructure-client/adapters/http/task-template-http.adapter.ts)     | 客户端 HTTP 模板适配器                 |
| [`packages/task/src/infrastructure-client/adapters/http/task-instance-http.adapter.ts`](../../../packages/task/src/infrastructure-client/adapters/http/task-instance-http.adapter.ts)     | 客户端 HTTP 实例适配器                 |
| [`packages/task/src/infrastructure-client/adapters/ipc/task-template-ipc.adapter.ts`](../../../packages/task/src/infrastructure-client/adapters/ipc/task-template-ipc.adapter.ts)         | 客户端 IPC 模板适配器                  |
| [`packages/task/src/infrastructure-client/adapters/ipc/task-instance-ipc.adapter.ts`](../../../packages/task/src/infrastructure-client/adapters/ipc/task-instance-ipc.adapter.ts)         | 客户端 IPC 实例适配器                  |

## 领域、用例与仓储

| 文件                                                                                                                                                                                                    | 说明                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| [`packages/task/src/server/domain/aggregates/task-template.ts`](../../../packages/task/src/server/domain/aggregates/task-template.ts)                                                                   | TaskTemplate 聚合根   |
| [`packages/task/src/server/domain/aggregates/task-instance.ts`](../../../packages/task/src/server/domain/aggregates/task-instance.ts)                                                                   | TaskInstance 聚合根   |
| [`packages/task/src/server/domain/aggregates/task-template-lifecycle.policy.ts`](../../../packages/task/src/server/domain/aggregates/task-template-lifecycle.policy.ts)                                 | 模板生命周期策略      |
| [`packages/task/src/server/domain/aggregates/task-template-goal.policy.ts`](../../../packages/task/src/server/domain/aggregates/task-template-goal.policy.ts)                                           | 目标绑定策略          |
| [`packages/task/src/server/domain/aggregates/instance-generation.policy.ts`](../../../packages/task/src/server/domain/aggregates/instance-generation.policy.ts)                                         | 实例生成策略          |
| [`packages/task/src/server/application/use-cases/commands/create-task-template.use-case.ts`](../../../packages/task/src/server/application/use-cases/commands/create-task-template.use-case.ts)         | 创建模板用例          |
| [`packages/task/src/server/application/use-cases/commands/complete-task-instance.use-case.ts`](../../../packages/task/src/server/application/use-cases/commands/complete-task-instance.use-case.ts)     | 完成实例用例          |
| [`packages/task/src/server/application/use-cases/commands/bind-task-to-goal.use-case.ts`](../../../packages/task/src/server/application/use-cases/commands/bind-task-to-goal.use-case.ts)               | 绑定目标用例          |
| [`packages/task/src/server/application/use-cases/queries/get-task-dashboard.use-case.ts`](../../../packages/task/src/server/application/use-cases/queries/get-task-dashboard.use-case.ts)               | 任务 Dashboard 查询   |
| [`packages/task/src/server/infrastructure/task.module.ts`](../../../packages/task/src/server/infrastructure/task.module.ts)                                                                             | 服务端任务模块组合根  |
| [`packages/task/src/server/infrastructure/adapters/prisma/task-template-prisma.repository.ts`](../../../packages/task/src/server/infrastructure/adapters/prisma/task-template-prisma.repository.ts)     | Prisma 模板仓储       |
| [`packages/task/src/server/infrastructure/adapters/prisma/task-instance-prisma.repository.ts`](../../../packages/task/src/server/infrastructure/adapters/prisma/task-instance-prisma.repository.ts)     | Prisma 实例仓储       |

## Contracts 与数据结构

| 文件                                                                                                                                                              | 说明                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| [`packages/contracts/src/modules/task/index.ts`](../../../packages/contracts/src/modules/task/index.ts)                                                           | 任务模块 contracts 入口     |
| [`packages/contracts/src/modules/task/aggregates/task-template-server.ts`](../../../packages/contracts/src/modules/task/aggregates/task-template-server.ts)       | TaskTemplate 服务端 DTO     |
| [`packages/contracts/src/modules/task/aggregates/task-template-client.ts`](../../../packages/contracts/src/modules/task/aggregates/task-template-client.ts)       | TaskTemplate 客户端 DTO     |
| [`packages/contracts/src/modules/task/aggregates/task-instance-server.ts`](../../../packages/contracts/src/modules/task/aggregates/task-instance-server.ts)       | TaskInstance 服务端 DTO     |
| [`packages/contracts/src/modules/task/aggregates/task-instance-client.ts`](../../../packages/contracts/src/modules/task/aggregates/task-instance-client.ts)       | TaskInstance 客户端 DTO     |
| [`packages/contracts/src/modules/task/api/task-template.dto.ts`](../../../packages/contracts/src/modules/task/api/task-template.dto.ts)                           | 模板 API DTO（Zod schemas） |
| [`packages/contracts/src/modules/task/api/task-instance.dto.ts`](../../../packages/contracts/src/modules/task/api/task-instance.dto.ts)                           | 实例 API DTO                |
| [`packages/contracts/src/modules/task/protocol/task-rpc-map.ts`](../../../packages/contracts/src/modules/task/protocol/task-rpc-map.ts)                           | 任务模块 RPC map            |
| [`packages/contracts/src/modules/task/protocol/task-event-map.ts`](../../../packages/contracts/src/modules/task/protocol/task-event-map.ts)                       | 任务模块事件 map            |
| [`packages/contracts/src/modules/task/value-objects/task-template-status.ts`](../../../packages/contracts/src/modules/task/value-objects/task-template-status.ts) | 模板状态枚举                |
| [`packages/contracts/src/modules/task/value-objects/task-instance-status.ts`](../../../packages/contracts/src/modules/task/value-objects/task-instance-status.ts) | 实例状态枚举                |
| [`packages/contracts/src/modules/task/value-objects/task-goal-binding.ts`](../../../packages/contracts/src/modules/task/value-objects/task-goal-binding.ts)       | 目标绑定值对象              |
| [`packages/database/prisma/schema/task.prisma`](../../../packages/database/prisma/schema/task.prisma)                                                             | 任务模块 Prisma schema      |

## 跨模块或 AI 相关入口

| 文件                                                                                                                                                          | 说明                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [`packages/app-vue/src/modules/task/components/TaskAIGenerationDialog.vue`](../../../packages/app-vue/src/modules/task/components/TaskAIGenerationDialog.vue) | AI 任务生成对话框                                    |
| [`packages/task/src/server/infrastructure/schedule-projection-source.ts`](../../../packages/task/src/server/infrastructure/schedule-projection-source.ts)       | Task owner → neutral `ScheduledIntent` projection source |
| [`packages/task/src/server/infrastructure/task-reminder-fire.handler.ts`](../../../packages/task/src/server/infrastructure/task-reminder-fire.handler.ts)       | `task.reminder.fire` scheduled-handler；不依赖 Scheduler aggregate |

## 测试入口

| 文件                                                                                                                                                                                                                                | 说明                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| [`packages/task/src/server/domain/aggregates/__tests__/TaskTemplate.test.ts`](../../../packages/task/src/server/domain/aggregates/__tests__/TaskTemplate.test.ts)                                                                   | TaskTemplate 聚合测试   |
| [`packages/task/src/server/domain/aggregates/__tests__/TaskInstance.test.ts`](../../../packages/task/src/server/domain/aggregates/__tests__/TaskInstance.test.ts)                                                                   | TaskInstance 聚合测试   |
| [`packages/task/src/server/application/use-cases/commands/__tests__/create-task-template.test.ts`](../../../packages/task/src/server/application/use-cases/commands/__tests__/create-task-template.test.ts)                         | 创建模板用例测试        |
| [`packages/task/src/server/application/use-cases/commands/__tests__/complete-task-instance.test.ts`](../../../packages/task/src/server/application/use-cases/commands/__tests__/complete-task-instance.test.ts)                     | 完成实例用例测试        |
| [`packages/task/src/server/application/use-cases/queries/__tests__/get-task-dashboard.test.ts`](../../../packages/task/src/server/application/use-cases/queries/__tests__/get-task-dashboard.test.ts)                               | Dashboard 查询测试      |
| [`packages/task/src/api/routes/task-template.routes.spec.ts`](../../../packages/task/src/api/routes/task-template.routes.spec.ts)                                                                                                   | 模板 routes 测试        |
| [`packages/task/src/api/routes/task-instance.routes.spec.ts`](../../../packages/task/src/api/routes/task-instance.routes.spec.ts)                                                                                                   | 实例 routes 测试        |
| [`packages/app-vue/src/modules/task/stores/taskStore.spec.ts`](../../../packages/app-vue/src/modules/task/stores/taskStore.spec.ts)                                                                                                 | 任务 store 测试         |
| [`apps/web/e2e/task/task-template-crud.spec.ts`](../../../apps/web/e2e/task/task-template-crud.spec.ts)                                                                                                                             | Web 模板 CRUD e2e       |

## 需要重点关注的改动风险

- TaskTemplate 状态流转和实例生成策略。
- 目标绑定变更对目标进度计算的影响。
- HTTP、IPC、Prisma、PowerSync 多运行时适配器的一致性。
- Schedule 模块通过 `SourceModule.Task` 消费任务事件的跨模块依赖。
- Dashboard 对任务数据的读模型依赖。
