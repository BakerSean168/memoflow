import type { PrismaClient } from '@memoflow/database';
import type { AssistantConversationMessageCountSource } from '../../../application/services/assistant-conversation-external-source';

interface CountRow {
  readonly id: string;
  readonly messageCount: number;
}

/**
 * Counts product messages per owned conversation without reading bodies.
 *
 * Mastra owns the transcript tables, so the count joins the product shell to
 * `mastra.mastra_messages`. Role filtering matches the runtime history
 * projection: only roles an external reader can see are counted, which keeps
 * `total`/`hasMore` consistent with the returned transcript page.
 */
export function createAssistantConversationMessageCountSource(
  prisma: Pick<PrismaClient, '$queryRaw'>,
): AssistantConversationMessageCountSource {
  return {
    async countsByIdentity(identityId) {
      const rows = await prisma.$queryRaw<CountRow[]>`
        SELECT c.id, COUNT(m.id)::int AS "messageCount"
        FROM ai_conversations c
        LEFT JOIN mastra.mastra_messages m
          ON m.thread_id = c.id AND m.role IN ('user', 'assistant', 'system', 'signal')
        WHERE c.identity_id = ${identityId} AND c.deleted_at IS NULL
        GROUP BY c.id
      `;
      return new Map(rows.map((row) => [row.id, Number(row.messageCount)]));
    },

    async countByIdentity(identityId, conversationId) {
      const rows = await prisma.$queryRaw<CountRow[]>`
        SELECT c.id, COUNT(m.id)::int AS "messageCount"
        FROM ai_conversations c
        LEFT JOIN mastra.mastra_messages m
          ON m.thread_id = c.id AND m.role IN ('user', 'assistant', 'system', 'signal')
        WHERE c.identity_id = ${identityId}
          AND c.deleted_at IS NULL
          AND c.id = ${conversationId}
        GROUP BY c.id
      `;
      return Number(rows[0]?.messageCount ?? 0);
    },
  };
}
