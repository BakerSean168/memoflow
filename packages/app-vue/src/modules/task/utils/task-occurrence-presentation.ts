import type { ComposerTranslation } from 'vue-i18n';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/contracts/task';
import {
  endOfDayMs,
  formatProductDate,
  formatProductHm,
  isTodayMs,
  startOfDayMs,
} from '../../../shared/utils/product-time';

export type TaskOccurrenceSurface = 'today' | 'upcoming';
export type TaskOccurrenceSort = 'time' | 'status' | 'title';

const OPEN_STATUSES = new Set<TaskOccurrenceClientDTO['status']>(['Pending', 'InProgress']);
const STATUS_ORDER: Readonly<Record<TaskOccurrenceClientDTO['status'], number>> = {
  InProgress: 0,
  Pending: 1,
  Missed: 2,
  Skipped: 3,
  Completed: 4,
};

export function getTaskOccurrenceDueAt(instance: TaskOccurrenceClientDTO): number {
  const dayStart = startOfDayMs(instance.instanceDate);
  const time = instance.timeConfig;
  if (time.timeType === 'TimePoint' && typeof time.timePoint === 'number') {
    return dayStart + time.timePoint * 60_000;
  }
  if (time.timeType === 'TimeRange' && time.timeRange) {
    return dayStart + time.timeRange.end * 60_000;
  }
  return endOfDayMs(dayStart);
}

export function isTaskOccurrenceOverdue(
  instance: TaskOccurrenceClientDTO,
  now = Date.now(),
): boolean {
  return (
    OPEN_STATUSES.has(instance.status) &&
    (instance.isOverdue || getTaskOccurrenceDueAt(instance) < now)
  );
}

export function isTaskOccurrenceOnSurface(
  instance: TaskOccurrenceClientDTO,
  surface: TaskOccurrenceSurface,
  now = Date.now(),
): boolean {
  if (surface === 'upcoming') {
    return instance.instanceDate > endOfDayMs(now);
  }
  return isTodayMs(instance.instanceDate) || isTaskOccurrenceOverdue(instance, now);
}

export function getTaskOccurrenceStatusLabel(
  t: ComposerTranslation,
  instance: TaskOccurrenceClientDTO,
  now = Date.now(),
): string {
  if (isTaskOccurrenceOverdue(instance, now)) {
    return t('task.occurrence.status.overdue');
  }
  return t(`task.occurrence.status.${instance.status.toLowerCase()}`);
}

export function getTaskOccurrenceScheduleLabel(
  t: ComposerTranslation,
  instance: TaskOccurrenceClientDTO,
): string {
  const date = formatProductDate(instance.instanceDate);
  const time = instance.timeConfig;
  if (time.timeType === 'TimePoint' && typeof time.timePoint === 'number') {
    return t('task.occurrence.scheduleAt', {
      date,
      time: formatProductHm(startOfDayMs(instance.instanceDate) + time.timePoint * 60_000),
    });
  }
  if (time.timeType === 'TimeRange' && time.timeRange) {
    return t('task.occurrence.scheduleRange', {
      date,
      start: formatProductHm(startOfDayMs(instance.instanceDate) + time.timeRange.start * 60_000),
      end: formatProductHm(startOfDayMs(instance.instanceDate) + time.timeRange.end * 60_000),
    });
  }
  return t('task.occurrence.scheduleAllDay', { date });
}

export function getTaskOccurrencePosition(
  instance: TaskOccurrenceClientDTO,
  allInstances: readonly TaskOccurrenceClientDTO[],
  template?: Pick<TaskPlanClientDTO, 'instanceCount'> | null,
): { position: number; total: number } | null {
  const siblings = allInstances
    .filter((candidate) => candidate.templateId === instance.templateId)
    .slice()
    .sort((left, right) =>
      left.instanceDate === right.instanceDate
        ? String(left.id).localeCompare(String(right.id))
        : left.instanceDate - right.instanceDate,
    );
  const index = siblings.findIndex((candidate) => candidate.id === instance.id);
  if (index < 0) return null;
  return {
    position: index + 1,
    total: Math.max(template?.instanceCount ?? 0, siblings.length),
  };
}

export function sortTaskOccurrences(
  occurrences: readonly TaskOccurrenceClientDTO[],
  sort: TaskOccurrenceSort,
  titleFor: (templateId: string) => string,
): TaskOccurrenceClientDTO[] {
  return occurrences.slice().sort((left, right) => {
    if (sort === 'status') {
      const byStatus = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
      if (byStatus !== 0) return byStatus;
    }
    if (sort === 'title') {
      const byTitle = titleFor(String(left.templateId)).localeCompare(
        titleFor(String(right.templateId)),
      );
      if (byTitle !== 0) return byTitle;
    }
    return getTaskOccurrenceDueAt(left) - getTaskOccurrenceDueAt(right);
  });
}
