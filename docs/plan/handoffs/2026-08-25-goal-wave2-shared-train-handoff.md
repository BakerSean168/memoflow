# Goal Wave 2 — Shared Contract / Schema Train Handoff

Date: 2026-08-25
Lane: `core-vnext/goal-domain`
Base: `9982e1918447e8710b31f6036c338d8dc51616e0`
Historical authority record: `docs/plan/archive/2026-08-25-core-vnext-orchestration.md`; this handoff is not active.

This handoff records only central/shared train work that the Goal lane intentionally does not own. Goal-owned contracts, domain/application code, adapters and tests are implemented in this lane. Do not restore retired Goal semantics while applying this train.

## GOAL-2101 schema train

### Prisma `Goal`

Canonical Goal business fields after GOAL-2101:

- `id`
- `identityId`
- `name`
- `description`
- `feasibilityAnalysis`
- `motivation`
- `status`: `Active | Completed | Abandoned`
- `startDate`
- `dueDate`
- `completedAt`
- `archivedAt` (independent display/persistence attribute; not a business status)
- `sortOrder`
- `reminderConfig`
- `version`
- audit/delete timestamps
- KR / review / weight-snapshot relations
- shared Label assignment through `GoalLabel`

Retire from the central Prisma schema and generated client:

- `Goal.color`
- `Goal.importance`
- `Goal.priority`
- `Goal.category`
- `Goal.tags`
- `Goal.folderId`
- `Goal.parentGoalId`
- `Goal.rollupPolicy`
- hierarchy/folder indexes and relations that only serve those fields
- `GoalFolder` model and GoalFolder-only relations
- Goal-owned `FocusMode` / `FocusSession` models and relations

Rename `Goal.targetDate` -> `Goal.dueDate`. There is no production data worth preserving, so a destructive reset is acceptable and preferred over long-lived aliases/dual-write.

`GoalLabel` is retained. Preserve its identity isolation:

- composite uniqueness on `(identityId, goalId, labelId)`
- Goal/Label foreign keys
- indexes supporting identity-scoped Goal and Label lookup

### PowerSync schema

Apply the same semantic train:

- remove the retired Goal physical columns listed above;
- remove GoalFolder / Goal Focus tables and indexes;
- rename `goals.target_date` -> `goals.due_date` (or recreate the table with `due_date` during destructive reset);
- retain `labels` + `goal_labels` with identity-scoped ownership and uniqueness.

The Goal lane currently adapts canonical `dueDate` to the legacy physical `targetDate` / `target_date` column only as a temporary schema-train seam. PowerSync inserts also provide neutral values for legacy non-null/default columns where the current central schema still requires them. Remove those adapter seams immediately after the shared reset/regeneration.

### Generated outputs / reset

After central schema edits:

1. destructive dev/test DB reset is allowed;
2. regenerate Prisma client through the canonical workspace target (never hand-edit generated code);
3. regenerate/reconcile PowerSync schema artifacts;
4. update central schema inventory tests that intentionally describe the retired Goal Folder/Focus/legacy fields;
5. rerun Goal typecheck/tests plus API/Desktop composition tests.

### Consumer impact

Expected breaking changes are intentional:

- old Goal UI/client consumers must stop sending/reading `color`, `importance`, `priority`, `category`, string `tags`, `folderId`, `parentGoalId`, `rollupPolicy`, `targetDate`;
- Goal list classification uses Shared Labels (`labelIds` mutation, `labels[]` projection, `labelIdsAll` strict AND filter);
- Goal business status no longer contains `Archived`; `archivedAt` is independent;
- explicit abandon uses `Abandoned` and the `goal:abandon` / HTTP+IPC command;
- Goal Folder / Focus / auto-archive-expired transport surfaces are retired.

## Later Wave 2 additions

GOAL-2102 KR Measurement V2 and GOAL-2103 Review V2 central schema changes will be appended to this same handoff before the lane finishes, so the Schema Train can be applied as one destructive reset/regeneration pass.

### Shared test inventory handoff

`packages/contracts/src/modules/schedule/value-objects/map-importance-to-task-priority-dual.surface.spec.ts`
currently asserts that the Goal legacy schedule projection imports/calls
`mapImportanceToTaskPriority(goalDTO.importance)`. GOAL-2101 intentionally retires Goal
`importance`; the Goal-owned legacy projection now uses neutral `TaskPriority.Normal` only
as a compile-safe bridge until the authorized Wave 3 scheduling projector migration.
This Schedule-owned cross-domain surface test must be reconciled by the Scheduling/Shared
Train owner; the Goal lane does not modify Schedule contracts/tests in Wave 2.

## GOAL-2102 shared consumers / schema train

### AI contract consumer (out of Goal Wave 2 scope)

`packages/contracts/src/modules/ai/api/ai-goal-create-workflow.dto.ts` currently imports
`../../goal/value-objects/key-result-value-type` and therefore blocks the monorepo
`contracts:build` once GOAL-2102 removes `KeyResultValueType`.

The AI lane must migrate that Goal-create KR payload to the canonical Goal KR V2 input:

