import { describe, expect, it, vi } from 'vitest';
import type { IResultIpcClient } from '../../types';
import type {
  ExportPortableDataV3Res,
  PortableDataV3ImportRes,
} from '@memoflow/contracts/data-portability';
import type { Result } from '@memoflow/contracts/result';
import { DataPortabilityIpcAdapter } from '../data-portability-ipc.adapter';

function createMockIpcClient(): IResultIpcClient & { invoke: ReturnType<typeof vi.fn> } {
  return { invoke: vi.fn() };
}

const exportResult: Result<ExportPortableDataV3Res> = {
  ok: true,
  data: {
    fileName: 'test-export-v3.json',
    content: '{"format":"memoflow.user-data-export","schemaVersion":3}',
    summary: { capabilityKeys: ['preferences'], warnings: [] },
  },
};

const importResult: Result<PortableDataV3ImportRes> = {
  ok: true,
  data: {
    batchId: 'batch-1',
    dryRun: true,
    capabilities: [],
    created: {},
    updated: {},
    skipped: {},
    warnings: [],
  },
};

describe('DataPortabilityIpcAdapter', () => {
  it('does not expose server-held disclosure through local IPC', async () => {
    const mockClient = createMockIpcClient();
    const adapter = new DataPortabilityIpcAdapter(mockClient);

    await expect(adapter.exportServerHeldDataDisclosure({})).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_SUPPORTED' },
    });
    expect(mockClient.invoke).not.toHaveBeenCalled();
  });

  it('uses the V3 export channel and forwards the result', async () => {
    const mockClient = createMockIpcClient();
    mockClient.invoke.mockResolvedValue(exportResult);
    const adapter = new DataPortabilityIpcAdapter(mockClient);
    const request = { capabilities: ['preferences'] } as const;

    await expect(adapter.exportPortableDataV3(request)).resolves.toBe(exportResult);
    expect(mockClient.invoke).toHaveBeenCalledWith('data-portability:export', request);
  });

  it('uses separate V3 dry-run and apply channels', async () => {
    const mockClient = createMockIpcClient();
    mockClient.invoke.mockResolvedValue(importResult);
    const adapter = new DataPortabilityIpcAdapter(mockClient);
    const request = { content: '{"format":"memoflow.user-data-export","schemaVersion":3}' };

    await expect(adapter.dryRunPortableDataV3(request)).resolves.toBe(importResult);
    await expect(adapter.applyPortableDataV3(request)).resolves.toBe(importResult);
    expect(mockClient.invoke).toHaveBeenNthCalledWith(1, 'data-portability:dry-run', request);
    expect(mockClient.invoke).toHaveBeenNthCalledWith(2, 'data-portability:apply', request);
  });
});
