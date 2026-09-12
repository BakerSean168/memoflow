import type { KnowledgeDocumentId } from '@memoflow/contracts/primitives';
import {
  KnowledgeDocumentRefSchema,
  type KnowledgeDocumentRef,
} from '@memoflow/contracts/repository';
import type { LocalVaultElectronPort } from '@memoflow/repository/electron';

/** Desktop adapter that resolves durable Knowledge identity from the active Local Vault. */
export class LocalVaultKnowledgeDocumentRefResolver {
  constructor(private readonly vault: Pick<LocalVaultElectronPort, 'getBinding' | 'scanVault'>) {}

  async resolve(
    _identityId: string,
    documentId: KnowledgeDocumentId,
  ): Promise<KnowledgeDocumentRef | null> {
    const binding = await this.vault.getBinding();
    if (!binding || binding.health.state !== 'Available') return null;
    const scan = await this.vault.scanVault();
    const matches = scan.notes.filter((note) => note.knowledgeDocumentId === documentId);
    if (matches.length > 1) {
      throw new Error('Knowledge document identity is ambiguous in the active Local Vault.');
    }
    if (matches.length === 0) return null;
    return KnowledgeDocumentRefSchema.parse({
      knowledgeSpaceId: binding.binding.knowledgeSpaceId,
      documentId,
    });
  }
}
