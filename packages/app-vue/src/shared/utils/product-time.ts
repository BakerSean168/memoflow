import { shallowRef } from 'vue';
/**
 * App-vue session product time facade (ADR-037).
 * Guest bootstrap uses explicit device context; signed-in bootstrap applies canonical preferences.
 * P1: empty kinds via resolveEmptyLabel / emptyKind — no L5 formatDate wrappers.
 *
 * Session construction, preferences and the formatter set live in
 * `createProductTimeSession` (@memoflow/time); this module only owns the Vue
 * reactivity and the object-shaped empty-label API the Vue components use.
 */
import type { UserPreferenceProfile } from '@memoflow/setting-contracts';
import type { Ymd } from '@memoflow/shared-primitives';
import {
  createProductTimeSession,
  resolveEmptyLabel,
  type ProductTimeEmptyLabels,
  type TimeEmptyKind,
  type TimeFacade,
  type ResolveEmptyLabelOptions,
} from '@memoflow/time';
import { detectBrowserLocale } from '@memoflow/utils/shared';

export const productTimeRevision = shallowRef(0);

const session = createProductTimeSession({
  locale: detectBrowserLocale(),
  // Vue surfaces an "unknown" label (not the display dash) when a value cannot
  // be parsed. Kept per shell: the React shell returns the display label there.
  invalidValueLabel: 'unknown',
});

export function getProductTime(): TimeFacade {
  return session.getFacade();
}

/** Apply canonical cross-device regional/presentation preferences to the session facade. */
export function setProductTimePreferences(profile: UserPreferenceProfile): TimeFacade {
  const facade = session.setPreferences(profile);
  productTimeRevision.value += 1;
  return facade;
}

/** Product empty label override (i18n / copy). Falls back to canonical TimePresentationStyle.empty. */
export type EmptyLabel = string | { display?: string; unknown?: string };

function toEmptyLabels(override?: EmptyLabel): ProductTimeEmptyLabels | undefined {
  if (override == null) return undefined;
  return typeof override === 'string' ? { display: override, unknown: override } : override;
}

/** Resolve catalog kind → EmptyLabel string (optional i18n via options.translate). */
export function emptyKind(kind: TimeEmptyKind, options?: ResolveEmptyLabelOptions): string {
  return session.emptyKind(kind, options);
}

/** Common: i18n notSet key for goal/task detail empty. */
export function emptyNotSet(t: (key: string) => string, key = 'goal.detail.notSet'): string {
  return session.emptyKind('notSet', { translate: () => t(key) });
}

/** Common: i18n unknown. */
export function emptyUnknown(t: (key: string) => string, key = 'common.unknown'): string {
  return session.emptyKind('unknown', { translate: () => t(key) });
}

/** List/cell empty-safe dateTime */
export function formatProductDateTime(
  value: number | string | Date | null | undefined,
  empty?: EmptyLabel,
): string {
  return session.formatDateTime(value, toEmptyLabels(empty));
}

/** Product-time conversion for native date input values (YYYY-MM-DD). */
export function toProductDateInputValue(value: number | null | undefined): string {
  return session.toDateInputValue(value);
}

/** Parse a native date input value at local product-day midnight. */
export function fromProductDateInputValue(raw: string): number | null {
  return session.fromDateInputValue(raw);
}

/** Calendar-native Goal/date-only input value. Never converts through Instant/JS Date. */
export function toProductYmdInputValue(value: Ymd | null | undefined): string {
  return session.toYmdInputValue(value);
}

/** Parse a native date input as canonical Ymd without applying a timezone. */
export function fromProductYmdInputValue(raw: string): Ymd | null {
  return session.fromYmdInputValue(raw);
}

/** Render a calendar-native Ymd without host-timezone reinterpretation. */
export function formatProductYmd(value: Ymd | null | undefined, empty?: EmptyLabel): string {
  return session.formatYmd(value, toEmptyLabels(empty));
}

/** Current product calendar day in the signed-in user's canonical timezone. */
export function getProductTodayYmd(): Ymd {
  return session.getTodayYmd();
}

/** Current product presentation locale without exposing the TimeFacade to UI components. */
export function getProductLocale(): string {
  return session.getLocale();
}

/** Current product week-start preference without exposing the TimeFacade to UI components. */
export function getProductWeekStartsOn(): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  return session.getWeekStartsOn();
}

export function formatProductDate(
  value: number | string | Date | null | undefined,
  empty?: EmptyLabel,
): string {
  return session.formatDate(value, toEmptyLabels(empty));
}

export function formatProductHm(
  value: number | string | Date | null | undefined,
  empty?: EmptyLabel,
): string {
  return session.formatHm(value, toEmptyLabels(empty));
}

export function formatProductPattern(
  value: number | string | Date | null | undefined,
  pattern: string,
  empty?: EmptyLabel,
): string {
  return session.formatPattern(value, pattern, toEmptyLabels(empty));
}

export function formatProductDateTimeSeconds(
  value: number | string | Date | null | undefined,
  empty?: EmptyLabel,
): string {
  return session.formatDateTimeSeconds(value, toEmptyLabels(empty));
}

export function formatProductRelative(
  value: number | null | undefined,
  empty?: EmptyLabel,
): string {
  return session.formatRelative(value, toEmptyLabels(empty));
}

/** Month short + day for compact product lists. */
export function formatProductMonthDay(
  value: number | string | Date | null | undefined,
  empty?: EmptyLabel,
): string {
  return session.formatMonthDay(value, toEmptyLabels(empty));
}

export { resolveEmptyLabel };
export type { TimeEmptyKind };
// Calendar helpers bound to the session
export const startOfDayMs = (ms: number) => session.startOfDayMs(ms);
export const endOfDayMs = (ms: number) => session.endOfDayMs(ms);
export const isSameDayMs = (a: number, b: number) => session.isSameDayMs(a, b);
export const isTodayMs = (ms: number) => session.isTodayMs(ms);
