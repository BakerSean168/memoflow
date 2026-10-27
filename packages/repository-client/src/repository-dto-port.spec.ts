import { describe, expect, it } from 'vitest';
import { ok, fail } from '@memoflow/transport-contracts';
import { createRepositoryClientService } from './application-client';
import type { IRepositoryApiClient } from './application-client/ports/repository-api-client.port';

describe('Repository client DTO port', () => {
  it('returns transport DTOs without wrapping in pseudo-aggregates', async () => {
    const mockSyncResult = {
      connection: { id: 'conn-1' } as never,
      outcome: 'UpToDate' as const,
      headSha: 'a'.repeat(40),
      localCommitCreated: false,
      remoteChangesApplied: false,
      pushed: false,
    };
    const service = createRepositoryClientService({
      syncKnowledgeRepository: async () => ok(mockSyncResult),
    } as IRepositoryApiClient);

    const result = await service.syncKnowledgeRepository({ connectionId: 'conn-1' });

    expect(result).toEqual(ok(mockSyncResult));
    expect(result.ok && result.data).toBe(mockSyncResult);
  });

  it('preserves transport failure without constructing client entities', async () => {
    const failure = fail({ code: 'NOT_FOUND', message: 'Connection not found' });
    const service = createRepositoryClientService({
      syncKnowledgeRepository: async () => failure,
    } as IRepositoryApiClient);

    expect(await service.syncKnowledgeRepository({ connectionId: 'missing' })).toBe(failure);
  });
});
