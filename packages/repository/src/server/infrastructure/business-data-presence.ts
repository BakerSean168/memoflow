import type { Prisma } from '@memoflow/database';

/** Repository-owned existence check, including archived facts; never reads content or initializes defaults. */
export function createRepositoryBusinessDataPresence(
  db: Pick<Prisma.TransactionClient, 'knowledgeRemoteBinding' | 'knowledgeWriteRequest'>,
): (identityId: string) => Promise<boolean> {
  return async (identityId) => {
    if (await db.knowledgeRemoteBinding.findFirst({ where: { identityId }, select: { id: true } }))
      return true;
    if (await db.knowledgeWriteRequest.findFirst({ where: { identityId }, select: { id: true } }))
      return true;
    return false;
  };
}
