/**
 * Prisma unique-constraint guard (goal application layer).
 *
 * Detects a Prisma unique-constraint conflict via the structured Prisma error
 * mapping (code `P2002` → `CONFLICT`) from `@memoflow/utils/errors`, never by
 * branching on raw message text.
 */

import { mapPrismaError } from '@memoflow/utils/errors';

export function isPrismaUniqueConstraintError(err: unknown): boolean {
  return mapPrismaError(err)?.resultCode === 'CONFLICT';
}
