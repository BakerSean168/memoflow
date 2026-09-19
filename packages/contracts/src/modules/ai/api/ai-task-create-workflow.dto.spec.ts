import { describe, expect, it } from 'vitest';
import { TaskPlanDraftSchema, TaskPlanTaskSchema } from './ai-task-create-workflow.dto';

const baseTask = {
  draftRef: 'task:weekly-report' as const,
  title: 'Prepare weekly report',
  schedule: {
    kind: 'Recurring' as const,
    startDate: '2026-09-01',
    timing: { kind: 'At' as const, time: '09:00' },
    recurrence: {
      frequency: 'Weekly' as const,
      interval: 1,
      byWeekday: [1],
      end: { kind: 'Never' as const },
    },
  },
};

describe('TaskPlanTaskSchema owner-aligned contract', () => {
  it('accepts canonical schedule/reminder fields and rejects the retired AI cadence DSL', () => {
    const parsed = TaskPlanTaskSchema.parse({
      ...baseTask,
      reminderConfig: {
        enabled: true,
        triggers: [
          {
            type: 'Relative',
            absoluteTime: null,
            relativeValue: 15,
            relativeUnit: 'Minutes',
          },
        ],
      },
    });
    expect(parsed.schedule).toEqual(baseTask.schedule);
    expect(
      TaskPlanTaskSchema.safeParse({ ...baseTask, cadence: 'weekly', timeOfDay: '09:00' }).success,
    ).toBe(false);
    expect(TaskPlanTaskSchema.safeParse({ ...baseTask, folderId: 'legacy-folder' }).success).toBe(
      false,
    );
  });

  it('round-trips the owner TaskPlanSchedule without translating through an AI DSL', () => {
    const draft = TaskPlanDraftSchema.parse({
      task: baseTask,
      rationale: '',
      warnings: [],
      revision: 1,
    });

    expect(TaskPlanTaskSchema.parse(draft.task).schedule).toEqual(baseTask.schedule);
    expect(draft.task).not.toHaveProperty('cadence');
    expect(draft.task).not.toHaveProperty('timeOfDay');
    expect(draft.task).not.toHaveProperty('daysOfWeek');
    expect(draft.task).not.toHaveProperty('occurrences');
  });

  it('allows a Goal-only context link and rejects a Key Result without its owning Goal', () => {
    expect(
      TaskPlanTaskSchema.safeParse({
        ...baseTask,
        goalBinding: {
          goalId: 'GoalId_550e8400-e29b-41d4-a716-446655440001',
          keyResultId: null,
          contribution: null,
        },
      }).success,
    ).toBe(true);
    expect(
      TaskPlanTaskSchema.safeParse({
        ...baseTask,
        goalBinding: {
          goalId: '',
          keyResultId: 'KeyResultId_550e8400-e29b-41d4-a716-446655440002',
          contribution: null,
        },
      }).success,
    ).toBe(false);
  });

  it('keeps contribution optional and requires a linked Goal/Key Result when present', () => {
    expect(
      TaskPlanTaskSchema.safeParse({
        ...baseTask,
        goalBinding: {
          goalId: 'GoalId_550e8400-e29b-41d4-a716-446655440001',
          keyResultId: 'KeyResultId_550e8400-e29b-41d4-a716-446655440002',
          contribution: { value: 2, trigger: 'EachCompletion' },
        },
      }).success,
    ).toBe(true);

    expect(
      TaskPlanTaskSchema.safeParse({
        ...baseTask,
        goalBinding: {
          goalId: 'GoalId_550e8400-e29b-41d4-a716-446655440001',
          keyResultId: null,
          contribution: { value: 2, trigger: 'EachCompletion' },
        },
      }).success,
    ).toBe(false);
    expect(
      TaskPlanTaskSchema.safeParse({
        ...baseTask,
        contributionValue: 2,
      }).success,
    ).toBe(false);
    expect(
      TaskPlanTaskSchema.safeParse({
        ...baseTask,
        tags: ['legacy'],
      }).success,
    ).toBe(false);
  });

  it('requires a stable task draftRef for durable apply identity', () => {
    const result = TaskPlanTaskSchema.safeParse({ ...baseTask, draftRef: undefined });
    expect(result.success).toBe(false);
  });
});
