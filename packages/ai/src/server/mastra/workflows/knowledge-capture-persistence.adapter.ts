import { error, ok, type Result } from '@memoflow/contracts/result';
import type { IKnowledgeNotePersistencePort } from '../../application/ports';
import type {
  CreateConfirmedKnowledgeNoteResult,
  KnowledgeCaptureMutationPort,
} from './knowledge-note-mutation.port';

/**
 * Canonical bridge from the durable knowledge.capture workflow to the existing
 * application-owned knowledge-note persistence port. Workflow identity/revision
 * become the confirmation/idempotency metadata expected by the host adapter.
 */
export class KnowledgeCapturePersistenceAdapter implements KnowledgeCaptureMutationPort {
  constructor(private readonly persistence: IKnowledgeNotePersistencePort) {}

  async createConfirmedKnowledgeNote(
    input: Parameters<KnowledgeCaptureMutationPort['createConfirmedKnowledgeNote']>[0],
  ): Promise<Result<CreateConfirmedKnowledgeNoteResult>> {
    try {
      const persisted = await this.persistence.createKnowledgeNote({
        identityId: input.context.identityId,
        context: input.context,
        knowledgeDocumentId: input.knowledgeDocumentId,
        fileName: input.fileName,
        path: input.path,
        content: input.content,
        proposalId: input.workflowRunId,
        proposalRevision: input.revision,
        requestId: input.requestId,
      });
      return ok({
        noteId: persisted.note.id,
        notePath: persisted.note.path,
        noteName: persisted.note.name,
      });
    } catch (cause) {
      return error(
        'INTERNAL_ERROR',
        cause instanceof Error ? cause.message : 'Knowledge note persistence failed',
      );
    }
  }
}
