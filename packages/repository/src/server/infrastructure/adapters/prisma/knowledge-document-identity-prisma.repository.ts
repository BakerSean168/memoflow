import type { PrismaClient } from '@memoflow/database';
import type { KnowledgeDocumentId, KnowledgeSpaceId } from '@memoflow/contracts/primitives';
import type {
  IKnowledgeDocumentIdentityRepository,
  KnowledgeDocumentIdentityRecord,
} from '../../../application/ports/knowledge-document-identity.repository';

export class KnowledgeDocumentIdentityPrismaRepository implements IKnowledgeDocumentIdentityRepository {
  constructor(private readonly db: PrismaClient) {}

  async find(
    knowledgeSpaceId: KnowledgeSpaceId,
    knowledgeDocumentId: KnowledgeDocumentId,
  ): Promise<KnowledgeDocumentIdentityRecord | null> {
    const row = await this.db.knowledgeDocumentIdentity.findUnique({
      where: {
        knowledgeSpaceId_knowledgeDocumentId: { knowledgeSpaceId, knowledgeDocumentId },
      },
    });
    return row
      ? {
          knowledgeSpaceId: row.knowledgeSpaceId as KnowledgeSpaceId,
          knowledgeDocumentId: row.knowledgeDocumentId as KnowledgeDocumentId,
          origin: row.origin as KnowledgeDocumentIdentityRecord['origin'],
          originRequestId: row.originRequestId,
          createdAt: row.createdAt.getTime(),
          updatedAt: row.updatedAt.getTime(),
        }
      : null;
  }

  async claimForCreate(
    knowledgeSpaceId: KnowledgeSpaceId,
    knowledgeDocumentId: KnowledgeDocumentId,
    requestId: string,
    now: number,
  ): Promise<boolean> {
    const existing = await this.find(knowledgeSpaceId, knowledgeDocumentId);
    if (existing) {
      return existing.origin === 'MemoFlowCreated' && existing.originRequestId === requestId;
    }
    try {
      await this.db.knowledgeDocumentIdentity.create({
        data: {
          knowledgeSpaceId,
          knowledgeDocumentId,
          origin: 'MemoFlowCreated',
          originRequestId: requestId,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      });
      return true;
    } catch {
      const raced = await this.find(knowledgeSpaceId, knowledgeDocumentId);
      return raced?.origin === 'MemoFlowCreated' && raced.originRequestId === requestId;
    }
  }

  async claimForAdoption(
    knowledgeSpaceId: KnowledgeSpaceId,
    knowledgeDocumentId: KnowledgeDocumentId,
    requestId: string,
    now: number,
  ): Promise<boolean> {
    const existing = await this.find(knowledgeSpaceId, knowledgeDocumentId);
    if (existing) return existing.origin === 'Adopted' && existing.originRequestId === requestId;
    try {
      await this.db.knowledgeDocumentIdentity.create({
        data: {
          knowledgeSpaceId,
          knowledgeDocumentId,
          origin: 'Adopted',
          originRequestId: requestId,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      });
      return true;
    } catch {
      const raced = await this.find(knowledgeSpaceId, knowledgeDocumentId);
      return raced?.origin === 'Adopted' && raced.originRequestId === requestId;
    }
  }

  async observeMarker(
    knowledgeSpaceId: KnowledgeSpaceId,
    knowledgeDocumentId: KnowledgeDocumentId,
    now: number,
  ): Promise<void> {
    const existing = await this.find(knowledgeSpaceId, knowledgeDocumentId);
    if (existing) return;
    try {
      await this.db.knowledgeDocumentIdentity.create({
        data: {
          knowledgeSpaceId,
          knowledgeDocumentId,
          origin: 'ObservedMarker',
          originRequestId: null,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        },
      });
    } catch {
      // Concurrent projection of the same marker converges on the unique
      // (KnowledgeSpaceId, KnowledgeDocumentId) product key.
      if (!(await this.find(knowledgeSpaceId, knowledgeDocumentId)))
        throw new Error('Knowledge document identity registration failed');
    }
  }
}
