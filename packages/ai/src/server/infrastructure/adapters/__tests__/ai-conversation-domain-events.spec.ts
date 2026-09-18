import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import { ConversationStatus } from '@memoflow/contracts/ai';
import type { AIEventMap } from '@memoflow/contracts/ai';
import { createTypedEventSubscriber, eventBus } from '@memoflow/utils/domain';
import { AIConversation } from '../../../domain/aggregates/ai-conversation';
import { AIConversationPrismaRepository } from '../prisma/ai-conversation-prisma.repository';
import { PowerSyncAIConversationRepository } from '../powersync/ai-conversation-powersync.repository';

const eventTypes = [
  'ai:conversation-created',
  'ai:conversation-updated',
  'ai:conversation-status-changed',
] as const satisfies ReadonlyArray<keyof AIEventMap>;
const subscriber = createTypedEventSubscriber<AIEventMap>(eventBus);

function conversationWithPendingEvents(): AIConversation {
  const conversation = AIConversation.create({
    identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440000',
    name: 'Architecture Review',
  });
  conversation.rename('Architecture Review 2');
  conversation.updateStatus(ConversationStatus.Archived);
  return conversation;
}

function capture() {
  const received: string[] = [];
  const handlers = eventTypes.map((eventType) => {
    const handler = () => received.push(eventType);
    subscriber.on(eventType, handler);
    return { eventType, handler };
  });
  return {
    received,
    dispose: () => handlers.forEach(({ eventType, handler }) => subscriber.off(eventType, handler)),
  };
}

function prismaMock(): PrismaClient {
  const client = {
    aiConversation: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => undefined),
    },
  };
  return client as unknown as PrismaClient;
}

function electronMock(): IElectronDatabase {
  const tx: IElectronDatabaseTransaction = {
    execute: vi.fn(async () => ({ rowsAffected: 1 })),
    getAll: vi.fn(async () => []),
    getOptional: vi.fn(async () => null),
    get: vi.fn(async () => { throw new Error('get() should not be called'); }),
  };
  return {
    ...tx,
    writeTransaction: vi.fn(async <T>(callback: (transaction: IElectronDatabaseTransaction) => Promise<T>) => callback(tx)),
  } as IElectronDatabase;
}

afterEach(() => vi.restoreAllMocks());

describe('AIConversation repository event flush', () => {
  it.each([
    ['Prisma', () => new AIConversationPrismaRepository(prismaMock())],
    ['PowerSync', () => new PowerSyncAIConversationRepository(electronMock())],
  ] as const)('%s publishes shell events only', async (_name, createRepository) => {
    const events = capture();
    const conversation = conversationWithPendingEvents();
    try {
      await createRepository().save(conversation);
      expect(events.received).toEqual([...eventTypes]);
      expect(conversation.pullDomainEvents()).toHaveLength(0);
    } finally {
      events.dispose();
    }
  });
});
