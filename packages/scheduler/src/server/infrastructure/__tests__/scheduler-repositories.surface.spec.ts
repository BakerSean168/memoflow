import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import {
  createSchedulerPrismaRepositories,
  createSchedulerPowerSyncRepositories,
  createSchedulerPrismaModule,
  createSchedulerPowerSyncModule,
  createSchedulerRuntimeContribution,
  type IScheduleExecutionRepository,
  type IScheduleTaskRepository,
  type ScheduleTaskSourceExecutor,
} from '../../../../src';

describe('Scheduler Temporal Engine repository factories', () => {
  const fakePrisma = {} as unknown as PrismaClient;
  const fakeElectronDb = {} as unknown as IElectronDatabase;

  it('owns task/execution repositories and the concrete lease coordinator', () => {
    const prisma = createSchedulerPrismaRepositories(fakePrisma);
    const powersync = createSchedulerPowerSyncRepositories(fakeElectronDb);

    for (const set of [prisma, powersync]) {
      expect(set).toHaveProperty('scheduleTaskRepository');
      expect(set).toHaveProperty('scheduleExecutionRepository');
      expect(set).toHaveProperty('leaseCoordinator');
      expect(typeof set.leaseCoordinator.execute).toBe('function');
      expect(set).not.toHaveProperty('scheduleRepository');
      expect(set).not.toHaveProperty('auditRepository');
    }
    expect(powersync).toHaveProperty('leaseRepository');
  });

  it('module factories expose read-only diagnostics and runtime lifecycle', () => {
    const prisma = createSchedulerPrismaModule(fakePrisma);
    const powersync = createSchedulerPowerSyncModule(fakeElectronDb);
    for (const instance of [prisma, powersync]) {
      expect(typeof instance.api.listTasks).toBe('function');
      expect(typeof instance.api.getTask).toBe('function');
      expect(typeof instance.api.getDueTasks).toBe('function');
      expect(typeof instance.start).toBe('function');
      expect(typeof instance.dispose).toBe('function');
      expect(instance).not.toHaveProperty('scheduleRepository');
      expect(instance).not.toHaveProperty('eventApi');
    }
  });

  it('runtime contribution consumes Scheduler task ownership and source executor', () => {
    const set = createSchedulerPowerSyncRepositories(fakeElectronDb);
    const sourceExecutor: ScheduleTaskSourceExecutor = {
      execute: async () => ({ nextRunAt: null }),
    };
    const runtime = createSchedulerRuntimeContribution({
      scheduleTaskRepository: set.scheduleTaskRepository,
      sourceExecutor,
      leaseCoordinator: set.leaseCoordinator,
    });
    expect(typeof runtime.start).toBe('function');
    expect(typeof runtime.stop).toBe('function');
  });

  it('root type seam owns task/execution repositories and no Calendar repository', () => {
    const task = (_t: IScheduleTaskRepository) => undefined;
    const execution = (_t: IScheduleExecutionRepository) => undefined;
    expect(typeof task).toBe('function');
    expect(typeof execution).toBe('function');

    const root = readFileSync(resolve(__dirname, '../../../index.ts'), 'utf8');
    expect(root).not.toContain('CalendarEntry');
    expect(root).not.toContain('IScheduleRepository');
  });
});
