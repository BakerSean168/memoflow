import { describe, expect, it, vi } from 'vitest';
import { ServerHeldDataDisclosureEnvelopeV1Schema } from '@memoflow/contracts/data-portability';
import type { ServerHeldDataDisclosureSource } from '../../server-held-data-disclosure.source';
import { ExportServerHeldDataDisclosureUseCase } from '../export-server-held-data-disclosure.use-case';

describe('ExportServerHeldDataDisclosureUseCase', () => {
  it('builds a non-importable disclosure using the current four-axis knowledge model', async () => {
    const source: ServerHeldDataDisclosureSource = {
      readForIdentity: vi.fn().mockResolvedValue({
        knowledgeSpaces: [
          {
            id: 'space-1',
            createdAt: '2026-07-18T00:00:00.000Z',
            updatedAt: '2026-07-20T00:00:00.000Z',
          },
        ],
        knowledgeRemoteBindings: [
          {
            id: 'binding-1',
            knowledgeSpaceId: 'space-1',
            provider: 'GitHub',
            installationId: 'installation-1',
            repositoryId: 'repository-1',
            repositoryFullNameSnapshot: 'owner/vault',
            connectedAt: '2026-07-18T00:00:00.000Z',
            disconnectedAt: null,
            version: 2,
          },
        ],
        remoteRepositoryObservations: [],
        remoteHistoryFences: [],
        knowledgeProjectionCheckpoints: [],
        githubWebhookDeliveries: [],
        knowledgeNoteProjections: [
          {
            id: 'projection-1',
            bindingId: 'binding-1',
            relativePath: 'notes/private.md',
            commitSha: 'commit-1',
            blobSha: 'blob-1',
            contentHash: 'hash-1',
            frontmatter: { tags: ['private'] },
            markdownContent: '# Private note',
            indexStatus: 'INDEXED',
            createdAt: '2026-07-18T00:00:00.000Z',
            updatedAt: '2026-07-18T00:00:00.000Z',
            deletedAt: null,
          },
        ],
        knowledgeAttachmentProjections: [],
        knowledgeAttachmentContentCaches: [
          {
            bindingId: 'binding-1',
            blobSha: 'attachment-blob-1',
            byteSize: 3,
            contentBase64: 'AQID',
            cachedAt: '2026-07-20T00:00:00.000Z',
            expiresAt: '2026-07-20T01:00:00.000Z',
          },
        ],
        knowledgeWriteRequests: [],
        aiKnowledgeIndexEntries: [],
      }),
    };
    const useCase = new ExportServerHeldDataDisclosureUseCase(
      source,
      () => new Date('2026-07-20T12:34:56.000Z'),
    );

    const result = await useCase.execute('identity-1');
    const envelope = JSON.parse(result.content) as unknown;

    expect(result.summary.entityCounts).toMatchObject({
      knowledgeSpaces: 1,
      knowledgeRemoteBindings: 1,
      knowledgeNoteProjections: 1,
      knowledgeAttachmentContentCaches: 1,
    });
    expect(result.summary.cachedAttachmentBytes).toBe(3);
    expect(ServerHeldDataDisclosureEnvelopeV1Schema.safeParse(envelope).success).toBe(true);
    expect(envelope).toMatchObject({
      kind: 'memoflow.server-held-data-disclosure',
      subject: { identityId: 'identity-1' },
      scope: { importMode: 'not-importable', includesLocalVaultFiles: false },
      data: {
        knowledgeRemoteBindings: [{ id: 'binding-1', repositoryId: 'repository-1' }],
        knowledgeNoteProjections: [{ bindingId: 'binding-1', markdownContent: '# Private note' }],
        knowledgeAttachmentContentCaches: [{ bindingId: 'binding-1', contentBase64: 'AQID' }],
      },
    });
  });
});
