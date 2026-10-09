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
        goalRepository: new GoalPrismaRepository(tx, bufferedEventBus, true),
        goalRecordRepository: new GoalRecordPrismaRepository(tx),
        recordGoalCompletionReceipt: (input) => receiptAdapter.recordGoalCompletionReceipt(input),
      });
    });
    await bufferedEventBus.flush(this.eventPublisher);
    return result;
  }
}
