import type { ComposerTranslation } from 'vue-i18n';
import type {
  TaskPlanClientDTO,
  TaskPlanSchedule,
  TaskTimeConfigDTO,
  TaskTimeConfigReq,
} from '@memoflow/contracts/task';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { TaskPlanScheduleSchema } from '@memoflow/contracts/task';
import type { TaskPlanViewModel, TaskTimeConfigViewModel } from '../components/types';
import { formatHHmmParts } from '../../../shared/utils/format-hhmm-parts';
import { formatProductDate, getProductTime } from '../../../shared/utils/product-time';

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

/** Residual 1297: HH:mm pad dual retired onto formatHHmmParts; null/clamp stay local. */
function formatMinuteOfDay(minutes?: number | null): string {
  if (minutes == null || !Number.isFinite(minutes)) return '-';
  const safe = Math.max(0, Math.min(1439, minutes));
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  return formatHHmmParts(hour, minute);
}

type TaskTimeDisplayInput =
  | {
      timeType?: TaskTimeConfigDTO['timeType'] | string;
      timePoint?: number | null;
      timeRange?: { start: number; end: number } | null;
    }
  | null
  | undefined;

type TaskTimePayloadInput =
  | Pick<TaskTimeConfigViewModel, 'timeType' | 'timePoint' | 'timeRange' | 'startDate'>
  | null
  | undefined;

export function getTaskTimeTypeLabel(t: Translate, type?: string | null): string {
  switch (type) {
    case 'AllDay':
      return t('task.timeConfig.allDay');
    case 'TimePoint':
      return t('task.timeConfig.timePoint');
    case 'TimeRange':
      return t('task.timeConfig.timeRange');
    default:
      return t('common.none');
  }
}

export function getTaskOccurrenceStatusLabel(
  t: Translate,
  status?: TaskPlanViewModel['singleInstanceStatus'],
): string {
  const statusKey = status ? instanceStatusLabelKeys[status] : undefined;
  return t(statusKey ?? 'task.templateCard.instanceStatusNotGenerated');
}

export function getTaskTimeValueDisplay(t: Translate, timeConfig?: TaskTimeDisplayInput): string {
  if (!timeConfig) return t('common.none');
  if (timeConfig.timeType === 'AllDay') return t('task.timeConfig.allDay');
  if (timeConfig.timeType === 'TimePoint') return formatMinuteOfDay(timeConfig.timePoint);
  if (timeConfig.timeType === 'TimeRange' && timeConfig.timeRange) {
    return `${formatMinuteOfDay(timeConfig.timeRange.start)} - ${formatMinuteOfDay(timeConfig.timeRange.end)}`;
  }
  return t('common.none');
}

export function toTaskTimeConfigPayload(timeConfig?: TaskTimePayloadInput): TaskTimeConfigReq {
  const timeType = timeConfig?.timeType ?? 'AllDay';
  const startDate = timeConfig?.startDate;

  return {
    timeType,
    startDate:
      startDate instanceof Date
        ? startDate.getTime()
        : typeof startDate === 'number'
          ? startDate
          : null,
    timePoint: timeType === 'TimePoint' ? (timeConfig?.timePoint ?? null) : null,
    timeRange: timeType === 'TimeRange' ? (timeConfig?.timeRange ?? null) : null,
  };
}

