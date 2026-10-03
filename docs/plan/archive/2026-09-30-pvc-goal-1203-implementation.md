---
tags:
  - plan
  - goal
description: PVC-GOAL-1203 implementation and validation scope
created: 2026-09-30T00:00:00Z
updated: 2026-09-30T00:00:00Z
---

# PVC-GOAL-1203 implementation

Implement Goal-owned Manual / TaskAutomatic / TaskUserMeasurement authorship independently of Task source correlation. Preserve GOAL-1201 composer, GOAL-1202 preview, mutation receipts, aggregation semantics and source-neutral portability. No Task completion/event changes, commits or pushes.

1. Extend contracts and enforce the authorship/source invariant in GoalRecord creation and loading; apply correction/deletion policy in Goal commands.
2. Persist explicit authorship in Prisma and PowerSync; backfill old rows and enforce PostgreSQL constraints. Generate Prisma artifacts with repository tooling.
3. Project provenance and recordedAt through Goal client mapping and localized GoalRecordCard.
4. Add contract, invariant, command, handler, mapper, migration, portability and UI characterization tests.
5. Run focused tests, goal/app-vue typechecks, generation/schema checks, changed-file ESLint, governance and diff checks. Update the master plan only with green evidence.

Guardrails: Goal owns provenance validation and correction authority; Task source identity continues to own idempotency/revert. Public creation remains Manual and cannot choose provenance. Persistence reads fail closed on invalid combinations, including local PowerSync reads. Existing Goal transactions and full-history recalculation remain authoritative. SQL backfill classifies only pre-existing rows; no runtime inference of authorship from source. Portability deliberately strips source and restores Manual.

## Validation evidence

Completed 2026-09-30. Initial focused suites passed: contracts 7, Goal 153, database 7, PowerSync 12, Vue 88, migrator 3. After rebasing onto the integrated TASK-3301A baseline, the focused Goal suite expanded to 15 files / 168 tests and passed again; contracts 7, database 7, PowerSync 12, Vue 88, and migrator 3 also passed again. Goal/app-vue/PowerSync/migrator typechecks, Prisma generation/validation, runtime-script build, changed-file ESLint (exit 0, existing warnings), diff check and governance passed. The PostgreSQL temporary-table fixture verified legacy backfill/default, all 80 authorship/source combinations (4 accepted / 76 rejected), and idempotent rerun. No persistent application data was changed by that fixture.

The migrator applies authorship backfill before schema push and ensures the constraint afterward, so fresh databases also receive the PostgreSQL CHECK. Test inventory was regenerated using repository tooling because governance found it stale. The branch was then rebased over TASK-3301A; generated Prisma artifacts were regenerated from the combined schema so Goal authorship and Task goal-progress fields coexist without hand-edited generated output. No Task completion/event/outbox flow or aggregation change was introduced by this ticket. Blockers: none.

Local result logs:

- `/tmp/goal-1203-contracts.log`
- `/tmp/goal-1203-tests.log`
- `/tmp/goal-1203-db-tests.log`
- `/tmp/goal-1203-powersync-tests.log`
- `/tmp/goal-1203-vue-tests.log`
- `/tmp/goal-1203-migrator-tests.log`
- `/tmp/goal-1203-typecheck.log`
- `/tmp/goal-1203-vue-typecheck.log`
- `/tmp/goal-1203-powersync-typecheck.log`
- `/tmp/goal-1203-migrator-typecheck.log`
- `/tmp/goal-1203-runtime-build.log`
- `/tmp/goal-1203-postgres.log`
- `/tmp/goal-1203-eslint.log`
- `/tmp/goal-1203-inventory.log`
- `/tmp/goal-1203-governance.log`

The SQL fixture was expanded with the standalone migration into `/tmp/goal-1203-authorship-test.sql` and executed using:

```sh
docker exec -i MemoFlow-test-db sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < /tmp/goal-1203-authorship-test.sql
```

## Exact changed files