- remove `valueType` / `KeyResultValueType`;
- use `calculationMethod` (`Sum | Average | Max | Min | Last`);
- use `startingValue`, `currentValue`, `targetValue`;
- add nullable `progressBaselineValue` when the metric has no natural zero / decreases;
- preserve `unit` and `weight`.

The Goal lane intentionally does not edit AI contracts, per the Wave 2 authorization boundary.

### KeyResult central schema

Prisma `KeyResult` must converge to:

- remove `valueType`;
- rename `initialValue` -> `startingValue`;
- retain `currentValue`, `targetValue`, `unit`, `aggregationMethod`, `weight`, `sortOrder`;
- add `progressBaselineValue Float?` (nullable, no implicit default).

PowerSync `key_results` must converge equivalently:

- remove `value_type`;
- rename `initial_value` -> `starting_value`;
- add nullable `progress_baseline_value REAL`;
- retain current/target/unit/aggregation/weight/order.

Until this central destructive schema train is applied, Goal adapters intentionally use a narrow
physical compatibility seam: old `initialValue` stores canonical `startingValue`, old
`valueType` is written as neutral `Incremental`, and reads ignore it. **No baseline is encoded
into an unrelated legacy column.** Consequently non-null `progressBaselineValue` cannot survive
a persistence round trip until the shared schema train lands; this is the remaining schema-level
blocker for fully durable decreasing-metric KRs.

After the train: regenerate Prisma client, reconcile PowerSync schema, remove the neutral
`valueType` writes and `progressBaselineValue: null` adapter fallbacks, then rerun Goal integration.

## GOAL-2103 Review V2 shared schema train

The Goal feature lane has cut the public/domain/application Review model over to a factual review:

```text
GoalReview
  reflection
  challenges?
  adjustments?
  systemContext (immutable server-generated snapshot)
  reviewedAt
  audit fields
```

`systemContext` is generated by `GoalReviewContextBuilder` from authoritative GoalRecord facts and the GOAL-2102 canonical KR calculator. It contains:

```text
windowStartAt / windowEndAt
overallProgress: startPercentage / endPercentage / deltaPercentage
keyResults[]:
  keyResultId / title / unit
  startPercentage / endPercentage / deltaPercentage
  trend[{ at, progressPercentage }]
summary:
  recordCount
  manualRecordCount
  taskContributionCount
```

Trend values are deliberately normalized `0..100` percentages. Do not add raw kg/km/credits values to a shared absolute chart axis.

The create command accepts only the user-authored reflection fields and a review window. The server computes and freezes `systemContext`; clients cannot submit an authoritative snapshot. Update can edit only `reflection/challenges/adjustments`, leaving the original facts immutable. `GET /:id/reviews/context` and `goal:review:context` expose the same pre-composition facts over HTTP and IPC.

### Prisma `GoalReview`

Replace the legacy physical fields:

```text
reviewType
title
content
achievements
lessonsLearned
nextSteps
rating
keyResultSnapshots
```

with the canonical columns:

```text
reflection      String
challenges      String?
adjustments     String?
systemContext   String   @map("system_context") // validated JSON payload
reviewedAt      DateTime @map("reviewed_at")
```

Keep `id`, `identityId`, `goalId`, `createdAt`, `updatedAt`, ownership relation and indexes. There is no production data requiring preservation, so the Schema Train should destructively recreate/reset rather than preserve ReviewType/rating/title aliases.

### PowerSync `goal_reviews`

Mirror the same truth:

```text
identity_id
goal_id
reflection
challenges
adjustments
system_context
reviewed_at
created_at
updated_at
```

Remove `review_type`, `content`, `achievements`, `lessons_learned`, `next_steps`, `rating` and any old KR snapshot column from the edge schema.

### Temporary physical compatibility seam in the feature lane

Until the central Schema Train lands, the Goal adapters intentionally encode the new truth into old columns so the feature lane can be tested without racing shared schema writers:

```text
content          <- reflection
challenges       <- challenges
next_steps       <- adjustments
lessons_learned  <- JSON(systemContext)
review_type      <- neutral "Adhoc"
title/rating/achievements/keyResultSnapshots <- null
```

These legacy writes are not business semantics. Remove this compatibility seam immediately after Prisma/PowerSync cutover and regeneration. A residual scan after GOAL-2103 finds old review vocabulary only in these explicit persistence seams / shared physical schemas, not in Goal-owned contracts/domain/application truth.

### GOAL-2103 validation evidence

- Goal package: `79 files / 422 tests` green.
- Review Context builder: mixed `km` + `kg` fixture proves normalized trend output, decreasing metrics and weighted overall progress (`20 -> 47.5`) use GOAL-2102 semantics.
- Summary fixture: `3` records = `2` manual + `1` Task contribution using existing GoalRecord source correlation.
- HTTP/IPC parity includes the new Review Context endpoint/channel and validation failures.
- Review update tests prove system context is not client-editable.
- `git diff --check` green.

The lane-level monorepo typecheck remains intentionally blocked by the cross-owned AI Goal-create contract documented above until the Contract Train removes its `KeyResultValueType` import. Do not restore that retired type to make the feature branch compile in isolation.
