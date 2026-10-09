import type { Prisma } from '@memoflow/database';

/** Task-owned existence check, including archived facts; never reads content or initializes defaults. */
export function createTaskBusinessDataPresence(
  db: Pick<Prisma.TransactionClient, 'taskPlan' | 'taskOccurrence'>,
): (identityId: string) => Promise<boolean> {
  return async (identityId) => {
    if (await db.taskPlan.findFirst({ where: { identityId }, select: { id: true } })) return true;
    if (await db.taskOccurrence.findFirst({ where: { identityId }, select: { id: true } }))
      return true;
    return false;
  };
}