- `apps/migrator/src/main.test.ts`
- `apps/migrator/src/main.ts`
- `docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md`
- `docs/plan/archive/2026-09-30-pvc-goal-1203-implementation.md`
- `packages/app-vue/src/locales/en-US/goal.ts`
- `packages/app-vue/src/locales/zh-CN/goal.ts`
- `packages/app-vue/src/modules/goal/components/cards/GoalRecordCard.spec.ts`
- `packages/app-vue/src/modules/goal/components/cards/GoalRecordCard.vue`
- `packages/contracts/src/mocks/goal.mock.ts`
- `packages/contracts/src/modules/goal/api/goal-record-provenance.spec.ts`
- `packages/contracts/src/modules/goal/api/response-schemas.ts`
- `packages/contracts/src/modules/goal/entities/goal-record-server.ts`
- `packages/contracts/src/modules/goal/entities/index.ts`
- `packages/database/prisma/migrations/add-goal-record-authorship.sql`
- `packages/database/prisma/schema/goal.prisma`
- `packages/database/project.json`
- `packages/database/scripts/prepare-goal-record-authorship.ts`
- `packages/database/src/generated/prisma/edge.js`
- `packages/database/src/generated/prisma/index-browser.js`
- `packages/database/src/generated/prisma/index.d.ts`
- `packages/database/src/generated/prisma/index.js`
- `packages/database/src/generated/prisma/package.json`
- `packages/database/src/generated/prisma/schema.prisma`
- `packages/database/src/schema/goal-record-authorship.spec.ts`
- `packages/database/src/schema/goal-record-authorship.test.sql`
- `packages/database/src/schema/goal-record-authorship.ts`
- `packages/database/tsup.runtime-scripts.config.ts`
- `packages/goal/src/application-client/goal-client-service.ts`
- `packages/goal/src/domain-client/entities/goal-record.ts`
- `packages/goal/src/infrastructure-client/adapters/goal-record-provenance.spec.ts`
- `packages/goal/src/server/application/event-handlers/task-goal-progress.handler.spec.ts`
- `packages/goal/src/server/application/event-handlers/task-goal-progress.handler.ts`
- `packages/goal/src/server/application/use-cases/commands/__tests__/create-goal-record.test.ts`
- `packages/goal/src/server/application/use-cases/commands/__tests__/delete-goal-record.test.ts`
- `packages/goal/src/server/application/use-cases/commands/__tests__/goal-record-portability.test.ts`
- `packages/goal/src/server/application/use-cases/commands/__tests__/remove-task-goal-contribution.test.ts`
- `packages/goal/src/server/application/use-cases/commands/__tests__/update-goal-record.test.ts`
- `packages/goal/src/server/application/use-cases/commands/create-goal-record.use-case.ts`
- `packages/goal/src/server/application/use-cases/commands/create-goal.use-case.ts`
- `packages/goal/src/server/application/use-cases/commands/delete-goal-record.use-case.ts`
- `packages/goal/src/server/application/use-cases/commands/update-goal-record.use-case.ts`
- `packages/goal/src/server/domain/aggregates/goal-record.spec.ts`
- `packages/goal/src/server/domain/aggregates/goal-record.ts`
- `packages/goal/src/server/infrastructure/adapters/powersync/goal-record-powersync.repository.ts`
- `packages/goal/src/server/infrastructure/adapters/powersync/mappers/powersync-goal-record.mapper.ts`
- `packages/goal/src/server/infrastructure/adapters/prisma/goal-record-prisma.repository.ts`
- `packages/goal/src/server/infrastructure/adapters/prisma/mappers/goal-record-provenance.spec.ts`
- `packages/goal/src/server/infrastructure/adapters/prisma/mappers/prisma-goal-record-mapper.spec.ts`
- `packages/goal/src/server/infrastructure/adapters/prisma/mappers/prisma-goal-record-mapper.ts`
- `packages/powersync-schema/src/index.spec.ts`
- `packages/powersync-schema/src/index.ts`
- `tools/test-system-v2/test-inventory.json`
