import { createHash } from 'node:crypto';
import type { IKnowledgeSourcePort, KnowledgeSourceNote } from '@memoflow/ai/ports';
import type { LocalVaultNoteDTO, LocalVaultNoteSummaryDTO } from '@memoflow/contracts/repository';
import type { LocalVaultElectronPort } from '@memoflow/repository/electron';

/**
 * Ephemeral AI identity for unmanaged notes only. It must never escape into
 * durable relations; adoption replaces it with the Markdown-carried kdoc id.
 */
function temporaryUnmanagedResourceIdForPath(relativePath: string): string {
  return `local-vault-${createHash('sha256').update(relativePath).digest('hex').slice(0, 24)}`;
}

/** Local Vault is the only Desktop knowledge source; disconnected Vaults return no cloud fallback. */
export class DesktopKnowledgeSourceAdapter implements IKnowledgeSourcePort {
  constructor(private readonly localVault: LocalVaultElectronPort) {}

  async listRelevantNotes(
    identityId: string,
    query: string,
    limit: number,
  ): Promise<KnowledgeSourceNote[]> {
    const snapshot = await this.localVault.getBinding();
    if (!snapshot || snapshot.health.state !== 'Available') return [];

    const summaries = query.trim()
      ? (await this.localVault.searchVault({ query, limit })).results.map((result) => result.note)
      : (await this.localVault.scanVault()).notes.slice(0, limit);
    return this.hydrate(identityId, snapshot.binding.id, summaries.slice(0, limit));
  }

  async listIndexableNotes(identityId: string, limit: number): Promise<KnowledgeSourceNote[]> {
    const snapshot = await this.localVault.getBinding();
    if (!snapshot || snapshot.health.state !== 'Available') return [];
    const scanned = await this.localVault.scanVault();
    return this.hydrate(identityId, snapshot.binding.id, scanned.notes.slice(0, limit));
  }

  async getNoteById(identityId: string, resourceId: string): Promise<KnowledgeSourceNote | null> {
    const snapshot = await this.localVault.getBinding();
    if (!snapshot || snapshot.health.state !== 'Available') return null;
    const scanned = await this.localVault.scanVault();
    const summary = scanned.notes.find(
      (note) =>
        note.knowledgeDocumentId === resourceId ||
        temporaryUnmanagedResourceIdForPath(note.relativePath) === resourceId,
    );
    if (!summary) return null;
    const note = await this.localVault.readNote({
      relativePath: summary.relativePath,
    });
    return this.toKnowledgeNote(identityId, snapshot.binding.id, note);
  }

  private async hydrate(
    identityId: string,
    repositoryId: string,
    summaries: LocalVaultNoteSummaryDTO[],
  ): Promise<KnowledgeSourceNote[]> {
    return Promise.all(
      summaries.map(async (summary) =>
        this.toKnowledgeNote(
          identityId,
          repositoryId,
          await this.localVault.readNote({
            relativePath: summary.relativePath,
          }),
        ),
      ),
    );
  }

  private toKnowledgeNote(
    identityId: string,
    repositoryId: string,
    note: LocalVaultNoteDTO,
  ): KnowledgeSourceNote {
    return {
      identityId,
      repositoryId,
      resourceId:
        note.knowledgeDocumentId ?? temporaryUnmanagedResourceIdForPath(note.relativePath),
      resourcePath: note.relativePath,
      title: note.title,
      mimeType: 'text/markdown',
      content: note.contentMarkdown,
      metadata: {
        ...note.frontmatter,
        tags: note.tags,
        outgoingLinks: note.outgoingLinks,
        contentDigest: createHash('sha256').update(note.contentMarkdown).digest('hex'),
        knowledgeDocumentId: note.knowledgeDocumentId,
      },
    };
  }
}
