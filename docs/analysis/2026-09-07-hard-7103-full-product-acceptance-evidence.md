---
tags:
  - memoflow
  - core-vnext
  - hardening
  - acceptance
  - e2e
description: HARD-7103 full product acceptance journeys — fixtures A-J, host applicability, local Docker provenance, and production-like schema boot evidence
created: 2026-09-07T22:40:00+08:00
updated: 2026-09-07T22:40:00+08:00
---

# HARD-7103 — Full product acceptance evidence

## Decision

`HARD-7103` is complete.

The frozen A-J scenarios are now bound to one executable acceptance manifest instead of being scattered plan prose. The suite distinguishes two different questions:

1. **Fixture truth:** every A-J product behavior has focused executable evidence;
2. **Host truth:** API, Desktop, Web, local Docker and fresh-schema layers run only the fixtures for which that host owns a distinct behavior, while every other cell is explicitly marked not applicable with an architectural reason.

This avoids both under-testing and a false 10 x 5 matrix where, for example, Web would pretend to own OS idle semantics or API would pretend to own Planner drag rollback.

Canonical runner and manifest:

- `tools/test/hard-7103-product-acceptance.json`;
- `tools/test/hard-7103-product-acceptance.mjs`;
- `tools/test/hard-7103-schema-boot.mjs`.

`node tools/test/hard-7103-product-acceptance.mjs --check` fail-closes if A-J drift, focused evidence disappears, a host layer loses explicit coverage/N/A truth, or an evidence file/title no longer exists.

## Frozen A-J fixture coverage

| Fixture | Frozen behavior | Primary executable evidence |
| --- | --- | --- |
| A | finite 15-day PlanCompletion lifecycle | Task real-PostgreSQL settlement integration: success, correction/revert/re-settlement, strict missed failure |
| B | `EachCompletion` apply/replay/uncomplete/reapply | Task outbox + Goal integration; API host restart; Web product loop; current-revision local Docker product loop |
| C | 75 -> 70 decreasing `Last` measurement | Goal record edit/delete use cases recalculate from authoritative history through `KeyResultProgress` |
| D | one-time Task 14:00, -30m reminder | Task projection emits one stable 13:30 intent; Orchestration emits one durable `NotificationRequested` and skips stale/deleted truth |
| E | Goal due -7d reminder | Goal neutral projection produces one stable -7d intent and removes it for terminal Goal truth |
| F | Routine 23:30 IANA wall-clock + snooze | Routine recurrence unit fixture + real-PostgreSQL persisted snooze projection |
| G | ActiveUsage 40m + natural idle break | ActiveUsage runtime fixture + Desktop Electron idle-sensor seam |
| H | 50/10 protocol + restart | protocol break-credit fixture + protocol persistence/recovery + Desktop focus-window restart projection |
| I | DND mixed-channel Notification | Notification Fact remains independent from per-channel suppress/defer decisions |
| J | Planner Task 14:00 -> 16:00 + failed command rollback | owner-command unit fixture + real Chromium FullCalendar drag, real Task owner request and forced 409 rollback |

The grouped focused runner passed **15 files / 81 tests** and printed:

```text
[hard-7103] focused passed: A-J behavior fixtures executed.
```

## Host applicability and execution

### API integration — Fixture B

The API-specific behavior is host restart durability, not a second copy of every domain rule.

`apps/api/src/__tests__/integration/task-goal-host-restart.integration.test.ts` passed **1/1** with real PostgreSQL:

- a Task completion commits before the first API host exits;
- the restarted host claims the durable Task -> Goal outbox;
- exactly one GoalRecord is produced;
- a second restart does not duplicate the contribution.

### Desktop integration — Fixtures G / H

`apps/desktop/src/main/modules/routine/windows-idle-sensor.adapter.spec.ts` and `focus-window-controller.spec.ts` passed **2 files / 5 tests**:

- Electron OS idle time emits the transition consumed by ActiveUsage;
- subscriptions can be disposed/restarted cleanly;
- the 50/10 Focus projection is reconstructed from persisted ProtocolSession truth after app restart;
- a missed deadline catches up without renderer tick authority.

### Web E2E — Fixtures B / J

Real Chromium passed **2/2**:

- Fixture B completes a Task through the Web product surface and observes Task stats + linked Goal progress;
- Fixture J creates a 14:00 TimePoint Task, drags the real FullCalendar event to 16:00, sends the real owner `POST /task-instances/:id/reschedule`, forces a `409 CONFLICT`, and verifies FullCalendar visually reverts to the original position.

The Fixture J work intentionally does not depend on FullCalendar private/generated CSS. FullCalendar v7 had changed internal time-grid class names; the final test uses MemoFlow event test IDs and the visible 16:00/16时 time-axis label.

### Current-revision local Docker — product phases A-E

The local Docker runner validates image provenance before Playwright, then requires a unique browser request token to appear in current Web-container logs. Final evidence:

```text
7 passed
[local-docker-e2e] evidence written to reports/local-deploy-validation/local-docker-playwright-evidence.json
[hard-7103] local Docker passed: current-revision product phases A-E executed with browser/container evidence.
```

