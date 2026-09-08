import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { LeaseCoordinatorPort } from '@memoflow/patterns/lease';
import {
  createSchedulePrismaRepositories,
  createSchedulePowerSyncRepositories,
  createSchedulePrismaModule,
  createSchedulePowerSyncModule,
  type ScheduleRepositorySet,
  type SchedulePowerSyncRepositories,
  type ScheduleModuleInstance,
  type IScheduleRepository,
} from '../../../../src';

const leaseCoordinator: LeaseCoordinatorPort = {
  async execute(_leaseKey, task) {
    return { acquired: true, value: await task({ ensureHeld: async () => undefined }) };
  },
};

describe('Schedule Planner/Calendar repository factories', () => {
  const fakePrisma = {} as unknown as PrismaClient;
  const fakeElectronDb = {} as unknown as IElectronDatabase;

  it('Prisma set owns Calendar repository, audit, and delivery consumer only', () => {
    const set = createSchedulePrismaRepositories(fakePrisma);
    const typed: ScheduleRepositorySet = set;
    expect(typed).toHaveProperty('scheduleRepository');
    expect(typed).toHaveProperty('auditRepository');
    expect(typed).toHaveProperty('eventDeliveryLogConsumer');
    expect(set).not.toHaveProperty('scheduleTaskRepository');
    expect(set).not.toHaveProperty('scheduleExecutionRepository');
    expect(set).not.toHaveProperty('leaseCoordinator');
  });

  it('PowerSync set owns only the Calendar repository', () => {
    const set = createSchedulePowerSyncRepositories(fakeElectronDb);
    const typed: SchedulePowerSyncRepositories = set;
    expect(typed).toHaveProperty('scheduleRepository');
    expect(Object.keys(set).sort()).toEqual(['scheduleRepository']);
  });

  it('module factories require a host-provided lease port and preserve Calendar lifecycle', () => {
    const prismaInstance = createSchedulePrismaModule(fakePrisma, {
      leaseCoordinator,
      wireDeliveryLogConsumer: false,
    });
    const powerSyncInstance = createSchedulePowerSyncModule(fakeElectronDb, leaseCoordinator);

    for (const instance of [prismaInstance, powerSyncInstance]) {
      const typed: ScheduleModuleInstance = instance;
      expect(typed).toHaveProperty('eventApi');
      expect(typeof typed.api.queryRebuildTimeline).toBe('function');
      expect(typeof typed.start).toBe('function');
      expect(typeof typed.dispose).toBe('function');
      expect(instance).not.toHaveProperty('scheduleTaskRepository');
      expect(instance).not.toHaveProperty('scheduleExecutionRepository');
    }
  });

  it('root barrel exposes Calendar repository type but no Temporal Engine repository types', async () => {
    const schedule = (_t: IScheduleRepository) => undefined;
    expect(typeof schedule).toBe('function');

    const root = readFileSync(resolve(__dirname, '../../../index.ts'), 'utf8');
    for (const forbidden of [
      'IScheduleTaskRepository',
      'IScheduleExecutionRepository',
      'ScheduleTask',
      'ScheduleLeaseCoordinator',
      'createSchedulerRuntimeContribution',
    ]) {
      expect(root).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }

    const rootModule = await import('../../../../src');
    for (const forbidden of [
      'ScheduleTaskPrismaRepository',
      'ScheduleExecutionPrismaRepository',
      'ScheduleLeaseCoordinator',
    ]) {
      expect(Object.keys(rootModule)).not.toContain(forbidden);
    }
  });
});
