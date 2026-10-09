import type { KnowledgeDocumentId } from '@memoflow/contracts/primitives';
import type { LocalVaultElectronPort } from '@memoflow/repository/electron';
import type { GoalWorkspaceKnowledgeProjection } from '@memoflow/goal';

/** Desktop owner adapter: stable kdoc -> current Local Vault display projection. */
export class LocalVaultKnowledgeWorkspaceResolver {
  constructor(private readonly vault: Pick<LocalVaultElectronPort, 'findNoteById'>) {}

  async resolveForWorkspace(
    _identityId: string,
    documentId: KnowledgeDocumentId,
  ): Promise<GoalWorkspaceKnowledgeProjection | null> {
    const match = await this.vault.findNoteById(documentId);
    if (!match) return null;
    const { binding, note } = match;
    return {
      knowledgeSpaceId: binding.knowledgeSpaceId,
      title: note.title,
      excerpt: note.excerpt,
      relativePath: note.relativePath,
      updatedAt: note.updatedAt,
    };
  }
}