Evidence summary from the successful run:

```text
ok=true
playwrightExitCode=0
runtime.ok=true
browserRequest.ok=true
```

Phase A carries Fixture B end-to-end through Goal/KR creation, explicit link + `EachCompletion=1` contribution, Task creation, idempotent repeated completion, uncomplete/revert and reapply. Phases B-E additionally exercise current Task plan/update projection, shell/draft independence, accessible Goal/KR/Task forms, and AI workflow approval/dirty/mobile behavior against the same running container set.

The local Docker tests were migrated to current vNext surfaces rather than restoring retired UI:

- GoalDialog is one page with inline KR draft editing; old Goal tabs/separate KR dialog were removed from acceptance;
- Goal list uses `goal-progress-row`, not retired `goal-card`;
- Task plan checks switch explicitly to the current `plans` surface;
- Quick Task and obsolete copy/rolling-summary assumptions were removed from acceptance rather than re-added to product UI;
- Goal terminology uses `dueDate` / “截止日期”, not the retired target-date UI;
- Task Goal/KR binding remains link-only by default; Fixture B explicitly enables automatic contribution before asserting `EachCompletion`;
- AI GoalPlanDraft fixtures now use current `dueDate`, `startingValue` and `progressBaselineValue` contract fields.

## Production-like schema boot

`tools/test/hard-7103-schema-boot.mjs` creates a new PostgreSQL database, runs the same `database:prisma-push` reconciliation target used by CI/development, verifies the schema, then drops the temporary database.

Final cold boot passed with:

- pgvector enabled;
- **96** public tables;
- **23** required Core vNext tables;
- Scheduler unique `scheduling_key` fence;
- Routine `(routine_id, profile_id)` membership uniqueness fence;
- canonical Task Goal-binding v2 CHECK constraint.

The final message is:

```text
[hard-7103-schema-boot] passed: fresh database booted through database:prisma-push; 96 public tables; 23 core tables + pgvector + vNext uniqueness fences + Task Goal-binding v2 fence verified.
```

## Production defects found by acceptance

HARD-7103 did not merely relabel existing green tests. The cross-layer runs exposed and repaired four real integration/deployment defects plus stale acceptance assumptions.

### 1. Local Compose env layering depended on caller cwd

`localComposeArgs` / runtime env resolution used `process.cwd()`. When the local-Docker runner launched from `apps/web`, it missed the repository-root local env overlay and failed before browser startup.

The local Compose helper now resolves its default workspace root from `tools/docker/local-compose.mjs` itself. It does not print or copy secret values. Regression suite: **22/22**.

### 2. Docker isolated workspace closure omitted the new Scheduler package

After CLEAN-6304 physically split Planner/Calendar from the Temporal Engine, Host Nx builds still passed because the monorepo hoisted workspace was available. The isolated API Docker build correctly exposed that `Dockerfile.api` did not copy `packages/scheduler/package.json` before `pnpm install`, nor Scheduler source before package builds.

The Docker closure now includes Scheduler explicitly. A no-cache isolated build then passed `schedule-orchestration:build`, API, Migrator, Web and PowerSync image creation.

### 3. Task Goal-binding database CHECK was frozen to retired trigger names

The real local-Docker API rejected a valid current request with:

```text
task_templates_goal_binding_complete
```

because the hand-written PostgreSQL CHECK still accepted only `PER_INSTANCE / ALL_INSTANCES_COMPLETED`. It also failed to represent the current link-only Goal/KR relationship where contribution is intentionally absent.

The canonical v2 constraint now accepts exactly:

1. no Goal/KR binding;
2. complete Goal/KR link with no contribution;
3. complete Goal/KR link with non-negative `EachCompletion` or `PlanCompletion` contribution.

The schema guard now versions the constraint as `memoflow.task-goal-binding/v2`. Existing old constraints are transactionally dropped, legacy persisted trigger values are migrated, and the canonical constraint is recreated; already-v2 databases are unchanged. Focused database tests pass **4/4**.

Both deployment modes are proven:

- fresh database: `Task goal-binding constraint: created canonical v2`;
- existing local Docker database: first upgraded run logged `replaced with canonical v2`; the next idempotent migrator run logged `already canonical v2`.

`database:prisma-push` now executes the same guard after Prisma schema reconciliation, so CI/fresh boot and the production migrator no longer diverge on this manual CHECK.

### 4. Acceptance had drifted behind current product semantics

The initial Phase A-E run exposed old Goal tabs, Quick Task, old card IDs, old target-date wording and old AI draft fields in test code. Those were retired product surfaces, not missing product behavior. Acceptance was migrated to the current contracts and UI instead of adding compatibility controls back into MemoFlow.

## Closure

HARD-7103 is closed with all six required acceptance categories evidenced:

- A-J focused fixtures: green;
- API integration: green where host-specific;
- Desktop integration: green where host-specific;
- Web E2E: green where host-specific;
- current-revision local Docker product journey: **7/7 green** with runtime/browser provenance;
- production-like fresh schema boot: green, including the Task Goal-binding v2 fence.

Final closure advances to **HARD-7104 — Documentation / ADR truth closure**.
