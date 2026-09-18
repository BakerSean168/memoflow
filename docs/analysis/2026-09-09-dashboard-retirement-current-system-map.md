---
tags: [analysis, dashboard, home, read-model, retirement]
description: Dashboard 页面退役后残余 read-model/package/route/config 与 Home composition 证据地图
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-18T00:00:00Z
---

# Dashboard Retirement Current-System Map

## 1. Executive finding

独立 Dashboard 页面已经退休：Web E2E 明确把 `/dashboard` 当作重定向到 `/` 的旧入口，当前 Vue router 没有 Dashboard page。用户当前看到的是 shell 的 `TodayOverviewPanel`。

因此 **Dashboard 不再值得作为独立 product/domain module**。但整个 package 还不能立即删除，因为它仍承担历史跨模块聚合读模型，消费者包括 API/Desktop dashboard endpoint；Home/Goal 与 AI analytics 已完成 owner-read 脱钩。

## 2. Current live consumers

- API `GET /dashboard/stats`；
- Desktop `dashboard:get-stats`；
- task completion E2E 等仍触发 dashboard stats reconciliation。

AI analytics now composes Goal, Task, Planner, Notification and activity reads
directly. API activity still has a narrow transitional ActivityLedger reader;
Desktop derives the same bounded recent-activity projection from local owner
facts. This is an explicit HOME-1804 input, not a Dashboard replacement.

`DashboardStatsStrip`, `DashboardTrendPanel`, `DashboardActivityTimeline` 当前没有 production page consumer。

## 3. Current DashboardData drift

Dashboard contracts/projector仍依赖：

- old Goal `Active` / `dueDate`；
- legacy ReminderTemplate `effectiveEnabled/nextTriggerAt`；
- Schedule `priority/hasConflict`；
- host-local `Date.now()` / start-of-day logic；
- generic trend/activity fields。

这些与 Goal/Routine/Planner/Time vNext 直接冲突。

## 4. DashboardConfig is dead product state

`DashboardConfig.widgetConfig` 目前只存在于 Prisma、PowerSync schema/table mapping；没有找到当前 UI/application consumer。当前 Home layout 也不是 configurable widget dashboard。

它是高置信 retirement candidate。

## 5. ActivityLedger

ActivityLedger recorder 是从旧 Dashboard R6 演化出的 durable cross-domain activity feed。HOME-1803 后，API 的 Dashboard read path 与 AI 的 narrow activity capability 都读取它；Desktop AI 没有本地 ledger，而是从 Goal/Task/Schedule owner facts 派生相同窗口的 bounded projection。

它不应该因为 Dashboard package 退役而自动删除，但也不应该继续由 Dashboard 命名空间拥有。实施时需要独立决定：

- 若 AI/其他当前产品路径确有“近期活动”用户价值，迁为 `ActivityFeedReadPort` / activity projection；
- 若 characterization 证明无真实用户消费，则删除 recorder/table。

## 6. Target

```text
Home / Today Overview (Vue composition surface)
├── Task-owned DailyTodo read model
├── Routine-owned Upcoming read model
├── Goal-owned GoalProgress summary
└── Notification/etc only when a real widget needs them
```

不创建一个新的万能 `OverviewData` God DTO。

AI analytics 使用 owner-specific analytics/read ports；不再通过 DashboardData 获取所有上下文。

最终删除：

- `@memoflow/dashboard`；
- `@memoflow/contracts/dashboard`；
- `/dashboard/stats`；
- `dashboard:get-stats`；
- dead Dashboard Vue module/components；
- `DashboardConfig` persistence。
