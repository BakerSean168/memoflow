import type { PrismaClient, Prisma } from '@memoflow/database';
import type { IEventBus } from '@memoflow/patterns';
import type {
  GoalWriteTransactionContext,
  GoalWriteTransactionRunner,
} from '../../../application/use-cases/commands/goal-write-support';
import {
  BufferedGoalWriteEventBus,
  committedGoalWriteEventBus,
} from '../goal-write-buffered-event-bus';
import { GoalPrismaRepository } from './goal-prisma.repository';
import { GoalRecordPrismaRepository } from './goal-record-prisma.repository';
import { PrismaGoalReliableOperationAdapter } from './prisma-goal-reliable-operation.adapter';

export class PrismaGoalWriteTransactionRunner implements GoalWriteTransactionRunner {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly eventPublisher: IEventBus = committedGoalWriteEventBus,
  ) {}

  async run<T>(work: (context: GoalWriteTransactionContext) => Promise<T>): Promise<T> {
    const bufferedEventBus = new BufferedGoalWriteEventBus();
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const receiptAdapter = new PrismaGoalReliableOperationAdapter(tx);
      return work({
        assertNativeAiLease: async (identityId, lease) => {
          // The zero-delta UPDATE is a row-level write lock held until Goal
          // persistence commits. Concurrent claim/release/renew waits, so a
          // superseded fence cannot race between the authority check and Save.
          // clock_timestamp() checks expiry at statement evaluation time.
          const rows = await tx.$queryRaw<Array<{ fence: number }>>`
            UPDATE "ai_goal_surface_leases"
            SET "expires_at" = "expires_at"
            WHERE "identity_id" = ${identityId}
              AND "run_id" = ${lease.runId}
              AND "owner_token" = ${lease.token}
              AND "fence" = ${lease.fence}
              AND "expires_at" > clock_timestamp()
            RETURNING "fence"
          `;
          return rows.length === 1;
        },
        goalRepository: new GoalPrismaRepository(tx, bufferedEventBus, true),
        goalRecordRepository: new GoalRecordPrismaRepository(tx),
        recordGoalCompletionReceipt: (input) => receiptAdapter.recordGoalCompletionReceipt(input),
      });
    });
    await bufferedEventBus.flush(this.eventPublisher);
    return result;
  }
}
