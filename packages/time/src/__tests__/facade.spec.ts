import { describe, expect, it } from 'vitest';
import {
  createFixedClock,
  createTimeContext,
  createTimeFacade,
  DEFAULT_TIME_STYLE,
  asInstant,
  asYmd,
  asHm,
  timeStyleFromPresentationLocale,
  resolveEmptyLabel,
  DEFAULT_EMPTY_LITERALS,
} from '../index';

describe('@memoflow/time facade', () => {
  const frozenMs = Date.UTC(2026, 6, 26, 12, 30, 0); // 2026-07-26 12:30 UTC
  // Use local-noon construct for local calendar tests
  const localNoon = new Date(2026, 6, 26, 14, 5, 0).getTime();

  it('FixedClock freezes now()', () => {
    const clock = createFixedClock(frozenMs);
    const time = createTimeFacade({ clock });
    expect(time.now()).toBe(asInstant(frozenMs));
    expect(time.clock.now()).toBe(time.now());
  });

  it('format.hm uses canonical hour style and empty.display for null', () => {
    const time = createTimeFacade({
      clock: createFixedClock(localNoon),
      style: {
        empty: { display: 'EMPTY' },
        timeStyle: '24h',
      },
    });
    expect(time.format.hm(null)).toBe('EMPTY');
    expect(time.format.hm(undefined)).toBe('EMPTY');
    const hm = time.format.hm(localNoon);
    expect(hm).toMatch(/^\d{2}:\d{2}$/);
    // Style is the subject: changing empty.display changes null rendering
    const alt = time.withStyle({ empty: { display: 'N/A' } });
    expect(alt.format.hm(null)).toBe('N/A');
    expect(alt.format.hm(localNoon)).toBe(hm);
  });

  it('Codec Transfer↔Instant round-trip and rejects invalid without now()', () => {
    const time = createTimeFacade({ clock: createFixedClock(frozenMs) });
    const before = time.now();
    const instant = time.codec.fromTransfer(localNoon);
    expect(instant).toBe(asInstant(localNoon));
    expect(time.codec.toTransfer(instant!)).toBe(localNoon);

    const invalidNull = time.codec.fromTransfer(Number.NaN);
    expect(invalidNull).toBeNull();
    // Clock must not advance / substitute now on invalid
    expect(time.now()).toBe(before);

    expect(() => time.codec.fromTransfer(Number.NaN, { onInvalid: 'throw' })).toThrow(TypeError);

    const ymd = time.codec.parseYmd('2026-07-26');
    expect(ymd).toBe(asYmd('2026-07-26'));
    expect(time.codec.parseYmd('not-a-day')).toBeNull();
    expect(time.codec.parseYmd('2026-13-40')).toBeNull();

    const start = time.codec.startOfYmd(asYmd('2026-07-26'));
    expect(time.codec.toYmd(start)).toBe('2026-07-26');

    const combined = time.codec.combineYmdHm(asYmd('2026-07-26'), asHm('14:05'));
    expect(combined).not.toBeNull();
    expect(time.format.hm(combined)).toBe('14:05');
  });

  it('round-trips Instant through the JS Date adapter boundary', () => {
    const time = createTimeFacade();
    const instant = asInstant(Date.parse('2026-08-25T12:34:56.789Z'));

    const jsDate = time.codec.toJsDate(instant);
    expect(jsDate).toBeInstanceOf(Date);
    expect(jsDate.getTime()).toBe(instant);
    expect(time.codec.fromJsDate(jsDate)).toBe(instant);
  });

  it('fromJsDate never substitutes now on invalid Date', () => {
    const time = createTimeFacade({ clock: createFixedClock(frozenMs) });
    const invalid = new Date(Number.NaN);
    expect(time.codec.fromJsDate(invalid)).toBeNull();
    expect(time.now()).toBe(asInstant(frozenMs));
  });

  it('DEFAULT_TIME_STYLE.empty.display is the single empty point', () => {
    expect(DEFAULT_TIME_STYLE.empty.display).toBe('—');
    const time = createTimeFacade();
    expect(time.format.hm(null)).toBe(DEFAULT_TIME_STYLE.empty.display);
  });

  it('lifted soles: padTwoDigits / localHHmm / dateToYmd', async () => {
    const { padTwoDigits, formatLocalHHmm, formatDateToYMD, formatHHmmParts, formatHour } =
      await import('../free/format-helpers');
    expect(padTwoDigits(5)).toBe('05');
    expect(formatHHmmParts(9, 7)).toBe('09:07');
    expect(formatHour(8)).toBe('08:00');
    const d = new Date(2026, 0, 5, 3, 4, 0);
    expect(formatDateToYMD(d)).toBe('2026-01-05');
    expect(formatLocalHHmm(d.getTime())).toBe('03:04');
  });

  it('calendar.isToday respects FixedClock', () => {
    const time = createTimeFacade({ clock: createFixedClock(localNoon) });
    expect(time.calendar.isToday(asInstant(localNoon))).toBe(true);
    const otherDay = new Date(2026, 6, 27, 14, 5, 0).getTime();
    expect(time.calendar.isToday(asInstant(otherDay))).toBe(false);
  });
});

