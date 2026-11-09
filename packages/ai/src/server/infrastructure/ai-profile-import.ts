import type { Prisma } from '@memoflow/database';
import type { PortableCapability } from '@memoflow/data-portability-contracts';
import {
  createAIConversationMessagesPortableCapability,
  type AiMessageArchiveLoader,
} from '../application/ai-conversation-messages-portability';
import { createAIConversationPortableCapability } from '../application/ai-conversation-portability';
import { AIConversationPrismaRepository } from './adapters/prisma/ai-conversation-prisma.repository';
import { createAiMessageExportReader } from '../mastra/runtime/message-export.reader';
import { createAiMessageImportPort } from '../mastra/runtime/message-import.port';

export function createAiPrismaPortableCapability(tx: Prisma.TransactionClient) {
  return createAIConversationPortableCapability(new AIConversationPrismaRepository(tx));
}

export interface AiProfileImportCapabilityOptions {
  /**
   * Parsed archive lines staged by Data Portability. Commit never re-parses
   * client bytes; a missing loader fails closed on apply.
   */
  readonly messageArchive?: AiMessageArchiveLoader;
}

export function createAiProfileImportCapabilities(
  tx: Prisma.TransactionClient,
  options: AiProfileImportCapabilityOptions = {},
): readonly PortableCapability<unknown>[] {
  const importPort = createAiMessageImportPort(tx);
  return [
    createAiPrismaPortableCapability(tx),
    createAIConversationMessagesPortableCapability({
      exportReader: createAiMessageExportReader(importPort),
      importPort,
      archive:
        options.messageArchive ??
        (() => {
          throw new Error('ai-conversation-messages archive is unavailable');
        }),
    }),
  ];
}
