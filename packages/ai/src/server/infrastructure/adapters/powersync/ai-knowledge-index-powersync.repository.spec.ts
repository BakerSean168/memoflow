import { describe, expect, it, vi } from 'vitest';
import type {
  IElectronDatabase,
  IElectronTransaction,
  SqlValue,
} from '@memoflow/contracts/electron';
import type { KnowledgeIndexedNote } from '../../../application/ports';
import { AIKnowledgeIndexPowerSyncRepository } from './ai-knowledge-index-powersync.repository';

class FakeDatabase implements IElectronDatabase {
  readonly execute = vi.fn(async (_sql: string, _params?: SqlValue[]) => undefined);
  readonly getOptional = vi.fn(async <T>(_sql: string, _params?: SqlValue[]) => null as T | null);
  readonly getAll = vi.fn(async <T>(_sql: string, _params?: SqlValue[]) => [] as T[]);
  async transaction<T>(fn: (tx: IElectronTransaction) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

const DOCUMENT_ID = 'kdoc_550e8400-e29b-41d4-a716-446655440601';

function indexedNote(path = 'Notes/Stable.md'): KnowledgeIndexedNote {
  return {
    identityId: 'identity-1',
    repositoryId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440602',
    resourceId: DOCUMENT_ID,
    resourcePath: path,
    title: 'Stable note',
    mimeType: 'text/markdown',
    contentHash: 'a'.repeat(64),
    summary: 'Stable knowledge identity',
    keywords: ['stable', 'knowledge'],
    embedding: [0.25, -0.5],
    chunks: [
      {
        chunkIndex: 0,
        content: 'Stable knowledge identity',
        contentHash: 'b'.repeat(64),
        startOffset: 0,
        endOffset: 25,
        headingPath: ['Stable note'],
        keywords: ['stable'],
        embedding: [0.5],
      },
    ],
    metadata: { knowledgeDocumentId: DOCUMENT_ID },
  };
}

describe('AIKnowledgeIndexPowerSyncRepository', () => {
  it('persists the Desktop index only in the dedicated local-only table', async () => {
    const db = new FakeDatabase();
    const repository = new AIKnowledgeIndexPowerSyncRepository(db);

    await repository.upsert(indexedNote());

    expect(db.execute).toHaveBeenCalledOnce();
    const [sql, params] = db.execute.mock.calls[0]!;
    expect(sql).toContain('INSERT OR REPLACE INTO ai_knowledge_index_entries_local');
    expect(sql).not.toContain('resources');
    expect(params).toContain(DOCUMENT_ID);
    expect(params).toContain('Notes/Stable.md');
  });

  it('keeps the same local row identity when a stable document is renamed', async () => {
    const db = new FakeDatabase();
    const repository = new AIKnowledgeIndexPowerSyncRepository(db);

    await repository.upsert(indexedNote('Notes/Before.md'));
    await repository.upsert(indexedNote('Archive/After.md'));

    const firstParams = db.execute.mock.calls[0]![1]!;
    const secondParams = db.execute.mock.calls[1]![1]!;
    expect(firstParams[0]).toBe(secondParams[0]);
    expect(firstParams).toContain('Notes/Before.md');
    expect(secondParams).toContain('Archive/After.md');
  });

  it('reads stable resource ids directly from the local index table', async () => {
    const db = new FakeDatabase();
    db.getAll.mockResolvedValueOnce([
      {
        id: 'local-index-row',
        identity_id: 'identity-1',
        repository_id: 'space-1',
        resource_id: DOCUMENT_ID,
        resource_path: 'Notes/Stable.md',
        title: 'Stable note',
        mime_type: 'text/markdown',
        content_hash: 'a'.repeat(64),
        status: 'indexed',
        summary: 'Stable knowledge identity',
        keywords_json: JSON.stringify(['stable', 'knowledge']),
        embedding_json: JSON.stringify([0.25]),
        chunks_json: JSON.stringify([]),
        metadata_json: JSON.stringify({ knowledgeDocumentId: DOCUMENT_ID }),
        error: null,
        indexed_at: 10,
        last_requested_at: 11,
      },
    ]);
    const repository = new AIKnowledgeIndexPowerSyncRepository(db);

    await expect(repository.findByNoteIds('identity-1', [DOCUMENT_ID])).resolves.toEqual([
      expect.objectContaining({
        resourceId: DOCUMENT_ID,
        resourcePath: 'Notes/Stable.md',
        metadata: { knowledgeDocumentId: DOCUMENT_ID },
      }),
    ]);
    expect(db.getAll.mock.calls[0]![0]).toContain('FROM ai_knowledge_index_entries_local');
    expect(db.getAll.mock.calls[0]![0]).not.toContain('resources');
  });

  it('updates request recency and removes derived rows without touching Resource metadata', async () => {
    const db = new FakeDatabase();
    const repository = new AIKnowledgeIndexPowerSyncRepository(db);

    await repository.markRequested('identity-1', [DOCUMENT_ID], 1234);
    await repository.removeByNoteId('identity-1', DOCUMENT_ID);

    expect(db.execute.mock.calls[0]![0]).toContain('UPDATE ai_knowledge_index_entries_local');
    expect(db.execute.mock.calls[1]![0]).toContain('DELETE FROM ai_knowledge_index_entries_local');
    expect(db.execute.mock.calls.flatMap((call) => [call[0]]).join('\n')).not.toContain(
      'resources',
    );
  });

  it('reports the local rebuildable persistence backend', async () => {
    const repository = new AIKnowledgeIndexPowerSyncRepository(new FakeDatabase());
    await expect(repository.getDiagnostics()).resolves.toMatchObject({
      persistenceBackend: 'powersync-local-knowledge-index',
      persistenceStatus: 'enabled',
      vectorRecallBackend: 'local-js-hybrid',
    });
  });
});
