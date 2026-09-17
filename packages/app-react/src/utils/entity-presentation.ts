import { formatProductDateTime, emptyKind } from './product-time';

// Soft residual 1101: presentation 0-fallback toTimestamp keep-boundary (≠ projection/AI/notification).
function toTimestamp(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * Residual 1204: app-react formatEntityDateTime — session product-time + empty catalog dash.
 * Uses toTimestamp 0-fallback; empty → '-'.
 */
export function formatEntityDateTime(value: number | string | null | undefined): string {
  const timestamp = toTimestamp(value);
  if (!timestamp) {
    return emptyKind('dash');
  }
  return formatProductDateTime(timestamp, emptyKind('dash'));
}
