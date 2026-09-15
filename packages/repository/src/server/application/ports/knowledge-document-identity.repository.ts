import type { KnowledgeDocumentId, KnowledgeSpaceId } from '@memoflow/contracts/primitives';
import type { KnowledgeDocumentIdentityOrigin } from '@memoflow/contracts/repository';

export interface KnowledgeDocumentIdentityRecord {
  knowledgeSpaceId: KnowledgeSpaceId;
  knowledgeDocumentId: KnowledgeDocumentId;
  origin: KnowledgeDocumentIdentityOrigin;
  originRequestId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface IKnowledgeDocumentIdentityRepository {
  find(
    knowledgeSpaceId: KnowledgeSpaceId,
    knowledgeDocumentId: KnowledgeDocumentId,
  ): Promise<KnowledgeDocumentIdentityRecord | null>;

  /**
   * Reserves a brand-new MemoFlow-created document identity for one immutable
   * write request. Repeating the same request is idempotent; a different owner
   * of the same product identity fails closed.
   */
  claimForCreate(
    knowledgeSpaceId: KnowledgeSpaceId,
    knowledgeDocumentId: KnowledgeDocumentId,
    requestId: string,
    now: number,
  ): Promise<boolean>;

  /** Reserves an unmanaged document identity for one explicit adoption request. */
  claimForAdoption(
    knowledgeSpaceId: KnowledgeSpaceId,
    knowledgeDocumentId: KnowledgeDocumentId,
    requestId: string,
    now: number,
  ): Promise<boolean>;

  /** Registers a valid marker discovered in Git without mutating that file. */
  observeMarker(
    knowledgeSpaceId: KnowledgeSpaceId,
    knowledgeDocumentId: KnowledgeDocumentId,
    now: number,
  ): Promise<void>;
}
