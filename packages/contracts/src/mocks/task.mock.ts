/** Task module mock factories. Keep these structurally typed so contract drift fails compilation. */
import { faker } from '@faker-js/faker';
import type { TaskTemplateClientDTO } from '../modules/task/aggregates/task-template-client';
import type { TaskInstanceClientDTO } from '../modules/task/aggregates/task-instance-client';
import type { TaskTemplateId, TaskInstanceId, IdentityId } from '../primitives';

export function createMockTaskTemplate(
  overrides: Partial<TaskTemplateClientDTO> = {},
): TaskTemplateClientDTO {
  const now = Date.now();
  const startDate = faker.date.recent({ days: 30 }).getTime();
  const status = faker.helpers.arrayElement(['Active', 'Paused', 'Closed'] as const);
  const outcome =
    status === 'Closed'
      ? faker.helpers.arrayElement(['Succeeded', 'Failed', 'Abandoned'] as const)
      : ('Open' as const);

  return {
    id: faker.string.uuid() as TaskTemplateId,
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
    startDate,
    dueDate: faker.datatype.boolean() ? faker.date.soon({ days: 14 }).getTime() : null,
    completedAt: outcome === 'Succeeded' ? now : null,
    estimatedMinutes: faker.datatype.boolean()
      ? faker.helpers.arrayElement([15, 30, 45, 60, 90, 120])
      : null,
    actualMinutes: null,
    comment: null,
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

export function createMockTaskTemplateList(
  count = 5,
  overrides: Partial<TaskTemplateClientDTO> = {},
): TaskTemplateClientDTO[] {
  return Array.from({ length: count }, () => createMockTaskTemplate(overrides));
}

export function createMockTaskInstance(
  overrides: Partial<TaskInstanceClientDTO> = {},
): TaskInstanceClientDTO {
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
    id: faker.string.uuid() as TaskInstanceId,
    templateId: faker.string.uuid() as TaskTemplateId,
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
    comment: null,
    version: 1,
    createdAt: now - faker.number.int({ min: 0, max: 7 * 24 * 60 * 60 * 1000 }),
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

export function createMockTaskInstanceList(
  count = 5,
  overrides: Partial<TaskInstanceClientDTO> = {},
): TaskInstanceClientDTO[] {
  return Array.from({ length: count }, () => createMockTaskInstance(overrides));
}
