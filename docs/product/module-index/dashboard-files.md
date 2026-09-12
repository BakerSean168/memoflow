---
tags:
  - product
  - module-index
  - dashboard
description: Dashboard 模块相关文件索引
created: 2026-06-02T00:00:00
updated: 2026-07-22T00:00:00
---

# Dashboard 模块文件索引

本索引用于连接 Dashboard 模块的业务说明和真实代码。它不是代码注释替代品；做优化前仍需以当前代码、配置和测试为准。

## 前端页面与路由

| 文件 | 说明 |
| --- | --- |
| [`packages/app-vue/src/modules/dashboard/composables/useDashboard.ts`](../../../packages/app-vue/src/modules/dashboard/composables/useDashboard.ts) | Dashboard read-model composable |

## 前端状态、组合函数与组件

| 文件 | 说明 |
| --- | --- |
| [`packages/app-vue/src/modules/dashboard/composables/useDashboard.ts`](../../../packages/app-vue/src/modules/dashboard/composables/useDashboard.ts) | Dashboard 数据获取组合函数 |
| [`packages/app-vue/src/modules/dashboard/types.ts`](../../../packages/app-vue/src/modules/dashboard/types.ts) | Dashboard 类型定义和端口接口 |
| [`packages/app-vue/src/modules/dashboard/adapters/dashboard-http.adapter.ts`](../../../packages/app-vue/src/modules/dashboard/adapters/dashboard-http.adapter.ts) | 客户端 HTTP 适配器 |
| [`packages/app-vue/src/modules/dashboard/adapters/dashboard-ipc.adapter.ts`](../../../packages/app-vue/src/modules/dashboard/adapters/dashboard-ipc.adapter.ts) | 客户端 IPC 适配器 |

## 移动端入口

当前未发现独立的移动端 Dashboard 入口。

## API、控制器与适配器

| 文件 | 说明 |
| --- | --- |
| [`apps/api/src/modules/dashboard/module.ts`](../../../apps/api/src/modules/dashboard/module.ts) | API 侧 Dashboard 路由模块 |
| [`apps/api/src/modules/dashboard/dashboard-read-service.ts`](../../../apps/api/src/modules/dashboard/dashboard-read-service.ts) | API 侧 Dashboard 读服务（Prisma 仓储） |
| [`apps/desktop/src/main/ipc/dashboard-handler.ts`](../../../apps/desktop/src/main/ipc/dashboard-handler.ts) | Desktop 侧 IPC 处理器 |
| [`apps/desktop/src/main/services/dashboard-read-service.ts`](../../../apps/desktop/src/main/services/dashboard-read-service.ts) | Desktop 侧 Dashboard 读服务（PowerSync 仓储） |

## 领域与投影逻辑

| 文件 | 说明 |
| --- | --- |
| [`packages/dashboard/src/domain/types.ts`](../../../packages/dashboard/src/domain/types.ts) | DashboardReadSource 端口和记录类型定义 |
| [`packages/dashboard/src/domain/projection.ts`](../../../packages/dashboard/src/domain/projection.ts) | 核心投影函数 getDashboardData（纯函数） |

## Contracts 与数据结构

| 文件 | 说明 |
| --- | --- |
| [`packages/contracts/src/modules/dashboard/api/dashboard-data.dto.ts`](../../../packages/contracts/src/modules/dashboard/api/dashboard-data.dto.ts) | Dashboard 数据 DTO（Zod schemas） |
| [`packages/contracts/src/electron/ipc-channels.ts`](../../../packages/contracts/src/electron/ipc-channels.ts) | Dashboard IPC 通道定义 |

## 跨模块嵌入组件

| 文件 | 说明 |
| --- | --- |
| [`packages/app-vue/src/modules/task/components/widgets/DailyTodoWidget.vue`](../../../packages/app-vue/src/modules/task/components/widgets/DailyTodoWidget.vue) | 嵌入的今日待办小组件 |
| [`packages/app-vue/src/modules/task/components/widgets/TodayTasksWidget.vue`](../../../packages/app-vue/src/modules/task/components/widgets/TodayTasksWidget.vue) | 嵌入的今日任务小组件 |
| [`packages/app-vue/src/modules/reminder/components/widgets/UpcomingRemindersWidget.vue`](../../../packages/app-vue/src/modules/reminder/components/widgets/UpcomingRemindersWidget.vue) | 嵌入的即将提醒小组件 |

## 测试入口

| 文件 | 说明 |
| --- | --- |
| [`packages/dashboard/src/__tests__/dashboard-projection.test.ts`](../../../packages/dashboard/src/__tests__/dashboard-projection.test.ts) | 投影函数单元测试 |
| [`apps/web/e2e/dashboard/dashboard-overview.spec.ts`](../../../apps/web/e2e/dashboard/dashboard-overview.spec.ts) | Web Dashboard 概览 e2e |
| [`apps/web/e2e/performance/dashboard-performance.spec.ts`](../../../apps/web/e2e/performance/dashboard-performance.spec.ts) | Web Dashboard 性能 e2e |

## 需要重点关注的改动风险

- 跨模块读模型依赖：上游模块（goal、task、schedule、reminder、notification）数据结构变更直接影响 Dashboard。
- 投影函数的性能：聚合 5 个模块的数据在大数据量下可能较慢。
- API 和 Desktop 两侧的 DashboardReadSource 实现需要保持一致。
- 嵌入小组件的兼容性：依赖其他模块的组件，需要确保接口稳定。
- DashboardConfig 持久化与投影数据的分离。
