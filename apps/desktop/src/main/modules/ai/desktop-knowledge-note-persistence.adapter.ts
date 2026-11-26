import type { KnowledgeNotePersistedRef } from '@memoflow/ai-contracts';
import type { LocalVaultNoteDTO } from '@memoflow/repository-contracts';
import type {
  CreateKnowledgeNotePersistenceInput,
  CreateKnowledgeNotePersistenceResult,
  IKnowledgeNotePersistencePort,
  IKnowledgeNoteWritePort,
  WriteKnowledgeNoteInput,
  WriteKnowledgeNoteResult,
} from '@memoflow/ai/ports';
import type { LocalVaultElectronPort } from '@memoflow/repository/electron';

/**
 * Desktop knowledge writes hit the selected local Vault directly.
 *
 * Confirmed persistence (`proposalId`/`revision`) is no longer a user review
 * gate; when the workflow supplies those fields they are treated as an
 * idempotency identity. Direct agent writes provide their own deterministic
 * `requestId`. Both paths share the runtime's atomic create/update boundary,
 * which enforces path containment, symlink refusal and expected-hash fences.
 */
export class DesktopKnowledgeNotePersistenceAdapter
  implements IKnowledgeNotePersistencePort, IKnowledgeNoteWritePort
{
  constructor(private readonly localVault: LocalVaultElectronPort) {}

  async createKnowledgeNote(
    input: CreateKnowledgeNotePersistenceInput,
  ): Promise<CreateKnowledgeNotePersistenceResult> {
    if (input.source && input.source.kind !== 'local_vault') {
      throw new Error('Desktop knowledge persistence requires a local Vault source');
    }

    const result = await this.localVault.writeNote({
      relativePath: input.path,
      knowledgeDocumentId: input.knowledgeDocumentId,
      contentMarkdown: input.content,
      requestId:
        input.requestId ??
        `${input.context.requestId}:${input.knowledgeDocumentId}:${input.proposalRevision ?? 1}`,
    });

    return {
      note: toKnowledgeNoteRef(input.identityId, result.note),
    };
  }

  async writeKnowledgeNote(input: WriteKnowledgeNoteInput): Promise<WriteKnowledgeNoteResult> {
    const result = await this.localVault.writeNote({
      relativePath: input.relativePath,
      ...(input.knowledgeDocumentId ? { knowledgeDocumentId: input.knowledgeDocumentId } : {}),
      contentMarkdown: input.contentMarkdown,
      requestId: input.requestId,
      ...(input.expectedContentHash ? { expectedContentHash: input.expectedContentHash } : {}),
    });
    return {
      note: toKnowledgeNoteRef(input.identityId, result.note),
      created: result.created,
    };
  }
}

/**
 * Desktop writes are managed documents. Their persisted AI reference must use
 * the stable KnowledgeDocumentId; a path-derived fallback would silently
 * reintroduce unstable identity after rename or move.
 */
function toKnowledgeNoteRef(
  identityId: string,
  note: LocalVaultNoteDTO,
): KnowledgeNotePersistedRef {
  if (!note.knowledgeDocumentId) {
    throw new Error('Local Vault write did not return a stable KnowledgeDocumentId');
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
