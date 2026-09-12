import type { KnowledgeDocumentId } from '@memoflow/contracts/primitives';
import type { LocalVaultElectronPort } from '@memoflow/repository/electron';
import type { GoalWorkspaceKnowledgeProjection } from '@memoflow/goal';

/** Desktop owner adapter: stable kdoc -> current Local Vault display projection. */
export class LocalVaultKnowledgeWorkspaceResolver {
  constructor(private readonly vault: Pick<LocalVaultElectronPort, 'getBinding' | 'scanVault'>) {}

  async resolveForWorkspace(
    _identityId: string,
    documentId: KnowledgeDocumentId,
  ): Promise<GoalWorkspaceKnowledgeProjection | null> {
    const binding = await this.vault.getBinding();
    if (!binding) return null;
    if (binding.health.state !== 'Available') {
      throw new Error('Local Vault is currently unavailable.');
    }
    const scan = await this.vault.scanVault();
    const matches = scan.notes.filter((note) => note.knowledgeDocumentId === documentId);
    if (matches.length > 1) {
      throw new Error('Knowledge document identity is ambiguous in the active Local Vault.');
    }
    const note = matches[0];
    if (!note) return null;
    return {
      knowledgeSpaceId: binding.binding.knowledgeSpaceId,
      title: note.title,
      excerpt: note.excerpt,
      relativePath: note.relativePath,
      updatedAt: note.updatedAt,
    };
  }
}
