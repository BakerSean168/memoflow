import { describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/transport-contracts';
import type { IResultIpcClient } from '../types';
import { RepositoryIpcAdapter } from './repository-ipc.adapter';

function createResultIpcClientStub() {
  return {
    invoke: vi.fn(async () => ok({})),
  } as unknown as IResultIpcClient;
}

describe('RepositoryIpcAdapter knowledge repository connections', () => {
  it('routes durable installation status/finalize and knowledge connection methods over IPC', async () => {
    const ipcClient = createResultIpcClientStub();
    const adapter = new RepositoryIpcAdapter(ipcClient);
    await adapter.getKnowledgeRepositoryInstallationIntentStatus('intent-1');
    await adapter.finalizeKnowledgeRepositoryInstallationIntent('intent-1');
    await adapter.listKnowledgeRepositoryConnections();
    expect(ipcClient.invoke).toHaveBeenCalledWith(
      'repository:knowledge-connection:installation:status',
      { intentId: 'intent-1' },
    );
    expect(ipcClient.invoke).toHaveBeenCalledWith(
      'repository:knowledge-connection:installation:finalize',
      { intentId: 'intent-1' },
    );
    expect(ipcClient.invoke).toHaveBeenCalledWith('repository:knowledge-connection:list');
  });

  it('forwards the write-request ledger list and replay over real IPC channels (not an unavailable stub)', async () => {
    const ipcClient = createResultIpcClientStub();
    const adapter = new RepositoryIpcAdapter(ipcClient);
    await adapter.listKnowledgeWriteRequests({ connectionId: 'conn-1', limit: 10 });
    expect(ipcClient.invoke).toHaveBeenCalledWith('repository:knowledge-write-request:list', {
      connectionId: 'conn-1',
      limit: 10,
    });
    await adapter.replayKnowledgeWriteRequestProjection('wr-1');
    expect(ipcClient.invoke).toHaveBeenCalledWith('repository:knowledge-write-request:replay', {
      writeRequestId: 'wr-1',
    });
  });
});
