import {
  EXTERNAL_MUTATION_TRANSACTION_OPTIONS,
  withPrismaTransaction,
} from '@memoflow/database/transaction';
import type { Prisma, PrismaClient } from '@memoflow/database';
import type { IEventBus } from '@memoflow/patterns';
import type {
  TaskWriteRepositories,
  TaskWriteTransactionRunner,
} from '../../../application/use-cases/commands/task-write-support';
import {
  BufferedTaskWriteEventBus,
  committedTaskWriteEventBus,
} from '../task-write-buffered-event-bus';
import { TaskOccurrencePrismaRepository } from './task-occurrence-prisma.repository';
import { TaskPlanPrismaRepository } from './task-plan-prisma.repository';
import { toTaskGoalOutboxRecord, type TaskGoalOutboxWriter } from '../../task-goal-outbox';

export class PrismaTaskWriteTransactionRunner implements TaskWriteTransactionRunner {
  constructor(
    private readonly prisma: PrismaClient | Prisma.TransactionClient,
    private readonly eventPublisher: IEventBus = committedTaskWriteEventBus,
  ) {}

  async run<T>(work: (repositories: TaskWriteRepositories) => Promise<T>): Promise<T> {
    const bufferedEventBus = new BufferedTaskWriteEventBus();

    let postCommitEvents: import('@memoflow/transport-contracts').IDomainEvent[] = [];
    const result = await withPrismaTransaction(
      this.prisma,
      async (tx) => {
        const result = await work({
          planRepository: new TaskPlanPrismaRepository(tx, bufferedEventBus),
          occurrenceRepository: new TaskOccurrencePrismaRepository(tx, bufferedEventBus),
        });
        const events = bufferedEventBus.drain();
        const goalOutbox: TaskGoalOutboxWriter = {
          append: async (record) => {
            await tx.taskGoalOutbox.createMany({
              data: [
                {
                  eventId: record.eventId,
                  identityId: record.identityId,
                  taskOccurrenceId: record.taskOccurrenceId,
                  taskPlanId: record.taskPlanId,
                  goalId: record.goalId,
                  keyResultId: record.keyResultId,
                  payload: record.payload,
                  availableAt: record.occurredAt,
                },
              ],
              skipDuplicates: true,
            });
          },
        };
        const eventsToPublish = [];
        for (const event of events) {
          const record = toTaskGoalOutboxRecord(event);
          if (record) {
            await goalOutbox.append(record);
          } else {
            eventsToPublish.push(event);
          }
        }
        postCommitEvents = eventsToPublish;
        return result;
      },
      // When this runner already received an owner tx it joins it unchanged;
      // when it owns the transaction it uses the same budget as the receipt.
      EXTERNAL_MUTATION_TRANSACTION_OPTIONS,
    );

    await bufferedEventBus.flushEvents(this.eventPublisher, postCommitEvents);
    return result;
  }
}
