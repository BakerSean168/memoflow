import { createHash } from 'node:crypto';
import type { IKnowledgeSourcePort, KnowledgeSourceNote } from '@memoflow/ai/ports';
import {
  KnowledgeDocumentIdSchema,
  type LocalVaultNoteDTO,
  type LocalVaultNoteSummaryDTO,
} from '@memoflow/contracts/repository';
import { LocalVaultRuntimeError, type LocalVaultElectronPort } from '@memoflow/repository/electron';

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
    return this.hydrate(
      identityId,
      snapshot.binding.id,
      snapshot.binding.knowledgeSpaceId,
      summaries.filter((summary) => summary.knowledgeDocumentId !== null).slice(0, limit),
    );
  }

  async listIndexableNotes(identityId: string, limit: number): Promise<KnowledgeSourceNote[]> {
    const snapshot = await this.localVault.getBinding();
    if (!snapshot || snapshot.health.state !== 'Available') return [];
    const scanned = await this.localVault.scanVault();
    return this.hydrate(
      identityId,
      snapshot.binding.id,
      snapshot.binding.knowledgeSpaceId,
      scanned.notes.filter((note) => note.knowledgeDocumentId !== null).slice(0, limit),
    );
  }

  async getNoteById(
    identityId: string,
    knowledgeDocumentId: string,
    knowledgeSpaceId?: string,
  ): Promise<KnowledgeSourceNote | null> {
    const snapshot = await this.localVault.getBinding();
    if (!snapshot || snapshot.health.state !== 'Available') return null;
    if (knowledgeSpaceId && snapshot.binding.knowledgeSpaceId !== knowledgeSpaceId) return null;
    const id = KnowledgeDocumentIdSchema.safeParse(knowledgeDocumentId);
    if (!id.success) return null;
    const match = await this.localVault.findNoteById(id.data);
    if (!match) return null;
    if (match.binding.id !== snapshot.binding.id) {
      throw new LocalVaultRuntimeError(
        'CONFLICT',
        'The selected Vault changed during knowledge lookup',
      );
    }
    return this.toKnowledgeNote(
      identityId,
      match.binding.id,
      match.binding.knowledgeSpaceId,
      match.note,
    );
  }

  private async hydrate(
    identityId: string,
    repositoryId: string,
    knowledgeSpaceId: string,
    summaries: LocalVaultNoteSummaryDTO[],
  ): Promise<KnowledgeSourceNote[]> {
    const notes = await Promise.all(
      summaries.map(async (summary) => {
        const note = await this.localVault.readNote({ relativePath: summary.relativePath });
        if (note.knowledgeDocumentId !== summary.knowledgeDocumentId) {
          throw new LocalVaultRuntimeError(
            'CONFLICT',
            'Knowledge document identity changed during hydration',
          );
        }
        return this.toKnowledgeNote(identityId, repositoryId, knowledgeSpaceId, note);
      }),
    );
    const current = await this.localVault.getBinding();
    if (current?.binding.id !== repositoryId) {
      throw new LocalVaultRuntimeError(
        'CONFLICT',
        'The selected Vault changed during knowledge hydration',
      );
    }
    return notes;
  }

  private toKnowledgeNote(
    identityId: string,
    repositoryId: string,
    knowledgeSpaceId: string,
    note: LocalVaultNoteDTO,
  ): KnowledgeSourceNote {
    const contentDigest = createHash('sha256').update(note.contentMarkdown).digest('hex');
    return {
      identityId,
      repositoryId,
      knowledgeSpaceId,
      knowledgeDocumentId: note.knowledgeDocumentId,
      sourcePath: note.relativePath,
      sourceContentHash: contentDigest,
      sourceVersion: String(note.updatedAt),
      title: note.title,
      mimeType: 'text/markdown',
      content: note.contentMarkdown,
      metadata: {
        ...note.frontmatter,
        tags: note.tags,
        outgoingLinks: note.outgoingLinks,
        contentDigest,
        knowledgeDocumentId: note.knowledgeDocumentId,
        knowledgeSpaceId,
      },
    };
  }
}
