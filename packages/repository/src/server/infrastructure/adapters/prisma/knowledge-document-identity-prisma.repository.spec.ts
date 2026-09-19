import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@memoflow/database';
import { KnowledgeDocumentIdentityPrismaRepository } from './knowledge-document-identity-prisma.repository';

const SPACE_ID = 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440301' as never;
const DOCUMENT_ID = 'kdoc_550e8400-e29b-41d4-a716-446655440302' as never;
const REQUEST_ID = 'request-1';
const NOW = 1_750_000_000_000;

function racedRow(origin: 'MemoFlowCreated' | 'Adopted') {
  return {
    knowledgeSpaceId: SPACE_ID,
    knowledgeDocumentId: DOCUMENT_ID,
    origin,
    originRequestId: REQUEST_ID,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  };
}

function createRacingRepository(origin: 'MemoFlowCreated' | 'Adopted') {
  const findUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(racedRow(origin));
  const create = vi.fn().mockRejectedValue(new Error('unique constraint race'));
  const repository = new KnowledgeDocumentIdentityPrismaRepository({
    knowledgeDocumentIdentity: { findUnique, create },
  } as unknown as PrismaClient);
  return { repository, findUnique, create };
}

describe('KnowledgeDocumentIdentityPrismaRepository', () => {
  it('fails closed when a create race is won by an adopted row with the same request id', async () => {
    const { repository } = createRacingRepository('Adopted');

    await expect(repository.claimForCreate(SPACE_ID, DOCUMENT_ID, REQUEST_ID, NOW)).resolves.toBe(
      false,
    );
  });

  it('accepts a create race when the winning row has the same origin and request id', async () => {
    const { repository } = createRacingRepository('MemoFlowCreated');

    await expect(repository.claimForCreate(SPACE_ID, DOCUMENT_ID, REQUEST_ID, NOW)).resolves.toBe(
      true,
    );
  });

  it('keeps adoption race ownership symmetric', async () => {
    const adopted = createRacingRepository('Adopted');
    await expect(
      adopted.repository.claimForAdoption(SPACE_ID, DOCUMENT_ID, REQUEST_ID, NOW),
    ).resolves.toBe(true);

    const created = createRacingRepository('MemoFlowCreated');
    await expect(
      created.repository.claimForAdoption(SPACE_ID, DOCUMENT_ID, REQUEST_ID, NOW),
    ).resolves.toBe(false);
  });
});
