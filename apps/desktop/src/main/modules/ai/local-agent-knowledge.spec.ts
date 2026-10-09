import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { LocalVaultRuntime } from '@memoflow/repository/electron';
import { KnowledgeDocumentIdSchema } from '@memoflow/contracts/repository';
import { LocalAgentRepository } from '@memoflow/ai';
import { createPowerSyncSqliteFixture } from '@memoflow/test-utils/helpers/powersync-sqlite';
import { createTimeContext } from '@memoflow/time';
import { DesktopKnowledgeSourceAdapter } from './desktop-knowledge-source.adapter';
import { createDesktopLocalAgentTools } from './local-agent-tools';

it('reads a confirmed local Vault note through MCP and rejects paths as document IDs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'memoflow-agent-knowledge-'));
  const vault = join(root, 'vault');
  await mkdir(vault);
  const runtime = new LocalVaultRuntime({
    bindingFilePath: join(root, 'binding.json'),
    writeLedgerFilePath: join(root, 'ledger.json'),
    localProfileId: 'test',
    platform: { selectDirectory: async () => vault, openExternal: async () => {} },
  });
  const f = createPowerSyncSqliteFixture();
  const store = new LocalAgentRepository(f.db);
  const bridge = createDesktopLocalAgentTools(
    f.db,
    store,
    () => true,
    { getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }) },
    new DesktopKnowledgeSourceAdapter(runtime),
  );
  try {
    const binding = await runtime.selectVault();
    const documentId = KnowledgeDocumentIdSchema.parse('kdoc_00000000-0000-4000-8000-000000000001');
    await runtime.writeConfirmedNote({
      expectedBindingId: binding!.binding.id,
      relativePath: 'notes/review.md',
      knowledgeDocumentId: documentId,
      contentMarkdown: '# Reviewed knowledge\n\nOrchard evidence.',
      proposalId: 'review',
      proposalRevision: 1,
      requestId: 'review',
    });
    const content = await readFile(join(vault, 'notes/review.md'), 'utf8');
    const connection = await store.createConnection('owner', {
      driver: 'pi',
      name: 'Pi',
      executablePath: 'pi',
      enabled: true,
      writeScopes: [],
    });
    const grant = await bridge.open({
      identityId: 'owner',
      connectionId: connection.id,
      conversationId: 'test',
      runId: 'test',
    });
    async function call(name: string, args: unknown) {
      return (
        await fetch(grant.url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${grant.token}`,
            accept: 'application/json, text/event-stream',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name, arguments: args },
          }),
        })
      ).text();
    }
    expect(await call('knowledge_search', { query: 'Orchard', limit: 5 })).toContain(documentId);
    expect(await call('knowledge_search', { query: 'Orchard', limit: 5 })).toContain(
      `/repository?note=${documentId}`,
    );
    expect(await call('knowledge_get', { documentId })).toContain('Orchard evidence');
    expect(await call('knowledge_get', { documentId: '../../secret.md' })).not.toContain(
      'Orchard evidence',
    );
    expect(await readFile(join(vault, 'notes/review.md'), 'utf8')).toBe(content);
  } finally {
    await bridge.dispose();
    await runtime.dispose();
    f.close();
    await rm(root, { recursive: true, force: true });
  }
});
