import { afterEach, describe, expect, it } from 'vitest';
import { createLocalAgentSqlite } from '../../../../testing/local-agent-sqlite';
import { LocalAgentRepository } from './local-agent.repository';

const databases: ReturnType<typeof createLocalAgentSqlite>[] = [];
function database() {
  const db = createLocalAgentSqlite();
  databases.push(db);
  return db;
}
afterEach(() => databases.splice(0).forEach((db) => db.close()));

describe('local Agent persistence with real SQLite', () => {
  const input = {
    driver: 'codex' as const,
    name: 'Codex',
    executablePath: '/bin/codex',
    enabled: true,
    writeScopes: [],
  };
  it('persists unique immutable slugs per owner and preserves old records', async () => {
    const db = database();
    const store = new LocalAgentRepository(db);
    const legacy = await store.createConnection('owner-a', input);
    const named = await store.createConnection('owner-a', {
      ...input,
      instanceSlug: 'personal-codex',
      accentColor: '#6469da',
    });
    await expect(
      store.createConnection('owner-a', { ...input, instanceSlug: 'personal-codex' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      store.createConnection('owner-b', { ...input, instanceSlug: 'personal-codex' }),
    ).resolves.toMatchObject({ instanceSlug: 'personal-codex' });
    await expect(
      store.updateConnection('owner-a', legacy.id, 1, { ...input, instanceSlug: 'personal-codex' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      store.updateConnection('owner-a', named.id, 1, { ...input, instanceSlug: 'renamed-id' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const updated = await store.updateConnection('owner-a', named.id, 1, {
      ...input,
      name: 'Renamed',
    });
    expect(updated).toMatchObject({
      instanceSlug: 'personal-codex',
      accentColor: '#6469da',
      revision: 2,
    });
    expect(await new LocalAgentRepository(db).getConnection('owner-a', named.id)).toEqual(updated);
    expect(await store.getConnection('owner-a', legacy.id)).toEqual(legacy);
    expect(await store.getDefaultChoice('owner-a')).toEqual({ runtimeKind: 'builtin' });
  });
  it('keeps defaults local and changes no existing conversation binding', async () => {
    const store = new LocalAgentRepository(database());
    expect(await store.getDefaultChoice('owner-a')).toEqual({ runtimeKind: 'builtin' });
    const connection = await store.createConnection('owner-a', input);
    const choice = {
      runtimeKind: 'local_agent' as const,
      connectionId: connection.id,
      modelId: 'model',
    };
    await store.setDefaultChoice('owner-a', choice);
    expect(await store.getDefaultChoice('owner-a')).toEqual(choice);
    expect(await store.getDefaultChoice('owner-b')).toEqual({ runtimeKind: 'builtin' });
    const conversation = await store.createConversation('owner-a', {
      connectionId: connection.id,
      modelId: 'model',
      name: 'Chat',
    });
    await store.setDefaultChoice('owner-a', { runtimeKind: 'builtin' });
    expect((await store.getConversation('owner-a', conversation.id)).connectionId).toBe(
      connection.id,
    );
    expect(await store.getDefaultChoice('owner-a')).toEqual({ runtimeKind: 'builtin' });
  });
  it('isolates connections by identity and rejects stale connection edits', async () => {
    const store = new LocalAgentRepository(database());
    const saved = await store.createConnection('owner-a', input);
    expect(await store.listConnections('owner-b')).toEqual([]);
    await expect(store.getConnection('owner-b', saved.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const updated = await store.updateConnection('owner-a', saved.id, saved.revision, {
      ...input,
      name: 'Renamed',
    });
    expect(updated.revision).toBe(2);
    await expect(
      store.updateConnection('owner-a', saved.id, saved.revision, input),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('persists native bindings, refuses another connection configuration and never resurrects deleted history', async () => {
    const db = database();
    const store = new LocalAgentRepository(db);
    const connection = await store.createConnection('owner-a', input);
    const conversation = await store.createConversation('owner-a', {
      connectionId: connection.id,
      modelId: 'model',
      name: 'Chat',
    });
    await store.bindSession('owner-a', conversation.id, 'native-1');
    expect(
      (await new LocalAgentRepository(db).getConversation('owner-a', conversation.id))
        .nativeSessionId,
    ).toBe('native-1');
    await expect(store.getConversation('owner-b', conversation.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await store.updateConnection('owner-a', connection.id, connection.revision, {
      ...input,
      homePath: '/different-account',
    });
    await expect(store.resolveConversation('owner-a', conversation.id)).rejects.toMatchObject({
      code: 'LOCAL_AGENT_SESSION_UNAVAILABLE',
    });
    await store.deleteConversation('owner-a', conversation.id);
    await expect(
      store.saveMessage(
        'owner-a',
        {
          id: 'late',
          conversationId: conversation.id,
          role: 'assistant',
          content: 'late',
          attachments: [],
          createdAt: 1,
        },
        true,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await store.listConversations('owner-a')).toEqual([]);
    expect(await db.getAll('SELECT * FROM ai_local_conversation_items')).toEqual([]);
  });
});
