import type { Prisma } from '@memoflow/database';

/** Goal-owned existence check, including archived facts; never reads content or initializes defaults. */
export function createGoalBusinessDataPresence(
  db: Pick<Prisma.TransactionClient, 'goal' | 'habit' | 'walletAccount' | 'walletTransaction'>,
): (identityId: string) => Promise<boolean> {
  return async (identityId) => {
    if (await db.goal.findFirst({ where: { identityId }, select: { id: true } })) return true;
    if (await db.habit.findFirst({ where: { identityId }, select: { id: true } })) return true;
    if (await db.walletAccount.findFirst({ where: { identityId }, select: { id: true } }))
      return true;
    if (await db.walletTransaction.findFirst({ where: { identityId }, select: { id: true } }))
      return true;
    return false;
  };
}
