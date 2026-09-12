import type { PrismaClient } from '@memoflow/database';
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
    private readonly prisma: PrismaClient,
    private readonly eventPublisher: IEventBus = committedTaskWriteEventBus,
  ) {}

  async run<T>(work: (repositories: TaskWriteRepositories) => Promise<T>): Promise<T> {
    const bufferedEventBus = new BufferedTaskWriteEventBus();

    let postCommitEvents: import('@memoflow/contracts/shared').IDomainEvent[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      const result = await work({
        templateRepository: new TaskPlanPrismaRepository(tx, bufferedEventBus),
        instanceRepository: new TaskOccurrencePrismaRepository(tx, bufferedEventBus),
      });
      const events = bufferedEventBus.drain();
      const goalOutbox: TaskGoalOutboxWriter = {
        append: async (record) => {
          await tx.taskGoalOutbox.createMany({
            data: [{
              eventId: record.eventId,
              identityId: record.identityId,
              taskOccurrenceId: record.taskOccurrenceId,
              taskPlanId: record.taskPlanId,
              goalId: record.goalId,
              keyResultId: record.keyResultId,
              payload: record.payload,
              availableAt: record.occurredAt,
            }],
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
    });

    await bufferedEventBus.flushEvents(this.eventPublisher, postCommitEvents);
    return result;
  }
}
