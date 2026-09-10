import { createHash } from 'node:crypto';
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
 * Residual 1149 keep-boundary: Desktop local-Vault persisted-ref mapping.
 * id = local-vault-<sha256(path)[:24]>; scope = local-vault-<identityId>;
 * timestamps from note.updatedAt; size from vault DTO.
 * Soft residual 1149: API GitHub connection mapping stays separate (no force-merge).
 */
function toKnowledgeNoteRef(
  identityId: string,
  note: LocalVaultNoteDTO,
): KnowledgeNotePersistedRef {
  const id = `local-vault-${createHash('sha256').update(note.relativePath).digest('hex').slice(0, 24)}`;
  const timestamp = Number(note.updatedAt);
  return {
    id,
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
