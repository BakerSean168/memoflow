import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import type { IEventBus } from '@memoflow/patterns';
import type { GoalRelationCleanupPort } from '../../../application/ports/goal-relation-cleanup.port';
import type {
  GoalDeletionTransactionContext,
  GoalDeletionTransactionRunner,
} from '../../../application/use-cases/commands/goal-deletion-support';
import {
  BufferedGoalWriteEventBus,
  committedGoalWriteEventBus,
} from '../goal-write-buffered-event-bus';
import { GoalPowerSyncRepository } from './goal-powersync.repository';

export type PowerSyncGoalRelationCleanupFactory = (
  tx: IElectronDatabaseTransaction,
) => GoalRelationCleanupPort;

export class PowerSyncGoalDeletionTransactionRunner implements GoalDeletionTransactionRunner {
  constructor(
    private readonly db: IElectronDatabase,
    private readonly relationCleanupFactory: PowerSyncGoalRelationCleanupFactory,
    private readonly eventPublisher: IEventBus = committedGoalWriteEventBus,
  ) {}

  async run<T>(work: (context: GoalDeletionTransactionContext) => Promise<T>): Promise<T> {
    const bufferedEventBus = new BufferedGoalWriteEventBus();
    const result = await this.db.writeTransaction(async (tx: IElectronDatabaseTransaction) =>
      work({
        goalRepository: new GoalPowerSyncRepository(tx, bufferedEventBus, true),
        relationCleanup: this.relationCleanupFactory(tx),
      }),
    );
    await bufferedEventBus.flush(this.eventPublisher);
    return result;
  }
}
