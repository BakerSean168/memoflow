import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleRepositorySet } from '@memoflow/schedule';
import type {
  ScheduleTaskSourceExecutor,
  SchedulerRepositorySet,
} from '@memoflow/scheduler';

vi.mock('@memoflow/schedule', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/schedule')>();
  return { ...actual, createScheduleModule: vi.fn(actual.createScheduleModule) };
});
vi.mock('@memoflow/scheduler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/scheduler')>();
  return {
    ...actual,
    createSchedulerModule: vi.fn(actual.createSchedulerModule),
    createSchedulerRuntimeContribution: vi.fn(actual.createSchedulerRuntimeContribution),
  };
});
vi.mock('@memoflow/schedule/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/schedule/api')>();
  return { ...actual, createScheduleApiModule: vi.fn(actual.createScheduleApiModule) };
});
vi.mock('@memoflow/scheduler/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memoflow/scheduler/api')>();
  return { ...actual, createSchedulerApiModule: vi.fn(actual.createSchedulerApiModule) };
});

import { composeSchedule } from './compose-schedule';
import { createScheduleModule } from '@memoflow/schedule';
import { createScheduleApiModule } from '@memoflow/schedule/api';
import {
  createSchedulerModule,
  createSchedulerRuntimeContribution,
} from '@memoflow/scheduler';
import { createSchedulerApiModule } from '@memoflow/scheduler/api';

const calendarRepositories = {
  scheduleRepository: {},
  auditRepository: {},
  eventDeliveryLogConsumer: { start() {}, stop() {} },
} as unknown as ScheduleRepositorySet;
const schedulerRepositories = {
  scheduleTaskRepository: {},
  scheduleExecutionRepository: {},
  leaseCoordinator: {},
} as unknown as SchedulerRepositorySet;
const sourceExecutor: ScheduleTaskSourceExecutor = {
  execute: async () => ({ nextRunAt: null }),
};
const hostRuntime = { start: async () => {}, stop: () => {} };

describe('composeSchedule physical Scheduler/Calendar boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds the queue runtime before Scheduler and then binds both transport modules', () => {
    composeSchedule({ calendarRepositories, schedulerRepositories, sourceExecutor });

    const runtimeOrder = vi.mocked(createSchedulerRuntimeContribution).mock.invocationCallOrder[0];
    const schedulerOrder = vi.mocked(createSchedulerModule).mock.invocationCallOrder[0];
    const schedulerApiOrder = vi.mocked(createSchedulerApiModule).mock.invocationCallOrder[0];
    const calendarOrder = vi.mocked(createScheduleModule).mock.invocationCallOrder[0];
    const calendarApiOrder = vi.mocked(createScheduleApiModule).mock.invocationCallOrder[0];

    expect(runtimeOrder).toBeLessThan(schedulerOrder);
    expect(schedulerOrder).toBeLessThan(schedulerApiOrder);
    expect(calendarOrder).toBeLessThan(calendarApiOrder);
  });

  it('shares Scheduler task repository and lease without leaking task state into Calendar', () => {
    composeSchedule({ calendarRepositories, schedulerRepositories, sourceExecutor });

    expect(createSchedulerRuntimeContribution).toHaveBeenCalledWith({
      scheduleTaskRepository: schedulerRepositories.scheduleTaskRepository,
      sourceExecutor,
      leaseCoordinator: schedulerRepositories.leaseCoordinator,
      shouldScheduleTask: undefined,
    });
    expect(createSchedulerModule).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleTaskRepository: schedulerRepositories.scheduleTaskRepository,
        scheduleExecutionRepository: schedulerRepositories.scheduleExecutionRepository,
      }),
    );
    expect(createScheduleModule).toHaveBeenCalledWith({
      scheduleRepository: calendarRepositories.scheduleRepository,
      leaseCoordinator: schedulerRepositories.leaseCoordinator,
      eventDeliveryLogConsumer: calendarRepositories.eventDeliveryLogConsumer,
      auditRepository: calendarRepositories.auditRepository,
    });
    const calendarCall = vi.mocked(createScheduleModule).mock.calls[0][0] as Record<string, unknown>;
    expect(calendarCall).not.toHaveProperty('scheduleTaskRepository');
    expect(calendarCall).not.toHaveProperty('scheduleExecutionRepository');
  });

  it('keeps host runtime contributions on Scheduler after the queue runtime', () => {
    composeSchedule({
      calendarRepositories,
      schedulerRepositories,
      sourceExecutor,
      schedulerRuntimeContributions: hostRuntime,
    });
    const schedulerCall = vi.mocked(createSchedulerModule).mock.calls[0][0];
    expect(schedulerCall.runtimeContributions).toEqual([
      vi.mocked(createSchedulerRuntimeContribution).mock.results[0].value,
      hostRuntime,
    ]);
  });

  it('returns sibling Calendar and Scheduler handles plus a narrow repository view', () => {
    const result = composeSchedule({ calendarRepositories, schedulerRepositories, sourceExecutor });
    expect(result.calendarModule.name).toBe('Schedule');
    expect(result.schedulerModule.name).toBe('Scheduler');
    expect(result.repositories.scheduleRepository).toBe(calendarRepositories.scheduleRepository);
    expect(result.repositories.scheduleTaskRepository).toBe(schedulerRepositories.scheduleTaskRepository);
  });
});
