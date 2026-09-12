import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDefaultUserPreferenceProfile } from '@memoflow/contracts/setting';
import { getProductTime, setProductTimePreferences } from '../../../shared/utils/product-time';
import { taskOccurrencesToEvents, toLocalDateKey } from './useCalendarView';
import type { TaskOccurrenceClientDTO, TaskPlanClientDTO } from '@memoflow/contracts/task';
import type { TaskPlanId, TaskOccurrenceId, IdentityId } from '@memoflow/contracts/primitives';

function makeTemplate(overrides: Partial<TaskPlanClientDTO> = {}): TaskPlanClientDTO {
  return {
    id: 'tpl-1' as TaskPlanId,
    identityId: 'acc-1' as IdentityId,
    name: 'Morning Task',
    description: null,
    timeConfig: {
      timeType: 'AllDay',
      startDate: null,
      timePoint: null,
      timeRange: null,
    },
    recurrenceRule: null,
    reminderConfig: null,
    importance: 'Moderate',
    goalBinding: null,
    tags: [],
    color: null,
    status: 'Active',
    lastGeneratedDate: null,
    generateAheadDays: null,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
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
    completionRate: 0,
    history: [],
    instances: [],
    ...overrides,
  };
}

function makeInstance(overrides: Partial<TaskOccurrenceClientDTO> = {}): TaskOccurrenceClientDTO {
  return {
    id: 'inst-1' as TaskOccurrenceId,
    templateId: 'tpl-1' as TaskPlanId,
    identityId: 'acc-1' as IdentityId,
    instanceDate: Date.UTC(2026, 2, 18, 0, 0, 0, 0),
    timeConfig: {
      timeType: 'AllDay',
      startDate: null,
      timePoint: null,
      timeRange: null,
    },
    importance: 'Moderate',
    status: 'Pending',
    actualStartTime: null,
    actualEndTime: null,
    comment: null,
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
    ...overrides,
  };
}

describe('useCalendarView helpers', () => {
  beforeEach(() => {
    const profile = createDefaultUserPreferenceProfile();
    setProductTimePreferences({
      ...profile,
      regional: { ...profile.regional, timeZone: 'UTC' },
    });
  });
  afterEach(() => setProductTimePreferences(createDefaultUserPreferenceProfile()));
  it('maps all-day task instances to all-day calendar events', () => {
    const [event] = taskOccurrencesToEvents([makeInstance()], [makeTemplate()]);

    expect(event).toMatchObject({
      id: 'task-inst-1',
      title: 'Morning Task',
      source: 'task',
      displayMode: 'all-day',
      originalId: 'inst-1',
      instanceStatus: 'Pending',
    });

    expect(toLocalDateKey(event.startTime)).toBe('2026-03-18');
    expect(toLocalDateKey(event.endTime)).toBe('2026-03-18');
    expect(event.endTime).toBeGreaterThan(event.startTime);
  });

  it('maps timed task instances to timed calendar events', () => {
    const [event] = taskOccurrencesToEvents(
      [
        makeInstance({
          timeConfig: {
            timeType: 'TimeRange',
            startDate: null,
            timePoint: null,
            timeRange: { start: 9 * 60, end: 10 * 60 + 30 },
          },
        }),
      ],
      [makeTemplate()],
    );

    expect(event.displayMode).toBe('timed');
    expect(getProductTime().format.hm(event.startTime)).toBe('09:00');
    expect(getProductTime().format.hm(event.endTime)).toBe('10:30');
  });

  it('uses the session Product Time calendar day instead of the host timezone', () => {
    const profile = createDefaultUserPreferenceProfile();
    setProductTimePreferences({
      ...profile,
      regional: { ...profile.regional, timeZone: 'America/New_York' },
    });

    const instant = Date.parse('2026-03-08T04:30:00.000Z'); // Mar 7 23:30 in New York
    expect(toLocalDateKey(instant)).toBe('2026-03-07');
  });

  it('formats session-calendar date keys without host timezone drift', () => {
    const sessionMidnight = Date.UTC(2026, 2, 18, 0, 0, 0, 0);
    expect(toLocalDateKey(new Date(sessionMidnight))).toBe('2026-03-18');
    expect(toLocalDateKey(sessionMidnight)).toBe('2026-03-18');
  });
});
