import type { Prisma } from '@memoflow/database';
import { createAiMessageStore, type AiMessageStore } from './message-store.prisma';

/**
 * Transaction-scoped writer for `mastra.mastra_threads` / `mastra.mastra_messages`.
 *
 * It deliberately shares the Profile import transaction instead of calling
 * `AssistantHistoryService` or a Mastra Memory runtime: those use a separate
 * connection pool and would conflict with the import table locks (#865 §3.2).
 */
export type AiMessageImportPort = AiMessageStore;

export function createAiMessageImportPort(
  tx: Pick<Prisma.TransactionClient, '$queryRawUnsafe' | '$executeRawUnsafe'>,
): AiMessageImportPort {
  return createAiMessageStore(tx);
}
