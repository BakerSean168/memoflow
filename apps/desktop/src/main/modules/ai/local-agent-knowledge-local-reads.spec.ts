import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createPowerSyncSqliteFixture } from '@memoflow/test-utils/helpers/powersync-sqlite';
import {
  AgentInstanceReadService,
  LocalAgentRepository,
  LocalMcpClientRepository,
  PermissionLocalRepository,
  createAIPowerSyncRepositories,
} from '@memoflow/ai';
import { createSystemClock, createTimeContext } from '@memoflow/time';
import { LabelService, PowerSyncLabelRepository } from '@memoflow/label';
import { PowerSyncRelationRepository, RelationService } from '@memoflow/relation';
import { LocalVaultRuntime, type LocalVaultPlatform } from '@memoflow/repository/electron';
import { createDesktopLocalAgentTools } from './local-agent-tools';
import { DesktopKnowledgeNotePersistenceAdapter } from './desktop-knowledge-note-persistence.adapter';
import { DesktopKnowledgeSourceAdapter } from './desktop-knowledge-source.adapter';
import { LocalVaultKnowledgeDocumentRefResolver } from '../relation/local-vault-knowledge-document-ref.resolver';
import { bindLocalLabelReadPort } from './label-read.adapter';
import { bindLocalAgentArchiveReadPort } from './agent-archive-read.adapter';

const identityId = 'IdentityId_00000000-0000-4000-8000-000000000001';
const NOW = 1_760_000_000_000;

