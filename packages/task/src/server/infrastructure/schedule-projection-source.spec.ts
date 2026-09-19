import { describe, expect, it, vi } from 'vitest';
import { TaskPlanScheduleKind } from '@memoflow/contracts/task';
import { buildSchedulingKey } from '@memoflow/contracts/schedule';
import { createTimeContext } from '@memoflow/time';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { ITaskOccurrenceRepository } from '../domain/repositories/i-task-occurrence-repository';
import type { ITaskPlanRepository } from '../domain/repositories/i-task-plan-repository';
import {
  aLoadedTaskPlan,
  canonicalTaskPlanScheduleForTest,
  aRelativeReminder,
  aTaskOccurrence,
  aTimePointTiming,
  anIdentityId,
} from '../../testing';
import {
  createTaskScheduleProjectionEventHandlers,
  createTaskScheduleProjectionSource,
  TASK_REMINDER_HANDLER_KEY,
  TASK_REMINDER_PAYLOAD_VERSION,
  taskScheduleProjectionEventNames,
} from './schedule-projection-source';

function repos(input: {
  plan: Awaited<ReturnType<typeof aLoadedTaskPlan>> | null;
  occurrences?: Awaited<ReturnType<typeof aTaskOccurrence>>[];
}) {
  const findByIdForIdentity = vi.fn().mockResolvedValue(input.plan);
  const findById = vi.fn();
  return {
    userTimeContextPort: {
      getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
    },
    findById,
    findByIdForIdentity,
    taskPlanRepository: createMockRepo<ITaskPlanRepository>({
      findById,
      findByIdForIdentity,
    }),
    taskOccurrenceRepository: createMockRepo<ITaskOccurrenceRepository>({
      findByPlanId: vi.fn().mockResolvedValue(input.occurrences ?? []),
    }),
  };
}

