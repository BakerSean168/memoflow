import { requireYmd, type Ymd } from '@memoflow/contracts/primitives';

export type ParsedProductDateInput =
  | { kind: 'day'; date: Ymd }
  | { kind: 'month'; year: number; month: number }
  | { kind: 'quarter'; year: number; quarter: 1 | 2 | 3 | 4 }
  | { kind: 'halfYear'; year: number; half: 1 | 2 }
  | { kind: 'year'; year: number };

const MONTHS = new Map(
  [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ].flatMap((name, index) => [[name, index + 1] as const, [name.slice(0, 3), index + 1] as const]),
);

function validYear(value: string): number | null {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1 && year <= 9999 ? year : null;
}

function validYmd(year: number, month: number, day: number): Ymd | null {
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  try {
    return requireYmd(
      `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    );
  } catch {
    return null;
  }
}

export function parseExplicitProductDateInput(raw: string): ParsedProductDateInput | null {
  const input = raw.trim();
  if (!input) return null;

  let match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(input);
  if (match) {
    const year = validYear(match[1]!);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = year ? validYmd(year, month, day) : null;
    return date ? { kind: 'day', date } : null;
  }

  match = /^(\d{4})年(\d{1,2})月(?:(\d{1,2})日?)?$/.exec(input);
  if (match) {
    const year = validYear(match[1]!);
    const month = Number(match[2]);
    if (!year || month < 1 || month > 12) return null;
    if (match[3]) {
      const date = validYmd(year, month, Number(match[3]));
      return date ? { kind: 'day', date } : null;
    }
    return { kind: 'month', year, month };
  }

  match = /^(?:q([1-4])\s+(\d{4})|(\d{4})\s+q([1-4]))$/i.exec(input);
  if (match) {
    const year = validYear(match[2] ?? match[3] ?? '');
    const quarter = Number(match[1] ?? match[4]) as 1 | 2 | 3 | 4;
    return year ? { kind: 'quarter', year, quarter } : null;
  }

  match = /^(\d{4})年q([1-4])$/i.exec(input);
  if (match) {
    const year = validYear(match[1]!);
    return year ? { kind: 'quarter', year, quarter: Number(match[2]) as 1 | 2 | 3 | 4 } : null;
  }

  match = /^(?:h([12])\s+(\d{4})|(\d{4})\s+h([12]))$/i.exec(input);
  if (match) {
    const year = validYear(match[2] ?? match[3] ?? '');
    const half = Number(match[1] ?? match[4]) as 1 | 2;
    return year ? { kind: 'halfYear', year, half } : null;
  }

  match = /^(\d{4})年h([12])$/i.exec(input);
  if (match) {
    const year = validYear(match[1]!);
    return year ? { kind: 'halfYear', year, half: Number(match[2]) as 1 | 2 } : null;
  }

  match = /^([A-Za-z]+)\s+(\d{4})$/.exec(input) ?? /^(\d{4})\s+([A-Za-z]+)$/.exec(input);
  if (match) {
    const firstIsYear = /^\d{4}$/.test(match[1]!);
    const year = validYear(firstIsYear ? match[1]! : match[2]!);
    const monthName = (firstIsYear ? match[2]! : match[1]!).toLowerCase();
    const month = MONTHS.get(monthName);
    return year && month ? { kind: 'month', year, month } : null;
  }

  match = /^(\d{4})年$/.exec(input) ?? /^(\d{4})$/.exec(input);
  if (match) {
    const year = validYear(match[1]!);
    return year ? { kind: 'year', year } : null;
  }

  return null;
}

export function parsedProductDateStartYmd(value: ParsedProductDateInput): Ymd {
  if (value.kind === 'day') return value.date;
  if (value.kind === 'month')
    return requireYmd(`${value.year}-${String(value.month).padStart(2, '0')}-01`);
  if (value.kind === 'quarter') {
    const month = (value.quarter - 1) * 3 + 1;
    return requireYmd(`${value.year}-${String(month).padStart(2, '0')}-01`);
  }
  if (value.kind === 'halfYear') {
    return requireYmd(`${value.year}-${value.half === 1 ? '01' : '07'}-01`);
  }
  return requireYmd(`${value.year}-01-01`);
}
