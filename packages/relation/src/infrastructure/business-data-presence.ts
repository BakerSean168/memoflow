import type { Prisma } from '@memoflow/database';

/** Relation-owned existence check, including archived facts; never reads content or initializes defaults. */
export function createRelationBusinessDataPresence(
  db: Pick<Prisma.TransactionClient, 'relation'>,
): (identityId: string) => Promise<boolean> {
  return async (identityId) => {
    if (await db.relation.findFirst({ where: { identityId }, select: { id: true } })) return true;
    return false;
  };
}
