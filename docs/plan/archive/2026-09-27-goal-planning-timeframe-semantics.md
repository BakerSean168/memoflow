# Goal planning timeframe semantics

Date: 2026-09-27
Status: completed

## Decision

Goal planning start and target are both semantic `GoalTimeframe | null` values.

- `start` preserves the precision the user selected.
- `target` preserves the precision the user selected.
- Calculations never collapse either value at input time.
- Derived calculations project boundaries only when needed:
  - start-side calculations use `goalTimeframeStartBoundary(start)`
  - target-side calculations use `goalTimeframeEndBoundary(target)`

Examples:

- start `2026 Q4` remains `{ kind: 'quarter', year: 2026, quarter: 4 }`; its effective calculation boundary is 2026-10-01.
- target `2027 Q2` remains `{ kind: 'quarter', year: 2027, quarter: 2 }`; its effective calculation boundary is 2027-06-30.

## Public vocabulary

Retire Goal-level `startDate` from contracts/domain/UI and use:

```ts
start: GoalTimeframe | null
target: GoalTimeframe | null
```

Task/Routine schedule `startDate` fields are unrelated and remain exact calendar dates.

## Persistence

Goal persistence keeps normalized reversible pairs:

- start: `start_kind + start_date`, where `start_date` is the canonical start boundary.
- target: `target_kind + target_end_date`, where `target_end_date` is the canonical end boundary.

The boundary columns are persistence/search projections, not the product semantic value.

Existing non-null Goal `start_date` values are backfilled as `start_kind = 'day'`.

### Migration-less deployment safety

This repository currently reconciles production/dev schemas primarily through Prisma `db push`, while the loose SQL files under `prisma/migrations` are not standard Prisma migration directories. Therefore the semantic cutover is also owned by an idempotent runtime preparation step:

- `prepare-goal-start-timeframe-semantics.ts` adds `start_kind` if needed.
- It backfills every legacy non-null `start_date` with `start_kind = 'day'`.
- It fails closed if a partial `start_kind/start_date` pair remains.
- The migrator runs it before either the `migrate deploy` or `db push` branch.
- `database:prisma-push` runs the same preparation before schema reconciliation.

This prevents deployment order from creating a window where new domain decoders see legacy partial pairs.

### Compatibility bridges

The cutover keeps already-persisted external/runtime artifacts readable without reintroducing `startDate` into the canonical Goal model:

- queued `goal.reminder.fire` payloadVersion 2 records carrying `startDate` are decoded as day-precision `start` values at the scheduler registration boundary;
- existing Goal Portable V3 payloads carrying `startDate` are decoded as day-precision `start` values, while newly exported V3 payloads emit only canonical `start`;
- preserved PowerSync rows with a legacy non-null `start_date` and no `start_kind` are interpreted locally as day precision until cloud/schema reconciliation completes;
- Prisma/server persistence remains fail-closed for partial pairs after the migration preparation step.

## Planning-window invariant

A planning window is valid when:

```
startBoundary(start) <= endBoundary(target)
```

This allows overlapping coarse periods while rejecting a semantic start that begins after the target period has ended.

## Reminder semantics

- RemainingDays: target end boundary minus N calendar days.
- TimeProgressPercentage: proportional calendar-day position from start boundary to target end boundary.
- Reminder payload preserves the original semantic `start` and `target`.

## Verification

Completed verification for this cutover:

- Goal tests: 87 files / 499 tests passed, including scheduler-registration compatibility for queued legacy reminder payloads.
- Contracts tests: 86 files / 496 tests passed, including Portable V3 compatibility.
- Database tests: 15 files / 47 tests passed, including transactional legacy backfill coverage.
- App Vue tests: shard 1 = 106 files / 412 tests; shard 2 = 105 files / 436 tests.
- Sequential `contracts`, `database`, `goal`, and `ai` typechecks passed.
- App Vue `vue-tsc --noEmit` passed.
- Web production build passed (`web:build`).
- Database runtime-script build passed and emitted `prepare-goal-start-timeframe-semantics.js`.
- The preparation step was executed against the current development database successfully and was idempotent.
- Independent Codex review reported no blocking or correctness findings after migration, queued-reminder, and portability compatibility fixes.
- `git diff --check` passed.

## Scope

Updated Goal contracts, domain, persistence adapters, PowerSync schema/repositories, reminder projection, Goal UI, AI Goal draft workflow, portability, migration/bootstrap paths, and tests. Task/Routine schedule `startDate` semantics remain exact calendar dates and were not migrated.
