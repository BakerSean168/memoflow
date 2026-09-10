import { shallowRef } from 'vue';
/**
 * App-vue session product time facade (ADR-037).
 * Guest bootstrap uses explicit device context; signed-in bootstrap applies canonical preferences.
 * P1: empty kinds via resolveEmptyLabel / emptyKind — no L5 formatDate wrappers.
 */
import type { UserPreferenceProfile } from '@memoflow/contracts/setting';
import {
  createSystemTimeZoneSource,
  createTimeContext,
  createTimeFacade,
  resolveEmptyLabel,
  type TimeFacade,
  type TimeEmptyKind,
  type ResolveEmptyLabelOptions,
} from '@memoflow/time';
import { detectBrowserLocale } from '@memoflow/utils/shared';

export const productTimeRevision = shallowRef(0);

function createLocalSessionTime(): TimeFacade {
  const timeZoneSource = createSystemTimeZoneSource();
  return createTimeFacade({
    context: createTimeContext({
      timeZone: timeZoneSource.currentTimeZoneId(),
      weekStartsOn: 1,
    }),
    presentation: { locale: detectBrowserLocale() },
  });
}

let sessionTime: TimeFacade = createLocalSessionTime();

export function getProductTime(): TimeFacade {
  return sessionTime;
}

/** Apply canonical cross-device regional/presentation preferences to the session facade. */
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
  productTimeRevision.value += 1;
  return sessionTime;
}

/** Product empty label override (i18n / copy). Falls back to canonical TimePresentationStyle.empty. */
export type EmptyLabel = string | { display?: string; unknown?: string };

/** Resolve catalog kind → EmptyLabel string (optional i18n via options.translate). */
export function emptyKind(kind: TimeEmptyKind, options?: ResolveEmptyLabelOptions): string {
  return resolveEmptyLabel(kind, options);
}

/** Common: i18n notSet key for goal/task detail empty. */
export function emptyNotSet(t: (key: string) => string, key = 'goal.detail.notSet'): string {
  return resolveEmptyLabel('notSet', { translate: () => t(key) });
}

/** Common: i18n unknown. */
export function emptyUnknown(t: (key: string) => string, key = 'common.unknown'): string {
  return resolveEmptyLabel('unknown', { translate: () => t(key) });
}

function emptyLabels(override?: EmptyLabel): { display: string; unknown: string } {
  const base = sessionTime.presentation.empty;
  if (override == null) {
    return { display: base.display, unknown: base.unknown };
  }
  if (typeof override === 'string') {
    return { display: override, unknown: override };
  }
  return {
    display: override.display ?? base.display,
    unknown: override.unknown ?? base.unknown,
  };
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

/** List/cell empty-safe dateTime */
export function formatProductDateTime(
  value: number | string | Date | null | undefined,
  empty?: EmptyLabel,
): string {
  const labels = emptyLabels(empty);
  if (value == null || value === '') return labels.display;
  const ms = toMs(value);
  if (ms == null) return labels.unknown;
  return sessionTime.format.dateTime(ms);
}

/** Product-time conversion for native date input values (YYYY-MM-DD). */
export function toProductDateInputValue(value: number | null | undefined): string {
  return sessionTime.input.dateValue(value);
}

/** Parse a native date input value at local product-day midnight. */
export function fromProductDateInputValue(raw: string): number | null {
  const ymd = sessionTime.input.parseDateValue(raw);
  if (ymd == null) return null;
  return sessionTime.input.combine(ymd, '00:00') as number | null;
}

export function formatProductDate(
  value: number | string | Date | null | undefined,
  empty?: EmptyLabel,
): string {
  const labels = emptyLabels(empty);
  if (value == null || value === '') return labels.display;
  const ms = toMs(value);
  if (ms == null) return labels.unknown;
  return sessionTime.format.date(ms);
}

export function formatProductHm(
  value: number | string | Date | null | undefined,
  empty?: EmptyLabel,
): string {
  const ms = toMs(value);
  if (ms == null) {
    return emptyLabels(empty).display;
  }
  return sessionTime.format.hm(ms);
}

export function formatProductPattern(
  value: number | string | Date | null | undefined,
  pattern: string,
  empty?: EmptyLabel,
): string {
  const labels = emptyLabels(empty);
  if (value == null || value === '') return labels.display;
  const ms = toMs(value);
  if (ms == null) return labels.unknown;
  return sessionTime.format.pattern(ms, pattern);
}

export function formatProductDateTimeSeconds(
  value: number | string | Date | null | undefined,
  empty?: EmptyLabel,
): string {
  const labels = emptyLabels(empty);
  if (value == null || value === '') return labels.display;
  const ms = toMs(value);
  if (ms == null) return labels.unknown;
  return sessionTime.format.dateTimeSeconds(ms);
}

export function formatProductRelative(
  value: number | null | undefined,
  empty?: EmptyLabel,
): string {
  if (value == null || !Number.isFinite(value)) {
    return emptyLabels(empty).display;
  }
  return sessionTime.format.relative(value);
}

/** Month short + day (governance cards, compact lists). */
export function formatProductMonthDay(
  value: number | string | Date | null | undefined,
  empty?: EmptyLabel,
): string {
  const labels = emptyLabels(empty);
  if (value == null || value === '') return labels.display;
  const ms = toMs(value);
  if (ms == null) return labels.unknown;
  return sessionTime.format.pattern(ms, 'MMM d');
}

export { sessionTime as productCalendar, resolveEmptyLabel };
export type { TimeEmptyKind };
// Re-export calendar helpers bound to session
export const startOfDayMs = (ms: number) => sessionTime.calendar.startOfDay(ms);
export const endOfDayMs = (ms: number) => sessionTime.calendar.endOfDay(ms);
export const isSameDayMs = (a: number, b: number) => sessionTime.calendar.isSameDay(a, b);
export const isTodayMs = (ms: number) => sessionTime.calendar.isToday(ms);
