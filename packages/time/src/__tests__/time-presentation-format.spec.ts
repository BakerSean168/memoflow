import { afterEach, describe, expect, it } from 'vitest';
import { asInstant, createFixedClock, createTimeContext, createTimeFacade } from '../index';

const originalTz = process.env.TZ;

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe('TIME-1204 locale/timezone-aware presentation', () => {
  const instant = asInstant(Date.parse('2026-01-01T00:30:45.000Z'));

  it('renders the same Instant in the explicit context timezone instead of host-local time', () => {
    const tokyo = createTimeFacade({
      context: createTimeContext({ timeZone: 'Asia/Tokyo', weekStartsOn: 1 }),
      presentation: { locale: 'en-US', dateStyle: 'medium', timeStyle: '24h' },
    });
    const losAngeles = createTimeFacade({
      context: createTimeContext({ timeZone: 'America/Los_Angeles', weekStartsOn: 1 }),
      presentation: { locale: 'en-US', dateStyle: 'medium', timeStyle: '24h' },
    });

    expect(tokyo.format.date(instant)).toBe('Jan 1, 2026');
    expect(tokyo.format.hm(instant)).toBe('09:30');
    expect(losAngeles.format.date(instant)).toBe('Dec 31, 2025');
    expect(losAngeles.format.hm(instant)).toBe('16:30');
  });

  it('honors the explicit 12h/24h product preference', () => {
    const context = createTimeContext({ timeZone: 'Asia/Tokyo', weekStartsOn: 1 });
    const twelve = createTimeFacade({
      context,
      presentation: { locale: 'en-US', timeStyle: '12h' },
    });
    const twentyFour = twelve.withPresentation({ timeStyle: '24h' });

    expect(twelve.format.hm(instant)).toBe('09:30 AM');
    expect(twentyFour.format.hm(instant)).toBe('09:30');
    expect(twelve.format.dateTime(instant)).toContain('9:30 AM');
    expect(twentyFour.format.dateTime(instant)).toContain('09:30');
  });

  it('honors locale for date, Ymd and named calendar slots', () => {
    const context = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });
    const en = createTimeFacade({
      context,
      presentation: { locale: 'en-US', dateStyle: 'long' },
    });
    const zh = en.withPresentation({ locale: 'zh-CN' });

    expect(en.format.date(instant)).toContain('January');
    expect(zh.format.date(instant)).toContain('1月');
    expect(en.format.ymdDisplay('2026-01-07')).toContain('January');
    expect(zh.format.ymdDisplay('2026-01-07')).toContain('1月');
    expect(en.format.slot('periodWeekDay', instant)).toBe('Thursday');
    expect(zh.format.slot('periodWeekDay', instant)).toContain('星期');
  });

  it('uses localized relative time and the same absolute formatter past the relative window', () => {
    const now = Date.parse('2026-01-02T00:30:00.000Z');
    const recent = Date.parse('2026-01-01T23:30:00.000Z');
    const old = Date.parse('2025-12-20T00:30:00.000Z');
    const context = createTimeContext({ timeZone: 'Asia/Tokyo', weekStartsOn: 1 });
    const en = createTimeFacade({
      clock: createFixedClock(now),
      context,
      presentation: { locale: 'en-US', timeStyle: '24h' },
    });
    const zh = en.withPresentation({ locale: 'zh-CN' });

    expect(en.format.relative(recent)).toBe('1 hour ago');
    expect(zh.format.relative(recent)).toBe('1小时前');
    expect(en.format.relative(old)).toBe(en.format.dateTime(old));
  });

  it('supports registered fixed patterns and detail timestamps in the context zone', () => {
    const time = createTimeFacade({
      context: createTimeContext({ timeZone: 'Asia/Tokyo', weekStartsOn: 1 }),
      presentation: { locale: 'en-US', timeStyle: '24h' },
    });
    const patterns = [
      'yyyy-MM-dd HH:mm',
      'MM-dd',
      'MM-dd HH:mm',
      "yyyy-MM-dd'T'HH:mm",
      'MMM d',
    ];

    process.env.TZ = 'UTC';
    const fromUtcHost = {
      patterns: patterns.map((pattern) => time.format.pattern(instant, pattern)),
      seconds: time.format.dateTimeSeconds(instant),
    };
    process.env.TZ = 'America/Los_Angeles';
    const fromLaHost = {
      patterns: patterns.map((pattern) => time.format.pattern(instant, pattern)),
      seconds: time.format.dateTimeSeconds(instant),
    };

    expect(fromUtcHost).toEqual(fromLaHost);
    expect(fromUtcHost).toEqual({
      patterns: ['2026-01-01 09:30', '01-01', '01-01 09:30', '2026-01-01T09:30', 'Jan 1'],
      seconds: '2026-01-01 09:30:45',
    });
  });

  it('keeps fixed patterns stable when the requested wall time is a host DST gap', () => {
    const time = createTimeFacade({
      context: createTimeContext({ timeZone: 'Asia/Tokyo', weekStartsOn: 1 }),
      presentation: { locale: 'en-US' },
    });
    const instant = asInstant(Date.parse('2026-03-07T17:30:00.000Z'));

    process.env.TZ = 'UTC';
    const fromUtcHost = time.format.pattern(instant, 'yyyy-MM-dd HH:mm XXX');
    process.env.TZ = 'America/Los_Angeles';
    const fromLaHost = time.format.pattern(instant, 'yyyy-MM-dd HH:mm XXX');

    expect(fromUtcHost).toBe('2026-03-08 02:30 +09:00');
    expect(fromLaHost).toBe(fromUtcHost);
  });

  it('keeps Ymd display independent from hosts that skip a calendar date', () => {
    const time = createTimeFacade({
      context: createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
      presentation: { locale: 'en-US', dateStyle: 'long' },
    });

    process.env.TZ = 'Pacific/Apia';
    const fromApiaHost = time.format.ymdDisplay('2011-12-30');
    process.env.TZ = 'UTC';
    const fromUtcHost = time.format.ymdDisplay('2011-12-30');

    expect(fromApiaHost).toBe('December 30, 2011');
    expect(fromApiaHost).toBe(fromUtcHost);
  });

  it('keeps finite out-of-range instants empty-safe', () => {
    const time = createTimeFacade({
      context: createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
    });
    const invalidInstant = Number.MAX_SAFE_INTEGER;

    expect(time.format.date(invalidInstant)).toBe('');
    expect(time.format.dateTimeSeconds(invalidInstant)).toBe('');
    expect(time.format.pattern(invalidInstant, 'yyyy-MM-dd')).toBe('');
    expect(time.format.relative(invalidInstant)).toBe('');
  });
});
