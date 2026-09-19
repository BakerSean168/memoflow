import { z } from 'zod';
import { requireYmd, YmdSchema, type Ymd } from '../../../primitives';

const GoalYearSchema = z.number().int().min(1).max(9999);

export const GoalTimeframeKindSchema = z.enum(['day', 'month', 'quarter', 'halfYear', 'year']);

/**
 * Goal target precision. The discriminant is product meaning, not a storage hint.
 * A month/quarter/half-year/year target must never be collapsed into a fake deadline day.
 */
export const GoalTimeframeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('day'), date: YmdSchema }).strict(),
  z
    .object({
      kind: z.literal('month'),
      year: GoalYearSchema,
      month: z.number().int().min(1).max(12),
    })
    .strict(),
  z
    .object({
      kind: z.literal('quarter'),
      year: GoalYearSchema,
      quarter: z.number().int().min(1).max(4),
    })
    .strict(),
  z
    .object({
      kind: z.literal('halfYear'),
      year: GoalYearSchema,
      half: z.number().int().min(1).max(2),
    })
    .strict(),
  z.object({ kind: z.literal('year'), year: GoalYearSchema }).strict(),
]);

export type GoalTimeframe = z.infer<typeof GoalTimeframeSchema>;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

function ymd(year: number, month: number, day: number): Ymd {
  return requireYmd(
    `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  );
}

/** First calendar day represented by a Goal target, without timezone conversion. */
export function goalTimeframeStartBoundary(target: GoalTimeframe): Ymd {
  switch (target.kind) {
    case 'day':
      return target.date;
    case 'month':
      return ymd(target.year, target.month, 1);
    case 'quarter':
      return ymd(target.year, (target.quarter - 1) * 3 + 1, 1);
    case 'halfYear':
      return ymd(target.year, target.half === 1 ? 1 : 7, 1);
    case 'year':
      return ymd(target.year, 1, 1);
  }
}

/** Last calendar day represented by a Goal target, without inventing a product deadline. */
export function goalTimeframeEndBoundary(target: GoalTimeframe): Ymd {
  switch (target.kind) {
    case 'day':
      return target.date;
    case 'month':
      return ymd(target.year, target.month, daysInMonth(target.year, target.month));
    case 'quarter': {
      const month = target.quarter * 3;
      return ymd(target.year, month, daysInMonth(target.year, month));
    }
    case 'halfYear':
      return target.half === 1 ? ymd(target.year, 6, 30) : ymd(target.year, 12, 31);
    case 'year':
      return ymd(target.year, 12, 31);
  }
}

/** Passing the target period is a derived signal only; it never mutates Goal lifecycle. */
export function isPastGoalTarget(target: GoalTimeframe | null, today: Ymd): boolean {
  return target != null && today > goalTimeframeEndBoundary(target);
}

/** Deterministic ordering by the semantic end of the target period. */
export function compareGoalTimeframesByEnd(
  left: GoalTimeframe | null,
  right: GoalTimeframe | null,
): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  const leftEnd = goalTimeframeEndBoundary(left);
  const rightEnd = goalTimeframeEndBoundary(right);
  return leftEnd < rightEnd ? -1 : leftEnd > rightEnd ? 1 : 0;
}

/** Compact product label that preserves the precision the user actually chose. */
export function goalTimeframeLabel(target: GoalTimeframe, locale = 'en'): string {
  const zh = locale.toLowerCase().startsWith('zh');
  switch (target.kind) {
    case 'day':
      return target.date;
    case 'month':
      return zh
        ? `${target.year} 年 ${target.month} 月`
        : `${target.year}-${String(target.month).padStart(2, '0')}`;
    case 'quarter':
      return `${target.year} Q${target.quarter}`;
    case 'halfYear':
      return `${target.year} H${target.half}`;
    case 'year':
      return zh ? `${target.year} 年` : String(target.year);
  }
}

export type GoalTimeframeKind = GoalTimeframe['kind'];

/**
 * Reconstruct the semantic timeframe from the normalized persistence pair.
 * The pair is accepted only when the supplied end day is canonical for its precision.
 */
export function goalTimeframeFromEndBoundary(kind: GoalTimeframeKind, endDate: Ymd): GoalTimeframe {
  const canonicalEnd = requireYmd(endDate);
  const [year, month] = canonicalEnd.split('-').map(Number);
  let candidate: GoalTimeframe;
  switch (kind) {
    case 'day':
      candidate = { kind, date: canonicalEnd };
      break;
    case 'month':
      candidate = { kind, year, month };
      break;
    case 'quarter':
      candidate = { kind, year, quarter: month / 3 };
      break;
    case 'halfYear':
      candidate = { kind, year, half: month === 6 ? 1 : month === 12 ? 2 : 0 };
      break;
    case 'year':
      candidate = { kind, year };
      break;
  }
  const invalidPair = () =>
    new TypeError(`Non-canonical GoalTimeframe persistence pair: ${kind}/${canonicalEnd}`);
  const parsed = GoalTimeframeSchema.safeParse(candidate);
  if (!parsed.success || goalTimeframeEndBoundary(parsed.data) !== canonicalEnd) {
    throw invalidPair();
  }
  return parsed.data;
}
