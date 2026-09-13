/**
 * Residual 983: sole getFirstQueryValue helper for task API routes.
 * Instance + plan routes import this; local duals retired.
 * Express query values may be string | string[]; prefer first string entry.
 */

export function getFirstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined;
  }

  return typeof value === 'string' ? value : undefined;
}
