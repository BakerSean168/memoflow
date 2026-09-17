import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import {
  createSchedulerPowerSyncModule,
  createSchedulerPowerSyncRepositories,
} from '../powersync';
import { createScheduledInvocationRuntimeContribution } from '../runtime';

describe('Scheduler canonical Temporal Engine repository factories', () => {
  const fakeElectronDb = {} as unknown as IElectronDatabase;
  const prismaSource = readFileSync(resolve(__dirname, '../prisma.ts'), 'utf8');

  it('owns invocation/attempt repositories and lease infrastructure only', () => {
    const powersync = createSchedulerPowerSyncRepositories(fakeElectronDb);

    expect(powersync).toHaveProperty('scheduledInvocationRepository');
    expect(powersync).toHaveProperty('invocationAttemptRepository');
    expect(powersync).toHaveProperty('leaseCoordinator');
    expect(powersync).toHaveProperty('leaseRepository');
    expect(powersync).not.toHaveProperty('scheduleTaskRepository');
    expect(powersync).not.toHaveProperty('scheduleExecutionRepository');
    expect(powersync).not.toHaveProperty('scheduleRepository');

    expect(prismaSource).toContain('scheduledInvocationRepository');
    expect(prismaSource).toContain('invocationAttemptRepository');
    expect(prismaSource).toContain('leaseCoordinator');
    expect(prismaSource).not.toContain('scheduleTaskRepository');
    expect(prismaSource).not.toContain('scheduleExecutionRepository');
  });

  it('PowerSync module factory exposes invocation diagnostics and runtime lifecycle', () => {
    const instance = createSchedulerPowerSyncModule(fakeElectronDb);
    expect(typeof instance.api.listInvocations).toBe('function');
    expect(typeof instance.api.getInvocation).toBe('function');
    expect(typeof instance.api.listDueInvocations).toBe('function');
    expect(typeof instance.start).toBe('function');
    expect(typeof instance.dispose).toBe('function');
    expect(instance).not.toHaveProperty('eventApi');
  });

  it('canonical runtime consumes invocation persistence plus handler registry', () => {
    const set = createSchedulerPowerSyncRepositories(fakeElectronDb);
    const runtime = createScheduledInvocationRuntimeContribution({
      repository: set.scheduledInvocationRepository,
      handlerRegistry: { execute: async () => ({ status: 'succeeded' as const }) },
      leaseCoordinator: set.leaseCoordinator,
    });
    expect(typeof runtime.start).toBe('function');
    expect(typeof runtime.stop).toBe('function');
  });

  it('root seam cannot export the retired ScheduleTask tree', () => {
    const root = readFileSync(resolve(__dirname, '../../../index.ts'), 'utf8');
    expect(root).not.toContain('ScheduleTask');
    expect(root).not.toContain('ScheduleExecution');
    expect(root).not.toContain('IScheduleRepository');
  });
});
