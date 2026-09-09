import { afterEach, describe, expect, it } from 'vitest';
import {
  asHm,
  asInstant,
  asYmd,
  combineYmdHmWithTimeZone,
  createDateFnsEngine,
  createTimeFacade,
} from '../index';

const originalTz = process.env.TZ;

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe('TIME-1201 host-timezone characterization', () => {
  it('documents the current host-local calendar drift that TimeContext must remove', () => {
    const instant = asInstant(Date.parse('2025-12-31T16:30:00.000Z'));

    process.env.TZ = 'UTC';
    const utcYmd = createDateFnsEngine().toYmd(instant);

    process.env.TZ = 'Asia/Tokyo';
    const tokyoYmd = createDateFnsEngine().toYmd(instant);

    expect(utcYmd).toBe('2025-12-31');
    expect(tokyoYmd).toBe('2026-01-01');
    expect(utcYmd).not.toBe(tokyoYmd);
  });

  it('documents that locale is currently presentation metadata ignored by date/dateTime engine formatting', () => {
    process.env.TZ = 'UTC';
    const instant = asInstant(Date.parse('2026-01-07T12:00:00.000Z'));
    const zh = createTimeFacade({ style: { locale: 'zh-CN' } }).format.date(instant);
    const en = createTimeFacade({ style: { locale: 'en-US' } }).format.date(instant);

    expect(zh).toBe('2026-01-07');
    expect(en).toBe(zh);
  });

  it('honors weekStartsOn even while day boundaries are still host-local', () => {
    process.env.TZ = 'UTC';
    const instant = asInstant(Date.parse('2026-01-07T12:00:00.000Z'));
    const monday = createTimeFacade({ style: { calendar: { weekStartsOn: 1 } } });
    const sunday = createTimeFacade({ style: { calendar: { weekStartsOn: 0 } } });

    expect(new Date(monday.calendar.startOfWeek(instant)).toISOString()).toBe(
      '2026-01-05T00:00:00.000Z',
    );
    expect(new Date(sunday.calendar.startOfWeek(instant)).toISOString()).toBe(
      '2026-01-04T00:00:00.000Z',
    );
  });

  it('keeps explicit IANA wall-clock conversion independent from the process timezone', () => {
    const ymd = asYmd('2026-01-01');
    const hm = asHm('09:15');

    process.env.TZ = 'UTC';
    const fromUtcHost = combineYmdHmWithTimeZone(ymd, hm, 'Asia/Tokyo');

    process.env.TZ = 'America/Los_Angeles';
    const fromLaHost = combineYmdHmWithTimeZone(ymd, hm, 'Asia/Tokyo');

    expect(fromUtcHost).toBe(Date.parse('2026-01-01T00:15:00.000Z'));
    expect(fromLaHost).toBe(fromUtcHost);
  });

  it('freezes the current DST gap behavior as shift-forward for New York', () => {
    const resolved = combineYmdHmWithTimeZone(
      asYmd('2026-03-08'),
      asHm('02:30'),
      'America/New_York',
    );

    expect(resolved).toBe(Date.parse('2026-03-08T07:30:00.000Z'));
  });

  it('freezes the current DST overlap behavior as the earlier occurrence for New York', () => {
    const resolved = combineYmdHmWithTimeZone(
      asYmd('2026-11-01'),
      asHm('01:30'),
      'America/New_York',
    );

    expect(resolved).toBe(Date.parse('2026-11-01T05:30:00.000Z'));
  });
});
