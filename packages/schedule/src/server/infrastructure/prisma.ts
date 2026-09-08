import type { PrismaClient } from '@memoflow/database';
import type { LeaseCoordinatorPort } from '@memoflow/patterns/lease';
import {
  PrismaOperationAuditRepository,
  globalUnifiedOperationMetrics,
} from '@memoflow/patterns/operations';
import type { OperationAuditRepository } from '@memoflow/patterns/operations';
import { eventBus } from '@memoflow/utils/domain';
import type { IScheduleRepository } from '../domain';
import { ScheduleEventDeliveryLogConsumer } from './consumers/schedule-event-delivery-log.consumer';
import { SchedulePrismaRepository } from './adapters/prisma';
import {
  createScheduleModule,
  type ScheduleModuleInstance,
  type ScheduleModuleRuntimeContribution,
  type ScheduleRuntimeContributionsInput,
} from './schedule.module';

export interface ScheduleRepositorySet {
  readonly scheduleRepository: IScheduleRepository;
  readonly auditRepository: OperationAuditRepository;
  readonly eventDeliveryLogConsumer: ScheduleModuleRuntimeContribution;
}

export interface CreateSchedulePrismaModuleOptions {
  readonly leaseCoordinator: LeaseCoordinatorPort;
  readonly runtimeContributions?: ScheduleRuntimeContributionsInput;
  readonly wireDeliveryLogConsumer?: boolean;
}

export function createSchedulePrismaRepository(db: PrismaClient): IScheduleRepository {
  return new SchedulePrismaRepository(db, undefined, globalUnifiedOperationMetrics);
}

export function createSchedulePrismaRepositories(db: PrismaClient): ScheduleRepositorySet {
  return {
    scheduleRepository: createSchedulePrismaRepository(db),
    auditRepository: new PrismaOperationAuditRepository(db),
    eventDeliveryLogConsumer: new ScheduleEventDeliveryLogConsumer(db, eventBus),
  };
}

export function createSchedulePrismaModule(
  db: PrismaClient,
  options: CreateSchedulePrismaModuleOptions,
): ScheduleModuleInstance {
  const repositories = createSchedulePrismaRepositories(db);
  return createScheduleModule({
    scheduleRepository: repositories.scheduleRepository,
    leaseCoordinator: options.leaseCoordinator,
    eventDeliveryLogConsumer:
      (options.wireDeliveryLogConsumer ?? true)
        ? repositories.eventDeliveryLogConsumer
        : undefined,
    runtimeContributions: options.runtimeContributions,
    auditRepository: repositories.auditRepository,
  });
}
