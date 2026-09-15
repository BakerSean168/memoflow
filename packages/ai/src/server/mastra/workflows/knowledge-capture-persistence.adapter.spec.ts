import { describe, expect, it, vi } from 'vitest';
import { KnowledgeCapturePersistenceAdapter } from './knowledge-capture-persistence.adapter';

const context = {
  identityId: 'identity-1',
  requestId: 'request-entry',
  traceId: 'trace-1',
} as never;
const DOCUMENT_ID = 'kdoc_550e8400-e29b-41d4-a716-446655440520' as never;

describe('KnowledgeCapturePersistenceAdapter', () => {
  it('maps workflow identity/revision into confirmed idempotent note persistence', async () => {
    const createKnowledgeNote = vi.fn(async (input) => ({
      note: {
        id: DOCUMENT_ID,
        repositoryScopeId: 'repo-1',
        name: input.fileName,
        path: input.path,
        mimeType: 'text/markdown',
        size: input.content.length,
        content: input.content,
        createdAt: 1,
        updatedAt: 1,
      },
    }));
    const adapter = new KnowledgeCapturePersistenceAdapter({ createKnowledgeNote });
    const result = await adapter.createConfirmedKnowledgeNote({
      workflowRunId: 'run-1',
      revision: 2,
      path: 'notes/mastra.md',
      fileName: 'mastra.md',
      title: 'Mastra',
      content: '# Mastra',
      knowledgeDocumentId: DOCUMENT_ID,
      requestId: 'run-1:2:knowledge',
      context,
    });
    expect(result).toMatchObject({ ok: true, data: { noteId: DOCUMENT_ID } });
    expect(createKnowledgeNote).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: 'identity-1',
        proposalId: 'run-1',
        proposalRevision: 2,
        requestId: 'run-1:2:knowledge',
      }),
    );
  });
});
