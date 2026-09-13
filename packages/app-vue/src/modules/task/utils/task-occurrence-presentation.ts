import type { ComposerTranslation } from 'vue-i18n';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/contracts/task';
import { endOfDayMs, formatProductYmd, isTodayMs } from '../../../shared/utils/product-time';

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
  return instance.dueAt;
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
    return instance.dueAt > endOfDayMs(now);
  }
  return isTodayMs(instance.dueAt) || isTaskOccurrenceOverdue(instance, now);
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
  const date = formatProductYmd(instance.scheduleSnapshot.date);
  const timing = instance.scheduleSnapshot.timing;
  if (timing.kind === 'At') {
    return t('task.occurrence.scheduleAt', { date, time: timing.time });
  }
  if (timing.kind === 'Window') {
    return t('task.occurrence.scheduleRange', {
      date,
      start: timing.start,
      end: timing.end,
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
    .filter((candidate) => candidate.planId === instance.planId)
    .slice()
    .sort((left, right) =>
      left.dueAt === right.dueAt
        ? String(left.id).localeCompare(String(right.id))
        : left.dueAt - right.dueAt,
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
  titleFor: (planId: string) => string,
): TaskOccurrenceClientDTO[] {
  return occurrences.slice().sort((left, right) => {
    if (sort === 'status') {
      const byStatus = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
      if (byStatus !== 0) return byStatus;
    }
    if (sort === 'title') {
      const byTitle = titleFor(String(left.planId)).localeCompare(titleFor(String(right.planId)));
      if (byTitle !== 0) return byTitle;
    }
    return getTaskOccurrenceDueAt(left) - getTaskOccurrenceDueAt(right);
  });
}