describe('task schedule projection source -> ScheduledIntent', () => {
  it('fixture D: one-time Task at 14:00 with -30m reminder emits exactly one 13:30 neutral intent', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));

    try {
      const identityId = anIdentityId();
      const instanceDay = new Date('2030-01-10T00:00:00.000Z');
      const timing = aTimePointTiming(14 * 60);
      const plan = aLoadedTaskPlan({
        identityId,
        title: 'Thesis defense',
        schedule: canonicalTaskPlanScheduleForTest(TaskPlanScheduleKind.OneTime, instanceDay, timing, null),
        reminderConfig: aRelativeReminder(30),
      });
      const occurrence = await aTaskOccurrence({
        identityId,
        planId: plan.id,
        occurrenceDate: instanceDay.getTime(),
        timing,
      });
      const dependencies = repos({ plan, occurrences: [occurrence] });
      const source = createTaskScheduleProjectionSource(dependencies);

      const projection = await source.buildPlanProjection(plan.id, String(identityId));

      expect(dependencies.findByIdForIdentity).toHaveBeenCalledWith(
        String(identityId),
        plan.id,
      );
      expect(dependencies.findById).not.toHaveBeenCalled();
      expect(projection.owner).toEqual({
        identityId: String(identityId),
        type: 'task.plan',
        id: plan.id,
      });
      expect(projection.desired).toHaveLength(1);
      expect(projection.desired[0]).toMatchObject({
        handlerKey: TASK_REMINDER_HANDLER_KEY,
        payloadVersion: TASK_REMINDER_PAYLOAD_VERSION,
        runAt: Date.parse('2030-01-10T13:30:00.000Z'),
        payload: {
          planId: plan.id,
          occurrenceId: occurrence.id,
          occurrenceKey: occurrence.occurrenceKey,
          taskTitle: 'Thesis defense',
          reminderType: 'Relative',
          reminderValue: 30,
          reminderUnit: 'Minutes',
          anchorTime: Date.parse('2030-01-10T14:00:00.000Z'),
          reminderTime: Date.parse('2030-01-10T13:30:00.000Z'),
        },
      });
      expect(projection.desired[0]?.schedulingKey).toBe(
        buildSchedulingKey(
          'task.reminder',
          occurrence.occurrenceKey ?? occurrence.id,
          'relative:30:Minutes',
        ),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses canonical wall-clock and calendar-day semantics across spring DST', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-03-01T00:00:00.000Z'));
    try {
      const identityId = anIdentityId();
      const newYorkContext = createTimeContext({
        timeZone: 'America/New_York',
        weekStartsOn: 0,
      });
      // 2030-03-10 is the spring-forward day in New York. Local midnight is
      // 05:00Z, while local 09:00 is 13:00Z after the DST jump.
      const instanceDay = new Date('2030-03-10T05:00:00.000Z');
      const timing = aTimePointTiming(9 * 60);
      const plan = aLoadedTaskPlan({
        identityId,
        title: 'DST-safe task',
        schedule: canonicalTaskPlanScheduleForTest(TaskPlanScheduleKind.OneTime, instanceDay, timing, null, newYorkContext),
        reminderConfig: aRelativeReminder(1, 'Days'),
      });
      const occurrence = await aTaskOccurrence({
        identityId,
        planId: plan.id,
        occurrenceDate: instanceDay.getTime(),
        timing,
        timeContext: newYorkContext,
      });
      const dependencies = repos({ plan, occurrences: [occurrence] });
      dependencies.userTimeContextPort.getUserTimeContext = async () => newYorkContext;
      const source = createTaskScheduleProjectionSource(dependencies);

      const projection = await source.buildPlanProjection(plan.id, String(identityId));

      expect(projection.desired).toHaveLength(1);
      expect(projection.desired[0]).toMatchObject({
        runAt: Date.parse('2030-03-09T14:00:00.000Z'), // 09:00 EST, one calendar day earlier
        payload: {
          anchorTime: Date.parse('2030-03-10T13:00:00.000Z'), // 09:00 EDT
          reminderTime: Date.parse('2030-03-09T14:00:00.000Z'),
        },
      });
      expect(
        projection.desired[0]!.payload.anchorTime - projection.desired[0]!.payload.reminderTime,
      ).toBe(
        23 * 60 * 60 * 1000,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('repeated projection keeps the same owner/key and identical reminder triggers do not duplicate', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    try {
      const identityId = anIdentityId();
      const day = new Date('2030-01-10T00:00:00.000Z');
      const timing = aTimePointTiming(14 * 60);
      const duplicateReminder = aRelativeReminder(30).addRelativeTrigger(30, 'Minutes');
      const plan = aLoadedTaskPlan({
        identityId,
        schedule: canonicalTaskPlanScheduleForTest(TaskPlanScheduleKind.OneTime, day, timing, null),
        reminderConfig: duplicateReminder,
      });
      const occurrence = await aTaskOccurrence({
        identityId,
        planId: plan.id,
        occurrenceDate: day.getTime(),
        timing,
      });
      const source = createTaskScheduleProjectionSource(repos({ plan, occurrences: [occurrence] }));

      const first = await source.buildPlanProjection(plan.id, String(identityId));
      const second = await source.buildPlanProjection(plan.id, String(identityId));

      expect(first.desired).toHaveLength(1);
      expect(second.desired).toHaveLength(1);
      expect(second.owner).toEqual(first.owner);
      expect(second.desired[0]?.schedulingKey).toBe(first.desired[0]?.schedulingKey);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns an empty desired set for a paused plan or a completed occurrence', async () => {
    const identityId = anIdentityId();
    const day = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const timing = aTimePointTiming(14 * 60);
    const plan = aLoadedTaskPlan({
      identityId,
      schedule: canonicalTaskPlanScheduleForTest(TaskPlanScheduleKind.OneTime, day, timing, null),
      reminderConfig: aRelativeReminder(30),
    });
    plan.pause();
    const occurrence = await aTaskOccurrence({
      identityId,
      planId: plan.id,
      occurrenceDate: day.getTime(),
      timing,
    });
    const pausedSource = createTaskScheduleProjectionSource(
      repos({ plan, occurrences: [occurrence] }),
    );
    expect((await pausedSource.buildPlanProjection(plan.id, String(identityId))).desired).toEqual(
      [],
    );

    plan.activate();
    occurrence.complete();
    const completedSource = createTaskScheduleProjectionSource(
      repos({ plan, occurrences: [occurrence] }),
    );
    expect(
      (await completedSource.buildPlanProjection(plan.id, String(identityId))).desired,
    ).toEqual([]);
  });

  it('returns the canonical owner with an empty desired set when the plan is missing', async () => {
    const dependencies = repos({ plan: null });
    const source = createTaskScheduleProjectionSource(dependencies);

    const projection = await source.buildPlanProjection('TaskPlanId_missing', 'identity-1');

    expect(projection).toEqual({
      owner: { identityId: 'identity-1', type: 'task.plan', id: 'TaskPlanId_missing' },
      desired: [],
    });
  });

  it('maps occurrence terminal/reopen events to owner reconcile and plan removal events to removeOwner', async () => {
    const upsertPlan = vi.fn().mockResolvedValue(undefined);
    const deletePlan = vi.fn().mockResolvedValue(undefined);
    const handlers = createTaskScheduleProjectionEventHandlers({ upsertPlan, deletePlan });
    const common = {
      identityId: 'IdentityId_test',
      taskPlanId: 'TaskPlanId_template',
      taskOccurrenceId: 'TaskOccurrenceId_instance',
    };

    expect(taskScheduleProjectionEventNames).toContain('task:occurrence-uncompleted');
    expect(taskScheduleProjectionEventNames).toContain('task:rescheduled');
    await handlers['task:occurrence-completed']({ ...common, completedAt: 1 } as never);
    await handlers['task:occurrence-skipped']({ ...common, skippedAt: 2 } as never);
    await handlers['task:occurrence-deleted']({ ...common, deletedAt: 3 } as never);
    await handlers['task:occurrence-uncompleted']({ ...common, uncompletedAt: 4 } as never);
    await handlers['task:rescheduled']({
      ...common,
      previousDueDate: 10,
      newDueDate: 20,
    } as never);
    await handlers['task:plan-paused']({ ...common, pausedAt: 5 } as never);
    await handlers['task:deleted']({ ...common, deletedAt: 6 } as never);

    expect(upsertPlan).toHaveBeenCalledTimes(5);
    expect(upsertPlan).toHaveBeenCalledWith('TaskPlanId_template', 'IdentityId_test');
    expect(deletePlan).toHaveBeenCalledTimes(2);
    expect(deletePlan).toHaveBeenCalledWith('TaskPlanId_template', 'IdentityId_test');
  });
});
