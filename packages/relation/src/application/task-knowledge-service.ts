import {
  TaskKnowledgeEdgeListReqSchema,
  TaskKnowledgeEdgePageSchema,
  type TaskKnowledgeEdgeListReq,
  type TaskKnowledgeEdgePage,
} from '@memoflow/contracts/relation';
import type { RelationRepository } from '../domain/relation-repository';

/** Relation-owned typed Task -> Knowledge reader; durable identity is documentId. */
export class TaskKnowledgeService {
  constructor(private readonly relations: RelationRepository) {}

  async listEdgeRefsForTask(identityId: string, request: TaskKnowledgeEdgeListReq): Promise<TaskKnowledgeEdgePage> {
    const parsed = TaskKnowledgeEdgeListReqSchema.parse(request);
    const page = await this.relations.findPageBySubject({ identityId, subject: { type: 'task', id: parsed.taskPlanId }, relationType: 'related', objectType: 'note', limit: parsed.limit, offset: parsed.offset });
    return TaskKnowledgeEdgePageSchema.parse({
      items: page.items.map((row) => ({ relationId: row.id, taskPlanId: parsed.taskPlanId, documentId: row.object.id, createdAt: row.createdAt })),
      total: page.total, limit: page.limit, offset: page.offset,
    });
  }
}
