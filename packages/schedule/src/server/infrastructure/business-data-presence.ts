import type { Prisma } from '@memoflow/database';

/** Schedule-owned existence check, including archived facts; never reads content or initializes defaults. */
export function createScheduleBusinessDataPresence(
  db: Pick<Prisma.TransactionClient, 'schedule'>,
): (identityId: string) => Promise<boolean> {
  return async (identityId) => {
    if (await db.schedule.findFirst({ where: { identityId }, select: { id: true } })) return true;
    return false;
  };
}
