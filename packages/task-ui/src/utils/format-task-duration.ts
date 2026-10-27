/**
 * Soft residual 1243: formatTaskDuration — L4 i18n/Intl dictionary over time duration split (P4).
 * Arithmetic sole: @memoflow/time splitDurationMinutes.
 */
import { splitDurationMinutes } from '@memoflow/time';

export function formatTaskDuration(totalMinutes: number, locale: string): string {
  const { hours, minutes } = splitDurationMinutes(totalMinutes);

  const formatUnit = (value: number, unit: 'hour' | 'minute') =>
    new Intl.NumberFormat(locale, {
      style: 'unit',
      unit,
      unitDisplay: 'short',
      maximumFractionDigits: 0,
    }).format(value);

  if (hours === 0) return formatUnit(minutes, 'minute');
  if (minutes === 0) return formatUnit(hours, 'hour');

  const separator = locale.toLowerCase().startsWith('zh') ? '' : ' ';
  return [formatUnit(hours, 'hour'), formatUnit(minutes, 'minute')].join(separator);
}
