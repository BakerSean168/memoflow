import { describe, expect, it } from 'vitest';
import { CalendarEntryRangeSchema } from './calendar-entry-range';

describe('CalendarEntryRangeSchema ADR-080', () => {
  it('accepts a valid Timed Instant range', () => {
    expect(
      CalendarEntryRangeSchema.parse({
        kind: 'Timed',
        start: 1_700_000_000_000,
        end: 1_700_000_060_000,
      }),
    ).toEqual({ kind: 'Timed', start: 1_700_000_000_000, end: 1_700_000_060_000 });
  });

  it('rejects zero and backwards Timed ranges', () => {
    expect(CalendarEntryRangeSchema.safeParse({ kind: 'Timed', start: 10, end: 10 }).success).toBe(
      false,
    );
    expect(CalendarEntryRangeSchema.safeParse({ kind: 'Timed', start: 11, end: 10 }).success).toBe(
      false,
    );
  });

  it('accepts a single-day AllDay range without inventing an Instant', () => {
    expect(
      CalendarEntryRangeSchema.parse({ kind: 'AllDay', start: '2026-09-17', end: null }),
    ).toEqual({
      kind: 'AllDay',
      start: '2026-09-17',
      end: null,
    });
  });

  it('accepts an inclusive multi-day AllDay range', () => {
    expect(
      CalendarEntryRangeSchema.safeParse({ kind: 'AllDay', start: '2026-09-17', end: '2026-09-19' })
        .success,
    ).toBe(true);
  });

  it('rejects backwards or invalid AllDay calendar dates', () => {
    expect(
      CalendarEntryRangeSchema.safeParse({ kind: 'AllDay', start: '2026-09-19', end: '2026-09-17' })
        .success,
    ).toBe(false);
    expect(
      CalendarEntryRangeSchema.safeParse({ kind: 'AllDay', start: '2026-02-30', end: null })
        .success,
    ).toBe(false);
  });
});
