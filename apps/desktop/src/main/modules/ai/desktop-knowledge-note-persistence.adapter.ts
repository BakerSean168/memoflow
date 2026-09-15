import type { KnowledgeNotePersistedRef } from '@memoflow/contracts/ai';
import type { LocalVaultNoteDTO } from '@memoflow/contracts/repository';
import type {
  CreateKnowledgeNotePersistenceInput,
  CreateKnowledgeNotePersistenceResult,
  IKnowledgeNotePersistencePort,
} from '@memoflow/ai/ports';
import type { LocalVaultElectronPort } from '@memoflow/repository/electron';

/**
 * Desktop AI notes are committed to the selected local Vault only after the
 * Agent approval contract has supplied proposal metadata.
 */
export class DesktopKnowledgeNotePersistenceAdapter implements IKnowledgeNotePersistencePort {
  constructor(private readonly localVault: LocalVaultElectronPort) {}

  async createKnowledgeNote(
    input: CreateKnowledgeNotePersistenceInput,
  ): Promise<CreateKnowledgeNotePersistenceResult> {
    if (!input.proposalId || !input.proposalRevision || !input.requestId) {
      throw new Error('A confirmed knowledge-note proposal is required for local Vault writes');
    }

    const result = await this.localVault.writeConfirmedNote({
      relativePath: input.path,
      knowledgeDocumentId: input.knowledgeDocumentId,
      contentMarkdown: input.content,
      proposalId: input.proposalId,
      proposalRevision: input.proposalRevision,
      requestId: input.requestId,
    });

    return {
      note: toKnowledgeNoteRef(input.identityId, result.note),
    };
  }
}

/**
 * Desktop confirmed creates are managed documents. Their persisted AI reference
 * must use the reviewed KnowledgeDocumentId; a path-derived fallback would
 * silently reintroduce unstable identity after rename or move.
 */
function toKnowledgeNoteRef(
  identityId: string,
  note: LocalVaultNoteDTO,
): KnowledgeNotePersistedRef {
  if (!note.knowledgeDocumentId) {
    throw new Error('Confirmed Local Vault write did not return a stable KnowledgeDocumentId');
  }
  const timestamp = Number(note.updatedAt);
  return {
    id: note.knowledgeDocumentId,
    repositoryScopeId: `local-vault-${identityId}`,
    name: note.relativePath.split('/').pop() ?? note.title,
    path: note.relativePath,
    mimeType: 'text/markdown',
    size: note.size,
    content: note.contentMarkdown,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
