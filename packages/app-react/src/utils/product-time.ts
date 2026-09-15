/**
 * App-react session product time facade (ADR-037 P1/P2).
 * Single session — Screens must not createTimeFacade for routine display.
 */
import type { UserPreferenceProfile } from '@memoflow/contracts/setting';
import type { Ymd } from '@memoflow/contracts/primitives';
import type { GoalTimeframe } from '@memoflow/contracts/goal';
import {
  createSystemTimeZoneSource,
  createTimeContext,
  createTimeFacade,
  resolveEmptyLabel,
  type TimeFacade,
  type TimeEmptyKind,
  type ResolveEmptyLabelOptions,
} from '@memoflow/time';

function resolveSystemLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  } catch {
    return 'en-US';
  }
}

function createLocalSessionTime(): TimeFacade {
  const timeZoneSource = createSystemTimeZoneSource();
  return createTimeFacade({
    context: createTimeContext({
      timeZone: timeZoneSource.currentTimeZoneId(),
      weekStartsOn: 1,
    }),
    presentation: {
      locale: resolveSystemLocale(),
      empty: {
        display: resolveEmptyLabel('emdash'),
        unknown: resolveEmptyLabel('unknown'),
      },
    },
  });
}

let sessionTime: TimeFacade = createLocalSessionTime();

export function getProductTime(): TimeFacade {
  return sessionTime;
}

/** Apply canonical cross-device presentation/regional preferences to the React session facade. */
export function setProductTimePreferences(profile: UserPreferenceProfile): TimeFacade {
  sessionTime = sessionTime
    .withContext(
      createTimeContext({
        timeZone: profile.regional.timeZone,
        weekStartsOn: profile.regional.weekStartsOn,
      }),
    )
    .withPresentation({
      locale: profile.presentation.language,
      dateStyle: profile.regional.dateStyle,
      timeStyle: profile.regional.timeStyle,
    });
  return sessionTime;
}

/** Restore guest/signed-out Product Time to the device locale/timezone source. */
export function resetProductTimePreferences(): TimeFacade {
  sessionTime = createLocalSessionTime();
  return sessionTime;
}

export function emptyKind(kind: TimeEmptyKind, options?: ResolveEmptyLabelOptions): string {
  return resolveEmptyLabel(kind, options);
}

function toMs(value: number | string | Date | null | undefined): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Empty-safe date via session (optional empty override string). */
export function formatProductYmd(value: Ymd | null | undefined, empty?: string): string {
  if (value == null) return empty ?? sessionTime.presentation.empty.display;
  return sessionTime.format.ymdDisplay(value) || (empty ?? sessionTime.presentation.empty.unknown);
}

export function getProductTodayYmd(): Ymd {
  return sessionTime.calendar.toYmd(sessionTime.now());
}

export function parseProductYmdInput(value: string): Ymd | null {
  return sessionTime.input.parseDateValue(value.trim());
}

/** Mobile-friendly precision-preserving Goal target parser. */
export function parseGoalTimeframeInput(value: string): GoalTimeframe | null {
  const input = value.trim();
  if (!input) return null;

  const day = parseProductYmdInput(input.replace(/\//g, '-'));
  if (day) return { kind: 'day', date: day };

  const month = /^(\d{4})-(\d{1,2})$/.exec(input);
  if (month) {
    const year = Number(month[1]);
    const monthValue = Number(month[2]);
    if (year >= 1 && year <= 9999 && monthValue >= 1 && monthValue <= 12) {
      return { kind: 'month', year, month: monthValue };
    }
  }

  const quarter = /^(?:Q([1-4])\s+(\d{4})|(\d{4})\s*Q([1-4]))$/i.exec(input);
  if (quarter) {
    const year = Number(quarter[2] ?? quarter[3]);
    const quarterValue = Number(quarter[1] ?? quarter[4]);
    if (year >= 1 && year <= 9999) return { kind: 'quarter', year, quarter: quarterValue };
    return null;
  }

  const half = /^(?:H([12])\s+(\d{4})|(\d{4})\s*H([12]))$/i.exec(input);
  if (half) {
    const year = Number(half[2] ?? half[3]);
    const halfValue = Number(half[1] ?? half[4]);
    if (year >= 1 && year <= 9999) return { kind: 'halfYear', year, half: halfValue };
    return null;
  }

  if (/^\d{4}$/.test(input)) {
    const year = Number(input);
    return year >= 1 && year <= 9999 ? { kind: 'year', year } : null;
  }
  return null;
}

export function goalTimeframeInputValue(target: GoalTimeframe | null | undefined): string {
  if (!target) return '';
  switch (target.kind) {
    case 'day':
      return target.date;
    case 'month':
      return `${String(target.year).padStart(4, '0')}-${String(target.month).padStart(2, '0')}`;
    case 'quarter':
      return `${target.year} Q${target.quarter}`;
    case 'halfYear':
      return `${target.year} H${target.half}`;
    case 'year':
      return String(target.year);
  }
}

export function formatProductDate(
  value: number | string | Date | null | undefined,
  empty?: string,
): string {
  const ms = toMs(value);
  if (ms == null) return empty ?? sessionTime.presentation.empty.display;
  return sessionTime.format.date(ms, empty != null ? { empty: { display: empty } } : undefined);
}

/** Empty-safe dateTime via session. */
export function formatProductDateTime(
  value: number | string | Date | null | undefined,
  empty?: string,
): string {
  const ms = toMs(value);
  if (ms == null) return empty ?? sessionTime.presentation.empty.display;
  return sessionTime.format.dateTime(ms, empty != null ? { empty: { display: empty } } : undefined);
}

/** Relative product time via session facade. */
export function formatProductRelative(value: number | null | undefined, empty?: string): string {
  if (value == null || !Number.isFinite(value)) {
    return empty ?? sessionTime.presentation.empty.display;
  }
  return sessionTime.format.relative(value);
}

export { resolveEmptyLabel };
export type { TimeEmptyKind, TimeFacade };
