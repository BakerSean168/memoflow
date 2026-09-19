import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { DataPortabilityController, ServerHeldDataDisclosureController } from './data-portability.controller';

const context: ExecutionContext = {
  requestId: 'req-data-portability-1',
  traceId: 'req-data-portability-1',
  startedAt: 1_700_000_000_000,
  source: 'http',
  identityId: 'identity-1',
  deviceId: 'device-1',
};

describe('ServerHeldDataDisclosureController', () => {
  it('uses the authenticated identity and accepts only the empty request', async () => {
    const api = {
      exportServerHeldDataDisclosure: vi.fn().mockResolvedValue({
        fileName: 'disclosure.json',
        content: '{}',
        summary: { entityCounts: {}, cachedAttachmentBytes: 0, notes: [] },
      }),
    };
    const controller = new ServerHeldDataDisclosureController(api);

    await expect(controller.exportServerHeldDataDisclosure({}, context)).resolves.toMatchObject({
      ok: true,
      data: { fileName: 'disclosure.json' },
    });
    expect(api.exportServerHeldDataDisclosure).toHaveBeenCalledWith('identity-1', {});

    await expect(
      controller.exportServerHeldDataDisclosure({ includeCredentials: true }, context),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
  });
});

describe('DataPortabilityController V3 surface', () => {
  it('routes export, dry-run and apply through the V3 application port', async () => {
    const api = {
      exportPortableDataV3: vi.fn().mockResolvedValue({
        fileName: 'export-v3.json',
        content: '{}',
        summary: { capabilityKeys: ['preferences'], warnings: [] },
      }),
      dryRunPortableDataV3: vi.fn().mockResolvedValue({
        batchId: 'batch-1',
        dryRun: true,
        capabilities: [],
        created: {},
        updated: {},
        skipped: {},
        warnings: [],
      }),
      applyPortableDataV3: vi.fn().mockResolvedValue({
        batchId: 'batch-1',
        dryRun: false,
        capabilities: [],
        created: {},
        updated: {},
        skipped: {},
        warnings: [],
      }),
    };
    const controller = new DataPortabilityController(api);
    const content = '{"format":"memoflow.user-data-export","schemaVersion":3}';

    await expect(controller.exportPortableDataV3({ capabilities: ['preferences'] }, context)).resolves.toMatchObject({ ok: true });
    await expect(controller.dryRunPortableDataV3({ content }, context)).resolves.toMatchObject({ ok: true });
    await expect(controller.applyPortableDataV3({ content }, context)).resolves.toMatchObject({ ok: true });

    expect(api.exportPortableDataV3).toHaveBeenCalledWith('identity-1', { capabilities: ['preferences'] });
    expect(api.dryRunPortableDataV3).toHaveBeenCalledWith('identity-1', { content });
    expect(api.applyPortableDataV3).toHaveBeenCalledWith('identity-1', { content });
  });

  it('rejects legacy-shaped V2 request fields at the transport boundary', async () => {
    const api = {
      exportPortableDataV3: vi.fn(),
      dryRunPortableDataV3: vi.fn(),
      applyPortableDataV3: vi.fn(),
    };
    const controller = new DataPortabilityController(api);

    await expect(controller.exportPortableDataV3({ include: ['settings'] }, context)).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(api.exportPortableDataV3).not.toHaveBeenCalled();
  });
});
