import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/contracts/task';
import enTask from '../../../locales/en-US/task';
import { startOfDayMs } from '../../../shared/utils/product-time';
import {
  getTaskOccurrenceDueAt,
  getTaskOccurrencePosition,
  getTaskOccurrenceStatusLabel,
  isTaskOccurrenceOnSurface,
  isTaskOccurrenceOverdue,
  sortTaskOccurrences,
} from './task-occurrence-presentation';

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: { 'en-US': { task: enTask } },
});
const t = i18n.global.t;
const day = startOfDayMs(new Date(2026, 7, 28, 12).getTime());
const now = day + 12 * 60 * 60_000;

function occurrence(
  id: string,
  overrides: Partial<TaskOccurrenceClientDTO> = {},
): TaskOccurrenceClientDTO {
  return {
    id,
    templateId: 'plan-a',
    identityId: 'identity-a',
    instanceDate: day,
    timeConfig: {
      timeType: 'TimePoint',
      startDate: day,
      timePoint: 9 * 60,
      timeRange: null,
    },
    importance: 'Moderate',
    status: 'Pending',
    isOverdue: false,
    actualStartTime: null,
    actualEndTime: null,
    comment: null,
    version: 1,
    createdAt: day,
    updatedAt: day,
    deletedAt: null,
    ...overrides,
  } as TaskOccurrenceClientDTO;
}

describe('task occurrence presentation', () => {
  it('places today and overdue open occurrences on Today while future occurrences stay Upcoming', () => {
    const today = occurrence('today');
    const yesterdayOpen = occurrence('yesterday', { instanceDate: day - 86_400_000 });
    const yesterdayCompleted = occurrence('done', {
      instanceDate: day - 86_400_000,
      status: 'Completed',
    });
    const tomorrow = occurrence('tomorrow', { instanceDate: day + 86_400_000 });

    expect(isTaskOccurrenceOnSurface(today, 'today', now)).toBe(true);
    expect(isTaskOccurrenceOnSurface(yesterdayOpen, 'today', now)).toBe(true);
    expect(isTaskOccurrenceOnSurface(yesterdayCompleted, 'today', now)).toBe(false);
    expect(isTaskOccurrenceOnSurface(tomorrow, 'upcoming', now)).toBe(true);
    expect(isTaskOccurrenceOnSurface(today, 'upcoming', now)).toBe(false);
  });

  it('derives due time and overdue status from the occurrence time config', () => {
    const morning = occurrence('morning');
    const evening = occurrence('evening', {
      timeConfig: {
        timeType: 'TimeRange',
        startDate: day,
        timePoint: null,
        timeRange: { start: 17 * 60, end: 18 * 60 },
      },
    });

    expect(getTaskOccurrenceDueAt(morning)).toBe(day + 9 * 60 * 60_000);
    expect(isTaskOccurrenceOverdue(morning, now)).toBe(true);
    expect(getTaskOccurrenceStatusLabel(t, morning, now)).toBe('Overdue');
    expect(isTaskOccurrenceOverdue(evening, now)).toBe(false);
  });

  it('keeps repeat position scoped to the same plan and honors durable instance count', () => {
    const first = occurrence('a', { instanceDate: day });
    const second = occurrence('b', { instanceDate: day + 86_400_000 });
    const other = occurrence('c', {
      templateId: 'plan-b' as TaskOccurrenceClientDTO['templateId'],
    });

    expect(
      getTaskOccurrencePosition(second, [other, second, first], {
        instanceCount: 8,
      } as Pick<TaskPlanClientDTO, 'instanceCount'>),
    ).toEqual({ position: 2, total: 8 });
  });

  it('sorts by time, status, or plan title without mutating source input', () => {
    const later = occurrence('later', {
      templateId: 'plan-z' as TaskOccurrenceClientDTO['templateId'],
      timeConfig: {
        timeType: 'TimePoint',
        startDate: day,
        timePoint: 15 * 60,
        timeRange: null,
      },
    });
    const completed = occurrence('completed', {
      templateId: 'plan-a' as TaskOccurrenceClientDTO['templateId'],
      status: 'Completed',
    });
    const source = [later, completed];
    const titleFor = (id: string) => (id === 'plan-a' ? 'Alpha' : 'Zulu');

    expect(sortTaskOccurrences(source, 'time', titleFor).map((item) => item.id)).toEqual([
      'completed',
      'later',
    ]);
    expect(sortTaskOccurrences(source, 'status', titleFor).map((item) => item.id)).toEqual([
      'later',
      'completed',
    ]);
    expect(sortTaskOccurrences(source, 'title', titleFor).map((item) => item.id)).toEqual([
      'completed',
      'later',
    ]);
    expect(source).toEqual([later, completed]);
  });
});
