/**
 * App-react session product time facade (ADR-037 P1/P2).
 * Single session — Screens must not createTimeFacade for routine display.
 *
 * Session construction, preferences and the formatter set live in
 * `createProductTimeSession` (@memoflow/time); this module only keeps the React
 * locale detection and the string-shaped empty-label API the screens use.
 */
import type { UserPreferenceProfile } from '@memoflow/setting-contracts';
import type { Ymd } from '@memoflow/shared-primitives';
import type { GoalTimeframe } from '@memoflow/goal-contracts';
import {
  createProductTimeSession,
  resolveEmptyLabel,
  type TimeEmptyKind,
  type TimeFacade,
  type ResolveEmptyLabelOptions,
} from '@memoflow/time';

function resolveSystemLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  } catch {
    return 'en-US';
  }
}

const session = createProductTimeSession({
  locale: resolveSystemLocale(),
  empty: {
    display: resolveEmptyLabel('emdash'),
    unknown: resolveEmptyLabel('unknown'),
  },
  // React falls back to the display label (not "unknown") for unparsable
  // values. Kept per shell: the Vue shell returns the unknown label there.
  invalidValueLabel: 'display',
});

export function getProductTime(): TimeFacade {
  return session.getFacade();
}

/** Apply canonical cross-device presentation/regional preferences to the React session facade. */
export function setProductTimePreferences(profile: UserPreferenceProfile): TimeFacade {
  return session.setPreferences(profile);
}

/** Restore guest/signed-out Product Time to the device locale/timezone source. */
export function resetProductTimePreferences(): TimeFacade {
  return session.reset();
}

export function emptyKind(kind: TimeEmptyKind, options?: ResolveEmptyLabelOptions): string {
  return session.emptyKind(kind, options);
}

/** Empty-safe date via session (optional empty override string). */
export function formatProductYmd(value: Ymd | null | undefined, empty?: string): string {
  return session.formatYmd(value, { display: empty, unknown: empty });
}

export function getProductTodayYmd(): Ymd {
  return session.getTodayYmd();
}

export function parseProductYmdInput(value: string): Ymd | null {
  return session.fromYmdInputValue(value.trim());
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
  return session.formatDate(value, { display: empty });
}

/** Empty-safe dateTime via session. */
export function formatProductDateTime(
  value: number | string | Date | null | undefined,
  empty?: string,
): string {
  return session.formatDateTime(value, { display: empty });
}

/** Relative product time via session facade. */
export function formatProductRelative(value: number | null | undefined, empty?: string): string {
  return session.formatRelative(value, { display: empty });
}

export { resolveEmptyLabel };
export type { TimeEmptyKind, TimeFacade };
