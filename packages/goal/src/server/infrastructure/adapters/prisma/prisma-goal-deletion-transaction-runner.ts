import type { Prisma, PrismaClient } from '@memoflow/database';
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
import { GoalPrismaRepository } from './goal-prisma.repository';

export type PrismaGoalRelationCleanupFactory = (
  tx: Prisma.TransactionClient,
) => GoalRelationCleanupPort;

export class PrismaGoalDeletionTransactionRunner implements GoalDeletionTransactionRunner {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly relationCleanupFactory: PrismaGoalRelationCleanupFactory,
    private readonly eventPublisher: IEventBus = committedGoalWriteEventBus,
  ) {}

  async run<T>(work: (context: GoalDeletionTransactionContext) => Promise<T>): Promise<T> {
    const bufferedEventBus = new BufferedGoalWriteEventBus();
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) =>
      work({
        goalRepository: new GoalPrismaRepository(tx, bufferedEventBus, true),
        relationCleanup: this.relationCleanupFactory(tx),
      }),
    );
    await bufferedEventBus.flush(this.eventPublisher);
    return result;
  }
}
