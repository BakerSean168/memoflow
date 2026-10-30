import { UpdateConversationUseCase } from '../../../application/use-cases/commands/update-conversation.use-case';
import { ListConversationsUseCase } from '../../../application/use-cases/commands/list-conversations.use-case';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/desktop-contracts';
import { ConversationStatus } from '@memoflow/ai-contracts';
import type { AIEventMap } from '@memoflow/ai-contracts';
import { createTypedEventSubscriber, eventBus } from '@memoflow/utils/domain';
import { AIConversation } from '../../../domain/aggregates/ai-conversation';
import { AIConversationPrismaRepository } from '../prisma/ai-conversation-prisma.repository';
import { PowerSyncAIConversationRepository } from '../powersync/ai-conversation-powersync.repository';
import { createLocalAgentSqlite } from '../../../../testing/local-agent-sqlite';

describe('conversation activity with real SQLite', () => {
  it('round-trips archive through the owner, separates legacy deletion, and filters before pagination', async () => {
    const db = createLocalAgentSqlite();
    try {
      await db.execute(
        'CREATE TABLE ai_conversations (id TEXT PRIMARY KEY, identity_id TEXT, name TEXT, status TEXT, version INTEGER, created_at TEXT, updated_at TEXT, deleted_at TEXT)',
      );
      const repository = new PowerSyncAIConversationRepository(db);
      const update = new UpdateConversationUseCase(repository);
      const list = new ListConversationsUseCase(repository);
      const conversation = AIConversation.create({ identityId: 'owner', name: 'Keep history' });
      const active = AIConversation.create({ identityId: 'owner', name: 'Active' });
      const deleted = AIConversation.create({ identityId: 'owner', name: 'Legacy deleted' });
      deleted.softDelete();
      for (const item of [conversation, active, deleted]) await repository.save(item);
      const before = conversation.toClientDTO();
      const id = String(conversation.id);
      expect(await update.execute('foreign', id, { status: 'Archived' })).toMatchObject({
        ok: false,
      });
      expect(await update.execute('owner', id, { status: 'Archived' })).toMatchObject({
        ok: true,
        data: { status: 'Archived', deletedAt: null },
      });
      expect(await list.execute({ identityId: 'owner' } as never, 1, 1, 'Active')).toMatchObject({
        ok: true,
        data: { total: 1, data: [{ name: 'Active' }] },
      });
      expect(
        await list.execute({ identityId: 'owner' } as never, 1, 100, 'Archived'),
      ).toMatchObject({ ok: true, data: { total: 1, data: [{ id, name: 'Keep history' }] } });
      const restored = await update.execute('owner', id, { status: 'Active' });
      expect(restored).toMatchObject({ ok: true, data: before });
      expect(await update.execute('owner', String(deleted.id), { status: 'Active' })).toMatchObject(
        { ok: false },
      );
    } finally {
      db.close();
    }
  });
  it('keeps title and ownership intact, rejects older activity, and does not revive deleted shells', async () => {
    const db = createLocalAgentSqlite();
    try {
      await db.execute(
        'CREATE TABLE ai_conversations (id TEXT PRIMARY KEY, identity_id TEXT, name TEXT, status TEXT, version INTEGER, created_at TEXT, updated_at TEXT, deleted_at TEXT)',
      );
      const repo = new PowerSyncAIConversationRepository(db);
      const conversation = AIConversation.create({
        identityId: 'identity-1',
        name: 'Preserved title',
      });
      await repo.save(conversation);
      const at = conversation.updatedAt.getTime() + 1000;
      await repo.recordActivity('identity-1', String(conversation.id), at);
      await repo.recordActivity('foreign', String(conversation.id), at + 1000);
      await repo.recordActivity('identity-1', String(conversation.id), at - 100);
      const updated = await repo.findByIdForIdentity('identity-1', String(conversation.id));
      expect(updated?.name).toBe('Preserved title');
      expect(updated?.updatedAt.getTime()).toBe(at);
      await repo.delete('identity-1', String(conversation.id));
      const deleted = await db.getOptional('SELECT * FROM ai_conversations WHERE id = ?', [
        String(conversation.id),
      ]);
      await repo.recordActivity('identity-1', String(conversation.id), at + 1000);
      expect(
        await db.getOptional('SELECT * FROM ai_conversations WHERE id = ?', [
          String(conversation.id),
        ]),
      ).toEqual(deleted);
    } finally {
      db.close();
    }
  });
});

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
    get: vi.fn(async () => {
      throw new Error('get() should not be called');
    }),
  };
  return {
    ...tx,
    writeTransaction: vi.fn(
      async <T>(callback: (transaction: IElectronDatabaseTransaction) => Promise<T>) =>
        callback(tx),
    ),
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
