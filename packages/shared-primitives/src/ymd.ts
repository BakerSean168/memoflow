import { z } from 'zod';

/** Portable local calendar day key `YYYY-MM-DD`. */
export type Ymd = string & { readonly __brand: 'Ymd' };

const YMD_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

/** True only for a real proleptic-Gregorian calendar date in four-digit form. */
export function isYmd(value: string): value is Ymd {
  const match = YMD_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

/** Parse an untrusted string into the canonical branded calendar-day primitive. */
export function parseYmd(value: string): Ymd | null {
  return isYmd(value) ? value : null;
}

/** Validate and return the canonical branded calendar-day primitive. */
export function requireYmd(value: string): Ymd {
  const parsed = parseYmd(value);
  if (parsed == null) throw new TypeError(`Invalid calendar date: ${value}`);
  return parsed;
}

/** Strict runtime boundary schema for canonical calendar-day values. */
export const YmdSchema = z.string().refine(isYmd, {
  message: 'Invalid calendar date (expected YYYY-MM-DD)',
}) as unknown as z.ZodType<Ymd>;
