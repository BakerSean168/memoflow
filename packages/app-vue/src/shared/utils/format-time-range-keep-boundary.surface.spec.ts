import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultUserPreferenceProfile } from '@memoflow/setting-contracts';
import { setProductTimePreferences } from './product-time';
import { formatCalendarEventTimeRange } from './format-calendar-event-time-range';

/**
 * TIME-1205 / Planner projection presentation boundary.
 *
 * app-react keeps its compact HH:mm pair helper. The production Vue Planner now
 * renders canonical CalendarEventProjection values through planner-presentation
 * instead of first reshaping them into the legacy CalendarEventItem detail model.
 */
describe('schedule time-range presentation boundary', () => {
  afterEach(() => setProductTimePreferences(createDefaultUserPreferenceProfile()));

  it('formats the legacy event range in the session timezone across DST', () => {
    const profile = createDefaultUserPreferenceProfile();
    setProductTimePreferences({
      ...profile,
      regional: { ...profile.regional, timeZone: 'America/New_York' },
    });

    expect(
      formatCalendarEventTimeRange(
        {
          displayMode: 'timed',
          startTime: Date.parse('2026-03-08T13:05:00.000Z'),
          endTime: Date.parse('2026-03-08T14:30:00.000Z'),
        },
        'All day',
      ),
    ).toBe('09:05 – 10:30');
  });

  it('preserves the legacy all-day compatibility contract', () => {
    const start = Date.UTC(2024, 0, 2, 9, 0, 0);
    const end = Date.UTC(2024, 0, 2, 10, 30, 0);
    expect(
      formatCalendarEventTimeRange(
        { displayMode: 'all-day', startTime: start, endTime: end },
        'All day',
      ),
    ).toBe('All day');
  });
});
