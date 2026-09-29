import { TaskHmSchema, TaskYmdSchema } from '@memoflow/contracts/task';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/contracts/task';
const day = new Date(2026, 7, 28).getTime();

export function instance(
  overrides: Partial<TaskOccurrenceClientDTO> = {},
): TaskOccurrenceClientDTO {
  const status = overrides.status ?? 'Pending';
  const defaultResult =
    status === 'Completed'
      ? {
          kind: 'Completed' as const,
          recordedAt: day + 10 * 60 * 60_000,
          actualDurationMinutes: null,
          note: null,
          rating: null,
        }
      : status === 'Missed'
        ? { kind: 'Missed' as const, recordedAt: day + 10 * 60 * 60_000, reason: null }
        : status === 'Skipped'
          ? { kind: 'Skipped' as const, recordedAt: day + 10 * 60 * 60_000, reason: null }
          : null;
  return {
    id: 'occurrence-1' as TaskOccurrenceClientDTO['id'],
    planId: 'plan-1' as TaskOccurrenceClientDTO['planId'],
    identityId: 'identity-1' as TaskOccurrenceClientDTO['identityId'],
    occurrenceKey: 'plan-1:2026-08-28',
    scheduleSnapshot: {
      date: TaskYmdSchema.parse('2026-08-28'),
      timing: { kind: 'At', time: TaskHmSchema.parse('09:00') },
    },
    importanceSnapshot: 'Moderate',
    status,
    actualStartAt: null,
    result: defaultResult,
    checklistState: [],
    dueAt: day + 9 * 60 * 60_000,
    isOverdue: false,
    version: 1,
    createdAt: day,
    updatedAt: day,
    deletedAt: null,
    ...overrides,
  };
}

export const template: TaskPlanClientDTO = {
  id: instance().planId,
  identityId: instance().identityId,
  name: 'Morning review',
  description: null,
  status: 'Active',
  outcome: 'Open',
  completionPolicy: 'AllowCorrection',
  closedAt: null,
  archivedAt: null,
  abandonedReason: null,
  version: 1,
  createdAt: day,
  updatedAt: day,
  deletedAt: null,
  schedule: {
    kind: 'OneTime',
    date: TaskYmdSchema.parse('2026-08-28'),
    timing: { kind: 'At', time: TaskHmSchema.parse('09:00') },
  },
  importance: 'Moderate',
  reminderConfig: null,
  checklist: [],
  labels: [],
  goalBinding: null,
  occurrenceCount: 1,
  completedOccurrenceCount: 0,
  pendingOccurrenceCount: 1,
  dueOccurrenceCount: 1,
  completedDueOccurrenceCount: 0,
  completionWindowDays: 30,
  futurePendingOccurrenceCount: 0,
  singleOccurrenceStatus: 'Pending',
  completionRate: 0,
};
