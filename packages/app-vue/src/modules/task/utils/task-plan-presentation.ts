import type { ComposerTranslation } from 'vue-i18n';
import type { TaskPlanClientDTO, TaskPlanSchedule } from '@memoflow/contracts/task';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { TaskPlanScheduleSchema } from '@memoflow/contracts/task';
import type { TaskPlanViewModel } from '../components/types';
import { formatProductDate } from '../../../shared/utils/product-time';

type Translate = ComposerTranslation<Record<string, never>, string>;

const statusMap: Record<string, string> = {
  Active: 'ACTIVE',
  Paused: 'PAUSED',
  Closed: 'CLOSED',
};

const statusLabelKeys: Record<string, string> = {
  ACTIVE: 'task.templateCard.statusActive',
  PAUSED: 'task.templateCard.statusPaused',
  CLOSED: 'task.templateCard.statusArchived',
};

const importanceLabelKeys: Record<string, string> = {
  [ImportanceLevel.Vital]: 'task.metadata.importanceCritical',
  [ImportanceLevel.Important]: 'task.metadata.importanceHigh',
  [ImportanceLevel.Moderate]: 'task.metadata.importanceMedium',
  [ImportanceLevel.Minor]: 'task.metadata.importanceLow',
  [ImportanceLevel.Trivial]: 'task.metadata.importanceMinimal',
};

const instanceStatusLabelKeys: Record<string, string> = {
  Pending: 'task.templateCard.instanceStatusPending',
  InProgress: 'task.templateCard.instanceStatusInProgress',
  Completed: 'task.templateCard.instanceStatusCompleted',
  Skipped: 'task.templateCard.instanceStatusSkipped',
  Missed: 'task.templateCard.instanceStatusMissed',
};

export function getTaskOccurrenceStatusLabel(
  t: Translate,
  status?: TaskPlanViewModel['singleOccurrenceStatus'],
): string {
  const statusKey = status ? instanceStatusLabelKeys[status] : undefined;
  return t(statusKey ?? 'task.templateCard.instanceStatusNotGenerated');
}

function scheduleDate(schedule: TaskPlanSchedule): string {
  return schedule.kind === 'OneTime' ? String(schedule.date) : String(schedule.startDate);
}

/** Canonical form boundary: TaskPlanViewModel.schedule is the only schedule truth. */
export function toTaskPlanSchedulePayload(vm: TaskPlanViewModel): TaskPlanSchedule {
  return TaskPlanScheduleSchema.parse(vm.schedule);
}

export function getTaskPlanScheduleTimeDisplay(
  t: Translate,
  schedule?: TaskPlanSchedule | null,
): string {
  if (!schedule) return t('common.none');
  const timing = schedule.timing;
  if (timing.kind === 'AllDay') return t('task.timeConfig.allDay');
  if (timing.kind === 'At') return timing.time;
  return `${timing.start} - ${timing.end}`;
}

export function getTaskPlanScheduleDate(schedule: TaskPlanSchedule): string {
  return scheduleDate(schedule);
}

export function getTaskRecurrenceText(t: Translate, dto: TaskPlanClientDTO): string {
  if (dto.schedule.kind !== 'Recurring') return t('task.templateCard.noRecurrence');
  const recurrence = dto.schedule.recurrence;
  const interval = Math.max(1, recurrence.interval ?? 1);
  switch (recurrence.frequency) {
    case 'Daily':
      return t('task.recurrence.description', {
        interval,
        unit: t('task.recurrence.intervalHintDay'),
      });
    case 'Weekly':
      return t('task.recurrence.description', {
        interval,
        unit: t('task.recurrence.intervalHintWeek'),
      });
    case 'Monthly':
      return t('task.recurrence.description', {
        interval,
        unit: t('task.recurrence.intervalHintMonth'),
      });
    case 'Yearly':
      return t('task.recurrence.description', {
        interval,
        unit: t('task.recurrence.intervalHintYear'),
      });
    default:
      return t('task.templateCard.noRecurrence');
  }
}

export function mapTaskPlanDtoToViewModel(dto: TaskPlanClientDTO, t: Translate): TaskPlanViewModel {
  const status = statusMap[dto.status] ?? dto.status;
  return {
    id: dto.id,
    title: dto.name,
    description: dto.description ?? undefined,
    status,
    statusText: t(statusLabelKeys[status] ?? 'common.unknown'),
    isActive: status === 'ACTIVE',
    isPaused: status === 'PAUSED',
    isArchived: dto.archivedAt !== null,
    importance: dto.importance,
    importanceText: t(importanceLabelKeys[dto.importance] ?? 'common.unknown'),
    recurrenceText: getTaskRecurrenceText(t, dto),
    labels: dto.labels ?? [],
    labelIds: (dto.labels ?? []).map((label) => label.id),
    checklist: dto.checklist.map((item) => ({ ...item })),
    goalBinding: dto.goalBinding
      ? {
          goalId: dto.goalBinding.goalId,
          keyResultId: dto.goalBinding.keyResultId,
          contribution: dto.goalBinding.contribution
            ? {
                value: dto.goalBinding.contribution.value,
                trigger: dto.goalBinding.contribution.trigger,
              }
            : undefined,
        }
      : null,
    // TanStack Vue Query exposes cached DTOs through reactive proxies. Parse at the
    // presentation boundary to validate the canonical schedule and materialize plain data;
    // native structuredClone cannot clone Vue Proxy objects.
    schedule: TaskPlanScheduleSchema.parse(dto.schedule),
    reminderConfig: (dto.reminderConfig as unknown as Record<string, unknown>) ?? null,
    occurrenceCount: dto.occurrenceCount ?? 0,
    completedOccurrenceCount: dto.completedOccurrenceCount ?? 0,
    pendingOccurrenceCount: dto.pendingOccurrenceCount ?? 0,
    dueOccurrenceCount: dto.dueOccurrenceCount ?? 0,
    completedDueOccurrenceCount: dto.completedDueOccurrenceCount ?? 0,
    completionWindowDays: dto.completionWindowDays ?? 30,
    futurePendingOccurrenceCount: dto.futurePendingOccurrenceCount ?? 0,
    singleOccurrenceStatus: dto.singleOccurrenceStatus ?? null,
    completionRate: dto.completionRate ?? 0,
    formattedCreatedAt: dto.createdAt ? formatProductDate(dto.createdAt) : undefined,
  };
}
