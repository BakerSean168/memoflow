import { afterEach, describe, expect, it } from 'vitest';
import {
  asHm,
  asInstant,
  asYmd,
  combineYmdHmWithTimeZone,
  createDateFnsEngine,
  createTimeContext,
  createTimeFacade,
  requireTimeZoneId,
} from '../index';

const originalTz = process.env.TZ;

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe('TIME-1206 host-timezone boundary characterization', () => {
  it('keeps host-local date-fns behavior confined to the raw engine seam', () => {
    const instant = asInstant(Date.parse('2025-12-31T16:30:00.000Z'));

    process.env.TZ = 'UTC';
    const utcYmd = createDateFnsEngine().toYmd(instant);
    process.env.TZ = 'Asia/Tokyo';
    const tokyoYmd = createDateFnsEngine().toYmd(instant);

    expect(utcYmd).toBe('2025-12-31');
    expect(tokyoYmd).toBe('2026-01-01');
    expect(utcYmd).not.toBe(tokyoYmd);
  });

  it('uses explicit context for canonical locale-sensitive presentation', () => {
    const instant = asInstant(Date.parse('2026-01-07T12:00:00.000Z'));
    const context = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });
    const zh = createTimeFacade({ context, presentation: { locale: 'zh-CN' } }).format.date(
      instant,
    );
    const en = createTimeFacade({ context, presentation: { locale: 'en-US' } }).format.date(
      instant,
    );

    expect(zh).toContain('2026');
    expect(en).toContain('2026');
    expect(en).not.toBe(zh);
  });

  it('honors explicit weekStartsOn without consulting host timezone', () => {
    const instant = asInstant(Date.parse('2026-01-07T12:00:00.000Z'));
    process.env.TZ = 'America/Los_Angeles';
    const monday = createTimeFacade({
      context: createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
    });
    const sunday = createTimeFacade({
      context: createTimeContext({ timeZone: 'UTC', weekStartsOn: 0 }),
    });

    expect(new Date(monday.calendar.startOfWeek(instant)).toISOString()).toBe(
      '2026-01-05T00:00:00.000Z',
    );
    expect(new Date(sunday.calendar.startOfWeek(instant)).toISOString()).toBe(
      '2026-01-04T00:00:00.000Z',
    );
  });

  it('keeps explicit IANA wall-clock conversion independent from process timezone', () => {
    const ymd = asYmd('2026-01-01');
    const hm = asHm('09:15');

    process.env.TZ = 'UTC';
    const fromUtcHost = combineYmdHmWithTimeZone(ymd, hm, requireTimeZoneId('Asia/Tokyo'));
    process.env.TZ = 'America/Los_Angeles';
    const fromLaHost = combineYmdHmWithTimeZone(ymd, hm, requireTimeZoneId('Asia/Tokyo'));

    expect(fromUtcHost).toBe(Date.parse('2026-01-01T00:15:00.000Z'));
    expect(fromLaHost).toBe(fromUtcHost);
  });

  it('freezes DST gap behavior as shift-forward for New York', () => {
    expect(
      combineYmdHmWithTimeZone(
        asYmd('2026-03-08'),
        asHm('02:30'),
        requireTimeZoneId('America/New_York'),
      ),
    ).toBe(Date.parse('2026-03-08T07:30:00.000Z'));
  });

  it('freezes DST overlap behavior as the earlier occurrence for New York', () => {
    expect(
      combineYmdHmWithTimeZone(
        asYmd('2026-11-01'),
        asHm('01:30'),
        requireTimeZoneId('America/New_York'),
      ),
    ).toBe(Date.parse('2026-11-01T05:30:00.000Z'));
  });
});
