import type { IElectronDatabase } from '@memoflow/contracts/electron';
import { createGoalPowerSyncRepositories } from './powersync';
import type { GoalRepositorySet } from './prisma';
import type { Prisma } from '@memoflow/database';
import type { IEventBus } from '@memoflow/patterns';
import { createGoalPortableCapability } from '../application/goal-portability';
import { CreateGoalUseCase } from '../application/use-cases/commands/create-goal.use-case';
import { ActivateGoalUseCase } from '../application/use-cases/commands/activate-goal.use-case';
import { CompleteGoalUseCase } from '../application/use-cases/commands/complete-goal.use-case';
import { AbandonGoalUseCase } from '../application/use-cases/commands/abandon-goal.use-case';
import { ArchiveGoalUseCase } from '../application/use-cases/commands/archive-goal.use-case';
import { createInlineGoalWriteTransactionRunner } from '../application/use-cases/commands/goal-write-support';
import { GoalPolicy } from '../domain';
import { GoalPrismaRepository } from './adapters/prisma/goal-prisma.repository';
import { GoalRecordPrismaRepository } from './adapters/prisma/goal-record-prisma.repository';
import { PrismaGoalReliableOperationAdapter } from './adapters/prisma/prisma-goal-reliable-operation.adapter';

// Restoring historical facts must not re-publish lifecycle notifications. Future
// scheduling is a separate post-import reconciliation owned by the host operation.
const restoredGoalEvents: IEventBus = { publish: async () => undefined };

/** All Goal facts and completion receipts join the caller's PostgreSQL transaction. */
export function createGoalPrismaPortableCapability(tx: Prisma.TransactionClient) {
  const goalRepository = new GoalPrismaRepository(tx, restoredGoalEvents, true);
  const goalRecordRepository = new GoalRecordPrismaRepository(tx);
  const runner = createInlineGoalWriteTransactionRunner(
    { goalRepository, goalRecordRepository },
    new PrismaGoalReliableOperationAdapter(tx),
  );
  return compose({ goalRepository, goalRecordRepository, goalWriteTransactionRunner: runner });
}

export function createGoalPowerSyncPortableCapability(db: IElectronDatabase) {
  return compose(createGoalPowerSyncRepositories(db));
}

function compose({
  goalRepository,
  goalRecordRepository,
  goalWriteTransactionRunner: runner,
}: GoalRepositorySet) {
  const policy = new GoalPolicy();
  const create = new CreateGoalUseCase(goalRepository, policy, runner, goalRecordRepository);
  const activate = new ActivateGoalUseCase(goalRepository, policy);
  const complete = new CompleteGoalUseCase(goalRepository, policy, runner);
  const abandon = new AbandonGoalUseCase(goalRepository, policy);
  const archive = new ArchiveGoalUseCase(goalRepository, policy, runner);
  return createGoalPortableCapability(
    {
      activateGoal: (id, identityId, version) => activate.execute(id, identityId, version),
      completeGoal: (id, identityId, version) => complete.execute(id, identityId, version),
      abandonGoal: (id, identityId, version) => abandon.execute(id, identityId, version),
      archiveGoal: (id, identityId, version) => archive.execute(id, identityId, version),
    },
    create,
  );
}
