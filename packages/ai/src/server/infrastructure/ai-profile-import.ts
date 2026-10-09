import type { Prisma } from '@memoflow/database';
import { createAIConversationPortableCapability } from '../application/ai-conversation-portability';
import { AIConversationPrismaRepository } from './adapters/prisma/ai-conversation-prisma.repository';

export function createAiPrismaPortableCapability(tx: Prisma.TransactionClient) {
  return createAIConversationPortableCapability(new AIConversationPrismaRepository(tx));
}
