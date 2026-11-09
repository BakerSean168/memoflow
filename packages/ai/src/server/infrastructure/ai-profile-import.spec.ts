import { describe, expect, it } from 'vitest';
import type { PortableReferencePort } from '@memoflow/data-portability-contracts';
import { createAiMessageExportCapability } from './ai-profile-import';

const identity = 'IdentityId_00000000-0000-4000-8000-000000000865';

const references: PortableReferencePort = {
  declareExportReference: () => 'ai-conversations:1' as never,
  resolveExportReference: () => 'ai-conversations:1' as never,
  bindImportedReference: () => undefined,
  resolveImportedReference: () => {
    throw new Error('not bound');
  },
  hasImportedReference: () => false,
};

const client = {
  async $queryRawUnsafe() {
    return [];
  },
  async $executeRawUnsafe() {
    return 0;
  },
};

describe('createAiMessageExportCapability', () => {
  it('is the message capability and exports nothing when no live thread exists', async () => {
    const capability = createAiMessageExportCapability(client);
    expect(capability.key).toBe('ai-conversation-messages');
    expect(capability.schemaVersion).toBe(1);
    expect(capability.dependsOn).toEqual(['ai-conversations']);
    await expect(capability.export({ identityId: identity, references })).resolves.toBeNull();
  });

  it('cannot import messages because the instance is export-only', async () => {
    const capability = createAiMessageExportCapability(client);
    const payload = capability.payloadSchema.parse({
      archive: { digest: 'a'.repeat(64), threads: 0, messages: 0 },
      threads: [],
    });
    await expect(capability.apply(payload, { identityId: identity, references })).rejects.toThrow(
      'Export-only message capability cannot import messages',
    );
  });
});
