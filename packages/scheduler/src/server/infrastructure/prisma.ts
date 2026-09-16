import type { PrismaClient } from '@memoflow/database';
import type { IOutboxWriter } from '@memoflow/patterns';
import {
  InvocationAttemptPrismaRepository,
  ScheduleExecutionPrismaRepository,
  ScheduleTaskPrismaRepository,
  ScheduledInvocationPrismaRepository,
} from './adapters/prisma';
import { createScheduleLeasePrismaRepository } from './lease/schedule-lease.repository';
import { ScheduleLeaseCoordinator } from './lease/schedule-lease-coordinator';
import {
  createSchedulerModule,
  type SchedulerModuleInstance,
  type SchedulerRuntimeContributionsInput,
} from './scheduler.module';
import type {
  IScheduleExecutionRepository,
  IScheduleTaskRepository,
} from '../domain';

export interface CreateSchedulerPrismaRepositoriesOptions {
  readonly outboxWriter?: IOutboxWriter;
}

export interface SchedulerRepositorySet {
  readonly scheduleExecutionRepository: IScheduleExecutionRepository;
  readonly scheduleTaskRepository: IScheduleTaskRepository;
  readonly scheduledInvocationRepository: ScheduledInvocationPrismaRepository;
  readonly invocationAttemptRepository: InvocationAttemptPrismaRepository;
  readonly leaseCoordinator: ScheduleLeaseCoordinator;
}

export interface CreateSchedulerPrismaModuleOptions {
  readonly runtimeContributions?: SchedulerRuntimeContributionsInput;
  readonly outboxWriter?: IOutboxWriter;
}

export function createSchedulerTaskPrismaRepository(
  db: PrismaClient,
  outboxWriter?: IOutboxWriter,
): IScheduleTaskRepository {
  return new ScheduleTaskPrismaRepository(db, undefined, outboxWriter);
}

export function createSchedulerExecutionPrismaRepository(
  db: PrismaClient,
): IScheduleExecutionRepository {
  return new ScheduleExecutionPrismaRepository(db);
}

export function createSchedulerPrismaRepositories(
  db: PrismaClient,
  options: CreateSchedulerPrismaRepositoriesOptions = {},
): SchedulerRepositorySet {
  const scheduledInvocationRepository = new ScheduledInvocationPrismaRepository(db, db);
  return {
    scheduleTaskRepository: createSchedulerTaskPrismaRepository(db, options.outboxWriter),
    scheduleExecutionRepository: createSchedulerExecutionPrismaRepository(db),
    scheduledInvocationRepository,
    invocationAttemptRepository: new InvocationAttemptPrismaRepository(db),
    leaseCoordinator: new ScheduleLeaseCoordinator(createScheduleLeasePrismaRepository(db)),
  };
}

export function createSchedulerPrismaModule(
  db: PrismaClient,
  options: CreateSchedulerPrismaModuleOptions = {},
): SchedulerModuleInstance {
  const repositories = createSchedulerPrismaRepositories(db, options);
  return createSchedulerModule({
    scheduleTaskRepository: repositories.scheduleTaskRepository,
    scheduleExecutionRepository: repositories.scheduleExecutionRepository,
    scheduledInvocationRepository: repositories.scheduledInvocationRepository,
    invocationAttemptRepository: repositories.invocationAttemptRepository,
    runtimeContributions: options.runtimeContributions,
  });
}
