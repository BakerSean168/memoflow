import { parseTimeZoneId, type TimeZoneId } from '@memoflow/contracts/primitives';

// Stable choices for runtimes without supportedValuesOf; saved overrides are always added.
const FALLBACK_TIME_ZONES = [
  'UTC',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'America/Anchorage',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Chicago',
  'America/Denver',
  'America/Halifax',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Phoenix',
  'America/Sao_Paulo',
  'America/St_Johns',
  'America/Toronto',
  'America/Vancouver',
  'Asia/Bangkok',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Jerusalem',
  'Asia/Kathmandu',
  'Asia/Kolkata',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Taipei',
  'Asia/Tokyo',
  'Australia/Adelaide',
  'Australia/Brisbane',
  'Australia/Darwin',
  'Australia/Perth',
  'Australia/Sydney',
  'Europe/Berlin',
  'Europe/Istanbul',
  'Europe/London',
  'Europe/Moscow',
  'Europe/Paris',
  'Pacific/Auckland',
  'Pacific/Honolulu',
] as const;

type SupportedValuesProvider = (key: 'timeZone') => readonly string[];

function runtimeProvider(): SupportedValuesProvider | undefined {
  const intl = Intl as typeof Intl & { supportedValuesOf?: SupportedValuesProvider };
  return typeof intl.supportedValuesOf === 'function'
    ? intl.supportedValuesOf.bind(intl)
    : undefined;
}

export function productTimeZoneOptions(
  productZone: string,
  persistedZone: string,
  provider: SupportedValuesProvider | null | undefined = runtimeProvider(),
): TimeZoneId[] {
  let supported: readonly string[] = FALLBACK_TIME_ZONES;
  try {
    const values = provider?.('timeZone');
    if (values?.length) supported = values;
  } catch {
    // Feature detection alone is insufficient on runtimes with partial Intl support.
  }
  return [...new Set(['UTC', productZone, persistedZone, ...supported])]
    .filter((value): value is TimeZoneId => parseTimeZoneId(value) != null)
    .sort();
}

export function humanizeTimeZone(value: string): string {
  return value.replace(/_/g, ' ').replace(/\//g, ' / ');
}
