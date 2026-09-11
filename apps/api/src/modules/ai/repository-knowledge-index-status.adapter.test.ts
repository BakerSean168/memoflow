import { describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/contracts/result';
import type { RepositoryApplicationPort } from '@memoflow/repository';
import { RepositoryKnowledgeIndexStatusAdapter } from './repository-knowledge-index-status.adapter';

describe('RepositoryKnowledgeIndexStatusAdapter', () => {
  it('forwards identity and content-hash preconditions to Repository', async () => {
    const updateKnowledgeNoteProjectionIndexStatus = vi.fn(async () => ok({ updated: true }));
    const adapter = new RepositoryKnowledgeIndexStatusAdapter({
      updateKnowledgeNoteProjectionIndexStatus,
    } as unknown as RepositoryApplicationPort);

    await adapter.updateIndexStatus('identity-1', {
      repositoryId: 'binding-1',
      resourceId: 'projection-1',
      contentHash: 'content-hash-1',
      status: 'indexed',
    });

    expect(updateKnowledgeNoteProjectionIndexStatus).toHaveBeenCalledWith(
      { identityId: 'identity-1' },
      {
        connectionId: 'binding-1',
        resourceId: 'projection-1',
        contentHash: 'content-hash-1',
        status: 'indexed',
      },
    );
  });

  it('surfaces Repository failures to the best-effort AI reporter', async () => {
    const adapter = new RepositoryKnowledgeIndexStatusAdapter({
      updateKnowledgeNoteProjectionIndexStatus: vi.fn(async () =>
        fail({ code: 'SERVICE_UNAVAILABLE', message: 'Projection store unavailable' }),
      ),
    } as unknown as RepositoryApplicationPort);

    await expect(
      adapter.updateIndexStatus('identity-1', {
        repositoryId: 'binding-1',
        resourceId: 'projection-1',
        contentHash: 'content-hash-1',
        status: 'failed',
      }),
    ).rejects.toMatchObject({
      message: 'Repository knowledge index status update failed',
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});
