import { describe, expect, it } from 'vitest';
import { CreateConfirmedKnowledgeNoteSchema, KnowledgeDocumentIdSchema } from '..';

const DOCUMENT_ID = 'kdoc_550e8400-e29b-41d4-a716-446655440390';

function createRequest(frontmatter: Record<string, unknown> = {}) {
  return {
    connectionId: 'binding-1',
    knowledgeDocumentId: DOCUMENT_ID,
    proposalId: 'proposal-1',
    revision: 1,
    requestId: 'request-1',
    proposedPath: 'notes/new.md',
    title: 'New',
    frontmatter,
    content: '# New',
    reason: 'Create managed note',
  };
}

describe('ADR-090 KnowledgeDocumentId contracts', () => {
  it('accepts only the document-carried kdoc_<uuid> encoding', () => {
    expect(KnowledgeDocumentIdSchema.parse(DOCUMENT_ID)).toBe(DOCUMENT_ID);
    expect(KnowledgeDocumentIdSchema.safeParse('KnowledgeDocumentId_123').success).toBe(false);
    expect(KnowledgeDocumentIdSchema.safeParse('kdoc_notes-architecture').success).toBe(false);
  });

  it('accepts a matching explicit memoflow_id marker', () => {
    expect(
      CreateConfirmedKnowledgeNoteSchema.safeParse(createRequest({ memoflow_id: DOCUMENT_ID }))
        .success,
    ).toBe(true);
  });

  it('rejects a second conflicting memoflow_id hidden in arbitrary frontmatter', () => {
    const result = CreateConfirmedKnowledgeNoteSchema.safeParse(
      createRequest({ memoflow_id: 'kdoc_550e8400-e29b-41d4-a716-446655440391' }),
    );
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]?.path).toEqual(['frontmatter', 'memoflow_id']);
  });
});
