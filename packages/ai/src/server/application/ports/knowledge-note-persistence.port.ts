import type { KnowledgeCaptureSource, KnowledgeNotePersistedRef } from '@memoflow/ai-contracts';
import type { KnowledgeDocumentId } from '@memoflow/repository-contracts';
import type { ExecutionContext } from '@memoflow/transport-contracts';

export interface CreateKnowledgeNotePersistenceInput {
  identityId: string;
  /**
   * Canonical entry `ExecutionContext` for the outbound persistence call, so
   * the repository write shares the same requestId/traceId.
   * 供持久化调用使用的 canonical entry `ExecutionContext`，让 repository 写入
   * 共享同一个 requestId/traceId。
   */
  context: ExecutionContext;
  /** Owner-selected source for standalone knowledge.capture. Other approved flows may omit it. */
  source?: KnowledgeCaptureSource;
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