describe('empty catalog (P1)', () => {
  it('resolveEmptyLabel yields distinct kinds and format.date honors override', () => {
    expect(resolveEmptyLabel('emdash')).toBe(DEFAULT_EMPTY_LITERALS.emdash);
    expect(resolveEmptyLabel('dash')).toBe(DEFAULT_EMPTY_LITERALS.dash);
    expect(resolveEmptyLabel('notSet')).toBe('Not set');
    expect(resolveEmptyLabel('na')).toBe('N/A');
    expect(resolveEmptyLabel('unknown')).toBe('Unknown');
    expect(resolveEmptyLabel('blank')).toBe('');
    expect(resolveEmptyLabel('emdash')).not.toBe(resolveEmptyLabel('dash'));
    expect(resolveEmptyLabel('notSet')).not.toBe(resolveEmptyLabel('na'));

    const notSet = resolveEmptyLabel('notSet', {
      translate: (k) => (k === 'notSet' ? '未设置' : undefined),
    });
    expect(notSet).toBe('未设置');

    const time = createTimeFacade({
      style: { empty: { display: resolveEmptyLabel('na') } },
    });
    expect(time.format.date(null)).toBe('N/A');
    expect(time.format.date(undefined)).toBe('N/A');
    expect(time.format.date(null, { empty: { display: resolveEmptyLabel('notSet') } })).toBe(
      'Not set',
    );
  });
});

describe('TimeStyle preference + empty.display single point (W8)', () => {
  it('timeStyleFromPresentationLocale switches locale', () => {
    const zh = timeStyleFromPresentationLocale('zh-CN');
    const en = timeStyleFromPresentationLocale('en-US');
    expect(zh.locale).toBe('zh-CN');
    expect(en.locale).toBe('en-US');
    const time = createTimeFacade({
      style: en,
      clock: createFixedClock(new Date(2026, 6, 26, 15, 0, 0).getTime()),
    });
    expect(time.style.locale).toBe('en-US');
  });

  it('changing empty.display once changes list empty-time path', () => {
    const listEmpty = (facade: ReturnType<typeof createTimeFacade>, value: number | null) =>
      facade.format.hm(value);
    const a = createTimeFacade({ style: { empty: { display: '—' } } });
    const b = createTimeFacade({ style: { empty: { display: '暂无' } } });
    expect(listEmpty(a, null)).toBe('—');
    expect(listEmpty(b, null)).toBe('暂无');
  });
});

describe('duration + display slots (P4/P6)', () => {
  it('splitDurationMinutes / durationMinutes arithmetic sole', () => {
    const time = createTimeFacade({ style: { duration: { zero: '0m', style: 'narrow' } } });
    expect(time.format.splitDurationMinutes(90)).toEqual({
      hours: 1,
      minutes: 30,
      seconds: 0,
      totalMs: 90 * 60_000,
      totalMinutes: 90,
    });
    expect(time.format.durationMinutes(90)).toMatch(/1h/);
    expect(time.format.durationMinutes(0)).toBe('0m');
    expect(time.format.durationMs(3_600_000)).toMatch(/1h/);
  });

  it('format.slot uses named semantic Intl slots rather than persisted format tokens', () => {
    const instant = asInstant(Date.parse('2026-07-26T14:05:00.000Z'));
    const time = createTimeFacade({
      context: createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
      presentation: { locale: 'en-US' },
    });
    expect(time.format.slot('periodDay', instant)).toBe('Sunday, July 26, 2026');
    expect(time.format.slot('periodMonth', instant)).toBe('July 2026');
    expect(time.format.slot('chartMonthDay', instant)).toBe('Jul 26');
    expect(time.format.slot('periodDay', null)).toBe(DEFAULT_TIME_STYLE.empty.display);
  });
});

describe('IANA timeZone policy + engine seam (P11)', () => {
  it('combineYmdHm under UTC zone is deterministic Instant', () => {
    const time = createTimeFacade({
      clock: createFixedClock(Date.UTC(2026, 6, 26, 12, 0, 0)),
      style: { timeZone: 'UTC' },
    });
    const combined = time.codec.combineYmdHm(asYmd('2026-07-26'), asHm('14:05'));
    expect(combined).not.toBeNull();
    // 14:05 UTC wall → known epoch
    expect(combined).toBe(Date.UTC(2026, 6, 26, 14, 5, 0));
  });

  it('withEngine only affects the explicit fixed-pattern escape hatch', () => {
    const base = createTimeFacade({ style: { empty: { display: 'X' } } });
    const double = {
      ...base.engine,
      formatPattern: () => 'PATTERN',
    };
    const swapped = base.withEngine(double);
    expect(swapped.style.empty.display).toBe('X');
    expect(swapped.format.pattern(Date.now(), 'yyyy-MM-dd')).toBe('PATTERN');
    expect(swapped.format.hm(Date.now())).not.toBe('PATTERN');
  });
});