describe('Local MCP knowledge drafts and Local owner reads (#1076 step 4)', () => {
  let fixture: ReturnType<typeof createPowerSyncSqliteFixture>;
  let root: string;
  let vault: string;
  let vaultRuntime: LocalVaultRuntime;
  let store: LocalAgentRepository;
  let bridge: ReturnType<typeof createDesktopLocalAgentTools>;

  async function callMcp(
    grant: { url: string; token: string },
    method: string,
    params: Record<string, unknown> = {},
  ) {
    const response = await fetch(grant.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${grant.token}`,
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const text = await response.text();
    const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
    if (dataLine) return JSON.parse(dataLine.slice(6));
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }

  function payload<T = any>(response: any): T {
    const text = response.result?.content?.[0]?.text;
    if (text) {
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    }
    return response.result?.structuredContent as T;
  }

  function errorCode(response: any): string | undefined {
    return response.result?.content?.[0]?.text ?? response.error?.message;
  }

  async function tools(grant: { url: string; token: string }) {
    const listed = await callMcp(grant, 'tools/list');
    return (listed.result?.tools ?? []).map((tool: { name: string }) => tool.name) as string[];
  }

  async function openGrant(writeScopes: string[], conversationId: string) {
    const connection = await store.createConnection(identityId, {
      driver: 'codex',
      name: `Local ${conversationId}`,
      executablePath: 'codex',
      enabled: true,
      writeScopes: writeScopes as never,
    });
    return bridge.open({
      permissionMode: 'auto-approve',
      identityId,
      connectionId: connection.id,
      conversationId,
      runId: `run-${conversationId}`,
    });
  }

  afterEach(async () => {
    await bridge.dispose();
    fixture.close();
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it('creates, reads, updates and delivers a draft through the real Vault owner', async () => {
    fixture = createPowerSyncSqliteFixture();
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'local-agent-knowledge-'));
    vault = path.join(root, 'Vault');
    await fs.promises.mkdir(vault, { recursive: true });
    const platform: LocalVaultPlatform = {
      selectDirectory: async () => vault,
      openExternal: async () => undefined,
    };
    vaultRuntime = new LocalVaultRuntime({
      bindingFilePath: path.join(root, 'profile', 'vault-binding.json'),
      writeLedgerFilePath: path.join(root, 'profile', 'vault-write-ledger.json'),
      localProfileId: 'profile-1',
      platform,
      now: () => NOW,
    });
    await vaultRuntime.selectVault();
    store = new LocalAgentRepository(fixture.db);
    const repositories = createAIPowerSyncRepositories(fixture.db);
    const labelService = new LabelService(new PowerSyncLabelRepository(fixture.db), {
      clock: createSystemClock(),
    });
    const relationService = new RelationService(new PowerSyncRelationRepository(fixture.db));
    bridge = createDesktopLocalAgentTools(
      fixture.db,
      store,
      () => true,
      {
        getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
      },
      new DesktopKnowledgeSourceAdapter(vaultRuntime),
      undefined,
      { clients: new LocalMcpClientRepository(fixture.db) },
      {
        labels: bindLocalLabelReadPort(labelService),
        agents: bindLocalAgentArchiveReadPort(
          new AgentInstanceReadService(repositories.agentInstanceRepository),
        ),
        relations: {
          service: relationService,
          knowledge: new LocalVaultKnowledgeDocumentRefResolver(vaultRuntime),
        },
        knowledgeNotes: new DesktopKnowledgeNotePersistenceAdapter(vaultRuntime),
      },
    );
    await new PermissionLocalRepository(fixture.db).saveSettings(identityId, {
      preset: 'full_auto',
      agentPresets: {},
      revision: 2,
    });
    const grant = await openGrant(['knowledge:write', 'tasks:write'], 'knowledge-draft');

    expect(await tools(grant)).toEqual(
      expect.arrayContaining([
        'knowledge_draft_create',
        'knowledge_draft_get',
        'knowledge_draft_update',
        'knowledge_draft_deliver',
      ]),
    );

    const created = payload(
      await callMcp(grant, 'tools/call', {
        name: 'knowledge_draft_create',
        arguments: {
          title: 'Team Retro',
          topic: 'Weekly team retrospective',
          markdown: '# Team Retro\n\nFirst draft.',
          tags: ['retro'],
        },
      }),
    ).draft;
    expect(created).toMatchObject({
      title: 'Team Retro',
      revision: 1,
      tags: ['retro'],
      source: { kind: 'local_vault' },
    });
    expect(created.targetSubpath).toBe(`notes/${created.id}.md`);

    const read = payload(
      await callMcp(grant, 'tools/call', {
        name: 'knowledge_draft_get',
        arguments: { id: created.knowledgeDocumentId },
      }),
    );
    // Drafts are addressed by their own id, not the document id.
    expect(read.draft).toBeNull();
    const readById = payload(
      await callMcp(grant, 'tools/call', {
        name: 'knowledge_draft_get',
        arguments: { id: created.id },
      }),
    );
    expect(readById.draft).toMatchObject({
      title: 'Team Retro',
      revision: 1,
      markdown: '# Team Retro\n\nFirst draft.',
    });

    const updated = payload(
      await callMcp(grant, 'tools/call', {
        name: 'knowledge_draft_update',
        arguments: {
          id: created.id,
          expectedRevision: 1,
          changes: { markdown: '# Team Retro\n\nReviewed draft.' },
        },
      }),
    ).draft;
    expect(updated).toMatchObject({ revision: 2, markdown: '# Team Retro\n\nReviewed draft.' });

    const stale = await callMcp(grant, 'tools/call', {
      name: 'knowledge_draft_update',
      arguments: { id: created.id, expectedRevision: 1, changes: { title: 'Stale' } },
    });
    expect(stale.result?.isError).toBe(true);
    expect(errorCode(stale)).toBe('CONFLICT');

    const delivered = payload(
      await callMcp(grant, 'tools/call', {
        name: 'knowledge_draft_deliver',
        arguments: { id: created.id, expectedRevision: 2 },
      }),
    );
    expect(delivered).toMatchObject({
      draftId: created.id,
      revision: 2,
      noteId: created.knowledgeDocumentId,
    });
    const noteFile = path.join(vault, delivered.notePath);
    const written = await fs.promises.readFile(noteFile, 'utf8');
    expect(written).toContain('Reviewed draft.');
    expect(written).toContain(`memoflow_id: ${created.knowledgeDocumentId}`);

    // The delivered note is readable through the existing knowledge read tool.
    const readBack = payload(
      await callMcp(grant, 'tools/call', {
        name: 'knowledge_get',
        arguments: { documentId: created.knowledgeDocumentId },
      }),
    );
    expect(readBack.note.content).toContain('Reviewed draft.');

    // The same revision replays the durable write instead of creating a copy.
    const replayed = payload(
      await callMcp(grant, 'tools/call', {
        name: 'knowledge_draft_deliver',
        arguments: { id: created.id, expectedRevision: 2 },
      }),
    );
    expect(replayed).toEqual(delivered);
    const notes = (await fs.promises.readdir(path.join(vault, 'notes'))).filter((file) =>
      file.endsWith('.md'),
    );
    expect(notes).toHaveLength(1);

    const deliveredEdit = await callMcp(grant, 'tools/call', {
      name: 'knowledge_draft_update',
      arguments: { id: created.id, expectedRevision: 2, changes: { title: 'After delivery' } },
    });
    expect(deliveredEdit.result?.isError).toBe(true);
    expect(errorCode(deliveredEdit)).toBe('CONFLICT');
  });

  it('lets an external client with knowledge:write create and deliver, then reads the note back', async () => {
    fixture = createPowerSyncSqliteFixture();
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'local-agent-knowledge-ext-'));
    vault = path.join(root, 'Vault');
    await fs.promises.mkdir(vault, { recursive: true });
    vaultRuntime = new LocalVaultRuntime({
      bindingFilePath: path.join(root, 'profile', 'vault-binding.json'),
      writeLedgerFilePath: path.join(root, 'profile', 'vault-write-ledger.json'),
      localProfileId: 'profile-1',
      platform: {
        selectDirectory: async () => vault,
        openExternal: async () => undefined,
      },
      now: () => NOW,
    });
    await vaultRuntime.selectVault();
    store = new LocalAgentRepository(fixture.db);
    bridge = createDesktopLocalAgentTools(
      fixture.db,
      store,
      () => true,
      {
        getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
      },
      new DesktopKnowledgeSourceAdapter(vaultRuntime),
      undefined,
      { clients: new LocalMcpClientRepository(fixture.db) },
      {
        knowledgeNotes: new DesktopKnowledgeNotePersistenceAdapter(vaultRuntime),
      },
    );
    await new PermissionLocalRepository(fixture.db).saveSettings(identityId, {
      preset: 'full_auto',
      agentPresets: {},
      revision: 2,
    });
    const native = await openGrant(['knowledge:write'], 'knowledge-native');
    const external = await bridge.createMcpClient(identityId, {
      name: 'External Knowledge Writer',
      writeScopes: ['knowledge:write'],
    });
    const externalGrant = { url: external.endpoint.url, token: external.token };
    expect(await tools(externalGrant)).toEqual(
      expect.arrayContaining(['knowledge_draft_create', 'knowledge_draft_deliver']),
    );

    const created = payload(
      await callMcp(externalGrant, 'tools/call', {
        name: 'knowledge_draft_create',
        arguments: {
          title: 'External Note',
          topic: 'External note',
          markdown: '# External Note\n\nFrom ChatGPT.',
        },
      }),
    ).draft;
    const delivered = payload(
      await callMcp(externalGrant, 'tools/call', {
        name: 'knowledge_draft_deliver',
        arguments: { id: created.id, expectedRevision: 1 },
      }),
    );
    expect(delivered.noteId).toBe(created.knowledgeDocumentId);
    const readBack = payload(
      await callMcp(native, 'tools/call', {
        name: 'knowledge_get',
        arguments: { documentId: created.knowledgeDocumentId },
      }),
    );
    expect(readBack.note.content).toContain('From ChatGPT.');

    const reader = await bridge.createMcpClient(identityId, {
      name: 'External Knowledge Reader',
      writeScopes: [],
    });
    const readerGrant = { url: reader.endpoint.url, token: reader.token };
    expect(await tools(readerGrant)).not.toContain('knowledge_draft_create');
    const refused = await callMcp(readerGrant, 'tools/call', {
      name: 'knowledge_draft_create',
      arguments: { title: 'Refused', markdown: '# Refused' },
    });
    expect(refused.error ?? refused.result?.isError).toBeTruthy();
  });

  it('reads labels and AI agent archive entries from Local owners', async () => {
    fixture = createPowerSyncSqliteFixture();
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'local-agent-reads-'));
    vault = path.join(root, 'Vault');
    await fs.promises.mkdir(vault, { recursive: true });
    vaultRuntime = new LocalVaultRuntime({
      bindingFilePath: path.join(root, 'profile', 'vault-binding.json'),
      writeLedgerFilePath: path.join(root, 'profile', 'vault-write-ledger.json'),
      localProfileId: 'profile-1',
      platform: {
        selectDirectory: async () => vault,
        openExternal: async () => undefined,
      },
      now: () => NOW,
    });
    await vaultRuntime.selectVault();
    store = new LocalAgentRepository(fixture.db);
    const repositories = createAIPowerSyncRepositories(fixture.db);
    const labelService = new LabelService(new PowerSyncLabelRepository(fixture.db), {
      clock: createSystemClock(),
    });
    bridge = createDesktopLocalAgentTools(
      fixture.db,
      store,
      () => true,
      {
        getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
      },
      undefined,
      undefined,
      { clients: new LocalMcpClientRepository(fixture.db) },
      {
        labels: bindLocalLabelReadPort(labelService),
        agents: bindLocalAgentArchiveReadPort(
          new AgentInstanceReadService(repositories.agentInstanceRepository),
        ),
      },
    );
    await new PermissionLocalRepository(fixture.db).saveSettings(identityId, {
      preset: 'full_auto',
      agentPresets: {},
      revision: 2,
    });
    const grant = await openGrant([], 'local-reads');

    const label = await labelService.create({
      identityId,
      name: 'Focus',
      color: '#112233',
    });
    const listed = payload(
      await callMcp(grant, 'tools/call', {
        name: 'label_list',
        arguments: { search: 'Foc', limit: 10 },
      }),
    );
    expect(listed.items).toEqual([
      expect.objectContaining({ id: label.id, name: 'Focus', color: '#112233' }),
    ]);
    const resolved = payload(
      await callMcp(grant, 'tools/call', {
        name: 'label_resolve_names',
        arguments: { names: ['Focus', 'Later'] },
      }),
    );
    expect(resolved.items.map((item: { name: string }) => item.name)).toEqual(['Focus', 'Later']);

    await repositories.agentInstanceRepository.create(identityId, {
      instanceId: 'codex-work',
      driver: 'codex',
      name: 'Work',
      accentColor: '#445566',
      enabled: true,
      revision: 1,
      createdAt: 1_000,
      updatedAt: 2_000,
    });
    const agents = payload(
      await callMcp(grant, 'tools/call', {
        name: 'ai_agent_list',
        arguments: { limit: 10 },
      }),
    );
    const work = agents.agents.find(
      (entry: { instanceId: string }) => entry.instanceId === 'codex-work',
    );
    expect(work).toEqual({
      instanceId: 'codex-work',
      driver: 'codex',
      name: 'Work',
      enabled: true,
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
    expect(Object.keys(work).sort()).toEqual([
      'createdAt',
      'driver',
      'enabled',
      'instanceId',
      'name',
      'updatedAt',
    ]);
    const agent = payload(
      await callMcp(grant, 'tools/call', {
        name: 'ai_agent_get',
        arguments: { instanceId: 'codex-work' },
      }),
    );
    expect(agent.agent).toEqual(work);
    const missingAgent = await callMcp(grant, 'tools/call', {
      name: 'ai_agent_get',
      arguments: { instanceId: 'missing-agent' },
    });
    expect(errorCode(missingAgent)).toBe('NOT_FOUND');
  });

  it('returns relation neighbors only when both peer nodes are visible', async () => {
    fixture = createPowerSyncSqliteFixture();
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'local-agent-relations-'));
    vault = path.join(root, 'Vault');
    await fs.promises.mkdir(vault, { recursive: true });
    vaultRuntime = new LocalVaultRuntime({
      bindingFilePath: path.join(root, 'profile', 'vault-binding.json'),
      writeLedgerFilePath: path.join(root, 'profile', 'vault-write-ledger.json'),
      localProfileId: 'profile-1',
      platform: {
        selectDirectory: async () => vault,
        openExternal: async () => undefined,
      },
      now: () => NOW,
    });
    await vaultRuntime.selectVault();
    store = new LocalAgentRepository(fixture.db);
    const relationService = new RelationService(new PowerSyncRelationRepository(fixture.db));
    bridge = createDesktopLocalAgentTools(
      fixture.db,
      store,
      () => true,
      {
        getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
      },
      new DesktopKnowledgeSourceAdapter(vaultRuntime),
      undefined,
      { clients: new LocalMcpClientRepository(fixture.db) },
      {
        relations: {
          service: relationService,
          knowledge: new LocalVaultKnowledgeDocumentRefResolver(vaultRuntime),
        },
        knowledgeNotes: new DesktopKnowledgeNotePersistenceAdapter(vaultRuntime),
      },
    );
    await new PermissionLocalRepository(fixture.db).saveSettings(identityId, {
      preset: 'full_auto',
      agentPresets: {},
      revision: 2,
    });
    const grant = await openGrant(['tasks:write', 'knowledge:write'], 'relations');

    const taskReceipt = payload(
      await callMcp(grant, 'tools/call', {
        name: 'task_plan_create',
        arguments: {
          idempotencyKey: 'relation-task',
          plan: {
            name: 'Relation Task',
            importance: 'Moderate',
            schedule: {
              kind: 'OneTime',
              date: new Date().toISOString().slice(0, 10),
              timing: { kind: 'AllDay' },
            },
          },
        },
      }),
    );
    const taskRow = fixture.sql
      .prepare('SELECT id FROM task_plans ORDER BY created_at DESC LIMIT 1')
      .get() as { id: string };
    expect(taskReceipt.receiptId).toBeDefined();

    const draft = payload(
      await callMcp(grant, 'tools/call', {
        name: 'knowledge_draft_create',
        arguments: {
          title: 'Relation Note',
          topic: 'Relation note',
          markdown: '# Relation Note',
        },
      }),
    ).draft;
    await callMcp(grant, 'tools/call', {
      name: 'knowledge_draft_deliver',
      arguments: { id: draft.id, expectedRevision: 1 },
    });

    await relationService.add(identityId, {
      subject: { type: 'task', id: taskRow.id as never },
      relationType: 'related',
      object: { type: 'note', id: draft.knowledgeDocumentId },
    });
    await relationService.add(identityId, {
      subject: { type: 'task', id: taskRow.id as never },
      relationType: 'related',
      object: { type: 'goal', id: 'IGoalId_550e8400-e29b-41d4-a716-446655440099' as never },
    });

    const neighbors = payload(
      await callMcp(grant, 'tools/call', {
        name: 'relation_neighbors',
        arguments: {
          node: { type: 'task', id: taskRow.id },
          relationType: 'related',
          limit: 20,
        },
      }),
    );
    expect(neighbors.items).toHaveLength(1);
    expect(neighbors.items[0]).toMatchObject({
      relationType: 'related',
      direction: 'outgoing',
      targetNode: { type: 'knowledge', id: draft.knowledgeDocumentId },
    });
  });
});
