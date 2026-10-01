import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultUserPreferenceProfile } from '@memoflow/contracts/setting';
import type { CalendarEventProjection } from '@memoflow/contracts/schedule';
import { asInstant, asYmd } from '@memoflow/time';
import { setProductTimePreferences } from '../../../shared/utils/product-time';
import {
  formatPlannerProjectionTimeRange,
  plannerProjectionDateKey,
  plannerProjectionSourceLabel,
  plannerProjectionSourcePresentation,
  plannerProjectionToneClass,
} from './planner-presentation';

function timedProjection(start: number, end: number | null): CalendarEventProjection {
  return {
    identityId: 'identity-1',
    sourceType: 'schedule',
    sourceId: 'schedule-1',
    title: 'Deep work',
    allDay: false,
    start: asInstant(start),
    end: end == null ? null : asInstant(end),
    occupancy: 'blocking',
    displayMetadata: { semantic: 'calendar-entry' },
    editableCapabilities: { move: true, resize: true },
    ownerCommandTarget: { ownerType: 'schedule.calendar-entry', ownerId: 'schedule-1' },
    revision: 1,
  };
}

describe('planner projection presentation', () => {
  afterEach(() => setProductTimePreferences(createDefaultUserPreferenceProfile()));

  it('owns one source label and visual identity for every Planner owner', () => {
    expect(plannerProjectionSourcePresentation).toEqual({
      schedule: expect.objectContaining({
        labelI18nKey: 'schedule.source.schedule',
        sourceClass: 'planner-source-schedule',
        dotClass: 'bg-primary',
        badgeClass: 'bg-primary/10 text-primary',
        calendarColor: 'var(--primary)',
        calendarForeground: 'var(--primary-foreground)',
      }),
      task: expect.objectContaining({
        labelI18nKey: 'schedule.source.task',
        sourceClass: 'planner-source-task',
        dotClass: 'bg-info',
        badgeClass: 'bg-info/15 text-info',
        calendarColor: 'var(--info)',
        calendarForeground: 'var(--info-foreground)',
      }),
      goal: expect.objectContaining({
        labelI18nKey: 'schedule.source.goal',
        sourceClass: 'planner-source-goal',
        dotClass: 'bg-warning',
        badgeClass: 'bg-warning/15 text-warning',
        calendarColor: 'var(--warning)',
        calendarForeground: 'var(--warning-foreground)',
      }),
      routine: expect.objectContaining({
        labelI18nKey: 'schedule.source.routine',
        sourceClass: 'planner-source-routine',
        dotClass: 'bg-success',
        badgeClass: 'bg-success/15 text-success',
        calendarColor: 'var(--success)',
        calendarForeground: 'var(--success-foreground)',
      }),
    });

    expect(plannerProjectionSourceLabel('goal', (key) => `translated:${key}`)).toBe(
      'translated:schedule.source.goal',
    );
  });

  it('derives event tone from projection metadata and conflict state', () => {
    const event = timedProjection(Date.parse('2026-03-08T13:05:00.000Z'), null);
    expect(plannerProjectionToneClass(event)).toBe('planner-tone-default');
    expect(
      plannerProjectionToneClass({
        ...event,
        displayMetadata: { ...event.displayMetadata, tone: 'success' },
      }),
    ).toBe('planner-tone-success');
    expect(plannerProjectionToneClass(event, true)).toBe('planner-tone-warning');
  });

  it('formats timed projections in the session timezone', () => {
    const profile = createDefaultUserPreferenceProfile();
    setProductTimePreferences({
      ...profile,
      regional: { ...profile.regional, timeZone: 'America/New_York' },
    });

    const event = timedProjection(
      Date.parse('2026-03-08T13:05:00.000Z'),
      Date.parse('2026-03-08T14:30:00.000Z'),
    );

    expect(formatPlannerProjectionTimeRange(event, 'All day')).toContain('09:05');
    expect(formatPlannerProjectionTimeRange(event, 'All day')).toContain('10:30');
  });

  it('keeps all-day Ymd values calendar-native instead of round-tripping through host Date', () => {
    const event: CalendarEventProjection = {
      identityId: 'identity-1',
      sourceType: 'goal',
      sourceId: 'goal-1:target',
      title: 'Ship',
      allDay: true,
      start: asYmd('2026-09-28'),
      end: null,
      occupancy: 'marker',
      displayMetadata: { semantic: 'goal-target' },
      editableCapabilities: { move: true, resize: false },
      ownerCommandTarget: { ownerType: 'goal.goal', ownerId: 'goal-1' },
      revision: 1,
    };

    expect(plannerProjectionDateKey(event)).toBe('2026-09-28');
    expect(formatPlannerProjectionTimeRange(event, 'All day')).toContain('All day');
  });

  it('derives timed date keys through Product Time', () => {
    const profile = createDefaultUserPreferenceProfile();
    setProductTimePreferences({
      ...profile,
      regional: { ...profile.regional, timeZone: 'America/New_York' },
    });

    const event = timedProjection(Date.parse('2026-03-08T04:30:00.000Z'), null);
    expect(plannerProjectionDateKey(event)).toBe('2026-03-07');
  });
});
