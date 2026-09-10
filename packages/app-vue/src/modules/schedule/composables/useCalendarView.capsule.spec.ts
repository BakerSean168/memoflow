import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultUserPreferenceProfile } from '@memoflow/contracts/setting';
import { setProductTimePreferences } from '../../../shared/utils/product-time';
import {
  formatCapsuleTime,
  formatScheduleCapsuleLabel,
  resolveScheduleCapsule,
  type CalendarEventItem,
} from './useCalendarView';

function event(
  partial: Partial<CalendarEventItem> &
    Pick<CalendarEventItem, 'id' | 'title' | 'startTime' | 'endTime'>,
): CalendarEventItem {
  return {
    displayMode: 'timed',
    source: 'schedule',
    originalId: partial.id,
    ...partial,
  };
}

describe('schedule capsule helpers (V2 §2 / §6.3)', () => {
  afterEach(() => setProductTimePreferences(createDefaultUserPreferenceProfile()));
  const day = new Date(2026, 6, 13, 12, 0, 0, 0); // local noon
  const now = day.getTime();

  it('prefers an in-progress timed event as current', () => {
    const current = event({
      id: 'c1',
      title: 'Deep Work',
      startTime: now - 30 * 60_000,
      endTime: now + 30 * 60_000,
    });
    const next = event({
      id: 'n1',
      title: 'Standup',
      startTime: now + 60 * 60_000,
      endTime: now + 90 * 60_000,
    });
    const snap = resolveScheduleCapsule([next, current], now);
    expect(snap.kind).toBe('current');
    expect(snap.event?.id).toBe('c1');
  });

  it('falls back to the next upcoming timed event', () => {
    const next = event({
      id: 'n1',
      title: 'Standup',
      startTime: now + 25 * 60_000,
      endTime: now + 55 * 60_000,
    });
    const snap = resolveScheduleCapsule([next], now);
    expect(snap.kind).toBe('upcoming');
    expect(snap.minutesUntilStart).toBe(25);
  });

  it('formats capsule labels for current and upcoming', () => {
    const t = (key: string, params?: Record<string, unknown>) =>
      `${key}:${JSON.stringify(params ?? {})}`;

    const currentSnap = resolveScheduleCapsule(
      [
        event({
          id: 'c1',
          title: 'Deep Work',
          startTime: now - 10 * 60_000,
          endTime: now + 50 * 60_000,
        }),
      ],
      now,
    );
    const currentLabel = formatScheduleCapsuleLabel(currentSnap, t);
    expect(currentLabel).toContain('shell.schedule.current');
    expect(currentLabel).toContain('Deep Work');

    const upcomingSnap = resolveScheduleCapsule(
      [
        event({
          id: 'n1',
          title: 'Standup',
          startTime: now + 30 * 60_000,
          endTime: now + 60 * 60_000,
        }),
      ],
      now,
    );
    const upcomingLabel = formatScheduleCapsuleLabel(upcomingSnap, t);
    expect(upcomingLabel).toContain('shell.schedule.upcoming');
    expect(upcomingLabel).toContain('30');
  });

  it('formats capsule time in the session timezone across spring-forward', () => {
    const profile = createDefaultUserPreferenceProfile();
    setProductTimePreferences({
      ...profile,
      regional: { ...profile.regional, timeZone: 'America/New_York' },
    });

    expect(formatCapsuleTime(Date.parse('2026-03-08T13:05:00.000Z'))).toBe('09:05');
  });

  it('formats local HH:mm without locale drift', () => {
    const ms = new Date(2026, 6, 13, 9, 5, 0, 0).getTime();
    expect(formatCapsuleTime(ms)).toBe('09:05');
  });
});
