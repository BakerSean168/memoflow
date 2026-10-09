import type { Prisma } from '@memoflow/database';

/** Label-owned existence check, including archived facts; never reads content or initializes defaults. */
export function createLabelBusinessDataPresence(
  db: Pick<Prisma.TransactionClient, 'label'>,
): (identityId: string) => Promise<boolean> {
  return async (identityId) => {
    if (await db.label.findFirst({ where: { identityId }, select: { id: true } })) return true;
    return false;
  };
}
