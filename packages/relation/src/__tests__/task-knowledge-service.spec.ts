import { describe, expect, it, vi } from 'vitest';
import { RelationDTOSchema, SubjectRefSchema } from '@memoflow/contracts/relation';
import type { RelationRepository } from '../domain/relation-repository';
import { TaskKnowledgeService } from '../application/task-knowledge-service';

describe('TaskKnowledgeService', () => {
  it('reads only related task -> note edges and exposes stable documentId', async () => {
    const taskPlanId = 'ITaskPlanId_550e8400-e29b-41d4-a716-446655440000' as never;
    const documentId = SubjectRefSchema.parse({ type: 'note', id: 'kdoc_550e8400-e29b-41d4-a716-446655440001' }).id;
    const findPageBySubject = vi.fn(async (query) => ({
      items: [RelationDTOSchema.parse({ id: 'rel-1', subject: { type: 'task', id: taskPlanId }, relationType: 'related', object: { type: 'note', id: documentId }, createdAt: 1 })],
      total: 1, limit: query.limit, offset: query.offset,
    }));
    const repo = { findPageBySubject } as unknown as RelationRepository;
    const result = await new TaskKnowledgeService(repo).listEdgeRefsForTask('identity-1', { taskPlanId, limit: 10, offset: 0 });
    expect(result.items[0]).toMatchObject({ taskPlanId, documentId });
    expect(findPageBySubject).toHaveBeenCalledWith({ identityId: 'identity-1', subject: { type: 'task', id: taskPlanId }, relationType: 'related', objectType: 'note', limit: 10, offset: 0 });
  });
});
