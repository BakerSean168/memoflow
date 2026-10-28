import { describe, expect, it } from 'vitest';
import { createFixedClock } from '../clock/fixed-clock';
import { createProductTimeSession } from '../product-time-session';
import { requireTimeZoneId } from '../timezone/time-zone';

const NOW = Date.parse('2026-08-01T09:30:00.000Z');

describe('createProductTimeSession', () => {
  it('builds the device session from the locale and empty overrides', () => {
    const session = createProductTimeSession({
      locale: 'en-US',
      empty: { display: 'n/a', unknown: '?' },
      invalidValueLabel: 'unknown',
      clock: createFixedClock(NOW),
    });

    expect(session.getLocale()).toBe('en-US');
    expect(session.formatDateTime(null)).toBe('n/a');
    expect(session.formatYmd(null)).toBe('n/a');
    expect(session.formatRelative(null)).toBe('n/a');
    expect(session.formatDateTime('not-a-date')).toBe('?');
  });

  it('applies preferences to the context and presentation', () => {
    const session = createProductTimeSession({
      locale: 'en-US',
      clock: createFixedClock(NOW),
    });

    session.setPreferences({
      presentation: { language: 'zh-CN' },
      regional: {
        timeZone: requireTimeZoneId('Asia/Shanghai'),
        weekStartsOn: 1,
        dateStyle: 'medium',
        timeStyle: '24h',
      },
    });

    expect(session.getLocale()).toBe('zh-CN');
    expect(session.getWeekStartsOn()).toBe(1);
    expect(session.getTodayYmd()).toBe('2026-08-01');
    expect(session.formatDateTime(NOW)).toContain('17:30');
  });

  it('uses the display label for unparsable values when configured', () => {
    const session = createProductTimeSession({
      locale: 'en-US',
      invalidValueLabel: 'display',
      clock: createFixedClock(NOW),
    });

    const display = session.getFacade().presentation.empty.display;
    expect(session.formatDate('not-a-date')).toBe(display);
    expect(session.formatDate(null)).toBe(display);
  });

  it('resets to the device session after preferences were applied', () => {
    const session = createProductTimeSession({
      locale: 'en-US',
      clock: createFixedClock(NOW),
    });

    session.setPreferences({
      presentation: { language: 'zh-CN' },
      regional: {
        timeZone: requireTimeZoneId('Asia/Shanghai'),
        weekStartsOn: 1,
        dateStyle: 'medium',
        timeStyle: '24h',
      },
    });
    session.reset();

    expect(session.getLocale()).toBe('en-US');
  });

  it('round-trips native date input values on the product day', () => {
    const session = createProductTimeSession({
      locale: 'en-US',
      clock: createFixedClock(NOW),
    });

    expect(session.toYmdInputValue(session.fromYmdInputValue('2026-08-01'))).toBe('2026-08-01');
    expect(session.toDateInputValue(NOW)).toBe('2026-08-01');
    expect(session.fromDateInputValue('not-a-date')).toBeNull();
  });
});
