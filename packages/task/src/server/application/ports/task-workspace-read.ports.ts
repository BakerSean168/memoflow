import type {
  GoalReference,
  KeyResultReference,
  KeyResultClientDTO,
} from '@memoflow/goal-contracts';
import type { Result } from '@memoflow/transport-contracts/result';
import type { TaskKnowledgeEdgeListReq, TaskKnowledgeEdgePage } from '@memoflow/relation-contracts';
import type { KnowledgeDocumentId, KnowledgeSpaceId } from '@memoflow/repository-contracts';

export interface TaskGoalMeasurementReadPort {
  getKeyResultMeasurementContext(
    goalId: string,
    keyResultId: string,
    identityId: string,
  ): Promise<Result<Pick<KeyResultClientDTO, 'id' | 'title' | 'progress'>>>;
}
/** Goal-owned display pair; Goal stays the authority for id and title (#635). */
export interface TaskWorkspaceGoalReference {
  readonly goal: GoalReference;
  readonly keyResult: KeyResultReference | null;
}
export interface TaskWorkspaceGoalReadPort {
  getGoalReference(
    goalId: string,
    keyResultId: string | null,
    identityId: string,
  ): Promise<Result<TaskWorkspaceGoalReference>>;
}
export interface TaskWorkspaceKnowledgeRelationReadPort {
  listEdgeRefsForTask(
    identityId: string,
    request: TaskKnowledgeEdgeListReq,
  ): Promise<TaskKnowledgeEdgePage>;
}
export interface TaskWorkspaceKnowledgeProjection {
  readonly knowledgeSpaceId: KnowledgeSpaceId;
  readonly title: string;
  readonly excerpt: string;
  readonly relativePath: string;
  readonly updatedAt: number;
}
export interface TaskWorkspaceKnowledgeContextReadPort {
  resolveForWorkspace(
    identityId: string,
    documentId: KnowledgeDocumentId,
  ): Promise<TaskWorkspaceKnowledgeProjection | null>;
}
