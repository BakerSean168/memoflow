import type { GetGoalRes } from '@memoflow/contracts/goal';
import type { Result } from '@memoflow/contracts/result';
import type { TaskKnowledgeEdgeListReq, TaskKnowledgeEdgePage } from '@memoflow/contracts/relation';
import type { KnowledgeDocumentId, KnowledgeSpaceId } from '@memoflow/contracts/primitives';

export interface TaskWorkspaceGoalReadPort {
  getGoal(id: string, identityId: string, includeChildren?: boolean): Promise<Result<GetGoalRes>>;
}
export interface TaskWorkspaceKnowledgeRelationReadPort {
  listEdgeRefsForTask(identityId: string, request: TaskKnowledgeEdgeListReq): Promise<TaskKnowledgeEdgePage>;
}
export interface TaskWorkspaceKnowledgeProjection {
  readonly knowledgeSpaceId: KnowledgeSpaceId;
  readonly title: string;
  readonly excerpt: string;
  readonly relativePath: string;
  readonly updatedAt: number;
}
export interface TaskWorkspaceKnowledgeContextReadPort {
  resolveForWorkspace(identityId: string, documentId: KnowledgeDocumentId): Promise<TaskWorkspaceKnowledgeProjection | null>;
}
