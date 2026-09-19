---
tags: [adr, dashboard, home, read-model, retirement]
description: 退休 Dashboard bounded context，将首页收敛为 owner-read-model UI composition
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-19T00:00:00+00:00
---

# ADR-108: Dashboard Retirement and Home Composition

**状态：** 已采纳，实施完成（HOME-1804/HOME-1805 destructive cutover 已闭合）
**日期：** 2026-09-09

## Decision

### 1. Dashboard product module retires

`/dashboard` 没有独立页面或兼容入口，因此不再维护 `Dashboard` bounded context、万能 DTO 或 widget-config product model。

### 2. Home is a composition surface, not a domain

`TodayOverviewPanel` 保留，但只组合 owner module read models：

```text
Home UI
├── Task Today projection
├── Routine upcoming projection
├── Goal progress projection
└── other owner widget only if product needs it
```

Home 不拥有数据，不创建 `HomeAggregate`，也不创建新的跨域 God DTO。

### 3. Goal progress returns to Goal owner

HOME-1805 已完成迁移：Home/Goal capsule 通过 Goal-owned summary/read port 读取进度，复用 Goal vNext lifecycle/target semantics，不再读取 DashboardData。

### 4. AI analytics stops consuming DashboardData

`IAnalyticsReadPort` 的 host adapter 直接组合 Goal/Task/Knowledge/owner-derived activity 等明确 read ports。禁止再把 DashboardData cast 成 `Record<string, unknown>` 作为 AI context；保留的 Task dashboard read model 只属于 Task owner。

### 5. Delete dead Dashboard UI/config

无 production consumer 的 StatsStrip/TrendPanel/ActivityTimeline 已删除。`DashboardConfig` 无当前产品 consumer，已从 Prisma、PowerSync 和生成客户端中删除。

### 6. HOME-1804 resolution: no durable ActivityFeed authority

HOME-1804 的当前产品证据表明：Desktop 从未需要独立 durable activity table，API AI 所需的 recent activity 也可以从 Goal/Task/Schedule owner facts 生成相同 bounded projection。旧 ledger consumer 已清零；当前 recent activity 只来自 owner-derived bounded projections。

因此决定直接删除 recorder/table，并让 API 与 Desktop 都走 owner-derived recent activity。**不创建 `ActivityFeed` bounded context、通用 analytics domain 或 event-sourcing authority。**

## Final deletion set

在消费者迁完后删除：

```text
@memoflow/dashboard
@memoflow/contracts/dashboard
GET /dashboard/stats
dashboard:get-stats
Dashboard Vue module
DashboardConfig
```

不保留 `/dashboard` compatibility redirect、旧客户端入口或 legacy data migration；新鲜 schema/reset/bootstrap 直接从 canonical owner models 开始。
