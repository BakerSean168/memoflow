import type { Prisma } from '@memoflow/database';
import { z } from 'zod';

/** Include Mastra history: conversation-shell portability alone does not cover AI user data. */
export function createAiBusinessDataPresence(
  db: Pick<
    Prisma.TransactionClient,
    | 'aiConversation'
    | 'aiExecutionRecord'
    | 'aiProviderConfig'
    | 'aiProviderSecret'
    | 'aiProviderOnboardingSession'
    | '$queryRaw'
  >,
): (identityId: string) => Promise<boolean> {
  return async (identityId) => {
    if (await db.aiConversation.findFirst({ where: { identityId }, select: { id: true } }))
      return true;
    if (await db.aiExecutionRecord.findFirst({ where: { identityId }, select: { id: true } }))
      return true;
    if (await db.aiProviderConfig.findFirst({ where: { identityId }, select: { id: true } }))
      return true;
    if (await db.aiProviderSecret.findFirst({ where: { identityId }, select: { id: true } }))
      return true;
    if (
      await db.aiProviderOnboardingSession.findFirst({
        where: { identityId },
        select: { id: true },
      })
    )
      return true;
    // API's Mastra storage owns this schema. Missing/unavailable tables throw;
    // the Account summary reports unknown rather than claiming an empty account.
    const rows = z
      .array(z.object({ present: z.boolean() }))
      .length(1)
      .parse(
        await db.$queryRaw`
      SELECT EXISTS (SELECT 1 FROM mastra.mastra_threads WHERE "resourceId" = ${identityId})
        OR EXISTS (SELECT 1 FROM mastra.mastra_messages WHERE "resourceId" = ${identityId})
        OR EXISTS (SELECT 1 FROM mastra.mastra_workflow_snapshot WHERE "resourceId" = ${identityId})
        AS present
    `,
      );
    return rows[0]!.present;
  };
}
