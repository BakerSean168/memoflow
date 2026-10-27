import type { Prisma } from '@memoflow/database';

/** Routine-owned existence check, including archived facts; never reads content or initializes defaults. */
export function createRoutineBusinessDataPresence(
  db: Pick<
    Prisma.TransactionClient,
    | 'routineDefinition'
    | 'routineProfile'
    | 'routineProtocolDefinition'
    | 'routineProtocolSession'
    | 'routineOccurrence'
    | 'routineInteraction'
  >,
): (identityId: string) => Promise<boolean> {
  return async (identityId) => {
    if (await db.routineDefinition.findFirst({ where: { identityId }, select: { id: true } }))
      return true;
    if (await db.routineProfile.findFirst({ where: { identityId }, select: { id: true } }))
      return true;
    if (
      await db.routineProtocolDefinition.findFirst({ where: { identityId }, select: { id: true } })
    )
      return true;
    if (await db.routineProtocolSession.findFirst({ where: { identityId }, select: { id: true } }))
      return true;
    if (await db.routineOccurrence.findFirst({ where: { identityId }, select: { id: true } }))
      return true;
    if (await db.routineInteraction.findFirst({ where: { identityId }, select: { id: true } }))
      return true;
    return false;
  };
}
