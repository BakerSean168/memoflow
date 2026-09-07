# HARD-7101 Cross-domain Failure Matrix Evidence

Date: 2026-09-07

## Outcome

`HARD-7101` is complete. The canonical failure matrix binds all 22 required scenarios to executable behavior evidence and the full runner passes 22/22.

- Static drift gate: `node tools/test/hard-7101-failure-matrix.mjs --check`.
- Full executable gate: `node tools/test/hard-7101-failure-matrix.mjs --run`.
- The full run executes focused Vitest unit/integration evidence and the real Desktop Electron restart E2E.
- Scheduler worker-crash/lease-expiry coverage uses real PostgreSQL and proves a crashed claimant can be taken over after lease expiry without changing the logical invocation identity.
- Linux Desktop restart coverage uses Xvfb + a temporary D-Bus/GNOME Secret Service keyring. The test keeps MemoFlow safeStorage fail-closed behavior; a test-only preload removes Playwright Electron loader defaults (`password-store=basic`, `use-mock-keychain`) so the real OS keyring path is exercised.

## Matrix

| # | Scenario | Executable evidence |
| -: | --- | --- |
| 1 | `event-handler-outbox-fallback` — event handler failure -> outbox fallback | `packages/schedule/src/server/infrastructure/adapters/prisma/schedule-event-delivery-log-consumer.integration.test.ts` — sync throw: handler failure is returned to the publisher — outbox enters retry, no receipt/effect written |
| 2 | `projection-lost-reconcile-repair` — projection event lost -> reconcile repair | `packages/schedule-orchestration/src/__tests__/projection-repair-runtime.test.ts` — registers every incremental listener before full repair and heals lost Task/Goal/Routine events after restart |
| 3 | `reconcile-transaction-crash` — reconcile transaction crash | `packages/scheduler/src/server/infrastructure/adapters/prisma/schedule-task-prisma.repository.integration.test.ts` — rolls back a transaction-scoped save when the owner reconcile callback fails |
| 4 | `scheduler-worker-crash` — scheduler worker crash | `packages/scheduler/src/server/infrastructure/adapters/prisma/schedule-task-prisma.repository.integration.test.ts` — recovers a claimed invocation after the scheduler worker crashes and its host lease expires |
| 5 | `lease-expiry` — lease expiry | `packages/scheduler/src/server/infrastructure/adapters/prisma/schedule-task-prisma.repository.integration.test.ts` — recovers a claimed invocation after the scheduler worker crashes and its host lease expires |
| 6 | `duplicate-scheduling-key` — same schedulingKey duplicate | `packages/scheduler/src/server/infrastructure/scheduling/__tests__/legacy-schedule-task-scheduling.adapter.spec.ts` — rejects duplicate desired scheduling keys before writing |
| 7 | `stale-invocation` — stale invocation | `packages/reminder/src/server/infrastructure/reminder-template-scheduled-handler.spec.ts` — maps a stale Reminder occurrence to skipped without replaying the business commit |
| 8 | `handler-business-skip` — handler business skip | `packages/reminder/src/server/infrastructure/routine-schedule/__tests__/routine-wall-clock-scheduled-handler.spec.ts` — maps a skip to a skipped result without retry semantics |
| 9 | `handler-technical-retry` — handler technical retry | `packages/reminder/src/server/infrastructure/routine-schedule/__tests__/routine-wall-clock-scheduled-handler.spec.ts` — maps a transient failure to a retryable HANDLER_EXECUTION_FAILED |
| 10 | `notification-requested-replay` — NotificationRequested replay | `packages/notification/src/server/infrastructure/adapters/prisma/__tests__/notification-requested-writer.integration.test.ts` — 3. Replay after crash-after-Fact commit keeps exactly one Fact and one dispatch outbox |
| 11 | `channel-disabled` — channel disabled | `packages/notification/src/server/infrastructure/adapters/prisma/__tests__/notification-requested-writer.integration.test.ts` — 4. Per-channel policy is evaluated at consumption: disabled InApp yields no dispatch + observable decision |
| 12 | `dnd` — DND | `packages/notification/src/server/application/use-cases/commands/__tests__/create-notification.test.ts` — keeps the Inbox Fact unread when Desktop delivery is suppressed by DND |
| 13 | `rate-limit` — rate limit | `packages/notification/src/server/application/use-cases/commands/__tests__/create-notification.test.ts` — preserves rate-limit suppression without mutating Fact read state |
| 14 | `device-offline` — device offline | `packages/notification/src/server/infrastructure/runtime/notification.runtime.spec.ts` — treats a device-offline channel failure as retryable and delivers after recovery |
| 15 | `desktop-restart` — Desktop restart | `apps/desktop/e2e/authentication/desktop-auth-flow.spec.ts` — persistent guest works offline, survives lock, and reopens with edited profile data |
| 16 | `api-restart` — API restart | `apps/api/src/__tests__/integration/task-goal-host-restart.integration.test.ts` — delivers a committed Task contribution after the completing host exits |
| 17 | `routine-local-runtime-restart` — Routine local runtime restart | `packages/reminder/src/server/runtime/active-usage/active-usage.runtime.spec.ts` — restores an accumulator snapshot without counting process downtime; `packages/reminder/src/server/runtime/routine-activity/routine-activity-sensor.runtime.spec.ts` — cleans subscriptions and restarts without duplicate listeners |
| 18 | `protocol-session-restart` — Protocol session restart | `packages/reminder/src/server/runtime/protocol/protocol-session.runtime.spec.ts` — recovers crash-during-focus and crash-during-break from persisted deadlines |
| 19 | `clock-timezone-dst` — clock/timezone/DST | `packages/time/src/__tests__/recurrence.conformance.spec.ts` — preserves a Tokyo wall-clock time; `packages/time/src/__tests__/recurrence.conformance.spec.ts` — keeps 09:00 America/New_York across spring DST; `packages/time/src/__tests__/recurrence.conformance.spec.ts` — keeps 09:00 America/New_York across fall DST |
| 20 | `task-outcome-correction` — Task outcome correction | `packages/task/src/server/infrastructure/task-plan-settlement.integration.test.ts` — 15/15 settles once, uncomplete reverts, and correction can settle the plan again |
| 21 | `goal-settlement-replay-revert` — Goal settlement replay/revert | `packages/task/src/server/application/outbox/task-goal-outbox-dispatcher.test.ts` — replays persisted V2 events after restart and marks delivered only after Goal succeeds; `packages/goal/src/server/application/event-handlers/register-goal-event-listeners.integration.test.ts` — applies an explicit TaskInstance source once and reverts it explicitly |
| 22 | `planner-command-visual-revert` — Planner command failure -> visual revert | `packages/app-vue/src/modules/schedule/planner/planner-owner-command.router.spec.ts` — Fixture J routes Task 14:00 -> 16:00 to Task owner and reverts optimistic UI on conflict |

## Verification

- Failure matrix full runner: **22/22 scenarios passed**.
- Scheduler Prisma integration after adding crash/lease takeover coverage: **1 file, 5/5 tests passed**.
- Desktop restart evidence under the real Linux Secret Service path: **1/1 Playwright Electron E2E passed**.
- Non-E2E matrix evidence was also run independently with `--skip-e2e` before the final full run.

## Governance

The manifest/checker is wired into the root governance command. Renaming/removing a bound test or dropping a required scenario now fails governance before the expensive full matrix run is needed.
