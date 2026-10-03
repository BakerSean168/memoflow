/**
 * Residual 989: sole Express query value parsers for notification + reminder routes.
 * Residual 1021: parseBoolean elevated for notification query filters (true/false/1/0).
 * Shared query adapters consume parseString/parseNumber from this sole implementation.
 * parseString prefers first array entry / stringifies scalars; parseNumber uses it.
 * Soft residual: schedule route parsers remain keep-boundary (empty-string / boolean shapes differ).
 * Soft residual 1073: schedule route parsers keep-boundary surface (no force-merge).
 * Soft residual: goal parseBoolean sole (residual 985) is true/false-only, not this dual body.
 * Soft residual 1067: goal parseNumber + parseStringArray keep-boundary (no force-merge).
 */

export function parseString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value.length > 0 ? String(value[0]) : undefined;
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
}

export function parseNumber(value: unknown): number | undefined {
  const raw = parseString(value);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Residual 1021: query boolean parser for notification list filters.
 * Accepts "true"/"false"/"1"/"0" after parseString normalization.
 */
export function parseBoolean(value: unknown): boolean | undefined {
  const raw = parseString(value);
  if (raw === undefined) return undefined;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return undefined;
}
