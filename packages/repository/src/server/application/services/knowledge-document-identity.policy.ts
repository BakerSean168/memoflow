import type { KnowledgeDocumentId } from '@memoflow/contracts/primitives';
import { KnowledgeDocumentIdSchema } from '@memoflow/contracts/repository';

export type KnowledgeDocumentIdentityFailureCode =
  | 'KNOWLEDGE_DOCUMENT_ID_INVALID'
  | 'KNOWLEDGE_DOCUMENT_ID_COLLISION'
  | 'KNOWLEDGE_DOCUMENT_ID_REMOVED'
  | 'KNOWLEDGE_DOCUMENT_ID_REPLACED';

export class KnowledgeDocumentIdentityConflictError extends Error {
  constructor(
    readonly code: KnowledgeDocumentIdentityFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'KnowledgeDocumentIdentityConflictError';
  }
}

/**
 * Reads ADR-090's document-carried identity marker without inventing identity
 * for unmanaged Markdown. A present but malformed marker is an explicit
 * identity failure rather than silently becoming an unmanaged note.
 */
export function readKnowledgeDocumentId(
  frontmatter: Record<string, unknown>,
): KnowledgeDocumentId | null {
  const marker = frontmatter['memoflow_id'];
  if (marker === undefined || marker === null) return null;
  const parsed = KnowledgeDocumentIdSchema.safeParse(marker);
  if (!parsed.success) {
    throw new KnowledgeDocumentIdentityConflictError(
      'KNOWLEDGE_DOCUMENT_ID_INVALID',
      'Knowledge note contains an invalid memoflow_id marker',
    );
  }
  return parsed.data;
}
