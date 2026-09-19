import type { PrismaClient } from '@memoflow/database';
import {
  InvocationAttemptPrismaRepository,
  ScheduledInvocationPrismaRepository,
} from './adapters/prisma';
import { createScheduleLeasePrismaRepository } from './lease/schedule-lease.repository';
import { ScheduleLeaseCoordinator } from './lease/schedule-lease-coordinator';
import {
  createSchedulerModule,
  type SchedulerModuleInstance,
  type SchedulerRuntimeContributionsInput,
} from './scheduler.module';

export interface SchedulerRepositorySet {
  readonly scheduledInvocationRepository: ScheduledInvocationPrismaRepository;
  readonly invocationAttemptRepository: InvocationAttemptPrismaRepository;
  readonly leaseCoordinator: ScheduleLeaseCoordinator;
}

export interface CreateSchedulerPrismaModuleOptions {
  readonly runtimeContributions?: SchedulerRuntimeContributionsInput;
}

export function createSchedulerPrismaRepositories(db: PrismaClient): SchedulerRepositorySet {
  return {
    scheduledInvocationRepository: new ScheduledInvocationPrismaRepository(db, db),
    invocationAttemptRepository: new InvocationAttemptPrismaRepository(db),
    leaseCoordinator: new ScheduleLeaseCoordinator(createScheduleLeasePrismaRepository(db)),
  };
}

export function createSchedulerPrismaModule(
  db: PrismaClient,
  options: CreateSchedulerPrismaModuleOptions = {},
): SchedulerModuleInstance {
  const repositories = createSchedulerPrismaRepositories(db);
  return createSchedulerModule({
    scheduledInvocationRepository: repositories.scheduledInvocationRepository,
    invocationAttemptRepository: repositories.invocationAttemptRepository,
    runtimeContributions: options.runtimeContributions,
  });
}
