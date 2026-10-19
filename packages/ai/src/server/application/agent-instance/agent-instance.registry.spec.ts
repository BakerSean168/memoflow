import { afterEach, describe, expect, it } from 'vitest';
import { createLocalAgentSqlite } from '../../../testing/local-agent-sqlite';
import { AgentInstanceRegistry } from './agent-instance.registry';
import { AgentInstancePowerSyncRepository } from '../../infrastructure/adapters/powersync/agent-instance.repository';
import { LocalAgentRepository } from '../../infrastructure/adapters/powersync/local-agent.repository';
import { LocalAgentRuntime } from '../../local-agent/local-agent-runtime';
import type { NativeAgentEvent } from '../../local-agent/codex-driver';
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
    const { db, registry } = setup();
    expect((await registry.list('a')).instances.map((item) => item.instanceId)).toEqual([
      'mastra',
      'codex',
      'claude',
      'pi',
      'dsh',
      'antigravity',
    ]);
    await registry.execute('a', {
      action: 'create',
      instance: { ...instance, instanceId: 'codex-work', driver: 'codex' },
    });
    await registry.execute('a', {
      action: 'update',
      instanceId: 'codex',
      expectedRevision: 0,
      patch: {
        name: 'Personal',
        enabled: false,
        nativeConfig: {
          executablePath: '/custom/codex',
          homePath: '/custom/home',
          writeScopes: ['goals:write'],
        },
      },
    });
    expect(
      (await new LocalAgentRepository(db).listConnections('a')).find(
        (entry) => entry.instanceSlug === 'codex',
      ),
    ).toMatchObject({ name: 'Personal', enabled: false });
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
    await expect(
      registry.execute('a', { action: 'remove', instanceId: 'codex', expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await registry.execute('a', { action: 'reset', instanceId: 'codex', expectedRevision: 1 });
    expect(
      (await new LocalAgentRepository(db).listConnections('a')).find(
        (entry) => entry.instanceSlug === 'codex',
      ),
    ).toMatchObject({
      enabled: true,
      executablePath: 'codex',
      writeScopes: [],
    });
    expect(
      (await new LocalAgentRepository(db).listConnections('a')).find(
        (entry) => entry.instanceSlug === 'codex',
      )?.homePath,
    ).toBeUndefined();
    expect(
      (await registry.list('a')).instances.find((item) => item.instanceId === 'codex')?.revision,
    ).toBe(2);
  });
  it('resets the built-in instance without deleting its model, secrets or existing conversation binding', async () => {
    const { db, registry } = setup('web');
    await db.execute(
      'INSERT INTO ai_provider_configs (id, identity_id, default_model, available_models, is_active) VALUES (?, ?, ?, ?, ?)',
      ['service', 'a', 'model', '[{"id":"model"}]', 1],
    );
    await registry.execute('a', {
      action: 'bind',
      instanceId: 'mastra',
      expectedRevision: 0,
      connectionId: 'service',
      modelId: 'model',
    });
    await registry.execute('a', {
      action: 'update',
      instanceId: 'mastra',
      expectedRevision: 1,
      patch: { name: 'Custom', enabled: false, accentColor: '#ffffff' },
    });
    await db.execute(
      'INSERT INTO ai_agent_conversation_bindings (id, identity_id, conversation_id, instance_id) VALUES (?, ?, ?, ?)',
      ['history', 'a', 'chat', 'mastra'],
    );
    await expect(
      registry.execute('a', { action: 'remove', instanceId: 'mastra', expectedRevision: 2 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await registry.execute('a', { action: 'reset', instanceId: 'mastra', expectedRevision: 2 });
    const result = await registry.list('a');
    expect(result.instances[0]).toMatchObject({
      instanceId: 'mastra',
      name: 'Mastra',
      enabled: true,
      accentColor: '#6469da',
      revision: 3,
    });
    expect(result.bindings).toEqual([
      { instanceId: 'mastra', connectionId: 'service', modelId: 'model' },
    ]);
    expect(await db.getAll('SELECT id FROM ai_provider_configs')).toEqual([{ id: 'service' }]);
    expect(await db.getAll('SELECT id FROM ai_agent_conversation_bindings')).toEqual([
      { id: 'history' },
    ]);
    await expect(
      registry.execute('a', { action: 'reset', instanceId: 'mastra', expectedRevision: 2 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
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
    await expect(
      registry.assertModelBinding('owner-a', 'mastra', id, 'model-2'),
    ).resolves.toBeUndefined();
    await expect(
      registry.assertModelBinding('owner-a', 'mastra', 'never-bound-connection', 'model-2'),
    ).rejects.toMatchObject({ code: 'AI_CONFIGURATION_REQUIRED' });
    await expect(
      registry.assertModelBinding('owner-b', 'mastra', id, 'model-2'),
    ).rejects.toMatchObject({ code: 'AI_CONFIGURATION_REQUIRED' });

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
  it('protects a claim committed after the deletion precheck', async () => {
    const { db, registry } = setup();
    const repository = new AgentInstancePowerSyncRepository(db);
    await registry.execute('owner', { action: 'create', instance });
    expect(await repository.hasConversationBindings('owner', instance.instanceId)).toBe(false);
    await repository.claimConversationInstance('owner', 'racing-chat', instance.instanceId);
    await expect(repository.remove('owner', instance.instanceId, 1)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(
      (await registry.list('owner')).instances.some(
        (row) => row.instanceId === instance.instanceId,
      ),
    ).toBe(true);
  });

  it('rejects a claim committed after deletion without creating an orphan', async () => {
    const { db, registry } = setup();
    const repository = new AgentInstancePowerSyncRepository(db);
    await registry.execute('owner', { action: 'create', instance });
    await repository.remove('owner', instance.instanceId, 1);
    await expect(
      repository.claimConversationInstance('owner', 'racing-chat', instance.instanceId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await repository.getConversationInstance('owner', 'racing-chat')).toBeNull();
  });

  it('switches validated Mastra instances within one conversation and rejects invalid targets without changing selection', async () => {
    const { db, registry } = setup('desktop');
    const repository = new AgentInstancePowerSyncRepository(db);
    await db.execute(
      'INSERT INTO ai_provider_configs (id, identity_id, default_model, available_models, is_active) VALUES (?, ?, ?, ?, ?)',
      ['provider-1', 'owner', 'model-1', '[{"id":"model-1"}]', 1],
    );
    for (const instanceId of ['first', 'second']) {
      await registry.execute('owner', { action: 'create', instance: { ...instance, instanceId } });
      await registry.execute('owner', {
        action: 'bind',
        instanceId,
        expectedRevision: 1,
        connectionId: 'provider-1',
        modelId: 'model-1',
      });
    }
    const selection = {
      owner: 'owner',
      conversationId: 'same-chat',
      providerId: 'provider-1',
      modelId: 'model-1',
    };
    await registry.assertTurnSelection({ ...selection, agentInstanceId: 'first' });
    await registry.assertTurnSelection({ ...selection, agentInstanceId: 'second' });
    expect(await repository.getConversationSelection('owner', 'same-chat')).toEqual({
      agentInstanceId: 'second',
      providerId: 'provider-1',
      modelId: 'model-1',
    });
    await expect(
      registry.assertTurnSelection({
        ...selection,
        agentInstanceId: 'first',
        providerId: 'missing',
      }),
    ).rejects.toMatchObject({ code: 'AI_CONFIGURATION_REQUIRED' });
    expect(await repository.getConversationInstance('owner', 'same-chat')).toBe('second');
    expect(await repository.getConversationInstance('other-owner', 'same-chat')).toBeNull();
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
    await expect(registry.assertTurnSelection({ ...valid, modelId: '' })).rejects.toMatchObject({
      code: 'AI_CONFIGURATION_REQUIRED',
    });
    await expect(
      registry.assertTurnSelection({ ...valid, agentInstanceId: 'mastra' }),
    ).rejects.toMatchObject({ code: 'AI_CONFIGURATION_REQUIRED' });
    await registry.assertTurnSelection(valid);
    await registry.assertTurnSelection(valid);
    expect(
      await registry.execute('owner', { action: 'conversation_selection', conversationId: 'new' }),
    ).toEqual({
      agentInstanceId: 'mastra-anyrouter',
      providerId: 'provider-1',
      modelId: 'model-1',
    });
    expect(
      await registry.execute('someone', {
        action: 'conversation_selection',
        conversationId: 'new',
      }),
    ).toBeNull();
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

  it('changes an instance default using trusted live validation without changing shared Provider state', async () => {
    const { db } = setup('desktop');
    await db.execute(
      'INSERT INTO ai_provider_configs (id, identity_id, default_model, available_models, is_active, version) VALUES (?, ?, ?, ?, ?, ?)',
      ['live-service', 'owner', 'model-1', '[]', 1, 1],
    );
    const validated = new AgentInstanceRegistry(
      new AgentInstancePowerSyncRepository(db),
      'desktop',
      async (_owner, _providerId, modelId) => {
        if (modelId !== 'model-2') throw new Error('Model is not in the live catalogue');
        return 1;
      },
    );
    await validated.execute('owner', {
      action: 'bind',
      instanceId: 'mastra',
      expectedRevision: 0,
      connectionId: 'live-service',
      modelId: 'model-2',
    });
    expect((await validated.list('owner')).bindings).toContainEqual({
      instanceId: 'mastra',
      connectionId: 'live-service',
      modelId: 'model-2',
    });
    expect(
      await db.getOptional('SELECT default_model, version FROM ai_provider_configs WHERE id = ?', [
        'live-service',
      ]),
    ).toEqual({ default_model: 'model-1', version: 1 });
    await db.execute('UPDATE ai_provider_configs SET version = 2 WHERE id = ?', ['live-service']);
    await expect(
      validated.execute('owner', {
        action: 'bind',
        instanceId: 'mastra',
        expectedRevision: 1,
        connectionId: 'live-service',
        modelId: 'model-2',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(
      (await validated.list('owner')).instances.find((entry) => entry.instanceId === 'mastra')
        ?.revision,
    ).toBe(1);
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
  it('removes an unreferenced native instance with CAS but protects its existing conversation', async () => {
    const { db, registry } = setup();
    const local = new LocalAgentRepository(db);
    const created = await local.createConnection('owner', {
      driver: 'codex',
      name: 'Work',
      instanceSlug: 'codex-work',
      executablePath: 'codex',
      enabled: true,
      writeScopes: [],
    });
    await registry.execute('owner', {
      action: 'remove',
      instanceId: 'codex-work',
      expectedRevision: 1,
    });
    expect(await local.listConnections('owner')).toEqual([]);
    const protectedConnection = await local.createConnection('owner', {
      driver: 'codex',
      name: 'Work',
      instanceSlug: 'codex-work',
      executablePath: 'codex',
      enabled: true,
      writeScopes: [],
    });
    await local.createConversation('owner', {
      connectionId: protectedConnection.id,
      modelId: 'm',
      name: 'Keep',
    });
    await expect(
      registry.execute('owner', {
        action: 'remove',
        instanceId: 'codex-work',
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await local.listConnections('owner'))[0]?.id).toBe(protectedConnection.id);
    expect(protectedConnection.id).not.toBe(created.id);
  });

  it('projects colliding old default slugs into distinct stable identities without losing UUIDs', async () => {
    const { db, registry } = setup();
    const local = new LocalAgentRepository(db);
    const input = {
      driver: 'codex' as const,
      name: 'Same',
      executablePath: 'codex',
      enabled: true,
      writeScopes: [],
    };
    const first = await local.createConnection('owner', { ...input, instanceSlug: 'codex' });
    const second = await local.createConnection('owner', {
      ...input,
      instanceSlug: 'codex-default',
    });
    const snapshot = await registry.list('owner');
    const native = snapshot.instances.filter((entry) => entry.legacyConnectionId);
    expect(native).toHaveLength(2);
    expect(new Set(native.map((entry) => entry.instanceId)).size).toBe(2);
    expect(native.find((entry) => entry.instanceId === 'codex')?.legacyConnectionId).toBe(first.id);
    expect(native.map((entry) => entry.legacyConnectionId).sort()).toEqual(
      [first.id, second.id].sort(),
    );
    expect(await registry.list('owner')).toEqual(snapshot);
    const secondIdentity = native.find(
      (entry) => entry.legacyConnectionId === second.id,
    )?.instanceId;
    await registry.execute('owner', { action: 'reset', instanceId: 'codex', expectedRevision: 1 });
    expect(
      (await registry.list('owner')).instances.find(
        (entry) => entry.legacyConnectionId === second.id,
      )?.instanceId,
    ).toBe(secondIdentity);
  });

  it('imports late-synced legacy Mastra services once without changing old providers or conversations', async () => {
    const { db, registry } = setup();
    await registry.list('owner');
    await db.execute(
      'INSERT INTO ai_provider_configs (id, identity_id, name, default_model, is_default) VALUES (?, ?, ?, ?, ?)',
      ['old-provider', 'owner', 'Original', 'old-model', 1],
    );
    const imported = await registry.list('owner');
    expect(imported.instances.find((entry) => entry.instanceId === 'mastra')).toMatchObject({
      revision: 1,
    });
    expect(imported.bindings).toEqual([
      { instanceId: 'mastra', connectionId: 'old-provider', modelId: 'old-model' },
    ]);
    await registry.execute('owner', {
      action: 'unbind',
      instanceId: 'mastra',
      expectedRevision: 1,
      connectionId: 'old-provider',
    });
    expect((await registry.list('owner')).bindings).toEqual([]);
    expect((await registry.list('someone')).bindings).toEqual([]);
    expect(await db.getAll('SELECT id,name,default_model FROM ai_provider_configs')).toEqual([
      { id: 'old-provider', name: 'Original', default_model: 'old-model' },
    ]);
    expect(await db.getAll('SELECT * FROM ai_agent_conversation_bindings')).toEqual([]);
  });
});

it('materializes AGY with its canonical ACP executable and preserves owner isolation', async () => {
  const { db, registry } = setup();
  const defaults = await registry.list('owner');
  expect(defaults.instances.find((item) => item.driver === 'antigravity')).toMatchObject({
    instanceId: 'antigravity',
    name: 'Antigravity (AGY)',
    revision: 0,
  });
  expect(await new LocalAgentRepository(db).listConnections('owner')).toHaveLength(0);
  await registry.execute('owner', {
    action: 'update',
    instanceId: 'antigravity',
    expectedRevision: 0,
    patch: { enabled: true },
  });
  const local = new LocalAgentRepository(db);
  const connections = await local.listConnections('owner');
  expect(connections).toHaveLength(1);
  expect(connections[0]).toMatchObject({
    driver: 'antigravity',
    executablePath: 'agy_acp_server',
    enabled: true,
  });
  await registry.execute('owner', {
    action: 'reset',
    instanceId: 'antigravity',
    expectedRevision: 1,
  });
  expect((await local.listConnections('owner'))[0].id).toBe(connections[0].id);
  expect(await local.listConnections('other-owner')).toHaveLength(0);
  const web = setup('web').registry;
  await   expect(
    web.execute('owner', {
      action: 'create',
      instance: {
        instanceId: 'agy',
        driver: 'antigravity',
        name: 'AGY',
        accentColor: '#6469da',
        enabled: true,
      },
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

it('stops a live native turn before disabling its instance through the Registry', async () => {
  const db = createLocalAgentSqlite();
  databases.push(db);
  const store = new LocalAgentRepository(db);
  const connection = await store.createConnection('owner', {
    driver: 'codex',
    name: 'Codex',
    instanceSlug: 'codex',
    executablePath: '/fake/codex',
    enabled: true,
    writeScopes: [],
  });
  const conversation = await store.createConversation('owner', {
    connectionId: connection.id,
    modelId: 'model',
    name: 'Chat',
  });
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  let cancelled = false;
  const runtime = new LocalAgentRuntime({
    store,
    cwd: '/tmp',
    createDriver: () => ({
      async *run(): AsyncGenerator<NativeAgentEvent> {
        yield { type: 'delta', content: 'partial' };
        await Promise.race([wait, new Promise((resolve) => setTimeout(resolve, 250))]);
        yield { type: 'completed' };
      },
      cancel() {
        cancelled = true;
        release();
      },
      async close() {
        release();
      },
      respond: () => false,
      async probe() {
        return { status: 'ready' as const, models: [{ id: 'model', name: 'Model' }] };
      },
    }),
  });
  const registry = new AgentInstanceRegistry(
    new AgentInstancePowerSyncRepository(db),
    'desktop',
    undefined,
    { cancelConnection: (owner, id) => runtime.cancelConnection(owner, id) },
  );
  const stream = runtime.dispatchMessage({
    identityId: 'owner',
    conversationId: conversation.id,
    content: 'Hello',
  });
  const events = [];
  const started = await stream.next();
  events.push(started.value);
  await registry.execute('owner', {
    action: 'update',
    instanceId: 'codex',
    expectedRevision: 1,
    patch: { enabled: false },
  });
  for await (const event of stream) events.push(event);
  expect(cancelled).toBe(true);
  expect(events.some((event) => event?.type === 'assistant.run.cancelled')).toBe(true);
  expect(events.some((event) => event?.type === 'assistant.run.completed')).toBe(false);
  await runtime.dispose();
});
