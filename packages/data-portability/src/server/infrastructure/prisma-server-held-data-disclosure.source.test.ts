import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import { PrismaServerHeldDataDisclosureSource } from './prisma-server-held-data-disclosure.source';

describe('PrismaServerHeldDataDisclosureSource', () => {
  it('discloses the ADR-089 four-axis knowledge state without credentials', async () => {
    const timestamp = new Date('2026-07-20T00:00:00.000Z');
    const bindingFindMany = vi.fn().mockResolvedValue([
      {
        id: 'binding-1',
        knowledgeSpaceId: 'space-1',
        provider: 'GitHub',
        installationId: 'installation-1',
        repositoryId: 'repository-1',
        repositoryFullNameSnapshot: 'owner/vault',
        connectedAt: timestamp,
        disconnectedAt: null,
        version: 1,
        knowledgeSpace: {
          id: 'space-1',
          createdAt: timestamp,
          updatedAt: timestamp,
          documentIdentities: [
            {
              knowledgeSpaceId: 'space-1',
              knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440390',
              origin: 'MemoFlowCreated',
              originRequestId: 'request-1',
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ],
        },
        observation: {
          bindingId: 'binding-1',
          observedAt: timestamp,
          accountId: 'github-account-1',
          repositoryFullName: 'owner/vault',
          defaultBranch: 'main',
          isPrivate: true,
          archived: false,
          disabled: false,
          contentsPermission: 'write',
          installationSuspended: false,
          eligibilityState: 'Ready',
          blockReason: null,
        },
        historyFence: {
          bindingId: 'binding-1',
          defaultBranch: 'main',
          lastConfirmedRemoteHeadSha: 'head-1',
          confirmedAt: timestamp,
        },
        projectionCheckpoint: {
          bindingId: 'binding-1',
          branch: 'main',
          projectedCommitSha: 'head-1',
          state: 'Ready',
          failureCode: null,
          failureMessage: null,
          lastAttemptAt: timestamp,
          projectedAt: timestamp,
        },
        webhookDeliveries: [],
        noteProjections: [
          {
            id: 'projection-1',
            bindingId: 'binding-1',
            knowledgeDocumentId: null,
            relativePath: 'notes/unmanaged.md',
            commitSha: 'head-1',
            blobSha: 'blob-note-1',
            contentHash: 'hash-note-1',
            frontmatter: {},
            markdownContent: '# Unmanaged',
            indexStatus: 'INDEXED',
            createdAt: timestamp,
            updatedAt: timestamp,
            deletedAt: null,
          },
        ],
        attachmentProjections: [],
        attachmentContentCaches: [
          {
            bindingId: 'binding-1',
            blobSha: 'blob-1',
            byteSize: 3,
            contentBytes: Uint8Array.from([1, 2, 3]),
            cachedAt: timestamp,
            expiresAt: timestamp,
          },
        ],
        writeRequests: [
          {
            id: 'write-1',
            bindingId: 'binding-1',
            knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440390',
            requestId: 'request-1',
            requestHash: 'request-hash-1',
            relativePath: 'notes/managed.md',
            status: 'Committed',
            commitSha: 'commit-1',
            errorCode: null,
            errorMessage: null,
            createdAt: timestamp,
            updatedAt: timestamp,
            completedAt: timestamp,
          },
        ],
      },
    ]);
    const indexFindMany = vi.fn().mockResolvedValue([]);
    const db = {
      knowledgeRemoteBinding: { findMany: bindingFindMany },
      aiKnowledgeIndexEntry: { findMany: indexFindMany },
    } as unknown as PrismaClient;

    const result = await new PrismaServerHeldDataDisclosureSource(db).readForIdentity('identity-1');

    expect(bindingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { identityId: 'identity-1' } }),
    );
    const bindingQuery = bindingFindMany.mock.calls[0]?.[0];
    expect(bindingQuery.select.installationId).toBe(true);
    expect(bindingQuery.select).not.toHaveProperty('accessToken');
    expect(bindingQuery.select).not.toHaveProperty('privateKey');
    expect(bindingQuery.select.knowledgeSpace.select.documentIdentities.select).toEqual({
      knowledgeSpaceId: true,
      knowledgeDocumentId: true,
      origin: true,
      originRequestId: true,
      createdAt: true,
      updatedAt: true,
    });
    expect(bindingQuery.select.knowledgeSpace.select.documentIdentities.select).not.toHaveProperty(
      'id',
    );
    expect(bindingQuery.select.noteProjections.select.knowledgeDocumentId).toBe(true);
    expect(bindingQuery.select.writeRequests.select.knowledgeDocumentId).toBe(true);
    expect(indexFindMany.mock.calls[0]?.[0].select).not.toHaveProperty('retrievalVector');
    expect(result.knowledgeSpaces).toEqual([
      {
        id: 'space-1',
        createdAt: '2026-07-20T00:00:00.000Z',
        updatedAt: '2026-07-20T00:00:00.000Z',
      },
    ]);
    expect(result.knowledgeDocumentIdentities).toEqual([
      {
        knowledgeSpaceId: 'space-1',
        knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440390',
        origin: 'MemoFlowCreated',
        originRequestId: 'request-1',
        createdAt: '2026-07-20T00:00:00.000Z',
        updatedAt: '2026-07-20T00:00:00.000Z',
      },
    ]);
    expect(result.knowledgeRemoteBindings[0]).toMatchObject({
      id: 'binding-1',
      installationId: 'installation-1',
      repositoryId: 'repository-1',
    });
    expect(result.remoteRepositoryObservations[0]).toMatchObject({
      bindingId: 'binding-1',
      eligibilityState: 'Ready',
    });
    expect(result.remoteHistoryFences[0]?.lastConfirmedRemoteHeadSha).toBe('head-1');
    expect(result.knowledgeProjectionCheckpoints[0]?.state).toBe('Ready');
    expect(result.knowledgeNoteProjections[0]?.knowledgeDocumentId).toBeNull();
    expect(result.knowledgeWriteRequests[0]?.knowledgeDocumentId).toBe(
      'kdoc_550e8400-e29b-41d4-a716-446655440390',
    );
    expect(result.knowledgeAttachmentContentCaches[0]?.contentBase64).toBe('AQID');
  });

  it('deduplicates document identities when one space is reached by multiple bindings', async () => {
    const timestamp = new Date('2026-07-20T00:00:00.000Z');
    const identity = {
      knowledgeSpaceId: 'space-1',
      knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440390',
      origin: 'ObservedMarker',
      originRequestId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const binding = {
      id: 'binding-1',
      knowledgeSpaceId: 'space-1',
      identityId: 'identity-1',
      provider: 'GitHub',
      installationId: 'installation-1',
      repositoryId: 'repository-1',
      repositoryFullNameSnapshot: 'owner/vault-1',
      connectedAt: timestamp,
      disconnectedAt: null,
      version: 1,
      knowledgeSpace: {
        id: 'space-1',
        createdAt: timestamp,
        updatedAt: timestamp,
        documentIdentities: [identity],
      },
      observation: null,
      historyFence: null,
      projectionCheckpoint: null,
      webhookDeliveries: [],
      noteProjections: [],
      attachmentProjections: [],
      attachmentContentCaches: [],
      writeRequests: [],
    };
    const bindingFindMany = vi.fn().mockResolvedValue([
      binding,
      {
        ...binding,
        id: 'binding-2',
        repositoryId: 'repository-2',
        repositoryFullNameSnapshot: 'owner/vault-2',
      },
    ]);
    const db = {
      knowledgeRemoteBinding: { findMany: bindingFindMany },
      aiKnowledgeIndexEntry: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;

    const result = await new PrismaServerHeldDataDisclosureSource(db).readForIdentity('identity-1');

    expect(result.knowledgeSpaces).toHaveLength(1);
    expect(result.knowledgeDocumentIdentities).toEqual([
      {
        knowledgeSpaceId: 'space-1',
        knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440390',
        origin: 'ObservedMarker',
        originRequestId: null,
        createdAt: '2026-07-20T00:00:00.000Z',
        updatedAt: '2026-07-20T00:00:00.000Z',
      },
    ]);
  });
});
