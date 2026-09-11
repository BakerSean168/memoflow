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
        knowledgeSpace: { id: 'space-1', createdAt: timestamp, updatedAt: timestamp },
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
        noteProjections: [],
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
        writeRequests: [],
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
    expect(indexFindMany.mock.calls[0]?.[0].select).not.toHaveProperty('retrievalVector');
    expect(result.knowledgeSpaces).toEqual([
      {
        id: 'space-1',
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
    expect(result.knowledgeAttachmentContentCaches[0]?.contentBase64).toBe('AQID');
  });
});
