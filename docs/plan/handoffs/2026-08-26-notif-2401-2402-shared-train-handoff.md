---
tags:
  - plan
  - handoff
  - core-vnext
  - notification
  - shared-train
  - composition-train
  - ui-train
description: NOTIF-2401/2402 cross-owner handoff after Notification Fact / DeliveryPlan and workflow preference cutover.
created: 2026-08-26T00:46:00+08:00
updated: 2026-08-26T00:46:00+08:00
---

# Core vNext Notification Fact — Shared Train Handoff

> Historical execution truth is archived at `docs/plan/archive/2026-08-25-core-vnext-orchestration.md`; this handoff is not an active execution queue.
> This file is a handoff only. It does not create a second active plan.

## Lane / base

- Worker lane: Notification Fact Wave 2 (`NOTIF-2401`, `NOTIF-2402`)
- Branch: `core-vnext/notification-fact`
- Base revision: `9982e1918447e8710b31f6036c338d8dc51616e0`
- Lane-owned implementation: `packages/notification/**` plus Notification-owned contract/schema projections
- Explicitly not performed: `NOTIF-3301`, Scheduler integration, Goal/Task/Routine projectors, Notification UI rebuild, Desktop notification surface rebuild

The lane has cut Notification business truth over to:

```text
Notification Fact
  + workflowKey/topic/idempotencyKey
  + read/unread
  + per-channel DeliveryPlan decision
      -> durable NotificationDispatchOutbox
      -> existing retry / DLQ runtime
```

Legacy root `NotificationStatus`, root sent/status-changed events, module/category preference authority, and `notification_history.delivery_policy` authority are retired in the Notification lane.

## Shared Data Portability train — required

`NotificationPreference` persistence now owns:

```text
global_channels
workflow_overrides
do_not_disturb
rate_limit
```

The Data Portability package is cross-owned and still serializes/writes the retired preference shape:

- `packages/data-portability/src/server/application/import-store/data-portability-import-store.ts`
  - `UpsertNotificationPreferenceInput.channels`
  - `UpsertNotificationPreferenceInput.categories`
  - `UpsertNotificationPreferenceInput.enabled`
- `packages/data-portability/src/server/application/use-cases/importers/settings.importer.ts`
- `packages/data-portability/src/server/infrastructure/import-store/prisma-data-portability-import-store.ts`
- `packages/data-portability/src/server/infrastructure/powersync/powersync-import-store.ts`
- corresponding export projection / PowerSync round-trip fixtures

Current concrete blocker after Prisma generation:

```text
prisma-data-portability-import-store.ts:65  'channels' does not exist in NotificationPreferenceCreateInput
prisma-data-portability-import-store.ts:72  'channels' does not exist in NotificationPreferenceUpdateInput
```

This blocks transitive `api:typecheck`, `desktop:typecheck`, and `app-vue:typecheck` before those host targets run.

### Required migration

1. Replace the Data Portability notification-preference import shape with `globalChannels + workflowOverrides + doNotDisturb + rateLimit`.
2. Update Prisma and PowerSync import stores together; do not restore `enabled/channels/categories` columns.
3. Update export projection and round-trip fixtures to the same single-track shape.
4. Because this project has no important production data for this cutover, do not add a long-lived dual-write compatibility authority solely for old notification preference payloads.

## API / Desktop composition train — required minimal cleanup

The Notification lane no longer needs `notificationTemplateRepository` in `CreateNotificationScheduleNotificationPortDeps`; template content remains a separate asset, but it is not part of Fact creation/policy authority.

Cross-owned composition roots still pass the removed dependency:

- `apps/api/src/runtime/compose-notification.ts`
- `apps/api/src/runtime/compose-notification.spec.ts`
- `apps/desktop/src/main/runtime/compose-notification.ts`

Required change is only to remove `notificationTemplateRepository` from `createNotificationScheduleNotificationPort({...})` calls and matching surface assertions. Do **not** redesign Scheduler or introduce `NOTIF-3301` here.

`createNotificationModule({... templateRepository ...})` remains valid because the module still exposes the independent template catalog; only the schedule-notification creation port stopped depending on templates.

## Notification UI train — intentionally deferred

Per Worker D scope, UI was not rebuilt. The existing App Vue preference composable still speaks the retired module/category shape:

- `packages/app-vue/src/modules/notification/composables/useNotificationPreferences.ts`
  - reads `preference.settings`
  - writes `categories`
- matching `useNotificationPreferences.spec.ts`

A direct `vue-tsc` currently reports those two expected contract mismatches. The UI train must map controls to `globalChannels` and workflow-specific overrides rather than recreating `SourceModule/category -> channel[]` authority.

## Evidence already green in the Notification lane

- Notification unit/surface suite: 42 files / 232 tests
- Notification Prisma reliability integration: 25 / 25
- Contracts suite: 64 files / 526 tests
- Prisma generate + database typecheck: green
- PowerSync schema typecheck/tests: green
- Notification typecheck/build: green
- HTTP/IPC Notification transport parity: green inside the Notification package

The cross-owner items above are the only known blockers found by host-level compile audit. They must consume the frozen Notification vNext contract; they must not force legacy Fact/status or preference semantics back into the Notification lane.
