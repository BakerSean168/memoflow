---
tags: [analysis, dashboard, home, read-model, retirement]
description: Dashboard destructive retirement evidence and replacement ownership map
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-18T00:00:00+00:00
---

# Dashboard Retirement Current-System Map

## Decision

The standalone cross-domain Dashboard bounded context is retired and deleted by
HOME-1805. There is no compatibility `/dashboard` route, route redirect, HTTP
stats endpoint, Electron channel, DashboardConfig persistence, or replacement
package under another name.

## Canonical consumers

- Home composes Task Today, Routine upcoming, and Goal-owned progress reads.
- AI analytics composes explicit Goal, Task, Planner, Notification, Knowledge,
  and owner-derived recent-activity reads.
- The task-specific analytics read used by AI remains owned by Task; it is not a
  replacement cross-domain Dashboard model.

## Destructive cutover

HOME-1804 removed the durable cross-domain activity ledger. HOME-1805 removes
the remaining Dashboard package, contracts, transports, Vue remnants, config,
Prisma model, PowerSync mapping/query, and compatibility test inventory. ADR-111
requires fresh schema generation and reset/bootstrap evidence; no legacy row
migration or compatibility DTO is retained.
