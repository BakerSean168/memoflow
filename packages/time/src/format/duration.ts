/**
 * Duration arithmetic sole (ADR-037 P4).
 * Modules may supply i18n label dictionaries; h/m/s split lives here only.
 */
import type { TimePresentationStyle } from '../types';

export interface DurationParts {
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
  totalMinutes: number;
}

export function splitDurationMs(ms: number): DurationParts {
  const safe = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safe / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    hours,
    minutes,
    seconds,
    totalMs: safe,
    totalMinutes: Math.floor(safe / 60_000),
  };
}

export function splitDurationMinutes(totalMinutes: number): DurationParts {
  const safe = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return {
    hours,
    minutes,
    seconds: 0,
    totalMs: safe * 60_000,
    totalMinutes: safe,
  };
}

export function formatDurationParts(
  parts: DurationParts,
  style: TimePresentationStyle,
  labels?: {
    hours?: (n: number) => string;
    minutes?: (n: number) => string;
    seconds?: (n: number) => string;
    join?: string;
  },
): string {
  if (parts.totalMs === 0 && parts.totalMinutes === 0) {
    return style.duration.zero;
  }
  const hLabel =
    labels?.hours ?? ((n) => (style.duration.style === 'long' ? `${n} hours` : `${n}h`));
  const mLabel =
    labels?.minutes ?? ((n) => (style.duration.style === 'long' ? `${n} minutes` : `${n}m`));
  const sLabel =
    labels?.seconds ?? ((n) => (style.duration.style === 'long' ? `${n} seconds` : `${n}s`));
  const join = labels?.join ?? (style.locale.toLowerCase().startsWith('zh') ? '' : ' ');
  const chunks: string[] = [];
  if (parts.hours > 0) chunks.push(hLabel(parts.hours));
  if (parts.minutes > 0) chunks.push(mLabel(parts.minutes));
  if (parts.hours === 0 && parts.minutes === 0 && parts.seconds > 0) {
    chunks.push(sLabel(parts.seconds));
  }
  if (chunks.length === 0) return style.duration.zero;
  return chunks.join(join);
}
