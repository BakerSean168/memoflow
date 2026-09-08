---
tags: [adr, dashboard, home, read-model, retirement]
description: 退休 Dashboard bounded context，将首页收敛为 owner-read-model UI composition
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-09T00:31:00+08:00
---

# ADR-108: Dashboard Retirement and Home Composition

**状态：** 已采纳，待实施  
**日期：** 2026-09-09

## Decision

### 1. Dashboard product module retires

`/dashboard` 已经没有独立页面，因此不再维护 `Dashboard` bounded context、万能 DTO 或 widget-config product model。

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

当前 Home/Goal capsule 为了 `goalProgress` 拉完整 DashboardData。迁移为 Goal-owned summary/read port，复用 Goal vNext lifecycle/target semantics。

### 4. AI analytics stops consuming DashboardData

`IAnalyticsReadPort` 的 host adapter直接组合 Goal/Task/Knowledge/Activity 等明确 read ports。禁止再把 DashboardData cast 成 `Record<string, unknown>` 作为 AI context。

### 5. Delete dead Dashboard UI/config

无 production consumer 的 StatsStrip/TrendPanel/ActivityTimeline 可在 characterization 后删除。`DashboardConfig` 无当前产品 consumer，直接进入 retirement migration。

### 6. ActivityLedger is a separate decision surface

ActivityLedger 不自动等于 Dashboard。第一实施批次统计真实 consumer：

- 若 Home/AI确实需要，重命名/迁移为独立 Activity feed projection；
- 若只有退休 Dashboard 间接读取，则删除 recorder/table。

不得为保留一个旧技术资产而创造新 product module。

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

保留 `/dashboard -> /` compatibility redirect 可作为短期 route shim，随后删除测试/文案。
