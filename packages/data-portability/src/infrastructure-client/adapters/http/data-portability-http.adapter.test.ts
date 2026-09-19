import { describe, expect, it, vi } from 'vitest';
import { DataPortabilityHttpAdapter } from './data-portability-http.adapter';

describe('DataPortabilityHttpAdapter', () => {
  it('uses the V3 export, dry-run and apply routes', async () => {
    const httpClient = { post: vi.fn().mockResolvedValue({ ok: true, data: {} }) };
    const adapter = new DataPortabilityHttpAdapter(httpClient);
    const exportRequest = { capabilities: ['preferences'] } as const;
    const importRequest = { content: '{"format":"memoflow.user-data-export","schemaVersion":3}' };

    await adapter.exportPortableDataV3(exportRequest);
    await adapter.dryRunPortableDataV3(importRequest);
    await adapter.applyPortableDataV3(importRequest);

    expect(httpClient.post).toHaveBeenNthCalledWith(
      1,
      '/data-portability/export',
      exportRequest,
    );
    expect(httpClient.post).toHaveBeenNthCalledWith(
      2,
      '/data-portability/dry-run',
      importRequest,
    );
    expect(httpClient.post).toHaveBeenNthCalledWith(3, '/data-portability/apply', importRequest);
  });

  it('posts server-held disclosure to its dedicated non-import route', async () => {
    const httpClient = {
      post: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          fileName: 'disclosure.json',
          content: '{}',
          summary: { entityCounts: {}, cachedAttachmentBytes: 0, notes: [] },
        },
      }),
    };
    const adapter = new DataPortabilityHttpAdapter(httpClient);

    const result = await adapter.exportServerHeldDataDisclosure({});

    expect(httpClient.post).toHaveBeenCalledWith(
      '/data-portability/server-held-data-disclosure',
      {},
    );
    expect(result.ok).toBe(true);
  });
});
