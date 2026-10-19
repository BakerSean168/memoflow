import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalAgentSqlite } from '../../../../testing/local-agent-sqlite';
import { LocalAgentRepository } from './local-agent.repository';

const databases: ReturnType<typeof createLocalAgentSqlite>[] = [];
function database() {
  const db = createLocalAgentSqlite();
  databases.push(db);
  return db;
}
afterEach(() => {
  vi.restoreAllMocks();
  databases.splice(0).forEach((db) => db.close());
});

describe('local Agent persistence with real SQLite', () => {
  const input = {
    driver: 'codex' as const,
    name: 'Codex',
    executablePath: '/bin/codex',
    enabled: true,
    writeScopes: [],
  };
  it('keeps insertion order and the latest 500 items with a frozen or regressing clock after reopening', async () => {
    const db = database();
    let store = new LocalAgentRepository(db);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    const connection = await store.createConnection('owner', input);
    const conversation = await store.createConversation('owner', {
      connectionId: connection.id,
      modelId: 'model',
      name: 'Chat',
    });
    const message = (index: number) => ({
      id: String(1000 - index),
      conversationId: conversation.id,
      role: 'assistant' as const,
      content: String(index),
      attachments: [],
      createdAt: Date.now(),
    });
    for (let index = 0; index < 502; index++) {
      if (index === 501) clock.mockReturnValue(1_700_000_000_000);
      await store.saveMessage('owner', message(index), true);
    }
    store = new LocalAgentRepository(db);
    const before = await store.listMessages('owner', conversation.id);
    expect(before.messages.map((item) => item.content)).toEqual(
      Array.from({ length: 500 }, (_, index) => String(index + 2)),
    );
    expect(before.incomplete).toBe(true);
    await store.saveMessage(
      'owner',
      { ...message(2), content: 'updated', createdAt: Date.now() + 999_999 },
      false,
    );
    const after = await store.listMessages('owner', conversation.id);
    expect(after.messages.map((item) => item.id)).toEqual(before.messages.map((item) => item.id));
    expect(after.messages[0]).toMatchObject({
      content: 'updated',
      createdAt: before.messages[0]?.createdAt,
    });
    expect(
      after.messages.every(
        (item, index) => index === 0 || item.createdAt > after.messages[index - 1]!.createdAt,
      ),
    ).toBe(true);
  });

  it.each(['read', 'write'] as const)(
    'migrates legacy ties before the first %s and preserves the old window across restart',
    async (trigger) => {
      const db = database();
      const store = new LocalAgentRepository(db);
      const connection = await store.createConnection('owner', input);
      const conversation = await store.createConversation('owner', {
        connectionId: connection.id,
        modelId: 'model',
        name: 'Legacy',
      });
      await db.execute('UPDATE ai_local_conversations SET record_json = ? WHERE id = ?', [
        JSON.stringify({ ...conversation, historyOrderVersion: undefined }),
        conversation.id,
      ]);
      const timestamp = 1_800_000_000_000;
      const legacy = (index: number) => ({
        id: String(index).padStart(4, '0'),
        conversationId: conversation.id,
        role: 'assistant' as const,
        content: String(index),
        attachments: [],
        createdAt: timestamp,
      });
      // Insert in reverse order: migration must follow the historical timestamp/id order.
      for (let index = 501; index >= 0; index--) {
        const item = legacy(index);
        await db.execute(
          'INSERT INTO ai_local_conversation_items (id, identity_id, conversation_id, created_at, record_json) VALUES (?, ?, ?, ?, ?)',
          [
            item.id,
            'owner',
            conversation.id,
            timestamp,
            JSON.stringify({ ...item, complete: true }),
          ],
        );
      }
      if (trigger === 'write')
        await store.saveMessage('owner', { ...legacy(501), content: 'updated' }, true);
      const history = await store.listMessages('owner', conversation.id);
      expect(history.messages.map((item) => item.id)).toEqual(
        Array.from({ length: 500 }, (_, index) => legacy(index + 2).id),
      );
      expect(history.messages.map((item) => item.createdAt)).toEqual(
        Array.from({ length: 500 }, (_, index) => timestamp + index + 2),
      );
      expect((await store.getConversation('owner', conversation.id)).historyOrderVersion).toBe(1);
      const reopened = new LocalAgentRepository(db);
      expect(await reopened.listMessages('owner', conversation.id)).toEqual(history);
      await reopened.saveMessage('owner', { ...legacy(0), id: 'append', createdAt: 1 }, true);
      expect((await reopened.listMessages('owner', conversation.id)).messages.at(-1)).toMatchObject(
        { id: 'append', createdAt: timestamp + 502 },
      );
    },
  );

  it('rolls back both legacy normalization and its marker when migration fails', async () => {
    const db = database();
    const store = new LocalAgentRepository(db);
    const connection = await store.createConnection('owner', input);
    const conversation = await store.createConversation('owner', {
      connectionId: connection.id,
      modelId: 'model',
      name: 'Legacy',
    });
    await db.execute('UPDATE ai_local_conversations SET record_json = ? WHERE id = ?', [
      JSON.stringify({ ...conversation, historyOrderVersion: undefined }),
      conversation.id,
    ]);
    for (const id of ['a', 'b']) {
      await db.execute(
        'INSERT INTO ai_local_conversation_items (id, identity_id, conversation_id, created_at, record_json) VALUES (?, ?, ?, ?, ?)',
        [
          id,
          'owner',
          conversation.id,
          10,
          JSON.stringify({
            id,
            conversationId: conversation.id,
            role: 'user',
            content: id,
            attachments: [],
            createdAt: 10,
            complete: true,
          }),
        ],
      );
    }
    const execute = db.execute.bind(db);
    vi.spyOn(db, 'execute').mockImplementation(async (query, values) => {
      if (query.startsWith('UPDATE ai_local_conversations')) throw new Error('write failed');
      return execute(query, values);
    });
    await expect(store.listMessages('owner', conversation.id)).rejects.toThrow('write failed');
    vi.restoreAllMocks();
    expect(
      (await store.getConversation('owner', conversation.id)).historyOrderVersion,
    ).toBeUndefined();
    expect(
      await db.getAll('SELECT created_at FROM ai_local_conversation_items ORDER BY id'),
    ).toEqual([{ created_at: 10 }, { created_at: 10 }]);
    expect(
      (await store.listMessages('owner', conversation.id)).messages.map((item) => item.createdAt),
    ).toEqual([10, 11]);
  });

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
