import { describe, expect, it, vi } from 'vitest';
import { TaskType } from '@memoflow/contracts/task';
import { buildSchedulingKey } from '@memoflow/contracts/schedule';
import { createTimeContext } from '@memoflow/time';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { ITaskOccurrenceRepository } from '../domain/repositories/i-task-occurrence-repository';
import type { ITaskPlanRepository } from '../domain/repositories/i-task-plan-repository';
import {
  aLoadedTaskPlan,
  aRelativeReminder,
  aTaskOccurrence,
  aTimePointConfig,
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
  template: Awaited<ReturnType<typeof aLoadedTaskPlan>> | null;
  instances?: Awaited<ReturnType<typeof aTaskOccurrence>>[];
}) {
  const findByIdForIdentity = vi.fn().mockResolvedValue(input.template);
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
      findByTemplateId: vi.fn().mockResolvedValue(input.instances ?? []),
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
      const timeConfig = aTimePointConfig(14 * 60, instanceDay);
      const template = aLoadedTaskPlan({
        identityId,
        title: 'Thesis defense',
        taskType: TaskType.OneTime,
        timeConfig,
        reminderConfig: aRelativeReminder(30),
      });
      const instance = await aTaskOccurrence({
        identityId,
        templateId: template.id,
        instanceDate: instanceDay.getTime(),
        timeConfig,
      });
      const dependencies = repos({ template, instances: [instance] });
      const source = createTaskScheduleProjectionSource(dependencies);

      const plan = await source.buildTemplatePlan(template.id, String(identityId));

      expect(dependencies.findByIdForIdentity).toHaveBeenCalledWith(
        String(identityId),
        template.id,
      );
      expect(dependencies.findById).not.toHaveBeenCalled();
      expect(plan.owner).toEqual({
        identityId: String(identityId),
        type: 'task.template',
        id: template.id,
      });
      expect(plan.desired).toHaveLength(1);
      expect(plan.desired[0]).toMatchObject({
        handlerKey: TASK_REMINDER_HANDLER_KEY,
        payloadVersion: TASK_REMINDER_PAYLOAD_VERSION,
        runAt: Date.parse('2030-01-10T13:30:00.000Z'),
        payload: {
          templateId: template.id,
          instanceId: instance.id,
          occurrenceKey: instance.occurrenceKey,
          taskTitle: 'Thesis defense',
          reminderType: 'Relative',
          reminderValue: 30,
          reminderUnit: 'Minutes',
          anchorTime: Date.parse('2030-01-10T14:00:00.000Z'),
          reminderTime: Date.parse('2030-01-10T13:30:00.000Z'),
        },
      });
      expect(plan.desired[0]?.schedulingKey).toBe(
        buildSchedulingKey(
          'task.reminder',
          instance.occurrenceKey ?? instance.id,
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
      const timeConfig = aTimePointConfig(9 * 60, instanceDay);
      const template = aLoadedTaskPlan({
        identityId,
        title: 'DST-safe task',
        taskType: TaskType.OneTime,
        timeConfig,
        reminderConfig: aRelativeReminder(1, 'Days'),
      });
      const instance = await aTaskOccurrence({
        identityId,
        templateId: template.id,
        instanceDate: instanceDay.getTime(),
        timeConfig,
        timeContext: newYorkContext,
      });
      const dependencies = repos({ template, instances: [instance] });
      dependencies.userTimeContextPort.getUserTimeContext = async () => newYorkContext;
      const source = createTaskScheduleProjectionSource(dependencies);

      const plan = await source.buildTemplatePlan(template.id, String(identityId));

      expect(plan.desired).toHaveLength(1);
      expect(plan.desired[0]).toMatchObject({
        runAt: Date.parse('2030-03-09T14:00:00.000Z'), // 09:00 EST, one calendar day earlier
        payload: {
          anchorTime: Date.parse('2030-03-10T13:00:00.000Z'), // 09:00 EDT
          reminderTime: Date.parse('2030-03-09T14:00:00.000Z'),
        },
      });
      expect(
        plan.desired[0]!.payload.anchorTime - plan.desired[0]!.payload.reminderTime,
      ).toBe(23 * 60 * 60 * 1000);
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
      const timeConfig = aTimePointConfig(14 * 60, day);
      const duplicateReminder = aRelativeReminder(30).addRelativeTrigger(30, 'Minutes');
      const template = aLoadedTaskPlan({
        identityId,
        taskType: TaskType.OneTime,
        timeConfig,
        reminderConfig: duplicateReminder,
      });
      const instance = await aTaskOccurrence({
        identityId,
        templateId: template.id,
        instanceDate: day.getTime(),
        timeConfig,
      });
      const source = createTaskScheduleProjectionSource(repos({ template, instances: [instance] }));

      const first = await source.buildTemplatePlan(template.id, String(identityId));
      const second = await source.buildTemplatePlan(template.id, String(identityId));

      expect(first.desired).toHaveLength(1);
      expect(second.desired).toHaveLength(1);
      expect(second.owner).toEqual(first.owner);
      expect(second.desired[0]?.schedulingKey).toBe(first.desired[0]?.schedulingKey);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns an empty desired set for a paused template or a completed occurrence', async () => {
    const identityId = anIdentityId();
    const day = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const timeConfig = aTimePointConfig(14 * 60, day);
    const template = aLoadedTaskPlan({
      identityId,
      taskType: TaskType.OneTime,
      timeConfig,
      reminderConfig: aRelativeReminder(30),
    });
    template.pause();
    const instance = await aTaskOccurrence({
      identityId,
      templateId: template.id,
      instanceDate: day.getTime(),
      timeConfig,
    });
    const pausedSource = createTaskScheduleProjectionSource(
      repos({ template, instances: [instance] }),
    );
    expect((await pausedSource.buildTemplatePlan(template.id, String(identityId))).desired).toEqual(
      [],
    );

    template.activate();
    instance.complete();
    const completedSource = createTaskScheduleProjectionSource(
      repos({ template, instances: [instance] }),
    );
    expect(
      (await completedSource.buildTemplatePlan(template.id, String(identityId))).desired,
    ).toEqual([]);
  });

  it('returns the canonical owner with an empty desired set when the template is missing', async () => {
    const dependencies = repos({ template: null });
    const source = createTaskScheduleProjectionSource(dependencies);

    const plan = await source.buildTemplatePlan('TaskPlanId_missing', 'identity-1');

    expect(plan).toEqual({
      owner: { identityId: 'identity-1', type: 'task.template', id: 'TaskPlanId_missing' },
      desired: [],
    });
  });

  it('maps occurrence terminal/reopen events to owner reconcile and template removal events to removeOwner', async () => {
    const upsertTemplate = vi.fn().mockResolvedValue(undefined);
    const deleteTemplate = vi.fn().mockResolvedValue(undefined);
    const handlers = createTaskScheduleProjectionEventHandlers({ upsertTemplate, deleteTemplate });
    const common = {
      identityId: 'IdentityId_test',
      taskPlanId: 'TaskPlanId_template',
      taskOccurrenceId: 'TaskOccurrenceId_instance',
    };

    expect(taskScheduleProjectionEventNames).toContain('task:instance-uncompleted');
    expect(taskScheduleProjectionEventNames).toContain('task:rescheduled');
    await handlers['task:instance-completed']({ ...common, completedAt: 1 } as never);
    await handlers['task:instance-skipped']({ ...common, skippedAt: 2 } as never);
    await handlers['task:instance-deleted']({ ...common, deletedAt: 3 } as never);
    await handlers['task:instance-uncompleted']({ ...common, uncompletedAt: 4 } as never);
    await handlers['task:rescheduled']({
      ...common,
      previousDueDate: 10,
      newDueDate: 20,
    } as never);
    await handlers['task:template-paused']({ ...common, pausedAt: 5 } as never);
    await handlers['task:deleted']({ ...common, deletedAt: 6 } as never);

    expect(upsertTemplate).toHaveBeenCalledTimes(5);
    expect(upsertTemplate).toHaveBeenCalledWith('TaskPlanId_template', 'IdentityId_test');
    expect(deleteTemplate).toHaveBeenCalledTimes(2);
    expect(deleteTemplate).toHaveBeenCalledWith('TaskPlanId_template', 'IdentityId_test');
  });
});
