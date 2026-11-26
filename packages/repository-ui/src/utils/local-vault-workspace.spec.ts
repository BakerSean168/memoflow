import { describe, expect, it } from 'vitest';
import type { LocalVaultNoteSummaryDTO } from '@memoflow/repository-contracts';
import { buildVaultWorkspaceRows } from './local-vault-workspace';

describe('Knowledge workspace rows', () => {
  it('joins business links by stable document ID after a rename and merges overlapping changes', () => {
    const notes = [
      { relativePath: 'new-name.md', title: 'Renamed note', knowledgeDocumentId: 'doc-1' },
      { relativePath: 'unrelated.md', title: 'Unrelated', knowledgeDocumentId: null },
    ] as LocalVaultNoteSummaryDTO[];
    const rows = buildVaultWorkspaceRows(
      notes,
      [
        { relativePath: 'new-name.md', previousPath: 'old-name.md', status: 'renamed' },
        { relativePath: 'deleted.md', status: 'deleted' },
      ],
      [{ documentId: 'doc-1', subjectType: 'goal', subjectId: 'goal-1', title: 'My goal' }],
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.relativePath === 'new-name.md')).toMatchObject({
      title: 'Renamed note',
      links: [{ title: 'My goal' }],
      change: { status: 'renamed' },
    });
    expect(rows.find((row) => row.relativePath === 'deleted.md')).toMatchObject({
      title: 'deleted',
      change: { status: 'deleted' },
    });
  });
});
