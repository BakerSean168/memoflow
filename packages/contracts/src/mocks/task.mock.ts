/** Task module mock factories. Keep these structurally typed so contract drift fails compilation. */
import { faker } from '@faker-js/faker';
import type { TaskPlanClientDTO } from '../modules/task/aggregates/task-plan-client';
import type { TaskOccurrenceClientDTO } from '../modules/task/aggregates/task-occurrence-client';
import type { TaskPlanId, TaskOccurrenceId, IdentityId } from '../primitives';

export function createMockTaskPlan(overrides: Partial<TaskPlanClientDTO> = {}): TaskPlanClientDTO {
  const now = Date.now();
  const startDate = faker.date.recent({ days: 30 }).getTime();
  const status = faker.helpers.arrayElement(['Active', 'Paused', 'Closed'] as const);
  const outcome =
    status === 'Closed'
      ? faker.helpers.arrayElement(['Succeeded', 'Failed', 'Abandoned'] as const)
      : ('Open' as const);

  return {
    id: faker.string.uuid() as TaskPlanId,
    identityId: faker.string.uuid() as IdentityId,
    name: faker.lorem.words({ min: 2, max: 5 }),
    description: faker.datatype.boolean() ? faker.lorem.sentence() : null,
    timeConfig: {
      timeType: 'AllDay',
      startDate,
      timePoint: null,
      timeRange: null,
    },
    recurrenceRule: null,
    reminderConfig: null,
    importance: faker.helpers.arrayElement([
      'Vital',
      'Important',
      'Moderate',
      'Minor',
      'Trivial',
    ] as const),
    goalBinding: null,
    labels: [],
    status,
    outcome,
    completionPolicy: 'AllowCorrection',
    closedAt: status === 'Closed' ? now : null,
    archivedAt: null,
    abandonedReason: outcome === 'Abandoned' ? 'Mock abandoned task plan' : null,
    lastGeneratedDate: null,
    generateAheadDays: null,
    version: 1,
    createdAt: now - faker.number.int({ min: 0, max: 30 * 24 * 60 * 60 * 1000 }),
    updatedAt: now,
    deletedAt: null,
    instanceCount: faker.number.int({ min: 0, max: 10 }),
    completedInstanceCount: faker.number.int({ min: 0, max: 5 }),
    pendingInstanceCount: faker.number.int({ min: 0, max: 5 }),
    completionRate: faker.number.float({ min: 0, max: 100, fractionDigits: 1 }),
    dueInstanceCount: 0,
    completedDueInstanceCount: 0,
    completionWindowDays: 30,
    futurePendingInstanceCount: 0,
    singleInstanceStatus: null,
    ...overrides,
  };
}

export function createMockTaskPlanList(
  count = 5,
  overrides: Partial<TaskPlanClientDTO> = {},
): TaskPlanClientDTO[] {
  return Array.from({ length: count }, () => createMockTaskPlan(overrides));
}

export function createMockTaskOccurrence(
  overrides: Partial<TaskOccurrenceClientDTO> = {},
): TaskOccurrenceClientDTO {
  const now = Date.now();
  const instanceDate = faker.date.soon({ days: 7 }).getTime();
  const status = faker.helpers.arrayElement([
    'Pending',
    'InProgress',
    'Completed',
    'Missed',
    'Skipped',
  ] as const);

  return {
    id: faker.string.uuid() as TaskOccurrenceId,
    templateId: faker.string.uuid() as TaskPlanId,
    identityId: faker.string.uuid() as IdentityId,
    instanceDate,
    timeConfig: {
      timeType: 'AllDay',
      startDate: instanceDate,
      timePoint: null,
      timeRange: null,
    },
    importance: faker.helpers.arrayElement([
      'Vital',
      'Important',
      'Moderate',
      'Minor',
      'Trivial',
    ] as const),
    status,
    isOverdue: false,
    actualStartTime: null,
    actualEndTime: null,
    version: 1,
    createdAt: now - faker.number.int({ min: 0, max: 7 * 24 * 60 * 60 * 1000 }),
    updatedAt: now,
    deletedAt: null,
    ...overrides,
    comment: overrides.comment ?? null,
  };
}

export function createMockTaskOccurrenceList(
  count = 5,
  overrides: Partial<TaskOccurrenceClientDTO> = {},
): TaskOccurrenceClientDTO[] {
  return Array.from({ length: count }, () => createMockTaskOccurrence(overrides));
}