function hmToMinuteOfDay(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function minuteOfDayToHm(value: number): string {
  const safe = Math.max(0, Math.min(1439, value));
  return formatHHmmParts(Math.floor(safe / 60), safe % 60);
}

function scheduleDate(schedule: TaskPlanSchedule): string {
  return schedule.kind === 'OneTime' ? schedule.date : schedule.startDate;
}

function scheduleToTimeConfigProjection(schedule: TaskPlanSchedule): TaskTimeConfigViewModel {
  const timing = schedule.timing;
  return {
    startDate: scheduleDate(schedule),
    timeType:
      timing.kind === 'AllDay' ? 'AllDay' : timing.kind === 'At' ? 'TimePoint' : 'TimeRange',
    timePoint: timing.kind === 'At' ? hmToMinuteOfDay(timing.time) : null,
    timeRange:
      timing.kind === 'Window'
        ? { start: hmToMinuteOfDay(timing.start), end: hmToMinuteOfDay(timing.end) }
        : null,
  };
}

function scheduleToRecurrenceProjection(
  schedule: TaskPlanSchedule,
): Record<string, unknown> | null {
  if (schedule.kind !== 'Recurring') return null;
  const end = schedule.recurrence.end;
  return {
    frequency: schedule.recurrence.frequency,
    interval: schedule.recurrence.interval,
    daysOfWeek: [...schedule.recurrence.byWeekday],
    endDate: end.kind === 'Until' ? getProductTime().codec.startOfYmd(end.date) : null,
    occurrences: end.kind === 'Count' ? end.count : null,
  };
}

function inputDateToYmd(value: TaskTimeConfigViewModel['startDate']): string {
  if (typeof value === 'string') {
    const parsed = getProductTime().input.parseDateValue(value);
    if (parsed) return parsed;
  }
  const epoch =
    value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.now();
  return getProductTime().input.dateValue(epoch);
}

/** Temporary adapter for the existing form. Transport receives only canonical schedule. */
export function toTaskPlanSchedulePayload(vm: TaskPlanViewModel): TaskPlanSchedule {
  const date = inputDateToYmd(vm.timeConfig.startDate);
  const timeType = vm.timeConfig.timeType ?? 'AllDay';
  const timing =
    timeType === 'TimePoint'
      ? { kind: 'At' as const, time: minuteOfDayToHm(vm.timeConfig.timePoint ?? 0) }
      : timeType === 'TimeRange' && vm.timeConfig.timeRange
        ? {
            kind: 'Window' as const,
            start: minuteOfDayToHm(vm.timeConfig.timeRange.start),
            end: minuteOfDayToHm(vm.timeConfig.timeRange.end),
          }
        : { kind: 'AllDay' as const };
  const rule = vm.recurrenceRule as
    | {
        frequency?: 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';
        interval?: number;
        daysOfWeek?: number[];
        endDate?: number | null;
        occurrences?: number | null;
      }
    | null
    | undefined;
  if (!rule) {
    return TaskPlanScheduleSchema.parse({ kind: 'OneTime', date, timing });
  }
  const end =
    rule.occurrences != null
      ? { kind: 'Count' as const, count: rule.occurrences }
      : rule.endDate != null
        ? { kind: 'Until' as const, date: getProductTime().input.dateValue(rule.endDate) }
        : { kind: 'Never' as const };
  return TaskPlanScheduleSchema.parse({
    kind: 'Recurring',
    startDate: date,
    timing,
    recurrence: {
      frequency: rule.frequency ?? 'Daily',
      interval: rule.interval ?? 1,
      byWeekday: rule.frequency === 'Weekly' ? (rule.daysOfWeek ?? []) : [],
      end,
    },
  });
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
    timeConfig: scheduleToTimeConfigProjection(dto.schedule),
    reminderConfig: (dto.reminderConfig as unknown as Record<string, unknown>) ?? null,
    recurrenceRule: scheduleToRecurrenceProjection(dto.schedule),
    instanceCount: dto.instanceCount ?? 0,
    completedInstanceCount: dto.completedInstanceCount ?? 0,
    pendingInstanceCount: dto.pendingInstanceCount ?? 0,
    dueInstanceCount: dto.dueInstanceCount ?? 0,
    completedDueInstanceCount: dto.completedDueInstanceCount ?? 0,
    completionWindowDays: dto.completionWindowDays ?? 30,
    futurePendingInstanceCount: dto.futurePendingInstanceCount ?? 0,
    singleInstanceStatus: dto.singleInstanceStatus ?? null,
    completionRate: dto.completionRate ?? 0,
    formattedCreatedAt: dto.createdAt ? formatProductDate(dto.createdAt) : undefined,
    taskType: dto.schedule.kind,
  };
}
