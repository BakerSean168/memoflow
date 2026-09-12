/**
 * App-react session product time facade (ADR-037 P1/P2).
 * Single session — Screens must not createTimeFacade for routine display.
 */
import type { UserPreferenceProfile } from '@memoflow/contracts/setting';
import type { Ymd } from '@memoflow/contracts/primitives';
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

export function parseProductYmdInput(value: string): Ymd | null {
  return sessionTime.input.parseDateValue(value.trim());
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
