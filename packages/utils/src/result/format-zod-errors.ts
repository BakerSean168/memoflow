/**
 * Residual 945: sole formatZodErrors helper body.
 * Express and IPC result adapters share this; local dual bodies retired.
 */
import type { ResultErrorDetail } from '@memoflow/transport-contracts/result';

/**
 * Format Zod issues into ResultErrorDetail array.
 */
export function formatZodErrors(
  issues: Array<{ path: PropertyKey[]; message: string }>,
): ResultErrorDetail[] {
  return issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    code: 'INVALID_FIELD',
    message: issue.message,
  }));
}
