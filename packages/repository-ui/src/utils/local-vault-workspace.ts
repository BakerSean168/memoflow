import type { LocalVaultGitChange, LocalVaultNoteSummaryDTO } from '@memoflow/repository-contracts';
import type { KnowledgeBusinessLink } from '../repository-ui-host';

export interface VaultWorkspaceRow {
  relativePath: string;
  title: string;
  links: KnowledgeBusinessLink[];
  change?: LocalVaultGitChange;
}

/** Union by current path; stable document IDs keep business links intact across renames. */
export function buildVaultWorkspaceRows(
  notes: LocalVaultNoteSummaryDTO[],
  changes: LocalVaultGitChange[],
  links: KnowledgeBusinessLink[],
): VaultWorkspaceRow[] {
  const byDocument = new Map<string, KnowledgeBusinessLink[]>();
  for (const link of links)
    byDocument.set(link.documentId, [...(byDocument.get(link.documentId) ?? []), link]);
  const byPath = new Map(changes.map((change) => [change.relativePath, change]));
  const rows = new Map<string, VaultWorkspaceRow>();
  for (const note of notes) {
    const noteLinks = note.knowledgeDocumentId
      ? (byDocument.get(note.knowledgeDocumentId) ?? [])
      : [];
    const change = byPath.get(note.relativePath);
    if (noteLinks.length || change)
      rows.set(note.relativePath, {
        relativePath: note.relativePath,
        title: note.title,
        links: noteLinks,
        change,
      });
  }
  for (const change of changes) {
    if (!rows.has(change.relativePath))
      rows.set(change.relativePath, {
        relativePath: change.relativePath,
        title: change.relativePath.split('/').pop()!.replace(/\.md$/i, ''),
        links: [],
        change,
      });
  }
  return [...rows.values()].sort(
    (a, b) =>
      Number(Boolean(b.change)) - Number(Boolean(a.change)) ||
      a.relativePath.localeCompare(b.relativePath),
  );
}
