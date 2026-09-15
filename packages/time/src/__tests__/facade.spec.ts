import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  asHm,
  asInstant,
  asYmd,
  createFixedClock,
  createTimeContext,
  createTimeFacade,
  DEFAULT_EMPTY_LITERALS,
  DEFAULT_TIME_PRESENTATION_STYLE,
  formatDisplayDate,
  formatHHmmParts,
  formatHour,
  padTwoDigits,
  resolveEmptyLabel,
} from '../index';

const UTC_CONTEXT = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });

function utcTime(
  options: Parameters<typeof createTimeFacade>[0] extends infer T ? Partial<T> : never = {},
) {
  return createTimeFacade({
    context: UTC_CONTEXT,
    ...options,
  });
}

describe('@memoflow/time canonical facade', () => {
  const frozenMs = Date.UTC(2026, 6, 26, 12, 30, 0);
  const afternoon = Date.UTC(2026, 6, 26, 14, 5, 0);

  it('FixedClock freezes now()', () => {
    const clock = createFixedClock(frozenMs);
    const time = utcTime({ clock });
    expect(time.now()).toBe(asInstant(frozenMs));
    expect(time.clock.now()).toBe(time.now());
  });

  it('format.hm uses canonical presentation and empty.display', () => {
    const time = utcTime({
      clock: createFixedClock(afternoon),
      presentation: { empty: { display: 'EMPTY' }, timeStyle: '24h' },
    });
    expect(time.format.hm(null)).toBe('EMPTY');
    expect(time.format.hm(afternoon)).toBe('14:05');

    const alt = time.withPresentation({ empty: { display: 'N/A' } });
    expect(alt.format.hm(null)).toBe('N/A');
    expect(alt.format.hm(afternoon)).toBe('14:05');
  });

  it('Codec Transfer↔Instant round-trips and invalid input never substitutes now()', () => {
    const time = utcTime({ clock: createFixedClock(frozenMs) });
    const before = time.now();
    const instant = time.codec.fromTransfer(afternoon);
    expect(instant).toBe(asInstant(afternoon));
    expect(time.codec.toTransfer(instant!)).toBe(afternoon);
    expect(time.codec.fromTransfer(Number.NaN)).toBeNull();
    expect(time.now()).toBe(before);
    expect(() => time.codec.fromTransfer(Number.NaN, { onInvalid: 'throw' })).toThrow(TypeError);

    expect(time.codec.parseYmd('2026-07-26')).toBe(asYmd('2026-07-26'));
    expect(time.codec.parseYmd('2026-13-40')).toBeNull();
    const combined = time.codec.combineYmdHm(asYmd('2026-07-26'), asHm('14:05'));
    expect(combined).toBe(Date.UTC(2026, 6, 26, 14, 5, 0));
  });

  it('round-trips Instant through the explicit JS Date adapter boundary', () => {
    const time = utcTime();
    const instant = asInstant(Date.parse('2026-08-25T12:34:56.789Z'));
    const jsDate = time.codec.toJsDate(instant);
    expect(jsDate).toBeInstanceOf(Date);
    expect(jsDate.getTime()).toBe(instant);
    expect(time.codec.fromJsDate(jsDate)).toBe(instant);
  });

  it('fromJsDate fails closed on invalid Date', () => {
    const time = utcTime({ clock: createFixedClock(frozenMs) });
    expect(time.codec.fromJsDate(new Date(Number.NaN))).toBeNull();
    expect(time.now()).toBe(asInstant(frozenMs));
  });

  it('DEFAULT_TIME_PRESENTATION_STYLE is the only default presentation source', () => {
    expect(DEFAULT_TIME_PRESENTATION_STYLE.empty.display).toBe('—');
    expect(utcTime().format.hm(null)).toBe(DEFAULT_TIME_PRESENTATION_STYLE.empty.display);
  });

  it('exports only pure free helpers for padding/date-only display', () => {
    expect(padTwoDigits(5)).toBe('05');
    expect(formatHHmmParts(9, 7)).toBe('09:07');
    expect(formatHour(8)).toBe('08:00');
    expect(formatDisplayDate('2026-01-05', 'en-US')).toContain('2026');

    const free = readFileSync(resolve(__dirname, '../free/format-helpers.ts'), 'utf8');
    expect(free).not.toContain('defaultTime');
    expect(free).not.toContain('formatLocalHHmm');
    expect(free).not.toContain('formatDateToYMD');
  });

  it('calendar.isToday respects explicit context + FixedClock', () => {
    const time = utcTime({ clock: createFixedClock(afternoon) });
    expect(time.calendar.isToday(asInstant(afternoon))).toBe(true);
    expect(time.calendar.isToday(asInstant(Date.UTC(2026, 6, 27, 14, 5, 0)))).toBe(false);
  });
});

describe('empty catalog', () => {
  it('keeps semantic empty labels separate from presentation overrides', () => {
    expect(resolveEmptyLabel('emdash')).toBe(DEFAULT_EMPTY_LITERALS.emdash);
    expect(resolveEmptyLabel('dash')).toBe(DEFAULT_EMPTY_LITERALS.dash);
    expect(resolveEmptyLabel('notSet')).toBe('Not set');
    expect(resolveEmptyLabel('na')).toBe('N/A');
    expect(resolveEmptyLabel('unknown')).toBe('Unknown');

    const time = utcTime({ presentation: { empty: { display: resolveEmptyLabel('na') } } });
    expect(time.format.date(null)).toBe('N/A');
    expect(time.format.date(null, { empty: { display: resolveEmptyLabel('notSet') } })).toBe(
      'Not set',
    );
  });
});

describe('duration + display slots', () => {
  it('keeps duration arithmetic independent from calendar semantics', () => {
    const time = utcTime({ presentation: { duration: { zero: '0m', style: 'narrow' } } });
    expect(time.format.splitDurationMinutes(90)).toEqual({
      hours: 1,
      minutes: 30,
      seconds: 0,
      totalMs: 90 * 60_000,
      totalMinutes: 90,
    });
    expect(time.format.durationMinutes(90)).toMatch(/1h/);
    expect(time.format.durationMinutes(0)).toBe('0m');
  });

  it('format.slot uses semantic Intl slots through explicit context', () => {
    const instant = asInstant(Date.parse('2026-07-26T14:05:00.000Z'));
    const time = utcTime({ presentation: { locale: 'en-US' } });
    expect(time.format.slot('periodDay', instant)).toBe('Sunday, July 26, 2026');
    expect(time.format.slot('periodMonth', instant)).toBe('July 2026');
    expect(time.format.slot('chartMonthDay', instant)).toBe('Jul 26');
    expect(time.format.slot('periodDay', null)).toBe(DEFAULT_TIME_PRESENTATION_STYLE.empty.display);
  });
});

describe('engine seam', () => {
  it('withEngine affects only the explicit engine escape hatch', () => {
    const base = utcTime({ presentation: { empty: { display: 'X' } } });
    const double = { ...base.engine, formatPattern: () => 'PATTERN' };
    const swapped = base.withEngine(double);
    expect(swapped.presentation.empty.display).toBe('X');
    expect(swapped.format.pattern(Date.now(), 'yyyy-MM-dd')).toBe('PATTERN');
    expect(swapped.format.hm(Date.now())).not.toBe('PATTERN');
  });
});
