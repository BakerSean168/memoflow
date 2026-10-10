import { afterEach, describe, expect, it } from 'vitest';
import { createLocalAgentSqlite } from '../../../testing/local-agent-sqlite';
import { AgentInstanceRegistry } from './agent-instance.registry';
import { AgentInstancePowerSyncRepository } from '../../infrastructure/adapters/powersync/agent-instance.repository';
import { LocalAgentRepository } from '../../infrastructure/adapters/powersync/local-agent.repository';
const databases: ReturnType<typeof createLocalAgentSqlite>[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
function setup(host: 'desktop' | 'web' = 'desktop') {
  const db = createLocalAgentSqlite();
  databases.push(db);
  return {
    db,
    registry: new AgentInstanceRegistry(new AgentInstancePowerSyncRepository(db), host),
  };
}
const instance = {
  instanceId: 'mastra-anyrouter',
  driver: 'mastra' as const,
  name: 'AnyRouter',
  accentColor: '#6469da',
  enabled: true,
};
describe('Agent registry with real SQLite persistence', () => {
  it('synthesizes defaults without writes and persists empty Mastra across repository reload', async () => {
    const { db, registry } = setup('web');
    expect((await registry.list('a')).instances.map((item) => item.instanceId)).toEqual(['mastra']);
    expect(await db.getAll('SELECT * FROM ai_agent_instances')).toEqual([]);
    await registry.execute('a', { action: 'create', instance });
    const reloaded = new AgentInstanceRegistry(new AgentInstancePowerSyncRepository(db), 'web');
    expect((await reloaded.list('a')).instances).toContainEqual(expect.objectContaining(instance));
    expect((await reloaded.list('b')).instances.map((item) => item.instanceId)).toEqual(['mastra']);
    await expect(
      registry.execute('a', { action: 'create', instance: { ...instance, driver: 'codex' } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('keeps all default identities and uses CAS 0 to edit an implicit default', async () => {
    const { registry } = setup();
    expect((await registry.list('a')).instances.map((item) => item.instanceId)).toEqual([
      'mastra',
      'codex',
      'claude',
      'pi',
      'dsh',
    ]);
    await registry.execute('a', {
      action: 'create',
      instance: { ...instance, instanceId: 'codex-work', driver: 'codex' },
    });
    await registry.execute('a', {
      action: 'update',
      instanceId: 'codex',
      expectedRevision: 0,
      patch: { name: 'Personal', enabled: false },
    });
    expect(
      (await registry.list('a')).instances.filter((item) => item.instanceId === 'codex'),
    ).toEqual([expect.objectContaining({ name: 'Personal', enabled: false, revision: 1 })]);
    expect(
      (await registry.list('a')).instances.some((item) => item.instanceId === 'codex-work'),
    ).toBe(true);
    await expect(
      registry.execute('a', {
        action: 'update',
        instanceId: 'codex',
        expectedRevision: 0,
        patch: { name: 'Stale' },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await registry.execute('a', { action: 'remove', instanceId: 'codex', expectedRevision: 1 });
    expect(
      (await registry.list('a')).instances.find((item) => item.instanceId === 'codex')?.revision,
    ).toBe(0);
  });
  it('binds a verified model service with owner checks, revision CAS and no key storage', async () => {
    const { db, registry } = setup('desktop');
    const id = 'connection-1';
    await db.execute(
      'INSERT INTO ai_provider_configs (id, identity_id, default_model, available_models, is_active) VALUES (?, ?, ?, ?, ?)',
      [id, 'owner-a', 'model-1', '[{"id":"model-1"},{"id":"model-2"}]', 1],
    );
    await expect(
      registry.execute('owner-b', {
        action: 'bind',
        instanceId: 'mastra',
        expectedRevision: 0,
        connectionId: id,
        modelId: 'model-1',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      registry.execute('owner-a', {
        action: 'bind',
        instanceId: 'mastra',
        expectedRevision: 0,
        connectionId: id,
        modelId: 'unknown-model',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const saved = await registry.execute('owner-a', {
      action: 'bind',
      instanceId: 'mastra',
      expectedRevision: 0,
      connectionId: id,
      modelId: 'model-1',
    });
    expect(saved).toMatchObject({ instanceId: 'mastra', revision: 1 });
    const reloaded = new AgentInstanceRegistry(new AgentInstancePowerSyncRepository(db), 'desktop');
    expect((await reloaded.list('owner-a')).bindings).toEqual([
      { instanceId: 'mastra', connectionId: id, modelId: 'model-1' },
    ]);
    expect((await reloaded.list('owner-b')).bindings).toEqual([]);
    expect(await db.getAll('SELECT record_json FROM ai_agent_instances')).toEqual([
      expect.objectContaining({ record_json: expect.not.stringContaining('apiKey') }),
    ]);
    await expect(
      registry.execute('owner-a', {
        action: 'unbind',
        instanceId: 'mastra',
        expectedRevision: 0,
        connectionId: id,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await registry.execute('owner-a', {
      action: 'unbind',
      instanceId: 'mastra',
      expectedRevision: 1,
      connectionId: id,
    });
    expect((await reloaded.list('owner-a')).bindings).toEqual([]);
  });
  it('claims a new conversation to one enabled Mastra instance and refuses cross-agent fallback', async () => {
    const { db, registry } = setup('desktop');
    await db.execute(
      'INSERT INTO ai_provider_configs (id, identity_id, default_model, available_models, is_active) VALUES (?, ?, ?, ?, ?)',
      ['provider-1', 'owner', 'model-1', '[{"id":"model-1"}]', 1],
    );
    await registry.execute('owner', { action: 'create', instance });
    await registry.execute('owner', {
      action: 'bind',
      instanceId: 'mastra-anyrouter',
      expectedRevision: 1,
      connectionId: 'provider-1',
      modelId: 'model-1',
    });
    await registry.assertTurnSelection({ owner: 'owner', conversationId: 'legacy' });
    expect(
      await new AgentInstancePowerSyncRepository(db).getConversationInstance('owner', 'legacy'),
    ).toBeNull();
    const valid = {
      owner: 'owner',
      conversationId: 'new',
      agentInstanceId: 'mastra-anyrouter',
      providerId: 'provider-1',
      modelId: 'model-1',
    };
    await expect(
      registry.assertTurnSelection({ ...valid, providerId: 'provider-other' }),
    ).rejects.toMatchObject({ code: 'AI_CONFIGURATION_REQUIRED' });
    await expect(
      registry.assertTurnSelection({ ...valid, modelId: 'model-other' }),
    ).rejects.toMatchObject({ code: 'AI_CONFIGURATION_REQUIRED' });
    await expect(
      registry.assertTurnSelection({ ...valid, agentInstanceId: 'mastra' }),
    ).rejects.toMatchObject({ code: 'AI_CONFIGURATION_REQUIRED' });
    await registry.assertTurnSelection(valid);
    await registry.assertTurnSelection(valid);
    const reopened = new AgentInstanceRegistry(new AgentInstancePowerSyncRepository(db), 'desktop');
    expect(
      await new AgentInstancePowerSyncRepository(db).getConversationInstance('owner', 'new'),
    ).toBe('mastra-anyrouter');
    expect(
      await new AgentInstancePowerSyncRepository(db).getConversationInstance('someone', 'new'),
    ).toBeNull();
    await expect(
      reopened.assertTurnSelection({ owner: 'owner', conversationId: 'new' }),
    ).rejects.toMatchObject({ code: 'AI_CONFIGURATION_REQUIRED' });
    await expect(
      reopened.assertTurnSelection({ ...valid, agentInstanceId: 'mastra' }),
    ).rejects.toMatchObject({ code: 'AI_CONFIGURATION_REQUIRED' });
    const snapshot = await registry.list('owner');
    const agent = snapshot.instances.find((value) => value.instanceId === 'mastra-anyrouter')!;
    await registry.execute('owner', {
      action: 'update',
      instanceId: agent.instanceId,
      expectedRevision: agent.revision,
      patch: { enabled: false },
    });
    await expect(reopened.assertTurnSelection(valid)).rejects.toMatchObject({
      code: 'AI_CONFIGURATION_REQUIRED',
    });
    const current = (await registry.list('owner')).instances.find(
      (entry) => entry.instanceId === 'mastra-anyrouter',
    )!;
    await expect(
      registry.execute('owner', {
        action: 'remove',
        instanceId: current.instanceId,
        expectedRevision: current.revision,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await db.getAll('SELECT instance_id FROM ai_agent_conversation_bindings')).toEqual([
      { instance_id: 'mastra-anyrouter' },
    ]);
  });

  it('projects legacy default-slug connection as canonical default rather than duplicating it', async () => {
    const { db, registry } = setup();
    const legacyStore = new LocalAgentRepository(db);
    const saved = await legacyStore.createConnection('owner', {
      driver: 'codex',
      name: 'Original default',
      instanceSlug: 'codex-default',
      executablePath: 'codex',
      enabled: true,
      writeScopes: [],
    });
    const list = (await registry.list('owner')).instances;
    expect(list.filter((value) => value.instanceId === 'codex')).toHaveLength(1);
    expect(list.find((value) => value.instanceId === 'codex')).toMatchObject({
      name: 'Original default',
      legacyConnectionId: saved.id,
    });
    expect(list.some((value) => value.instanceId === 'codex-default')).toBe(false);
  });
  it('persists native instances via the existing LocalAgentConnection authority', async () => {
    const { db, registry } = setup();
    const saved = await registry.execute('owner', {
      action: 'create',
      instance: { ...instance, instanceId: 'codex-work', driver: 'codex' },
    });
    expect(saved).toMatchObject({ instanceId: 'codex-work', driver: 'codex', revision: 1 });
    const local = new LocalAgentRepository(db);
    const records = await local.listConnections('owner');
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ instanceSlug: 'codex-work', driver: 'codex' });
    expect(
      (await registry.list('owner')).instances.filter((item) => item.instanceId === 'codex-work'),
    ).toHaveLength(1);
  });

  it('isolates Profile databases and owners and preserves native UUID/session/history', async () => {
    const { db, registry } = setup();
    const legacyStore = new LocalAgentRepository(db);
    const legacy = await legacyStore.createConnection('a', {
      driver: 'codex',
      name: 'Existing',
      executablePath: 'codex',
      enabled: true,
      writeScopes: [],
      instanceSlug: 'codex-work',
    });
    const chat = await legacyStore.createConversation('a', {
      connectionId: legacy.id,
      modelId: 'model',
      name: 'Old chat',
    });
    await legacyStore.bindSession('a', chat.id, 'native-session');
    const imported = (await registry.list('a')).instances.find(
      (item) => item.instanceId === 'codex-work',
    )!;
    expect(imported.legacyConnectionId).toBe(legacy.id);
    await registry.execute('a', {
      action: 'update',
      instanceId: imported.instanceId,
      expectedRevision: imported.revision,
      patch: { name: 'Renamed', enabled: false },
    });
    expect(await legacyStore.getConnection('a', legacy.id)).toMatchObject({
      id: legacy.id,
      name: 'Renamed',
      enabled: false,
    });
    expect(await legacyStore.getConversation('a', chat.id)).toMatchObject({
      connectionId: legacy.id,
      nativeSessionId: 'native-session',
    });
    expect((await registry.list('b')).instances.some((item) => item.legacyConnectionId)).toBe(
      false,
    );
    expect(
      (await setup().registry.list('a')).instances.some((item) => item.legacyConnectionId),
    ).toBe(false);
    await expect(
      registry.execute('b', {
        action: 'update',
        instanceId: 'codex-work',
        expectedRevision: imported.revision,
        patch: { name: 'Intrusion' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
