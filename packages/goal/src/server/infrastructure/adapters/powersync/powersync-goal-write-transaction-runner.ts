import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/desktop-contracts';
import type { IEventBus } from '@memoflow/patterns';
import type {
  GoalWriteTransactionContext,
  GoalWriteTransactionRunner,
} from '../../../application/use-cases/commands/goal-write-support';
import {
  BufferedGoalWriteEventBus,
  committedGoalWriteEventBus,
} from '../goal-write-buffered-event-bus';
import { GoalPowerSyncRepository } from './goal-powersync.repository';
import { GoalRecordPowerSyncRepository } from './goal-record-powersync.repository';
import { PowerSyncGoalReliableOperationAdapter } from './powersync-goal-reliable-operation.adapter';

export class PowerSyncGoalWriteTransactionRunner implements GoalWriteTransactionRunner {
  constructor(
    private readonly db: IElectronDatabase,
    private readonly eventPublisher: IEventBus = committedGoalWriteEventBus,
  ) {}

  async run<T>(work: (context: GoalWriteTransactionContext) => Promise<T>): Promise<T> {
    const bufferedEventBus = new BufferedGoalWriteEventBus();
    const result = await this.db.writeTransaction(async (tx: IElectronDatabaseTransaction) => {
      const receiptAdapter = new PowerSyncGoalReliableOperationAdapter(tx);
      return work({
        assertNativeAiLease: async (identityId, lease) => {
          // This proof and Goal persistence share one serialized SQLite write
          // transaction; another same-profile holder cannot intervene.
          const row = await tx.getOptional<{ fence: number }>(
            `SELECT fence FROM ai_goal_surface_leases
             WHERE identity_id = ? AND run_id = ? AND owner_token = ?
               AND fence = ? AND expires_at > ?`,
            [identityId, lease.runId, lease.token, lease.fence, Date.now()],
          );
          return row !== null;
        },
        goalRepository: new GoalPowerSyncRepository(tx, bufferedEventBus, true),
        goalRecordRepository: new GoalRecordPowerSyncRepository(tx),
        recordGoalCompletionReceipt: (input) => receiptAdapter.recordGoalCompletionReceipt(input),
      });
    });
    await bufferedEventBus.flush(this.eventPublisher);
    return result;
  }
}
