import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleRepositorySet } from '@memoflow/schedule';
import type {
  ScheduledInvocationHandlerRegistry,
  SchedulerRepositorySet,
} from '@memoflow/scheduler';

const mocks = vi.hoisted(() => ({
  createScheduleModule: vi.fn(() => ({ name: 'ScheduleInstance' })),
  createScheduleApiModule: vi.fn(() => ({ name: 'Schedule' })),
  createSchedulerModule: vi.fn(() => ({ name: 'SchedulerInstance' })),
  createSchedulerApiModule: vi.fn(() => ({ name: 'Scheduler' })),
  createScheduledInvocationRuntimeContribution: vi.fn(() => ({
    start: async () => {},
    stop: async () => {},
  })),
}));

vi.mock('@memoflow/schedule', () => ({
  createScheduleModule: mocks.createScheduleModule,
}));
vi.mock('@memoflow/scheduler', () => ({
  createSchedulerModule: mocks.createSchedulerModule,
  createScheduledInvocationRuntimeContribution: mocks.createScheduledInvocationRuntimeContribution,
}));
vi.mock('@memoflow/schedule/api', () => ({
  createScheduleApiModule: mocks.createScheduleApiModule,
}));
vi.mock('@memoflow/scheduler/api', () => ({
  createSchedulerApiModule: mocks.createSchedulerApiModule,
}));

import { composeSchedule } from './compose-schedule';
import { createScheduleModule } from '@memoflow/schedule';
import { createScheduleApiModule } from '@memoflow/schedule/api';
import {
  createSchedulerModule,
  createScheduledInvocationRuntimeContribution,
} from '@memoflow/scheduler';
import { createSchedulerApiModule } from '@memoflow/scheduler/api';

const calendarRepositories = {
  scheduleRepository: {},
  auditRepository: {},
  eventDeliveryLogConsumer: { start() {}, stop() {} },
} as unknown as ScheduleRepositorySet;
const schedulerRepositories = {
  scheduledInvocationRepository: {},
  invocationAttemptRepository: {},
  leaseCoordinator: {},
} as unknown as SchedulerRepositorySet;
const handlerRegistry = {
  execute: vi.fn(),
} as unknown as ScheduledInvocationHandlerRegistry;
const hostRuntime = { start: async () => {}, stop: () => {} };

describe('composeSchedule physical Scheduler/Calendar boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds the canonical invocation runtime before Scheduler and then binds both transports', () => {
    composeSchedule({ calendarRepositories, schedulerRepositories, handlerRegistry });

    const runtimeOrder = vi.mocked(createScheduledInvocationRuntimeContribution).mock.invocationCallOrder[0];
    const schedulerOrder = vi.mocked(createSchedulerModule).mock.invocationCallOrder[0];
    const schedulerApiOrder = vi.mocked(createSchedulerApiModule).mock.invocationCallOrder[0];
    const calendarOrder = vi.mocked(createScheduleModule).mock.invocationCallOrder[0];
    const calendarApiOrder = vi.mocked(createScheduleApiModule).mock.invocationCallOrder[0];

    expect(runtimeOrder).toBeLessThan(schedulerOrder);
    expect(schedulerOrder).toBeLessThan(schedulerApiOrder);
    expect(calendarOrder).toBeLessThan(calendarApiOrder);
  });

  it('shares only canonical Scheduler invocation persistence and lease with the host runtime', () => {
    composeSchedule({ calendarRepositories, schedulerRepositories, handlerRegistry });

    expect(createScheduledInvocationRuntimeContribution).toHaveBeenCalledWith({
      repository: schedulerRepositories.scheduledInvocationRepository,
      handlerRegistry,
      leaseCoordinator: schedulerRepositories.leaseCoordinator,
    });
    expect(createSchedulerModule).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduledInvocationRepository: schedulerRepositories.scheduledInvocationRepository,
        invocationAttemptRepository: schedulerRepositories.invocationAttemptRepository,
      }),
    );
    expect(createScheduleModule).toHaveBeenCalledWith({
      scheduleRepository: calendarRepositories.scheduleRepository,
      leaseCoordinator: schedulerRepositories.leaseCoordinator,
      eventDeliveryLogConsumer: calendarRepositories.eventDeliveryLogConsumer,
      auditRepository: calendarRepositories.auditRepository,
    });
    const schedulerCall = vi.mocked(createSchedulerModule).mock.calls[0][0] as Record<string, unknown>;
    expect(schedulerCall).not.toHaveProperty('scheduleTaskRepository');
    expect(schedulerCall).not.toHaveProperty('scheduleExecutionRepository');
  });

  it('keeps host runtime contributions after the canonical invocation runtime', () => {
    composeSchedule({
      calendarRepositories,
      schedulerRepositories,
      handlerRegistry,
      schedulerRuntimeContributions: hostRuntime,
    });
    const schedulerCall = vi.mocked(createSchedulerModule).mock.calls[0][0];
    expect(schedulerCall.runtimeContributions).toEqual([
      vi.mocked(createScheduledInvocationRuntimeContribution).mock.results[0].value,
      hostRuntime,
    ]);
  });

  it('returns sibling Calendar and Scheduler handles without exposing worker persistence', () => {
    const result = composeSchedule({ calendarRepositories, schedulerRepositories, handlerRegistry });
    expect(result.calendarModule.name).toBe('Schedule');
    expect(result.schedulerModule.name).toBe('Scheduler');
    expect(result.repositories.scheduleRepository).toBe(calendarRepositories.scheduleRepository);
    expect(result.repositories).not.toHaveProperty('scheduleTaskRepository');
    expect(result.repositories).not.toHaveProperty('scheduleExecutionRepository');
  });
});
