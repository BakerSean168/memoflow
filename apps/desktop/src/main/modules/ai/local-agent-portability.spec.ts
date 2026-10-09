import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createPowerSyncSqliteFixture } from '@memoflow/test-utils/helpers/powersync-sqlite';
import {
  LocalAgentRepository,
  createAIPowerSyncRepositories,
  createAIConversationPortableCapability,
} from '@memoflow/ai';
import { inspectProfileSource } from '../../profile/profile-source-inventory';

it('excludes native bindings from V3 export and retains a guest containing local Agent data', async () => {
  const f = createPowerSyncSqliteFixture();
  const root = await mkdtemp(join(tmpdir(), 'memoflow-byoa-portable-'));
  try {
    const store = new LocalAgentRepository(f.db);
    const connection = await store.createConnection('owner', {
      driver: 'codex',
      name: 'Local',
      executablePath: 'codex',
      enabled: true,
      writeScopes: [],
    });
    const conversation = await store.createConversation('owner', {
      connectionId: connection.id,
      modelId: 'model',
      name: 'Local history',
    });
    await store.bindSession('owner', conversation.id, 'native-private', 'account-digest');
    await store.saveMessage(
      'owner',
      {
        id: 'message',
        conversationId: conversation.id,
        role: 'assistant',
        content: 'Local content',
        createdAt: 1,
        attachments: [],
      },
      true,
    );
    const capability = createAIConversationPortableCapability(
      createAIPowerSyncRepositories(f.db).conversationRepository,
    );
    const noReference = (): never => {
      throw new Error('Local-only records must not become portable references');
    };
    expect(
      await capability.export({
        identityId: 'owner',
        references: {
          declareExportReference: noReference,
          resolveExportReference: noReference,
          bindImportedReference: noReference,
          resolveImportedReference: noReference,
        },
      }),
    ).toEqual({ conversations: [] });
    const inventory = await inspectProfileSource(f.db, root);
    for (const field of [
      'ai_local_agent_connections',
      'ai_local_conversations',
      'ai_local_conversation_items',
    ]) {
      expect(inventory.blockers).toContainEqual({
        capability: 'local-source',
        reason: 'unsupported_user_data',
        field,
      });
    }
    expect((await store.getConversation('owner', conversation.id)).nativeSessionId).toBe(
      'native-private',
    );
  } finally {
    f.close();
    await rm(root, { recursive: true, force: true });
  }
});
