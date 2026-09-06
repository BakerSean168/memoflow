/**
 * Residual 985: sole parseBoolean helper for goal API routes.
 * Goal routes import this; local duals retired.
 * Query string "true"/"false" → boolean; otherwise undefined.
 * Soft residual 1113: data-portability toBoolean keep-boundary (fallback + numbers; no force-merge).
 */

export function parseBoolean(value: unknown): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}
