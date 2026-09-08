---
tags:
  - product
  - module
  - dashboard
description: Dashboard 模块当前功能资产说明
created: 2026-06-02T00:00:00
updated: 2026-06-02T00:00:00
---

# Dashboard 模块说明

> **2026-09-09 retirement notice:** 独立 `/dashboard` 页面已经退休。ADR-108 决定最终删除 Dashboard bounded context/package/contracts/API/IPC；当前 package 仅是 Home/AI 迁移中的历史聚合读模型，不能把下文旧页面描述当作目标态。

## 1. 功能定位

Dashboard 模块用于汇总用户当前状态和关键行动入口。它是一个纯读模型（read-model），不承载写业务数据职责，通过聚合目标、任务、日程、提醒和通知五个模块的数据，为用户提供统一的状态概览和快速操作入口。

## 2. 当前功能说明

- 统计卡片：展示活跃任务数、今日完成数、活跃目标数、即将提醒数、未读通知数、日程冲突数六项关键指标。
- 7 天趋势图：展示过去 7 天的任务完成趋势（折线图 + 柱状图）。
- 活动时间线：展示最近 14 天的活动记录，最多 10 条。
- 目标进度：展示按优先级和更新时间排序的前 5 个活跃目标的完成百分比。
- 今日待办小组件：嵌入任务模块的 DailyTodoWidget，展示今日任务和进度条。
- 即将提醒小组件：嵌入提醒模块的 UpcomingRemindersWidget，展示即将到来的提醒。
- 快速操作栏：提供常用操作的快捷入口。
- Widget 配置持久化：DashboardConfig Prisma 模型支持小组件布局配置的持久化存储。
- 主题感知：图表组件支持主题切换，通过 MutationObserver 监听主题变化。

## 3. 用户路径

- Dashboard 查看路径：用户登录后进入 Dashboard 页面，查看统计卡片、趋势图、活动时间线、目标进度和嵌入小组件，点击具体项目跳转到对应模块。
- 配置路径：用户通过设置面板调整小组件的可见性和大小，配置自动保存。

## 4. 业务规则

- Dashboard 是纯读模型，没有自己的领域聚合和写操作。
- DashboardReadSource 端口定义了 6 个数据获取方法：listGoals、listTaskTemplates、listTaskInstances、listSchedules、listUpcomingReminders、countUnreadNotifications。
- 投影函数 getDashboardData 是纯函数，接收 identityId 和 source 端口，返回 DashboardData DTO。
- 活动时间线窗口为 14 天，最多展示 10 条记录。
- 目标进度最多展示按优先级降序、更新时间倒序排序的 5 个活跃目标，进度值会被 clamp 到 0-100。
- 趋势图展示过去 7 天的数据。
- API 侧通过 Prisma 仓储实现 DashboardReadSource，Desktop 侧通过 PowerSync 仓储实现。
- 前端通过 HTTP 或 IPC 适配器访问 Dashboard 数据。

## 5. 相关文件索引

详细文件清单见 [Dashboard 模块文件索引](../module-index/dashboard-files.md)。

## 6. 当前问题

- Dashboard 依赖五个业务模块的数据，任何上游模块的数据结构变更都可能影响 Dashboard 展示。
- Dashboard 的投影逻辑较复杂（294 行），需要确认性能在大数据量下的表现。
- 当前没有移动端 Dashboard 实现。
- Widget 配置持久化模型（DashboardConfig）与投影数据是分离的，需要确认用户体验。
- Dashboard 指标和业务模块真实状态不一致的风险：投影是快照，不是实时流。

## 7. 优化机会

- 为 Dashboard 提供更丰富的配置能力，让用户自定义展示哪些指标和小组件。
- 考虑移动端 Dashboard 的实现。
- 优化投影函数的性能，考虑缓存或增量更新策略。
- 为 Dashboard 提供更丰富的跨模块洞察，如目标-任务-日程的联动分析。
- 考虑 Dashboard 的实时更新能力（当前需要手动刷新）。

## 8. 风险点

- 跨模块读模型依赖不清导致展示不稳定：上游模块数据结构变更会直接影响 Dashboard。
- Dashboard 指标和业务模块真实状态不一致：投影是快照，可能存在延迟。
- Widget 注册和数据来源之间的边界：嵌入小组件依赖其他模块的组件，需要确保兼容性。
- 投影函数的性能：在数据量大时，聚合 5 个模块的数据可能较慢。
- API 和 Desktop 两侧的 DashboardReadSource 实现需要保持一致。

## 9. 后续待确认

- Dashboard 是否需要支持实时更新（WebSocket/SSE）。
- Widget 配置是否需要更丰富的自定义能力（布局、大小、顺序）。
- 移动端是否需要 Dashboard 实现。
- Dashboard 是否需要支持更多跨模块指标（如目标-任务联动分析）。
- 投影函数的性能优化策略（缓存、增量更新）。

## 10. 相关资料

- [目标模块说明](./goal.md)
- [任务模块说明](./task.md)
- [日程模块说明](./schedule.md)
- [提醒模块说明](./reminder.md)
- [通知模块说明](./notification.md)
- [Dashboard 模块文件索引](../module-index/dashboard-files.md)
