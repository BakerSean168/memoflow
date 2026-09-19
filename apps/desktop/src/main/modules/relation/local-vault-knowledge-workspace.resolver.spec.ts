import { describe, expect, it, vi } from 'vitest';
import { KnowledgeDocumentIdSchema } from '@memoflow/contracts/repository';
import { LocalVaultKnowledgeWorkspaceResolver } from './local-vault-knowledge-workspace.resolver';

const documentId = KnowledgeDocumentIdSchema.parse('kdoc_550e8400-e29b-41d4-a716-446655440090');
const snapshot = {
  binding: {
    knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440091',
  },
  health: { state: 'Available' },
} as never;

describe('LocalVaultKnowledgeWorkspaceResolver', () => {
  it('resolves the current renamed/moved display projection by stable kdoc', async () => {
    const resolver = new LocalVaultKnowledgeWorkspaceResolver({
      getBinding: vi.fn().mockResolvedValue(snapshot),
      scanVault: vi.fn().mockResolvedValue({
        notes: [
          {
            knowledgeDocumentId: documentId,
            title: 'Renamed note',
            excerpt: 'Still the same document',
            relativePath: 'moved/renamed.md',
            updatedAt: 12,
          },
        ],
      }),
    } as never);

    await expect(resolver.resolveForWorkspace('identity-1', documentId)).resolves.toMatchObject({
      title: 'Renamed note',
      relativePath: 'moved/renamed.md',
    });
  });

  it('returns missing for no current note and fails when the bound Vault itself is unavailable', async () => {
    const missing = new LocalVaultKnowledgeWorkspaceResolver({
      getBinding: vi.fn().mockResolvedValue(snapshot),
      scanVault: vi.fn().mockResolvedValue({ notes: [] }),
    } as never);
    await expect(missing.resolveForWorkspace('identity-1', documentId)).resolves.toBeNull();

    const unavailable = new LocalVaultKnowledgeWorkspaceResolver({
      getBinding: vi.fn().mockResolvedValue({ ...snapshot, health: { state: 'Missing' } }),
      scanVault: vi.fn(),
    } as never);
    await expect(unavailable.resolveForWorkspace('identity-1', documentId)).rejects.toThrow(
      'unavailable',
    );
  });
});
