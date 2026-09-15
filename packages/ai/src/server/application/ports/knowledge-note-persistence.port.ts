import type { KnowledgeNotePersistedRef } from '@memoflow/contracts/ai';
import type { KnowledgeDocumentId } from '@memoflow/contracts/primitives';
import type { ExecutionContext } from '@memoflow/contracts/shared';

export interface CreateKnowledgeNotePersistenceInput {
  identityId: string;
  /**
   * Canonical entry `ExecutionContext` for the outbound persistence call, so
   * the repository write shares the same requestId/traceId.
   * 供持久化调用使用的 canonical entry `ExecutionContext`，让 repository 写入
   * 共享同一个 requestId/traceId。
   */
  context: ExecutionContext;
  /** Explicit GitHub knowledge-repository connection for multi-repository users. */
  connectionId?: string;
  knowledgeDocumentId: KnowledgeDocumentId;
  fileName: string;
  path: string;
  content: string;
  proposalId?: string;
  proposalRevision?: number;
  requestId?: string;
}

export interface CreateKnowledgeNotePersistenceResult {
  note: KnowledgeNotePersistedRef;
}

export interface IKnowledgeNotePersistencePort {
  createKnowledgeNote(
    input: CreateKnowledgeNotePersistenceInput,
  ): Promise<CreateKnowledgeNotePersistenceResult>;
}
