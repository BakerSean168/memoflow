import type { KnowledgeDocumentId } from '@memoflow/contracts/primitives';
import {
  KnowledgeDocumentRefSchema,
  type KnowledgeDocumentRef,
} from '@memoflow/contracts/repository';
import { LocalVaultRuntimeError, type LocalVaultElectronPort } from '@memoflow/repository/electron';

/** Desktop adapter that resolves durable Knowledge identity from the active Local Vault. */
export class LocalVaultKnowledgeDocumentRefResolver {
  constructor(private readonly vault: Pick<LocalVaultElectronPort, 'findNoteById'>) {}

  async resolve(
    _identityId: string,
    documentId: KnowledgeDocumentId,
  ): Promise<KnowledgeDocumentRef | null> {
    const match = await this.vault.findNoteById(documentId).catch((error: unknown) => {
      if (error instanceof LocalVaultRuntimeError && error.code === 'NOT_FOUND') return null;
      throw error;
    });
    if (!match) return null;
    return KnowledgeDocumentRefSchema.parse({
      knowledgeSpaceId: match.binding.knowledgeSpaceId,
      documentId,
    });
  }
}
