import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/transport-contracts';
import type { IResultIpcClient } from '../types';
import { RepositoryIpcAdapter } from './repository-ipc.adapter';

function createResultIpcClientStub() {
  return { invoke: vi.fn(async () => ok({})) } as unknown as IResultIpcClient;
}

describe('RepositoryIpcAdapter local-only knowledge boundary', () => {
  it('rejects retired remote connection, sync and ledger calls before IPC', async () => {
    const ipcClient = createResultIpcClientStub();
    const adapter = new RepositoryIpcAdapter(ipcClient);
    const results = await Promise.all([
      adapter.startKnowledgeRepositoryInstallation(),
      adapter.completeKnowledgeRepositoryInstallation({} as never),
      adapter.getKnowledgeRepositoryInstallationIntentStatus('intent-1'),
      adapter.finalizeKnowledgeRepositoryInstallationIntent('intent-1'),
      adapter.listKnowledgeRepositoryConnections(),
      adapter.refreshKnowledgeRepositoryObservation('connection-1'),
      adapter.connectKnowledgeRepository({} as never),
      adapter.disconnectKnowledgeRepository('connection-1'),
      adapter.previewKnowledgeRepositoryReconciliation('connection-1'),
      adapter.executeKnowledgeRepositoryReconciliation({} as never),
      adapter.syncKnowledgeRepository({} as never),
      adapter.issueDesktopKnowledgeRepositoryToken('connection-1'),
      adapter.listKnowledgeWriteRequests({ limit: 10 }),
      adapter.replayKnowledgeWriteRequestProjection('old-write'),
    ]);
    for (const result of results)
      expect(result).toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
    expect(ipcClient.invoke).not.toHaveBeenCalled();
  });

  it('reads Git observations through the dedicated local-only channel', async () => {
    const ipcClient = createResultIpcClientStub();
    const adapter = new RepositoryIpcAdapter(ipcClient);
    await adapter.getLocalVaultGitChanges();
    expect(ipcClient.invoke).toHaveBeenCalledWith('repository:local-vault:git-changes');
  });

  it('keeps local source selection, receipts and confirmed writes on the local channels', async () => {
    const ipcClient = createResultIpcClientStub();
    const adapter = new RepositoryIpcAdapter(ipcClient);
    await adapter.selectLocalVault();
    await adapter.listLocalVaultWrites();
    await adapter.writeConfirmedLocalVaultNote({ requestId: 'reviewed' } as never);
    expect(ipcClient.invoke).toHaveBeenNthCalledWith(1, 'repository:local-vault:select', {});
    expect(ipcClient.invoke).toHaveBeenNthCalledWith(2, 'repository:local-vault:writes');
    expect(ipcClient.invoke).toHaveBeenNthCalledWith(
      3,
      'repository:local-vault:note:write-confirmed',
      { requestId: 'reviewed' },
    );
  });
});
