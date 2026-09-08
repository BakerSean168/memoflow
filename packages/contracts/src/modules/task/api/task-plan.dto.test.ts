import { describe, expect, it } from 'vitest';
import {
  CreateTaskPlanSchema,
  TaskTimeConfigSchema,
  UpdateTaskPlanSchema,
} from './task-plan.dto';
import { CreateTaskPlanResponseSchema, TaskPlanResponseSchema } from './response-schemas';
import { ImportanceLevel } from '../../../shared/value-objects/importance';
import { TaskPlanStatus } from '../value-objects/task-plan-status';
import { TaskPlanOutcome } from '../value-objects/task-plan-outcome';
import { TaskPlanCompletionPolicy } from '../value-objects/task-plan-completion-policy';
import { TaskTimeType } from '../value-objects/task-time-type';
import { TaskType } from '../value-objects/task-type';

const uuid = '550e8400-e29b-41d4-a716-446655440000';

function validTimeConfig() {
  return {
    timeType: TaskTimeType.AllDay,
    startDate: null,
    timePoint: null,
    timeRange: null,
  };
}

function validCreatePayload() {
  return {
    name: 'Review plan',
    description: null,
    taskType: TaskType.OneTime,
    timeConfig: validTimeConfig(),
    recurrenceRule: null,
    reminderConfig: null,
    importance: ImportanceLevel.Moderate,
    labelIds: ['label-planning'],
    goalBinding: null,
  };
}

function validTemplateResponse() {
  return {
    id: `ITaskPlanId_${uuid}`,
    identityId: `IdentityId_${uuid}`,
    name: 'Review plan',
    description: null,
    timeConfig: validTimeConfig(),
    recurrenceRule: null,
    reminderConfig: null,
    importance: ImportanceLevel.Moderate,
    goalBinding: null,
    labels: [{ id: 'label-planning', name: 'Planning', color: null, createdAt: 1, updatedAt: 1 }],
    status: TaskPlanStatus.Active,
    outcome: TaskPlanOutcome.Open,
    completionPolicy: TaskPlanCompletionPolicy.AllowCorrection,
    closedAt: null,
    archivedAt: null,
    abandonedReason: null,
    lastGeneratedDate: null,
    generateAheadDays: null,
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    estimatedMinutes: null,
    actualMinutes: null,
    comment: null,
    instanceCount: 0,
    completedInstanceCount: 0,
    pendingInstanceCount: 0,
    dueInstanceCount: 0,
    completedDueInstanceCount: 0,
    completionWindowDays: 30,
    futurePendingInstanceCount: 0,
    singleInstanceStatus: null,
    completionRate: 0,
  };
}

describe('task template contracts', () => {
  it('accepts a valid create payload', () => {
    expect(CreateTaskPlanSchema.safeParse(validCreatePayload()).success).toBe(true);
  });

  it('rejects retired Task string tags and custom color in favor of Shared Label IDs', () => {
    expect(CreateTaskPlanSchema.safeParse({ ...validCreatePayload(), tags: ['legacy'] }).success).toBe(false);
    expect(CreateTaskPlanSchema.safeParse({ ...validCreatePayload(), color: '#ff0000' }).success).toBe(false);
    expect(UpdateTaskPlanSchema.safeParse({ tags: ['legacy'] }).success).toBe(false);
    expect(UpdateTaskPlanSchema.safeParse({ color: '#ff0000' }).success).toBe(false);
  });

  it('rejects unknown create and update properties', () => {
    expect(
      CreateTaskPlanSchema.safeParse({
        ...validCreatePayload(),
        unexpected: true,
      }).success,
    ).toBe(false);

    expect(
      UpdateTaskPlanSchema.safeParse({
        name: 'Updated',
        unexpected: true,
      }).success,
    ).toBe(false);
  });

  it('rejects invalid task response enum fields', () => {
    expect(TaskPlanResponseSchema.safeParse(validTemplateResponse()).success).toBe(true);

    expect(
      TaskPlanResponseSchema.safeParse({
        ...validTemplateResponse(),
        importance: 'VeryImportant',
      }).success,
    ).toBe(false);

    expect(
      TaskPlanResponseSchema.safeParse({
        ...validTemplateResponse(),
        status: 'Done',
      }).success,
    ).toBe(false);
  });

  it('preserves template creation instance feedback', () => {
    const parsed = CreateTaskPlanResponseSchema.parse({
      template: validTemplateResponse(),
      instanceCount: 7,
      todayInstanceCreated: true,
    });

    expect(parsed.instanceCount).toBe(7);
    expect(parsed.todayInstanceCreated).toBe(true);
  });

  it('keeps time config validation intact', () => {
    expect(
      TaskTimeConfigSchema.safeParse({
        timeType: TaskTimeType.TimeRange,
        startDate: null,
        timePoint: null,
        timeRange: { start: 10, end: 5 },
      }).success,
    ).toBe(false);
  });
});
