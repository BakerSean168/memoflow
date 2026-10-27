import { describe, expect, it } from 'vitest';
import { ReindexKnowledgeSchema } from './ai-knowledge-query.dto';

describe('ReindexKnowledgeSchema', () => {
  it('accepts a bounded targeted resource list for save/index feedback', () => {
    const knowledgeDocumentId = 'kdoc_550e8400-e29b-41d4-a716-446655440012';
    expect(
      ReindexKnowledgeSchema.parse({ knowledgeDocumentIds: [knowledgeDocumentId], force: false }),
    ).toEqual({
      knowledgeDocumentIds: [knowledgeDocumentId],
      force: false,
      limit: 200,
    });
  });

  it('rejects an empty targeted resource list', () => {
    expect(ReindexKnowledgeSchema.safeParse({ knowledgeDocumentIds: [] }).success).toBe(false);
  });
});
