import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ArchiveManifestSchema } from '@memoflow/data-portability-contracts';
import { createDataPortabilityModule } from './data-portability.module';

const content = JSON.stringify({
  format: 'memoflow.user-data-export',
  schemaVersion: 3,
  exportedAt: '2026-11-09T00:00:00.000Z',
  productVersion: 'test',
  capabilities: [
    {
      key: 'ai-conversation-messages',
      schemaVersion: 1,
      payload: {
        archive: { digest: 'a'.repeat(64), threads: 0, messages: 0 },
        threads: [],
      },
    },
  ],
});

describe('generic V3 archive rejection', () => {
  it('refuses to dry-run messages without a sidecar archive', async () => {
    const module = createDataPortabilityModule({});
    await expect(
      module.api.dryRunPortableDataV3('account-1', { content }),
    ).rejects.toMatchObject({ code: 'IMPORT_ARCHIVE_REQUIRED' });
  });

  it('refuses to apply messages without a sidecar archive', async () => {
    const module = createDataPortabilityModule({});
    await expect(
      module.api.applyPortableDataV3('account-1', { content }),
    ).rejects.toMatchObject({ code: 'IMPORT_ARCHIVE_REQUIRED' });
  });
});

const conversationsCapability = {
  key: 'ai-conversations' as const,
  schemaVersion: 3,
  dependsOn: [] as const,
  payloadSchema: z.object({ conversations: z.array(z.object({}).passthrough()) }),
  async export() {
    return {
      conversations: [
        { ref: 'ai-conversations:1', name: 'Chat', status: 'Active' },
      ],
    };
  },
  async dryRun() {
    return { created: 0, updated: 0, skipped: 0, warnings: [] };
  },
  async apply() {
    return { created: 0, updated: 0, skipped: 0, warnings: [] };
  },
};

function messageCapability(payload: unknown | null) {
  return {
    key: 'ai-conversation-messages' as const,
    schemaVersion: 1,
    dependsOn: ['ai-conversations'] as const,
    payloadSchema: ArchiveManifestSchema,
    async export() {
      return payload;
    },
    async dryRun() {
      return { created: 0, updated: 0, skipped: 0, warnings: [] };
    },
    async apply() {
      return { created: 0, updated: 0, skipped: 0, warnings: [] };
    },
  };
}

const messageManifest = {
  archive: { digest: 'a'.repeat(64), threads: 1, messages: 2 },
  threads: [
    { conversationRef: 'ai-conversations:1', messageCount: 2, digest: 'b'.repeat(64) },
  ],
};

describe('V3 export message boundary', () => {
  it('fails closed instead of emitting an envelope whose archive bytes cannot be delivered', async () => {
    const module = createDataPortabilityModule({
      portableCapabilities: [
        conversationsCapability,
        messageCapability(messageManifest),
      ] as never,
    });

    await expect(
      module.api.exportPortableDataV3('IdentityId_00000000-0000-4000-8000-000000000001', {}),
    ).rejects.toMatchObject({ code: 'IMPORT_ARCHIVE_REQUIRED' });
  });

  it('keeps the existing export envelope when the account has no messages', async () => {
    const module = createDataPortabilityModule({
      portableCapabilities: [
        conversationsCapability,
        messageCapability(null),
      ] as never,
    });

    const result = await module.api.exportPortableDataV3(
      'IdentityId_00000000-0000-4000-8000-000000000001',
      {},
    );
    expect(result.summary.capabilityKeys).toEqual(['ai-conversations']);
    expect(JSON.parse(result.content).capabilities).toHaveLength(1);
  });
});
