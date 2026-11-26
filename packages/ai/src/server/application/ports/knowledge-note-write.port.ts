import type { KnowledgeNotePersistedRef } from '@memoflow/ai-contracts';
import type { KnowledgeDocumentId } from '@memoflow/repository-contracts';
import type { ExecutionContext } from '@memoflow/transport-contracts';

/**
 * Authorized direct write into the host's selected knowledge source.
 *
 * Unlike the confirmed persistence port, this path is used by a Desktop agent
 * tool call that already holds the session grant; there is no per-note review
 * step. Owners still enforce their own filesystem and version fences.
 */
export interface WriteKnowledgeNoteInput {
  identityId: string;
  context: ExecutionContext;
  relativePath: string;
  contentMarkdown: string;
  /** Stable idempotency key derived from the tool request, not a random value. */
  requestId: string;
  /** sha256 the caller observed before editing an existing note. */
  expectedContentHash?: string;
  knowledgeDocumentId?: KnowledgeDocumentId;
}

export interface WriteKnowledgeNoteResult {
  note: KnowledgeNotePersistedRef;
  created: boolean;
}

export interface IKnowledgeNoteWritePort {
  writeKnowledgeNote(input: WriteKnowledgeNoteInput): Promise<WriteKnowledgeNoteResult>;
}
