/**
 * Shared object guards.
 *
 * `isRecord` means a non-null, non-array object. Two call sites intentionally keep
 * their own wider guards (arrays allowed) and must not be merged:
 * - @memoflow/transport-contracts Result error shaping
 * - apps/desktop HTTP envelope guards
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
